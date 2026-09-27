/**
 * Looking Glass — MeSH descriptor vocabulary and leakage audit.
 *
 * THE PROBLEM THIS EXISTS TO SOLVE. A retrospective benchmark claims: "given only
 * the literature available in 2015, the engine would have proposed X". That claim
 * is worthless if the 2015 corpus is annotated with vocabulary that did not exist
 * in 2015. NLM introduces new MeSH descriptors every year and applies some of them
 * to older records, so a 2010 paper can carry a heading coined in 2018. The
 * "historical" corpus then quietly contains the future, and the benchmark is a
 * lie that nobody had to tell deliberately.
 *
 * THE INSIGHT THAT SHAPES THIS MODULE. Checking descriptor establishment dates is
 * usually framed as a filter — drop the anachronistic concepts and move on. That
 * throws away the more valuable half. If a pre-cut-off article carries a
 * post-cut-off descriptor, that is direct EVIDENCE OF RETROSPECTIVE INDEXING, and
 * counting it measures exactly how contaminated the corpus is.
 *
 * So the module produces a number, not just a filter: what fraction of the
 * pre-cut-off annotations could not have existed at the cut-off. That number
 * belongs in the benchmark's published results, because it answers the strongest
 * objection a reviewer can raise before they raise it.
 *
 * SOURCE OF TRUTH. Establishment dates come from NLM's descriptor records
 * (desc<year>.xml), not from article annotations — articles do not carry them.
 * Using an ARCHIVED release matching the cut-off year is stronger still, because
 * it also captures descriptors that were later renamed or merged.
 */

/** Every occurrence of a simple element's text. Narrow by design; see pubmed.mjs. */
function tagContents(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}
const firstTag = (xml, tag) => tagContents(xml, tag)[0] ?? null;

/** NLM dates are <Year>/<Month>/<Day> triples. Returns ISO yyyy-mm-dd or null. */
export function parseNlmDate(dateXml) {
  if (!dateXml) return null;
  const year = firstTag(dateXml, 'Year');
  if (!year || !/^\d{4}$/.test(year.trim())) return null;
  const month = (firstTag(dateXml, 'Month') ?? '01').trim().padStart(2, '0');
  const day = (firstTag(dateXml, 'Day') ?? '01').trim().padStart(2, '0');
  return `${year.trim()}-${month}-${day}`;
}

/**
 * One <DescriptorRecord> from desc<year>.xml.
 *
 * DateEstablished is the field that matters. A descriptor with no
 * DateEstablished predates NLM's recording of it and is treated as ancient
 * rather than as unknown — the alternative would flag the entire historical core
 * of the vocabulary as suspect.
 */
export function parseDescriptorRecord(xml) {
  const ui = firstTag(xml, 'DescriptorUI');
  if (!ui) return null;
  const nameBlock = firstTag(xml, 'DescriptorName');
  const established = parseNlmDate(firstTag(xml, 'DateEstablished'));
  return {
    ui: ui.trim(),
    name: (firstTag(nameBlock ?? '', 'String') ?? '').trim(),
    treeNumbers: tagContents(firstTag(xml, 'TreeNumberList') ?? '', 'TreeNumber').map((t) => t.trim()),
    dateEstablished: established,
    dateCreated: parseNlmDate(firstTag(xml, 'DateCreated')),
  };
}

/** A whole desc<year>.xml release. Malformed records are skipped, never guessed. */
export function parseDescriptorFile(xml, vocabularyYear = null) {
  // Split on the record element only. A bare '<DescriptorRecord' prefix also
  // matches the wrapping <DescriptorRecordSet>, which silently produced one
  // phantom record per file.
  const blocks = String(xml ?? '').split(/<DescriptorRecord(?=[\s>])/).slice(1);
  const descriptors = [];
  let skipped = 0;
  for (const block of blocks) {
    const d = parseDescriptorRecord(block);
    if (d && d.name) descriptors.push({ ...d, vocabularyYear }); else skipped += 1;
  }
  return { descriptors, skipped, seen: blocks.length };
}

/* ------------------------------ persistence ------------------------------ */

import { semanticTypeFromTree } from './store.mjs';

/**
 * Load a descriptor release into the corpus vocabulary. Upserts, so an archived
 * release can be loaded over a current one to correct the dates without
 * disturbing the annotations that reference them.
 */
