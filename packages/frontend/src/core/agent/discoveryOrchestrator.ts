import { admitWorldQuestion } from './discoveryAdmission';
import { calibrationStrategy, mechanismStrategy, parameterStrategy } from './discoveryStrategies';
import type { Admission, QuestionShape, StrategyRun } from './discoveryStrategy';
import { memoryNarrowedHypotheses } from './inquirySession';
import type { InquiryLoopInput } from './inquiryLoop';
import { priorRefutedHypothesisIds } from './worldDiscoverySession';
import type { WorldParameterCalibrationInput } from './worldParameterCalibration';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal, type WorldLeverCatalog } from './worldGoalIntent';

/**
 * DISCOVERY ORCHESTRATOR — one entry point, and the place a question is refused.
 *
 * ADR-001 step 4. This is a HOST, not a third investigation loop. It owns no
 * experiment execution and no belief representation: it decides which strategy
 * holds a question, makes admission mandatory before anything runs, and returns
 * the strategy's own `StrategyRun` untouched. Everything scientific stays where
 * it already is, and the equivalence test that guards this file asserts exactly
 * that — a question routed through here produces the same finding as calling
 * the strategy directly.
 *
 * ## What it actually adds, beyond a function call
 *
 * REFUSAL BECOMES A RESULT. Neither loop checks whether Genesis can answer the
 * question at all; both assume it is answerable because something routed it to
 * them. Ask `runAutonomousDiscovery` about a volcano and it will dutifully
 * search a flood city's levers. Here, admission runs FIRST and a refusal is a
 * value with a named gap — not an exception, not an empty result, and not a
 * search over whatever levers happened to exist.
 *
 * ONE REFUSAL VOCABULARY FOR TWO KINDS OF "NO". A question can fail because
 * Genesis has no solver for it (capability) or because the goal named nothing
 * this world computes (planning). Those are different facts and both are real,
 * so both are reported — `stage` says which — but both speak the existing
 * `Admission` vocabulary. No fifth status word was invented for the second one.
 *
 * THE CAVEAT TRAVELS WITH THE FINDING. `admission` is carried on a successful
 * run too, not just on a refusal. A result obtained through a PARTIALLY_MODELLED
 * capability is worth exactly what that capability is worth, and a consumer that
 * only ever sees `run` would have no way to know.
 *
 * ## Why admission runs before planning, and why MECHANISM is the odd one out
 *
 * `DiscoveryStrategy.admit` takes the strategy's own input, which for MECHANISM
 * exists only AFTER a plan is built. Building one first would produce a worse
 * refusal: asked "will the volcano erupt?" against a flood world, plan-first
 * answers "no objective metric was recognised; this world computes peakDepthM"
 * — true, and beside the point, because the real gap is that Genesis has no
 * volcano solver. So MECHANISM is admitted on the raw goal via
 * `admitWorldQuestion`, which is precisely the function `mechanismStrategy.admit`
 * delegates to — the same admission, asked where the information exists, not a
 * second copy of it. PARAMETER's and CALIBRATION's inputs are both fully
 * declared by their caller, so `parameterStrategy.admit` /
 * `calibrationStrategy.admit` are used directly on `request.input`, no planning
 * step involved for either.
 *
 * ## Why the request shapes are asymmetric, and why that is honest
 *
 * A MECHANISM request is a goal plus a world, because a WorldGraph world
 * declares its own lever catalog and `parseWorldDiscoveryGoal` can read a goal
 * against it — real reuse of the parser the single-hypothesis path already uses,
 * so a goal admitted here and a goal planned there cannot disagree.
 *
 * A PARAMETER request carries its `InquiryLoopInput` whole, because there is no
 * equivalent: a system under study is a specific experimental setup someone
 * configured, and its `hiddenParameters` ARE the answer being sought. An
 * orchestrator that manufactured one from a sentence would be inventing the
 * result it is supposed to measure — which is the exact failure
 * `ObservableSystem` exists to make impossible at compile time.
 *
 * A CALIBRATION request carries its `WorldParameterCalibrationInput` whole for
 * the identical reason, one level down: `WorldParameterSystem.hiddenValue` and
 * `buildWorldAt` together ARE the world the calibration is trying to identify,
 * so there is nothing here for an orchestrator to derive from a sentence
 * either — `system.scenarioKind` is the one thing it reads, purely to admit,
 * never to build anything. The asymmetry across all three is a fact about the
 * substrates, not a shortcut, and it is stated rather than papered over with a
 * symmetry that would have to fabricate something.
 *
 * ## What this deliberately does not do
 *
 * It does not generate hypotheses. All three strategies are handed the
 * hypotheses they investigate, and turning falsifications into new candidates
 * is P3 (`deriveAlternativeCriteria`, built and tested and not yet wired) — a
 * separate change, on top of this one, once this stands on its own.
 */

