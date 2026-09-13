import { canonicalJson, fnv1a } from '../events/hash';
import type { DataProvenance } from '../dataProvenance';
import type { ExternalDatasetProvenance } from './externalDatasetCase';

/**
 * OBSERVATION GAP — the point where the engine stops being an analyzer.
 *
 * Until now the planner's whole world was `CampaignLaboratory.candidateX`: a
 * closed list of experiments someone attached before the campaign started. It
 * always picked the best of that list, and "best" of a list that cannot settle
 * anything is still a choice to run something worthless. The honest move, when
 * no attached experiment separates the live models, is not to pick the least
 * bad one — it is to say WHAT MEASUREMENT IS MISSING and stop.
 *
 * That is all this module does. It classifies why the attached experiment
 * space is inadequate, records a request for the observation that would settle
 * the question, and refuses to obtain it. The refusal is the design:
 * `ObservationGapRequest` has no execute method, no fetch, no side effect. It
 * is a message to a human, a laboratory or a dataset owner, and it is FULFILLED
 * only by someone outside this process handing data back with custody.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *  - It does not estimate expected information gain. The trigger is the same
 *    DISCRIMINATION the planner already computes (prediction spread in units
 *    of the observation's own sigma), compared against a fixed disclosed
 *    threshold. No posterior exists in this codebase, so no EIG is claimed.
 *  - It does not invent feasibility. A laboratory that declares no instrument
 *    class, cost or lead time gets `null` on those fields and a `basis` string
 *    saying so — a request that admits it does not know what the measurement
 *    costs is useful; one that fabricates a number is not.
 *  - It does not upgrade anything it receives. Data returned against a gap is
 *    an OBSERVATION with provenance and custody, never a FACT.
 */

export const OBSERVATION_GAP_CONTRACT_VERSION = '1.0.0';

/**
 * Why the attached experiment space cannot settle the question. Three distinct
 * conditions, kept apart because they call for different responses from the
 * person reading the request.
 */
export type ObservationGapTrigger =
  /** There is nothing left to run: every attached experiment has been observed, or none was ever attached. */
  | 'NO_ATTACHED_EXPERIMENT'
  /** Something is left, but the best of it separates the live models by less than one observation's own uncertainty. */
  | 'LOW_DISCRIMINABILITY'
  /** Something is left, and the live models predict IDENTICAL values there — a strictly stronger statement than "too small to resolve". */
  | 'ZERO_SPREAD';

export type ObservationGapStatus = 'OPEN' | 'APPROVED' | 'DECLINED' | 'FULFILLED';

export type ObservationGapRecipient = 'HUMAN' | 'LABORATORY' | 'EXTERNAL_DATASET';

/** What would have to be measured. The engine knows the quantity; only the laboratory knows the instrument. */
export interface RequiredObservable {
  readonly quantity: string;
  readonly unit: string;
  /** `'UNDECLARED'` when the laboratory does not say — never guessed from the quantity's name. */
  readonly instrumentClass: string;
}

/**
 * Whether the measurement can actually be made. Every numeric field is
 * nullable on purpose: an undeclared cost is reported as unknown, and `basis`
 * always says where the numbers came from or why there are none.
 */
export interface ObservationGapFeasibility {
  readonly available: boolean | null;
  readonly costEstimate: number | null;
  readonly costUnit: string | null;
  readonly timeEstimate: string | null;
  readonly legalBoundary: string;
  readonly basis: string;
}

/** Who handled the fulfilling data, in order, so a reader can audit where it came from. */
export interface ChainOfCustodyStep {
  readonly handledBy: string;
  readonly action: string;
  readonly at: string;
}

export interface ObservationGapCustody {
  readonly steps: readonly ChainOfCustodyStep[];
  readonly provenance: DataProvenance;
  readonly dataset: ExternalDatasetProvenance | null;
}

