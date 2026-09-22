import type { EvidenceSink } from '../scientificWorlds/humanLab/contracts';
import type { OrganSystemId } from '../scientificWorlds/humanLab/types';
import {
  runScientificIntegrationCampaign,
  type RunScientificCampaignOptions,
  type ScientificCampaignResult,
} from '../experimentFabric/scientificIntegration';

/**
 * PAIN DISCOVERY — research use case (Universe Engine reference-package integration, item 10).
 *
 * The reference package's `genesis-pain-discovery-engine-e2e-v1` ships a full standalone
 * pain-research pipeline (its own closed loop, evidence store, human-twin model, experiment
 * planner, falsification, orchestrator). None of that is copied here: per this repo's own
 * rule, pain research is "a research use case over Human Digital Twin + Experiment Planner +
 * Evidence + Meta-Cognition" — i.e. it should be a thin binding onto the systems that already
 * exist, not a seventh parallel implementation of hypotheses/evidence/falsification.
 *
 * This module IS that thin binding: it reuses the real closed-loop coordinator
 * (`experimentFabric/scientificIntegration.ts::runScientificIntegrationCampaign`, itself a
 * wrapper over `researchCampaign.ts`/`hypothesisLoop.ts` — unmodified), reuses the real Human
 * Twin anatomy ontology (`scientificWorlds/humanLab/types.ts::OrganSystemId`, not a new one),
 * and adds only what pain research genuinely needs on top: a mandatory, enforced safety
 * envelope, and a target binding to a body region.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: `HYPOTHESIS_PROBLEMS` (`hypothesisLoop.ts`) is a fixed,
 * hand-declared catalog of research questions bound to real models — "declared, not derived
 * from text," by that file's own design. No pain-specific biophysics model/problem exists in
 * that catalog today, and adding one is a change to a large, heavily-tested, shared file that
 * this integration pass judged out of safe scope to make blind. `runPainResearchQuestion`
 * below therefore requires the caller to supply an EXISTING declared `backingProblemId` — this
 * module adds no new scientific capability, only the safety/labeling/twin-binding layer. Once a
 * real pain-relevant `HypothesisProblem` is declared in that catalog, this module needs no
 * changes to use it (see final handoff report: `REQUIRED_CROSS_OWNERSHIP_CHANGE` note).
 */
export const PAIN_RESEARCH_USE_CASE_VERSION = '1.0.0';

export interface PainResearchGovernance {
  readonly scope: 'SIMULATION_ONLY';
  readonly researchPriorityDisclaimer: 'RESEARCH_PRIORITY_NOT_CLINICAL_EFFICACY';
  readonly deviceClaim: 'NOT_A_MEDICAL_DEVICE';
}

export const PAIN_RESEARCH_GOVERNANCE_ENVELOPE: PainResearchGovernance = Object.freeze({
  scope: 'SIMULATION_ONLY',
  researchPriorityDisclaimer: 'RESEARCH_PRIORITY_NOT_CLINICAL_EFFICACY',
  deviceClaim: 'NOT_A_MEDICAL_DEVICE',
});

/** Which body region a pain research question concerns — reuses the real Human Twin ontology, never a second one. */
export interface PainResearchTarget {
  readonly anatomyNodeId: string;
  readonly organSystem?: OrganSystemId;
  readonly label: string;
}

export interface PainResearchQuestion {
  readonly questionId: string;
  readonly statement: string;
  readonly target: PainResearchTarget;
  /** Must name an EXISTING entry in `HYPOTHESIS_PROBLEMS` — this module never invents a model. */
  readonly backingProblemId: string;
}

export interface PainResearchReport {
  readonly contractVersion: string;
  readonly governance: PainResearchGovernance;
  readonly question: PainResearchQuestion;
  readonly campaign: ScientificCampaignResult;
}

const FORBIDDEN_CLINICAL_PATTERNS: readonly RegExp[] = [
  /\bdos(e|ing|age)\b/i,
  /\bmg\/kg\b/i,
  /\btitrat/i,
  /\bprescri(be|ption)\b/i,
  /\bactuat/i,
];

/**
 * Enforces "no treatment parameters, no dosing, no device actuation" as a real check on the
 * question text, not just a comment — throws rather than silently allowing a clinical-sounding
 * question through this SIMULATION_ONLY research surface.
 */
export function assertNoClinicalOrActuationParameters(question: PainResearchQuestion): void {
  for (const pattern of FORBIDDEN_CLINICAL_PATTERNS) {
    if (pattern.test(question.statement)) {
      throw new Error(
        `PAIN_RESEARCH_REJECTED: question statement matches a forbidden clinical/dosing/actuation pattern (${pattern.source}): "${question.statement}"`,
      );
    }
  }
}

/**
 * Runs a pain research question through the real, existing scientific-integration campaign
 * coordinator, then wraps the result with the mandatory governance envelope and the target's
 * Human Twin binding. Never fabricates a pain-specific simulation result of its own.
 */
export async function runPainResearchQuestion(
  question: PainResearchQuestion,
  evidenceSink: EvidenceSink,
  options?: RunScientificCampaignOptions,
): Promise<PainResearchReport> {
  assertNoClinicalOrActuationParameters(question);
  const campaign = await runScientificIntegrationCampaign(question.backingProblemId, evidenceSink, options);
  return {
    contractVersion: PAIN_RESEARCH_USE_CASE_VERSION,
    governance: PAIN_RESEARCH_GOVERNANCE_ENVELOPE,
    question,
    campaign,
  };
}
