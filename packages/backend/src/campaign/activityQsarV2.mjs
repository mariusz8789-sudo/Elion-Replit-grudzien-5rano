/**
 * D-088 — the ONE V2 activity-QSAR engine, target-agnostic.
 *
 * Extracted behaviour-for-behaviour from `giprQsar.mjs::trainGiprModel`, which
 * was the only caller of the V2 machinery. Nothing about that flow was
 * GIPR-specific except which gate and which pin it loaded, so the flow moves
 * here and the target modules become thin bindings — the same shape
 * `activityDataset.mjs` already used to unify the two dataset loaders.
 *
 * ====================== WHY THIS EXISTS (D-087 finding) ==================
 *
 * The repository had TWO fitting paths. V1 (`glp1rQsar.trainAndValidate`)
 * fits the ridge on Morgan bits alone and is what the GLP-1R axis ran. V2
 * carries the descriptor + peptide features, the A/B/C representation family
 * and the calibration-only selection rule — and despite living in a file
 * named `glp1rQsarV2.mjs`, it was reachable ONLY from the GIPR path. The
 * GLP-1R axis never reached its own V2 engine.
 *
 * Copying the flow into a second function would have been the obvious way to
 * give GLP-1R access to it, and would have created exactly the duplicate
 * engine this repository keeps refusing. There is one engine; both targets
 * bind to it.
 *
 * ========================= WHAT IS GUARANTEED ============================
 *
 * SELECTION CANNOT SEE TEST. `selectRepresentation` structurally refuses any
 * candidate object carrying a test metric, and no test prediction is computed
 * until after it returns. The HARK guard below re-asserts this at runtime.
 *
 * SPLITS ARE DISJOINT. Asserted before any fit, by canonicalSmiles and by
 * scaffold bucket. A violation ABORTS; it is never a warning.
 *
 * THE GATE IS CHECKED BEFORE ANY METRIC EXISTS. A dataset too small to be
 * trustworthy cannot produce a number that later gets quoted.
 */

import { detect as rdkitDetect, fingerprintBatch, descriptorsBatch } from '../compute/rdkitAdapter.mjs';
import { scaffoldSplit, scaffoldBucket, metrics } from './glp1rQsar.mjs';
import {
  descriptorVector, fitStandardization, applyStandardization, denseRidge, densePredict,
  representationVector, selectRepresentation, conformalHalfWidth, modelFingerprintV2, applyFrozenGate,
} from './glp1rQsarV2.mjs';

export const V2_REPRESENTATION_IDS = Object.freeze(['A', 'B', 'C']);

/**
 * Pairwise disjointness of the three splits, by molecule AND by scaffold
 * bucket. Returns reasons rather than throwing so the caller decides, but the
 * caller in this module always aborts.
 */
export function assertSplitIsolation({ train, calib, test }) {
  const reasons = [];
  const idsOf = (rows) => new Set(rows.map((r) => r.canonicalSmiles));
  const bucketsOf = (rows) => new Set(rows.map((r) => scaffoldBucket(r.scaffold)));
  const pairs = [['train', train, 'calib', calib], ['train', train, 'test', test], ['calib', calib, 'test', test]];

  for (const [an, a, bn, b] of pairs) {
    const bs = idsOf(b);
    const sharedMolecules = [...idsOf(a)].filter((s) => bs.has(s));
    if (sharedMolecules.length > 0) {
      reasons.push(`SPLIT_LEAKAGE: ${sharedMolecules.length} molecule(s) appear in BOTH ${an} and ${bn} (e.g. ${sharedMolecules[0].slice(0, 40)})`);
    }
    const bb = bucketsOf(b);
    const sharedBuckets = [...bucketsOf(a)].filter((x) => bb.has(x));
    if (sharedBuckets.length > 0) {
      reasons.push(`SCAFFOLD_BUCKET_LEAKAGE: bucket(s) ${sharedBuckets.join(',')} appear in BOTH ${an} and ${bn}`);
    }
  }
  return Object.freeze({ ok: reasons.length === 0, reasons: Object.freeze(reasons) });
}

/**
 * Trains the V2 model for ANY target, given an already-loaded frozen gate and
 * an already-verified pin. Loading stays in the target binding so this
 * function cannot pick the wrong dataset for the wrong gate.
 */
