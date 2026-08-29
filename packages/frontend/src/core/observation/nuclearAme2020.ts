import { canonicalJson, fnv1a } from '../events/hash';
import { semfBindingPerNucleon } from '../physics';

export const AME2020_RAW_SHA256 = 'e8599c6d7f724fac91934e59f1b9de8fb8f63e820f4b39456b790665ed2a3307';
export const AME2020_SOURCE_URL = 'https://www-nds.iaea.org/amdc/ame2020/mass_1.mas20.txt';
export const AME2020_TRANSFORM_ID = 'ame2020-binding-energy-per-nucleon-fixed-width';
export const AME2020_TRANSFORM_VERSION = '1.0.0';

export type NuclearObservationStatus = 'MATCH' | 'DRIFT' | 'INCONCLUSIVE';
export type CalibrationStatus = 'INSUFFICIENT_DATA' | 'AVAILABLE';

export interface Ame2020Observation {
  readonly nuclide: string;
  readonly protonNumber: number;
  readonly neutronNumber: number;
  readonly massNumber: number;
  readonly bindingEnergyPerNucleonMeV: number;
  readonly uncertaintyMeV: number;
  readonly estimated: boolean;
  readonly sourceLine: number;
}

export interface NuclearObservationComparison {
  readonly nuclide: string;
  readonly modelId: 'nuclear-semf';
  readonly observable: 'bindingEnergyPerNucleon';
  readonly unit: 'MeV/nucleon';
  readonly prediction: number;
  readonly observation: number;
  readonly observationUncertainty: number;
  readonly absoluteError: number;
  readonly relativeError: number;
  readonly tolerance: number;
  readonly status: NuclearObservationStatus;
  readonly reason: string;
  readonly provenanceFingerprint: string;
}

export interface Ame2020Comparison {
  readonly fixtureId: string;
  readonly modelId: 'nuclear-semf';
  readonly observable: 'bindingEnergyPerNucleon';
  readonly unit: 'MeV/nucleon';
  readonly comparisons: readonly NuclearObservationComparison[];
  readonly meanAbsoluteError: number;
  readonly rootMeanSquareError: number;
  readonly calibration: {
    readonly status: CalibrationStatus;
    readonly reason: string;
  };
  readonly provenance: {
    readonly sourceUrl: string;
    readonly rawPayloadSha256: string;
    readonly transformId: string;
    readonly transformVersion: string;
    readonly replayInput: string;
  };
  readonly fingerprint: string;
}

/** Fixed, source-pinned AME2020 records. No network access is used at runtime. */
export const AME2020_OBSERVATIONS: readonly Ame2020Observation[] = [
  { nuclide: 'Fe-56', protonNumber: 26, neutronNumber: 30, massNumber: 56, bindingEnergyPerNucleonMeV: 8.7903563, uncertaintyMeV: 0.0000048, estimated: false, sourceLine: 547 },
  { nuclide: 'Ni-62', protonNumber: 28, neutronNumber: 34, massNumber: 62, bindingEnergyPerNucleonMeV: 8.7945555, uncertaintyMeV: 0.0000069, estimated: false, sourceLine: 629 },
  { nuclide: 'Pb-208', protonNumber: 82, neutronNumber: 126, massNumber: 208, bindingEnergyPerNucleonMeV: 7.867453, uncertaintyMeV: 0.0000055, estimated: false, sourceLine: 2878 },
] as const;

const DEFAULT_TOLERANCE_MEV_PER_NUCLEON = 0.05;

export function compareNuclearObservation(
  observation: Ame2020Observation,
  tolerance = DEFAULT_TOLERANCE_MEV_PER_NUCLEON,
): NuclearObservationComparison {
  const prediction = semfBindingPerNucleon(observation.protonNumber, observation.neutronNumber);
  const absoluteError = Math.abs(prediction - observation.bindingEnergyPerNucleonMeV);
  const relativeError = absoluteError / Math.abs(observation.bindingEnergyPerNucleonMeV);
  const status: NuclearObservationStatus = observation.estimated
    ? 'INCONCLUSIVE'
    : absoluteError <= tolerance
      ? 'MATCH'
      : 'DRIFT';
  const reason = observation.estimated
    ? 'AME2020 marks this value as estimated; it is retained but excluded from validation status.'
    : `Absolute error ${absoluteError.toFixed(6)} MeV/nucleon is ${absoluteError <= tolerance ? 'within' : 'outside'} the preregistered ${tolerance.toFixed(3)} MeV/nucleon model-error tolerance.`;

  return {
    nuclide: observation.nuclide,
    modelId: 'nuclear-semf',
    observable: 'bindingEnergyPerNucleon',
    unit: 'MeV/nucleon',
    prediction,
    observation: observation.bindingEnergyPerNucleonMeV,
    observationUncertainty: observation.uncertaintyMeV,
    absoluteError,
    relativeError,
    tolerance,
    status,
    reason,
    provenanceFingerprint: fnv1a(canonicalJson({
      modelId: 'nuclear-semf',
      nuclide: observation.nuclide,
      z: observation.protonNumber,
      n: observation.neutronNumber,
      observable: 'bindingEnergyPerNucleon',
      prediction,
      observation: observation.bindingEnergyPerNucleonMeV,
      rawPayloadSha256: AME2020_RAW_SHA256,
      transformId: AME2020_TRANSFORM_ID,
      transformVersion: AME2020_TRANSFORM_VERSION,
    })),
  };
}

export function compareAme2020Observations(
  observations: readonly Ame2020Observation[] = AME2020_OBSERVATIONS,
  tolerance = DEFAULT_TOLERANCE_MEV_PER_NUCLEON,
): Ame2020Comparison {
  if (observations.length === 0) throw new Error('AME2020 comparison requires at least one observation');
  const comparisons = observations.map((observation) => compareNuclearObservation(observation, tolerance));
  const errors = comparisons.map((comparison) => comparison.absoluteError);
  const meanAbsoluteError = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  const rootMeanSquareError = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  const provenance = {
    sourceUrl: AME2020_SOURCE_URL,
    rawPayloadSha256: AME2020_RAW_SHA256,
    transformId: AME2020_TRANSFORM_ID,
    transformVersion: AME2020_TRANSFORM_VERSION,
    replayInput: 'Pinned docs/evidence/ame2020/mass_1.mas20.txt only; no network refetch permitted',
  } as const;
  const calibration = observations.length >= 10
    ? { status: 'AVAILABLE' as const, reason: 'At least ten preregistered observations are available for a calibration analysis.' }
    : { status: 'INSUFFICIENT_DATA' as const, reason: `Only ${observations.length} preregistered observations are available; no calibrated accuracy percentage is asserted.` };
  return {
    fixtureId: 'ame2020-nuclear-semf-admission',
    modelId: 'nuclear-semf',
    observable: 'bindingEnergyPerNucleon',
    unit: 'MeV/nucleon',
    comparisons,
    meanAbsoluteError,
    rootMeanSquareError,
    calibration,
    provenance,
    fingerprint: fnv1a(canonicalJson({ comparisons, provenance, calibration })),
  };
}
