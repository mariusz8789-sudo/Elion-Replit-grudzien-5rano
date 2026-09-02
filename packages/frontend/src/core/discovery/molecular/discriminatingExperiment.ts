import type { MoleculeCandidate } from './types';
import type { TestableHypothesis } from './experimentalResult';

/**
 * DISCRIMINATING EXPERIMENT ENGINE.
 *
 * Genesis already says REQUIRES_EXPERIMENT. This module answers the harder
 * question the mission asks next: WHICH experiment, and why that one first.
 *
 * THE SELECTION RULE IS DEFENSIBLE AND NARROW:
 *
 * An experiment is worth running first when its outcome would actually change
 * what Genesis believes. Two situations qualify, and they are ranked in this
 * order:
 *
 *  1. THE UNMEASURED PIVOT. The whole campaign rests on a property that has
 *     NO value at all for any candidate — here, target affinity. No amount of
 *     prediction resolves it, every candidate is equally unresolved, and until
 *     it is measured the ranking cannot be about biology. This dominates.
 *
 *  2. MAXIMUM PREDICTED DISAGREEMENT. Among properties that DO have values,
 *     the informative one is where the top candidates most disagree: measuring
 *     an endpoint they all share tells you nothing about which to pick, while
 *     measuring the one they most differ on splits the field.
 *
 * WHAT THIS MODULE REFUSES TO DO:
 *
 * It does not invent cost, duration, feasibility, sample requirements or
 * laboratory logistics — Genesis knows none of those, and a plausible-looking
 * fabricated number is worse than an absent one. `spread` is computed from
 * real predicted values; it is a measure of DISAGREEMENT AMONG PREDICTIONS,
 * explicitly not an expected-information-gain estimate, and it is labelled
 * that way wherever it appears.
 */
export const DISCRIMINATING_EXPERIMENT_VERSION = '1.0.0';

export type ExperimentPriority = 'UNMEASURED_PIVOT' | 'MAXIMUM_PREDICTED_DISAGREEMENT' | 'NO_DISCRIMINATION_AVAILABLE';

export interface CandidateSplit {
  /** Candidates predicted to fall on the higher side of the spread. */
  higher: readonly string[];
  lower: readonly string[];
  /** Candidates with no value for this property — the experiment says nothing about them. */
  unresolved: readonly string[];
}

export interface ProposedExperiment {
  experimentId: string;
  priority: ExperimentPriority;
  /** What to measure, in assay-neutral terms. Genesis does not prescribe a protocol. */
  measurement: string;
  target: string;
  parameter: string;
  why: string;
  whatItResolves: string;
  /** Candidate ids this measurement would actually separate. */
  discriminatesBetween: readonly string[];
  split: CandidateSplit;
  /** Real disagreement among predicted values; null for an unmeasured pivot. */
  predictedSpread: number | null;
  spreadInterpretation: string;
  hypothesis: TestableHypothesis;
  /** Stated honestly, including what Genesis cannot estimate. */
  limitations: readonly string[];
}

function numericValue(candidate: MoleculeCandidate, propertyId: string): number | null {
  const property = candidate.properties.find((p) => p.propertyId === propertyId);
  return property !== undefined && typeof property.value === 'number' ? property.value : null;
}

/**
 * Builds the pivot experiment: the one measuring a property that has NO value
 * anywhere. It discriminates nothing yet — that is exactly why it comes first.
 */
function pivotExperiment(
  candidates: readonly MoleculeCandidate[],
  target: string,
  parameter: string,
  threshold: number | null,
  thresholdUnit: string | null,
): ProposedExperiment {
  const ids = candidates.map((c) => c.candidateId);
  return {
    experimentId: `exp_pivot_${target}_${parameter}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    priority: 'UNMEASURED_PIVOT',
    measurement: `${parameter} of each candidate at ${target}`,
    target,
    parameter,
    why:
      `Every candidate on the front is equally unresolved at ${target}: there is no measured or predicted ${parameter} for any of them, `
      + 'so the current ranking is ordered entirely by physicochemical and ADMET predictions and contains no information about the biology the question is actually about. '
      + 'No further computation can resolve this — only a measurement can.',
    whatItResolves:
      `Whether any of these structures engages ${target} at all, and if so with what ${parameter}. `
      + 'It converts the campaign\'s central REQUIRES_EXPERIMENT into either evidence or a refutation.',
    discriminatesBetween: ids,
    split: { higher: [], lower: [], unresolved: ids },
    predictedSpread: null,
    spreadInterpretation: 'No spread exists because no candidate has any value for this property — that absence is the reason this experiment ranks first.',
    hypothesis: {
      hypothesisId: `h_${target}_${parameter}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      statement: `At least one front candidate engages ${target} with a ${parameter} at least as favourable as the reference compound's measured value.`,
      target,
      parameter,
      supportedIf: `A measured ${parameter} at or below the reference threshold would support extrapolating the reference's mechanism to that candidate.`,
      falsifiedIf: `A measured ${parameter} above the threshold — or no detectable engagement — refutes the extrapolation for that candidate, and the prerequisite filter that retained it is shown to be insufficient.`,
      threshold,
      thresholdUnit,
      lowerIsSupport: true,
    },
    limitations: [
      'Genesis is not proposing a protocol, a concentration range, a cost or a timeline — it has no basis for any of those and does not invent them.',
      'A negative result at this target does not establish that a candidate is inactive everywhere, nor that it is safe.',
    ],
  };
}

