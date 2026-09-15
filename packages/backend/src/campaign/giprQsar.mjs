/**
 * D-081 — GIPR efficacy axis: the GIPR BINDING of machinery that already
 * exists, plus the one thing that is genuinely GIPR-specific (its pin, its
 * frozen gate, and an honest account of how little GIPR data this repository
 * actually holds).
 *
 * WHY THIS AXIS EXISTS AT ALL. Tirzepatide is a DUAL GIP/GLP-1 receptor
 * agonist. A candidate evaluated only at GLP-1R is not being evaluated against
 * tirzepatide's mechanism — it is being evaluated against semaglutide's. The
 * GLP-1R axis alone therefore cannot answer the mission question, however good
 * its model gets. That is a statement about the biology, not about this code.
 *
 * WHAT IS REUSED, NOT REBUILT:
 *   - normalization + custody -> `activityDataset.mjs` (one engine, D-081)
 *   - frozen-gate loading     -> `validationGate.mjs`  (one engine, D-081)
 *   - the model itself        -> `glp1rQsarV2.mjs`'s dense ridge,
 *                                standardization, scaffold split, metrics,
 *                                representations, conformal width and gate
 *                                application. There is NO second QSAR engine
 *                                in this repository. The V2 module's name is
 *                                historical (it was written for GLP-1R first);
 *                                nothing inside it is GLP-1R-specific — it
 *                                takes (fingerprint bits, descriptors, y) and
 *                                returns a fitted model.
 *
 * WHAT IS HONEST ABOUT THE DATA. There is no pinned human GIPR activity
 * artifact in this runtime. The ONLY GIPR numbers anywhere in this repository
 * are two rows inside the A2 pinned candidate table (tirzepatide, 0.03 nM;
 * MK-0893, 1019 nM — `qualifyingAssayCounts.gipr` sums to 2 across all 20
 * candidates), and two rows cannot train anything: the frozen gate requires
 * MIN_TRAIN=150. Fetching more is not possible from here — the agent proxy
 * refuses CONNECT to www.ebi.ac.uk by organization policy, re-verified live
 * while writing this module. So `trainGiprModel()` returns BLOCKED with the
 * exact code and count, and `probeGiprCapability()` is COMPUTED from that
 * call rather than asserted. The day a real GIPR pin is ingested, both flip
 * without an edit to this file — exactly as the GLP-1R axis did when its
 * 287-row pin arrived in D-077a.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeActivityRows, writeActivityPin, loadActivityPin } from './activityDataset.mjs';
import { loadValidationGate } from './validationGate.mjs';
import {
  descriptorVector, fitStandardization, applyStandardization, denseRidge, densePredict,
  representationVector, selectRepresentation, conformalHalfWidth, applyFrozenGate,
  modelFingerprintV2, scaffoldSplit, metrics,
} from './glp1rQsarV2.mjs';
import { fingerprintBatch, descriptorsBatch, detect as rdkitDetect } from '../compute/rdkitAdapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const TARGET_LABEL = 'GIPR';
export const GIPR_PIN_PATH = path.join(HERE, 'giprActivity.json');
export const GIPR_PIN_META_PATH = path.join(HERE, 'giprActivity.meta.json');
export const GIPR_GATE_PATH = process.env.GENESIS_GIPR_GATE ?? path.join(HERE, 'gipr-validation-gate.json');

const INGEST_HINT = 'ingest a human-supplied local GIPR activity artifact the same way scripts/ingest-glp1r-activity.mjs did for GLP-1R';

/** The GIPR binding of the one normalization engine. Human-only and per-row organism checking are inherited, not re-implemented. */
export function normalizeGiprRows(rawRows, options = {}) {
  return normalizeActivityRows(rawRows, options);
}

export function writeGiprPin(rows, { jsonPath = GIPR_PIN_PATH, metaPath = GIPR_PIN_META_PATH, resolvedTargetIds = [] } = {}) {
  return writeActivityPin(rows, { jsonPath, metaPath, resolvedTargetIds });
}

export function loadGiprPin({ jsonPath = GIPR_PIN_PATH, metaPath = GIPR_PIN_META_PATH } = {}) {
  return loadActivityPin({ jsonPath, metaPath, targetLabel: TARGET_LABEL, ingestHint: INGEST_HINT });
}

export function loadGiprValidationGate(gatePath = GIPR_GATE_PATH, expectedRuleFingerprint) {
  return loadValidationGate(gatePath, { targetLabel: TARGET_LABEL, expectedRuleFingerprint });
}

/**
 * Trains the GIPR model, or returns exactly why it could not. Structurally
 * identical to the GLP-1R V2 path, deliberately: a different pipeline for a
 * second target would make the two axes incomparable, and comparing them is
 * the entire point of the dual-target layer.
 *
 * Every failure is a distinct code — never an empty result and never a model
 * trained on whatever happened to be available.
 */
