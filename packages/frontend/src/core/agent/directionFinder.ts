import type { CampaignResult, CampaignRound, Discovery } from './discoveryCampaign';
import type { ResidualFinding } from './residualStructure';
import type { ObservationGapRequest } from './observationGap';
import type { TransferOutcome, DiscoveryNode, TransferRefusalReason } from './discoveryGraph';
import { fnv1a, canonicalJson } from '../events/hash';

/**
 * E1 — OPEN-ENDED DIRECTION FINDER.
 *
 * Reads a FINISHED campaign (`CampaignResult`, already carrying a
 * `CampaignStopReason`) and proposes what Genesis should look at NEXT — a
 * different question from "what should the next ROUND inside this campaign
 * be" (that is `discoveryCampaign.ts`'s own job, already solved by
 * `falsificationPowerAt`/`redundancyAt` and the planner score; this module
 * never re-derives it).
 *
 * DISCIPLINE REUSED FROM `nextQuestion.ts`, NOT ITS TYPES: that module is
 * bound to a different substrate (`DiscoveryOutcome`/`InquiryLoopResult`,
 * the PARAMETER-estimation loop family) and D-021 already rejected forcing
 * the loop families into one shape. What Phase E reuses is the STANCE that
 * module states explicitly: only propose what the finished run itself
 * raised — an unexplained residual, an unresolved gap, live surviving
 * models it could not separate. Nothing here reads a catalog, guesses a
 * domain, or invents a research question from nothing. `CandidateDirection`
 * is therefore a genuine but BOUNDED step: it can recombine and re-surface
 * what a campaign already found, never manufacture a subject.
 *
 * NO SECOND TRUTH SYSTEM: `originatingResidual`/`originatingObservation`
 * are read directly off the `CampaignResult` the caller passed in, never
 * recomputed; `provenance.sourceCampaignFingerprint` is
 * `CampaignResult.campaignFingerprint`, reused verbatim.
 */

export const DIRECTION_FINDER_CONTRACT_VERSION = '1.0.0';

export type DirectionGenerationMethod =
  | 'OBSERVATION_GAP_FOLLOWUP'
  | 'UNRESOLVED_SURVIVORS'
  | 'RESIDUAL_STRUCTURE_UNEXPLAINED'
  | 'CROSS_CAMPAIGN_TRANSFER';

export type DirectionFeasibility = 'RUNNABLE_NOW' | 'BLOCKED_ON_CAPABILITY' | 'BLOCKED_ON_DATA';

export interface CandidateDirection {
  readonly id: string;
  readonly question: string;
  readonly whyNow: string;
  /** Grounded facts this direction is derived from — ids, values, stop reasons. Never prose alone. */
  readonly parentKnowledge: readonly string[];
  readonly originatingObservation: readonly number[] | null;
  readonly originatingResidual: ResidualFinding | null;
  /** What observation would refute the hypothesis this direction implicitly proposes. */
  readonly falsifiability: string;
  readonly feasibility: DirectionFeasibility;
  /** Declared reasoning, not a fabricated numeric score — same discipline as `worldCounterfactual.ts`'s declared cascades. */
  readonly expectedScientificValue: string;
  /**
   * Whether pursuing this direction COULD plausibly clear the E2 novelty
   * gate — a bounded expectation set by this module, never a claim that it
   * already has. The real answer only comes from `noveltyGate.ts::assessNovelty`
   * once the direction is actually run.
   */
  readonly noveltyCandidate: boolean;
  readonly provenance: {
    readonly campaignId: string;
    readonly sourceCampaignFingerprint: string;
    readonly round: number | null;
  };
  readonly generationMethod: DirectionGenerationMethod;
  readonly fingerprint: string;
}

const DIRECTION_PRIORITY: readonly DirectionGenerationMethod[] = [
  // A held-open gap blocks everything else this campaign could tell Genesis —
  // exactly the "apparatus first" reasoning nextQuestion.ts states for its
  // own RESOLVE_APPARATUS_FAILURE case.
  'OBSERVATION_GAP_FOLLOWUP',
  // Live, unresolved contradiction: real open uncertainty about the subject.
  'UNRESOLVED_SURVIVORS',
  // Established structure the winning model still does not explain.
  'RESIDUAL_STRUCTURE_UNEXPLAINED',
  // A discrepancy surfaced only by comparing this campaign against a sibling.
  'CROSS_CAMPAIGN_TRANSFER',
];

