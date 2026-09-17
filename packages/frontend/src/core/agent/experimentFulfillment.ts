import type { ObservationGapRequest, ObservationGapCustody, ChainOfCustodyStep, FulfilledObservationGap } from './observationGap';
import { fulfilObservationGap } from './observationGap';
import type { DataProvenance } from '../dataProvenance';
import type { DatasetLaboratory } from './datasetLaboratory';
import { runDiscoveryCampaign, type CampaignLaboratory, type CampaignOptions, type CampaignResult } from './discoveryCampaign';

/**
 * E5 — SELF-DIRECTED EXPERIMENT FULFILLMENT.
 *
 * Extends `observationGap.ts` (M1) and `datasetLaboratory.ts` — both REUSED
 * VERBATIM — with the mechanical steps M1 deliberately stops short of: M1's
 * own doc states plainly that `ObservationGapRequest` "has no execute
 * method, no fetch, no side effect… FULFILLED only by someone outside this
 * process handing data back with custody." This module IS that someone, but
 * only insofar as "outside this process" already means "an already-pinned,
 * already-verified `DatasetLaboratory`" — never a live network call at
 * runtime (no `DatasetLaboratory` implementation in this repo does one; see
 * `qe4DatasetLaboratory.ts`'s own doc) and never a claim of physical
 * hardware execution.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO:
 *  - It does not guess which point in a source's grid answers a gap. The
 *    caller supplies `pointId` (the source's own point identity) and `atX`
 *    (where that point sits on the ORIGINAL campaign's x-axis) — both
 *    declared, because only a domain-aware caller can translate between a
 *    campaign's x-axis and a dataset's own point grammar (QE4: x=T[ms] at a
 *    fixed k <-> `disorder:T=..:k=..`). Guessing that mapping would be
 *    exactly the fabrication `datasetLaboratory.ts` refuses.
 *  - It never marks a source "qualified" unless that EXACT `pointId` is
 *    literally present in the source's own `observableSpec()` — no fuzzy
 *    matching on the gap's free-text `requiredObservable.quantity`.
 *  - It never treats a single successful `run()` as sufficient: a second,
 *    independent call must return the identical fingerprint before the
 *    observation is trusted (an explicit determinism check — step 5 below).
 *  - `resumeCampaignWithFulfilment` calls `runDiscoveryCampaign` UNCHANGED —
 *    no second campaign engine, no fabricated verdict.
 */

export const EXPERIMENT_FULFILLMENT_CONTRACT_VERSION = '1.0.0';

/**
 * Step 2 — find a qualified source. A `DatasetLaboratory` qualifies only
 * when its OWN declared grid literally contains `pointId` — never inferred
 * from the gap's free-text quantity.
 */
export function findQualifiedSource(pointId: string, registry: readonly DatasetLaboratory[]): DatasetLaboratory | null {
  return registry.find((lab) => lab.observableSpec().some((p) => p.pointId === pointId)) ?? null;
}

export interface FulfillExperimentGapInput {
  readonly gap: ObservationGapRequest;
  readonly registry: readonly DatasetLaboratory[];
  /** The source's own point identity for the requested observation — caller-declared, see module doc. */
  readonly pointId: string;
  /** Where `pointId` sits on the original campaign's x-axis — caller-declared, see module doc. */
  readonly atX: number;
}

export interface ExperimentFulfillmentResult {
  readonly contractVersion: string;
  readonly outcome: 'FULFILLED' | 'NO_ACCESS_DECLARED';
  readonly reason: string;
  readonly sourceLabId: string | null;
  /** Step 5 — whether a second, independent run of the same point returned an identical fingerprint. Only meaningful when `outcome === 'FULFILLED'`. */
  readonly replayVerified: boolean;
  readonly fulfilment: FulfilledObservationGap | null;
}

function no_access(reason: string): ExperimentFulfillmentResult {
  return { contractVersion: EXPERIMENT_FULFILLMENT_CONTRACT_VERSION, outcome: 'NO_ACCESS_DECLARED', reason, sourceLabId: null, replayVerified: false, fulfilment: null };
}

/**
 * Steps 2-5 of E5: find a qualified source, fetch (from the pinned dataset,
 * never a live call), verify determinism with a second independent run, and
 * hand the result through `observationGap.ts::fulfilObservationGap`
 * unmodified so custody/refusal semantics stay exactly what M1 already
 * defined. Returns `NO_ACCESS_DECLARED`, never a fabricated observation,
 * whenever any step fails to produce a verified real value.
 */
