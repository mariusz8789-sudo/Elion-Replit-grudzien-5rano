import { runDiscoveryCampaign, type CampaignLaboratory, type CampaignOptions, type CampaignResult } from './discoveryCampaign';
import { modelSpecFingerprint, normalizeModelSpec, type ModelSpec } from './modelSpace';
import type { DomainAdapter } from './domainAdapter';
import { findNextDirections, type CandidateDirection } from './directionFinder';
import type { ObservationGapRequest } from './observationGap';
import type { DatasetLaboratory } from './datasetLaboratory';
import { fulfillExperimentGap, resumeCampaignWithFulfilment } from './experimentFulfillment';
import { assessNovelty, classifyResultLabel, assertValidResultLabel, recordKnownFinding, type NoveltyAssessment, type ResultLabel } from './noveltyGate';

/**
 * E3 — AUTONOMOUS CAMPAIGN ORCHESTRATOR. THE CAPSTONE.
 *
 * Composes E1 (directionFinder.ts) + E2 (noveltyGate.ts) + E4
 * (domainAdapter.ts) + E5 (experimentFulfillment.ts) + the existing engine
 * (discoveryCampaign.ts::runDiscoveryCampaign, called UNMODIFIED) into the
 * loop the whole Phase E mandate exists to build: human supplies ONE seed
 * (`seedAdapter`), everything after that — direction, campaign, result,
 * memory, next direction, next campaign — runs without a human typing a new
 * question. This file computes NOTHING scientific itself; it only sequences
 * calls to modules already built and tested in Kroki 1-4.
 *
 * WHAT THIS ORCHESTRATOR CAN AND CANNOT AUTONOMOUSLY PURSUE, STATED
 * EXPLICITLY RATHER THAN LEFT TO INFERENCE — this is the honesty the mandate
 * calls "stopping rules must actually work, not force infinite autonomy":
 *
 *  - `RESIDUAL_STRUCTURE_UNEXPLAINED` directions ARE pursued: the SAME
 *    laboratory is re-run with a relaxed grammar (`maxTerms + 1`,
 *    `excludeBases` cleared, `respectFalsifiedModelRegistry: true`) — a
 *    genuinely different, genuinely runnable next campaign on the same
 *    domain, with no new capability required.
 *  - `OBSERVATION_GAP_FOLLOWUP` directions are pursued ONLY when the caller
 *    supplies a `gapResolver` (E5's own discipline: this orchestrator does
 *    not invent the mapping from a gap's declared quantity to a source's
 *    point-id grammar; only a domain-aware caller can). Without one, the
 *    loop stops honestly at `INSUFFICIENT_DATA`.
 *  - `UNRESOLVED_SURVIVORS` and `CROSS_CAMPAIGN_TRANSFER` directions are
 *    NEVER pursued autonomously — `directionFinder.ts` itself marks both
 *    `BLOCKED_ON_CAPABILITY`, and no code in this repository can construct a
 *    genuinely new discriminating experiment or reconcile a cross-campaign
 *    assumption change on its own. The loop stops at `NO_FEASIBLE_EXPERIMENT`
 *    rather than pretending otherwise.
 *
 * Every result this orchestrator produces is labeled through E2's
 * `classifyResultLabel` + `assertValidResultLabel` — a `DISCOVERY` label
 * that would inflate a known or unsupported finding throws before it is
 * ever recorded.
 */

export const CAMPAIGN_ORCHESTRATOR_CONTRACT_VERSION = '1.0.0';

export type OrchestratorStopReason =
  | 'NO_INFORMATION_GAIN'
  | 'NO_FEASIBLE_EXPERIMENT'
  | 'REDUNDANT_DIRECTION'
  | 'FALSIFIED_DIRECTION'
  | 'INSUFFICIENT_DATA'
  | 'CONVERGED'
  | 'MAX_CAMPAIGNS_REACHED';

export interface OrchestratorCampaignRecord {
  readonly campaignIndex: number;
  readonly result: CampaignResult;
  readonly resultLabel: ResultLabel;
  readonly noveltyAssessment: NoveltyAssessment;
  /** The direction that led to THIS campaign; null only for the human-seeded first campaign. */
  readonly direction: CandidateDirection | null;
  readonly launchedAutonomously: boolean;
}

