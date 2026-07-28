import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openCorpus, ingestArticles, rebuildStatistics, corpusStats, cooccurrence, isCitable, mapNode, conceptsForNode } from './store.mjs';
import { npmi, association, openDiscovery, closedDiscovery, citationsForChain } from './swanson.mjs';

/**
 * Looking Glass — discovery engine tests.
 *
 * THE FIXTURE IS SYNTHETIC AND SAYS SO. Article ids are non-numeric
 * ('FIXTURE-…') and source is 'fixture', so no test record can ever be rendered
 * as a citation — `isCitable` rejects it structurally rather than by convention.
 * Concept identifiers are 'FX…' rather than real MeSH UIs for the same reason.
 * A test that invented plausible PMIDs would put fabricated citations one bug
 * away from a user's screen.
 *
 * The corpus below encodes a KNOWN Swanson structure so the engine's answer can
 * be checked rather than admired:
 *
 *   A (chemical)  ── 12 papers ──  B (process)  ── 14 papers ──  C (disease)
 *   A and C: never co-published before 2016; linked only from 2020.
 *
 * If open discovery does not return C from A, the engine is broken. If closed
 * discovery cannot see the 2020 link appear when the year window moves, the
 * retrospective-validation capability does not exist.
 */

const CONCEPTS = {
  A: { ui: 'FXA', name: 'Compound alpha', semanticType: 'chemical' },
  B: { ui: 'FXB', name: 'Mitochondrial turnover', semanticType: 'process' },
  B2: { ui: 'FXB2', name: 'Proteostasis', semanticType: 'process' },
  C: { ui: 'FXC', name: 'Sarcopenia', semanticType: 'disease' },
  D: { ui: 'FXD', name: 'Unrelated disorder', semanticType: 'disease' },
  RARE: { ui: 'FXR', name: 'Rare finding', semanticType: 'disease' },
  NOISE: { ui: 'D006801', name: 'Humans', semanticType: 'organism' }, // stop concept
};

/** Build n articles annotated with the given concepts. */
function papers(prefix, n, concepts, year) {
  return Array.from({ length: n }, (_, i) => ({
    id: `FIXTURE-${prefix}-${String(i).padStart(3, '0')}`,
    year,
    title: `Synthetic record ${prefix} ${i}`,
    journal: 'Test Corpus',
    concepts: concepts.map((c) => ({ ...c, isMajor: true })),
  }));
}

let db;
beforeEach(() => {
  db = openCorpus(':memory:');
  const corpus = [
    // A–B literature.
    ...papers('AB', 12, [CONCEPTS.A, CONCEPTS.B, CONCEPTS.NOISE], 2010),
    // B–C literature, written by a different community.
    ...papers('BC', 14, [CONCEPTS.B, CONCEPTS.C, CONCEPTS.NOISE], 2012),
    // A second bridge, so convergence can be tested.
    ...papers('AB2', 8, [CONCEPTS.A, CONCEPTS.B2, CONCEPTS.NOISE], 2011),
    ...papers('B2C', 9, [CONCEPTS.B2, CONCEPTS.C, CONCEPTS.NOISE], 2013),
    // Background so C is well attested and frequencies are not degenerate.
    ...papers('C', 22, [CONCEPTS.C, CONCEPTS.NOISE], 2011),
    ...papers('A', 18, [CONCEPTS.A, CONCEPTS.NOISE], 2009),
    ...papers('D', 25, [CONCEPTS.D, CONCEPTS.NOISE], 2010),
    // A barely-studied concept: its absence from the A literature proves nothing.
    ...papers('RARE', 3, [CONCEPTS.B, CONCEPTS.RARE], 2012),
    // BACKGROUND. Without it every concept occupies a large fraction of the
    // corpus and nPMI collapses toward zero — association is measured against
    // what independent frequency would predict, so a dense toy corpus makes even
    // a real relationship look unsurprising. This is a genuine property of the
    // measure and of the module: Looking Glass needs a corpus large enough for
    // concepts to be sparse. 400 unrelated records reproduce that condition.
    ...papers('BG', 400, [CONCEPTS.D, CONCEPTS.NOISE], 2008),
    // The link nobody had made — published only in 2020.
    ...papers('AC', 6, [CONCEPTS.A, CONCEPTS.C, CONCEPTS.NOISE], 2020),
  ];
  ingestArticles(db, corpus, { source: 'fixture', now: 1 });
});