export function fulfillExperimentGap(input: FulfillExperimentGapInput): ExperimentFulfillmentResult {
  const { gap, registry, pointId, atX } = input;

  const source = findQualifiedSource(pointId, registry);
  if (source === null) {
    return no_access(`No registered DatasetLaboratory declares point "${pointId}" in its own grid. Registry checked: ${registry.map((l) => l.labId).join(', ') || '(empty)'}. This gap remains open.`);
  }

  const first = source.run({ pointId });
  if (first.status !== 'completed' || first.observation === null) {
    return no_access(first.rejectedReason ?? `Source "${source.labId}" did not complete point "${pointId}".`);
  }

  const second = source.run({ pointId });
  const replayVerified = second.status === 'completed' && second.fingerprint === first.fingerprint;
  if (!replayVerified) {
    return no_access(`Source "${source.labId}" returned non-reproducible results for point "${pointId}" (fingerprint ${first.fingerprint} vs ${second.fingerprint} on a second, independent run) — refusing an observation that does not replay.`);
  }

  const custody: ObservationGapCustody = {
    steps: [
      { handledBy: source.labId, action: `DatasetLaboratory.run(pointId="${pointId}")`, at: new Date().toISOString() } satisfies ChainOfCustodyStep,
      { handledBy: 'experimentFulfillment.ts', action: 'determinism re-run verified: second independent run produced an identical fingerprint', at: new Date().toISOString() } satisfies ChainOfCustodyStep,
    ],
    provenance: 'REAL_EXPERIMENTAL' satisfies DataProvenance,
    dataset: first.provenance,
  };

  const fulfilled = fulfilObservationGap(gap, {
    custody,
    value: first.observation.value,
    sigma: first.observation.uncertainty,
    at: atX,
  });

  if ('ok' in fulfilled && fulfilled.ok === false) {
    return no_access(fulfilled.reason);
  }

  return {
    contractVersion: EXPERIMENT_FULFILLMENT_CONTRACT_VERSION,
    outcome: 'FULFILLED',
    reason: `Fulfilled from "${source.labId}", point "${pointId}", verified reproducible across two independent runs.`,
    sourceLabId: source.labId,
    replayVerified: true,
    fulfilment: fulfilled as FulfilledObservationGap,
  };
}

export interface ResumeCampaignWithFulfilmentInput {
  /** The already-run campaign that raised the gap. */
  readonly baseline: CampaignResult;
  /** The exact laboratory definition that produced `baseline` — REUSED, never rebuilt. */
  readonly baseLaboratory: CampaignLaboratory;
  readonly options?: CampaignOptions;
  readonly fulfilment: FulfilledObservationGap;
}

export interface ResumeCampaignOutcome {
  readonly resumed: CampaignResult;
  /** Step 7 — whether adding the fulfilled observation changed the winning model or the stop reason. */
  readonly verdictChanged: boolean;
  readonly explanation: string;
}

/**
 * Steps 6-7 of E5: resume the campaign with the fulfilled observation
 * admitted, and report plainly whether the verdict changed. Calls
 * `runDiscoveryCampaign` UNMODIFIED — this is the existing engine run again
 * on an augmented candidate set, never a second engine.
 */
export function resumeCampaignWithFulfilment(input: ResumeCampaignWithFulfilmentInput): ResumeCampaignOutcome {
  const { baseline, baseLaboratory, fulfilment } = input;
  const augmentedX = baseLaboratory.candidateX.includes(fulfilment.at) ? baseLaboratory.candidateX : [...baseLaboratory.candidateX, fulfilment.at].sort((a, b) => a - b);

  const augmentedLab: CampaignLaboratory = {
    ...baseLaboratory,
    candidateX: augmentedX,
    observe: (x) => (x === fulfilment.at ? { x, y: fulfilment.value, sigma: fulfilment.sigma } : baseLaboratory.observe(x)),
  };

  const resumed = runDiscoveryCampaign(augmentedLab, input.options);
  const beforeFp = baseline.discovery.winningModel?.fingerprint ?? null;
  const afterFp = resumed.discovery.winningModel?.fingerprint ?? null;
  const verdictChanged = beforeFp !== afterFp || baseline.stopReason !== resumed.stopReason;

  return {
    resumed,
    verdictChanged,
    explanation: verdictChanged
      ? `Verdict changed after fulfilment: winning model ${beforeFp ?? 'none'} -> ${afterFp ?? 'none'}; stopReason ${baseline.stopReason} -> ${resumed.stopReason}.`
      : `Verdict unchanged after fulfilment: winning model remained ${afterFp ?? 'none'}; stopReason remained ${resumed.stopReason}.`,
  };
}