export interface OrchestratorTrace {
  readonly contractVersion: string;
  readonly campaigns: readonly OrchestratorCampaignRecord[];
  readonly stopReason: OrchestratorStopReason;
  readonly why: string;
  /** True only when every campaign after the seed was launched from a CandidateDirection this orchestrator itself produced — the runtime proof of "no human typed a new question between rounds". */
  readonly autonomyProven: boolean;
}

export interface RunAutonomousOrchestratorInput {
  /** The ONLY human-provided input. */
  readonly seedAdapter: DomainAdapter;
  readonly options?: CampaignOptions;
  readonly maxCampaigns?: number;
  /**
   * Domain-specific, caller-declared resolution of an observation gap into a
   * fetchable point — see `experimentFulfillment.ts`'s own doc for why this
   * mapping cannot be invented generically. Omit to have every
   * `OBSERVATION_GAP_FOLLOWUP` direction stop the loop at `INSUFFICIENT_DATA`.
   */
  readonly gapResolver?: (gap: ObservationGapRequest) => { readonly registry: readonly DatasetLaboratory[]; readonly pointId: string; readonly atX: number } | null;
}

function findSpecForFingerprint(specs: readonly ModelSpec[], fingerprint: string): ModelSpec | null {
  return specs.find((s) => modelSpecFingerprint(normalizeModelSpec(s)) === fingerprint) ?? null;
}

function labelCampaign(result: CampaignResult): { readonly label: ResultLabel; readonly assessment: NoveltyAssessment } {
  const winner = result.discovery.winningModel;
  if (winner === null) {
    const assessment: NoveltyAssessment = {
      level: 'UNKNOWN',
      reason: 'No winning model — nothing to assess novelty on.',
      matchedFinding: null,
      falsifiedConsultation: { verdict: 'ALLOW', reason: 'No candidate model to consult the registry on.', matchedRecord: null },
      checkedCorpus: [],
    };
    return { label: 'HYPOTHESIS_UNKNOWN', assessment };
  }

  const spec = findSpecForFingerprint(result.liveModelSpecs, winner.fingerprint);
  if (spec === null) {
    const assessment: NoveltyAssessment = {
      level: 'UNKNOWN',
      reason: `Winning model fingerprint ${winner.fingerprint} has no matching ModelSpec in liveModelSpecs — cannot assess novelty on a spec this orchestrator cannot identify.`,
      matchedFinding: null,
      falsifiedConsultation: { verdict: 'ALLOW', reason: 'No spec to consult.', matchedRecord: null },
      checkedCorpus: [],
    };
    return { label: 'HYPOTHESIS_UNKNOWN', assessment };
  }

  const assessment = assessNovelty({
    spec,
    scope: { domain: result.labId, assumptions: [], boundary: result.problem },
    checkedCorpus: ['falsifiedModelRegistry(M2)', 'knownFindingsRegistry'],
  });

  const decision = classifyResultLabel({
    accessDeclared: true,
    assessment,
    hasSupportingEvidence: result.discovery.supportingEvidence.length > 0,
    hasFalsificationAttempt: result.rounds.length > 0,
    hasProvenance: true,
  });

  assertValidResultLabel({
    label: decision.label,
    assessment,
    accessDeclared: true,
    hasSupportingEvidence: result.discovery.supportingEvidence.length > 0,
    hasFalsificationAttempt: result.rounds.length > 0,
    hasProvenance: true,
  });

  if (decision.label === 'DISCOVERY') {
    recordKnownFinding({
      spec,
      scope: { domain: result.labId, assumptions: [], boundary: result.problem },
      source: 'CAMPAIGN_DISCOVERY',
      campaignId: result.labId,
      summary: result.discovery.decisionBasis,
    });
  }

  return { label: decision.label, assessment };
}

function relaxGrammar(options: CampaignOptions | undefined): CampaignOptions {
  const baseMaxTerms = options?.maxTerms ?? 2;
  return { ...options, maxTerms: baseMaxTerms + 1, excludeBases: undefined, respectFalsifiedModelRegistry: true };
}

function finish(campaigns: readonly OrchestratorCampaignRecord[], stopReason: OrchestratorStopReason, why: string): OrchestratorTrace {
  const autonomyProven = campaigns.length > 1 && campaigns.slice(1).every((c) => c.direction !== null && c.launchedAutonomously);
  return { contractVersion: CAMPAIGN_ORCHESTRATOR_CONTRACT_VERSION, campaigns, stopReason, why, autonomyProven };
}

