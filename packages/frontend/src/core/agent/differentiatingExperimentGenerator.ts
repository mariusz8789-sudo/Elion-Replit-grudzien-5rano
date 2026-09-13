import { fnv1a, canonicalJson } from '../events/hash';
import {
  TAU_DISCRIMINABILITY,
  classifyObservationGap,
  createObservationGapRequest,
  undeclaredFeasibility,
  type ObservationGapRequest,
  type ObservationGapFeasibility,
} from './observationGap';

/**
 * PHASE G, G2 — DIFFERENTIATING EXPERIMENT GENERATOR.
 *
 * The mandate's own framing: `UNRESOLVED_SURVIVORS` must lead to a
 * discriminating experiment, never a bare `STOP` and never a random new
 * hypothesis. This module is that step, built as an extension of the
 * EXISTING M1 discriminability discipline (`observationGap.ts`) — it does
 * not invent a second discriminability statistic. `TAU_DISCRIMINABILITY`
 * (1 sigma) is imported, not redefined; when nothing available clears it,
 * this module builds a REAL `ObservationGapRequest` via
 * `createObservationGapRequest`, unmodified.
 *
 * THE ALGORITHM, PLAINLY:
 *   1. PredictionMatrix — every (hypothesis, observable) pair. A hypothesis
 *      with no quantitative prediction for an observable is not silently
 *      skipped: it is a real, reported `EXPERIMENT_GAP` on that pair.
 *   2. For each AVAILABLE observable, discriminability = the worst-case
 *      (minimum) pairwise |prediction difference| / sigma across every
 *      hypothesis pair — the same "how many sigma apart" measure
 *      `observationGap.ts` already uses, computed pairwise here because a
 *      real experiment must be judged by the LEAST it separates, not the
 *      most (an experiment that separates two hypotheses by 10 sigma while
 *      leaving a third tied is not "highly discriminating" in any useful
 *      sense).
 *   3. `falsificationPower` — the FRACTION of hypothesis pairs an
 *      observable would actually separate (>= TAU_DISCRIMINABILITY),
 *      disclosed as exactly that fraction, never inflated.
 *   4. The generator selects the best AVAILABLE observable. Pairs it
 *      cannot separate are named explicitly as `unresolvedPairs` — never
 *      silently dropped. For each named unresolved pair, if a NOT-available
 *      observable exists that WOULD separate it, a real `ObservationGapRequest`
 *      is raised for the best such observable.
 *   5. The decision rule (which hypothesis "wins" at which observed value)
 *      is computed and FROZEN (fingerprinted) before this module has any
 *      access to a real observation — there is no code path in this file
 *      that reads an `observedValue` before computing `decisionRuleFingerprint`.
 */

export const DIFFERENTIATING_EXPERIMENT_GENERATOR_CONTRACT_VERSION = '1.0.0';

export interface HypothesisPrediction {
  readonly hypothesisId: string;
  /** `null` — this hypothesis makes no quantitative prediction for this observable; a real, reported EXPERIMENT_GAP, never a silent skip. */
  readonly predictions: Readonly<Record<string, number | null>>;
}

export interface CandidateObservable {
  readonly observableId: string;
  readonly quantity: string;
  readonly unit: string;
  readonly instrumentClass: string;
  readonly available: boolean;
  /** The real measurement uncertainty at this observable — required to express discriminability in sigma units, exactly as observationGap.ts does. */
  readonly sigma: number;
}

export interface PredictionMatrixEntry {
  readonly hypothesisId: string;
  readonly observableId: string;
  readonly prediction: number | null;
}

export type PredictionMatrix = readonly PredictionMatrixEntry[];

export function buildPredictionMatrix(hypotheses: readonly HypothesisPrediction[], observables: readonly CandidateObservable[]): PredictionMatrix {
  const entries: PredictionMatrixEntry[] = [];
  for (const h of hypotheses) {
    for (const o of observables) {
      entries.push({ hypothesisId: h.hypothesisId, observableId: o.observableId, prediction: h.predictions[o.observableId] ?? null });
    }
  }
  return entries;
}

