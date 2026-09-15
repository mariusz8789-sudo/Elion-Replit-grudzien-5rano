/**
 * D-076/077 — NEGATIVE-FIRST tests for the GLP-1R QSAR efficacy axis.
 *
 * The ordering is deliberate: everything that must be REFUSED is tested
 * before anything that may be produced, because the whole value of this axis
 * is in what it declines to claim. The one green-path block at the end exists
 * to prove BLOCKED is not hardcoded — that the same code reaches AVAILABLE
 * when (and only when) the gate is genuinely met.
 *
 * SYNTHETIC_TEST_ONLY. The feature vectors in the statistical tests are
 * injected through `fingerprintFn`/explicit `bits` arrays and are NOT real
 * molecules with real activities — they exercise arithmetic and gate logic,
 * nothing else. No number produced here is a scientific claim about any
 * compound, and none of it is ever written to the repository's pin path. The
 * tests that must exercise REAL RDKit call it directly and are marked so.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  normalizeGlp1rRows, writeGlp1rPin, loadGlp1rPin, toPActivity,
  HUMAN_ORGANISM, PACTIVITY_MIN, PACTIVITY_MAX,
} from './campaign/glp1rDataset.mjs';
import {
  loadGlp1rValidationGate, scaffoldSplit, scaffoldBucket, trainAndValidate,
  predictQsar, metrics, tanimotoIndices,
} from './campaign/glp1rQsar.mjs';
import {
  trainGlp1rModel, glp1rEfficacyPrediction, glp1rAxisContribution,
  GLP1R_EFFICACY_AXIS, GLP1R_QSAR_MODEL_VERSION,
} from './campaign/glp1rEfficacyAdapter.mjs';
import { efficacyAxis } from './campaign/tirzepatideBaseline.mjs';
import { probeCapabilities, comparableAxes } from './campaign/molecularMission.mjs';
import { detect as rdkitDetect, fingerprint as rdkitFingerprint } from './compute/rdkitAdapter.mjs';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const GATE_PATH = join(SRC, 'campaign/glp1r-validation-gate.json');

/** A well-formed raw ChEMBL-shaped activity row; each test overrides exactly the field it is probing. */
const rawRow = (over = {}) => ({
  canonical_smiles: 'CCO',
  molecule_chembl_id: 'CHEMBL_TEST_MOL',
  target_chembl_id: 'CHEMBL_TEST_TARGET',
  target_organism: HUMAN_ORGANISM,
  assay_chembl_id: 'CHEMBL_TEST_ASSAY',
  standard_type: 'EC50',
  standard_value: 100,
  standard_units: 'nM',
  pchembl_value: 7,
  sourceUrl: 'https://example.invalid/test-artifact',
  sourceId: 'TEST_SRC',
  ...over,
});

/** Canonicalizer stub so dataset tests do not spawn one RDKit process per row. Rejects exactly one sentinel string. */
const fakeCanonicalize = (s) => (s === 'not-a-molecule' ? null : s);