describe('association measure', () => {
  test('nPMI is 0 for independence and rises for genuine association', () => {
    // Perfect co-occurrence: both concepts only ever appear together.
    assert.ok(npmi({ bothArticles: 10, aArticles: 10, bArticles: 10, totalArticles: 100 }) > 0.9);
    // Independence: p(a,b) == p(a)·p(b).
    const independent = npmi({ bothArticles: 1, aArticles: 10, bArticles: 10, totalArticles: 100 });
    assert.ok(Math.abs(independent) < 0.01, `expected ~0, got ${independent}`);
  });

  test('is not fooled by a frequent concept', () => {
    // A term on every paper carries no information about anything.
    const ubiquitous = npmi({ bothArticles: 50, aArticles: 50, bArticles: 100, totalArticles: 100 });
    const specific = npmi({ bothArticles: 50, aArticles: 50, bArticles: 55, totalArticles: 100 });
    assert.ok(specific > ubiquitous);
  });

  test('reports a non-co-occurring pair as cooccurs:false rather than throwing', () => {
    rebuildStatistics(db, { throughYear: 2015, minSupport: 2 });
    const a = association(db, 'FXA', 'FXC', corpusStats(db).articles);
    assert.equal(a.cooccurs, false);
    assert.equal(a.bothArticles, 0);
  });
});

describe('open discovery (Swanson ABC)', () => {
  beforeEach(() => rebuildStatistics(db, { throughYear: 2015, minSupport: 2 }));

  test('finds the target that the literature implies but never states', () => {
    const result = openDiscovery(db, 'FXA', { minCArticles: 10 });
    const hit = result.candidates.find((c) => c.target.ui === 'FXC');
    assert.ok(hit, `expected FXC among candidates, got ${result.candidates.map((c) => c.target.ui).join(',')}`);
    assert.ok(hit.bridges.length >= 1);
  });

  test('reports BOTH bridges, so convergence is visible', () => {
    const hit = openDiscovery(db, 'FXA', { minCArticles: 10 }).candidates.find((c) => c.target.ui === 'FXC');
    const bridgeIds = hit.bridges.map((b) => b.b.ui).sort();
    assert.deepEqual(bridgeIds, ['FXB', 'FXB2']);
    assert.equal(hit.convergence, 2);
  });

  test('never proposes a target that already co-occurs with the source', () => {
    for (const c of openDiscovery(db, 'FXA', { minCArticles: 5 }).candidates) {
      assert.equal(cooccurrence(db, 'FXA', c.target.ui), null, `${c.target.ui} already co-occurs with FXA`);
    }
  });

  test('rejects a barely-studied target — sparse absence is not discovery', () => {
    // FXR appears in 3 papers. Its absence from the A literature is uninformative.
    const withThreshold = openDiscovery(db, 'FXA', { minCArticles: 10 });
    assert.ok(!withThreshold.candidates.some((c) => c.target.ui === 'FXR'));
    // Lowering the threshold lets it through, which is exactly what the knob is for.
    const without = openDiscovery(db, 'FXA', { minCArticles: 1, minLinkArticles: 2 });
    assert.ok(without.candidates.some((c) => c.target.ui === 'FXR'));
  });

  test('excludes stop concepts entirely', () => {
    const result = openDiscovery(db, 'FXA', { minCArticles: 1, minLinkArticles: 1, minLinkNpmi: -1 });
    for (const c of result.candidates) {
      assert.notEqual(c.target.ui, 'D006801');
      for (const b of c.bridges) assert.notEqual(b.b.ui, 'D006801');
    }
  });

  test('returns an empty result rather than guessing for an unknown concept', () => {
    const r = openDiscovery(db, 'DOES-NOT-EXIST');
    assert.deepEqual(r.candidates, []);
    assert.ok(r.rejected);
  });
});