/** Every (hypothesis, observable) pair where the hypothesis made no quantitative prediction — a real, reported gap in the matrix itself. */
export function experimentGaps(matrix: PredictionMatrix): readonly { readonly hypothesisId: string; readonly observableId: string }[] {
  return matrix.filter((e) => e.prediction === null).map((e) => ({ hypothesisId: e.hypothesisId, observableId: e.observableId }));
}

export interface UnresolvedPair {
  readonly hypothesisA: string;
  readonly hypothesisB: string;
  readonly discriminability: number | null;
}

export interface ObservableAssessment {
  readonly observableId: string;
  /** The worst-case (minimum) pairwise discriminability, in units of this observable's own sigma. `null` when fewer than 2 hypotheses made a real prediction here. */
  readonly discriminability: number | null;
  /** Fraction of hypothesis pairs this observable would separate at >= TAU_DISCRIMINABILITY. */
  readonly falsificationPower: number;
  readonly unresolvedPairs: readonly UnresolvedPair[];
}

function pairwiseDiscriminability(matrix: PredictionMatrix, observableId: string, sigma: number): { readonly assessment: ObservableAssessment } {
  const entries = matrix.filter((e) => e.observableId === observableId && e.prediction !== null);
  const pairs: UnresolvedPair[] = [];
  let worst: number | null = null;
  let separated = 0;
  let total = 0;
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i]!;
      const b = entries[j]!;
      const diff = Math.abs((a.prediction as number) - (b.prediction as number)) / sigma;
      total += 1;
      if (diff >= TAU_DISCRIMINABILITY) {
        separated += 1;
      } else {
        pairs.push({ hypothesisA: a.hypothesisId, hypothesisB: b.hypothesisId, discriminability: diff });
      }
      worst = worst === null ? diff : Math.min(worst, diff);
    }
  }
  return {
    assessment: {
      observableId,
      discriminability: worst,
      falsificationPower: total > 0 ? separated / total : 0,
      unresolvedPairs: pairs,
    },
  };
}

export function assessObservable(matrix: PredictionMatrix, observableId: string, sigma: number): ObservableAssessment {
  return pairwiseDiscriminability(matrix, observableId, sigma).assessment;
}

export type ExperimentFeasibility = 'AVAILABLE' | 'GAP_REQUIRED';

export interface DecisionRuleEntry {
  readonly hypothesisId: string;
  readonly expectedOutcome: number;
  /** Survives if the real observed value falls within this many sigma of `expectedOutcome`. */
  readonly toleranceSigma: number;
}

export interface DiscriminatingExperimentSpec {
  readonly observableId: string;
  readonly requiredData: CandidateObservable;
  readonly expectedOutcomePerHypothesis: readonly DecisionRuleEntry[];
  /** Computed and frozen BEFORE any real observation is read — see module doc. */
  readonly decisionRuleFingerprint: string;
  readonly discriminability: number | null;
  readonly falsificationPower: number;
  readonly feasibility: ExperimentFeasibility;
  readonly unresolvedPairs: readonly UnresolvedPair[];
  readonly stopCondition: string;
  /**
   * When this experiment leaves pairs unresolved AND a currently-unavailable
   * observable would resolve them, a real M1 gap request for that observable
   * — raised in the SAME call, never deferred to a second pass that might
   * silently drop it. `null` only when either no pairs are left unresolved,
   * or nothing knowable would resolve the ones that remain.
   */
  readonly followUpGapRequest: ObservationGapRequest | null;
}

export interface GenerateDifferentiatingExperimentInput {
  readonly hypotheses: readonly HypothesisPrediction[];
  readonly observables: readonly CandidateObservable[];
  readonly campaignId: string;
  readonly round: number;
}

export type GenerateDifferentiatingExperimentResult =
  | { readonly outcome: 'EXPERIMENT_SELECTED'; readonly spec: DiscriminatingExperimentSpec }
  | { readonly outcome: 'NO_DISCRIMINATING_EXPERIMENT_AVAILABLE'; readonly reason: string; readonly gapRequest: ObservationGapRequest | null; readonly unresolvedPairs: readonly UnresolvedPair[] };