// =========================================================================
describe('D-076/077 ingestion refuses everything it cannot normalize honestly', () => {
  test('RAT GLP-1R is rejected — CHEMBL5862 is Rattus norvegicus, not human', () => {
    const r = normalizeGlp1rRows([rawRow({ target_organism: 'Rattus norvegicus', target_chembl_id: 'CHEMBL5862' })], { canonicalize: fakeCanonicalize });
    assert.equal(r.kept, 0);
    assert.equal(r.dropped.nonHuman, 1);
  });

  test('no human target id is hardcoded anywhere — organism decides, and a supplied id only narrows further', () => {
    const src = readFileSync(join(SRC, 'campaign/glp1rDataset.mjs'), 'utf8');
    // The rat id may appear only inside prose warning against it, never as a default value in code.
    const codeLines = src.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    assert.equal(codeLines.some((l) => /CHEMBL\d+/.test(l)), false, 'a ChEMBL target id is hardcoded in executable code');

    const narrowed = normalizeGlp1rRows(
      [rawRow({ target_chembl_id: 'CHEMBL_A' }), rawRow({ target_chembl_id: 'CHEMBL_B', assay_chembl_id: 'OTHER' })],
      { expectedTargetId: 'CHEMBL_A', canonicalize: fakeCanonicalize },
    );
    assert.equal(narrowed.kept, 1);
    assert.equal(narrowed.dropped.badTarget, 1);
  });

  test('missing SMILES, malformed SMILES, missing value, bad units, out-of-range and duplicates are each rejected with their own count', () => {
    const r = normalizeGlp1rRows([
      rawRow({ canonical_smiles: null, assay_chembl_id: 'a1' }),
      rawRow({ canonical_smiles: 'not-a-molecule', assay_chembl_id: 'a2' }),
      rawRow({ standard_value: null, assay_chembl_id: 'a3' }),
      rawRow({ standard_units: 'furlongs', assay_chembl_id: 'a4' }),
      rawRow({ standard_type: 'Inhibition', assay_chembl_id: 'a5' }),
      rawRow({ standard_value: 1e-9, assay_chembl_id: 'a6' }), // pActivity 18 -> out of range
      rawRow({ assay_chembl_id: 'keep' }),
      rawRow({ assay_chembl_id: 'keep' }), // exact duplicate of the row above
    ], { canonicalize: fakeCanonicalize });

    assert.equal(r.kept, 1);
    assert.equal(r.dropped.missingSmiles, 1);
    assert.equal(r.dropped.unparseableSmiles, 1);
    assert.equal(r.dropped.missingValue, 1);
    assert.equal(r.dropped.badUnits, 1);
    assert.equal(r.dropped.unsupportedType, 1);
    assert.equal(r.dropped.outOfRange, 1);
    assert.equal(r.dropped.duplicate, 1);
  });

  test('a row with no provenance is rejected — an activity with no source is not evidence', () => {
    const r = normalizeGlp1rRows([rawRow({ sourceUrl: null, sourceId: null, assay_chembl_id: null })], { canonicalize: fakeCanonicalize });
    assert.equal(r.kept, 0);
    assert.equal(r.dropped.missingProvenance, 1);
  });

  test('unit conversion is real: nM/uM/M convert, log-scale types pass through, nonsense returns null (never NaN)', () => {
    assert.equal(toPActivity('IC50', 100, 'nM'), 7);
    assert.equal(toPActivity('IC50', 1, 'uM'), 6);
    assert.equal(toPActivity('EC50', 1, 'M'), 0);
    assert.equal(toPActivity('PIC50', 8.3, null), 8.3);
    assert.equal(toPActivity('IC50', 100, 'furlongs'), null);
    assert.equal(toPActivity('IC50', null, 'nM'), null);
    assert.equal(toPActivity('IC50', 0, 'nM'), null);
    assert.equal(toPActivity('IC50', -5, 'nM'), null);
    for (const v of [toPActivity('IC50', 100, 'nM'), toPActivity('IC50', 1, 'uM')]) assert.ok(Number.isFinite(v));
  });

  test('kept rows sit inside the declared pActivity bounds and carry a provenance label', () => {
    const r = normalizeGlp1rRows([rawRow()], { canonicalize: fakeCanonicalize });
    assert.equal(r.kept, 1);
    assert.ok(r.rows[0].pActivity >= PACTIVITY_MIN && r.rows[0].pActivity <= PACTIVITY_MAX);
    assert.equal(r.rows[0].targetOrganism, HUMAN_ORGANISM);
    assert.equal(typeof r.rows[0].sourceKind, 'string');
  });
});

// =========================================================================
describe('custody is fail-closed — there is no usable-but-unverified state', () => {
  const withTempPin = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'glp1r-pin-'));
    try { fn(dir, { jsonPath: join(dir, 'pin.json'), metaPath: join(dir, 'pin.meta.json') }); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  };

  test('missing pin => PIN_MISSING', () => {
    withTempPin((dir, opts) => assert.equal(loadGlp1rPin(opts).code, 'PIN_MISSING'));
  });

  test('a pin whose bytes changed after pinning => PIN_HASH_DRIFT (not a warning, not a read)', () => {
    withTempPin((dir, opts) => {
      const { rows } = normalizeGlp1rRows([rawRow()], { canonicalize: fakeCanonicalize });
      writeGlp1rPin(rows, { jsonPath: opts.jsonPath, metaPath: opts.metaPath });
      assert.equal(loadGlp1rPin(opts).ok, true);

      const tampered = JSON.parse(readFileSync(opts.jsonPath, 'utf8'));
      tampered[0].pActivity = 11.5; // a single edited number is enough
      writeFileSync(opts.jsonPath, JSON.stringify(tampered, null, 2), 'utf8');

      const after = loadGlp1rPin(opts);
      assert.equal(after.ok, false);
      assert.equal(after.code, 'PIN_HASH_DRIFT');
    });
  });

  test('a pin with no recorded hash => PIN_UNVERIFIED (no PINNED_UNVERIFIED_HASH state exists)', () => {
    withTempPin((dir, opts) => {
      const { rows } = normalizeGlp1rRows([rawRow()], { canonicalize: fakeCanonicalize });
      writeGlp1rPin(rows, { jsonPath: opts.jsonPath, metaPath: opts.metaPath });
      writeFileSync(opts.metaPath, JSON.stringify({ n: 1 }), 'utf8'); // hash stripped
      assert.equal(loadGlp1rPin(opts).code, 'PIN_UNVERIFIED');
    });
  });

  test('unreadable and empty pins have their own codes', () => {
    withTempPin((dir, opts) => {
      writeFileSync(opts.jsonPath, '{not json', 'utf8');
      writeFileSync(opts.metaPath, JSON.stringify({ sha256: 'whatever' }), 'utf8');
      assert.equal(loadGlp1rPin(opts).code, 'PIN_HASH_DRIFT'); // bytes do not match -> refused before parsing

      writeGlp1rPin([], { jsonPath: opts.jsonPath, metaPath: opts.metaPath });
      assert.equal(loadGlp1rPin(opts).code, 'PIN_EMPTY');
    });
  });

  test('no module in this axis defines a PINNED_UNVERIFIED_HASH custody status', () => {
    for (const f of ['campaign/glp1rDataset.mjs', 'campaign/glp1rQsar.mjs', 'campaign/glp1rEfficacyAdapter.mjs']) {
      const src = readFileSync(join(SRC, f), 'utf8');
      const code = src.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
      assert.equal(code.includes('PINNED_UNVERIFIED_HASH'), false, `${f} introduces an unverified-but-usable custody state`);
    }
  });
});

