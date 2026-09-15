/**
 * D-076/077 — GLP-1R efficacy adapter: turns a validated (or BLOCKED) QSAR
 * model into the `GLP1REfficacyPrediction` contract and is the ONLY place
 * `evidenceClass: 'MODEL_ESTIMATE'` gets attached to a GLP-1R number.
 *
 * `MODEL_ESTIMATE` is not a member of `core/agent/evidenceProvenance.ts`'s
 * `EvidenceClass` union (verified: DIRECT_RANDOMISED..UNVERIFIED, no
 * MODEL_ESTIMATE) — so if this value were ever fed into
 * `core/orchestrator/winnerGate.ts::asEvidenceClass`, it would fall through
 * to `UNVERIFIED` (rank 1), never `COMPUTATIONAL` (rank 2) or higher. This
 * axis cannot promote a WinnerRecord even by accident; it is a second,
 * independent reason on top of `glp1rEfficacyPrediction` never returning
 * anything but `MODEL_ESTIMATE`.
 */

import { loadGlp1rPin } from './glp1rDataset.mjs';
import { loadGlp1rValidationGate, trainAndValidate, predictQsar } from './glp1rQsar.mjs';
import { fingerprint as rdkitFingerprint, detect as rdkitDetect } from '../compute/rdkitAdapter.mjs';
import { canonicalHash } from '../provenance.mjs';

export const GLP1R_EFFICACY_TARGET = 'GLP1R';
export const GLP1R_EFFICACY_AXIS = 'GLP1R_PREDICTED_ACTIVITY';
/** Algorithm/contract identity — distinct from `modelFingerprint` (a hash of THIS SPECIFIC trained model's data+gate+runtime). Bump only on an algorithmic change. */
export const GLP1R_QSAR_MODEL_VERSION = 'glp1r-qsar-ridge-ecfp4-512bit-v1';

export const MODEL_ESTIMATE_NOTE =
  'QSAR model estimate (ECFP4-style ridge regression, split-conformal interval) trained on a scaffold-disjoint split of pinned human GLP-1R activities. It is NOT a measurement and NOT clinical efficacy. Even when the frozen validation gate is met, this value is evidenceClass MODEL_ESTIMATE and cannot promote a WinnerRecord under D-057 (docs/DECISIONS.md).';

/**
 * Fingerprints every pinned row and drops any that fail (RDKit version drift
 * between pin time and train time is the only realistic cause — the SMILES
 * were already RDKit-validated at ingestion). The count is reported, never
 * silently absorbed.
 */
function buildFeatures(rows, fingerprintFn) {
  const withFeatures = [];
  let unfingerprintable = 0;
  for (const r of rows) {
    const fp = fingerprintFn(r.canonicalSmiles);
    if (!fp?.ok || !Array.isArray(fp.bits)) { unfingerprintable += 1; continue; }
    withFeatures.push({ canonicalSmiles: r.canonicalSmiles, scaffold: fp.scaffold, bits: fp.bits, y: r.pActivity });
  }
  return { withFeatures, unfingerprintable };
}

/**
 * Loads the pin, loads the frozen gate, fingerprints every row, trains and
 * validates. Never throws; every failure mode is a distinct `code`. Cheap to
 * call repeatedly when the pin is absent (a single `existsSync`); the only
 * expensive path (a real ridge solve) only runs once real human data exists.
 */
export function trainGlp1rModel({ pinOpts, gatePath, expectedGateFingerprint, fingerprintFn = rdkitFingerprint } = {}) {
  const rd = rdkitDetect();
  if (!rd.available) return { ok: false, code: 'BLOCKED_BY_RUNTIME', reason: rd.reason, trainingDataHash: null };

  const pin = loadGlp1rPin(pinOpts ?? {});
  if (!pin.ok) return { ok: false, code: pin.code, reason: pin.reason, trainingDataHash: null };

  const gateResult = loadGlp1rValidationGate(gatePath, expectedGateFingerprint);
  if (!gateResult.ok) return { ok: false, code: gateResult.code, reason: gateResult.reason, trainingDataHash: pin.contentSha256 };

  const { withFeatures, unfingerprintable } = buildFeatures(pin.rows, fingerprintFn);
  if (withFeatures.length === 0) {
    return { ok: false, code: 'NO_FINGERPRINTABLE_ROWS', reason: `all ${pin.rows.length} pinned row(s) failed RDKit fingerprinting`, trainingDataHash: pin.contentSha256 };
  }

  const validation = trainAndValidate(withFeatures, gateResult.gate, gateResult.ruleFingerprint, pin.contentSha256, rd.version);
  return {
    ok: validation.ok,
    code: validation.ok ? null : 'GATE_NOT_MET',
    reason: validation.ok ? null : validation.reasons.join('; '),
    validation,
    trainingDataHash: pin.contentSha256,
    gateRuleFingerprint: gateResult.ruleFingerprint,
    rdkitVersion: rd.version,
    nPinnedRows: pin.rows.length,
    unfingerprintable,
  };
}

