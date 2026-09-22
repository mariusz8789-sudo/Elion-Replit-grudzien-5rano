import type { EvidenceRecordInput, EvidenceSink } from '../scientificWorlds/humanLab/contracts';
import type { PairDiscrimination } from '../mind/contracts';
import {
  computeInformationGain,
  computePredictionError,
  computeSurpriseScore,
  deriveKnowledgeGaps,
  type KnowledgeGap,
} from '../metaCognition/scientificMetrics';
import {
  buildDecisionTrace,
  type DecisionAlternative,
  type DecisionEvidenceRef,
  type DecisionTrace,
} from '../metaCognition/decisionTrace';
import {
  routeModelRequest,
  type ModelInvokePort,
  type ModelProviderDescriptor,
} from './modelRouter';
import {
  continueResearchCampaign,
  isNoJustifiedNextQuestion,
  startResearchCampaign,
  type NoJustifiedNextQuestion,
  type ResearchCycle,
} from './researchCampaign';
import { getRouterModel } from './router';
import type { HypothesisOutcome } from './hypothesisLoop';
import type { ScientificEvidenceChain } from './scientificDiscovery';

/**
 * SCIENTIFIC INTEGRATION (Work Item 2) — a thin canonical coordinator over
 * `researchCampaign.ts` (chained real Scientific Discovery Loop cycles,
 * unchanged), `metaCognition/scientificMetrics.ts` and `decisionTrace.ts`
 * (Work Item 3, unchanged), and `modelRouter.ts` (Work Item 1, unchanged,
 * strictly optional). It introduces NO planner, NO campaign engine, NO
 * second hypothesis/evidence system: every scientific decision (which
 * hypothesis wins, what counts as falsified, what runs next) is made by
 * `researchCampaign.ts`/`hypothesisLoop.ts` exactly as before. This file
 * only:
 *
 *  1. Anchors each cycle's real hypothesis outcomes into the canonical
 *     `EvidenceLedger` (via the existing `EvidenceSink` seam — the same
 *     `createLedgerSink` binding `genesisEvidencePort.ts`/`biologyRunners.ts`
 *     already use for the one canonical ledger). One record per outcome,
 *     pointing back at that outcome's own `evidenceChainId`/`evidencePackId`
 *     — a durable anchor, not a re-derivation of the evidence chain's
 *     content.
 *  2. Applies the Work Item 3 metrics post-hoc to what a cycle's real,
 *     measured ranking actually showed (never to a prediction that has not
 *     been measured).
 *  3. Builds one `DecisionTrace` per cycle for the real next-experiment
 *     selection already computed by `selectNextHypothesisExperiment`
 *     (surfaced here as `cycle.result.nextExperiment`).
 *  4. Optionally — ONLY when the caller supplies `providers`+`invokePort` —
 *     routes one `META_COGNITION` request per cycle through `modelRouter.ts`
 *     for a human-readable narrative of the `DecisionTrace`. This narrative
 *     is always `REASONING_ONLY` (Work Item 1's own guarantee) and is never
 *     read by any part of this module that decides status, ranking, or
 *     falsification — the campaign runs identically, with or without it.
 */
export const SCIENTIFIC_INTEGRATION_VERSION = '1.0.0';

export type ScientificCampaignStatus = 'COMPLETED' | 'BLOCKED' | 'FAILED';

const ENGINE_ERROR_MARKERS = ['odrzucił', 'nie da się zbudować'];

/**
 * `hypothesisLoop.ts` does not carry a separate FAILED status — a thrown
 * engine error and a structurally-unavailable capability both surface as
 * `HypothesisOutcome.status === 'BLOCKED'` with a different `reason` string
 * (see `executePreregisteredHypotheses(Async)`'s two distinct catch/BLOCKED
 * paths). This derives Work Item 2's required BLOCKED/FAILED distinction
 * from that existing `reason` text rather than adding a new status value to
 * `hypothesisLoop.ts` — a purely additive, read-only classification.
 */
export function classifyOutcome(outcome: HypothesisOutcome): 'OK' | 'BLOCKED' | 'FAILED' {
  if (outcome.status !== 'BLOCKED') return 'OK';
  const reason = outcome.reason.toLowerCase();
  return ENGINE_ERROR_MARKERS.some((marker) => reason.includes(marker)) ? 'FAILED' : 'BLOCKED';
}

function emitOutcomeEvidence(sink: EvidenceSink, cycleId: string, outcome: HypothesisOutcome): DecisionEvidenceRef {
  const input: EvidenceRecordInput = {
    sourceUrl: `genesis://scientific-integration/${cycleId}/${outcome.hypothesisId}`,
    claim: `Cycle ${cycleId} hypothesis ${outcome.hypothesisId}: status=${outcome.status} observedMetric=${outcome.observedMetric ?? 'null'} baselineMetric=${outcome.baselineMetric ?? 'null'} reason=${outcome.reason}`,
    claimType: 'SCIENTIFIC_CAMPAIGN_OUTCOME',
    confidence: 1,
    provenance: {
      evidenceChainId: outcome.evidenceChainId,
      evidencePackId: outcome.evidencePackId,
      runIds: outcome.runIds,
      runFingerprints: outcome.runFingerprints,
    },
  };
  const result = sink.addRecord(input);
  return { id: result.record.id, contentHash: result.record.contentHash };
}

