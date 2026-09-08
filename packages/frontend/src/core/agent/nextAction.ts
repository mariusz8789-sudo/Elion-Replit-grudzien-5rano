import type { StructuredExperimentRequest } from '../experimentFabric/types';

/**
 * ONE SHAPE FOR "WHAT SHOULD I RUN NEXT", ACROSS FIVE REAL SELECTORS.
 *
 * Genesis grew five independent answers to that question, each built for its
 * own substrate and each genuinely different in what it can see:
 *
 *   1. `selectNextHypothesisExperiment` — preregistered competing hypotheses
 *   2. `selectNextWorldExperiment`      — a WorldGraph counterfactual
 *   3. `buildExperimentGraph`           — an uncertainty graph over runs
 *   4. `proposeNextPrecisionExperiment` — a molecular precision analysis
 *   5. `analyzeAndDecide`               — a running chemistry campaign
 *
 * None of them is wrong and none subsumes another: they consume different
 * state and are the right answer for their own domain. What was missing is a
 * way for a CALLER to ask "what next, for domain X" without knowing which of
 * the five answers it.
 *
 * ## This is indirection, not a rewrite
 *
 * Every adapter here delegates to the real selector and changes nothing about
 * what it decides. Each adapter's test asserts the wrapped call returns
 * exactly what calling the selector directly returns — that is what `native`
 * is for: the selector's own output travels through untouched, so nothing is
 * lost in normalisation and equivalence is checkable rather than asserted.
 *
 * ## Where the shape is honest about not knowing
 *
 * The five selectors do not report the same things, and this contract does
 * not pretend otherwise. `resolves`, `rule` and `request` are nullable
 * because some selectors genuinely do not produce them, and `UNSPECIFIED`
 * exists because selector 4 returns prose with no status at all. Filling
 * those in by inference — sniffing the prose for a verdict, say — would be
 * inventing a decision the selector never made.
 */

export const NEXT_ACTION_CONTRACT_VERSION = '1.0.0';

/**
 * The union of what the five selectors really report.
 *
 * `STOP` and `UNSPECIFIED` are not shared vocabulary imposed on everyone —
 * they exist because two selectors genuinely produce them: the campaign
 * selector can decide the campaign is over, and the precision selector
 * reports no status whatsoever.
 */
export type NextActionStatus =
  | 'READY_TO_RUN'
  | 'VALIDATION_REQUIRED'
  | 'BLOCKED'
  | 'RESOLVED'
  | 'STOP'
  | 'UNSPECIFIED';

export interface NextAction {
  readonly contractVersion: string;
  /** Which of the five real selectors answered. Never inferred — set by the adapter. */
  readonly selectorId: string;
  readonly domain: string;
  readonly status: NextActionStatus;
  /** What to do next, in the selector's own words. */
  readonly action: string;
  /** Why this and not something else. */
  readonly why: string;
  /** What running it would settle. Null when the selector does not report one. */
  readonly resolves: string | null;
  /** The rule the proposal came from. Null when the selector does not name one. */
  readonly rule: string | null;
  /** An executable request, when the selector produced one. Null otherwise — never fabricated. */
  readonly request: StructuredExperimentRequest | null;
  /** Ids the proposal is about (hypotheses, uncertainties). Empty when the selector names none. */
  readonly about: readonly string[];
  /**
   * The wrapped selector's own return value, verbatim. Normalisation is
   * additive: anything this contract cannot express is still here, and the
   * adapter tests compare it against a direct call.
   */
  readonly native: unknown;
}

/** The single interface. `state` is whatever the wrapped selector already required. */
export type NextActionSelector<TState> = (state: TState) => NextAction;

/** Fills the fields every adapter shares, so no adapter can silently omit one. */
function nextAction(fields: Omit<NextAction, 'contractVersion'>): NextAction {
  return { contractVersion: NEXT_ACTION_CONTRACT_VERSION, ...fields };
}

// ---------------------------------------------------------------------------
// 1. Preregistered competing hypotheses.
// ---------------------------------------------------------------------------

import { selectNextHypothesisExperiment, type HypothesisLoopResult } from '../experimentFabric/hypothesisLoop';