function lastRoundWithResidual(rounds: readonly CampaignRound[]): { readonly round: CampaignRound; readonly finding: ResidualFinding } | null {
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    const round = rounds[i]!;
    if (round.residualFindings.length > 0) {
      return { round, finding: round.residualFindings[0]! };
    }
  }
  return null;
}

function directionFingerprint(input: Omit<CandidateDirection, 'fingerprint'>): string {
  return fnv1a(canonicalJson(input));
}

function fromObservationGap(result: CampaignResult, gap: ObservationGapRequest): CandidateDirection {
  const base = {
    id: `dir-gap-${gap.id}`,
    question: `Can the missing observation this campaign asked for (${gap.requiredObservable.quantity} in ${gap.requiredObservable.unit}) actually be obtained, and does it separate the models it was raised to separate?`,
    whyNow: `Campaign ${result.labId} stopped holding an open ${gap.status} request rather than guessing — the request itself is the next question.`,
    parentKnowledge: [`gap ${gap.id}`, `trigger ${gap.trigger}`, `status ${gap.status}`, `liveHypotheses ${gap.liveHypothesisIds.join(', ')}`],
    originatingObservation: null,
    originatingResidual: null,
    falsifiability: `If the observation, once obtained, does not separate ${gap.liveHypothesisIds.join(', ')} at the declared threshold (${gap.threshold}), this direction is refuted as posed.`,
    feasibility: gap.feasibility.available === true ? ('BLOCKED_ON_DATA' as const) : ('BLOCKED_ON_CAPABILITY' as const),
    expectedScientificValue: `Resolves a discrimination the campaign itself could not make internally (discriminability ${gap.discriminability ?? 'null'} vs threshold ${gap.threshold}).`,
    noveltyCandidate: false,
    provenance: { campaignId: result.labId, sourceCampaignFingerprint: result.campaignFingerprint, round: gap.round },
    generationMethod: 'OBSERVATION_GAP_FOLLOWUP' as const,
  };
  return { ...base, fingerprint: directionFingerprint(base) };
}

function fromUnresolvedSurvivors(result: CampaignResult, discovery: Discovery): CandidateDirection {
  const survivorIds = discovery.survivingModels.map((m) => m.fingerprint);
  const base = {
    id: `dir-survivors-${result.campaignFingerprint}`,
    question: `Which of the surviving models (${survivorIds.join(', ')}) is right? Campaign ${result.labId} stopped (${result.stopReason}) without separating them.`,
    whyNow: `${discovery.survivingModels.length} models are still live and the campaign's own experiment space is exhausted — separating them needs something outside what this campaign could run.`,
    parentKnowledge: [...survivorIds.map((id) => `surviving ${id}`), `stopReason ${result.stopReason}`],
    originatingObservation: result.rounds.length > 0 ? result.rounds[result.rounds.length - 1]!.admittedX : null,
    originatingResidual: null,
    falsifiability: 'A new observation or domain that discriminates among the surviving models refutes all but one of them.',
    feasibility: 'BLOCKED_ON_CAPABILITY' as const,
    expectedScientificValue: 'Directly resolves the campaign\'s own unresolved contradiction rather than leaving it as a standing ambiguity.',
    noveltyCandidate: false,
    provenance: { campaignId: result.labId, sourceCampaignFingerprint: result.campaignFingerprint, round: null },
    generationMethod: 'UNRESOLVED_SURVIVORS' as const,
  };
  return { ...base, fingerprint: directionFingerprint(base) };
}

function fromResidualStructure(result: CampaignResult, hit: { readonly round: CampaignRound; readonly finding: ResidualFinding }): CandidateDirection {
  const { round, finding } = hit;
  const base = {
    id: `dir-residual-${result.campaignFingerprint}-r${round.round}`,
    question: `The winning model in campaign ${result.labId} still leaves a ${finding.kind} residual structure${finding.atX !== null ? ` near x=${finding.atX}` : ''} — is that structure itself a real, separately-testable effect?`,
    whyNow: `Round ${round.round}'s best model (${round.bestFingerprint ?? 'unknown'}) does not explain this pattern (strength ${finding.strength}); the campaign converged on the model but not on the residual.`,
    parentKnowledge: [`residual kind ${finding.kind}`, `strength ${finding.strength}`, `evidence ${finding.evidence}`, `round ${round.round}`],
    originatingObservation: round.admittedX,
    originatingResidual: finding,
    falsifiability: 'If a follow-up campaign targeting this region finds no structure beyond noise (BIC-style: ΔRSS below ln(n)), this direction is refuted.',
    feasibility: 'RUNNABLE_NOW' as const,
    expectedScientificValue: 'A residual the winning model cannot explain is exactly the shape of evidence that has previously (M3) led to a genuinely new model form.',
    noveltyCandidate: true,
    provenance: { campaignId: result.labId, sourceCampaignFingerprint: result.campaignFingerprint, round: round.round },
    generationMethod: 'RESIDUAL_STRUCTURE_UNEXPLAINED' as const,
  };
  return { ...base, fingerprint: directionFingerprint(base) };
}

