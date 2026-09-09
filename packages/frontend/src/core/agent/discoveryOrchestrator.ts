import { admitWorldQuestion } from './discoveryAdmission';
import { calibrationStrategy, parameterStrategy, toMechanismRun, toParameterRun } from './discoveryStrategies';
import type { Admission, QuestionShape, StrategyRun } from './discoveryStrategy';
import { memoryNarrowedHypotheses, runInquiryWithGeneration } from './inquirySession';
import type { JointInterventionAssessment } from './mechanismInteraction';
import {
  runDiscoveryWithJointGeneration,
  toJointMechanismRun,
  type DerivedJointMechanism,
} from './mechanismGeneration';
import { derivedValueStanding, type DerivedParameterHypothesis, type DerivedValueAssessment } from './parameterAlternative';
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
 * ## What it does NOT hand its strategies, and what it now does
 *
 * It still hands no strategy a hypothesis of its own invention: all three are
 * given the hypotheses their caller declared, and routing never edits a claim.
 *
 * What changed is what happens AFTER a strategy exhausts those claims. BOTH
 * investigative shapes now run their generation continuation here, and each is
 * reported as a SECOND `StrategyRun` beside the first rather than merged into
 * it (`GeneratedInvestigation` below):
 *
 *   PARAMETER — every declared value refuted, so Genesis derives one nobody
 *     proposed and tests it on evidence that value did not author.
 *   MECHANISM — rival mechanisms both survived, so Genesis composes a lever
 *     nobody declared (both at once, one fork) and measures whether they
 *     compose. That question cannot be computed from their separate effects:
 *     it is measurably sub-additive on the generator fixture.
 *
 * The two are a discriminated union rather than one shape, because a derived
 * VALUE and a composed MECHANISM are genuinely different findings — see
 * `GeneratedInvestigation`.
 *
 * CALIBRATION has no generation primitive at all, so `generated` is null there
 * and `noGenerationReason` says which case applies. That remaining asymmetry is
 * real and is reported rather than smoothed over.
 */

/**
 * 1.1.0 added the `CALIBRATION` shape and `CalibrationRequest`. Additive:
 * `DiscoveryOutcome`'s own shape is unchanged, `shape` simply carries a third
 * real value now.
 *
 * 1.2.0 added `DiscoveryRan.generated`/`noGenerationReason`. Additive in the
 * strict sense that matters here: `run` is byte-for-byte what 1.1.0 returned
 * for the same request — the same first inquiry, projected by the same
 * adapter — so a 1.1.0 reader is not merely compatible, it sees an unchanged
 * finding. What it never sees is the second investigation.
 *
 * 1.3.0 routed MECHANISM's generation through here too, which turned
 * `GeneratedInvestigation` from one shape into a discriminated union on `kind`.
 * `run` is still byte-for-byte the direct strategy call for every shape, so the
 * FINDING a 1.2.0 reader sees is unchanged; a 1.2.0 reader that reached into
 * `generated` without checking `kind` is the one break, and it is a compile-time
 * one rather than a silent change of meaning — which is why the discriminant
 * exists rather than optional fields.
 */
export const DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION = '1.3.0';

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

/**
 * GENERATION AT THE FRONT DOOR — P0. What Genesis did after the declared space
 * ran out, reported as a second run rather than smuggled into the first.
 *
 * ## Why this is a second `StrategyRun` and not more rounds of the first
 *
 * The module doc below used to say generation "is a separate change, on top of
 * this one" — this is that change. The contract decision it deferred is taken
 * here in the only way that keeps both facts intact: `run` stays EXACTLY what a
 * direct strategy call produces, so the equivalence test that guards this file
 * still holds and every existing consumer sees precisely what it saw before,
 * and the continuation is an ADDITIONAL, separately-labelled run beside it.
 *
 * Merging the two would have destroyed the one property that makes a derived
 * hypothesis worth anything: that it was judged on evidence it did not author.
 * A single flattened run of "9 rounds" cannot express "rounds 1-5 refuted every
 * declared value, then rounds 6-9 tested a value derived from round 4, at a
 * setting round 4 never used". Two runs can, and do.
 *
 * ## When it is null, and why that is not a failure
 *
 * Null is the NORMAL case, and `noGenerationReason` always says which of
 * `parameterAlternative.ts`'s refusals applied. A run where a declared
 * hypothesis is still standing generates nothing because generation is for an
 * EXHAUSTED space — inventing a value while a declared one still fits would be
 * the engine preferring novelty to evidence.
 *
 * ## What it deliberately still does not do
 *
 * It does not write to memory. This orchestrator reads memory and owns no
 * store (see `PriorInvestigationDecision`), and that boundary is unchanged:
 * `runInquiryWithGenerationAndRemember` is the storage-wired composition, the
 * same split `runInquiry`/`runInquiryAndRemember` already established.
 */
/**
 * A value nobody declared, derived from the numbers that refuted everyone who
 * did, and then tested.
 */