export function loadDescriptors(db, descriptors, { vocabularyYear = null } = {}) {
  const stmt = db.prepare(`
    INSERT INTO lg_concepts (ui, name, semantic_type, tree_numbers, date_established, date_created, vocabulary_year)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ui) DO UPDATE SET
      name = excluded.name,
      semantic_type = excluded.semantic_type,
      tree_numbers = excluded.tree_numbers,
      date_established = excluded.date_established,
      date_created = excluded.date_created,
      vocabulary_year = excluded.vocabulary_year
  `);
  let loaded = 0;
  db.exec('BEGIN');
  try {
    for (const d of descriptors) {
      if (!d?.ui) continue;
      stmt.run(d.ui, d.name, semanticTypeFromTree(d.treeNumbers),
        (d.treeNumbers ?? []).join(','), d.dateEstablished ?? null, d.dateCreated ?? null,
        d.vocabularyYear ?? vocabularyYear ?? null);
      loaded += 1;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return loaded;
}

/* --------------------------- the leakage audit --------------------------- */

/**
 * Descriptors that did not exist at `cutoffYear`.
 *
 * A descriptor with no establishment date is NOT anachronistic — the absence
 * means NLM never recorded one, which is true of much of the historical core.
 * Treating unknown as suspect would flag most of the vocabulary and make the
 * audit useless.
 */
export function anachronisticConcepts(db, cutoffYear) {
  return db.prepare(`
    SELECT ui, name, date_established, semantic_type
    FROM lg_concepts
    WHERE date_established IS NOT NULL AND CAST(substr(date_established, 1, 4) AS INTEGER) > ?
    ORDER BY date_established ASC
  `).all(Number(cutoffYear));
}

/**
 * How much post-cut-off vocabulary contaminates the pre-cut-off corpus.
 *
 * This is the number the benchmark must publish. It answers the strongest
 * objection a reviewer can make — "your 2015 corpus contains 2020 knowledge" —
 * with a measurement rather than a reassurance.
 */
export function auditVocabularyLeakage(db, cutoffYear) {
  const cutoff = Number(cutoffYear);
  const anachronistic = anachronisticConcepts(db, cutoff);
  const uis = new Set(anachronistic.map((c) => c.ui));

  const totals = db.prepare(`
    SELECT COUNT(*) AS annotations
    FROM lg_annotations an JOIN lg_articles ar ON ar.id = an.article_id
    WHERE ar.year IS NOT NULL AND ar.year <= ?
  `).get(cutoff) ?? { annotations: 0 };

  // Annotations on pre-cut-off articles using descriptors that postdate them.
  // Each one is direct evidence that NLM re-indexed an older record.
  const contaminated = db.prepare(`
    SELECT COUNT(*) AS n, COUNT(DISTINCT an.article_id) AS articles, COUNT(DISTINCT an.concept_ui) AS concepts
    FROM lg_annotations an
    JOIN lg_articles ar ON ar.id = an.article_id
    JOIN lg_concepts c ON c.ui = an.concept_ui
    WHERE ar.year IS NOT NULL AND ar.year <= ?
      AND c.date_established IS NOT NULL
      AND CAST(substr(c.date_established, 1, 4) AS INTEGER) > ?
  `).get(cutoff, cutoff) ?? { n: 0, articles: 0, concepts: 0 };

  const withDates = db.prepare('SELECT COUNT(*) AS n FROM lg_concepts WHERE date_established IS NOT NULL').get() ?? { n: 0 };
  const allConcepts = db.prepare('SELECT COUNT(*) AS n FROM lg_concepts').get() ?? { n: 0 };
  // Auditability is NOT "most concepts have dates". Much of the MeSH historical
  // core genuinely has no DateEstablished, so that test would reject a corpus of
  // old, perfectly datable descriptors. The real question is whether a
  // descriptor RELEASE was ever loaded — concepts arriving only from article
  // annotations carry no vocabulary_year, and a corpus of those cannot be audited.
  const fromRelease = db.prepare('SELECT COUNT(*) AS n FROM lg_concepts WHERE vocabulary_year IS NOT NULL OR date_established IS NOT NULL OR tree_numbers IS NOT NULL').get() ?? { n: 0 };

  const rate = totals.annotations > 0 ? contaminated.n / totals.annotations : 0;
  const dateCoverage = allConcepts.n > 0 ? withDates.n / allConcepts.n : 0;
  const vocabularyLoaded = allConcepts.n > 0 && fromRelease.n / allConcepts.n > 0.5;

  return {
    cutoffYear: cutoff,
    anachronisticConcepts: anachronistic.length,
    contaminatedAnnotations: contaminated.n,
    contaminatedArticles: contaminated.articles,
    preCutoffAnnotations: totals.annotations,
    leakageRate: Number(rate.toFixed(5)),
    // Without descriptor dates the audit cannot run, and saying so is the whole
    // point — an unaudited corpus must not be presented as clean.
    dateCoverage: Number(dateCoverage.toFixed(3)),
    /** Fraction of concepts that came from a descriptor release rather than from article annotations alone. */
    vocabularyCoverage: allConcepts.n > 0 ? Number((fromRelease.n / allConcepts.n).toFixed(3)) : 0,
    auditable: vocabularyLoaded,
    excludedUis: [...uis],
    statement: buildStatement(cutoff, anachronistic.length, contaminated, totals.annotations, rate, vocabularyLoaded),
  };
}

function buildStatement(cutoff, anachronisticCount, contaminated, totalAnnotations, rate, vocabularyLoaded) {
  if (!vocabularyLoaded) {
    return 'No NLM descriptor release has been loaded, so vocabulary leakage CANNOT be audited. '
      + 'Load an NLM descriptor release before running any retrospective analysis — an unaudited corpus must not be described as historical.';
  }
  if (anachronisticCount === 0) {
    return `No descriptor in this corpus was established after ${cutoff}. The vocabulary is consistent with the cut-off.`;
  }
  return `${anachronisticCount} descriptor(s) in this corpus were established after ${cutoff}. `
    + `${contaminated.n} of ${totalAnnotations} pre-${cutoff + 1} annotations (${(rate * 100).toFixed(2)}%) use one, across ${contaminated.articles} article(s) — `
    + 'direct evidence that NLM re-indexed older records against newer vocabulary. '
    + 'Those concepts are excluded from time-sliced statistics, and any benchmark target depending on one must be reported as contaminated rather than silently dropped.';
}

/**
 * The concept ids a time-sliced analysis may legitimately use.
 *
 * Fails CLOSED: with no descriptor dates loaded it returns an empty allow-list
 * rather than everything, so a corpus that has never been audited cannot be
 * mistaken for one that passed. That will look like a bug to whoever hits it
 * first, which is the intended outcome.
 */
export function conceptsValidAt(db, cutoffYear) {
  const audit = auditVocabularyLeakage(db, cutoffYear);
  if (!audit.auditable) return { concepts: [], auditable: false, reason: audit.statement };
  const rows = db.prepare(`
    SELECT ui FROM lg_concepts
    WHERE date_established IS NULL OR CAST(substr(date_established, 1, 4) AS INTEGER) <= ?
  `).all(Number(cutoffYear));
  return { concepts: rows.map((r) => r.ui), auditable: true, reason: audit.statement };
}

/**
 * Which benchmark targets are contaminated, and therefore may not be counted as
 * clean hits. Returned per target so the published table can mark them rather
 * than dropping them — a dropped target is indistinguishable from one that was
 * never tried.
 */
export function classifyTargets(db, targets, cutoffYear) {
  const anachronistic = new Set(anachronisticConcepts(db, cutoffYear).map((c) => c.ui));
  return targets.map((t) => {
    // Both spellings are accepted because the benchmark harness names the field
    // `expectedBridgeUis`. A target whose bridge is contaminated but whose
    // endpoints are clean would otherwise pass the audit silently, which is the
    // exact failure this function exists to prevent.
    const involved = [t.aUi, t.cUi, ...(t.bridgeUis ?? []), ...(t.expectedBridgeUis ?? [])].filter(Boolean);
    const offending = involved.filter((ui) => anachronistic.has(ui));
    return {
      ...t,
      contaminated: offending.length > 0,
      offendingConcepts: offending,
      note: offending.length === 0
        ? `All concepts existed at ${cutoffYear}.`
        : `Depends on ${offending.length} descriptor(s) established after ${cutoffYear}; must be reported as contaminated, not counted as a clean hit.`,
    };
  });
}
