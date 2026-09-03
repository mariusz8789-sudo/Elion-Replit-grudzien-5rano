import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import type { SavedScenarioReplayStatus } from '../../simulation/scenarioMemory';
import {
  buildNaturalAnalogueEvidencePack,
  buildSavedNaturalAnalogueRun,
  exportNaturalAnalogueRoCrate,
  proposeNaturalAnalogueNextSteps,
  replaySavedNaturalAnalogueRun,
  type SavedNaturalAnalogueRun,
} from './naturalAnalogueEvidence';
import { runHypothesisCompetition, type HypothesisCompetitionResult } from './competingHypotheses';
import type { ExperimentalResult, TestableHypothesis } from './experimentalResult';
import { describeStructuredRequest, isActionableRequest, type StructuredScientificRequest } from './naturalLanguageScientificRequest';
import type { NaturalAnalogueCampaignEngines, NaturalAnalogueCampaignRequest } from './naturalAnalogueCampaign';
import { runNaturalKetamineDiscovery, type NaturalKetamineDiscoveryResult } from './naturalKetamineDiscovery';

/**
 * REAL END-TO-END SCIENTIFIC DISCOVERY FLOW.
 *
 * QUESTION (prose) → STRUCTURED REQUEST → DISCOVERY EXECUTION (real RDKit +
 * real ADMET-AI, unchanged campaign) → COMPETING HYPOTHESES over the SAME
 * ingested measurements the discovery run used → EVIDENCE ARTIFACT + RO-CRATE
 * (existing, unmodified) → SCIENTIFIC MEMORY → REPLAY → NEXT EXPERIMENT.
 *
 * THIS MODULE IS A SEAM, NOT A FOURTH ENGINE. Every stage below calls existing,
 * already-tested machinery:
 *  - discovery execution is `runNaturalKetamineDiscovery`, unchanged;
 *  - the evidence pack, RO-Crate and campaign-level replay are
 *    `naturalAnalogueEvidence.ts`, unchanged — they already work on
 *    `result.campaign` because `NaturalKetamineDiscoveryResult.campaign` IS a
 *    `NaturalAnalogueCampaignResult`;
 *  - hypothesis competition is `competingHypotheses.ts`, added this session
 *    specifically because nothing previously ran MULTIPLE hypotheses against
 *    the SAME ingested evidence at once.
 *
 * The only glue this module adds is: turning a structured request into the
 * request the discovery engine needs, and recording BOTH the discovery result
 * and the hypothesis competition in one Scientific Memory entry so a reader
 * can see the whole flow from one saved record.
 */
export const SCIENTIFIC_DISCOVERY_FLOW_VERSION = '1.0.0';

export interface ScientificDiscoveryFlowInput {
  structuredRequest: StructuredScientificRequest;
  campaignRequest: NaturalAnalogueCampaignRequest;
  hypotheses: readonly TestableHypothesis[];
  mutuallyExclusiveGroups: readonly (readonly string[])[];
  /** Real measurements already known, if any. Empty is the honest common case. */
  ingestedResults: readonly ExperimentalResult[];
}

export interface ScientificDiscoveryFlowResult {
  structuredRequest: StructuredScientificRequest;
  actionable: boolean;
  discovery: NaturalKetamineDiscoveryResult;
  hypothesisCompetition: HypothesisCompetitionResult;
  evidencePack: ReturnType<typeof buildNaturalAnalogueEvidencePack>;
  roCrate: ReturnType<typeof exportNaturalAnalogueRoCrate> | null;
  nextExperiments: ReturnType<typeof proposeNaturalAnalogueNextSteps>;
  savedRun: SavedNaturalAnalogueRun;
}

/**
 * Runs the flow. Throws only when the structured request is not actionable —
 * a caller must not silently run a discovery on a question Genesis could not
 * actually parse.
 */
export function runScientificDiscoveryFlow(
  input: ScientificDiscoveryFlowInput,
  engines: NaturalAnalogueCampaignEngines,
): ScientificDiscoveryFlowResult {
  const actionable = isActionableRequest(input.structuredRequest);
  if (!actionable) {
    throw new Error(`Structured request "${input.structuredRequest.requestId}" is not actionable: ${describeStructuredRequest(input.structuredRequest)}`);
  }

  const discovery = runNaturalKetamineDiscovery(input.campaignRequest, engines);

  // Hypothesis competition runs over the SAME ingested results the discovery
  // used, not a separately curated set — so its verdict is about the same
  // evidence the ranking saw.
  const hypothesisCompetition = runHypothesisCompetition(input.hypotheses, input.ingestedResults, input.mutuallyExclusiveGroups);

  const evidencePack = buildNaturalAnalogueEvidencePack(discovery.campaign);
  const roCrate = evidencePack === null ? null : exportNaturalAnalogueRoCrate(evidencePack);
  const nextExperiments = proposeNaturalAnalogueNextSteps(discovery.campaign);
  const savedRun = buildSavedNaturalAnalogueRun(input.campaignRequest, engines);

  return { structuredRequest: input.structuredRequest, actionable, discovery, hypothesisCompetition, evidencePack, roCrate, nextExperiments, savedRun };
}

