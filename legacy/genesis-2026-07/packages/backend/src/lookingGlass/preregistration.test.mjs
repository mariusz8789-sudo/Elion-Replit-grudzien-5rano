import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openCorpus, ingestArticles } from './store.mjs';
import {
  fingerprintTargets, parsePreregistration, verifyPreregistration, earliestIngest,
} from './preregistration.mjs';

/**
 * Benchmark pre-registration.
 *
 * The harness used to accept any string as a pre-registration reference, which
 * made the strongest control in the whole protocol into a comment. These tests
 * pin the version with teeth: the target list is fingerprinted, and a run whose
 * targets differ from the registered ones is refused rather than footnoted.
 *
 * They also pin what the module CANNOT do. `registeredAt` is self-reported and
 * can be backdated; comparing it against the corpus's ingest timestamps catches
 * carelessness, not fraud. The statement the module emits says so, and a test
 * below asserts that it says so — because a control that overstates itself is
 * worse than no control.
 */

const TARGETS = [
  { name: 'partial reprogramming → age-associated phenotypes', aUi: 'D000001', cUi: 'D000002', publishedYear: 2016, expectedBridgeUis: ['D000003'] },
  { name: 'senescent cell clearance → healthspan', aUi: 'D000004', cUi: 'D000005', publishedYear: 2016 },
];

const DOCUMENT = JSON.stringify({
  ref: 'git:abc1234 docs/preregistration-2015.json',
  cutoffYear: 2015,
  registeredAt: 1000,
  targets: TARGETS,
  parameters: { minLinkNpmi: 0.15, nullControls: 20 },
  note: 'Fixture. Not a real pre-registration.',
});

let db;
beforeEach(() => {
  db = openCorpus(':memory:');
  ingestArticles(db, [{ id: 'FIXTURE-1', year: 2010, title: 'x', concepts: [{ ui: 'D000001', name: 'a' }] }], { source: 'fixture', now: 5000 });
});

describe('fingerprinting a target set', () => {
  test('is independent of the order targets are listed in', () => {
    // Order carries no meaning, and making it significant would produce false
    // alarms that train people to ignore the check.
    assert.equal(fingerprintTargets(TARGETS), fingerprintTargets([...TARGETS].reverse()));
  });

  test('ignores commentary fields', () => {
    const annotated = TARGETS.map((t) => ({ ...t, rationale: 'added later', citation: 'doi:…' }));
    assert.equal(fingerprintTargets(annotated), fingerprintTargets(TARGETS));
  });

  test('changes when a target is added, removed or renamed', () => {
    const base = fingerprintTargets(TARGETS);
    assert.notEqual(base, fingerprintTargets(TARGETS.slice(0, 1)));
    assert.notEqual(base, fingerprintTargets([...TARGETS, { name: 'extra', aUi: 'D9', cUi: 'D8' }]));
    // A rename is a different claim even when the pair is identical.
    assert.notEqual(base, fingerprintTargets([{ ...TARGETS[0], name: 'renamed' }, TARGETS[1]]));
  });

  test('changes when the expected mechanism changes', () => {
    // Swapping the expected bridge changes what counts as finding it for the
    // right reason, which is the part of the benchmark that carries meaning.
    const swapped = [{ ...TARGETS[0], expectedBridgeUis: ['D999999'] }, TARGETS[1]];
    assert.notEqual(fingerprintTargets(TARGETS), fingerprintTargets(swapped));
  });

  test('treats bridgeUis and expectedBridgeUis as the same field', () => {
    const other = [{ ...TARGETS[0], expectedBridgeUis: undefined, bridgeUis: ['D000003'] }, TARGETS[1]];
    assert.equal(fingerprintTargets(TARGETS), fingerprintTargets(other));
  });
});