export interface ParameterGeneration {
  readonly kind: 'DERIVED_PARAMETER_VALUE';
  /** The value nobody declared, with the bracket and the round that produced it. */
  readonly derived: DerivedParameterHypothesis;
  /** The follow-up investigation, in the same shared shape as any other run. */
  readonly run: StrategyRun;
  /**
   * The input the follow-up actually executed. Carried because `StrategyRun` is
   * a reporting contract and does not include the system under study, so a
   * caller that wants to PERSIST this second investigation — or re-execute it —
   * would otherwise have to reconstruct an input Genesis built itself.
   */
  readonly input: InquiryLoopInput;
  /** Did the derived value survive evidence it did not author? */
  readonly survived: boolean;
  /**
   * What that survival actually earned. Carried BESIDE `survived` and never
   * instead of it, because the boolean alone overclaims: two different true
   * temperatures leave the same derived value standing (see
   * `derivedValueStanding`). A consumer that reports the boolean without this
   * is reporting a point value the run never established.
   */
  readonly standing: DerivedValueAssessment;
}

/**
 * A mechanism nobody declared — two declared levers applied together — and the
 * real forked arm that measured whether they compose.
 */
export interface MechanismGeneration {
  readonly kind: 'COMPOSED_MECHANISM';
  readonly derived: DerivedJointMechanism;
  /** The joint arm, in the same shared shape as any other run. */
  readonly run: StrategyRun;
  /** The full interaction classification, with every number the verdict rests on. */
  readonly assessment: JointInterventionAssessment;
  /**
   * Whether doing both beats doing the better one alone — a SEPARATE question
   * from additivity, and one a caller needs: sub-additive does not mean not
   * worth doing.
   */
  readonly betterThanBestSingle: boolean;
}

/**
 * The two generations are a discriminated union rather than one shape, for the
 * reason `StrategyRun` itself gives about belief representations: they are
 * genuinely different findings and each carries something the other does not.
 * A derived VALUE has a bracket, an interval and a standing; a composed
 * MECHANISM has an interaction classification and a comparison against its own
 * parents. Flattening them would mean dropping one of the two.
 */
export type GeneratedInvestigation = ParameterGeneration | MechanismGeneration;

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
  /**
   * The investigation Genesis started BY ITSELF after `run` exhausted its
   * declared space. Null whenever nothing was generated, which is the normal
   * case — `noGenerationReason` then says why.
   *
   * Always null for MECHANISM and CALIBRATION today, for two DIFFERENT reasons
   * that must not be collapsed. CALIBRATION has no generation primitive at all.
   * MECHANISM does — `mechanismGeneration.ts` composes two declared levers into
   * one nobody declared and really runs it — but it returns its own result
   * shape rather than a second `StrategyRun`, so routing it through here is a
   * contract decision still to be taken. Saying "MECHANISM has no generation
   * path" would now be false.
   */
  readonly generated: GeneratedInvestigation | null;
  /** Why no continuation was started. Null exactly when `generated` is non-null. */
  readonly noGenerationReason: string | null;
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
  generated: GeneratedInvestigation | null = null,
  noGenerationReason: string | null = 'This front door does not route this question shape to a generation path yet. PARAMETER derives a value nobody declared (parameterAlternative.ts) and runs it here; MECHANISM can compose a lever nobody declared (mechanismGeneration.ts) but is not routed through this function yet, so a run through here reports none rather than implying none exists.',
): DiscoveryRan {
  return {
    status: 'RAN',
    contractVersion: DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION,
    shape,
    admission,
    run,
    priorInvestigation,
    generated,
    noGenerationReason,
  };
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

    // GENERATION IS PART OF ANSWERING NOW, not a separate call a caller has to
    // know to make. `runInquiryWithGeneration` runs the SAME first inquiry
    // `parameterStrategy.run` would have run — `runAutonomousInquiryWithRuns`
    // on the same input — so `run` below is identical to a direct strategy
    // call, and the continuation only exists when the first run exhausted its
    // declared space. Nothing extra executes in the ordinary case.
    const generation = runInquiryWithGeneration(executedInput);
    const generated: GeneratedInvestigation | null =
      generation.generated === null
        ? null
        : {
            kind: 'DERIVED_PARAMETER_VALUE',
            derived: generation.generated.derived,
            run: toParameterRun(generation.generated.followUpResult, generation.generated.followUpInput),
            input: generation.generated.followUpInput,
            survived: generation.generated.survived,
            standing: derivedValueStanding(generation.generated.derived, generation.generated.followUpResult),
          };

    return ran(
      'PARAMETER',
      admission,
      toParameterRun(generation.first, executedInput),
      priorInvestigation,
      generated,
      generation.noGenerationReason,
    );
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

  // GENERATION IS PART OF ANSWERING HERE TOO, and by the same rule as PARAMETER:
  // `runDiscoveryWithJointGeneration` runs the SAME investigation
  // `mechanismStrategy.run` would have run — `runAutonomousDiscoveryWithEngines`
  // on the same input — so `run` below is identical to a direct strategy call.
  // The continuation only exists when that run ended with rival survivors, which
  // is the state where "which one is right?" is the wrong question and "do they
  // compose?" is the informative one.
  const mechanismGeneration = runDiscoveryWithJointGeneration({ ...plan, hypotheses: hypothesesToRun });
  const composed: GeneratedInvestigation | null =
    mechanismGeneration.generated === null
      ? null
      : {
          kind: 'COMPOSED_MECHANISM',
          derived: mechanismGeneration.generated.derived,
          run: toJointMechanismRun(mechanismGeneration.first, mechanismGeneration.generated),
          assessment: mechanismGeneration.generated.assessment,
          betterThanBestSingle: mechanismGeneration.generated.betterThanBestSingle,
        };

  return ran(
    'MECHANISM',
    admission,
    toMechanismRun(mechanismGeneration.first),
    priorInvestigation,
    composed,
    mechanismGeneration.noGenerationReason,
  );
}
