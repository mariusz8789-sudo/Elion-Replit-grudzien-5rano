import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openCorpus, ingestArticles, rebuildStatistics, corpusStats } from './store.mjs';
import { conceptsValidAt } from './mesh.mjs';
import { loadReleaseFromStream } from './descriptorRelease.mjs';
import { parsePreregistration } from './preregistration.mjs';
import { runTarget, samplePairedControls, nullDistribution, runBenchmark, formatReport } from './benchmark.mjs';

/**
 * The retrospective benchmark harness.
 *
 * THE FIXTURE IS SYNTHETIC AND CANNOT BE MISTAKEN FOR REAL DATA: article ids are
 * `FIXTURE-…` (rejected by `isCitable`) and descriptor UIs are in the D9xxxxx
 * range NLM does not issue. A benchmark fixture that used plausible PMIDs would
 * put fabricated results one bug away from a published table.
 *
 * These tests do NOT show that the engine anticipates real discoveries — no real
 * corpus exists yet. They pin the harness's REFUSALS, which is where a benchmark
 * is actually won or lost:
 *
 *   - it will not run without a pre-registration reference;
 *   - it disqualifies a target BEFORE looking at engine output, so nothing can
 *     be retro-fitted into a hit;
 *   - it marks contaminated targets rather than dropping them;
 *   - a hit requires beating frequency-matched controls, not merely appearing.
 *
 * The corpus below is built so the answer is known in advance: A and C are
 * joined by two bridges and never co-published before 2016. If the harness
 * cannot score that as a hit, it can score nothing; if it scores the deliberately
 * broken targets as hits, it is a marketing instrument.
 */

const CUTOFF = 2015;

/** Descriptor records, as `loadDescriptors` consumes them. */
function descriptor(ui, name, tree, dateEstablished) {
  return { ui, name, treeNumbers: [tree], dateEstablished, dateCreated: dateEstablished, vocabularyYear: 2024 };
}

const A = 'D900001';
const B1 = 'D900002';
const B2 = 'D900003';
const C = 'D900004';
const DECOY = 'D900020';
/** Established in 2018 — cannot legitimately take part in a 2015 analysis. */
const FUTURE = 'D900030';
/** Attested by three articles: its absence from the A literature proves nothing. */
const RARE = 'D900040';
const HUMANS = 'D006801';

/** Controls 1–3 are reachable through B1; 4–6 are not, and get censored. */
const LINKED_CONTROLS = ['D900101', 'D900102', 'D900103'];
const ISOLATED_CONTROLS = ['D900104', 'D900105', 'D900106'];

/**
 * A shared pathway with a fan of weakly-attached disorders behind it.
 *
 * Their purpose is to make the candidate list long enough that appearing in it
 * is cheap — which is the objection the null model exists to answer. Without
 * them every returned candidate beat its controls automatically and the
 * `rank < median` requirement was never actually exercised: removing it from
 * `countsAsHit` left all tests green. A benchmark whose central criterion can be
 * deleted without a test noticing is not a benchmark.
 */
const SHARED_PATHWAY = 'D900005';
const WEAK_TARGETS = ['D900201', 'D900202', 'D900203', 'D900204', 'D900205', 'D900206'];
/** Papers each weak disorder shares with the pathway — the only thing that varies. */
const WEAK_SUPPORT = [10, 13, 16, 19, 22, 25];
/** The weakest of them: returned by the engine, but below its own controls. */
const WEAKEST = WEAK_TARGETS[0];