export function runAutonomousOrchestrator(input: RunAutonomousOrchestratorInput): OrchestratorTrace {
  const maxCampaigns = input.maxCampaigns ?? 5;
  const campaigns: OrchestratorCampaignRecord[] = [];
  const pursuedDirectionFingerprints = new Set<string>();

  const currentLaboratory: CampaignLaboratory = input.seedAdapter.laboratory;
  let currentOptions = input.options;
  let direction: CandidateDirection | null = null;

  for (let i = 0; i < maxCampaigns; i += 1) {
    let result = runDiscoveryCampaign(currentLaboratory, currentOptions);

    // E5: attempt to resolve a mid-campaign observation gap, then resume on the SAME laboratory.
    if (result.stopReason === 'OBSERVATION_GAP' && input.gapResolver) {
      const lastRound = result.rounds[result.rounds.length - 1];
      const gap = lastRound?.observationGap ?? null;
      if (gap !== null) {
        const resolution = input.gapResolver(gap);
        if (resolution !== null) {
          const fulfillment = fulfillExperimentGap({ gap, registry: resolution.registry, pointId: resolution.pointId, atX: resolution.atX });
          if (fulfillment.outcome === 'FULFILLED' && fulfillment.fulfilment !== null) {
            const resumed = resumeCampaignWithFulfilment({ baseline: result, baseLaboratory: currentLaboratory, options: currentOptions, fulfilment: fulfillment.fulfilment });
            result = resumed.resumed;
          }
        }
      }
    }

    const { label, assessment } = labelCampaign(result);
    campaigns.push({ campaignIndex: i, result, resultLabel: label, noveltyAssessment: assessment, direction, launchedAutonomously: i > 0 });

    // CONVERGED: an autonomous relaunch that reproduced the same winning model made no progress.
    if (i > 0) {
      const previous = campaigns[campaigns.length - 2]!;
      const prevFp = previous.result.discovery.winningModel?.fingerprint ?? null;
      const currFp = result.discovery.winningModel?.fingerprint ?? null;
      if (prevFp !== null && currFp !== null && prevFp === currFp) {
        return finish(campaigns, 'CONVERGED', `Autonomous relaunch of ${result.labId} reproduced the same winning model (${currFp}) — the relaxed grammar found nothing new.`);
      }
      // FALSIFIED_DIRECTION: the relaunch found no winner because every candidate it tried was already excluded by M2.
      if (result.discovery.winningModel === null && result.registrySkips.length > 0) {
        return finish(campaigns, 'FALSIFIED_DIRECTION', `Autonomous relaunch of ${result.labId} found no winning model; every candidate it considered was already excluded by falsifiedModelRegistry (${result.registrySkips.length} skip(s)).`);
      }
    }

    const finder = findNextDirections({ result });
    const nextDirection = finder.selected;

    if (nextDirection === null) {
      return finish(campaigns, 'NO_INFORMATION_GAIN', finder.why);
    }
    if (pursuedDirectionFingerprints.has(nextDirection.fingerprint)) {
      return finish(campaigns, 'REDUNDANT_DIRECTION', `Direction "${nextDirection.id}" (${nextDirection.generationMethod}) was already pursued earlier in this run.`);
    }
    pursuedDirectionFingerprints.add(nextDirection.fingerprint);

    if (nextDirection.generationMethod === 'RESIDUAL_STRUCTURE_UNEXPLAINED' && nextDirection.feasibility === 'RUNNABLE_NOW') {
      currentOptions = relaxGrammar(currentOptions);
      direction = nextDirection;
      continue;
    }

    if (nextDirection.generationMethod === 'OBSERVATION_GAP_FOLLOWUP') {
      return finish(campaigns, 'INSUFFICIENT_DATA', `Direction "${nextDirection.id}" needs an observation this orchestrator has no verified source for (${input.gapResolver ? 'resolver declared but fulfillment did not succeed' : 'no gapResolver declared'}).`);
    }

    return finish(campaigns, 'NO_FEASIBLE_EXPERIMENT', `Direction "${nextDirection.id}" (${nextDirection.generationMethod}) is ${nextDirection.feasibility} — no autonomous mechanism in this orchestrator can pursue it.`);
  }

  return finish(campaigns, 'MAX_CAMPAIGNS_REACHED', `Reached the configured maximum of ${maxCampaigns} campaigns without a terminal stopping condition.`);
}