export interface ObservationGapRequest {
  readonly contractVersion: string;
  readonly id: string;
  readonly campaignId: string;
  readonly round: number;
  /** The models still alive when the gap was found — the set the missing observation would have to separate. */
  readonly liveHypothesisIds: readonly string[];
  /** Best discrimination available over the attached space, in units of an observation's sigma. Null when nothing was left to score. */
  readonly discriminability: number | null;
  /** The threshold `discriminability` was judged against, carried so the verdict can be re-derived without reading this source. */
  readonly threshold: number;
  readonly trigger: ObservationGapTrigger;
  readonly requiredObservable: RequiredObservable;
  readonly feasibility: ObservationGapFeasibility;
  readonly rationale: string;
  readonly requestedFrom: ObservationGapRecipient;
  readonly status: ObservationGapStatus;
  readonly custody: ObservationGapCustody | null;
  readonly fingerprint: string;
}

/**
 * Below this, the widest disagreement among live models at the best remaining
 * experiment is smaller than one standard deviation of the measurement itself,
 * so running it cannot tell those models apart. One sigma is not a tuned
 * constant: it is the point at which a single observation's own noise covers
 * the entire gap between what the competing models predict.
 */
export const TAU_DISCRIMINABILITY = 1;

/** Spread this small is treated as exactly zero — the models are predictively identical over the attached space. */
export const TAU_ZERO_SPREAD = 1e-9;

/**
 * Names the inadequacy, or returns `null` when the attached space is fine and
 * the ordinary selector should proceed untouched. This is the whole decision;
 * everything else in this module is record-keeping.
 */
export function classifyObservationGap(input: {
  readonly unobservedCount: number;
  readonly bestDiscriminability: number | null;
}): ObservationGapTrigger | null {
  if (input.unobservedCount === 0) return 'NO_ATTACHED_EXPERIMENT';
  const best = input.bestDiscriminability;
  if (best === null || !Number.isFinite(best)) return 'NO_ATTACHED_EXPERIMENT';
  if (best <= TAU_ZERO_SPREAD) return 'ZERO_SPREAD';
  if (best < TAU_DISCRIMINABILITY) return 'LOW_DISCRIMINABILITY';
  return null;
}

function rationaleFor(
  trigger: ObservationGapTrigger,
  input: { readonly unobservedCount: number; readonly bestDiscriminability: number | null; readonly liveCount: number; readonly quantity: string },
): string {
  const live = `${input.liveCount} model(s) are still live`;
  switch (trigger) {
    case 'NO_ATTACHED_EXPERIMENT':
      return `${live} and every experiment this laboratory attached has already been observed, so there is nothing left to run. Separating them requires an observation of ${input.quantity} that is not in this laboratory's experiment space at all.`;
    case 'ZERO_SPREAD':
      return `${live} and they predict IDENTICAL values at all ${input.unobservedCount} remaining experiment(s) — running any of them would produce a number every live model already agrees on, which cannot falsify any of them. A different kind of observation of ${input.quantity} is required.`;
    case 'LOW_DISCRIMINABILITY':
      return `${live} and the best remaining experiment separates them by only ${input.bestDiscriminability?.toFixed(4)}× the observation's own sigma, below the ${TAU_DISCRIMINABILITY}σ threshold — the measurement noise would cover the entire disagreement. Running it would spend an experiment without discriminating.`;
  }
}

/**
 * Builds the request. The fingerprint covers everything that determines the
 * scientific content of the request — never `status` or `custody`, so a
 * request keeps its identity from OPEN through FULFILLED and a replay can
 * match it against the round that produced it.
 */
export function createObservationGapRequest(input: {
  readonly campaignId: string;
  readonly round: number;
  readonly liveHypothesisIds: readonly string[];
  readonly unobservedCount: number;
  readonly bestDiscriminability: number | null;
  readonly trigger: ObservationGapTrigger;
  readonly requiredObservable: RequiredObservable;
  readonly feasibility: ObservationGapFeasibility;
  readonly requestedFrom: ObservationGapRecipient;
}): ObservationGapRequest {
  const rationale = rationaleFor(input.trigger, {
    unobservedCount: input.unobservedCount,
    bestDiscriminability: input.bestDiscriminability,
    liveCount: input.liveHypothesisIds.length,
    quantity: input.requiredObservable.quantity,
  });
  const core = {
    contractVersion: OBSERVATION_GAP_CONTRACT_VERSION,
    campaignId: input.campaignId,
    round: input.round,
    liveHypothesisIds: [...input.liveHypothesisIds].sort(),
    discriminability: input.bestDiscriminability === null ? null : Number(input.bestDiscriminability.toPrecision(12)),
    threshold: TAU_DISCRIMINABILITY,
    trigger: input.trigger,
    requiredObservable: input.requiredObservable,
    feasibility: input.feasibility,
    requestedFrom: input.requestedFrom,
  };
  const fingerprint = fnv1a(canonicalJson(core));
  return {
    ...core,
    // Deterministic identity: the id IS the fingerprint, so two replays of the
    // same round produce the same request id rather than a fresh random one.
    id: `observation-gap:${fingerprint}`,
    liveHypothesisIds: core.liveHypothesisIds,
    rationale,
    status: 'OPEN',
    custody: null,
    fingerprint,
  };
}

