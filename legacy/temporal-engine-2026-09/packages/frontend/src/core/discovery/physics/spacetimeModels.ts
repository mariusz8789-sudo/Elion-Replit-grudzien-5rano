/**
 * SPACETIME MODELS — MODEL and EQUATION as first-class objects, distinct
 * from HYPOTHESIS.
 *
 * `spacetimeStructureInquiry.ts` already keeps CONSTRAINT (established
 * facts/theories/conjectures) and HYPOTHESIS (named candidate positions,
 * each a declared logical relationship to constraints) as separate types.
 * This module adds the piece Phase C of the mission asks for on top of
 * that: the actual mathematical MODELs those hypotheses and the physics
 * cases rest on, as real `ScientificModel` objects (the existing generic
 * container from `scientificModel.ts` — reused here, not duplicated).
 *
 * WHY THESE MODELS STAY GENERATED_MODEL, NEVER VALIDATED: `validateModel`
 * only upgrades a model's status by actually checking it against
 * independently measured data points. No independently measured GPS or
 * Pound-Rebka dataset is retrievable in this runtime (the acquisition
 * layer's blocked-source audit already established that scientific data
 * APIs are blocked by the execution environment's egress proxy). Calling
 * `validateModel` here with zero data points and reporting the real,
 * honest `INCONCLUSIVE` result is the correct behaviour — inventing a
 * "measured" data point to force a VALIDATED status would be exactly the
 * kind of fabrication this engine refuses to do.
 */
import { SPEED_OF_LIGHT_M_PER_S, PHYSICAL_CONSTANTS } from './relativisticTimeDilation';
import { buildScientificModel, validateModel, type ModelDataPoint, type ScientificModel } from '../molecular/scientificModel';

export const SPACETIME_MODELS_VERSION = '1.0.0';

/**
 * Weak-field special-relativistic time dilation: dτ/dt ≈ 1 - v²/(2c²), i.e.
 * a moving clock's fractional rate deficit is v²/(2c²).
 */
export const SR_TIME_DILATION_MODEL: ScientificModel = buildScientificModel({
  modelId: 'sr-time-dilation-weak-field',
  statement: 'A clock moving at speed v relative to a stationary observer runs slow by a fractional rate deficit of v^2/(2c^2), to first order in v/c.',
  equationText: 'fractionalDeficit = v^2 / (2 * c^2)',
  variables: [
    { symbol: 'v', meaning: 'Speed of the moving clock relative to the stationary observer', unit: 'm/s', role: 'INPUT' },
    { symbol: 'fractionalDeficit', meaning: 'Fractional rate deficit of the moving clock', unit: 'dimensionless', role: 'OUTPUT' },
  ],
  parameters: [
    { symbol: 'c', meaning: 'Speed of light in vacuum', unit: 'm/s', value: SPEED_OF_LIGHT_M_PER_S, source: 'LITERATURE_VALUE' },
  ],
  assumptions: [
    'Weak-field / low-velocity regime: v << c, so the first-order Taylor expansion of the exact Lorentz factor is an adequate approximation.',
    'Special relativity applies (flat spacetime, or gravitational curvature negligible over the relevant path) — this model does not itself include gravitational time dilation.',
  ],
  evidenceDependencyIds: [],
});

/**
 * Weak-field general-relativistic gravitational time dilation: a clock at
 * radius rHigh (higher in the potential, i.e. farther out) runs fast
 * relative to one at rLow by a fractional excess of (GM/c^2)(1/rLow - 1/rHigh).
 */
export const GR_TIME_DILATION_MODEL: ScientificModel = buildScientificModel({
  modelId: 'gr-time-dilation-weak-field',
  statement: 'A clock at radial distance rHigh from a gravitating body runs fast, relative to one at rLow < rHigh, by a fractional rate excess of (GM/c^2)(1/rLow - 1/rHigh), to first order in the weak-field limit.',
  equationText: 'fractionalExcess = (GM / c^2) * (1/rLow - 1/rHigh)',
  variables: [
    { symbol: 'rLow', meaning: 'Radial distance of the lower (deeper-potential) clock', unit: 'm', role: 'INPUT' },
    { symbol: 'rHigh', meaning: 'Radial distance of the higher (shallower-potential) clock', unit: 'm', role: 'INPUT' },
    { symbol: 'fractionalExcess', meaning: 'Fractional rate excess of the higher clock relative to the lower one', unit: 'dimensionless', role: 'OUTPUT' },
  ],
  parameters: [
    { symbol: 'GM', meaning: 'Standard gravitational parameter of the central body', unit: 'm^3/s^2', value: PHYSICAL_CONSTANTS.earthGravitationalParameter!.value, source: 'LITERATURE_VALUE' },
    { symbol: 'c', meaning: 'Speed of light in vacuum', unit: 'm/s', value: SPEED_OF_LIGHT_M_PER_S, source: 'LITERATURE_VALUE' },
  ],
  assumptions: [
    'Weak-field regime: GM/(rc^2) << 1 at both radii, so the first-order expansion of the Schwarzschild metric time component is an adequate approximation.',
    'The gravitating body is treated as spherically symmetric and non-rotating (the Lense-Thirring frame-dragging correction is neglected).',
  ],
  evidenceDependencyIds: [],
});

