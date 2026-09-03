/**
 * TEMPORAL DISCOVERY FLOW — the generic loop closed for the spacetime
 * research direction (Phase J of the mission).
 *
 * This is NOT a second discovery engine. It is the same shape
 * `scientificDiscoveryFlow.ts` already uses for chemistry/biology —
 * StructuredRequest -> domain execution -> Evidence/Memory -> Replay ->
 * next action — wired to the temporal domain's own real machinery instead
 * of duplicating it:
 *
 *   NATURAL LANGUAGE -> STRUCTURED REQUEST   parseNaturalLanguageScientificRequest
 *                                             (unchanged, reused as-is; it
 *                                             already recognises PHYSICS as
 *                                             a domain from real substring
 *                                             matches like "physics").
 *   HYPOTHESES + MODEL + FALSIFICATION       runSpacetimeStructureInquiry
 *                                             (unchanged, reused as-is).
 *   NEXT EXPERIMENT                          buildNextActionsFromSpacetimeInquiry
 *                                             (unchanged, reused as-is).
 *   EVIDENCE + MEMORY                        saveTemporalDiscoveryFlowToMemory,
 *                                             built on saveExperiment (the
 *                                             same primitive every other
 *                                             domain in this engine uses).
 *   REPLAY                                   replayTemporalDiscoveryFlow,
 *                                             delegating to
 *                                             replaySpacetimeStructureInquiry.
 *
 * The lexicon will correctly report UNKNOWN for pharmacology-specific
 * fields (goal, targets, mechanisms) on a temporal-physics question — that
 * is the CORRECT behaviour, not a bug: this engine does not stretch a
 * chemistry-shaped extractor to pretend it understood a physics question it
 * did not actually parse.
 */
import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import {
  describeStructuredRequest,
  parseNaturalLanguageScientificRequest,
  type StructuredScientificRequest,
} from '../molecular/naturalLanguageScientificRequest';
import { buildNextActionsFromSpacetimeInquiry, replaySpacetimeStructureInquiry, runSpacetimeStructureInquiry, type SpacetimeStructureInquiryResult } from './spacetimeStructureInquiry';
import type { NextScientificAction } from '../nextScientificAction';

export const TEMPORAL_DISCOVERY_FLOW_VERSION = '1.0.0';

export interface TemporalDiscoveryFlowResult {
  contractVersion: string;
  structuredRequest: StructuredScientificRequest;
  inquiry: SpacetimeStructureInquiryResult;
  nextActions: readonly NextScientificAction[];
  /** ESTABLISHED/DERIVED/MODEL-BASED/SPECULATIVE/UNRESOLVED/REQUIRES_EXPERIMENT, counted from the real inquiry — never asserted loosely. */
  epistemicSummary: string;
}

function buildEpistemicSummary(inquiry: SpacetimeStructureInquiryResult): string {
  const establishedFacts = inquiry.constraints.filter((c) => c.status === 'FACT').length;
  const modelBasedTheory = inquiry.constraints.filter((c) => c.status === 'THEORY').length;
  const openConjectures = inquiry.constraints.filter((c) => c.status === 'CONJECTURE').length;
  const consistent = inquiry.evaluations.filter((e) => e.verdict === 'CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS').length;
  const speculative = inquiry.evaluations.filter((e) => e.verdict === 'SPECULATIVE_NOT_EXCLUDED').length;
  const contradicted = inquiry.evaluations.filter((e) => e.verdict === 'CONTRADICTS_ESTABLISHED_PHYSICS').length;
  const unresolved = inquiry.evaluations.filter((e) => e.verdict === 'UNRESOLVED_OPEN_QUESTION').length;

  return [
    `ESTABLISHED=${establishedFacts} cited fact(s) among the declared constraints`,
    `MODEL_BASED=${modelBasedTheory} theory-level constraint(s), ${openConjectures} named conjecture(s)`,
    `DERIVED=${consistent} hypothesis(es) consistent with every confirmed observation`,
    `SPECULATIVE=${speculative} hypothesis(es) theoretically motivated but unconfirmed`,
    `UNRESOLVED=${unresolved} hypothesis(es) genuinely open`,
    `CONTRADICTED=${contradicted} hypothesis(es) ruled out by a confirmed fact`,
    `REQUIRES_EXPERIMENT_OR_THEORY=${inquiry.evaluations.length} of ${inquiry.evaluations.length} next action(s) are not runnable inside Genesis`,
  ].join('; ');
}