export function trainGiprModel({ pinOpts = null, gatePath = GIPR_GATE_PATH, fingerprintFn = null, batchFn = null, descriptorFn = null } = {}) {
  const rd = rdkitDetect();
  if (!rd.available) return { ok: false, code: 'RDKIT_UNAVAILABLE', reasons: ['RDKit is not available in this runtime; no structure can be featurised'] };

  const gateResult = loadGiprValidationGate(gatePath);
  if (!gateResult.ok) return { ok: false, code: gateResult.code, reasons: [gateResult.reason] };
  const gate = gateResult.gate;

  const pin = loadGiprPin(pinOpts ?? {});
  if (!pin.ok) return { ok: false, code: pin.code, reasons: [pin.reason], gateFingerprint: gateResult.ruleFingerprint };

  const smiles = pin.rows.map((r) => r.canonicalSmiles);
  const fps = batchFn ? batchFn(smiles) : fingerprintBatch(smiles);
  const descs = descriptorFn ? descriptorFn(smiles) : descriptorsBatch(smiles);
  if (!fps?.ok || !descs?.ok) return { ok: false, code: 'FEATURISATION_FAILED', reasons: ['batch fingerprint/descriptor extraction failed for the GIPR pin'] };

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
  // The gate is checked BEFORE any metric is computed, so a dataset too small
  // to be trustworthy can never produce a number that later gets quoted.
  if (train.length < gate.MIN_TRAIN || test.length < gate.MIN_TEST) {
    return {
      ok: false,
      code: 'INSUFFICIENT_DATA',
      reasons: [`nTrain=${train.length} (gate requires >= ${gate.MIN_TRAIN}), nTest=${test.length} (gate requires >= ${gate.MIN_TEST}) — the frozen gate was NOT relaxed to fit this dataset`],
      gateFingerprint: gateResult.ruleFingerprint,
      nUsable: rows.length,
    };
  }

  const std = fitStandardization(train.map((r) => r.raw));
  const stdOf = new Map(rows.map((r) => [r.canonicalSmiles, applyStandardization(r.raw, std)]));
  const vecOf = (rep, r) => representationVector(rep, r.bits, stdOf.get(r.canonicalSmiles));

  const candidates = ['A', 'B', 'C'].map((rep) => {
    const w = denseRidge(train.map((r) => ({ x: vecOf(rep, r), y: r.y })), gate.lambda ?? 1.0);
    const calibResiduals = calib.map((r) => Math.abs(r.y - densePredict(w, vecOf(rep, r))));
    const calibMAE = calibResiduals.reduce((a, b) => a + b, 0) / Math.max(1, calibResiduals.length);
    return { id: rep, calibMAE, _w: w, _calibResiduals: calibResiduals };
  });

  // Selection on calibration error only — `selectRepresentation` structurally
  // refuses any candidate carrying a test metric, so selecting on the test
  // split is impossible rather than merely discouraged.
  const sel = selectRepresentation(candidates.map(({ id, calibMAE }) => ({ id, calibMAE })));
  if (!sel.ok) return { ok: false, code: sel.code, reasons: ['representation selection refused'], gateFingerprint: gateResult.ruleFingerprint };
  const chosen = candidates.find((c) => c.id === sel.selected.id);

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

  if (decision.status === 'BLOCKED') {
    return { ok: false, code: 'GATE_BLOCKED', reasons: decision.reasons, metrics: m, modelFingerprint, gateFingerprint: gateResult.ruleFingerprint };
  }
  return {
    ok: true, target: TARGET_LABEL, representation: chosen.id, metrics: m,
    conformalHalfWidth: conf.ok ? conf.halfWidth : null,
    modelFingerprint, gateFingerprint: gateResult.ruleFingerprint,
    trainingDataHash: pin.contentSha256, nTrain: train.length, nTest: test.length,
    predict: (bits, rawDescriptors) => densePredict(chosen._w, representationVector(chosen.id, bits, applyStandardization(rawDescriptors, std))),
  };
}

/**
 * COMPUTED capability, never an asserted constant — the same discipline
 * `molecularMission.mjs::probeCapabilities` applies to the GLP-1R axis.
 */
export function probeGiprCapability(opts = {}) {
  const attempt = trainGiprModel(opts);
  return Object.freeze({
    available: attempt.ok === true,
    code: attempt.ok ? 'MODEL_VALIDATED' : attempt.code,
    reasons: Object.freeze(attempt.ok ? [] : [...(attempt.reasons ?? [])]),
    modelFingerprint: attempt.modelFingerprint ?? null,
    gateFingerprint: attempt.gateFingerprint ?? null,
  });
}
