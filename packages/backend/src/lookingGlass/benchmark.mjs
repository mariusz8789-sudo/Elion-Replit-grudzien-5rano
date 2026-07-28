import { corpusStats, conceptStats, cooccurrence, getConcept } from './store.mjs';
import { openDiscovery, closedDiscovery } from './swanson.mjs';
import { classifyTargets, auditVocabularyLeakage } from './mesh.mjs';
import { releaseSuitability } from './descriptorRelease.mjs';

/**
 * Retrospective benchmark harness.
 *
 * Runs the protocol in docs/RETROSPECTIVE_BENCHMARK.md: given a corpus built as
 * of a cut-off year, does the engine propose discoveries the field made later?
 *
 * THE NULL MODEL IS THE BENCHMARK. Open discovery on a real corpus returns
 * thousands of candidates, so finding a known discovery somewhere in that list is
 * expected by chance and proves nothing whatsoever. The only question that means
 * anything is whether real discoveries rank ABOVE frequency-matched pairs that
 * are not discoveries. Everything else in this file is descriptive; that
 * comparison is the result.
 *
 * The harness is built to make a negative result easy to publish. Targets are
 * never dropped, contaminated ones are marked rather than removed, and the
 * report includes the null distribution whether or not it is flattering. A
 * benchmark that can only produce good news is a marketing instrument.
 */

/**
 * One pre-registered target.
 * @typedef {{ name: string, aUi: string, cUi: string, publishedYear: number,
 *             expectedBridgeUis?: string[], replicated?: boolean }} Target
 */

/** Where C ranks among the candidates open discovery returns for A. */
function rankOf(candidates, cUi) {
  const index = candidates.findIndex((x) => x.target.ui === cUi);
  return index === -1 ? null : index + 1;
}

/**
 * Run one target. Returns a row for the published table, including every reason
 * the row might not count.
 */
export function runTarget(db, target, { cutoffYear, discoveryOptions = {} } = {}) {
  const a = getConcept(db, target.aUi);
  const c = getConcept(db, target.cUi);

  // Disqualification checks run BEFORE the engine, so a target cannot be
  // retro-fitted into a hit after seeing the output.
  const disqualified = [];
  if (!a) disqualified.push(`Concept A (${target.aUi}) is absent from the corpus.`);
  if (!c) disqualified.push(`Concept C (${target.cUi}) is absent from the corpus.`);

  const priorLink = a && c ? cooccurrence(db, target.aUi, target.cUi) : null;
  if (priorLink) {
    // If A and C already co-occurred before the cut-off, the link was not hidden
    // and the target tests nothing.
    disqualified.push(`A and C already co-occur in the pre-${cutoffYear + 1} corpus (${priorLink.articles} article(s)) — this was not a hidden link.`);
  }

  const cStats = c ? conceptStats(db, target.cUi) : null;
  if (c && (!cStats || cStats.articles < 5)) {
    disqualified.push(`C appears in ${cStats?.articles ?? 0} pre-cut-off article(s) — too few for its absence from the A literature to be informative.`);
  }

  if (disqualified.length > 0) {
    return { target, disqualified, rank: null, inTop20: false, bridges: [], bridgeMatched: null, discovery: null };
  }

  const discovery = openDiscovery(db, target.aUi, { minCArticles: 5, maxResults: 5000, ...discoveryOptions });
  const rank = rankOf(discovery.candidates, target.cUi);
  const closed = closedDiscovery(db, target.aUi, target.cUi);
  const bridgeUis = closed.bridges.map((b) => b.b.ui);

  // Proposing the right pair for the wrong reason is a coincidence. Proposing it
  // via the mechanism the publication actually reported is a discovery, so the
  // bridge check matters more than the rank.
  const expected = target.expectedBridgeUis ?? target.bridgeUis ?? [];
  const bridgeMatched = expected.length === 0
    ? null
    : expected.some((ui) => bridgeUis.slice(0, 10).includes(ui));

  return {
    target,
    disqualified: [],
    rank,
    inTop20: rank !== null && rank <= 20,
    inTop100: rank !== null && rank <= 100,
    candidatesReturned: discovery.candidates.length,
    bridges: closed.bridges.slice(0, 5).map((b) => ({ ui: b.b.ui, name: b.b.name, strength: Number(b.strength.toFixed(3)) })),
    bridgeMatched,
    convergence: discovery.candidates.find((x) => x.target.ui === target.cUi)?.convergence ?? 0,
    // Handed back so the null model can be scored against the SAME candidate
    // list. Ranking the target and its controls in two separate runs would make
    // them comparable only by accident.
    discovery,
  };
}