/**
 * Real pooled standard deviation from the chain's own repeated arm values —
 * never a fabricated uncertainty. Most `HYPOTHESIS_PROBLEMS` models are
 * deterministic (repetitions must agree, see `hypothesisLoop.ts::metricFromArm`),
 * so this is honestly 0 for them: `sigmaSeparation`/`computePredictionError`
 * already treat a non-positive sigma as "no claimed separation" (0), which is
 * the correct, honest result for a model with no measured noise to divide by.
 */
function pooledSigma(chain: ScientificEvidenceChain | undefined): number {
  if (chain === undefined) return 0;
  const values = chain.arms.flatMap((arm) => arm.outputValues);
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export interface CycleMetrics {
  readonly hypothesisPairs: readonly PairDiscrimination[];
  readonly informationGain: number;
  readonly knowledgeGaps: readonly KnowledgeGap[];
  readonly predictionErrors: ReadonlyMap<string, { readonly absoluteError: number; readonly sigmaError: number; readonly surprise: number }>;
}

/** Builds real `PairDiscrimination` entries from the cycle's ACTUAL measured ranking (never a pre-run prediction) — one pair per adjacent rank position, using the chain's own repeated-run pooled sigma. */
function buildCycleMetrics(cycle: ResearchCycle): CycleMetrics {
  const { ranking } = cycle.result.loop.discrimination;
  const chainByHypothesis = new Map(
    cycle.result.loop.outcomes.map((outcome) => [
      outcome.hypothesisId,
      cycle.result.loop.chains.find((chain) => chain.evidenceId === outcome.evidenceChainId),
    ]),
  );
  const hypothesisPairs: PairDiscrimination[] = [];
  for (let i = 0; i < ranking.length - 1; i++) {
    const a = ranking[i]!;
    const b = ranking[i + 1]!;
    const sigma = Math.max(pooledSigma(chainByHypothesis.get(a.hypothesisId)), pooledSigma(chainByHypothesis.get(b.hypothesisId)));
    hypothesisPairs.push({ hypothesisA: a.hypothesisId, hypothesisB: b.hypothesisId, predictedDifference: a.metric - b.metric, pooledSigma: sigma });
  }

  const predictionErrors = new Map<string, { absoluteError: number; sigmaError: number; surprise: number }>();
  for (const outcome of cycle.result.loop.outcomes) {
    if (outcome.observedMetric === null || outcome.baselineMetric === null) continue;
    const sigma = pooledSigma(chainByHypothesis.get(outcome.hypothesisId));
    const err = computePredictionError({ predicted: outcome.baselineMetric, observed: outcome.observedMetric, uncertaintySigma: sigma });
    predictionErrors.set(outcome.hypothesisId, { ...err, surprise: computeSurpriseScore(err.sigmaError) });
  }

  return {
    hypothesisPairs,
    informationGain: computeInformationGain({ hypothesisPairs }),
    knowledgeGaps: deriveKnowledgeGaps(hypothesisPairs),
    predictionErrors,
  };
}

function alternativesFor(cycle: ResearchCycle): readonly DecisionAlternative[] {
  const winnerId = cycle.result.loop.discrimination.winnerHypothesisId;
  return cycle.result.loop.outcomes.map((outcome): DecisionAlternative => {
    if (outcome.hypothesisId === winnerId) return { id: outcome.hypothesisId, status: 'SELECTED' };
    if (outcome.status === 'SUPPORTED' || outcome.status === 'FALSIFIED' || outcome.status === 'BLOCKED') {
      return { id: outcome.hypothesisId, status: 'REJECTED', rejectedReasonCode: outcome.status };
    }
    return { id: outcome.hypothesisId, status: 'NOT_EVALUATED' };
  });
}

function buildCycleDecisionTrace(cycle: ResearchCycle, evidenceRefs: readonly DecisionEvidenceRef[]): DecisionTrace {
  const next = cycle.result.nextExperiment;
  const model = getRouterModel(cycle.result.problem.modelId);
  return buildDecisionTrace({
    decisionId: cycle.cycleId,
    summary: `cycle=${cycle.cycleIndex} problem=${cycle.problemId} nextExperiment.status=${next.status}`,
    evidenceRefs,
    alternatives: alternativesFor(cycle),
    selectedCapability: cycle.result.problem.modelId,
    inputClassification: 'PREREGISTERED_HYPOTHESIS_SET',
    outputClassification: cycle.result.loop.discrimination.decisive ? 'DECISIVE_RANKING' : 'INCONCLUSIVE_RANKING',
    solverId: cycle.result.problem.modelId,
    ...(model?.modelVersion !== undefined ? { solverVersion: model.modelVersion } : {}),
    ...(next.status === 'BLOCKED' ? { blockedReason: next.why } : {}),
    suggestedNextExperiment: next.resolves,
  });
}

export interface ScientificCampaignCycleReport {
  readonly cycle: ResearchCycle;
  readonly evidenceRefs: readonly DecisionEvidenceRef[];
  readonly metrics: CycleMetrics;
  readonly decisionTrace: DecisionTrace;
  /** Only present when the caller supplied `providers`+`invokePort` — a REASONING_ONLY narrative, never consulted by this module's own status/ranking logic. */
  readonly narrative?: string;
}

export interface ScientificCampaignResult {
  readonly contractVersion: string;
  readonly problemId: string;
  readonly status: ScientificCampaignStatus;
  readonly cycles: readonly ScientificCampaignCycleReport[];
  readonly stoppedBecause: NoJustifiedNextQuestion | { readonly status: 'MAX_CYCLES_REACHED'; readonly maxCycles: number };
}

export interface RunScientificCampaignOptions {
  readonly maxCycles?: number;
  readonly providers?: readonly ModelProviderDescriptor[];
  readonly invokePort?: ModelInvokePort;
}

function statusForCycle(cycle: ResearchCycle): ScientificCampaignStatus {
  const classifications = cycle.result.loop.outcomes.map(classifyOutcome);
  if (classifications.every((c) => c === 'OK')) return 'COMPLETED';
  if (classifications.some((c) => c === 'FAILED')) return 'FAILED';
  return classifications.some((c) => c === 'OK') ? 'COMPLETED' : 'BLOCKED';
}

async function reportFor(
  cycle: ResearchCycle,
  evidenceSink: EvidenceSink,
  options: RunScientificCampaignOptions,
): Promise<ScientificCampaignCycleReport> {
  const evidenceRefs = cycle.result.loop.outcomes.map((outcome) => emitOutcomeEvidence(evidenceSink, cycle.cycleId, outcome));
  const metrics = buildCycleMetrics(cycle);
  const decisionTrace = buildCycleDecisionTrace(cycle, evidenceRefs);

  let narrative: string | undefined;
  if (options.providers !== undefined && options.invokePort !== undefined) {
    const routed = await routeModelRequest(
      { taskClass: 'META_COGNITION', prompt: `Narrate decision trace ${decisionTrace.traceFingerprint}: ${decisionTrace.summary}` },
      options.providers,
      options.invokePort,
      evidenceSink,
    );
    if (routed.status === 'ROUTED') narrative = routed.outputText;
  }

  return narrative === undefined
    ? { cycle, evidenceRefs, metrics, decisionTrace }
    : { cycle, evidenceRefs, metrics, decisionTrace, narrative };
}

/**
 * Runs a full research campaign with canonical Evidence anchoring, D-141
 * metrics, and a `DecisionTrace` per cycle — chaining `startResearchCampaign`
 * / `continueResearchCampaign` exactly as `researchCampaign.ts::runResearchCampaign`
 * does, with those three enrichments added per cycle. Bounded by `maxCycles`
 * (default 5, same default as the underlying `runResearchCampaign`); stops
 * early on the same `NO_JUSTIFIED_NEXT_QUESTION` sentinel the underlying
 * engine already produces — this function invents no new stopping rule.
 */
export async function runScientificIntegrationCampaign(
  problemId: string,
  evidenceSink: EvidenceSink,
  options: RunScientificCampaignOptions = {},
): Promise<ScientificCampaignResult> {
  const maxCycles = options.maxCycles ?? 5;
  const cycles: ScientificCampaignCycleReport[] = [];
  let current: ResearchCycle = await startResearchCampaign(problemId);
  cycles.push(await reportFor(current, evidenceSink, options));

  for (;;) {
    if (cycles.length >= maxCycles) {
      return {
        contractVersion: SCIENTIFIC_INTEGRATION_VERSION,
        problemId,
        status: cycles.some((report) => statusForCycle(report.cycle) === 'FAILED') ? 'FAILED' : 'COMPLETED',
        cycles,
        stoppedBecause: { status: 'MAX_CYCLES_REACHED', maxCycles },
      };
    }
    const step = await continueResearchCampaign(current);
    if (isNoJustifiedNextQuestion(step)) {
      return {
        contractVersion: SCIENTIFIC_INTEGRATION_VERSION,
        problemId,
        status: cycles.some((report) => statusForCycle(report.cycle) === 'FAILED')
          ? 'FAILED'
          : cycles.some((report) => statusForCycle(report.cycle) === 'BLOCKED')
            ? 'BLOCKED'
            : 'COMPLETED',
        cycles,
        stoppedBecause: step,
      };
    }
    current = step;
    cycles.push(await reportFor(current, evidenceSink, options));
  }
}