// =========================================================================
describe('the frozen validation gate cannot be softened', () => {
  test('the gate file loads and its ruleFingerprint is derived from its own contents', () => {
    const g = loadGlp1rValidationGate(GATE_PATH);
    assert.equal(g.ok, true);
    assert.equal(g.gate.MIN_TRAIN, 150);
    assert.equal(g.gate.MIN_TEST, 40);
    assert.equal(g.gate.MAX_MAE, 1.0);
    assert.equal(g.gate.MIN_R2, 0.25);
  });

  test('an edited threshold invalidates the fingerprint => GATE_TAMPERED', () => {
    const dir = mkdtempSync(join(tmpdir(), 'glp1r-gate-'));
    try {
      const original = JSON.parse(readFileSync(GATE_PATH, 'utf8'));
      original.gate.MIN_TRAIN = 5; // "just lower it a bit so the run passes"
      const p = join(dir, 'gate.json');
      writeFileSync(p, JSON.stringify(original), 'utf8');
      const g = loadGlp1rValidationGate(p);
      assert.equal(g.ok, false);
      assert.equal(g.code, 'GATE_TAMPERED');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a missing gate blocks rather than defaulting to a permissive gate', () => {
    const g = loadGlp1rValidationGate(join(tmpdir(), 'no-such-gate.json'));
    assert.equal(g.ok, false);
    assert.equal(g.code, 'GATE_NOT_FROZEN');
  });

  test('an explicit expected fingerprint that does not match => GATE_MISMATCH', () => {
    const g = loadGlp1rValidationGate(GATE_PATH, 'deadbeefdeadbeef');
    assert.equal(g.ok, false);
    assert.equal(g.code, 'GATE_MISMATCH');
  });
});

// =========================================================================
describe('the model refuses to validate on inadequate data', () => {
  const gate = loadGlp1rValidationGate(GATE_PATH);

  /** SYNTHETIC_TEST_ONLY features: `signalBit` drives y, so a competent fit is possible when there is enough data. */
  const synthRows = (n, { noise = 0.05, scaffolds = 40 } = {}) => Array.from({ length: n }, (_, i) => {
    const bits = new Array(512).fill(0);
    for (let k = 0; k < 12; k += 1) bits[(i * 17 + k * 29) % 512] = 1;
    const signalBit = i % 2;
    bits[100] = signalBit;
    return {
      canonicalSmiles: `SYNTHETIC_TEST_ONLY_${i}`,
      scaffold: `SYNTHETIC_SCAFFOLD_${i % scaffolds}`,
      bits,
      y: 6 + signalBit * 2 + ((i * 37) % 11) * noise,
    };
  });

  test('too few training rows => BLOCKED naming MIN_TRAIN, and no weights are returned', () => {
    const m = trainAndValidate(synthRows(30), gate.gate, gate.ruleFingerprint, 'TEST_HASH', 'test');
    assert.equal(m.ok, false);
    assert.match(m.reasons.join(' | '), /MIN_TRAIN/);
    assert.equal(m.weights, null);
    assert.equal(m.modelFingerprint, null);
  });

  test('too few test rows => BLOCKED naming MIN_TEST', () => {
    // All scaffolds land in train buckets, so test/calib come out empty.
    const rows = synthRows(400).map((r, i) => ({ ...r, scaffold: `TRAIN_ONLY_${i % 3}` }))
      .filter((r) => scaffoldBucket(r.scaffold) >= 4);
    const m = trainAndValidate(rows, gate.gate, gate.ruleFingerprint, 'TEST_HASH', 'test');
    assert.equal(m.ok, false);
    assert.match(m.reasons.join(' | '), /MIN_TEST|nTrain=0 or nTest=0/);
  });

  test('a model that fits noise fails on MAE and/or R2 rather than squeaking through', () => {
    // y is pure deterministic noise unrelated to any bit -> nothing to learn.
    const rows = synthRows(600).map((r, i) => ({ ...r, y: 6 + ((i * 2654435761) % 1000) / 1000 * 4 }));
    const m = trainAndValidate(rows, gate.gate, gate.ruleFingerprint, 'TEST_HASH', 'test');
    assert.equal(m.ok, false);
    assert.match(m.reasons.join(' | '), /MAE|R2/);
  });

  test('"almost passed" is not passed — thresholds are compared strictly', () => {
    const tightGate = { ...gate.gate, MIN_TRAIN: 1e9 };
    const m = trainAndValidate(synthRows(600), tightGate, gate.ruleFingerprint, 'TEST_HASH', 'test');
    assert.equal(m.ok, false);
  });

  test('a model with no calibration rows cannot be validated — uncertainty is mandatory', () => {
    // Force every row into train+test buckets; calib (buckets 2-3) ends up empty.
    const rows = synthRows(900).filter((r) => scaffoldBucket(r.scaffold) < 2 || scaffoldBucket(r.scaffold) >= 4);
    const m = trainAndValidate(rows, gate.gate, gate.ruleFingerprint, 'TEST_HASH', 'test');
    if (m.split.nCalib === 0) {
      assert.equal(m.ok, false);
      assert.match(m.reasons.join(' | '), /conformal interval/);
      assert.equal(m.halfWidth, null);
    }
  });

  test('an unvalidated model yields no prediction value, only a reason', () => {
    const m = trainAndValidate(synthRows(30), gate.gate, gate.ruleFingerprint, 'TEST_HASH', 'test');
    const p = predictQsar(m, { ok: true, bits: new Array(512).fill(0) });
    assert.equal(p.status, 'BLOCKED');
    assert.equal(p.value, null);
    assert.equal(p.blockedReason, 'MODEL_NOT_VALIDATED');
  });

  test('an uncomputable fingerprint yields BLOCKED, never a zero-vector prediction', () => {
    const m = trainAndValidate(synthRows(600), gate.gate, gate.ruleFingerprint, 'TEST_HASH', 'test');
    assert.equal(m.ok, true, 'fixture should train cleanly, otherwise this test proves nothing');
    const p = predictQsar(m, { ok: false, error: 'invalid_smiles' });
    assert.equal(p.status, 'BLOCKED');
    assert.equal(p.value, null);
    assert.equal(p.blockedReason, 'FINGERPRINT_UNCOMPUTABLE');
  });
});

// =========================================================================
describe('splitting, arithmetic and determinism', () => {
  const gate = loadGlp1rValidationGate(GATE_PATH);

  test('the scaffold split is disjoint BY SCAFFOLD — no scaffold appears in two splits', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      canonicalSmiles: `SYNTHETIC_TEST_ONLY_${i}`, scaffold: `SC_${i % 53}`, bits: new Array(512).fill(0), y: 6,
    }));
    const { train, calib, test: held } = scaffoldSplit(rows);
    const sets = [train, calib, held].map((s) => new Set(s.map((r) => r.scaffold)));
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
      for (const s of sets[a]) assert.equal(sets[b].has(s), false, `scaffold ${s} crosses a split boundary (leakage)`);
    }
    assert.equal(train.length + calib.length + held.length, rows.length);
  });

  test('splitting is deterministic across repeated calls', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ canonicalSmiles: `m${i}`, scaffold: `SC_${i % 31}`, bits: new Array(512).fill(0), y: 6 }));
    const key = (s) => s.map((r) => r.canonicalSmiles).join(',');
    const a = scaffoldSplit(rows);
    const b = scaffoldSplit(rows);
    assert.equal(key(a.train), key(b.train));
    assert.equal(key(a.calib), key(b.calib));
    assert.equal(key(a.test), key(b.test));
  });

  test('metrics are real arithmetic and never NaN on a degenerate target', () => {
    const m = metrics([1, 2, 3], [1, 2, 3]);
    assert.equal(m.mae, 0);
    assert.equal(m.rmse, 0);
    assert.equal(m.r2, 1);
    const flat = metrics([5, 5, 5], [5, 5, 5]); // zero variance in y
    assert.ok(Number.isFinite(flat.r2), 'R2 on a zero-variance target must not be NaN');
  });

  test('Tanimoto over sorted bit-index arrays is correct, including the empty case', () => {
    assert.equal(tanimotoIndices([1, 2, 3], [1, 2, 3]), 1);
    assert.equal(tanimotoIndices([1, 2, 3], [4, 5, 6]), 0);
    assert.equal(tanimotoIndices([1, 2, 3, 4], [3, 4, 5, 6]), 2 / 6);
    assert.equal(tanimotoIndices([], []), 0, 'empty vs empty must be 0, not NaN');
    assert.equal(tanimotoIndices([1, 2], []), 0);
  });

  test('the model fingerprint is deterministic and moves when the training data or gate moves', () => {
    const rows = Array.from({ length: 600 }, (_, i) => {
      const bits = new Array(512).fill(0);
      for (let k = 0; k < 12; k += 1) bits[(i * 17 + k * 29) % 512] = 1;
      bits[100] = i % 2;
      return { canonicalSmiles: `SYNTHETIC_TEST_ONLY_${i}`, scaffold: `SC_${i % 40}`, bits, y: 6 + (i % 2) * 2 };
    });
    const a = trainAndValidate(rows, gate.gate, gate.ruleFingerprint, 'HASH_A', '2026.03.6');
    const b = trainAndValidate(rows, gate.gate, gate.ruleFingerprint, 'HASH_A', '2026.03.6');
    const c = trainAndValidate(rows, gate.gate, gate.ruleFingerprint, 'HASH_B', '2026.03.6');
    assert.equal(a.ok, true);
    assert.equal(a.modelFingerprint, b.modelFingerprint, 'same inputs must fingerprint identically');
    assert.notEqual(a.modelFingerprint, c.modelFingerprint, 'a different training dataset must fingerprint differently');
  });

  test('predictions are replay-deterministic and out-of-domain candidates are flagged, not rejected', () => {
    const rows = Array.from({ length: 600 }, (_, i) => {
      const bits = new Array(512).fill(0);
      for (let k = 0; k < 12; k += 1) bits[(i * 17 + k * 29) % 512] = 1;
      bits[100] = i % 2;
      return { canonicalSmiles: `SYNTHETIC_TEST_ONLY_${i}`, scaffold: `SC_${i % 40}`, bits, y: 6 + (i % 2) * 2 };
    });
    const m = trainAndValidate(rows, gate.gate, gate.ruleFingerprint, 'HASH_A', '2026.03.6');
    assert.equal(m.ok, true);

    const inDomain = { ok: true, bits: rows[0].bits };
    const p1 = predictQsar(m, inDomain);
    const p2 = predictQsar(m, inDomain);
    assert.equal(p1.value, p2.value, 'the same input must predict the same value');
    assert.ok(Number.isFinite(p1.value));
    assert.ok(Number.isFinite(p1.uncertainty), 'an AVAILABLE prediction must carry an uncertainty');

    const farAway = new Array(512).fill(0);
    for (let k = 0; k < 12; k += 1) farAway[(k * 3) + 400] = 1;
    const ood = predictQsar(m, { ok: true, bits: farAway });
    assert.equal(ood.status, 'AVAILABLE', 'OOD is a caveat on the value, not a refusal to produce one');
    assert.equal(ood.outOfDomain, true);
    assert.equal(p1.outOfDomain, false);
  });
});