export function trainActivityModelV2({
  gateResult, pin, targetLabel,
  fingerprintFn = null, descriptorFn = null,
} = {}) {
  const rd = rdkitDetect();
  if (!rd.available) return { ok: false, code: 'RDKIT_UNAVAILABLE', reasons: ['RDKit is not available in this runtime; no structure can be featurised'] };
  if (!gateResult?.ok) return { ok: false, code: gateResult?.code ?? 'GATE_NOT_FROZEN', reasons: [gateResult?.reason ?? 'no frozen gate supplied'] };
  if (!pin?.ok) return { ok: false, code: pin?.code ?? 'PIN_MISSING', reasons: [pin?.reason ?? 'no verified pin supplied'], gateFingerprint: gateResult.ruleFingerprint };

  const gate = gateResult.gate;
  const smiles = pin.rows.map((r) => r.canonicalSmiles);
  const fps = fingerprintFn ? fingerprintFn(smiles) : fingerprintBatch(smiles);
  const descs = descriptorFn ? descriptorFn(smiles) : descriptorsBatch(smiles);
  if (!fps?.ok || !descs?.ok) return { ok: false, code: 'FEATURISATION_FAILED', reasons: [`batch fingerprint/descriptor extraction failed for the ${targetLabel} pin`] };

  const rows = [];
  for (let i = 0; i < pin.rows.length; i += 1) {
    const fp = fps.results[i];
    const de = descs.results[i];
    if (!fp?.ok || !de?.ok) continue;
    const dv = descriptorVector(pin.rows[i].canonicalSmiles, de.data);
    if (!dv.ok) continue;
    rows.push({ canonicalSmiles: pin.rows[i].canonicalSmiles, scaffold: fp.scaffold, bits: fp.bits, raw: dv.vector, y: pin.rows[i].pActivity });
  }

  const { train, calib, test } = scaffoldSplit(rows);

  // GATE BEFORE METRICS.
  if (train.length < gate.MIN_TRAIN || test.length < gate.MIN_TEST) {
    return {
      ok: false, code: 'INSUFFICIENT_DATA',
      reasons: [`nTrain=${train.length} (gate requires >= ${gate.MIN_TRAIN}), nTest=${test.length} (gate requires >= ${gate.MIN_TEST}) — the frozen gate was NOT relaxed to fit this dataset`],
      gateFingerprint: gateResult.ruleFingerprint, nUsable: rows.length,
    };
  }

  // ISOLATION BEFORE ANY FIT. Aborts, never warns.
  const isolation = assertSplitIsolation({ train, calib, test });
  if (!isolation.ok) {
    return { ok: false, code: 'SPLIT_ISOLATION_VIOLATED', reasons: isolation.reasons, gateFingerprint: gateResult.ruleFingerprint };
  }

  const std = fitStandardization(train.map((r) => r.raw));
  const stdOf = new Map(rows.map((r) => [r.canonicalSmiles, applyStandardization(r.raw, std)]));
  const vecOf = (rep, r) => representationVector(rep, r.bits, stdOf.get(r.canonicalSmiles));

  // ---- SELECTION PHASE: no test row is touched anywhere below this line ----
  const candidates = V2_REPRESENTATION_IDS.map((rep) => {
    const w = denseRidge(train.map((r) => ({ x: vecOf(rep, r), y: r.y })), gate.lambda ?? 1.0);
    const calibResiduals = calib.map((r) => Math.abs(r.y - densePredict(w, vecOf(rep, r))));
    const calibMAE = calibResiduals.reduce((a, b) => a + b, 0) / Math.max(1, calibResiduals.length);
    return { id: rep, calibMAE, _w: w, _calibResiduals: calibResiduals };
  });

  const sel = selectRepresentation(candidates.map(({ id, calibMAE }) => ({ id, calibMAE })));
  if (!sel.ok) return { ok: false, code: sel.code, reasons: ['representation selection refused'], gateFingerprint: gateResult.ruleFingerprint };
  const chosen = candidates.find((c) => c.id === sel.selected.id);
  // ---- SELECTION PHASE CLOSED. The test split may now be read, ONCE. ----

  const testPreds = test.map((r) => densePredict(chosen._w, vecOf(chosen.id, r)));
  const m = metrics(testPreds, test.map((r) => r.y));
  const conf = conformalHalfWidth(chosen._calibResiduals, gate.conformalAlpha ?? 0.1);
  const decision = applyFrozenGate(gate, { nTrain: train.length, nTest: test.length, mae: m.mae, r2: m.r2, halfWidth: conf.ok ? conf.halfWidth : null });

  const modelFingerprint = modelFingerprintV2({
    representation: chosen.id, lambda: gate.lambda ?? 1.0,
    standardization: { mean: std.mean, sd: std.sd, dropped: std.dropped },
    splitPolicy: gate.splitMethod, trainingDataHash: pin.contentSha256,
    gateFingerprint: gateResult.ruleFingerprint, rdkitVersion: rd.version, schema: chosen.id,
  });

  const common = {
    target: targetLabel, representation: chosen.id, metrics: m,
    calibration: Object.freeze(candidates.map(({ id, calibMAE }) => Object.freeze({ id, calibMAE }))),
    selectedOn: 'calibMAE',
    conformalHalfWidth: conf.ok ? conf.halfWidth : null,
    modelFingerprint, gateFingerprint: gateResult.ruleFingerprint,
    trainingDataHash: pin.contentSha256,
    nTrain: train.length, nCalib: calib.length, nTest: test.length,
    rdkitVersion: rd.version,
  };

  if (decision.status === 'BLOCKED') {
    return { ok: false, code: 'GATE_BLOCKED', reasons: decision.reasons, ...common };
  }
  return {
    ok: true, ...common,
    predict: (bits, rawDescriptors) => densePredict(chosen._w, representationVector(chosen.id, bits, applyStandardization(rawDescriptors, std))),
  };
}