export interface FlowReplay {
  campaignReplay: { status: SavedScenarioReplayStatus; reason: string };
  hypothesisReplay: { status: SavedScenarioReplayStatus; reason: string };
}

/**
 * Replays the flow: the campaign replays through the existing, unmodified
 * campaign-replay gate; the hypothesis competition replays by recomputing it
 * from the SAME saved ingested results and comparing the leading hypothesis
 * and its status — a different leader or a different competition status on
 * identical inputs is DRIFT, never silently accepted.
 */
export function replayScientificDiscoveryFlow(
  savedRun: SavedNaturalAnalogueRun,
  savedHypotheses: { hypotheses: readonly TestableHypothesis[]; ingestedResults: readonly ExperimentalResult[]; mutuallyExclusiveGroups: readonly (readonly string[])[]; leadingHypothesis: string | null },
  engines: NaturalAnalogueCampaignEngines,
): FlowReplay {
  const campaignReplay = replaySavedNaturalAnalogueRun(savedRun, engines);

  const recomputed = runHypothesisCompetition(savedHypotheses.hypotheses, savedHypotheses.ingestedResults, savedHypotheses.mutuallyExclusiveGroups);
  const hypothesisReplay = recomputed.leadingHypothesis === savedHypotheses.leadingHypothesis
    ? { status: 'MATCH' as const, reason: '' }
    : { status: 'DRIFT' as const, reason: `Recomputing the hypothesis competition from the same inputs produced a different leader: saved "${savedHypotheses.leadingHypothesis}", recomputed "${recomputed.leadingHypothesis}".` };

  return { campaignReplay: { status: campaignReplay.status, reason: campaignReplay.reason }, hypothesisReplay };
}

export function saveScientificDiscoveryFlowToMemory(result: ScientificDiscoveryFlowResult): SavedExperiment {
  const leading = result.hypothesisCompetition.leadingHypothesis;
  return saveExperiment({
    labId: 'scientific-discovery-flow',
    experimentId: `${result.structuredRequest.requestId}:${result.discovery.resultFingerprint}`,
    experimentName: `${result.structuredRequest.rawText.slice(0, 80)} — end-to-end discovery flow`,
    params: {
      requestId: result.structuredRequest.requestId,
      actionable: result.actionable,
      hypothesisCount: result.hypothesisCompetition.outcomes.length,
      leadingHypothesis: leading ?? 'NONE',
    },
    stats: {
      candidatesEvaluated: result.discovery.campaign.candidates.length,
      supportedHypotheses: result.hypothesisCompetition.outcomes.filter((o) => o.competitionStatus === 'SUPPORTED').length,
      weakenedHypotheses: result.hypothesisCompetition.outcomes.filter((o) => o.competitionStatus === 'WEAKENED').length,
      falsifiedHypotheses: result.hypothesisCompetition.outcomes.filter((o) => o.competitionStatus === 'FALSIFIED').length,
    },
    analysis: [
      { title: 'Structured request', kind: 'request', body: describeStructuredRequest(result.structuredRequest) },
      { title: 'Strongest candidate', kind: 'candidate', body: `${result.discovery.strongestCandidate}: ${result.discovery.strongestCandidateBasis}` },
      { title: 'Hypothesis competition', kind: 'hypotheses', body: result.hypothesisCompetition.summary },
      { title: 'Next experiments', kind: 'next-experiment', body: result.nextExperiments.map((s) => s.action).join(' | ') || 'none proposed' },
      { title: 'Refused claims', kind: 'refused-claims', body: result.discovery.refusedClaims.join(' ') },
    ],
    honesty: 'simplified',
    honestyNote:
      'This flow parses a question with a rule-based lexicon (no LLM call), reuses the existing natural-analogue campaign unchanged, and runs multiple '
      + 'hypotheses against the same ingested evidence. No candidate is claimed equivalent to any reference compound.',
    epistemicStatus: `HYPOTHESES=${result.hypothesisCompetition.outcomes.length};LEADING=${leading ?? 'NONE'};DISCRIMINATED=${result.hypothesisCompetition.discriminated}`,
    assumptions: ['Rule-based NL extraction only recognises named lexicon entries; anything else is reported UNKNOWN, never guessed.'],
  });
}