/**
 * Frequency-matched control pairs for one target.
 *
 * Controls must resemble the target in the only respect that trivially drives
 * ranking — how often each concept appears — while not being known discoveries.
 * Without this, a high rank may only mean that A and C are both popular.
 */
export function samplePairedControls(db, target, { count = 20, tolerance = 0.35 } = {}) {
  const cStats = conceptStats(db, target.cUi);
  if (!cStats) return [];

  const lo = Math.floor(cStats.articles * (1 - tolerance));
  const hi = Math.ceil(cStats.articles * (1 + tolerance));

  // Candidates with comparable document frequency that also never co-occur with
  // A — the same structural position the target occupies.
  const rows = db.prepare(`
    SELECT s.concept_ui AS ui, s.articles
    FROM lg_concept_stats s
    JOIN lg_concepts c ON c.ui = s.concept_ui
    WHERE s.articles BETWEEN ? AND ?
      AND s.concept_ui != ? AND s.concept_ui != ?
      AND c.semantic_type = (SELECT semantic_type FROM lg_concepts WHERE ui = ?)
    ORDER BY ABS(s.articles - ?) ASC
    LIMIT ?
  `).all(lo, hi, target.aUi, target.cUi, target.cUi, cStats.articles, count * 4);

  return rows
    .filter((r) => !cooccurrence(db, target.aUi, r.ui))
    .slice(0, count)
    .map((r) => ({ ui: r.ui, articles: r.articles }));
}

/**
 * Ranks the controls achieve, so the target's rank can be read against them.
 *
 * A control the engine never returns is NOT dropped. Discarding it would compute
 * the median over only the controls that did well, which is the one arrangement
 * guaranteed to flatter the target — and in the strongest possible case, where
 * the target ranks and no control does, dropping them would leave no median at
 * all and turn a clean win into an unreportable result. Unreturned controls are
 * censored at one past the last candidate, the standard treatment for
 * not-retrieved in information retrieval. That is conservative: it credits a
 * control with the best rank it could possibly have had.
 */
export function nullDistribution(db, target, { count = 20, discoveryOptions = {}, discovery = null } = {}) {
  const controls = samplePairedControls(db, target, { count });
  if (controls.length === 0) {
    return { controls: 0, ranked: 0, censored: 0, ranks: [], median: null, top20Rate: null };
  }

  const result = discovery ?? openDiscovery(db, target.aUi, { minCArticles: 5, maxResults: 5000, ...discoveryOptions });
  const censoredRank = result.candidates.length + 1;
  const observed = controls.map((ctrl) => rankOf(result.candidates, ctrl.ui));
  const ranks = observed.map((r) => r ?? censoredRank);
  const sorted = [...ranks].sort((x, y) => x - y);

  return {
    controls: controls.length,
    ranked: observed.filter((r) => r !== null).length,
    censored: observed.filter((r) => r === null).length,
    censoredRank,
    ranks: sorted,
    median: sorted[Math.floor(sorted.length / 2)],
    top20Rate: Number((ranks.filter((r) => r <= 20).length / controls.length).toFixed(3)),
  };
}

/**
 * Run the whole pre-registered target set and produce the publishable report.
 *
 * `targets` must have been fixed before the corpus was built. The harness cannot
 * enforce that, so `preregistrationRef` is required and recorded — an unsigned
 * benchmark is an anecdote.
 */