/**
 * Weak-field gravitational frequency shift for light climbing height h in a
 * locally uniform field g: Delta f / f ≈ -g h / c^2.
 */
export const GRAVITATIONAL_REDSHIFT_MODEL: ScientificModel = buildScientificModel({
  modelId: 'gravitational-redshift-weak-field',
  statement: 'Light climbing height h in a locally uniform gravitational field of acceleration g is redshifted by a fractional frequency shift of -g h / c^2.',
  equationText: 'fractionalShift = -(g * h) / c^2',
  variables: [
    { symbol: 'g', meaning: 'Local gravitational acceleration', unit: 'm/s^2', role: 'INPUT' },
    { symbol: 'h', meaning: 'Height climbed against the field', unit: 'm', role: 'INPUT' },
    { symbol: 'fractionalShift', meaning: 'Fractional frequency shift (negative = redshift)', unit: 'dimensionless', role: 'OUTPUT' },
  ],
  parameters: [
    { symbol: 'c', meaning: 'Speed of light in vacuum', unit: 'm/s', value: SPEED_OF_LIGHT_M_PER_S, source: 'LITERATURE_VALUE' },
  ],
  assumptions: [
    'The field is treated as locally uniform over the height h — valid when h is far smaller than the gravitating body\'s radius.',
    'Weak-field regime: g*h/c^2 << 1, so the first-order linearisation of the exact Schwarzschild redshift is an adequate approximation.',
  ],
  evidenceDependencyIds: [],
});

/**
 * Every declared spacetime model, in one registry — the analogue of
 * ESTABLISHED_SPACETIME_CONSTRAINTS and SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES,
 * but for MODEL/EQUATION rather than CONSTRAINT or HYPOTHESIS.
 */
export const SPACETIME_MODELS: readonly ScientificModel[] = [
  SR_TIME_DILATION_MODEL,
  GR_TIME_DILATION_MODEL,
  GRAVITATIONAL_REDSHIFT_MODEL,
];

/**
 * Runs the REAL validateModel() check. Defaults to ZERO data points, because
 * no independently measured GPS or Pound-Rebka dataset is retrievable in
 * this runtime — that default is not a placeholder, it is the honest,
 * correct output of the real validation machinery when no measured evidence
 * exists yet (INCONCLUSIVE, with a stated reason, never silently upgraded to
 * VALIDATED). A caller that DOES obtain real measured data points may pass
 * them here — the evaluator is the real formula either way.
 */
export function attemptSpacetimeModelValidation(model: ScientificModel, dataPoints: readonly ModelDataPoint[] = []): ScientificModel {
  return validateModel(
    model,
    dataPoints,
    (parameters, inputs) => {
      if (model.modelId === 'sr-time-dilation-weak-field') {
        const v = inputs.v;
        const c = parameters.c;
        if (v === undefined || c === undefined) return null;
        return (v * v) / (2 * c * c);
      }
      if (model.modelId === 'gr-time-dilation-weak-field') {
        const rLow = inputs.rLow;
        const rHigh = inputs.rHigh;
        const gm = parameters.GM;
        const c = parameters.c;
        if (rLow === undefined || rHigh === undefined || gm === undefined || c === undefined) return null;
        return (gm / (c * c)) * (1 / rLow - 1 / rHigh);
      }
      if (model.modelId === 'gravitational-redshift-weak-field') {
        const g = inputs.g;
        const h = inputs.h;
        const c = parameters.c;
        if (g === undefined || h === undefined || c === undefined) return null;
        return -(g * h) / (c * c);
      }
      return null;
    },
    1e-9,
  );
}
