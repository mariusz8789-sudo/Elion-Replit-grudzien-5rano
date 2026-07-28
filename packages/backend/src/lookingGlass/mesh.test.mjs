import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openCorpus, ingestArticles, getConcept } from './store.mjs';
import {
  parseNlmDate, parseDescriptorRecord, parseDescriptorFile, loadDescriptors,
  anachronisticConcepts, auditVocabularyLeakage, conceptsValidAt, classifyTargets,
} from './mesh.mjs';

/**
 * MeSH vocabulary and leakage audit.
 *
 * ⚠ Fixtures follow the published NLM descriptor DTD; they were not captured
 * from a real desc<year>.xml. Passing tests prove the parser handles the
 * documented schema.
 *
 * The tests that matter are the ones pinning the audit's behaviour when it
 * CANNOT run. A corpus with no descriptor dates must not be mistaken for a clean
 * one, so `conceptsValidAt` fails closed and returns nothing rather than
 * everything. That will look like a bug to whoever hits it first, which is
 * exactly the intended outcome.
 */

/** Established 1999 — present in any 2015 vocabulary. */
const OLD_DESCRIPTOR = `<DescriptorRecord DescriptorClass="1">
  <DescriptorUI>D019149</DescriptorUI>
  <DescriptorName><String>Cellular Senescence</String></DescriptorName>
  <DateCreated><Year>1998</Year><Month>06</Month><Day>15</Day></DateCreated>
  <DateEstablished><Year>1999</Year><Month>01</Month><Day>01</Day></DateEstablished>
  <TreeNumberList><TreeNumber>G04.299.176</TreeNumber></TreeNumberList>
</DescriptorRecord>`;

/** Established 2018 — cannot legitimately annotate a 2010 paper in a 2015 corpus. */
const NEW_DESCRIPTOR = `<DescriptorRecord DescriptorClass="1">
  <DescriptorUI>D000078790</DescriptorUI>
  <DescriptorName><String>Senotherapeutics</String></DescriptorName>
  <DateCreated><Year>2017</Year><Month>07</Month><Day>03</Day></DateCreated>
  <DateEstablished><Year>2018</Year><Month>01</Month><Day>01</Day></DateEstablished>
  <TreeNumberList><TreeNumber>D27.505.954</TreeNumber></TreeNumberList>
</DescriptorRecord>`;

/** Part of the historical core: no DateEstablished recorded at all. */
const ANCIENT_DESCRIPTOR = `<DescriptorRecord DescriptorClass="1">
  <DescriptorUI>D000375</DescriptorUI>
  <DescriptorName><String>Aging</String></DescriptorName>
  <TreeNumberList><TreeNumber>G07.345.087</TreeNumber></TreeNumberList>
</DescriptorRecord>`;

function paper(id, year, conceptUis) {
  return {
    id, year, title: `Synthetic ${id}`, journal: 'Test Corpus',
    concepts: conceptUis.map((ui) => ({ ui, name: ui, isMajor: true })),
  };
}

let db;
beforeEach(() => { db = openCorpus(':memory:'); });

describe('descriptor parsing', () => {
  test('reads UI, name, tree numbers and establishment date', () => {
    const d = parseDescriptorRecord(OLD_DESCRIPTOR);
    assert.equal(d.ui, 'D019149');
    assert.equal(d.name, 'Cellular Senescence');
    assert.deepEqual(d.treeNumbers, ['G04.299.176']);
    assert.equal(d.dateEstablished, '1999-01-01');
    assert.equal(d.dateCreated, '1998-06-15');
  });

  test('a descriptor with no establishment date yields null, not a guess', () => {
    assert.equal(parseDescriptorRecord(ANCIENT_DESCRIPTOR).dateEstablished, null);
  });

  test('parses a whole release and counts what it skipped', () => {
    const r = parseDescriptorFile(`<DescriptorRecordSet>${OLD_DESCRIPTOR}${NEW_DESCRIPTOR}${ANCIENT_DESCRIPTOR}</DescriptorRecordSet>`, 2015);
    assert.equal(r.seen, 3);
    assert.equal(r.descriptors.length, 3);
    assert.ok(r.descriptors.every((d) => d.vocabularyYear === 2015));
  });

  test('handles NLM date fragments', () => {
    assert.equal(parseNlmDate('<DateEstablished><Year>2016</Year></DateEstablished>'), '2016-01-01');
    assert.equal(parseNlmDate('<X><Year>16</Year></X>'), null);
    assert.equal(parseNlmDate(null), null);
  });
});

describe('loading a vocabulary', () => {
  test('stores dates and derives semantic type from the tree number', () => {
    const { descriptors } = parseDescriptorFile(`${OLD_DESCRIPTOR}${NEW_DESCRIPTOR}`, 2019);
    assert.equal(loadDescriptors(db, descriptors), 2);
    const senescence = getConcept(db, 'D019149');
    assert.equal(senescence.date_established, '1999-01-01');
    assert.equal(senescence.semantic_type, 'process'); // G… → physiological process
    assert.equal(getConcept(db, 'D000078790').semantic_type, 'chemical'); // D…
  });

  test('an archived release can be loaded over a current one to correct dates', () => {
    loadDescriptors(db, parseDescriptorFile(NEW_DESCRIPTOR, 2024).descriptors);
    const corrected = { ...parseDescriptorRecord(NEW_DESCRIPTOR), dateEstablished: '2019-01-01', vocabularyYear: 2019 };
    loadDescriptors(db, [corrected]);
    assert.equal(getConcept(db, 'D000078790').date_established, '2019-01-01');
    assert.equal(getConcept(db, 'D000078790').vocabulary_year, 2019);
  });
});

