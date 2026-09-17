/**
 * D-108 — makes a Trial 2/2 decision INTERPRETABLE. Reporting-only.
 *
 * ==================== WHAT THIS DOES NOT DO ================================
 *
 * This module never reads, writes, or influences `MAX_MAE` in
 * `glp1r-validation-gate.json` (`ruleFingerprint d2f77a7e6042f0fc`), never
 * calls `noiseFloorStatus` or `replicateGroups`, and has no branch that
 * decides whether Trial 2/2 runs. It takes numbers that already exist —
 * the frozen gate's threshold and the sealed noise-floor measurement — and
 * answers two questions a human needs answered around the last attempt.
 *
 * ======================= WHY TWO SEPARATE QUESTIONS =========================
 *
 * "Is the GATE resolvable?" and "is THIS RESULT distinguishable from noise?"
 * are different questions and can disagree. D-106/107 measured CAMP's noise
 * floor (medianSd) at 1.0005 pActivity units against a frozen MAX_MAE of
 * 1.0 — the threshold and the floor coincide, so the gate itself sits right
 * at the resolution limit of the data (`classifyGateAgainstNoiseFloor`,
 * answerable NOW, before Trial 2/2 runs at all). But a SPECIFIC trial result
 * needs its own check: a model that passes with testMae = 0.98 (barely under
 * MAX_MAE, right at the floor) tells you nothing the assay noise doesn't
 * already explain; a model that passes with testMae = 0.1 (far below the
 * floor) has cleared a bar assay-to-assay disagreement itself could not
 * clear, and IS informative even though the gate it passed happens to sit at
 * the floor. `interpretTrialResult` checks the ACTUAL testMae against the
 * floor for exactly this reason — conflating the two was a bug this module's
 * own tests caught before this comment was written.
 */

/** How a measured error (a gate threshold, or an actual trial's testMae) relates to the measured noise floor. */
export type NoiseFloorRelation =
  | 'BELOW_NOISE_FLOOR' // stricter / better than the data's own noise — an honest, informative result (or an impossibly strict gate)
  | 'AT_NOISE_FLOOR' // at the resolution limit — not distinguishable from measurement noise
  | 'ABOVE_NOISE_FLOOR'; // looser / worse than the data's own noise

export interface GateVsNoiseFloor {
  readonly gateMaxMae: number;
  readonly noiseFloorMedianSd: number;
  /** gateMaxMae - noiseFloorMedianSd. Negative: the gate is stricter than the data's own noise. */
  readonly deltaFromNoiseFloor: number;
  readonly relation: NoiseFloorRelation;
  readonly toleranceUnits: number;
  readonly caveat: string;
}

/** Default tolerance, in pActivity units, for calling a value "at" the noise floor rather than strictly below/above it. */
export const DEFAULT_NOISE_FLOOR_TOLERANCE = 0.05;

function classify(delta: number, toleranceUnits: number): NoiseFloorRelation {
  return delta < -toleranceUnits ? 'BELOW_NOISE_FLOOR' : delta > toleranceUnits ? 'ABOVE_NOISE_FLOOR' : 'AT_NOISE_FLOOR';
}

/**
 * Classifies the FROZEN GATE THRESHOLD itself against the measured noise
 * floor — answerable right now, before Trial 2/2 has produced a single
 * number. This is a property of the gate and the floor alone; it says
 * nothing about any particular trial result.
 */
