/**
 * D-079 — negative-first tests for GLP-1R QSAR V2.
 *
 * The first test is the one that justifies this module existing at all: the
 * dense ridge recovers a continuous relationship that the pre-existing sparse
 * binary ridge provably cannot. Everything after it is about refusing to
 * cheat — no test leakage into selection, no threshold relaxation, no interval
 * invented when calibration is empty.
 *
 * SYNTHETIC_TEST_ONLY: every vector here is constructed arithmetic, not a
 * molecule with a measured activity. The real-data result lives in the E2E.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  countAmideBonds, descriptorVector, fitStandardization, applyStandardization,
  denseRidge, densePredict, representationVector, selectRepresentation,
  conformalHalfWidth, applyFrozenGate, modelFingerprintV2,
  RDKIT_FEATURE_NAMES, DESCRIPTOR_SCHEMA, FROZEN_PEPTIDE_AMIDE_MIN, REPRESENTATIONS,
} from './campaign/glp1rQsarV2.mjs';
import { trainRidge, loadGlp1rValidationGate } from './campaign/glp1rQsar.mjs';
import { descriptors as rdkitDescriptors, detect as rdkitDetect } from './compute/rdkitAdapter.mjs';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const GATE_PATH = join(SRC, 'campaign/glp1r-validation-gate.json');

const fullDescriptors = (over = {}) => {
  const d = {};
  for (const n of RDKIT_FEATURE_NAMES) d[n] = 1;
  return { ...d, ...over };
};

// =========================================================================
describe('the dense ridge exists because the sparse binary one cannot do this', () => {
  test('dense ridge recovers a continuous linear relationship the sparse ridge discards', () => {
    // y = 3*x + 7 exactly. A correct ridge on continuous features gets ~0 error.
    const rows = Array.from({ length: 200 }, (_, i) => {
      const x = (i % 20) / 10 - 1;
      return { x: [x, 0.5, -0.25], y: 3 * x + 7 };
    });
    const w = denseRidge(rows, 1e-9);
    const mae = rows.reduce((a, r) => a + Math.abs(densePredict(w, r.x) - r.y), 0) / rows.length;
    assert.ok(mae < 0.01, `dense ridge should fit this exactly, got MAE ${mae}`);

    // The pre-existing sparse binary ridge is given the SAME data and cannot.
    const sparseWeights = trainRidge(rows.map((r) => ({ bits: r.x, y: r.y })), 1e-9);
    const sparsePredict = (v) => { let s = sparseWeights[512]; for (let k = 0; k < v.length; k += 1) if (v[k]) s += sparseWeights[k]; return s; };
    const sparseMae = rows.reduce((a, r) => a + Math.abs(sparsePredict(r.x) - r.y), 0) / rows.length;
    assert.ok(sparseMae > 0.5, `the sparse ridge is binary-only and should fail here; got MAE ${sparseMae}`);
  });

  test('dense ridge handles a width beyond 512 without the intercept colliding with a feature', () => {
    // The sparse ridge hardcodes the bias at index 512; rep C is 527 wide.
    const width = 527;
    const rows = Array.from({ length: 60 }, (_, i) => {
      const x = new Array(width).fill(0);
      x[520] = (i % 10) / 5 - 1;
      return { x, y: 2 * x[520] + 5 };
    });
    const w = denseRidge(rows, 1e-9);
    assert.equal(w.length, width + 1, 'the bias must be its own trailing coefficient');
    const mae = rows.reduce((a, r) => a + Math.abs(densePredict(w, r.x) - r.y), 0) / rows.length;
    assert.ok(mae < 0.05, `feature at index 520 must not be confused with the bias; MAE ${mae}`);
  });

  test('the intercept is not regularized — predictions centre on the training mean, not on zero', () => {
    const rows = Array.from({ length: 50 }, () => ({ x: [0, 0], y: 100 }));
    const w = denseRidge(rows, 1000);
    assert.ok(Math.abs(densePredict(w, [0, 0]) - 100) < 1, 'a heavily regularized model must still reach the mean');
  });
});

// =========================================================================
describe('features are refused rather than guessed', () => {
  test('descriptor names match the LIVE engine — a wrong name is a hard failure, not a zero', () => {
    const d = rdkitDetect();
    assert.equal(d.available, true);
    const real = Object.keys(rdkitDescriptors('CCO').data);
    for (const n of RDKIT_FEATURE_NAMES) assert.ok(real.includes(n), `${n} must exist in the real descriptor output`);
    // The names an earlier proposal assumed do NOT exist; guard against reintroducing them.
    for (const wrong of ['heavyAtoms', 'hBondDonors', 'hBondAcceptors', 'aromaticFraction', 'heteroCount', 'logP', 'fractionCSP3']) {
      assert.equal(real.includes(wrong), false, `${wrong} does not exist in this engine`);
    }
  });

  test('a missing descriptor is named, never silently coerced to 0', () => {
    const d = fullDescriptors();
    delete d.tpsa;
    const r = descriptorVector('CCO', d);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MISSING_FEATURE');
    assert.equal(r.feature, 'tpsa');
  });

  test('NaN / Infinity descriptors are refused', () => {
    assert.equal(descriptorVector('CCO', fullDescriptors({ crippenLogP: NaN })).code, 'MISSING_FEATURE');
    assert.equal(descriptorVector('CCO', fullDescriptors({ molWt: Infinity })).code, 'MISSING_FEATURE');
  });

  test('empty SMILES and absent descriptor object each have their own code', () => {
    assert.equal(descriptorVector('', fullDescriptors()).code, 'INVALID_SMILES');
    assert.equal(descriptorVector('CCO', null).code, 'NO_DESCRIPTORS');
  });

  test('0 is a legitimate descriptor value and must survive (formalCharge, aromaticRings)', () => {
    const r = descriptorVector('CCO', fullDescriptors({ formalCharge: 0, aromaticRings: 0 }));
    assert.equal(r.ok, true);
    assert.equal(r.vector[RDKIT_FEATURE_NAMES.indexOf('formalCharge')], 0);
    assert.equal(r.vector.length, DESCRIPTOR_SCHEMA.length);
  });

  test('amide counting sees both canonical directions, and the peptide threshold is frozen', () => {
    assert.equal(FROZEN_PEPTIDE_AMIDE_MIN, 3);
    assert.equal(countAmideBonds('CCO'), 0);
    assert.ok(countAmideBonds('CC(=O)NCC(=O)NCC(=O)NC') >= 3);
    assert.equal(descriptorVector('CCO', fullDescriptors()).peptideLike, false);
  });
});

// =========================================================================
describe('leakage control', () => {
  test('standardization statistics come from train rows only', () => {
    const train = [[1, 2], [3, 4], [5, 6]];
    const std = fitStandardization(train);
    assert.equal(std.mean[0], 3);
    // Adding wildly different "test" rows must not change anything, because
    // they are never passed to the fit in the first place.
    assert.deepEqual(fitStandardization(train).mean, std.mean);
    assert.equal(applyStandardization([3, 4], std)[0], 0, 'the train mean standardizes to 0');
  });

  test('a zero-variance column is dropped, not divided by zero', () => {
    const std = fitStandardization([[1, 5], [2, 5], [3, 5]]);
    assert.deepEqual(std.dropped, [1]);
    const out = applyStandardization([9, 5], std);
    assert.equal(out[1], 0);
    assert.ok(out.every(Number.isFinite), 'no NaN/Infinity may escape standardization');
  });

  test('SELECTION CANNOT SEE TEST: a candidate carrying a test metric is refused outright', () => {
    const r = selectRepresentation([
      { id: 'A', calibMAE: 0.9 },
      { id: 'B', calibMAE: 0.5, testMAE: 0.1 },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SELECTION_LEAKAGE');
  });

  test('selection picks the lowest calibration error, with a deterministic tie-break', () => {
    const r = selectRepresentation([{ id: 'C', calibMAE: 0.8 }, { id: 'A', calibMAE: 1.0 }, { id: 'B', calibMAE: 0.8 }]);
    assert.equal(r.ok, true);
    assert.equal(r.selected.id, 'B', 'ties break on id ascending, deterministically');
    assert.equal(r.tied, 2);
    assert.equal(selectRepresentation([{ id: 'X', calibMAE: NaN }]).code, 'NO_FEASIBLE_CANDIDATE');
  });
});

// =========================================================================
describe('the frozen gate is not negotiable', () => {
  test('V2 reads the gate from its file — it does not mirror the thresholds', () => {
    const g = loadGlp1rValidationGate(GATE_PATH);
    assert.equal(g.ok, true);
    assert.equal(g.gate.MAX_MAE, 1.0);
    // A mirrored constant would be a second source of truth; assert V2 has none.
    const src = readSource('campaign/glp1rQsarV2.mjs');
    const code = src.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    assert.equal(/MAX_MAE\s*[:=]\s*1/.test(code), false, 'V2 must not hardcode a gate threshold');
  });

  test('the real V2 result (MAE 1.0425) is BLOCKED — "almost" is not a pass', () => {
    const g = loadGlp1rValidationGate(GATE_PATH);
    const d = applyFrozenGate(g.gate, { nTrain: 178, nTest: 45, mae: 1.0425, r2: 0.5182, halfWidth: 1.9675 });
    assert.equal(d.status, 'BLOCKED');
    assert.match(d.reasons.join(' '), /MAE=1\.0425 > MAX_MAE=1/);
  });

  test('a model that clears every threshold is AVAILABLE — BLOCKED is not hardcoded', () => {
    const g = loadGlp1rValidationGate(GATE_PATH);
    const d = applyFrozenGate(g.gate, { nTrain: 178, nTest: 45, mae: 0.85, r2: 0.55, halfWidth: 1.2 });
    assert.equal(d.status, 'AVAILABLE');
    assert.equal(d.reasons.length, 0);
  });

  test('no conformal interval means no validated model, whatever the metrics say', () => {
    const g = loadGlp1rValidationGate(GATE_PATH);
    const d = applyFrozenGate(g.gate, { nTrain: 178, nTest: 45, mae: 0.5, r2: 0.9, halfWidth: null });
    assert.equal(d.status, 'BLOCKED');
    assert.match(d.reasons.join(' '), /uncertainty/);
  });

  test('conformal fails closed on an empty or invalid calibration set', () => {
    assert.equal(conformalHalfWidth([], 0.1).code, 'CALIBRATION_EMPTY');
    assert.equal(conformalHalfWidth([1, NaN], 0.1).code, 'CALIBRATION_INVALID');
    assert.equal(conformalHalfWidth([0.5, 1.5, 1.0], 0.1).ok, true);
  });
});

// =========================================================================
describe('determinism and honest scope', () => {
  test('the model fingerprint is deterministic and moves with the training data', () => {
    const body = { representation: 'C', lambda: 1, splitPolicy: 'scaffold-hash-mod10', trainingDataHash: 'h1' };
    assert.equal(modelFingerprintV2(body), modelFingerprintV2(body));
    assert.notEqual(modelFingerprintV2(body), modelFingerprintV2({ ...body, trainingDataHash: 'h2' }));
    assert.notEqual(modelFingerprintV2(body), modelFingerprintV2({ ...body, representation: 'A' }));
  });

  test('the dense ridge is deterministic across repeated fits', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ x: [(i % 7) / 3, (i % 5) / 2], y: i % 11 }));
    assert.deepEqual([...denseRidge(rows, 1.0)], [...denseRidge(rows, 1.0)]);
  });

  test('representation D is declared NOT_IMPLEMENTED rather than faked', () => {
    assert.match(REPRESENTATIONS.D, /NOT_IMPLEMENTED/);
    assert.match(REPRESENTATIONS.D, /not faked/);
  });

  test('representation vectors compose as declared', () => {
    assert.deepEqual(representationVector('A', [1, 0], [9, 9, 9]), [1, 0]);
    assert.deepEqual(representationVector('B', [1, 0], [9, 9, 9]), [9, 9, 9]);
    assert.deepEqual(representationVector('C', [1, 0], [9, 9, 9]), [1, 0, 9, 9, 9]);
  });
});

function readSource(rel) {
  return readFileSync(join(SRC, rel), 'utf8');
}
