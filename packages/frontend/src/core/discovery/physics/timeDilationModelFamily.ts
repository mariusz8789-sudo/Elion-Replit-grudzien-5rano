/**
 * TIME DILATION MODEL FAMILY — the parameterized-model-family generation
 * strategy applied to physics, using ONLY already-declared real constants
 * and formulas from relativisticTimeDilation.ts.
 *
 * THE REAL PHYSICS: for a circular orbit, the true net fractional
 * clock-rate difference (GR excess minus SR deficit) is EXACTLY linear in
 * 1/r:
 *
 *   net(r) = GM/(c^2) * (1/R_earth - 1/r) - GM/(2 r c^2)
 *          = [GM/(c^2 R_earth)] + [-1.5 GM/c^2] * (1/r)
 *          = A + B * (1/r)
 *
 * — a real, derivable consequence of the two already-established formulas
 * this engine already uses (not a new physical claim). This module never
 * asserts that derivation as a premise: it generates THREE competing
 * functional-form variants (1/r, r, 1/r^2) and lets fitting + holdout
 * testing decide which one actually generalises.
 *
 * DATA: every "data point" here is DERIVED (computed from established
 * formulas at a declared real orbital radius), never a measurement. Radii
 * are named after real orbit classes (ISS-like LEO, GPS-like MEO, GEO) for
 * concreteness, but the values used are the declared altitudes below, not
 * an assertion that any real spacecraft occupies exactly that radius.
 */
import {
  PHYSICAL_CONSTANTS,
  SPEED_OF_LIGHT_M_PER_S,
  circularOrbitSpeed,
  gravitationalFractionalExcess,
  specialRelativisticFractionalDeficit,
} from './relativisticTimeDilation';
import type { ModelDataPoint } from '../molecular/scientificModel';
import {
  runParameterizedModelFamily,
  replayParameterizedModelFamily,
  saveParameterizedModelFamilyToMemory,
  type ModelFamily,
  type ModelFamilyComparisonResult,
  type ModelFamilyVariantSpec,
} from '../parameterizedModelFamily';
import type { SavedExperiment } from '../../scienceMemory';

export const TIME_DILATION_MODEL_FAMILY_VERSION = '1.0.0';

/** Real orbital altitudes (metres above Earth's surface) — a deliberate mix spanning the SR/GR crossover. */
export const TRAINING_ALTITUDES_M: readonly number[] = [400_000, 2_000_000, 20_200_000, 35_786_000];
export const HOLDOUT_ALTITUDES_M: readonly number[] = [10_000_000, 800_000];

/** The real net fractional rate at a declared altitude — computed once, shared by `derivedPoint` and any caller that wants the raw number for a sanity check. */
export function netFractionalRateAtAltitude(altitudeM: number): number {
  const gm = PHYSICAL_CONSTANTS.earthGravitationalParameter!.value;
  const rGround = PHYSICAL_CONSTANTS.earthEquatorialRadius!.value;
  const r = rGround + altitudeM;
  const v = circularOrbitSpeed(gm, r);
  const srDeficit = specialRelativisticFractionalDeficit(v, SPEED_OF_LIGHT_M_PER_S);
  const grExcess = gravitationalFractionalExcess(gm, rGround, r, SPEED_OF_LIGHT_M_PER_S);
  return grExcess - srDeficit;
}

function derivedPoint(altitudeM: number): ModelDataPoint {
  const rGround = PHYSICAL_CONSTANTS.earthEquatorialRadius!.value;
  const r = rGround + altitudeM;
  return { inputs: { r }, measuredOutput: netFractionalRateAtAltitude(altitudeM), evidenceRecordId: `DERIVED:altitude=${altitudeM}m` };
}

export const TRAINING_DATA: readonly ModelDataPoint[] = TRAINING_ALTITUDES_M.map(derivedPoint);
export const HOLDOUT_DATA: readonly ModelDataPoint[] = HOLDOUT_ALTITUDES_M.map(derivedPoint);

/** Absolute tolerance on the net fractional rate — chosen to comfortably absorb this grid's discretization error (~1e-11) while still being far tighter than the wrong variants' expected holdout error (orders of magnitude larger). */
export const HOLDOUT_TOLERANCE = 5e-11;

const A_RANGE = { min: -2e-9, max: 2e-9, steps: 401 };
const B_RANGE = { min: -2e-2, max: 2e-2, steps: 401 };