export interface ObservationGapFulfilment {
  readonly custody: ObservationGapCustody;
  /** The measured value and its uncertainty, exactly as the supplier reported them. */
  readonly value: number;
  readonly sigma: number;
  readonly at: number;
}

/**
 * An observation supplied against a gap. It is deliberately a SEPARATE type
 * from anything the engine fits: classifying it, admitting it and refitting are
 * three different decisions, and this module only makes the first one.
 */
export interface FulfilledObservationGap {
  readonly request: ObservationGapRequest;
  /** Always `'OBSERVATION'`. Not a union: there is no code path by which supplied data becomes a FACT. */
  readonly epistemicStatus: 'OBSERVATION';
  readonly value: number;
  readonly sigma: number;
  readonly at: number;
  readonly fulfilmentFingerprint: string;
}

/**
 * Records that someone outside this process supplied the missing measurement.
 * Refuses data with no custody steps — an observation whose handling nobody
 * recorded is not evidence, and accepting it would make the custody field
 * decorative.
 */
export function fulfilObservationGap(
  request: ObservationGapRequest,
  fulfilment: ObservationGapFulfilment,
): FulfilledObservationGap | { readonly ok: false; readonly reason: string } {
  if (fulfilment.custody.steps.length === 0) {
    return { ok: false, reason: 'Refused: the supplied observation carries no chain of custody, so its handling cannot be audited.' };
  }
  if (!Number.isFinite(fulfilment.value) || !Number.isFinite(fulfilment.sigma) || fulfilment.sigma <= 0) {
    return { ok: false, reason: 'Refused: a fulfilling observation must carry a finite value and a positive sigma.' };
  }
  const fulfilled: ObservationGapRequest = { ...request, status: 'FULFILLED', custody: fulfilment.custody };
  return {
    request: fulfilled,
    epistemicStatus: 'OBSERVATION',
    value: fulfilment.value,
    sigma: fulfilment.sigma,
    at: fulfilment.at,
    fulfilmentFingerprint: fnv1a(canonicalJson({
      request: request.fingerprint,
      value: Number(fulfilment.value.toPrecision(12)),
      sigma: Number(fulfilment.sigma.toPrecision(12)),
      at: Number(fulfilment.at.toPrecision(12)),
      custody: fulfilment.custody,
    })),
  };
}

export type ObservationGapReplayStatus = 'MATCH' | 'DRIFT';

/** Mirrors `compareExternalDatasetCaseReplay`: identical fingerprint or it is drift. */
export function compareObservationGapReplay(
  first: Pick<ObservationGapRequest, 'fingerprint'>,
  second: Pick<ObservationGapRequest, 'fingerprint'>,
): ObservationGapReplayStatus {
  return first.fingerprint === second.fingerprint ? 'MATCH' : 'DRIFT';
}

/** One deterministic fingerprint over every gap a campaign raised, in order. */
export function observationGapLedgerFingerprint(requests: readonly ObservationGapRequest[]): string {
  return fnv1a(canonicalJson(requests.map((r) => r.fingerprint)));
}

/** The honest default when a laboratory declares no instrument: every unknown is reported as unknown. */
export function undeclaredFeasibility(reason: string): ObservationGapFeasibility {
  return {
    available: null,
    costEstimate: null,
    costUnit: null,
    timeEstimate: null,
    legalBoundary: 'UNDECLARED — this laboratory states no legal or ethical boundary for the requested measurement.',
    basis: reason,
  };
}
