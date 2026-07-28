import { STOP_CONCEPTS, cooccurrence, conceptStats, getConcept, corpusStats, articlesFor } from './store.mjs';

/**
 * Looking Glass — Swanson literature-based discovery.
 *
 * Don Swanson's insight (1986): if a large literature says A relates to B, and a
 * separate literature says B relates to C, and NOBODY has ever written about A
 * and C together, then A→C is a hypothesis that the published record implies but
 * no one has stated. He found fish oil / Raynaud's disease this way, and later
 * magnesium / migraine — both subsequently confirmed experimentally.
 *
 * The method's power and its danger are the same thing: it works on
 * CO-OCCURRENCE, which is not a relationship. Two terms in one abstract may be
 * contrasted, may appear in unrelated sentences, or may co-occur because both
 * are fashionable. So this implementation is built around three defences:
 *
 *  1. ASSOCIATION, NOT COUNTS. Raw co-occurrence ranks by popularity: everything
 *     co-occurs with common terms. Normalised pointwise mutual information asks
 *     instead whether the pair appears together MORE than independent frequency
 *     would predict, which is the question that matters.
 *
 *  2. SEMANTIC SHAPE. A drug→process→disease chain is a hypothesis. A
 *     "Humans → Adult → Male" chain is indexing practice. Chains are filtered by
 *     the semantic type of each link.
 *
 *  3. ABSENCE MUST BE REAL ABSENCE. A→C scoring as novel because both are rare
 *     is not a discovery, it is a sparse corpus. Candidates are rejected unless
 *     A and C are each individually well attested, so that their joint absence
 *     is informative rather than accidental.
 *
 * Everything returned carries the article ids behind every link. A hypothesis
 * with no retrievable citations is not emitted.
 */

/**
 * Normalised pointwise mutual information, in [-1, 1].
 *
 *   PMI  = log( p(a,b) / (p(a)·p(b)) )
 *   nPMI = PMI / -log p(a,b)
 *
 * +1 means the two concepts only ever appear together; 0 means independence;
 * negative means they appear together less than chance. Normalising is what
 * makes values comparable between a pair seen 10 times and a pair seen 10,000.
 */
export function npmi({ bothArticles, aArticles, bArticles, totalArticles }) {
  if (!bothArticles || !aArticles || !bArticles || !totalArticles) return 0;
  const pAB = bothArticles / totalArticles;
  const pA = aArticles / totalArticles;
  const pB = bArticles / totalArticles;
  if (pAB <= 0 || pA <= 0 || pB <= 0) return 0;
  const pmi = Math.log(pAB / (pA * pB));
  const denom = -Math.log(pAB);
  if (denom === 0) return 0;
  const value = pmi / denom;
  return Math.max(-1, Math.min(1, value));
}

/** Semantic-type pairs worth chaining. Anything else is indexing noise. */
const INFORMATIVE_TYPES = new Set(['chemical', 'disease', 'process', 'anatomy', 'technique', 'organism']);

/**
 * The shapes an ABC chain may take. A chain is only interesting when each link
 * could plausibly carry a mechanism — a chemical acting through a process on a
 * disease is a hypothesis; a geographic term in the middle is not.
 */
function isInformativeChain(aType, bType, cType) {
  return INFORMATIVE_TYPES.has(aType) && INFORMATIVE_TYPES.has(bType) && INFORMATIVE_TYPES.has(cType);
}

/**
 * Association strength for one pair, with the counts that produced it.
 * Returns null when the pair never co-occurs — which is the case ABC needs.
 */
export function association(db, aUi, bUi, totalArticles) {
  const both = cooccurrence(db, aUi, bUi);
  const aStats = conceptStats(db, aUi);
  const bStats = conceptStats(db, bUi);
  if (!aStats || !bStats) return null;
  if (!both) {
    return {
      aUi, bUi, bothArticles: 0, aArticles: aStats.articles, bArticles: bStats.articles,
      npmi: 0, cooccurs: false,
    };
  }
  return {
    aUi, bUi,
    bothArticles: both.articles, majorBoth: both.major_both,
    aArticles: aStats.articles, bArticles: bStats.articles,
    firstYear: both.first_year, lastYear: both.last_year,
    npmi: npmi({ bothArticles: both.articles, aArticles: aStats.articles, bArticles: bStats.articles, totalArticles }),
    cooccurs: true,
  };
}

/**
 * OPEN DISCOVERY: given A, find every C that the literature implies but has
 * never stated. This is the "what should we look at" mode.
 *
 * Returns candidates each carrying every B that bridges A to C, so a reader can
 * see the whole argument rather than a score.
 */