describe('retrospective validation — the capability that matters', () => {
  test('a pre-2016 corpus proposes a link that was only published in 2020', () => {
    // Build the corpus AS OF 2015. The A–C papers (2020) are excluded.
    rebuildStatistics(db, { throughYear: 2015, minSupport: 2 });
    assert.equal(cooccurrence(db, 'FXA', 'FXC'), null, 'A and C must not co-occur in the 2015 corpus');

    const proposed = openDiscovery(db, 'FXA', { minCArticles: 10 }).candidates.some((c) => c.target.ui === 'FXC');
    assert.ok(proposed, 'the 2015 corpus should imply the link');

    // Now include everything. The link exists in the literature.
    rebuildStatistics(db, { throughYear: null, minSupport: 2 });
    const now = cooccurrence(db, 'FXA', 'FXC');
    assert.ok(now, 'A and C DO co-occur once 2020 is included');
    assert.equal(now.first_year, 2020);

    // And the engine correctly stops proposing what is now established.
    const stillProposed = openDiscovery(db, 'FXA', { minCArticles: 10 }).candidates.some((c) => c.target.ui === 'FXC');
    assert.equal(stillProposed, false, 'a stated link is no longer a hypothesis');
  });

  test('closed discovery states plainly whether A and C ever co-occur', () => {
    rebuildStatistics(db, { throughYear: 2015, minSupport: 2 });
    const before = closedDiscovery(db, 'FXA', 'FXC');
    assert.equal(before.aAndCEverCoOccur, false);
    assert.ok(before.bridges.length >= 2, 'both intermediates should be recoverable');

    rebuildStatistics(db, { throughYear: null, minSupport: 2 });
    assert.equal(closedDiscovery(db, 'FXA', 'FXC').aAndCEverCoOccur, true);
  });
});

describe('citations and provenance', () => {
  beforeEach(() => rebuildStatistics(db, { throughYear: 2015, minSupport: 2 }));

  test('every link in a chain resolves to concrete articles', () => {
    const cites = citationsForChain(db, 'FXA', 'FXB', 'FXC');
    assert.ok(cites.ab.length > 0);
    assert.ok(cites.bc.length > 0);
    // The absence of A–C papers IS the hypothesis; there is nothing to cite.
    assert.deepEqual(cites.ac, []);
  });

  test('fixture records are structurally uncitable', () => {
    for (const a of citationsForChain(db, 'FXA', 'FXB', 'FXC').ab) {
      assert.equal(isCitable(a), false, `${a.id} must not be presentable as a citation`);
      assert.equal(a.source, 'fixture');
      assert.ok(!/^\d+$/.test(a.id), 'a fixture id must not look like a PMID');
    }
  });

  test('a real PubMed record with a numeric id is citable', () => {
    assert.equal(isCitable({ source: 'pubmed', id: '26000000' }), true);
    assert.equal(isCitable({ source: 'pubmed', id: 'not-a-pmid' }), false);
    assert.equal(isCitable({ source: 'fixture', id: '26000000' }), false);
  });
});

describe('corpus hygiene', () => {
  test('re-ingesting the same articles does not inflate counts', () => {
    rebuildStatistics(db, { throughYear: null, minSupport: 2 });
    const before = corpusStats(db);
    const beforePair = cooccurrence(db, 'FXA', 'FXB');

    ingestArticles(db, papers('AB', 12, [CONCEPTS.A, CONCEPTS.B, CONCEPTS.NOISE], 2010), { source: 'fixture', now: 2 });
    rebuildStatistics(db, { throughYear: null, minSupport: 2 });

    assert.equal(corpusStats(db).articles, before.articles, 'duplicate ingest must not add articles');
    assert.equal(cooccurrence(db, 'FXA', 'FXB').articles, beforePair.articles, 'nor inflate co-occurrence');
  });

  test('minSupport prunes single-article pairs', () => {
    rebuildStatistics(db, { throughYear: null, minSupport: 1 });
    const loose = corpusStats(db).pairs;
    rebuildStatistics(db, { throughYear: null, minSupport: 5 });
    assert.ok(corpusStats(db).pairs < loose);
  });

  test('corpus reports its own coverage, including which source the records came from', () => {
    rebuildStatistics(db, { throughYear: null, minSupport: 2 });
    const s = corpusStats(db);
    assert.equal(s.bySource.fixture, s.articles);
    assert.equal(s.bySource.pubmed, undefined);
    assert.deepEqual(s.yearRange, [2008, 2020]);
    assert.equal(s.statsThroughYear, 'all');
  });
});

describe('bridge to the curated Genesis graph', () => {
  test('a curated node maps to one or more MeSH concepts, with attribution', () => {
    rebuildStatistics(db, { throughYear: null, minSupport: 2 });
    mapNode(db, 'mitochondrial-dysfunction', 'FXB', 'curator:test');
    mapNode(db, 'mitochondrial-dysfunction', 'FXB2', 'curator:test');
    const mapped = conceptsForNode(db, 'mitochondrial-dysfunction');
    assert.equal(mapped.length, 2);
    assert.ok(mapped.every((m) => m.mapped_by === 'curator:test'));
    assert.ok(mapped.every((m) => m.articles > 0));
  });
});