/**
 * Runs the full temporal discovery loop for one natural-language question.
 * `question` is not validated against a fixed lexicon of allowed phrasing —
 * whatever is passed is parsed honestly, UNKNOWN fields included.
 */
export function runTemporalDiscoveryFlow(question: string, requestId: string): TemporalDiscoveryFlowResult {
  const structuredRequest = parseNaturalLanguageScientificRequest(question, requestId);
  const inquiry = runSpacetimeStructureInquiry();
  const nextActions = buildNextActionsFromSpacetimeInquiry(inquiry);

  return {
    contractVersion: TEMPORAL_DISCOVERY_FLOW_VERSION,
    structuredRequest,
    inquiry,
    nextActions,
    epistemicSummary: buildEpistemicSummary(inquiry),
  };
}

export interface TemporalDiscoveryFlowReplay {
  status: 'MATCH' | 'DRIFT';
  reason: string;
}

/**
 * Replays a saved flow result: re-parses the SAME raw text (parsing is pure,
 * so this must be identical) and re-runs the inquiry via its own real
 * replay function. A drift in EITHER layer is reported, never hidden behind
 * the other layer's MATCH.
 */
export function replayTemporalDiscoveryFlow(saved: TemporalDiscoveryFlowResult): TemporalDiscoveryFlowReplay {
  const reparsed = parseNaturalLanguageScientificRequest(saved.structuredRequest.rawText, saved.structuredRequest.requestId);
  if (JSON.stringify(reparsed) !== JSON.stringify(saved.structuredRequest)) {
    return { status: 'DRIFT', reason: 'Re-parsing the same raw text produced a different structured request — the natural-language extractor changed since this run was saved.' };
  }

  const inquiryReplay = replaySpacetimeStructureInquiry(saved.inquiry);
  if (inquiryReplay.status === 'DRIFT') {
    return { status: 'DRIFT', reason: `Structured request replayed MATCH, but the spacetime inquiry drifted: ${inquiryReplay.reason}` };
  }

  return { status: 'MATCH', reason: '' };
}

/**
 * EVIDENCE + MEMORY for the whole flow, built on the same `saveExperiment`
 * primitive every other domain in this engine uses — a SEPARATE, flow-level
 * memory entry from the inquiry's own (already-saved) entry, exactly the
 * way `scientificDiscoveryFlow.ts` layers a flow-level save on top of the
 * campaign-level save it wraps.
 */
export function saveTemporalDiscoveryFlowToMemory(result: TemporalDiscoveryFlowResult): SavedExperiment {
  return saveExperiment({
    labId: 'temporal-discovery-flow',
    experimentId: `${result.structuredRequest.requestId}:${result.inquiry.resultFingerprint}`,
    experimentName: `${result.structuredRequest.rawText.slice(0, 80)} — temporal discovery flow`,
    params: {
      requestId: result.structuredRequest.requestId,
      domainStatus: result.structuredRequest.domain.status,
      hypothesisCount: result.inquiry.evaluations.length,
      nextActionCount: result.nextActions.length,
    },
    stats: {
      consistentCount: result.inquiry.evaluations.filter((e) => e.verdict === 'CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS').length,
      speculativeCount: result.inquiry.evaluations.filter((e) => e.verdict === 'SPECULATIVE_NOT_EXCLUDED').length,
      unresolvedCount: result.inquiry.evaluations.filter((e) => e.verdict === 'UNRESOLVED_OPEN_QUESTION').length,
    },
    analysis: [
      { title: 'Structured request', kind: 'request', body: describeStructuredRequest(result.structuredRequest) },
      { title: 'Overall conclusion', kind: 'conclusion', body: result.inquiry.overallConclusion },
      { title: 'Epistemic summary', kind: 'epistemic-summary', body: result.epistemicSummary },
      ...result.nextActions.map((a) => ({ title: a.actionId, kind: 'next-action', body: `${a.availability} (${a.expectedDiscriminatingPower}) — ${a.question}` })),
    ],
    honesty: 'simplified',
    honestyNote:
      'This flow re-uses the existing natural-language extractor (unchanged) and the existing spacetime structure inquiry (unchanged) — it is a thin orchestration layer, not a second discovery engine. '
      + 'Pharmacology-specific fields (goal, targets, mechanisms) are honestly UNKNOWN for a physics question; that is not a parsing failure.',
    epistemicStatus: result.epistemicSummary,
    assumptions: [...result.inquiry.assumptions],
  });
}