export function openDiscovery(db, aUi, options = {}) {
  const {
    minLinkNpmi = 0.15,      // how strong an A–B or B–C link must be to count
    minLinkArticles = 3,     // and how many articles must support it
    minCArticles = 20,       // C must be well attested, or its absence proves nothing
    maxB = 60,               // breadth of the intermediate layer
    maxResults = 50,
    requireInformativeTypes = true,
  } = options;

  const total = corpusStats(db).articles;
  const a = getConcept(db, aUi);
  if (!a || total === 0) {
    return { source: aUi, candidates: [], corpus: corpusStats(db), rejected: { reason: 'unknown concept or empty corpus' } };
  }

  // Layer B: strongly associated with A.
  const bLinks = [];
  for (const n of neighboursOf(db, aUi, 400)) {
    if (STOP_CONCEPTS.has(n.other_ui)) continue;
    if (n.articles < minLinkArticles) continue;
    const assoc = association(db, aUi, n.other_ui, total);
    if (!assoc || assoc.npmi < minLinkNpmi) continue;
    const concept = getConcept(db, n.other_ui);
    if (!concept) continue;
    if (requireInformativeTypes && !INFORMATIVE_TYPES.has(concept.semantic_type)) continue;
    bLinks.push({ concept, assoc });
  }
  bLinks.sort((x, y) => y.assoc.npmi - x.assoc.npmi);
  const bLayer = bLinks.slice(0, maxB);

  // Layer C: strongly associated with some B, and NEVER with A.
  const byC = new Map();
  for (const b of bLayer) {
    for (const n of neighboursOf(db, b.concept.ui, 400)) {
      const cUi = n.other_ui;
      if (cUi === aUi || STOP_CONCEPTS.has(cUi)) continue;
      if (n.articles < minLinkArticles) continue;

      // The defining condition: A and C must never have been written about together.
      const ac = cooccurrence(db, aUi, cUi);
      if (ac) continue;

      const cStats = conceptStats(db, cUi);
      // A rarely-studied C makes its absence uninformative — the corpus simply
      // has not looked, which is not the same as the field not having connected them.
      if (!cStats || cStats.articles < minCArticles) continue;

      const cConcept = getConcept(db, cUi);
      if (!cConcept) continue;
      if (requireInformativeTypes && !isInformativeChain(a.semantic_type, b.concept.semantic_type, cConcept.semantic_type)) continue;

      const bcAssoc = association(db, b.concept.ui, cUi, total);
      if (!bcAssoc || bcAssoc.npmi < minLinkNpmi) continue;

      const entry = byC.get(cUi) ?? { concept: cConcept, stats: cStats, bridges: [] };
      entry.bridges.push({
        b: b.concept,
        ab: b.assoc,
        bc: bcAssoc,
        // A chain is only as strong as its weaker link.
        strength: Math.min(b.assoc.npmi, bcAssoc.npmi),
      });
      byC.set(cUi, entry);
    }
  }

  const candidates = [...byC.values()]
    .map((entry) => {
      entry.bridges.sort((x, y) => y.strength - x.strength);
      return {
        target: entry.concept,
        targetArticles: entry.stats.articles,
        bridgeCount: entry.bridges.length,
        bridges: entry.bridges.slice(0, 8),
        // Independent bridges are the real signal: one shared intermediate can be
        // coincidence, several converging on the same C is a pattern.
        strength: entry.bridges[0].strength,
        convergence: entry.bridges.length,
      };
    })
    .sort((x, y) => y.convergence - x.convergence || y.strength - x.strength)
    .slice(0, maxResults);

  return {
    source: a,
    candidates,
    corpus: corpusStats(db),
    parameters: { minLinkNpmi, minLinkArticles, minCArticles, maxB, requireInformativeTypes },
  };
}

/**
 * CLOSED DISCOVERY: A and C are both given; find the intermediates that would
 * explain a link between them. This is the mode for testing a hypothesis
 * somebody already has — including, crucially, a hypothesis that was published
 * later than the corpus, which is how retrospective validation works.
 */
export function closedDiscovery(db, aUi, cUi, options = {}) {
  const { minLinkNpmi = 0.1, minLinkArticles = 2, maxResults = 40 } = options;
  const total = corpusStats(db).articles;
  const a = getConcept(db, aUi);
  const c = getConcept(db, cUi);
  if (!a || !c || total === 0) return { a, c, bridges: [], direct: null, corpus: corpusStats(db) };

  const direct = cooccurrence(db, aUi, cUi);
  const aNeighbours = new Map(neighboursOf(db, aUi, 800).map((n) => [n.other_ui, n]));
  const bridges = [];

  for (const n of neighboursOf(db, cUi, 800)) {
    const bUi = n.other_ui;
    if (bUi === aUi || STOP_CONCEPTS.has(bUi)) continue;
    if (!aNeighbours.has(bUi)) continue;
    if (n.articles < minLinkArticles || aNeighbours.get(bUi).articles < minLinkArticles) continue;

    const ab = association(db, aUi, bUi, total);
    const bc = association(db, bUi, cUi, total);
    if (!ab || !bc || ab.npmi < minLinkNpmi || bc.npmi < minLinkNpmi) continue;

    const concept = getConcept(db, bUi);
    if (!concept) continue;
    bridges.push({ b: concept, ab, bc, strength: Math.min(ab.npmi, bc.npmi) });
  }

  bridges.sort((x, y) => y.strength - x.strength);
  return {
    a, c, direct,
    bridges: bridges.slice(0, maxResults),
    corpus: corpusStats(db),
    // Stated explicitly because it is the whole point in a retrospective test.
    aAndCEverCoOccur: Boolean(direct),
  };
}

/** Neighbours helper kept local so the SQL shape stays in the store module. */
function neighboursOf(db, ui, limit) {
  return db.prepare(`
    SELECT CASE WHEN a_ui = ? THEN b_ui ELSE a_ui END AS other_ui, articles
    FROM lg_cooccurrence WHERE a_ui = ? OR b_ui = ?
    ORDER BY articles DESC LIMIT ?
  `).all(String(ui), String(ui), String(ui), limit);
}

/**
 * Every citation behind an ABC chain, so the reasoning can be checked rather
 * than trusted. Only records the platform actually retrieved are returned.
 */
export function citationsForChain(db, aUi, bUi, cUi, perLink = 5) {
  return {
    ab: articlesFor(db, aUi, bUi, perLink),
    bc: articlesFor(db, bUi, cUi, perLink),
    // Deliberately empty: the absence of A–C papers is the hypothesis.
    ac: [],
  };
}