/** 1.1.0 added the `CALIBRATION` shape and `CalibrationRequest`. Additive: `DiscoveryOutcome`'s own shape is unchanged, `shape` simply carries a third real value now. */
export const DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION = '1.1.0';

/** A mechanism question: a goal, against a world that declares its own levers. */
export interface MechanismRequest {
  readonly shape: 'MECHANISM';
  readonly goal: string;
  readonly catalog: WorldLeverCatalog;
}

/** A parameter question: a fully declared system under study. See the module doc for why this is not a sentence. */
export interface ParameterRequest {
  readonly shape: 'PARAMETER';
  readonly input: InquiryLoopInput;
}

/**
 * A calibration question: a fully declared world-parameter calibration. Same
 * asymmetry rationale as `ParameterRequest`, one level down: a
 * `WorldParameterSystem`'s `hiddenValue` and `buildWorldAt` ARE the answer
 * being sought and the world that produces it, so this carries the whole
 * `WorldParameterCalibrationInput` rather than a goal an orchestrator would
 * have to guess a `ScenarioKind` and a solver constant out of.
 */
export interface CalibrationRequest {
  readonly shape: 'CALIBRATION';
  readonly input: WorldParameterCalibrationInput;
}

export type DiscoveryRequest = MechanismRequest | ParameterRequest | CalibrationRequest;

/** Where a question stopped. Both are real refusals; they are not the same fact. */
export type RefusalStage =
  /** Genesis has no capability behind the question. */
  | 'ADMISSION'
  /** The capability exists, but the goal named nothing this world computes, or no direction to move it. */
  | 'PLAN';

export interface DiscoveryRefused {
  readonly status: 'REFUSED';
  readonly contractVersion: string;
  readonly shape: QuestionShape;
  readonly stage: RefusalStage;
  readonly admission: Admission;
}

/**
 * MEMORY → SELECTION — P1. Genesis reads what it already knows, recognises
 * which declared hypotheses are already settled, and lets that decide what it
 * still needs to find out before choosing the next experiment.
 *
 * ## Not a second memory
 *
 * This orchestrator has no store of its own. It reads the SAME persisted
 * Science Memory `worldDiscoverySession.ts`/`inquirySession.ts` already
 * narrow on — `priorRefutedHypothesisIds` and `memoryNarrowedHypotheses`,
 * reused verbatim, not reimplemented. A run through this front door and a run
 * through the legacy session now see the same memory and make the same
 * narrowing decision from it, because they call the same two functions.
 *
 * ## What "recognises already obalone" actually means here
 *
 * `priorRefutedHypothesisIds`/`memoryNarrowedHypotheses` look at PRIOR
 * `StrategyRun`s of the SAME world/system and collect every hypothesis that
 * ended REFUTED — never SUPPORTED (see `memoryNarrowedHypotheses`'s own doc
 * on why: under degeneracy, agreeing with one measurement settles nothing, so
 * a "supported" survivor is tested again, not banked). "What Genesis still
 * needs to find out" is therefore exactly the declared hypotheses NOT in that
 * refuted set — the open questions a prior run left standing.
 *
 * ## The one rule that keeps this from ever silently testing nothing
 *
 * If EVERY declared hypothesis was already refuted, narrowing to the empty
 * set would not be "efficient" — it would be running nothing and calling it a
 * result. So this reuses the legacy sessions' own fallback: run the full
 * declared set again rather than test an empty one, and say so honestly in
 * `reason`.
 *
 * ## Why this still isn't a change to which strategy answers, or how
 *
 * `MechanismStrategy`/`ParameterStrategy` are handed a NARROWED
 * `hypotheses`/`executedInput` — the exact same shape they already accept
 * from any caller. Neither strategy, neither loop, and no belief
 * representation changes. This is memory deciding WHAT is asked, never HOW
 * the asking works — the same boundary that kept P3's regeneration out of the
 * loop's own control flow.
 */
export interface PriorInvestigationDecision {
  /** Hypotheses in THIS request an earlier investigation of the same world/system already refuted — and this run skipped for it. */
  readonly skippedHypothesisIds: readonly string[];
  readonly reason: string;
}

export interface DiscoveryRan {
  readonly status: 'RAN';
  readonly contractVersion: string;
  readonly shape: QuestionShape;
  /** Carried on success too: a finding is worth what the capability behind it is worth. */
  readonly admission: Admission;
  /** The strategy's own result — over whatever hypotheses memory left open. */
  readonly run: StrategyRun;
  /** Null when memory had nothing to say — no prior investigation, or none of it applies here. */
  readonly priorInvestigation: PriorInvestigationDecision | null;
}

export type DiscoveryOutcome = DiscoveryRan | DiscoveryRefused;