const DESCRIPTORS = [
  descriptor(A, 'Compound alpha', 'D02.900.001', '1990-01-01'),
  descriptor(B1, 'Mitochondrial turnover', 'G04.900.002', '1995-01-01'),
  descriptor(B2, 'Proteostasis', 'G04.900.003', '1998-01-01'),
  descriptor(C, 'Fixture myopathy', 'C05.900.004', '2000-01-01'),
  descriptor(DECOY, 'Unrelated fixture disorder', 'C05.900.020', '1990-01-01'),
  descriptor(FUTURE, 'Fixture senotherapeutics', 'D02.900.030', '2018-01-01'),
  descriptor(RARE, 'Rare fixture disorder', 'C05.900.040', '1990-01-01'),
  descriptor(HUMANS, 'Humans', 'B01.050.150', '1966-01-01'),
  ...LINKED_CONTROLS.map((ui, i) => descriptor(ui, `Control disorder L${i}`, `C05.900.10${i}`, '2000-01-01')),
  ...ISOLATED_CONTROLS.map((ui, i) => descriptor(ui, `Control disorder I${i}`, `C05.900.20${i}`, '2000-01-01')),
  descriptor(SHARED_PATHWAY, 'Shared fixture pathway', 'G04.900.005', '1995-01-01'),
  ...WEAK_TARGETS.map((ui, i) => descriptor(ui, `Weak disorder W${i}`, `C05.900.30${i}`, '2000-01-01')),
];

function papers(prefix, n, uis, year) {
  return Array.from({ length: n }, (_, i) => ({
    id: `FIXTURE-${prefix}-${String(i).padStart(3, '0')}`,
    year,
    title: `Synthetic record ${prefix} ${i}`,
    journal: 'Test Corpus',
    concepts: uis.map((ui) => ({ ui, name: ui, isMajor: true })),
  }));
}

/**
 * The descriptor set as an NLM release file.
 *
 * Declared as 2024, not 2015, and that is deliberate: a real audit of a 2015
 * corpus needs a release that CONTAINS the post-2015 descriptors, or there is
 * nothing to catch NLM's re-indexing with. The benchmark then has to say it used
 * a later release — which is a limitation to report, not a reason to refuse.
 */
const RELEASE_XML = `<?xml version="1.0"?>
<!DOCTYPE DescriptorRecordSet SYSTEM "https://www.nlm.nih.gov/databases/dtd/nlmdescriptorrecordset_20240101.dtd">
<DescriptorRecordSet LanguageCode="eng">
${DESCRIPTORS.map((d) => {
    const [year, month, day] = d.dateEstablished.split('-');
    return `<DescriptorRecord DescriptorClass="1">
  <DescriptorUI>${d.ui}</DescriptorUI>
  <DescriptorName><String>${d.name}</String></DescriptorName>
  <DateEstablished><Year>${year}</Year><Month>${month}</Month><Day>${day}</Day></DateEstablished>
  <TreeNumberList><TreeNumber>${d.treeNumbers[0]}</TreeNumber></TreeNumberList>
</DescriptorRecord>`;
  }).join('\n')}
</DescriptorRecordSet>
`;