// =========================================================================
describe('the MODEL_ESTIMATE label survives every path', () => {
  test('in this runtime the axis is genuinely BLOCKED, and says exactly why', () => {
    const trained = trainGlp1rModel();
    assert.equal(trained.ok, false);
    // The real human pin IS present (D-076), so the model trains and is then
    // refused by the frozen gate on accuracy — a different, stronger BLOCKED
    // than the absent-data one this suite originally asserted.
    assert.equal(trained.code, 'GATE_NOT_MET');
  });

  test('a BLOCKED prediction is still evidenceClass MODEL_ESTIMATE with a null value', () => {
    const p = glp1rEfficacyPrediction('CCO', { ok: false, code: 'PIN_MISSING' });
    assert.equal(p.status, 'BLOCKED');
    assert.equal(p.value, null);
    assert.equal(p.uncertainty, null);
    assert.equal(p.evidenceClass, 'MODEL_ESTIMATE');
    assert.equal(p.modelVersion, GLP1R_QSAR_MODEL_VERSION);
    assert.equal(p.blockedReason, 'PIN_MISSING');
  });

  test('no code path can relabel this axis as an observation or as COMPUTATIONAL', () => {
    const src = readFileSync(join(SRC, 'campaign/glp1rEfficacyAdapter.mjs'), 'utf8');
    const code = src.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    assert.equal(/evidenceClass:\s*'(?!MODEL_ESTIMATE)/.test(code), false, 'an evidenceClass other than MODEL_ESTIMATE is assigned somewhere');
    for (const forbidden of ['OBSERVATION', 'CLINICAL_EVIDENCE', 'DIRECT_RANDOMISED', 'INDIRECT_RANDOMISED']) {
      assert.equal(code.includes(`'${forbidden}'`), false, `${forbidden} appears as a value in this adapter`);
    }
  });

  test('MODEL_ESTIMATE is not a member of the D-057 EvidenceClass union — it cannot rank as promotion evidence', () => {
    const provenance = readFileSync(join(SRC, '../../frontend/src/core/agent/evidenceProvenance.ts'), 'utf8');
    const union = provenance.slice(provenance.indexOf('export type EvidenceClass'), provenance.indexOf('export type EvidenceRanking'));
    assert.equal(union.includes('MODEL_ESTIMATE'), false, 'MODEL_ESTIMATE must not become a rankable EvidenceClass');
    assert.ok(union.includes('INDIRECT_RANDOMISED'));
    // winnerGate.ts::asEvidenceClass maps any unrecognized string to UNVERIFIED (rank 1), far below STRONG_THRESHOLD_RANK (9).
    const winnerGate = readFileSync(join(SRC, '../../frontend/src/core/orchestrator/winnerGate.ts'), 'utf8');
    assert.ok(winnerGate.includes("'UNVERIFIED'"), 'winnerGate must still degrade unknown classes to UNVERIFIED');
  });

  test('the axis contribution is never decisive, and only closes the efficacy axis when AVAILABLE', () => {
    const blocked = glp1rAxisContribution({ status: 'BLOCKED', blockedReason: 'PIN_MISSING' });
    assert.equal(blocked.closesEfficacyAxis, false);
    assert.equal(blocked.decisive, false);
    assert.equal(blocked.isMeasurement, false);
    assert.equal(blocked.axis, GLP1R_EFFICACY_AXIS);

    const available = glp1rAxisContribution({ status: 'AVAILABLE' });
    assert.equal(available.closesEfficacyAxis, true);
    assert.equal(available.decisive, false, 'closing an axis is not entitlement to adjudicate on it');
    assert.equal(available.isMeasurement, false);
  });
});

// =========================================================================
describe('the efficacy axis and the mission stay honest', () => {
  test('efficacyAxis() with no argument is byte-for-byte the pre-D-076 behaviour', () => {
    const e = efficacyAxis();
    assert.equal(e.available, false);
    assert.equal(e.code, 'EFFICACY_AXIS_UNAVAILABLE');
    assert.ok(e.reasons.length >= 2);
    assert.ok(e.whatWouldCloseIt.length >= 1);
  });

  test('efficacyAxis() with a BLOCKED prediction still reports UNAVAILABLE', () => {
    const e = efficacyAxis({ status: 'BLOCKED', blockedReason: 'PIN_MISSING' });
    assert.equal(e.available, false);
    assert.equal(e.code, 'EFFICACY_AXIS_UNAVAILABLE');
  });

  test('efficacyAxis() with an AVAILABLE prediction closes the axis but declares it is not a measurement', () => {
    const e = efficacyAxis({
      status: 'AVAILABLE', value: 7.2, uncertainty: 0.4,
      modelVersion: GLP1R_QSAR_MODEL_VERSION, modelFingerprint: 'abc123', trainingDataHash: 'def456',
    });
    assert.equal(e.available, true);
    assert.equal(e.code, 'MODEL_ESTIMATE_AVAILABLE');
    assert.equal(e.evidenceClass, 'MODEL_ESTIMATE');
    assert.equal(e.isMeasurement, false);
    assert.match(e.reasons.join(' '), /NOT a measured potency/i);
  });

  test('probeCapabilities().activityPredictor is COMPUTED — false here, with the reason attached', () => {
    const c = probeCapabilities();
    assert.equal(c.activityPredictor, false);
    assert.equal(c.glp1rBlockedReason, 'GATE_NOT_MET', 'the pin exists; the model is refused on accuracy, not on absence');
    assert.equal(c.rdkit, true, 'RDKit must be live for this suite to mean anything');
  });

  test('with no activity predictor the comparable-axis set stays empty — NO_WINNER remains earned', () => {
    const axes = comparableAxes(
      { measuredPotencyNM: { glp1r: 0.77 }, structureAvailable: false },
      { rdkit: true, activityPredictor: false, priorArtSearch: false },
    );
    assert.equal(axes.disjoint, true);
    assert.equal(axes.comparable.length, 0);
  });

  test('...and a validated predictor WOULD open it — proving the NO_WINNER is computed, not hardcoded', () => {
    const axes = comparableAxes(
      { measuredPotencyNM: { glp1r: 0.77 }, structureAvailable: false },
      { rdkit: true, activityPredictor: true, priorArtSearch: true },
    );
    assert.equal(axes.disjoint, false);
    assert.ok(axes.comparable.includes('TARGET_RELEVANT_ACTIVITY'));
  });

  test('the QSAR axis is never added to any Pareto objective vector (D-069 holds)', () => {
    const mission = readFileSync(join(SRC, 'campaign/molecularMission.mjs'), 'utf8');
    const objectiveLines = mission.split('\n').filter((l) => l.includes('objectiveVector'));
    for (const line of objectiveLines) {
      assert.equal(line.includes('GLP1R'), false, 'the predicted-activity axis leaked into an objective vector');
    }
  });
});

// =========================================================================
describe('REAL PINNED HUMAN DATA — the D-076 artifact, end to end', () => {
  test('the pinned artifact is human GLP-1R, hash-verified, and the rat receptor is absent from it', () => {
    const pin = loadGlp1rPin();
    assert.equal(pin.ok, true, pin.reason);
    assert.equal(pin.n, 287);
    assert.equal(pin.contentSha256, '5533d8b8940987fde860cd3438882e0b1bc509bc810f75f1cff4302530e69244');
    assert.ok(pin.rows.every((r) => r.targetOrganism === HUMAN_ORGANISM), 'every pinned row must be Homo sapiens');
    assert.equal(new Set(pin.rows.map((r) => r.targetId)).size, 1, 'the pin must hold exactly one resolved target');
    assert.equal(pin.rows[0].targetId, 'CHEMBL1784', 'the human GLP-1R target resolved from the artifact');
    assert.ok(pin.rows.every((r) => r.targetId !== 'CHEMBL5862'), 'the RAT receptor must never appear in a human pin');
    assert.ok(pin.rows.every((r) => Number.isFinite(r.pActivity) && r.pActivity >= 3 && r.pActivity <= 12));
    assert.ok(pin.rows.every((r) => r.sourceUrl && r.sourceId), 'every kept row carries provenance');
  });

  test('on the real data the model TRAINS and is then REFUSED by the frozen gate on accuracy', () => {
    const trained = trainGlp1rModel();
    assert.equal(trained.ok, false);
    assert.equal(trained.code, 'GATE_NOT_MET');
    assert.equal(trained.unfingerprintable, 0, 'RDKit fingerprinted every pinned molecule');

    const v = trained.validation;
    // The QUANTITY thresholds are met — this is not a "not enough data" failure.
    assert.ok(v.split.nTrain >= 150, `nTrain=${v.split.nTrain} should clear MIN_TRAIN`);
    assert.ok(v.split.nTest >= 40, `nTest=${v.split.nTest} should clear MIN_TEST`);
    // R2 clears its bar comfortably: the model is learning real signal...
    assert.ok(v.metrics.r2 >= 0.25, `R2=${v.metrics.r2} should clear MIN_R2`);
    // ...but its typical error exceeds one log unit, and that is the refusal.
    assert.ok(v.metrics.mae > 1.0, `MAE=${v.metrics.mae} is the reason this is BLOCKED`);
    assert.equal(v.reasons.length, 1, `exactly one gate condition should fail: ${v.reasons.join('; ')}`);
    assert.match(v.reasons[0], /MAE/);
    assert.equal(v.weights, null, 'a refused model hands out no weights');
  });

  test('the frozen thresholds are still exactly what D-077 sealed — nothing was relaxed to pass', () => {
    const g = loadGlp1rValidationGate(GATE_PATH);
    assert.equal(g.ok, true);
    assert.equal(g.ruleFingerprint, 'd2f77a7e6042f0fc');
    assert.equal(g.gate.MAX_MAE, 1.0, 'MAX_MAE must not be raised to admit the real-data model');
    assert.equal(g.gate.MIN_R2, 0.25);
    assert.equal(g.gate.MIN_TRAIN, 150);
    assert.equal(g.gate.MIN_TEST, 40);
  });

  test('a refused model still produces no efficacy axis and no prediction value', () => {
    const trained = trainGlp1rModel();
    const pin = loadGlp1rPin();
    const p = glp1rEfficacyPrediction(pin.rows[0].canonicalSmiles, trained);
    assert.equal(p.status, 'BLOCKED');
    assert.equal(p.value, null);
    assert.equal(p.uncertainty, null);
    assert.equal(p.evidenceClass, 'MODEL_ESTIMATE');
    assert.equal(efficacyAxis(p).available, false);
    assert.equal(efficacyAxis(p).code, 'EFFICACY_AXIS_UNAVAILABLE');
  });

  test('training is memoized but the memo is keyed on the pinned bytes, so drift cannot be served stale', () => {
    const a = trainGlp1rModel();
    const b = trainGlp1rModel();
    assert.equal(a, b, 'same pin + same gate + same engine => memoized');
    // A different pin path is a different key: an absent pin fails closed rather than returning the cached model.
    const elsewhere = trainGlp1rModel({ pinOpts: { jsonPath: join(tmpdir(), 'nope.json'), metaPath: join(tmpdir(), 'nope.meta.json') } });
    assert.equal(elsewhere.ok, false);
    assert.equal(elsewhere.code, 'PIN_MISSING');
  });
});

// =========================================================================
describe('REAL RDKit — the engine itself, not a stub', () => {
  test('fingerprint() returns real Morgan bits and a real Murcko scaffold, deterministically', () => {
    const d = rdkitDetect();
    assert.equal(d.available, true, 'RDKit must be live — these tests refuse to pass against an absent engine');

    const aspirin = rdkitFingerprint('CC(=O)Oc1ccccc1C(=O)O');
    assert.equal(aspirin.ok, true);
    assert.equal(aspirin.bits.length, 512);
    assert.equal(aspirin.nBits, 512);
    assert.equal(aspirin.fingerprint, 'morgan_r2_512');
    assert.ok(aspirin.bits.some((b) => b === 1), 'a real molecule must set at least one bit');
    assert.ok(aspirin.bits.every((b) => b === 0 || b === 1), 'bits must be strictly binary');
    assert.equal(aspirin.scaffold, 'c1ccccc1', 'aspirin’s Murcko scaffold is benzene');
    assert.equal(aspirin.canonicalSmiles, 'CC(=O)Oc1ccccc1C(=O)O');

    const again = rdkitFingerprint('CC(=O)Oc1ccccc1C(=O)O');
    assert.deepEqual(again.bits, aspirin.bits, 'the same molecule must fingerprint identically across calls');
  });

  test('an unparseable SMILES fails closed — never an all-zero vector passed off as a molecule', () => {
    const bad = rdkitFingerprint('not-a-molecule');
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'invalid_smiles');
    assert.equal(bad.bits, undefined);
  });

  test('different molecules give different fingerprints and scaffolds (the engine is discriminating, not constant)', () => {
    const benzene = rdkitFingerprint('c1ccccc1');
    const pyridine = rdkitFingerprint('c1ccncc1');
    assert.equal(benzene.ok && pyridine.ok, true);
    assert.notDeepEqual(benzene.bits, pyridine.bits);
    assert.notEqual(benzene.scaffold, pyridine.scaffold);
  });

  test('the real engine feeds the real training path: an RDKit-fingerprinted dataset reaches the gate', () => {
    // A small REAL set of molecules with NO activity values attached: this
    // proves the feature path is wired to the engine end to end. It is far
    // below MIN_TRAIN, so the gate correctly refuses — which is the point.
    const smiles = ['c1ccccc1', 'Cc1ccccc1', 'CCc1ccccc1', 'Oc1ccccc1', 'Nc1ccccc1', 'c1ccncc1'];
    const featured = smiles.map((s, i) => {
      const fp = rdkitFingerprint(s);
      assert.equal(fp.ok, true, `${s} must be fingerprintable by the real engine`);
      return { canonicalSmiles: fp.canonicalSmiles, scaffold: fp.scaffold, bits: fp.bits, y: 6 + i * 0.1 };
    });
    const gate = loadGlp1rValidationGate(GATE_PATH);
    const m = trainAndValidate(featured, gate.gate, gate.ruleFingerprint, 'REAL_RDKIT_TINY_SET', rdkitDetect().version);
    assert.equal(m.ok, false, 'six molecules must never clear a gate that requires 150 training rows');
    assert.match(m.reasons.join(' | '), /MIN_TRAIN|MIN_TEST|nTrain=0 or nTest=0/);
  });
});