export function runBenchmark(db, targets, { cutoffYear, preregistrationRef, nullControls = 20, discoveryOptions = {} }) {
  if (!preregistrationRef) {
    throw new Error('runBenchmark: preregistrationRef is required. Choosing targets after seeing output is p-hacking with extra steps.');
  }

  const leakage = auditVocabularyLeakage(db, cutoffYear);
  const vocabulary = releaseSuitability(db, cutoffYear);
  const classified = classifyTargets(db, targets, cutoffYear);
  const corpus = corpusStats(db);

  const rows = classified.map((target) => {
    const { discovery, ...result } = runTarget(db, target, { cutoffYear, discoveryOptions });
    const nulls = result.disqualified.length === 0
      ? nullDistribution(db, target, { count: nullControls, discoveryOptions, discovery })
      : { controls: 0, ranked: 0, censored: 0, ranks: [], median: null, top20Rate: null };

    return {
      ...result,
      contaminated: target.contaminated,
      contaminationNote: target.note,
      null: nulls,
      // A hit only counts when the vocabulary was clean, the target was not
      // disqualified, and the rank beat the frequency-matched controls.
      countsAsHit: Boolean(
        !target.contaminated
        && result.disqualified.length === 0
        && result.rank !== null
        && nulls.median !== null
        && result.rank < nulls.median,
      ),
    };
  });

  const eligible = rows.filter((r) => !r.contaminated && r.disqualified.length === 0);
  const hits = rows.filter((r) => r.countsAsHit);

  return {
    preregistrationRef,
    cutoffYear,
    corpus: { articles: corpus.articles, concepts: corpus.concepts, pairs: corpus.pairs, vocabularyEnforced: corpus.vocabularyEnforced },
    leakage: {
      auditable: leakage.auditable,
      rate: leakage.leakageRate,
      anachronisticConcepts: leakage.anachronisticConcepts,
      statement: leakage.statement,
    },
    // Which MeSH release the vocabulary came from, with its checksum. Without
    // this a reader cannot reproduce the run, and "we used MeSH" is not a
    // method — the vocabulary changes every year and determines what the engine
    // could even represent.
    vocabulary: {
      release: vocabulary.release,
      matchesCutoff: vocabulary.suitable,
      statement: vocabulary.statement,
    },
    targets: rows,
    summary: {
      total: rows.length,
      eligible: eligible.length,
      contaminated: rows.filter((r) => r.contaminated).length,
      disqualified: rows.filter((r) => r.disqualified.length > 0).length,
      hits: hits.length,
      hitRate: eligible.length ? Number((hits.length / eligible.length).toFixed(3)) : null,
    },
    verdict: buildVerdict(leakage, eligible, hits, corpus, vocabulary),
  };
}

function buildVerdict(leakage, eligible, hits, corpus, vocabulary) {
  // A vocabulary with no recorded provenance cannot be reproduced by anyone who
  // does not trust us, and an interrupted load is worse than none — its rows are
  // all correct, so nothing about the corpus looks wrong.
  if (!vocabulary.release || vocabulary.release.complete === false) {
    return `INVALID: ${vocabulary.statement} Load a release through descriptorRelease.mjs, which records its checksum, and re-run.`;
  }
  if (!leakage.auditable) {
    return 'INVALID: vocabulary leakage could not be audited, so the corpus cannot be described as historical. Load an NLM descriptor release and re-run.';
  }
  if (corpus.vocabularyEnforced !== 'yes') {
    return 'INVALID: statistics were built without enforcing the historical vocabulary. The result would not survive review.';
  }
  if (eligible.length === 0) {
    return 'NO ELIGIBLE TARGETS: every target was contaminated or disqualified. Nothing was tested; this is not a negative result, it is an absence of one.';
  }
  if (hits.length === 0) {
    return `NEGATIVE: 0 of ${eligible.length} eligible target(s) ranked above their frequency-matched controls. `
      + 'Co-occurrence alone did not anticipate these discoveries. That is a real and publishable finding, and it redirects effort toward the curated mechanism graph.';
  }
  return `${hits.length} of ${eligible.length} eligible target(s) ranked above their frequency-matched controls. `
    + 'A hit means the engine placed a later discovery higher than comparable non-discoveries — it does NOT mean the engine would have made the discovery, only that it would have pointed at it.';
}

/**
 * Markdown table for publication. Emits every target including failures, because
 * reporting only the successes would make the whole exercise worthless and, if
 * found out afterwards, would discredit everything else in the platform.
 */
export function formatReport(report) {
  const lines = [
    `# Retrospective benchmark — cut-off ${report.cutoffYear}`,
    '',
    `Pre-registration: \`${report.preregistrationRef}\``,
    `Corpus: ${report.corpus.articles} articles, ${report.corpus.concepts} concepts, ${report.corpus.pairs} pairs. Vocabulary enforced: ${report.corpus.vocabularyEnforced}.`,
    `Vocabulary leakage: ${report.leakage.auditable ? `${(report.leakage.rate * 100).toFixed(2)}% of pre-cut-off annotations` : 'NOT AUDITABLE'}.`,
    `Vocabulary: ${report.vocabulary.statement}`,
    '',
    `**${report.verdict}**`,
    '',
    '| Target | Published | Rank | Null median | Beats null | Bridge matched | Status |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of report.targets) {
    const status = r.contaminated ? 'contaminated'
      : r.disqualified.length ? `disqualified: ${r.disqualified[0]}`
        : 'eligible';
    lines.push(`| ${r.target.name} | ${r.target.publishedYear ?? '—'} | ${r.rank ?? 'not returned'} | ${r.null.median ?? '—'} | ${r.countsAsHit ? 'yes' : 'no'} | ${r.bridgeMatched === null ? '—' : r.bridgeMatched ? 'yes' : 'no'} | ${status} |`);
  }
  return lines.join('\n');
}
