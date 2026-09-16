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
 * WHAT IS HONEST ABOUT THE DATA (updated D-081a, then D-109). A real,
 * human-only, custody-verified GIPR activity pin WAS ingested in D-081a —
 * `giprActivity.json`, 233 rows over 219 distinct molecules, target
 * CHEMBL4383, resolved against a live ChEMBL fetch performed OUTSIDE this
 * runtime and supplied as a local artifact (the egress proxy still refuses
 * CONNECT to www.ebi.ac.uk from here, re-verified live in D-109). So this is
 * NOT the "two rows" state this comment described when first written for
 * D-081 — that state predates the D-081a ingestion and was stale.
 *
 * What remains true: 233 rows still is not enough. The deterministic
 * scaffold-hash split (`scaffoldSplit`, unchanged, unweighted) yields
 * nTrain=146 (gate requires >=150, short by 4) and nTest=24 (gate requires
 * >=40, short by 16) — measured directly by `trainGiprModel()` below, not
 * estimated. Because the split is a hash of each row's scaffold and not a
 * tunable ratio, closing the gap requires MORE real, independently-sourced
 * GIPR activity rows, not a different split — the same discipline that
 * forbade tuning the GLP-1R split in D-069/D-074/D-077. `trainGiprModel()`
 * returns BLOCKED (`INSUFFICIENT_DATA`) with the exact counts, and
 * `probeGiprCapability()` is COMPUTED from that call rather than asserted.
 * The day enough additional real rows are ingested, both flip without an
 * edit to this file — exactly as the GLP-1R axis did when its 287-row pin
 * arrived in D-077a.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeActivityRows, writeActivityPin, loadActivityPin } from './activityDataset.mjs';
import { loadValidationGate } from './validationGate.mjs';
// D-088: every V2 primitive this module used to import directly is now reached
// through the shared engine. The imports going dead is the evidence that the
// extraction was complete rather than partial.
import { trainActivityModelV2 } from './activityQsarV2.mjs';

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
  // D-088: the V2 flow this function used to inline now lives in
  // activityQsarV2.mjs, target-agnostic, so the GLP-1R axis can reach the SAME
  // engine instead of a copy of it. Behaviour here is unchanged — the
  // extraction was line-for-line, and the GIPR suite asserts the same codes
  // and the same INSUFFICIENT_DATA reason string as before.
  return trainActivityModelV2({
    gateResult: loadGiprValidationGate(gatePath),
    pin: loadGiprPin(pinOpts ?? {}),
    targetLabel: TARGET_LABEL,
    fingerprintFn: batchFn ?? fingerprintFn,
    descriptorFn,
  });
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