async function buildCorpus(db, { contaminate = false } = {}) {
  // Loaded through the real release path rather than `loadDescriptors`, so the
  // corpus carries the provenance the benchmark now requires — and so these
  // tests exercise the loader the way a real run would use it.
  await loadReleaseFromStream(db, [RELEASE_XML], { expectYear: 2024, url: 'fixture://desc2024.xml', now: 1 });
  const corpus = [
    // The two arms of the hidden link, written by different communities.
    ...papers('AB1', 12, [A, B1, HUMANS], 2010),
    ...papers('B1C', 14, [B1, C, HUMANS], 2012),
    ...papers('AB2', 8, [A, B2, HUMANS], 2011),
    ...papers('B2C', 9, [B2, C, HUMANS], 2013),
    // Background so both endpoints are well attested and frequencies are not degenerate.
    ...papers('C', 22, [C, HUMANS], 2011),
    ...papers('A', 18, [A, HUMANS], 2009),
    ...papers('D', 25, [DECOY, HUMANS], 2010),
    // Bulk background. Without it every concept occupies a large share of the
    // corpus, nPMI collapses toward zero, and even a constructed relationship
    // looks unsurprising — a real property of the measure, not a fixture quirk.
    ...papers('BG', 1850, [DECOY, HUMANS], 2008),
    // A shared pathway carrying a fan of weakly-supported disorders, so the
    // candidate list is long and being on it is worth little.
    ...papers('AB3', 20, [A, SHARED_PATHWAY, HUMANS], 2010),
    ...WEAK_TARGETS.flatMap((ui, i) => [
      ...papers(`WB${i}`, WEAK_SUPPORT[i], [SHARED_PATHWAY, ui], 2012),
      ...papers(`W${i}`, 45 - WEAK_SUPPORT[i], [ui, HUMANS], 2011),
    ]),
    // Frequency-matched controls: same semantic type and similar document count
    // as C, never co-occurring with A. Three are reachable via B1 with a single
    // bridge, so C's two bridges must outrank them.
    ...LINKED_CONTROLS.flatMap((ui, i) => [
      ...papers(`CTRLB${i}`, 8, [B1, ui], 2012),
      ...papers(`CTRL${i}`, 34, [ui, HUMANS], 2011),
    ]),
    ...ISOLATED_CONTROLS.flatMap((ui, i) => papers(`ISO${i}`, 42, [ui, HUMANS], 2011)),
    // Barely studied — deliberately below the attestation floor.
    ...papers('RARE', 3, [B1, RARE], 2012),
    // The link nobody had made, published only in 2020.
    ...papers('AC', 6, [A, C, HUMANS], 2020),
  ];
  if (contaminate) {
    // A 2010 article carrying a descriptor established in 2018: exactly the NLM
    // re-indexing the audit exists to catch.
    corpus.push(...papers('LEAK', 4, [A, FUTURE, HUMANS], 2010));
  }
  ingestArticles(db, corpus, { source: 'fixture', now: 1 });
  rebuildStatistics(db, { throughYear: CUTOFF, minSupport: 2, vocabularyGuard: conceptsValidAt });
}

const TARGET = { name: 'compound alpha → fixture myopathy', aUi: A, cUi: C, publishedYear: 2020, expectedBridgeUis: [B1] };
const PREREG = 'fixture://preregistration/2026-01-01';

let db;
beforeEach(async () => {
  db = openCorpus(':memory:');
  await buildCorpus(db);
});

describe('the denominator associations are measured against', () => {
  test('a time slice counts only the articles in the slice', () => {
    // Dividing by the whole database would put the post-cut-off literature into
    // the denominator of every pre-cut-off association — the corpus would be
    // "historical" everywhere except in the arithmetic.
    const stats = corpusStats(db);
    assert.ok(stats.statsArticles < stats.articles, 'the 2020 records must be outside the 2015 denominator');
    assert.equal(stats.articles - stats.statsArticles, 6);
  });

  test('with no slice, the denominator is the whole corpus', () => {
    rebuildStatistics(db, { minSupport: 2, enforceVocabulary: false });
    const stats = corpusStats(db);
    assert.equal(stats.statsArticles, stats.articles);
  });
});

describe('running one target', () => {
  test('finds the hidden link and reports where it ranked', () => {
    const r = runTarget(db, TARGET, { cutoffYear: CUTOFF });
    assert.deepEqual(r.disqualified, []);
    assert.ok(r.rank !== null, 'the constructed target must be returned at all');
    assert.equal(r.rank, 1, `expected the two-bridge target to lead the single-bridge controls, got ${r.rank}`);
    assert.equal(r.convergence, 2);
  });

  test('recovers the bridge the eventual publication reported', () => {
    // Proposing the right pair through the wrong mechanism is a coincidence.
    const r = runTarget(db, TARGET, { cutoffYear: CUTOFF });
    assert.equal(r.bridgeMatched, true);
    assert.ok(r.bridges.some((b) => b.ui === B1));
  });

  test('reports no bridge verdict when the target declares no expected mechanism', () => {
    // Silence is the honest answer: an unstated expectation cannot be matched,
    // and returning `false` would score the engine against a claim nobody made.
    const r = runTarget(db, { ...TARGET, expectedBridgeUis: undefined }, { cutoffYear: CUTOFF });
    assert.equal(r.bridgeMatched, null);
  });
});