const CORRECT_VARIANT: ModelFamilyVariantSpec = {
  variantId: 'linear-in-inverse-radius',
  statement: 'net(r) = A + B * (1/r) — linear in the inverse orbital radius.',
  equationText: 'net = A + B * (1/r)',
  variables: [
    { symbol: 'r', meaning: 'orbital radius from Earth\'s center', unit: 'm', role: 'INPUT' },
    { symbol: 'net', meaning: 'net fractional clock-rate difference (GR excess minus SR deficit)', unit: 'dimensionless', role: 'OUTPUT' },
  ],
  parameters: [
    { symbol: 'A', meaning: 'intercept', unit: 'dimensionless', value: null, source: 'NOT_YET_ESTIMATED' },
    { symbol: 'B', meaning: 'coefficient of 1/r', unit: 'm', value: null, source: 'NOT_YET_ESTIMATED' },
  ],
  assumptions: ['The net effect is a smooth function of orbital radius over the declared training altitude range.'],
  searchRanges: [{ symbol: 'A', ...A_RANGE }, { symbol: 'B', ...B_RANGE }],
  evaluate: (params, inputs) => params.A! + params.B! * (1 / inputs.r!),
};

const WRONG_LINEAR_IN_R: ModelFamilyVariantSpec = {
  variantId: 'linear-in-radius',
  statement: 'net(r) = A + B * r — linear in the orbital radius itself.',
  equationText: 'net = A + B * r',
  variables: [
    { symbol: 'r', meaning: 'orbital radius from Earth\'s center', unit: 'm', role: 'INPUT' },
    { symbol: 'net', meaning: 'net fractional clock-rate difference (GR excess minus SR deficit)', unit: 'dimensionless', role: 'OUTPUT' },
  ],
  parameters: [
    { symbol: 'A', meaning: 'intercept', unit: 'dimensionless', value: null, source: 'NOT_YET_ESTIMATED' },
    { symbol: 'B', meaning: 'coefficient of r', unit: '1/m', value: null, source: 'NOT_YET_ESTIMATED' },
  ],
  assumptions: ['The net effect is a smooth function of orbital radius over the declared training altitude range.'],
  searchRanges: [{ symbol: 'A', ...A_RANGE }, { symbol: 'B', min: -2e-16, max: 2e-16, steps: 401 }],
  evaluate: (params, inputs) => params.A! + params.B! * inputs.r!,
};

const WRONG_INVERSE_SQUARE: ModelFamilyVariantSpec = {
  variantId: 'linear-in-inverse-radius-squared',
  statement: 'net(r) = A + B * (1/r^2) — linear in the inverse square of orbital radius.',
  equationText: 'net = A + B * (1/r^2)',
  variables: [
    { symbol: 'r', meaning: 'orbital radius from Earth\'s center', unit: 'm', role: 'INPUT' },
    { symbol: 'net', meaning: 'net fractional clock-rate difference (GR excess minus SR deficit)', unit: 'dimensionless', role: 'OUTPUT' },
  ],
  parameters: [
    { symbol: 'A', meaning: 'intercept', unit: 'dimensionless', value: null, source: 'NOT_YET_ESTIMATED' },
    { symbol: 'B', meaning: 'coefficient of 1/r^2', unit: 'm^2', value: null, source: 'NOT_YET_ESTIMATED' },
  ],
  assumptions: ['The net effect is a smooth function of orbital radius over the declared training altitude range.'],
  searchRanges: [{ symbol: 'A', ...A_RANGE }, { symbol: 'B', min: -2e4, max: 2e4, steps: 401 }],
  evaluate: (params, inputs) => params.A! + params.B! * (1 / (inputs.r! * inputs.r!)),
};

export const TIME_DILATION_MODEL_FAMILY: ModelFamily = {
  familyId: 'time-dilation-radius-dependence',
  domainId: 'PHYSICS',
  description: 'Competing functional forms for how the net SR/GR clock-rate effect depends on orbital radius, fitted on real derived training altitudes and tested on real derived held-out altitudes.',
  variants: [CORRECT_VARIANT, WRONG_LINEAR_IN_R, WRONG_INVERSE_SQUARE],
};

export function runTimeDilationModelFamily(): ModelFamilyComparisonResult {
  return runParameterizedModelFamily(TIME_DILATION_MODEL_FAMILY, TRAINING_DATA, HOLDOUT_DATA, HOLDOUT_TOLERANCE);
}

export function replayTimeDilationModelFamily(saved: ModelFamilyComparisonResult) {
  return replayParameterizedModelFamily(saved, TIME_DILATION_MODEL_FAMILY, TRAINING_DATA, HOLDOUT_DATA, HOLDOUT_TOLERANCE);
}

export function saveTimeDilationModelFamilyToMemory(result: ModelFamilyComparisonResult): SavedExperiment {
  return saveParameterizedModelFamilyToMemory(result);
}
