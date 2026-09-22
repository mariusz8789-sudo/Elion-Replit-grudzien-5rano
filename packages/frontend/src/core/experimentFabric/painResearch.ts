import type { EvidenceSink } from '../scientificWorlds/humanLab/contracts';
import type { OrganSystemId } from '../scientificWorlds/humanLab/types';
import {
  runScientificIntegrationCampaign,
  type RunScientificCampaignOptions,
  type ScientificCampaignResult,
} from './scientificIntegration';

/**
 * PAIN DISCOVERY — research-only integration (Overnight Science Task 8).
 *
 * "A research use case over Human Digital Twin + Experiment Planner + Evidence +
 * Meta-Cognition" — never a seventh parallel hypothesis/evidence/planner system. This module
 * reuses the real, existing closed-loop coordinator
 * (`experimentFabric/scientificIntegration.ts::runScientificIntegrationCampaign`, itself a
 * wrapper over `researchCampaign.ts`/`hypothesisLoop.ts` — unmodified), and the real Human Twin
 * anatomy ontology (`scientificWorlds/humanLab/types.ts::OrganSystemId`, not a new one).
 *
 * THE HONESTY RULE THIS FILE EXISTS TO ENFORCE: `hypothesisLoop.ts::HYPOTHESIS_PROBLEMS` is a
 * fixed, hand-declared catalog of research questions bound to real models. No pain-specific
 * biophysics model/problem is declared in that catalog today (confirmed by inspecting it before
 * writing this file). The wrong thing to do here would be to quietly run an unrelated declared
 * problem (an epidemiology or chemistry model) and PRESENT its output as pain research — that is
 * exactly the "relabeling another solver" this module must never do. So by default,
 * `runPainResearchQuestion` returns an honest `BLOCKED` capability status and runs nothing. A
 * caller MAY explicitly opt in to running an existing, unrelated declared problem as a stand-in
 * (e.g. to exercise the pipeline end-to-end before a real pain model exists) by supplying
 * `backingProblemId` — that path is always reported as `PARTIAL`, with an explicit, unremovable
 * disclaimer that the underlying model is not pain-specific. Neither path can ever report
 * `COMPLETE`.
 */
export const PAIN_RESEARCH_VERSION = '1.0.0';

export interface PainResearchGovernance {
  readonly scope: 'SIMULATION_ONLY';
  readonly deviceClaim: 'NOT_A_MEDICAL_DEVICE';
  readonly researchPriorityDisclaimer: 'RESEARCH_PRIORITY_NOT_CLINICAL_EFFICACY';
}

export const PAIN_RESEARCH_GOVERNANCE_ENVELOPE: PainResearchGovernance = Object.freeze({
  scope: 'SIMULATION_ONLY',
  deviceClaim: 'NOT_A_MEDICAL_DEVICE',
  researchPriorityDisclaimer: 'RESEARCH_PRIORITY_NOT_CLINICAL_EFFICACY',
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
  /**
   * OPT-IN ONLY. When omitted (the default, and the honest path), no model runs at all and the
   * result is BLOCKED. When supplied, names an EXISTING entry in `HYPOTHESIS_PROBLEMS` — this
   * module never invents a pain-specific model — and the result is always reported PARTIAL, with
   * an explicit disclaimer that the bound model is not pain-specific.
   */
  readonly backingProblemId?: string;
}

export type PainResearchCapabilityStatus = 'BLOCKED' | 'PARTIAL';

export interface PainResearchReport {
  readonly contractVersion: string;
  readonly governance: PainResearchGovernance;
  readonly question: PainResearchQuestion;
  readonly status: PainResearchCapabilityStatus;
  readonly reason: string;
  /** Present only when `status === 'PARTIAL'` — the real campaign run against the caller-supplied stand-in problem. */
  readonly campaign?: ScientificCampaignResult;
}

const FORBIDDEN_CLINICAL_PATTERNS: readonly RegExp[] = [
  /\bdos(e|ing|age)\b/i,
  /\bmg\/kg\b/i,
  /\btitrat/i,
  /\bprescri(be|ption)\b/i,
  /\bdiagnos(e|is|tic)\b/i,
  /\btreatment recommendation\b/i,
  /\bactuat/i,
];

/**
 * Enforces "no dosing, no diagnosis, no treatment recommendation, no real-device actuation" as
 * a real check on the question text, not just a comment — throws rather than silently allowing
 * a clinical-sounding question through this SIMULATION_ONLY research surface.
 */
export function assertNoClinicalOrActuationParameters(question: PainResearchQuestion): void {
  for (const pattern of FORBIDDEN_CLINICAL_PATTERNS) {
    if (pattern.test(question.statement)) {
      throw new Error(
        `PAIN_RESEARCH_REJECTED: question statement matches a forbidden clinical/dosing/diagnostic/actuation pattern (${pattern.source}): "${question.statement}"`,
      );
    }
  }
}

/**
 * Runs a pain research question honestly: BLOCKED by default (no pain-specific model exists to
 * run), or PARTIAL against a caller-declared, explicitly-disclaimed stand-in problem. Never
 * fabricates a pain-specific simulation result, and never silently presents an unrelated
 * model's output as pain research.
 */
export async function runPainResearchQuestion(
  question: PainResearchQuestion,
  evidenceSink: EvidenceSink,
  options?: RunScientificCampaignOptions,
): Promise<PainResearchReport> {
  assertNoClinicalOrActuationParameters(question);

  if (!question.backingProblemId) {
    return {
      contractVersion: PAIN_RESEARCH_VERSION,
      governance: PAIN_RESEARCH_GOVERNANCE_ENVELOPE,
      question,
      status: 'BLOCKED',
      reason: 'No pain-specific biophysics model is declared in the canonical HYPOTHESIS_PROBLEMS catalog. Returning BLOCKED honestly rather than relabeling an unrelated solver as pain research.',
    };
  }

  const campaign = await runScientificIntegrationCampaign(question.backingProblemId, evidenceSink, options);
  return {
    contractVersion: PAIN_RESEARCH_VERSION,
    governance: PAIN_RESEARCH_GOVERNANCE_ENVELOPE,
    question,
    status: 'PARTIAL',
    reason: `Ran caller-supplied stand-in problem "${question.backingProblemId}" — this model is NOT pain-specific; it exercises the pipeline only, never a pain-research finding.`,
    campaign,
  };
}