/** An admission that permits work. APPROXIMATION proceeds — with its caveat attached, never dropped. */
function admits(admission: Admission): boolean {
  return admission.status === 'REAL' || admission.status === 'APPROXIMATION';
}

function refused(shape: QuestionShape, stage: RefusalStage, admission: Admission): DiscoveryRefused {
  return { status: 'REFUSED', contractVersion: DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION, shape, stage, admission };
}

function ran(
  shape: QuestionShape,
  admission: Admission,
  run: StrategyRun,
  priorInvestigation: PriorInvestigationDecision | null,
): DiscoveryRan {
  return { status: 'RAN', contractVersion: DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION, shape, admission, run, priorInvestigation };
}

/**
 * Routes one question to the one strategy that handles its shape, after
 * admission and — for MECHANISM — after planning.
 *
 * Routing is on the caller's declared `shape` and nothing else. There is no
 * `if (domain === ...)` here and there must never be one: a new domain is a new
 * catalog, never a new branch in this file.
 */
export function runDiscovery(request: DiscoveryRequest): DiscoveryOutcome {
  if (request.shape === 'PARAMETER') {
    const admission = parameterStrategy.admit(request.input);
    if (!admits(admission)) return refused('PARAMETER', 'ADMISSION', admission);

    // The SAME narrowing `inquirySession.ts` already applies
    // (`parameterInquirySystemKey`) — `executedInput` is what actually runs,
    // never discarded: memory now decides what this front door still needs
    // to find out, exactly as it already decides for the legacy session.
    const { executedInput, resumedFromMemory } = memoryNarrowedHypotheses(request.input);
    const priorInvestigation: PriorInvestigationDecision | null = resumedFromMemory
      ? { skippedHypothesisIds: resumedFromMemory.skippedHypothesisIds, reason: resumedFromMemory.reason }
      : null;

    return ran('PARAMETER', admission, parameterStrategy.run(executedInput), priorInvestigation);
  }

  if (request.shape === 'CALIBRATION') {
    const admission = calibrationStrategy.admit(request.input);
    if (!admits(admission)) return refused('CALIBRATION', 'ADMISSION', admission);
    // Memory-warning not yet wired for this shape: no existing session narrows
    // world-parameter calibration the way `worldDiscoverySession.ts`/
    // `inquirySession.ts` do for the other two, so there is nothing to read
    // yet — null here is honest, not an oversight.
    return ran('CALIBRATION', admission, calibrationStrategy.run(request.input), null);
  }

  const admission = admitWorldQuestion(request.goal);
  if (!admits(admission)) return refused('MECHANISM', 'ADMISSION', admission);

  const intent = parseWorldDiscoveryGoal(request.goal, request.catalog);
  const plan = buildWorldDiscoveryPlan(intent, request.catalog);
  if ('error' in plan) {
    // The capability exists; this world could not be ASKED this. Reported in the
    // same vocabulary rather than a second one, with the planner's own sentence
    // as the reason — it already names which quantities this world computes.
    return refused('MECHANISM', 'PLAN', {
      status: 'NOT_MODELLED',
      why: plan.error,
      missing: ['a goal naming one quantity this world computes, and a direction to move it'],
      caveat: null,
    });
  }

  // `intent.objectiveMetric`/`intent.direction` are non-null here — `plan`
  // only builds once the planner has resolved both.
  const refuted = priorRefutedHypothesisIds(request.catalog.catalogId, intent.objectiveMetric!, intent.direction!);
  const alreadyRefuted = plan.hypotheses.map((h) => h.hypothesisId).filter((id) => refuted.has(id));

  // Same fallback `worldDiscoverySession.ts::runWorldDiscoveryAndRemember`
  // already uses: never narrow to the empty set. If nothing declared is still
  // open, running the full set again is the honest move — a result that
  // "tested nothing" is not a result.
  let hypothesesToRun = plan.hypotheses;
  let priorInvestigation: PriorInvestigationDecision | null = null;
  if (alreadyRefuted.length > 0) {
    const stillOpen = plan.hypotheses.filter((h) => !refuted.has(h.hypothesisId));
    if (stillOpen.length > 0) {
      hypothesesToRun = stillOpen;
      priorInvestigation = {
        skippedHypothesisIds: alreadyRefuted,
        reason: `Skipped ${alreadyRefuted.join(', ')}: already refuted for "${intent.direction} ${intent.objectiveMetric}" in an earlier run on this world, so this run tests only what is still open.`,
      };
    } else {
      priorInvestigation = {
        skippedHypothesisIds: [],
        reason: `Every declared hypothesis for "${intent.direction} ${intent.objectiveMetric}" was already refuted in an earlier run; running the full declared set again rather than testing nothing.`,
      };
    }
  }

  return ran('MECHANISM', admission, mechanismStrategy.run({ ...plan, hypotheses: hypothesesToRun }), priorInvestigation);
}