describe('disqualification — checked before the engine runs, never after', () => {
  test('a pair that already co-occurred was not a hidden link', () => {
    const r = runTarget(db, { name: 'A–B1', aUi: A, cUi: B1 }, { cutoffYear: CUTOFF });
    assert.equal(r.rank, null);
    assert.match(r.disqualified.join(' '), /already co-occur/);
  });

  test('a concept absent from the corpus disqualifies rather than scoring zero', () => {
    const r = runTarget(db, { name: 'ghost', aUi: A, cUi: 'D999999' }, { cutoffYear: CUTOFF });
    assert.match(r.disqualified.join(' '), /absent from the corpus/);
  });

  test('a barely-attested C is disqualified because its absence proves nothing', () => {
    const r = runTarget(db, { name: 'rare', aUi: A, cUi: RARE }, { cutoffYear: CUTOFF });
    assert.match(r.disqualified.join(' '), /too few for its absence/);
  });

  test('a disqualified target never reaches the engine', () => {
    // If the engine ran first, a disqualification could be reconsidered after
    // seeing whether the target happened to rank well. It must not be possible.
    const r = runTarget(db, { name: 'A–B1', aUi: A, cUi: B1 }, { cutoffYear: CUTOFF });
    assert.equal(r.discovery, null);
    assert.deepEqual(r.bridges, []);
  });
});

describe('the null model — the only part that carries evidential weight', () => {
  test('controls match the target on document frequency and share its structure', () => {
    const controls = samplePairedControls(db, TARGET, { count: 10 });
    assert.ok(controls.length >= 6, `expected the fixture's six controls, got ${controls.length}`);
    for (const ctrl of controls) {
      assert.ok(Math.abs(ctrl.articles - 45) <= 45 * 0.35, `${ctrl.ui} is not frequency-matched (${ctrl.articles})`);
      assert.notEqual(ctrl.ui, C);
      assert.notEqual(ctrl.ui, A);
    }
  });

  test('controls that the engine never returns are censored, not discarded', () => {
    // Dropping them would take the median over only the controls that did well —
    // the one arrangement guaranteed to flatter the target.
    const nulls = nullDistribution(db, TARGET, { count: 10 });
    assert.equal(nulls.ranked + nulls.censored, nulls.controls);
    assert.ok(nulls.censored > 0, 'the fixture has three controls with no path from A');
    assert.equal(nulls.ranks.length, nulls.controls);
    assert.ok(nulls.ranks.every((r) => r <= nulls.censoredRank));
  });

  test('the target ranks above the median control', () => {
    const r = runTarget(db, TARGET, { cutoffYear: CUTOFF });
    const nulls = nullDistribution(db, TARGET, { count: 10 });
    assert.ok(nulls.median !== null);
    assert.ok(r.rank < nulls.median, `target rank ${r.rank} vs null median ${nulls.median}`);
  });

  test('a target with no available controls yields no median, and so cannot be a hit', () => {
    const nulls = nullDistribution(db, { aUi: A, cUi: DECOY }, { count: 10 });
    assert.equal(nulls.controls, 0);
    assert.equal(nulls.median, null);
  });
});

