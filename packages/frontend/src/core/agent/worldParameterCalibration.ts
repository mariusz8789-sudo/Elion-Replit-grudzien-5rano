import { canonicalJson, fnv1a } from '../events/hash';
import {
  checkDiscriminability,
  createHypothesis,
  evidenceMagnitudeWithinTolerance,
  rankHypotheses,
  updateConfidence,
  type Hypothesis,
} from '../experimentFabric/beliefRevision';
import { evaluateTwoArmRelation } from '../experimentFabric/falsificationRelation';
import { AT_HORIZON } from '../experimentFabric/objectiveReducer';
import type { FalsificationCriterion, HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import type { ScenarioKind } from '../lookingGlass/scenarioRequest';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import { reduceObjectiveTrajectory } from '../worldModel/discovery/objectiveTrajectory';
import { TemporalBranchRegistry, TemporalEngine, type TemporalUpdater } from '../worldModel/temporal/temporalEngine';

/**
 * WORLD ↔ INQUIRY CALIBRATION — a PARAMETER question on a WorldGraph world.
 *
 * `TWO_AUTONOMOUS_LOOPS_DECISION.md` §5 named this gap when it was found:
 * "nothing today runs an inquiry ON a WorldGraph... what calibrating a model
 * against field data looks like." This is that composition, checked against
 * a real domain before being built (§11 of that document has the audit).
 *
 * ## Composition, not a third loop
 *
 * Nothing here is new science. `beliefRevision.ts` (`createHypothesis`,
 * `updateConfidence`, `rankHypotheses`, `checkDiscriminability`,
 * `evidenceMagnitudeWithinTolerance`) and `falsificationRelation.ts`
 * (`evaluateTwoArmRelation`) are the SAME functions `inquiryLoop.ts` already
 * uses, imported here unchanged. `objectiveTrajectory.ts`'s
 * `reduceObjectiveTrajectory` — built for the ObjectiveReducer pipeline, and
 * already substrate-general over any `TemporalEngine` — is the read. The only
 * genuinely new code is the WorldGraph-side plumbing `inquiryLoop.ts` cannot
 * provide because it is hard-wired to the Experiment Fabric (`runExperiment`,
 * `getRouterModel`): building N independent candidate worlds and reading each
 * one's own trajectory.
 *
 * ## The question shape, and how it differs from both existing strategies
 *
 * MECHANISM (`discoveryLoop.ts`) forks ONE world at a DECISION TICK and
 * compares two arms — a real intervention against a shared baseline.
 *
 * PARAMETER on the Fabric (`inquiryLoop.ts`) holds the WORLD (a router model)
 * fixed and varies a SETTING to probe it — one call per measurement, no time
 * evolution at all.
 *
 * PARAMETER on WorldGraph is neither: there is no intervention (nothing is
 * changed partway through a run) and no shared baseline to fork from — each
 * candidate hypothesis IS a different foundational assumption about the
 * world's own unmeasured constant, so each gets its OWN world, built from
 * tick zero with that candidate's claimed value. The "probe" is not a solver
 * setting — it is WHICH TICK to read the trajectory at, chosen the same way
 * `inquiryLoop.ts` chooses a probe setting: the first untried tick at which
 * the top two survivors' own predictions disagree.
 *
 * ## Why this needs choosing the tick at all, and not just reading the last one
 *
 * Measured on the real SEIRD epidemic (see the calibration declared for it),
 * candidate infectious periods close to 7 days are BARELY separated at day 2
 * (a 2% spread) and CLEANLY separated by day 30-60 — the familiar
 * degenerate-then-discriminating shape. But this domain adds a real trap the
 * Fabric inquiries did not have: because R0 is held fixed, a SHORTER
 * infectious period means a HIGHER transmission rate (β = R0/infectiousDays),
 * so that epidemic runs hotter and peaks EARLIER. Read too late (day 80-100)
 * and the ranking by infected count REVERSES — the fast, short-lived epidemic
 * has already burnt out while the slow one is still climbing. A naive
 * "always read at the end" strategy would misread this domain; choosing the
 * tick adaptively, from real predictions, is not a refinement here, it is
 * what keeps the answer correct at all.
 *
 * ## Routed through `discoveryOrchestrator.ts` as `CALIBRATION` (§11.4, closed)
 *
 * `TWO_AUTONOMOUS_LOOPS_DECISION.md` §11.4 left orchestrator wiring open,
 * pending a caller that actually needed it through that entry point rather
 * than directly. §12 closes it: `QuestionShape` gained its third value,
 * `CALIBRATION`, exactly as this module's own header anticipated a genuine
 * third loop would need to (`discoveryStrategy.ts` says so explicitly). This
 * file itself did not change to support that — `scenarioKind` on
 * `WorldParameterSystem` is the only new surface, added purely for
 * `discoveryAdmission.ts` to classify a request the same way MECHANISM
 * already does, never read by `runAutonomousWorldCalibration` itself.
 */

export const WORLD_PARAMETER_CALIBRATION_CONTRACT_VERSION = '1.0.0';

/**
 * One real, unmeasured constant of a WorldGraph solver — the world-side
 * counterpart of `SystemUnderStudy`. `hiddenValue` is a fact of THIS world,
 * read only to build the one world calibration is trying to identify; every
 * reasoning step below is handed a candidate's OWN claimed value instead,
 * exactly the boundary `ObservableSystem` draws on the Fabric side, just
 * enforced by construction (nothing here is ever handed `hiddenValue` except
 * the one call that builds the hidden world) rather than by the type system,
 * because a WorldGraph world has no natural "erase this field" projection the
 * way a flat parameter record does.
 */
export interface WorldParameterSystem {
  readonly systemId: string;
  readonly label: string;
  readonly worldId: string;
  readonly domainId: string;
  /**
   * Which `ScenarioKind` this world answers for — the SAME classification
   * `admitWorldQuestion` uses for MECHANISM, read here by
   * `discoveryAdmission.ts`'s `admitWorldCalibration` against the SAME
   * `solverCapabilityFor` registry, so admitting a calibration and admitting a
   * MECHANISM question about the same world cannot disagree. Declared by the
   * domain, never guessed from `domainId`'s free-text label.
   */
  readonly scenarioKind: ScenarioKind;
  /** Name of the unknown constant, for reporting only — never used to read it back out of a built world. */
  readonly parameterId: string;
  /** This world's real, unmeasured value. Passed to `buildWorldAt` exactly once, to build the hidden world a candidate is judged against. */
  readonly hiddenValue: number;
  /**
   * Builds a FRESH, independent world from tick zero with the given value for
   * the unknown constant — never a fork of a shared baseline, because there is
   * no baseline here: each candidate is a different foundational assumption,
   * not an intervention applied to a common start.
   */
  readonly buildWorldAt: (value: number) => { readonly graph: WorldGraph; readonly updater: TemporalUpdater };
  readonly entityId: string;
  /** The metric this solver COMPUTES, read via `objectiveTrajectory.ts`. Never a value it only reads back from `domainState`. */
  readonly observedMetric: string;
  readonly dt: number;
  /** Ticks the agent may choose to read at, in the order to consider them. */
  readonly candidateProbeTicks: readonly number[];
  /** Fractional agreement band, the same role `SystemUnderStudy.agreementTolerance` plays on the Fabric side. */
  readonly agreementTolerance: number;
}

/** One competing claim about the unknown constant's value. */
export interface WorldParameterHypothesis {
  readonly hypothesisId: string;
  readonly statement: string;
  readonly claimedValue: number;
  readonly priorConfidence: number;
}

export interface WorldCalibrationOutcome {
  readonly hypothesisId: string;
  readonly predicted: number | null;
  readonly assessment: HypothesisAssessment;
  readonly relativeError: number | null;
  readonly evidenceMagnitude: number;
  readonly confidenceBefore: number;
  readonly confidenceAfter: number;
  readonly reason: string;
}

export interface WorldCalibrationBeliefSnapshot {
  readonly hypothesisId: string;
  readonly confidence: number;
  readonly status: Hypothesis['status'];
}

export type CalibrationProbeRule =
  | 'OPENING_PROBE_DECLARED'
  | 'DISCRIMINATES_TOP_TWO'
  | 'NO_DISCRIMINATING_PROBE'
  | 'NO_CONTENDERS_LEFT';

export interface CalibrationProbeSelection {
  readonly probeTick: number | null;
  readonly rule: CalibrationProbeRule;
  readonly why: string;
  readonly betweenHypothesisIds: readonly string[];
}

export interface WorldCalibrationRound {
  readonly round: number;
  readonly probeTick: number;
  readonly selection: CalibrationProbeSelection;
  readonly observed: number | null;
  readonly outcomes: readonly WorldCalibrationOutcome[];
  readonly beliefsBefore: readonly WorldCalibrationBeliefSnapshot[];
  readonly beliefsAfter: readonly WorldCalibrationBeliefSnapshot[];
  readonly nextSelection: CalibrationProbeSelection;
}

export type WorldCalibrationStopReason =
  | 'NO_CONTENDERS_LEFT'
  | 'NO_DISCRIMINATING_PROBE'
  | 'ROUND_BUDGET_EXHAUSTED'
  | 'MEASUREMENT_FAILED';

export interface WorldParameterCalibrationInput {
  readonly question: string;
  readonly system: WorldParameterSystem;
  readonly hypotheses: readonly WorldParameterHypothesis[];
  readonly openingProbeTick: number;
  readonly maxRounds: number;
}

export interface WorldParameterCalibrationResult {
  readonly contractVersion: string;
  readonly question: string;
  readonly systemId: string;
  readonly worldId: string;
  readonly domainId: string;
  readonly parameterId: string;
  readonly rounds: readonly WorldCalibrationRound[];
  readonly finalBeliefs: readonly WorldCalibrationBeliefSnapshot[];
  readonly stopReason: WorldCalibrationStopReason;
  readonly survivingHypothesisIds: readonly string[];
  readonly falsifiedHypothesisIds: readonly string[];
  readonly untestedHypothesisIds: readonly string[];
  readonly openQuestions: readonly string[];
  readonly nextExperiment: CalibrationProbeSelection;
  readonly limitations: readonly string[];
}

/** One value, at one tick, off one already-advanced engine. */
function readAt(engine: TemporalEngine, entityId: string, metric: string, tick: number): number | null {
  return reduceObjectiveTrajectory(engine, entityId, metric, AT_HORIZON, 0, tick).value;
}

/** The criterion a hypothesis is judged by at one probe tick: its own real prediction, with the declared agreement band. */
function criterionForPrediction(system: WorldParameterSystem, predicted: number): FalsificationCriterion {
  return {
    metric: system.observedMetric,
    relation: 'equal-within-tolerance',
    expectedValue: predicted,
    tolerance: Math.abs(predicted) * system.agreementTolerance,
    rationale: `This hypothesis's own claimed value for "${system.parameterId}", run through ${system.worldId}, predicts ${predicted} for ${system.observedMetric} at this tick; agreement is declared at ±${system.agreementTolerance * 100}%.`,
  };
}

/** Everything not yet falsified. See `inquiryLoop.ts`'s `inContention` for why this — not `beliefRevision.ts`'s `activeHypotheses` — is the right instrument under degeneracy. */
function inContention(beliefs: ReadonlyMap<string, Hypothesis>): readonly Hypothesis[] {
  return [...beliefs.values()].filter((h) => h.status !== 'FALSIFIED_WITHIN_PROTOCOL');
}

function snapshot(beliefs: ReadonlyMap<string, Hypothesis>): readonly WorldCalibrationBeliefSnapshot[] {
  return [...beliefs.values()].map((h) => ({ hypothesisId: h.id, confidence: h.confidence, status: h.status }));
}

/**
 * Chooses the next probe tick from the current belief state, over the already
 * pre-advanced candidate engines — exactly `inquiryLoop.ts`'s `selectNextProbe`,
 * ported to reading a tick off a trajectory instead of running a solver at a
 * setting. Checked in BOTH directions for the same reason: each agreement band
 * is relative to its own hypothesis's prediction, so a one-direction check
 * would depend on which hypothesis happened to be passed first.
 */
function selectNextProbe(
  system: WorldParameterSystem,
  beliefs: ReadonlyMap<string, Hypothesis>,
  enginesById: ReadonlyMap<string, TemporalEngine>,
  triedTicks: ReadonlySet<number>,
): CalibrationProbeSelection {
  const contenders = rankHypotheses(inContention(beliefs));
  if (contenders.length < 2) {
    return {
      probeTick: null,
      rule: 'NO_CONTENDERS_LEFT',
      why: contenders.length === 1
        ? `Only "${contenders[0].id}" is still in contention; there is no second hypothesis left for a measurement to separate it from.`
        : 'No hypothesis is still in contention.',
      betweenHypothesisIds: contenders.map((h) => h.id),
    };
  }
  const [first, second] = contenders;
  const firstEngine = enginesById.get(first.id)!;
  const secondEngine = enginesById.get(second.id)!;

  for (const tick of system.candidateProbeTicks) {
    if (triedTicks.has(tick)) continue;
    const firstPrediction = readAt(firstEngine, system.entityId, system.observedMetric, tick);
    const secondPrediction = readAt(secondEngine, system.entityId, system.observedMetric, tick);
    if (firstPrediction === null || secondPrediction === null) continue;
    const firstRulesOutSecond = checkDiscriminability(
      { ...first, criterion: criterionForPrediction(system, firstPrediction) },
      { ...second, criterion: criterionForPrediction(system, secondPrediction) },
      firstPrediction,
      firstPrediction,
    );
    const secondRulesOutFirst = checkDiscriminability(
      { ...second, criterion: criterionForPrediction(system, secondPrediction) },
      { ...first, criterion: criterionForPrediction(system, firstPrediction) },
      secondPrediction,
      secondPrediction,
    );
    const check = firstRulesOutSecond.discriminates && secondRulesOutFirst.discriminates
      ? firstRulesOutSecond
      : { discriminates: false, why: `${firstRulesOutSecond.why} ${secondRulesOutFirst.why}` };
    if (check.discriminates) {
      return {
        probeTick: tick,
        rule: 'DISCRIMINATES_TOP_TWO',
        why: `At tick=${tick} the two strongest surviving hypotheses predict ${firstPrediction} ("${first.id}") and ${secondPrediction} ("${second.id}") for ${system.observedMetric} — far enough apart that one reading decides between them. ${check.why}`,
        betweenHypothesisIds: [first.id, second.id],
      };
    }
  }
  return {
    probeTick: null,
    rule: 'NO_DISCRIMINATING_PROBE',
    why: `No untried tick separates "${first.id}" from "${second.id}": at every candidate tick their predictions for ${system.observedMetric} agree inside the declared ±${system.agreementTolerance * 100}% band, so no further reading from this list could decide between them.`,
    betweenHypothesisIds: [first.id, second.id],
  };
}

/**
 * Builds one independent world at the given value and advances it to
 * `maxTick` — the one substrate-specific step `inquiryLoop.ts` cannot provide,
 * since a WorldGraph world evolves over ticks and a Fabric model does not.
 */
function buildAdvancedEngine(system: WorldParameterSystem, value: number, label: string, maxTick: number): TemporalEngine {
  const { graph, updater } = system.buildWorldAt(value);
  const engine = new TemporalEngine(graph, { registry: new TemporalBranchRegistry(), label });
  for (let tick = 0; tick < maxTick; tick++) engine.advance(system.dt, updater);
  return engine;
}

/**
 * Runs the calibration. Deterministic: the same system and hypotheses produce
 * the same probe ticks, the same beliefs and the same proposal.
 *
 * Every candidate engine (one per hypothesis, plus the hidden world) is
 * advanced ONCE, to the furthest declared candidate tick, before any round
 * runs — the same "build the trajectory, then read it at chosen points"
 * discipline `objectiveTrajectory.ts` already assumes of its callers
 * (`discoveryLoop.ts` pre-advances its baseline and arm the same way). A
 * round then costs one `scrubTo` per engine, not a re-simulation.
 *
 * `hiddenValue` is read exactly once, right here, to build the ONE engine
 * every other step is judged against — no reasoning step below is ever handed
 * it. That is a narrower guarantee than `ObservableSystem`'s compiler-enforced
 * one (a WorldGraph world has no flat parameter record to erase a field from),
 * so it is stated here rather than implied: everything from this line down
 * takes a hypothesis's own claimed value, never `system.hiddenValue`.
 */
export function runAutonomousWorldCalibration(input: WorldParameterCalibrationInput): WorldParameterCalibrationResult {
  const { system } = input;
  const maxTick = Math.max(input.openingProbeTick, ...system.candidateProbeTicks);

  const hiddenEngine = buildAdvancedEngine(system, system.hiddenValue, `hidden:${system.systemId}`, maxTick);
  const enginesById = new Map<string, TemporalEngine>(
    input.hypotheses.map((h) => [h.hypothesisId, buildAdvancedEngine(system, h.claimedValue, h.hypothesisId, maxTick)]),
  );

  const beliefs = new Map<string, Hypothesis>(
    input.hypotheses.map((h) => [
      h.hypothesisId,
      createHypothesis(
        h.hypothesisId,
        {
          metric: system.observedMetric,
          relation: 'equal-within-tolerance',
          rationale: `${h.statement} (claims ${system.parameterId}=${h.claimedValue}).`,
        },
        h.priorConfidence,
      ),
    ]),
  );

  const rounds: WorldCalibrationRound[] = [];
  const tried = new Set<number>();
  let stopReason: WorldCalibrationStopReason = 'ROUND_BUDGET_EXHAUSTED';
  let selection: CalibrationProbeSelection = {
    probeTick: input.openingProbeTick,
    rule: 'OPENING_PROBE_DECLARED',
    why: `Opening probe declared by the caller at tick=${input.openingProbeTick}: nothing has been measured yet, so there is no observation to choose from.`,
    betweenHypothesisIds: [],
  };

  for (let round = 1; round <= input.maxRounds; round++) {
    if (selection.probeTick === null) {
      stopReason = selection.rule === 'NO_CONTENDERS_LEFT' ? 'NO_CONTENDERS_LEFT' : 'NO_DISCRIMINATING_PROBE';
      break;
    }
    const probeTick = selection.probeTick;
    tried.add(probeTick);
    const beliefsBefore = snapshot(beliefs);

    // --- The measurement: the real hidden world's own trajectory -----------
    const observed = readAt(hiddenEngine, system.entityId, system.observedMetric, probeTick);
    if (observed === null) {
      stopReason = 'MEASUREMENT_FAILED';
      break;
    }

    // --- Judge every surviving hypothesis against its OWN real trajectory --
    const outcomes: WorldCalibrationOutcome[] = [];
    for (const hypothesis of [...beliefs.values()]) {
      if (hypothesis.status === 'FALSIFIED_WITHIN_PROTOCOL') continue;
      const engine = enginesById.get(hypothesis.id)!;
      const predicted = readAt(engine, system.entityId, system.observedMetric, probeTick);
      if (predicted === null) {
        outcomes.push({
          hypothesisId: hypothesis.id,
          predicted: null,
          assessment: 'INCONCLUSIVE',
          relativeError: null,
          evidenceMagnitude: 0,
          confidenceBefore: hypothesis.confidence,
          confidenceAfter: hypothesis.confidence,
          reason: `${system.worldId} produced no ${system.observedMetric} for this hypothesis's value at tick=${probeTick}, so its prediction could not be compared.`,
        });
        continue;
      }
      const criterion = criterionForPrediction(system, predicted);
      const relation = evaluateTwoArmRelation(criterion, predicted, observed);
      const assessment: HypothesisAssessment = !relation.applicable
        ? 'INCONCLUSIVE'
        : relation.met
          ? 'SUPPORTED_WITHIN_PROTOCOL'
          : 'FALSIFIED_WITHIN_PROTOCOL';
      const magnitude = evidenceMagnitudeWithinTolerance(observed, predicted, criterion.tolerance ?? 0);
      const reason = assessment === 'SUPPORTED_WITHIN_PROTOCOL'
        ? `Predicted ${predicted}, measured ${observed} at tick=${probeTick} — inside the declared ±${system.agreementTolerance * 100}% band.`
        : assessment === 'FALSIFIED_WITHIN_PROTOCOL'
          ? `Predicted ${predicted}, measured ${observed} at tick=${probeTick} — outside the declared ±${system.agreementTolerance * 100}% band, so this hypothesis's claimed value for "${system.parameterId}" is not what this world has.`
          : relation.explanation;
      const updated = updateConfidence(hypothesis, assessment, magnitude, reason, round);
      beliefs.set(hypothesis.id, updated);
      outcomes.push({
        hypothesisId: hypothesis.id,
        predicted,
        assessment,
        relativeError: predicted === 0 ? null : Math.abs(observed - predicted) / Math.abs(predicted),
        evidenceMagnitude: magnitude,
        confidenceBefore: hypothesis.confidence,
        confidenceAfter: updated.confidence,
        reason,
      });
    }

    // --- The next probe tick, chosen from the belief state this round wrote -
    const nextSelection = selectNextProbe(system, beliefs, enginesById, tried);

    rounds.push({
      round,
      probeTick,
      selection,
      observed,
      outcomes,
      beliefsBefore,
      beliefsAfter: snapshot(beliefs),
      nextSelection,
    });
    selection = nextSelection;
  }

  const all = [...beliefs.values()];
  const falsified = all.filter((h) => h.status === 'FALSIFIED_WITHIN_PROTOCOL');
  const untested = all.filter((h) => h.history.length === 0);
  const surviving = all.filter((h) => h.status !== 'FALSIFIED_WITHIN_PROTOCOL' && h.history.length > 0);

  return {
    contractVersion: WORLD_PARAMETER_CALIBRATION_CONTRACT_VERSION,
    question: input.question,
    systemId: system.systemId,
    worldId: system.worldId,
    domainId: system.domainId,
    parameterId: system.parameterId,
    rounds,
    finalBeliefs: snapshot(beliefs),
    stopReason,
    survivingHypothesisIds: surviving.map((h) => h.id),
    falsifiedHypothesisIds: falsified.map((h) => h.id),
    untestedHypothesisIds: untested.map((h) => h.id),
    openQuestions: [
      ...(surviving.length > 1
        ? [`${surviving.length} hypotheses are still consistent with every measurement taken: ${surviving.map((h) => h.id).join(', ')}. The calibration did not separate them.`]
        : []),
      ...(surviving.length === 0 && rounds.length > 0
        ? ['Every declared hypothesis was falsified: the world\'s real value is not among the values anyone proposed.']
        : []),
      ...untested.map((h) => `Never tested: ${h.id}.`),
    ],
    nextExperiment: selection,
    limitations: [
      `Every number here comes from ${system.worldId} (${system.domainId}), a model. A hypothesis surviving this calibration has survived contact with that model, which is not the same as being true of any real system.`,
      `Only the parameter values the caller declared were ever in contention; the calibration cannot find a value nobody proposed.`,
      `Agreement is decided by a declared ±${system.agreementTolerance * 100}% band, not by a measurement's own error model.`,
      `Each hypothesis was judged from its OWN independently built world, not a shared baseline with one changed field — there is no notion of "side effect on the rest of the world" here the way a MECHANISM comparison has.`,
    ],
  };
}

/**
 * Content fingerprint of a calibration result: what was probed, what was
 * measured, what each hypothesis predicted, what it was judged to be, and
 * what the calibration proposes next.
 *
 * Unlike `discoveryResultFingerprint`/`inquiryResultFingerprint`, no branch id
 * or run id needs excluding here: a `WorldCalibrationRound` carries no
 * `TemporalEngine` branch identity at all (each candidate world is independent
 * and never registered against a shared branch registry), so the result is
 * already pure content.
 */
export function worldCalibrationResultFingerprint(result: WorldParameterCalibrationResult): string {
  return `wcal_${fnv1a(canonicalJson({
    contractVersion: result.contractVersion,
    question: result.question,
    systemId: result.systemId,
    worldId: result.worldId,
    domainId: result.domainId,
    parameterId: result.parameterId,
    stopReason: result.stopReason,
    surviving: result.survivingHypothesisIds,
    falsified: result.falsifiedHypothesisIds,
    untested: result.untestedHypothesisIds,
    nextExperiment: result.nextExperiment,
    finalBeliefs: result.finalBeliefs,
    rounds: result.rounds.map((round) => ({
      round: round.round,
      probeTick: round.probeTick,
      selectionRule: round.selection.rule,
      observed: round.observed,
      outcomes: round.outcomes.map((o) => ({
        hypothesisId: o.hypothesisId,
        predicted: o.predicted,
        assessment: o.assessment,
        confidenceAfter: o.confidenceAfter,
      })),
      nextSelection: round.nextSelection,
    })),
  }))}`;
}
