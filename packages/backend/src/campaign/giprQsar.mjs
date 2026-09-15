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
 * WHAT IS HONEST ABOUT THE DATA (updated post-D-081a). A pinned human GIPR
 * activity artifact IS in this runtime: 233 rows, 219 distinct structures,
 * 72 distinct scaffolds, all "Homo sapiens", all resolved to CHEMBL4383,
 * sha256-verified on every read (see `giprActivity.json` / `.meta.json`,
 * ingested by `scripts/ingest-gipr-activity.mjs`). That is no longer the
 * blocker. The scaffold split over those 233 rows yields nTrain=146 against
 * MIN_TRAIN=150 (4 compounds short) and nTest=24 against MIN_TEST=40 (16
 * compounds short), so `trainGiprModel()` returns INSUFFICIENT_DATA — an
 * improvement over the earlier PIN_MISSING, but still not a pass. Fetching
 * more rows is not possible from here — the agent proxy refuses CONNECT to
 * www.ebi.ac.uk by organization policy, re-verified live at pin time. Both
 * `trainGiprModel()`'s code and `probeGiprCapability()`'s COMPUTED result
 * flip the moment a larger real GIPR pin is ingested, without an edit to
 * this file — exactly as the GLP-1R axis did when its 287-row pin arrived
 * in D-077a. The gate itself (MIN_TRAIN=150, MIN_TEST=40) has not moved and
 * must not move to close this gap; only more real rows on new scaffolds
 * close it (D-081a estimated roughly 156 more, since the test bucket is
 * scaffold-assigned at ~10.3%).
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
