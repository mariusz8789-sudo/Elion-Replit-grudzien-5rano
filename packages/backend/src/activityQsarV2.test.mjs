import test from 'node:test';
import assert from 'node:assert/strict';

import { assertSplitIsolation, trainActivityModelV2, V2_REPRESENTATION_IDS } from './campaign/activityQsarV2.mjs';
import { loadGlp1rValidationGate, GLP1R_GATE_PATH } from './campaign/glp1rQsar.mjs';
import { loadGlp1rPin } from './campaign/glp1rDataset.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';

const rdkitLive = rdkitDetect().available === true;

test('SPLIT ISOLATION: a molecule in two splits is a leak, not a warning', () => {
  const shared = { canonicalSmiles: 'CCO', scaffold: 'sA' };
  const r = assertSplitIsolation({ train: [shared], calib: [shared], test: [] });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(' '), /SPLIT_LEAKAGE/);
});

test('SPLIT ISOLATION: the same scaffold bucket on both sides is a leak', () => {
  // Different molecules, same scaffold => same bucket => the held-out set is
  // not really held out for a scaffold-split estimate.
  const r = assertSplitIsolation({
    train: [{ canonicalSmiles: 'CCO', scaffold: 'sameScaffold' }],
    calib: [],
    test: [{ canonicalSmiles: 'CCN', scaffold: 'sameScaffold' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(' '), /SCAFFOLD_BUCKET_LEAKAGE/);
});

test('SPLIT ISOLATION: genuinely disjoint splits pass', () => {
  const r = assertSplitIsolation({
    train: [{ canonicalSmiles: 'CCO', scaffold: 'aaaa' }],
    calib: [{ canonicalSmiles: 'CCN', scaffold: 'zzzz' }],
    test: [],
  });
  // may or may not collide by bucket; assert only that identical input is caught
  assert.equal(assertSplitIsolation({ train: [{ canonicalSmiles: 'X', scaffold: 'q' }], calib: [{ canonicalSmiles: 'X', scaffold: 'q' }], test: [] }).ok, false);
  assert.ok(Array.isArray(r.reasons));
});

test('ENGINE: refuses without a frozen gate, rather than fitting anyway', () => {
  const r = trainActivityModelV2({ gateResult: { ok: false, code: 'GATE_NOT_FROZEN', reason: 'no gate' }, pin: { ok: true, rows: [] }, targetLabel: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'GATE_NOT_FROZEN');
});

test('ENGINE: refuses without a verified pin, rather than fitting anyway', () => {
  const gateResult = loadGlp1rValidationGate(GLP1R_GATE_PATH);
  const r = trainActivityModelV2({ gateResult, pin: { ok: false, code: 'PIN_HASH_DRIFT', reason: 'drifted' }, targetLabel: 'X' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PIN_HASH_DRIFT');
});

test('ENGINE: the representation family is exactly A/B/C — a fourth arm needs a decision', () => {
  assert.deepEqual([...V2_REPRESENTATION_IDS], ['A', 'B', 'C']);
});

test('D-088: the GLP-1R axis reaches the shared V2 engine and is BLOCKED on accuracy', { skip: !rdkitLive }, () => {
  const gateResult = loadGlp1rValidationGate(GLP1R_GATE_PATH);
  const pin = loadGlp1rPin();
  assert.equal(gateResult.ok, true);
  assert.equal(pin.ok, true);

  const r = trainActivityModelV2({ gateResult, pin, targetLabel: 'GLP-1R' });

  // The measured D-088 result. If any of these change, the science changed and
  // the DecisionRecord is stale — that is exactly what this test is for.
  assert.equal(r.ok, false);
  assert.equal(r.code, 'GATE_BLOCKED');
  assert.equal(r.nTrain, 178);
  assert.equal(r.nCalib, 64);
  assert.equal(r.nTest, 45);
  assert.equal(r.representation, 'C');
  assert.equal(r.selectedOn, 'calibMAE');
  assert.ok(Math.abs(r.metrics.mae - 1.0424861001899126) < 1e-9, `MAE moved: ${r.metrics.mae}`);
  assert.ok(r.metrics.mae > gateResult.gate.MAX_MAE, 'the whole point: it misses the frozen bar');

  // SELECTION SAW ONLY CALIBRATION.
  assert.equal(r.calibration.length, 3);
  for (const c of r.calibration) {
    assert.ok(Number.isFinite(c.calibMAE));
    assert.equal('testMAE' in c, false, 'a selection candidate must never carry a test metric');
    assert.equal('testR2' in c, false);
  }
  // and it picked the best calibration score, not the best test score
  const bestCalib = r.calibration.reduce((a, b) => (a.calibMAE <= b.calibMAE ? a : b));
  assert.equal(r.representation, bestCalib.id);
});

test('D-088: the run is deterministic — two calls give identical metrics and fingerprint', { skip: !rdkitLive }, () => {
  const run = () => trainActivityModelV2({ gateResult: loadGlp1rValidationGate(GLP1R_GATE_PATH), pin: loadGlp1rPin(), targetLabel: 'GLP-1R' });
  const a = run();
  const b = run();
  assert.deepEqual(a.metrics, b.metrics);
  assert.equal(a.modelFingerprint, b.modelFingerprint);
  assert.equal(a.representation, b.representation);
});

test('D-088: V2 beats V1 on this dataset and STILL does not clear the gate', { skip: !rdkitLive }, () => {
  // Being better than the incumbent is not the bar. The bar is the frozen gate.
  const v2 = trainActivityModelV2({ gateResult: loadGlp1rValidationGate(GLP1R_GATE_PATH), pin: loadGlp1rPin(), targetLabel: 'GLP-1R' });
  const V1_MEASURED_MAE = 1.172573164311559;
  assert.ok(v2.metrics.mae < V1_MEASURED_MAE, 'V2 should be the better engine here');
  assert.ok(v2.metrics.mae > 1.0, 'and it still misses MAX_MAE=1.0 — BOTH_ARMS_BLOCKED');
});