export const HYPOTHESIS_LOOP_SELECTOR_ID = 'hypothesis-loop';

export const hypothesisLoopNextAction: NextActionSelector<HypothesisLoopResult> = (result) => {
  const native = selectNextHypothesisExperiment(result);
  return nextAction({
    selectorId: HYPOTHESIS_LOOP_SELECTOR_ID,
    domain: result.preregistration.set.problem.domainId,
    status: native.status,
    // This selector describes the next run through its request and its `why`,
    // and has no separate one-line action field; `why` is what it really says.
    action: native.why,
    why: native.why,
    resolves: native.resolves,
    rule: native.rule,
    request: native.request,
    about: native.aboutHypothesisIds,
    native,
  });
};

// ---------------------------------------------------------------------------
// 2. WorldGraph counterfactual.
// ---------------------------------------------------------------------------

import {
  selectNextWorldExperiment,
  type WorldCounterfactualAssessment,
  type WorldCounterfactualDiff,
} from '../worldModel/discovery/worldCounterfactual';

export const WORLD_COUNTERFACTUAL_SELECTOR_ID = 'world-counterfactual';

export interface WorldNextActionState {
  readonly assessment: WorldCounterfactualAssessment;
  readonly diff: WorldCounterfactualDiff;
  /** The world's domain, which the assessment itself does not carry. */
  readonly domain: string;
}

export const worldCounterfactualNextAction: NextActionSelector<WorldNextActionState> = (state) => {
  const native = selectNextWorldExperiment(state.assessment, state.diff);
  return nextAction({
    selectorId: WORLD_COUNTERFACTUAL_SELECTOR_ID,
    domain: state.domain,
    status: native.status,
    action: native.action,
    why: native.why,
    resolves: native.resolves,
    rule: native.rule,
    // This selector proposes a change to a world run, not a router request.
    request: null,
    about: [state.assessment.questionId],
    native,
  });
};

// ---------------------------------------------------------------------------
// 3. Uncertainty graph over real runs.
// ---------------------------------------------------------------------------

import { buildExperimentGraph, type ExperimentGraphInput } from '../experimentFabric/experimentGraph';

export const EXPERIMENT_GRAPH_SELECTOR_ID = 'experiment-graph';

export const experimentGraphNextAction: NextActionSelector<ExperimentGraphInput> = (input) => {
  const graph = buildExperimentGraph(input);
  const native = graph.nextExperiment;
  const domain = input.runs[0]?.request?.domainId ?? 'unknown';
  if (native === null) {
    // The graph found no uncertainty worth resolving. Reported as such rather
    // than as an empty proposal, which would read as "nothing to do here" for
    // a different reason than the real one.
    return nextAction({
      selectorId: EXPERIMENT_GRAPH_SELECTOR_ID,
      domain,
      status: 'RESOLVED',
      action: 'No next experiment proposed: the graph found no unresolved uncertainty.',
      why: 'Every uncertainty this graph tracks is either absent or already addressed by the runs supplied.',
      resolves: null,
      rule: null,
      request: null,
      about: [],
      native: null,
    });
  }
  return nextAction({
    selectorId: EXPERIMENT_GRAPH_SELECTOR_ID,
    domain,
    status: native.status,
    action: native.action,
    why: native.why,
    resolves: native.resolves,
    rule: native.rule,
    request: native.request,
    about: [native.uncertaintyId],
    native,
  });
};

// ---------------------------------------------------------------------------
// 4. Molecular precision analysis. Prose only — and said so.
// ---------------------------------------------------------------------------

import { proposeNextPrecisionExperiment } from '../discovery/molecular/precisionEvidencePack';
import type { PrecisionReferenceAnalysisResult } from '../discovery/molecular/precisionReferenceAnalysis';

export const PRECISION_ANALYSIS_SELECTOR_ID = 'precision-analysis';

/**
 * The one selector that returns a sentence and nothing else. Its status is
 * `UNSPECIFIED` because it reports none: deciding from the wording whether it
 * counts as READY_TO_RUN or RESOLVED would be this adapter inventing a verdict
 * the analysis never gave.
 */
