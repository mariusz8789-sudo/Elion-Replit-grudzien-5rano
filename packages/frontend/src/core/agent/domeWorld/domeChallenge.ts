import { EXPERIMENT_FABRIC_VERSION, type StructuredExperimentRequest } from '../../experimentFabric/types';
import { createReferenceMeasurementRun, type ReferenceMeasurementRequest } from '../../experimentFabric/realExperiment';
import type { FalsificationCriterion } from '../../experimentFabric/scientificDiscovery';
import { verifyPredictionAgainstRealExperiment, type PredictionVerification } from '../predictionVerification';
import {
  DEFAULT_DOME_PARAMETERS, predictHorizonDistanceKm, predictShadowAngleDegrees,
  type DomeWorldParameters,
} from './domeModel';
import {
  ERATOSTHENES_GROUND_DISTANCE_KM, ERATOSTHENES_SHADOW_ANGLE, HORIZON_DISTANCE_1_7M,
  HORIZON_OBSERVER_HEIGHT_M, type DomeReferenceCitation,
} from './domeReferenceCitations';

/**
 * DOME WORLD CHALLENGE — the orchestration seam.
 *
 * This is deliberately NOT a new discovery/comparison engine. Every
 * prediction-vs-citation judgment below goes through the EXACT SAME two
 * functions the Real Experiment Contract already uses for REFERENCE data
 * (`createReferenceMeasurementRun`, `verifyPredictionAgainstRealExperiment`)
 * — the same machinery `RealExperimentPipeline.tsx` exercises for a manually
 * entered generator-sizing citation. Dome World is the first *autonomous*
 * consumer of that pipeline, not a second one.
 *
 * See `discoveryOrchestrator.ts`'s own module doc for why this is NOT
 * expressed as a fourth `DiscoveryRequest` shape: `MechanismRequest`/
 * `ParameterRequest`/`CalibrationRequest` all carry a WorldGraph-rooted
 * substrate (a lever catalog, a numeric probe sweep, a hidden-value world);
 * a dome-vs-sphere geometric claim is neither, so it is judged directly
 * against a citation, the same way `cyberInvestigation.ts` was judged to
 * need its own shape rather than a forced fit.
 */

export interface DomeChallengeCase {
  readonly caseId: string;
  readonly observableMetric: string;
  readonly unit: string;
  readonly predictedValue: number;
  readonly citation: DomeReferenceCitation;
  readonly verification: PredictionVerification;
}

export interface DomeChallengeResult {
  readonly parameters: DomeWorldParameters;
  readonly cases: readonly DomeChallengeCase[];
}

function structuredRequestFor(sourceText: string): StructuredExperimentRequest {
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    sourceText,
    domainId: 'dome-world',
    operation: 'compute',
    parameters: {},
  };
}

function buildCase(
  caseId: string,
  observableMetric: string,
  unit: string,
  predictedValue: number,
  citation: DomeReferenceCitation,
  sourceText: string,
): DomeChallengeCase {
  // No `expectedValue`: `evaluateTwoArmRelation` then uses the prediction itself
  // (the "baseline" it is called with) as the reference point, comparing it
  // against the cited value (the "variant") — exactly the shape this criterion
  // needs. Setting `expectedValue` to the citation's own value here would
  // compare the citation against itself and always report SUPPORTED
  // regardless of what the model predicted — a real bug caught before this
  // was ever run, not discovered by a failing test.
  const criterion: FalsificationCriterion = {
    metric: observableMetric,
    relation: 'equal-within-tolerance',
    tolerance: citation.uncertainty,
    rationale: `Dome-world model prediction for ${observableMetric}, judged against ${citation.sourceRef}.`,
  };

  const request: ReferenceMeasurementRequest = {
    structuredRequest: structuredRequestFor(sourceText),
    citation: { citationText: citation.citationText, sourceRef: citation.sourceRef },
  };

  const realRun = createReferenceMeasurementRun({
    request,
    derived: [{ outputKey: observableMetric, value: citation.measuredValue, unit: citation.unit }],
    summary: citation.citationText,
  });

  const verification = verifyPredictionAgainstRealExperiment({ predictedValue, criterion, realRun });

  return { caseId, observableMetric, unit, predictedValue, citation, verification };
}

/**
 * Runs the dome-world model's two testable predictions against their real
 * citations. No hidden truth, no hardcoded verdict: `predictedValue` is
 * computed purely from `params` before either citation is consulted, and
 * the verdict comes entirely from `verifyPredictionAgainstRealExperiment`'s
 * own tolerance check.
 */
export function runDomeWorldChallenge(params: DomeWorldParameters = DEFAULT_DOME_PARAMETERS): DomeChallengeResult {
  const shadowPrediction = predictShadowAngleDegrees(ERATOSTHENES_GROUND_DISTANCE_KM, params);
  const horizonPrediction = predictHorizonDistanceKm(HORIZON_OBSERVER_HEIGHT_M, params);

  const cases: DomeChallengeCase[] = [
    buildCase(
      'dome-shadow-angle', 'shadow_angle_degrees', 'degrees', shadowPrediction, ERATOSTHENES_SHADOW_ANGLE,
      `Predict the shadow angle at ${ERATOSTHENES_GROUND_DISTANCE_KM} km from the sub-solar point, sun height ${params.sunHeightKm} km.`,
    ),
    buildCase(
      'dome-horizon-distance', 'horizon_distance_km', 'km', horizonPrediction, HORIZON_DISTANCE_1_7M,
      `Predict the horizon distance for an observer at ${HORIZON_OBSERVER_HEIGHT_M} m height, atmospheric visibility ${params.atmosphericVisibilityKm} km.`,
    ),
  ];

  return { parameters: params, cases };
}