describe('the leakage audit — the number the benchmark must publish', () => {
  beforeEach(() => {
    loadDescriptors(db, parseDescriptorFile(`${OLD_DESCRIPTOR}${NEW_DESCRIPTOR}${ANCIENT_DESCRIPTOR}`, 2024).descriptors);
    ingestArticles(db, [
      // Clean pre-cut-off records.
      paper('FIXTURE-1', 2010, ['D019149', 'D000375']),
      paper('FIXTURE-2', 2012, ['D019149']),
      // A 2010 paper carrying a descriptor established in 2018: direct evidence
      // that NLM re-indexed it. This is the contamination being measured.
      paper('FIXTURE-3', 2010, ['D019149', 'D000078790']),
      // Post-cut-off record — not part of the pre-cut-off denominator.
      paper('FIXTURE-4', 2020, ['D000078790']),
    ], { source: 'fixture' });
  });

  test('identifies descriptors that postdate the cut-off', () => {
    const found = anachronisticConcepts(db, 2015);
    assert.equal(found.length, 1);
    assert.equal(found[0].ui, 'D000078790');
  });

  test('a descriptor with no recorded date is NOT flagged as anachronistic', () => {
    // Much of the historical core has no DateEstablished. Flagging it would make
    // the audit useless by marking most of the vocabulary suspect.
    assert.ok(!anachronisticConcepts(db, 2015).some((c) => c.ui === 'D000375'));
  });

  test('measures contamination as a rate, not just a flag', () => {
    const audit = auditVocabularyLeakage(db, 2015);
    assert.equal(audit.auditable, true);
    assert.equal(audit.contaminatedAnnotations, 1);
    assert.equal(audit.contaminatedArticles, 1);
    assert.equal(audit.preCutoffAnnotations, 5); // 2 + 1 + 2 across the three pre-2016 papers
    assert.ok(audit.leakageRate > 0 && audit.leakageRate < 1);
    assert.match(audit.statement, /direct evidence that NLM re-indexed/);
  });

  test('a clean corpus says so without hedging', () => {
    const clean = openCorpus(':memory:');
    loadDescriptors(clean, parseDescriptorFile(`${OLD_DESCRIPTOR}${ANCIENT_DESCRIPTOR}`).descriptors);
    ingestArticles(clean, [paper('FIXTURE-A', 2010, ['D019149'])], { source: 'fixture' });
    const audit = auditVocabularyLeakage(clean, 2015);
    assert.equal(audit.anachronisticConcepts, 0);
    assert.match(audit.statement, /consistent with the cut-off/);
  });
});

describe('failing closed — an unaudited corpus must not look clean', () => {
  test('reports that leakage cannot be audited when no dates are loaded', () => {
    // Concepts arrive from article annotations with no establishment dates.
    ingestArticles(db, [paper('FIXTURE-X', 2010, ['D019149', 'D000078790'])], { source: 'fixture' });
    const audit = auditVocabularyLeakage(db, 2015);
    assert.equal(audit.auditable, false);
    assert.equal(audit.dateCoverage, 0);
    assert.match(audit.statement, /CANNOT be audited/);
  });

  test('conceptsValidAt returns NOTHING rather than everything when unaudited', () => {
    ingestArticles(db, [paper('FIXTURE-X', 2010, ['D019149', 'D000078790'])], { source: 'fixture' });
    const r = conceptsValidAt(db, 2015);
    assert.equal(r.auditable, false);
    assert.deepEqual(r.concepts, [], 'failing open here would let an unaudited corpus pass as historical');
  });

  test('once dates are loaded, valid concepts are returned and the future is excluded', () => {
    loadDescriptors(db, parseDescriptorFile(`${OLD_DESCRIPTOR}${NEW_DESCRIPTOR}${ANCIENT_DESCRIPTOR}`).descriptors);
    ingestArticles(db, [paper('FIXTURE-X', 2010, ['D019149'])], { source: 'fixture' });
    const r = conceptsValidAt(db, 2015);
    assert.equal(r.auditable, true);
    assert.ok(r.concepts.includes('D019149'));
    assert.ok(r.concepts.includes('D000375'), 'undated historical descriptors remain usable');
    assert.ok(!r.concepts.includes('D000078790'), 'a 2018 descriptor cannot be used in a 2015 analysis');
  });
});

describe('benchmark target classification', () => {
  beforeEach(() => loadDescriptors(db, parseDescriptorFile(`${OLD_DESCRIPTOR}${NEW_DESCRIPTOR}${ANCIENT_DESCRIPTOR}`).descriptors));

  test('marks a target that depends on post-cut-off vocabulary', () => {
    const [clean, dirty] = classifyTargets(db, [
      { name: 'clean target', aUi: 'D019149', cUi: 'D000375' },
      { name: 'contaminated target', aUi: 'D019149', cUi: 'D000078790' },
    ], 2015);
    assert.equal(clean.contaminated, false);
    assert.equal(dirty.contaminated, true);
    assert.deepEqual(dirty.offendingConcepts, ['D000078790']);
    assert.match(dirty.note, /not counted as a clean hit/);
  });

  test('contaminated targets are marked, never dropped', () => {
    // A dropped target is indistinguishable from one that was never tried, which
    // is how a benchmark quietly becomes a selection of its own successes.
    const results = classifyTargets(db, [
      { name: 'a', aUi: 'D019149', cUi: 'D000078790' },
      { name: 'b', aUi: 'D019149', cUi: 'D000375' },
    ], 2015);
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => 'contaminated' in r));
  });

  test('checks bridge concepts too, not only the endpoints', () => {
    const [t] = classifyTargets(db, [{ name: 'x', aUi: 'D019149', cUi: 'D000375', bridgeUis: ['D000078790'] }], 2015);
    assert.equal(t.contaminated, true);
  });
});