export const precisionAnalysisNextAction: NextActionSelector<PrecisionReferenceAnalysisResult> = (result) => {
  const native = proposeNextPrecisionExperiment(result);
  return nextAction({
    selectorId: PRECISION_ANALYSIS_SELECTOR_ID,
    domain: 'molecular-precision',
    status: 'UNSPECIFIED',
    action: native,
    why: 'Proposed by the precision reference analysis from its own falsification checks.',
    resolves: null,
    rule: null,
    request: null,
    about: [],
    native,
  });
};

// ---------------------------------------------------------------------------
// 5. Running chemistry campaign — injected, because it lives in the backend.
// ---------------------------------------------------------------------------

export const CAMPAIGN_SELECTOR_ID = 'chemistry-campaign';

/** The shape `analyzeAndDecide` really returns. Mirrored, not imported — see below. */
export interface CampaignDecision {
  readonly decision: string;
  readonly params: Record<string, unknown>;
  readonly newStrategy: unknown;
  readonly purpose: string;
}

export interface CampaignSelectorDeps {
  readonly analyzeAndDecide: (state: unknown) => CampaignDecision;
  readonly isStop: (decision: string) => boolean;
}

/**
 * The campaign selector lives in `packages/backend/src/campaign/nextExperiment.mjs`,
 * which this package cannot import statically: a static import would pull backend
 * code into the browser bundle. So it is INJECTED — the real function is passed in
 * by a Node caller (the backend, or the adapter's own test), and this module never
 * references it.
 *
 * `isStop` is injected for the same reason it exists there: whether a decision ends
 * the campaign is the backend's own rule, and deciding it here by matching a
 * `STOP_` prefix would be this adapter guessing at another module's vocabulary.
 */
export function makeCampaignNextAction(deps: CampaignSelectorDeps): NextActionSelector<unknown> {
  return (state) => {
    const native = deps.analyzeAndDecide(state);
    return nextAction({
      selectorId: CAMPAIGN_SELECTOR_ID,
      domain: 'DRUG_DISCOVERY',
      status: deps.isStop(native.decision) ? 'STOP' : 'READY_TO_RUN',
      action: native.decision,
      why: native.purpose,
      resolves: null,
      rule: null,
      // The campaign's next step is a strategy change applied by its own
      // orchestrator, not a router request that could be executed standalone.
      request: null,
      about: [],
      native,
    });
  };
}

// ---------------------------------------------------------------------------
// The registry.
// ---------------------------------------------------------------------------

export interface RegisteredSelector {
  readonly selectorId: string;
  /** What this selector is the right answer for. */
  readonly answersFor: string;
  /** What state it needs — named, so a caller can tell whether it can supply it. */
  readonly requiresState: string;
}

/**
 * What exists, and what each one needs. Deliberately descriptive: a caller
 * picks a selector by the state it can actually supply, and there is no
 * "automatic" selector that would have to guess.
 */
export const NEXT_ACTION_SELECTORS: readonly RegisteredSelector[] = [
  {
    selectorId: HYPOTHESIS_LOOP_SELECTOR_ID,
    answersFor: 'A set of preregistered competing hypotheses that has been executed.',
    requiresState: 'HypothesisLoopResult',
  },
  {
    selectorId: WORLD_COUNTERFACTUAL_SELECTOR_ID,
    answersFor: 'A WorldGraph baseline-vs-intervention comparison judged against a preregistered criterion.',
    requiresState: 'WorldCounterfactualAssessment + WorldCounterfactualDiff',
  },
  {
    selectorId: EXPERIMENT_GRAPH_SELECTOR_ID,
    answersFor: 'A body of real runs whose remaining uncertainties should be ranked.',
    requiresState: 'ExperimentGraphInput',
  },
  {
    selectorId: PRECISION_ANALYSIS_SELECTOR_ID,
    answersFor: 'A molecular precision reference analysis with falsification checks.',
    requiresState: 'PrecisionReferenceAnalysisResult',
  },
  {
    selectorId: CAMPAIGN_SELECTOR_ID,
    answersFor: 'A running chemistry campaign generation, deciding how the next generation differs.',
    requiresState: 'Campaign generation context (backend-injected)',
  },
];