function freezeDecisionRule(observableId: string, entries: readonly DecisionRuleEntry[]): string {
  return fnv1a(canonicalJson({ observableId, entries }));
}

function buildDecisionRule(matrix: PredictionMatrix, observableId: string): readonly DecisionRuleEntry[] {
  return matrix
    .filter((e) => e.observableId === observableId && e.prediction !== null)
    .map((e) => ({ hypothesisId: e.hypothesisId, expectedOutcome: e.prediction as number, toleranceSigma: TAU_DISCRIMINABILITY }));
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

/**
 * Among not-available observables, the one that actually resolves at least
 * one of `pairsToResolve` — i.e. one of those pairs is NOT among ITS OWN
 * `unresolvedPairs` (which, by construction, only ever lists pairs BELOW
 * `TAU_DISCRIMINABILITY`; a target pair absent from it is a pair this
 * observable separates at >=1 sigma). Never gated on this observable's
 * OWN worst-case pair, which may be irrelevant to the pairs we actually
 * need resolved.
 */
function findResolvingUnavailableObservable(
  unavailable: readonly { readonly observable: CandidateObservable; readonly assessment: ObservableAssessment }[],
  pairsToResolve: readonly UnresolvedPair[],
): { readonly observable: CandidateObservable; readonly assessment: ObservableAssessment } | undefined {
  const targetKeys = new Set(pairsToResolve.map((p) => pairKey(p.hypothesisA, p.hypothesisB)));
  const candidates = unavailable
    .map((a) => {
      const resolvedKeys = new Set(a.assessment.unresolvedPairs.map((p) => pairKey(p.hypothesisA, p.hypothesisB)));
      const resolvedTargetCount = [...targetKeys].filter((k) => !resolvedKeys.has(k)).length;
      return { ...a, resolvedTargetCount };
    })
    .filter((a) => a.resolvedTargetCount > 0);
  return candidates.sort((a, b) => b.resolvedTargetCount - a.resolvedTargetCount || (b.assessment.discriminability ?? 0) - (a.assessment.discriminability ?? 0))[0];
}

function raiseGapRequest(
  input: GenerateDifferentiatingExperimentInput,
  liveHypothesisIds: readonly string[],
  bestAvailableDiscriminability: number | null,
  resolver: { readonly observable: CandidateObservable; readonly assessment: ObservableAssessment },
): ObservationGapRequest {
  const trigger = classifyObservationGap({ unobservedCount: 1, bestDiscriminability: bestAvailableDiscriminability }) ?? 'NO_ATTACHED_EXPERIMENT';
  const feasibility: ObservationGapFeasibility = undeclaredFeasibility(`Observable "${resolver.observable.observableId}" is not currently available to this campaign; feasibility of obtaining it is not declared here.`);
  return createObservationGapRequest({
    campaignId: input.campaignId,
    round: input.round,
    liveHypothesisIds,
    unobservedCount: 1,
    bestDiscriminability: resolver.assessment.discriminability,
    trigger,
    requiredObservable: { quantity: resolver.observable.quantity, unit: resolver.observable.unit, instrumentClass: resolver.observable.instrumentClass },
    feasibility,
    requestedFrom: 'EXTERNAL_DATASET',
  });
}

/**
 * The generator. Selects the best AVAILABLE observable — the one with the
 * HIGHEST `falsificationPower` (the fraction of live hypothesis pairs it
 * actually separates at >=1 sigma), never gated on its worst-case pair: an
 * observable that separates 2 of 3 pairs cleanly is a real, useful
 * experiment even though a third pair remains tied on it. Ties broken by
 * the best-case (maximum) pairwise discriminability. Whenever pairs
 * remain unresolved — whether an experiment was selected or not — checks
 * for a currently-unavailable observable that would resolve them and, if
 * one exists, raises a real `ObservationGapRequest` for it IN THE SAME
 * CALL. Never a silent stop, and never two separate passes where the
 * second could be skipped.
 */
export function generateDifferentiatingExperiment(input: GenerateDifferentiatingExperimentInput): GenerateDifferentiatingExperimentResult {
  const matrix = buildPredictionMatrix(input.hypotheses, input.observables);
  const liveHypothesisIds = input.hypotheses.map((h) => h.hypothesisId).sort();

  const assessments = input.observables.map((o) => ({ observable: o, assessment: assessObservable(matrix, o.observableId, o.sigma) }));
  const available = assessments.filter((a) => a.observable.available && a.assessment.discriminability !== null);
  const unavailable = assessments.filter((a) => !a.observable.available && a.assessment.discriminability !== null);

  const bestAvailable = available
    .filter((a) => a.assessment.falsificationPower > 0)
    .sort((a, b) => b.assessment.falsificationPower - a.assessment.falsificationPower || (b.assessment.discriminability ?? 0) - (a.assessment.discriminability ?? 0))[0];

  if (bestAvailable !== undefined) {
    const decisionRule = buildDecisionRule(matrix, bestAvailable.observable.observableId);
    const resolver = bestAvailable.assessment.unresolvedPairs.length > 0
      ? findResolvingUnavailableObservable(unavailable, bestAvailable.assessment.unresolvedPairs)
      : undefined;
    const spec: DiscriminatingExperimentSpec = {
      observableId: bestAvailable.observable.observableId,
      requiredData: bestAvailable.observable,
      expectedOutcomePerHypothesis: decisionRule,
      decisionRuleFingerprint: freezeDecisionRule(bestAvailable.observable.observableId, decisionRule),
      discriminability: bestAvailable.assessment.discriminability,
      falsificationPower: bestAvailable.assessment.falsificationPower,
      feasibility: 'AVAILABLE',
      unresolvedPairs: bestAvailable.assessment.unresolvedPairs,
      stopCondition: bestAvailable.assessment.unresolvedPairs.length === 0
        ? 'All live hypothesis pairs are separated by this observable at >=1 sigma.'
        : `${bestAvailable.assessment.unresolvedPairs.length} pair(s) remain unresolved by this observable alone: ${bestAvailable.assessment.unresolvedPairs.map((p) => `${p.hypothesisA} vs ${p.hypothesisB}`).join(', ')}.`,
      followUpGapRequest: resolver ? raiseGapRequest(input, liveHypothesisIds, bestAvailable.assessment.discriminability, resolver) : null,
    };
    return { outcome: 'EXPERIMENT_SELECTED', spec };
  }

  // Nothing available clears the threshold at all.
  const worstUnresolvedPairs = available.length > 0
    ? available.sort((a, b) => (b.assessment.discriminability ?? 0) - (a.assessment.discriminability ?? 0))[0]!.assessment.unresolvedPairs
    : assessments[0] !== undefined
      ? assessObservable(matrix, assessments[0].observable.observableId, assessments[0].observable.sigma).unresolvedPairs
      : [];

  const resolver = findResolvingUnavailableObservable(unavailable, worstUnresolvedPairs.length > 0 ? worstUnresolvedPairs : unavailable[0]?.assessment.unresolvedPairs ?? []);

  if (resolver === undefined) {
    return {
      outcome: 'NO_DISCRIMINATING_EXPERIMENT_AVAILABLE',
      reason: 'No available or knowable observable separates the live hypotheses at >=1 sigma.',
      gapRequest: null,
      unresolvedPairs: worstUnresolvedPairs,
    };
  }

  const gapRequest = raiseGapRequest(input, liveHypothesisIds, available[0]?.assessment.discriminability ?? null, resolver);
  return {
    outcome: 'NO_DISCRIMINATING_EXPERIMENT_AVAILABLE',
    reason: `No AVAILABLE observable separates the live hypotheses at >=1 sigma, but "${resolver.observable.observableId}" (not currently available) would (discriminability ${resolver.assessment.discriminability?.toFixed(4)}sigma) — a gap request was raised for it.`,
    gapRequest,
    unresolvedPairs: resolver.assessment.unresolvedPairs,
  };
}