function fromCrossCampaignRefusal(result: CampaignResult, refused: { readonly node: DiscoveryNode; readonly reason: TransferRefusalReason; readonly detail: string }): CandidateDirection {
  const base = {
    id: `dir-transfer-${refused.node.fingerprint}`,
    question: `A sibling campaign's finding ("${refused.node.label}", from ${refused.node.campaignId}) was refused on import into ${result.labId} (${refused.reason}) — should it be reconciled with a targeted follow-up?`,
    whyNow: refused.detail,
    parentKnowledge: [`refusedNode ${refused.node.nodeId}`, `reason ${refused.reason}`, `detail ${refused.detail}`, `sourceCampaign ${refused.node.campaignId}`],
    originatingObservation: null,
    originatingResidual: null,
    falsifiability: 'A follow-up campaign that reproduces the sibling finding under this campaign\'s own scope and assumptions refutes the discrepancy as merely apparent.',
    feasibility: 'RUNNABLE_NOW' as const,
    expectedScientificValue: 'Cross-campaign transfer that refuses (rather than silently accepts) is exactly the signal that two real findings may conflict.',
    noveltyCandidate: false,
    provenance: { campaignId: result.labId, sourceCampaignFingerprint: result.campaignFingerprint, round: null },
    generationMethod: 'CROSS_CAMPAIGN_TRANSFER' as const,
  };
  return { ...base, fingerprint: directionFingerprint(base) };
}

export interface DirectionFinderResult {
  readonly contractVersion: string;
  readonly candidates: readonly CandidateDirection[];
  /** The highest-priority candidate per the declared (never numeric) cascade below. Null only when the campaign raised nothing worth pursuing further. */
  readonly selected: CandidateDirection | null;
  /** The ORIGINAL problem string the source campaign started from — kept so a caller/test can assert `selected.question !== seededQuestion`. */
  readonly seededQuestion: string;
  readonly why: string;
}

export interface FindNextDirectionsInput {
  readonly result: CampaignResult;
  /** Transfers a caller already ran (`discoveryGraph.ts::transferKnowledge`) between this campaign's graph and a sibling's — optional, never fabricated by this module. */
  readonly crossCampaignTransfers?: readonly TransferOutcome[];
}

export function findNextDirections(input: FindNextDirectionsInput): DirectionFinderResult {
  const { result } = input;
  const candidates: CandidateDirection[] = [];

  for (const gap of result.observationGaps) {
    if (gap.status !== 'FULFILLED') {
      candidates.push(fromObservationGap(result, gap));
    }
  }

  if (result.discovery.survivingModels.length > 1) {
    candidates.push(fromUnresolvedSurvivors(result, result.discovery));
  }

  const residualHit = lastRoundWithResidual(result.rounds);
  if (residualHit !== null) {
    candidates.push(fromResidualStructure(result, residualHit));
  }

  for (const transfer of input.crossCampaignTransfers ?? []) {
    for (const refused of transfer.refused) {
      candidates.push(fromCrossCampaignRefusal(result, refused));
    }
  }

  candidates.sort((a, b) => DIRECTION_PRIORITY.indexOf(a.generationMethod) - DIRECTION_PRIORITY.indexOf(b.generationMethod));

  const selected = candidates.length > 0 ? candidates[0]! : null;

  return {
    contractVersion: DIRECTION_FINDER_CONTRACT_VERSION,
    candidates,
    selected,
    seededQuestion: result.problem,
    why:
      selected !== null
        ? `${candidates.length} direction(s) raised by campaign ${result.labId}; selected by declared priority (${DIRECTION_PRIORITY.join(' > ')}): ${selected.generationMethod}.`
        : `Campaign ${result.labId} (stopReason ${result.stopReason}) raised no open gap, no unresolved survivors, and no unexplained residual structure — nothing here proposes a direction from nothing.`,
  };
}