describe('the whole benchmark', () => {
  test('refuses to run without a pre-registration reference', () => {
    // Choosing targets after seeing output is p-hacking with extra steps, and the
    // harness cannot verify the claim — so it records one and refuses without it.
    assert.throws(() => runBenchmark(db, [TARGET], { cutoffYear: CUTOFF }), /preregistrationRef is required/);
  });

  test('scores the constructed target as a hit and says what a hit does not mean', () => {
    const report = runBenchmark(db, [TARGET], { cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10 });
    assert.equal(report.summary.total, 1);
    assert.equal(report.summary.eligible, 1);
    assert.equal(report.summary.hits, 1);
    assert.equal(report.targets[0].countsAsHit, true);
    assert.match(report.verdict, /does NOT mean the engine would have made the discovery/);
  });

  test('a target that merely appears in the output is NOT a hit', () => {
    // The objection this harness exists to answer: open discovery returns
    // thousands of candidates, so presence in the list is expected by chance.
    // The weakest fixture target is returned by the engine and still fails,
    // because its frequency-matched controls are returned ahead of it.
    const report = runBenchmark(db, [{ name: 'weakest disorder', aUi: A, cUi: WEAKEST }], {
      cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10,
    });
    const row = report.targets[0];
    assert.deepEqual(row.disqualified, []);
    assert.ok(row.rank !== null, 'the engine does return this target — that is the point');
    assert.ok(row.rank > row.null.median, `rank ${row.rank} vs null median ${row.null.median}`);
    assert.equal(row.countsAsHit, false, 'appearing in the output must not be scored as a hit');
    assert.equal(report.summary.hits, 0);
  });

  test('reports a negative result plainly instead of hedging', () => {
    const report = runBenchmark(db, [{ name: 'weakest disorder', aUi: A, cUi: WEAKEST }], {
      cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10,
    });
    assert.equal(report.summary.eligible, 1);
    assert.equal(report.summary.hits, 0);
    assert.match(report.verdict, /NEGATIVE/);
    assert.match(report.verdict, /publishable finding/);
  });

  test('disqualified targets are reported, not silently removed', () => {
    const report = runBenchmark(db, [TARGET, { name: 'already known', aUi: A, cUi: B1 }], {
      cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10,
    });
    assert.equal(report.summary.total, 2);
    assert.equal(report.summary.disqualified, 1);
    assert.equal(report.summary.eligible, 1);
    assert.equal(report.summary.hitRate, 1);
  });

  test('every target appears in the published table, including the failures', () => {
    const report = runBenchmark(db, [TARGET, { name: 'already known', aUi: A, cUi: B1 }], {
      cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10,
    });
    const md = formatReport(report);
    assert.match(md, /already known/);
    assert.match(md, /disqualified/);
    assert.match(md, /Pre-registration/);
    assert.equal(md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Target')).length, 2);
  });
});

describe('contamination', () => {
  let dirty;
  beforeEach(async () => {
    dirty = openCorpus(':memory:');
    await buildCorpus(dirty, { contaminate: true });
  });

  test('a target depending on post-cut-off vocabulary is marked, never counted', () => {
    const report = runBenchmark(dirty, [{ name: 'future target', aUi: B1, cUi: FUTURE }], {
      cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10,
    });
    assert.equal(report.targets[0].contaminated, true);
    assert.equal(report.targets[0].countsAsHit, false);
    assert.equal(report.summary.eligible, 0);
    assert.match(report.verdict, /NO ELIGIBLE TARGETS/);
  });

  test('the leakage rate is published whether or not it is flattering', () => {
    const report = runBenchmark(dirty, [TARGET], { cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10 });
    assert.equal(report.leakage.auditable, true);
    assert.ok(report.leakage.rate > 0, 'the fixture deliberately contains re-indexed records');
    assert.match(report.leakage.statement, /direct evidence that NLM re-indexed/);
    assert.match(formatReport(report), /Vocabulary leakage: \d/);
  });

  test('a contaminated concept is excluded from the historical statistics', () => {
    // Marking the target is not enough — the descriptor must also be absent from
    // the co-occurrence table, or it can still act as a bridge.
    const controls = samplePairedControls(dirty, TARGET, { count: 20 });
    assert.ok(!controls.some((c) => c.ui === FUTURE));
    const r = runTarget(dirty, { name: 'via future', aUi: A, cUi: FUTURE }, { cutoffYear: CUTOFF });
    assert.match(r.disqualified.join(' '), /absent from the corpus|too few/);
  });
});

describe('refusing to certify an unaudited corpus', () => {
  test('statistics built without the vocabulary guard invalidate the benchmark', async () => {
    const loose = openCorpus(':memory:');
    await buildCorpus(loose);
    rebuildStatistics(loose, { throughYear: CUTOFF, minSupport: 2, enforceVocabulary: false });
    const report = runBenchmark(loose, [TARGET], { cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10 });
    assert.match(report.verdict, /INVALID/);
    assert.match(report.verdict, /without enforcing the historical vocabulary/);
  });

  test('a corpus with no descriptor release cannot produce a verdict at all', () => {
    const unaudited = openCorpus(':memory:');
    ingestArticles(unaudited, papers('X', 10, [A, C], 2010), { source: 'fixture' });
    rebuildStatistics(unaudited, { minSupport: 2 });
    const report = runBenchmark(unaudited, [TARGET], { cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10 });
    assert.equal(report.leakage.auditable, false);
    assert.equal(report.vocabulary.release, null);
    assert.match(report.verdict, /INVALID/);
    assert.match(report.verdict, /No MeSH release has been loaded/);
  });

  test('a bare reference is accepted but the report says it was not checked', () => {
    // A string is a promise, not a control. The report must not let a reader
    // mistake one for the other.
    const report = runBenchmark(db, [TARGET], { cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10 });
    assert.equal(report.preregistration.verified, false);
    assert.match(report.preregistration.statement, /NOT\s+checked against it/);
    assert.match(formatReport(report), /unverified/);
  });

  test('a supplied pre-registration is verified and the report says so', () => {
    const doc = parsePreregistration(JSON.stringify({
      ref: 'fixture://prereg', cutoffYear: CUTOFF, registeredAt: 0, targets: [TARGET],
    }));
    const report = runBenchmark(db, [TARGET], { cutoffYear: CUTOFF, preregistration: doc, nullControls: 10 });
    assert.equal(report.preregistration.verified, true);
    assert.equal(report.preregistration.targets, 1);
    assert.match(formatReport(report), /VERIFIED/);
  });

  test('a target added after registration stops the run', () => {
    // The whole point: the extra target never reaches the engine, so it cannot
    // be judged on whether it happened to rank well.
    const doc = parsePreregistration(JSON.stringify({
      ref: 'fixture://prereg', cutoffYear: CUTOFF, registeredAt: 0, targets: [TARGET],
    }));
    assert.throws(
      () => runBenchmark(db, [TARGET, { name: 'lucky', aUi: A, cUi: WEAKEST }], {
        cutoffYear: CUTOFF, preregistration: doc, nullControls: 10,
      }),
      /does not match the pre-registration/,
    );
  });

  test('the report names the release it used, with its checksum', () => {
    // "We used MeSH" is not a method. The vocabulary changes every year and
    // decides what the engine can even represent, so a reader who does not trust
    // us has to be able to fetch the same file and check it.
    const report = runBenchmark(db, [TARGET], { cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10 });
    assert.equal(report.vocabulary.release.year, 2024);
    assert.equal(report.vocabulary.release.url, 'fixture://desc2024.xml');
    assert.match(report.vocabulary.release.sha256, /^[0-9a-f]{64}$/);
    assert.match(formatReport(report), /Vocabulary: /);
  });

  test('a later release than the cut-off is used but declared as a limitation', () => {
    // It is not disqualifying: establishment dates are historical facts. What is
    // lost is descriptors that existed in 2015 and were deleted afterwards.
    const report = runBenchmark(db, [TARGET], { cutoffYear: CUTOFF, preregistrationRef: PREREG, nullControls: 10 });
    assert.equal(report.vocabulary.matchesCutoff, false);
    assert.match(report.vocabulary.statement, /later deleted are absent/);
    assert.ok(!report.verdict.startsWith('INVALID'), 'a later release weakens the claim; it does not void it');
  });
});