describe('reading a pre-registration', () => {
  test('parses the document and hashes it', () => {
    const p = parsePreregistration(DOCUMENT);
    assert.equal(p.cutoffYear, 2015);
    assert.equal(p.targets.length, 2);
    assert.match(p.sha256, /^[0-9a-f]{64}$/);
    assert.equal(p.fingerprint, fingerprintTargets(TARGETS));
    assert.equal(p.ref, 'git:abc1234 docs/preregistration-2015.json');
  });

  test('refuses a document it cannot fully validate', () => {
    // A half-understood pre-registration is worse than none: it still looks
    // like a control.
    assert.throws(() => parsePreregistration('{'), /not valid JSON/);
    assert.throws(() => parsePreregistration('{"registeredAt":1,"targets":[{"name":"a","aUi":"x","cUi":"y"}]}'), /cutoffYear/);
    assert.throws(() => parsePreregistration('{"cutoffYear":2015,"targets":[{"name":"a","aUi":"x","cUi":"y"}]}'), /registeredAt/);
    assert.throws(() => parsePreregistration('{"cutoffYear":2015,"registeredAt":1,"targets":[]}'), /registers nothing/);
    assert.throws(() => parsePreregistration('{"cutoffYear":2015,"registeredAt":1,"targets":[{"aUi":"x"}]}'), /target 0 is missing/);
  });
});

describe('verifying a run against it', () => {
  test('accepts the registered list', () => {
    const result = verifyPreregistration(db, parsePreregistration(DOCUMENT), { targets: TARGETS, cutoffYear: 2015 });
    assert.equal(result.targets, 2);
    assert.equal(result.orderingOk, true);
    assert.match(result.statement, /fingerprint/);
  });

  test('refuses a target added after registration, and names it', () => {
    // The failure this module exists for: one extra target, chosen because it
    // happened to rank well, invisible in the report.
    assert.throws(
      () => verifyPreregistration(db, parsePreregistration(DOCUMENT), {
        targets: [...TARGETS, { name: 'lucky find', aUi: 'D000009', cUi: 'D000010' }], cutoffYear: 2015,
      }),
      /Added: D000009→D000010/,
    );
  });

  test('refuses a target dropped after registration, and names it', () => {
    assert.throws(
      () => verifyPreregistration(db, parsePreregistration(DOCUMENT), { targets: TARGETS.slice(0, 1), cutoffYear: 2015 }),
      /Removed: D000004→D000005/,
    );
  });

  test('refuses a silent change to a target that keeps the same pair', () => {
    const edited = [{ ...TARGETS[0], expectedBridgeUis: ['D000099'] }, TARGETS[1]];
    assert.throws(
      () => verifyPreregistration(db, parsePreregistration(DOCUMENT), { targets: edited, cutoffYear: 2015 }),
      /pairs are the same but a name, publication year or expected bridge differs/,
    );
  });

  test('refuses a cut-off moved after registration', () => {
    // Moving the cut-off changes which discoveries are held out, which is the
    // same manipulation as editing the target list.
    assert.throws(
      () => verifyPreregistration(db, parsePreregistration(DOCUMENT), { targets: TARGETS, cutoffYear: 2013 }),
      /the run uses cut-off 2013 but the pre-registration fixed 2015/,
    );
  });
});

describe('the ordering check, and its honest limits', () => {
  test('flags a pre-registration written after the corpus was built', () => {
    const late = JSON.parse(DOCUMENT);
    late.registeredAt = 9000; // corpus ingested at 5000
    const result = verifyPreregistration(db, parsePreregistration(JSON.stringify(late)), { targets: TARGETS, cutoffYear: 2015 });
    assert.equal(result.orderingOk, false);
    assert.match(result.statement, /WARNING/);
    assert.match(result.statement, /labelled post-hoc/);
  });

  test('does not claim more than a self-reported timestamp can support', () => {
    // The check catches carelessness, not backdating. Saying so in the report is
    // the difference between a control and a claim.
    const result = verifyPreregistration(db, parsePreregistration(DOCUMENT), { targets: TARGETS, cutoffYear: 2015 });
    assert.match(result.statement, /does not prove it/);
    assert.match(result.statement, /cite the git commit/);
  });

  test('an empty corpus raises no ordering question', () => {
    const empty = openCorpus(':memory:');
    assert.equal(earliestIngest(empty), null);
    assert.equal(verifyPreregistration(empty, parsePreregistration(DOCUMENT), { targets: TARGETS, cutoffYear: 2015 }).orderingOk, true);
  });
});