/**
 * The contract: status/value/unit/uncertainty/target/modelVersion/
 * trainingDataHash/modelFingerprint/inputFingerprint/outputHash/provenance/
 * evidenceClass/outOfDomain/blockedReason. `evidenceClass` is `MODEL_ESTIMATE`
 * on every path, including BLOCKED (a blocked prediction is still, in kind,
 * the sort of thing a model would have produced — it just was not produced).
 */
export function glp1rEfficacyPrediction(smiles, trained, { fingerprintFn = rdkitFingerprint } = {}) {
  const inputFingerprint = canonicalHash({ canonicalSmiles: String(smiles ?? ''), target: GLP1R_EFFICACY_TARGET }).slice(0, 16);
  const base = Object.freeze({
    target: GLP1R_EFFICACY_TARGET, axis: GLP1R_EFFICACY_AXIS, inputFingerprint,
    evidenceClass: 'MODEL_ESTIMATE', honestyNote: MODEL_ESTIMATE_NOTE, unit: 'pActivity',
  });

  if (!trained?.ok) {
    return Object.freeze({
      ...base, status: 'BLOCKED', value: null, uncertainty: null,
      modelVersion: GLP1R_QSAR_MODEL_VERSION, trainingDataHash: trained?.trainingDataHash ?? null,
      modelFingerprint: null, outputHash: null, provenance: trained?.trainingDataHash ?? '',
      outOfDomain: null, blockedReason: trained?.code ?? 'MODEL_NOT_TRAINED',
    });
  }

  const fp = fingerprintFn(smiles);
  const pred = predictQsar(trained.validation, fp);
  if (pred.status !== 'AVAILABLE') {
    return Object.freeze({
      ...base, status: 'BLOCKED', value: null, uncertainty: null,
      modelVersion: GLP1R_QSAR_MODEL_VERSION, trainingDataHash: trained.trainingDataHash,
      modelFingerprint: trained.validation.modelFingerprint, outputHash: null,
      provenance: `pin=${trained.trainingDataHash}`, outOfDomain: pred.outOfDomain ?? null,
      blockedReason: pred.blockedReason,
    });
  }

  const outputHash = canonicalHash({
    inputFingerprint, modelFingerprint: trained.validation.modelFingerprint, value: pred.value, uncertainty: pred.uncertainty,
  }).slice(0, 16);
  return Object.freeze({
    ...base, status: 'AVAILABLE', value: pred.value, uncertainty: pred.uncertainty,
    modelVersion: GLP1R_QSAR_MODEL_VERSION, trainingDataHash: trained.trainingDataHash,
    modelFingerprint: trained.validation.modelFingerprint, outputHash,
    provenance: `pin=${trained.trainingDataHash};gate=${trained.gateRuleFingerprint};nearestTrainTanimoto=${pred.nearestTrainTanimoto.toFixed(3)}`,
    outOfDomain: pred.outOfDomain,
  });
}

/**
 * What this axis contributes to a comparable-axis set — the SAME tagged shape
 * `chemotypeSimilarityAxis.mjs::axisContribution` returns, so a consumer
 * cannot pass a bare axis name around and lose the evidence class.
 *
 * The one deliberate difference from the D-075 chemotype proxy: this axis MAY
 * set `closesEfficacyAxis` — but only when a model that cleared the frozen
 * validation gate actually produced a value. `decisive` stays false on every
 * path: closing the technical absence of a prediction axis is not the same as
 * being entitled to adjudicate a winner on it, and D-057 still decides
 * promotion on evidence class (where MODEL_ESTIMATE does not even appear in
 * the `EvidenceClass` union and degrades to UNVERIFIED).
 */
export function glp1rAxisContribution(prediction) {
  const available = prediction?.status === 'AVAILABLE';
  return Object.freeze({
    axis: GLP1R_EFFICACY_AXIS,
    status: prediction?.status ?? 'BLOCKED',
    evidenceClass: 'MODEL_ESTIMATE',
    decisive: false,
    closesEfficacyAxis: available,
    isMeasurement: false,
    honestyNote: MODEL_ESTIMATE_NOTE,
    blockedReason: available ? null : (prediction?.blockedReason ?? 'NO_PREDICTION'),
  });
}