export interface DiscriminationRequest {
  /** Usually the Pareto front — the candidates actually in contention. */
  candidates: readonly MoleculeCandidate[];
  /** The property the campaign rests on but cannot value. */
  pivot: { target: string; parameter: string; threshold: number | null; thresholdUnit: string | null };
  /** Predicted properties eligible for the disagreement analysis. */
  comparableProperties: readonly { propertyId: string; target: string; parameter: string; lowerIsSupport: boolean }[];
}

/**
 * Proposes the next experiments, most informative first.
 *
 * Returns a LIST because the second-ranked experiment is genuinely useful
 * information — but the ordering is the answer to "which one first".
 */
export function proposeDiscriminatingExperiments(request: DiscriminationRequest): readonly ProposedExperiment[] {
  const proposals: ProposedExperiment[] = [];

  // 1. The pivot always leads when the property is genuinely unvalued.
  const pivotHasAnyValue = request.candidates.some((c) => numericValue(c, request.pivot.parameter) !== null);
  if (!pivotHasAnyValue) {
    proposals.push(pivotExperiment(request.candidates, request.pivot.target, request.pivot.parameter, request.pivot.threshold, request.pivot.thresholdUnit));
  }

  // 2. Properties with real values, ranked by how much the candidates disagree.
  const scored: { proposal: ProposedExperiment; spread: number }[] = [];
  for (const property of request.comparableProperties) {
    const valued = request.candidates
      .map((c) => ({ id: c.candidateId, value: numericValue(c, property.propertyId) }))
      .filter((v): v is { id: string; value: number } => v.value !== null);
    const unresolved = request.candidates
      .filter((c) => numericValue(c, property.propertyId) === null)
      .map((c) => c.candidateId);

    if (valued.length < 2) continue;

    const values = valued.map((v) => v.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min;
    if (spread <= 0) continue;

    const midpoint = (min + max) / 2;
    const higher = valued.filter((v) => v.value > midpoint).map((v) => v.id);
    const lower = valued.filter((v) => v.value <= midpoint).map((v) => v.id);

    scored.push({
      spread,
      proposal: {
        experimentId: `exp_split_${property.propertyId}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        priority: 'MAXIMUM_PREDICTED_DISAGREEMENT',
        measurement: `${property.parameter} (${property.propertyId}) for the front candidates`,
        target: property.target,
        parameter: property.parameter,
        why:
          `The front candidates' predictions for ${property.propertyId} disagree across a range of ${spread.toFixed(4)} `
          + `(${min.toFixed(4)} to ${max.toFixed(4)}). Measuring an endpoint they agree on would not change the ordering; this is the endpoint where a measurement could.`,
        whatItResolves:
          `Whether the model's disagreement on ${property.propertyId} reflects a real difference between these structures, `
          + 'or is noise in a predictor that was never validated on this chemical series.',
        discriminatesBetween: valued.map((v) => v.id),
        split: { higher, lower, unresolved },
        predictedSpread: spread,
        spreadInterpretation:
          'This number is the observed range of MODEL PREDICTIONS across the front. It measures disagreement between predictions, '
          + 'NOT expected information gain, and it is not a probability. A wide spread among unvalidated predictions may simply mean the model is unreliable here.',
        hypothesis: {
          hypothesisId: `h_${property.propertyId}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          statement: `Measured ${property.parameter} separates the front candidates in the direction the model predicts.`,
          target: property.target,
          parameter: property.parameter,
          supportedIf: `Measured values preserve the predicted ordering between the higher and lower groups.`,
          falsifiedIf: 'Measured values collapse the predicted difference, or invert the ordering — either outcome shows the predictor does not transfer to this series.',
          threshold: midpoint,
          thresholdUnit: 'probability',
          lowerIsSupport: property.lowerIsSupport,
        },
        limitations: [
          'The spread is between predictions from a model that has not been validated on this chemical series; it is not evidence that the candidates truly differ.',
          'Genesis does not estimate cost, duration or feasibility for this measurement.',
        ],
      },
    });
  }

  scored.sort((a, b) => b.spread - a.spread || a.proposal.experimentId.localeCompare(b.proposal.experimentId));
  proposals.push(...scored.map((s) => s.proposal));

  if (proposals.length === 0) {
    return [{
      experimentId: 'exp_none',
      priority: 'NO_DISCRIMINATION_AVAILABLE',
      measurement: 'None proposed.',
      target: request.pivot.target,
      parameter: request.pivot.parameter,
      why: 'No property has values for two or more candidates, so no measurement in scope would separate them.',
      whatItResolves: 'Nothing can be proposed on the evidence available.',
      discriminatesBetween: [],
      split: { higher: [], lower: [], unresolved: request.candidates.map((c) => c.candidateId) },
      predictedSpread: null,
      spreadInterpretation: 'Not applicable.',
      hypothesis: {
        hypothesisId: 'h_none',
        statement: 'No testable hypothesis could be formed from this candidate set.',
        target: request.pivot.target,
        parameter: request.pivot.parameter,
        supportedIf: 'Not applicable.',
        falsifiedIf: 'Not applicable.',
        threshold: null,
        thresholdUnit: null,
        lowerIsSupport: true,
      },
      limitations: ['This is a real dead end for the current candidate set, reported rather than papered over.'],
    }];
  }

  return proposals;
}