export function classifyGateAgainstNoiseFloor(
  gateMaxMae: number,
  noiseFloorMedianSd: number,
  toleranceUnits: number = DEFAULT_NOISE_FLOOR_TOLERANCE,
): GateVsNoiseFloor {
  const delta = gateMaxMae - noiseFloorMedianSd;
  const relation = classify(delta, toleranceUnits);

  const caveat =
    relation === 'AT_NOISE_FLOOR'
      ? `MAX_MAE (${gateMaxMae}) sits within ${toleranceUnits} pActivity units of the measured noise floor (${noiseFloorMedianSd}). Any pass at or near this threshold means the model predicts about as precisely as two independent assays measure the same compound — a specific trial result still needs its own check via interpretTrialResult(), since a result well below the floor can still be informative even though the gate itself sits at the resolution limit.`
      : relation === 'BELOW_NOISE_FLOOR'
        ? `MAX_MAE (${gateMaxMae}) is stricter than the measured noise floor (${noiseFloorMedianSd}) by ${(-delta).toFixed(4)} units. An honest model can fail this gate even with no systematic error, purely from assay-to-assay disagreement in the training data.`
        : `MAX_MAE (${gateMaxMae}) is looser than the measured noise floor (${noiseFloorMedianSd}) by ${delta.toFixed(4)} units. A PASS here is a weaker claim because the bar itself allows more error than the data's own noise, not because it is at the resolution limit.`;

  return { gateMaxMae, noiseFloorMedianSd, deltaFromNoiseFloor: delta, relation, toleranceUnits, caveat };
}

export interface TrialInterpretation {
  readonly testMae: number;
  readonly gateMaxMae: number;
  readonly noiseFloorMedianSd: number;
  readonly toleranceUnits: number;
  /** Restates the frozen gate's own arithmetic (testMae <= gateMaxMae). Decides nothing — the real gate is orchestrator/winnerGate.ts, untouched. */
  readonly passesGate: boolean;
  /** How the GATE THRESHOLD relates to the floor — static, independent of this result. */
  readonly gateRelation: NoiseFloorRelation;
  /** How THIS ACTUAL testMae relates to the floor — the check that matters for interpreting this specific result. */
  readonly resultRelation: NoiseFloorRelation;
  /** True only when the trial passed AND its own error is not clearly below the noise floor — i.e. this pass cannot be told apart from assay noise. */
  readonly requiresHumanNote: boolean;
  readonly caveat: string;
}

/**
 * Classifies an ACTUAL trial result (a real testMae, from a run that already
 * happened) against both the gate and the noise floor. Still decides
 * nothing: `passesGate` restates the frozen threshold's own arithmetic, and
 * no caller of this function can use it to promote a candidate — that path
 * runs entirely through `orchestrator/winnerGate.ts`, untouched.
 */
export function interpretTrialResult(
  testMae: number,
  gateMaxMae: number,
  noiseFloorMedianSd: number,
  toleranceUnits: number = DEFAULT_NOISE_FLOOR_TOLERANCE,
): TrialInterpretation {
  const gateVsFloor = classifyGateAgainstNoiseFloor(gateMaxMae, noiseFloorMedianSd, toleranceUnits);
  const passesGate = testMae <= gateMaxMae;
  const resultRelation = classify(testMae - noiseFloorMedianSd, toleranceUnits);
  const requiresHumanNote = passesGate && resultRelation !== 'BELOW_NOISE_FLOOR';

  const caveat = requiresHumanNote
    ? `testMae (${testMae}) passed the gate but is ${resultRelation === 'AT_NOISE_FLOOR' ? 'within' : 'above'} the noise floor (${noiseFloorMedianSd} ± ${toleranceUnits}): this pass cannot be distinguished from assay-to-assay disagreement in the training data. Requires a human note before any interpretation as VALIDATED.`
    : passesGate
      ? `testMae (${testMae}) passed the gate and sits clearly below the noise floor (${noiseFloorMedianSd}): the result is more precise than two independent assays agree with each other, which is informative regardless of where the gate threshold itself sits.`
      : `testMae (${testMae}) did not pass the gate (MAX_MAE ${gateMaxMae}).`;

  return { testMae, gateMaxMae, noiseFloorMedianSd, toleranceUnits, passesGate, gateRelation: gateVsFloor.relation, resultRelation, requiresHumanNote, caveat };
}
