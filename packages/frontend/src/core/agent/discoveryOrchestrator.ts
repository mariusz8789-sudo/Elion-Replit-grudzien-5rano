import { admitWorldQuestion } from './discoveryAdmission';
import { mechanismStrategy, parameterStrategy } from './discoveryStrategies';
import type { Admission, QuestionShape, StrategyRun } from './discoveryStrategy';
import { memoryNarrowedHypotheses } from './inquirySession';
import type { InquiryLoopInput } from './inquiryLoop';
import { priorRefutedHypothesisIds } from './worldDiscoverySession';
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
 * ## Why admission runs before planning, and why the two shapes differ there
 *
 * `DiscoveryStrategy.admit` takes the strategy's own input, which for MECHANISM
 * exists only AFTER a plan is built. Building one first would produce a worse
 * refusal: asked "will the volcano erupt?" against a flood world, plan-first
 * answers "no objective metric was recognised; this world computes peakDepthM"
 * — true, and beside the point, because the real gap is that Genesis has no
 * volcano solver. So MECHANISM is admitted on the raw goal via
 * `admitWorldQuestion`, which is precisely the function `mechanismStrategy.admit`
 * delegates to — the same admission, asked where the information exists, not a
 * second copy of it. PARAMETER's input is fully declared by its caller, so
 * `parameterStrategy.admit` is used directly.
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
 * `ObservableSystem` exists to make impossible at compile time. The asymmetry is
 * a fact about the two substrates, and it is stated rather than papered over
 * with a symmetry that would have to fabricate something.
 *
 * ## What this deliberately does not do
 *
 * It does not generate hypotheses. Both strategies are handed the hypotheses
 * they investigate, and turning falsifications into new candidates is P3
 * (`deriveAlternativeCriteria`, built and tested and not yet wired) — a separate
 * change, on top of this one, once this stands on its own.
 */

export const DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION = '1.0.0';

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

export type DiscoveryRequest = MechanismRequest | ParameterRequest;

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
 * MEMORY, CONSULTED BUT NOT OBEYED — a warning, not a narrowing.
 *
 * `worldDiscoverySession.ts`/`inquirySession.ts` already have a STRONGER
 * mechanism: they drop hypotheses an earlier run in the SAME world/system
 * already falsified before executing. This orchestrator deliberately does
 * NOT do that — it is Genesis's one front door, and a caller asking a
 * declared question should get exactly that question answered in full, never
 * a silently smaller one. What it DOES do is read the same memory those
 * sessions already narrow on (`priorRefutedHypothesisIds`,
 * `memoryNarrowedHypotheses` — reused, not reimplemented) and report what it
 * found, so a caller — the Matrix, the Voice Guide — can say "Genesis already
 * ruled this out once" without the run itself being any different for it.
 *
 * Whether `runDiscovery` should also narrow, matching the legacy sessions, is
 * a real product question — same question, different behaviour depending on
 * which entry point answers it, is not something to decide unilaterally here.
 */
export interface PriorInvestigationWarning {
  /** Hypotheses in THIS request already refuted by an earlier investigation of the same world/system. */
  readonly skippedHypothesisIds: readonly string[];
  readonly reason: string;
}

export interface DiscoveryRan {
  readonly status: 'RAN';
  readonly contractVersion: string;
  readonly shape: QuestionShape;
  /** Carried on success too: a finding is worth what the capability behind it is worth. */
  readonly admission: Admission;
  readonly run: StrategyRun;
  /** Null when memory has nothing to say — no prior investigation, or none of it applies here. */
  readonly priorInvestigation: PriorInvestigationWarning | null;
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
  priorInvestigation: PriorInvestigationWarning | null,
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

    // Reads the same match rule `inquirySession.ts` narrows on
    // (`parameterInquirySystemKey`) but the returned `executedInput` is
    // discarded on purpose — this front door runs the request as declared.
    const { resumedFromMemory } = memoryNarrowedHypotheses(request.input);
    const priorInvestigation: PriorInvestigationWarning | null = resumedFromMemory
      ? { skippedHypothesisIds: resumedFromMemory.skippedHypothesisIds, reason: resumedFromMemory.reason }
      : null;

    return ran('PARAMETER', admission, parameterStrategy.run(request.input), priorInvestigation);
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
  const priorInvestigation: PriorInvestigationWarning | null =
    alreadyRefuted.length > 0
      ? {
          skippedHypothesisIds: alreadyRefuted,
          reason: `${alreadyRefuted.join(', ')} already refuted for "${intent.direction} ${intent.objectiveMetric}" in an earlier run on this world.`,
        }
      : null;

  return ran('MECHANISM', admission, mechanismStrategy.run(plan), priorInvestigation);
}
