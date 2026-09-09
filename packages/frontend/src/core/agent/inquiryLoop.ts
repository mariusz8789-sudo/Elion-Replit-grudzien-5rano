import { canonicalJson, fnv1a } from '../events/hash';
import {
  checkDiscriminability,
  createHypothesis,
  evidenceMagnitudeWithinTolerance,
  rankHypotheses,
  updateConfidence,
  type Hypothesis,
} from '../experimentFabric/beliefRevision';
import { runExperiment } from '../experimentFabric/executor';
import { evaluateTwoArmRelation } from '../experimentFabric/falsificationRelation';
import { getRouterModel } from '../experimentFabric/router';
import type { FalsificationCriterion, HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import { buildStructuredRequestFromModel } from '../experimentFabric/structuredRequestBuilder';
import type { ExperimentRun } from '../experimentFabric/types';

/**
 * AUTONOMOUS PARAMETER INQUIRY — the experiment Genesis runs next is chosen
 * BECAUSE of what the previous experiment showed.
 *
 * The world-model loop (`discoveryLoop.ts`) tests declared MECHANISMS one at a
 * time on a `TemporalEngine` world. This is its sibling on the other real
 * substrate Genesis already has: the Experiment Fabric's router and executor,
 * where chemistry, biology and physics models actually run. It is not a second
 * copy of that loop — different substrate, different question shape — and it
 * re-implements none of the machinery either of them depends on. Belief
 * revision, discriminability, falsification relations and execution are all
 * called, never rebuilt:
 *
 *   `beliefRevision.ts`  — `createHypothesis`, `updateConfidence`,
 *                          `rankHypotheses`, `checkDiscriminability`,
 *                          `evidenceMagnitudeWithinTolerance`
 *   `falsificationRelation.ts` — `evaluateTwoArmRelation`, the one place a
 *                          criterion is decided against two numbers
 *   `router.ts` / `executor.ts` — the real, existing models and the real run
 *
 * ## The question shape
 *
 * A SYSTEM UNDER STUDY has parameters the agent does not know — the way a real
 * sample has an activation energy nobody has measured yet. Genesis holds
 * several COMPETING quantitative hypotheses about those values, and can probe
 * the system by running the real solver at a probe setting of its choice.
 *
 * The hidden values are facts of THIS system, supplied by whoever set the
 * inquiry up. They are never read by hypothesis selection, ranking or belief
 * revision — only by the execution that stands in for taking a measurement.
 * That boundary is enforced by the compiler rather than promised in a comment:
 * everything downstream of a measurement takes `ObservableSystem`, which is
 * `SystemUnderStudy` with `hiddenParameters` removed, so selection cannot read
 * the answer even by accident.
 *
 * ## Why the next experiment genuinely depends on the last observation
 *
 * Each round: predict what every surviving hypothesis expects at the probe
 * setting (by RUNNING THE SAME REAL SOLVER with that hypothesis's value — a
 * prediction is a real model run, not a formula transcribed here), measure
 * the system, judge each prediction, revise every belief.
 *
 * Then choose the next probe by asking which setting would SEPARATE the two
 * strongest surviving hypotheses (`checkDiscriminability`). Both inputs to
 * that choice — which hypotheses are still active, and which two rank highest
 * — are written by the observation just made. A different observation
 * falsifies a different hypothesis, leaves a different pair in contention,
 * and therefore selects a different probe. That is the whole claim, and
 * `inquiryLoop.test.ts` proves it by changing only the observation.
 *
 * ## What this never does
 *
 * It does not decide what is true about chemistry, biology or physics. It
 * decides which of the caller's declared hypotheses survives contact with a
 * declared model, and says plainly when none of them does. Every verdict uses
 * the existing `HypothesisAssessment` vocabulary, and a hypothesis that was
 * never tested is reported as untested rather than as unlikely.
 */

export const INQUIRY_LOOP_CONTRACT_VERSION = '1.0.0';

/**
 * The system Genesis probes. `hiddenParameters` are properties of this
 * particular system — an unmeasured sample — not claims about the domain, and
 * the agent's reasoning never reads them (see `ObservableSystem`).
 */
export interface SystemUnderStudy {
  readonly systemId: string;
  readonly label: string;
  /** A real router model id: the solver every experiment and every prediction runs through. */
  readonly modelId: string;
  /**
   * The parameters whose values the agent is trying to determine, and this
   * system's real values for them. Plural, not singular, because the
   * scientifically interesting case is DEGENERACY: in real kinetics a higher
   * activation energy compensated by a larger pre-exponential factor gives an
   * identical rate at one temperature and a very different one at another.
   * A single-unknown inquiry is trivially settled by the first measurement;
   * the compensated case is what makes choosing the right next experiment a
   * real problem, and it is why chemists measure rates at several
   * temperatures rather than one.
   *
   * Read ONLY to execute a measurement, never by selection or belief revision.
   */
  readonly hiddenParameters: Readonly<Record<string, number>>;
  /** The parameter the agent varies to probe the system. */
  readonly probeParameterId: string;
  /** Probe settings that are physically meaningful for this system, in the order to consider them. */
  readonly candidateProbeValues: readonly number[];
  /** Everything else held fixed, so probe and unknown are the only things that move. */
  readonly fixedParameters: Readonly<Record<string, number>>;
  /** The solver output the agent reads. */
  readonly observedMetric: string;
  /**
   * Fractional band a prediction must land within to count as agreeing with
   * the measurement. Declared per system because what counts as agreement is
   * a property of the measurement, not of this module.
   */
  readonly agreementTolerance: number;
}

/**
 * The system as the agent is allowed to see it: everything about the setup
 * except the answer. `runAt`, `selectNextProbe` and every judgement helper take
 * this rather than `SystemUnderStudy`, so no reasoning path can reach
 * `hiddenParameters` — the one call that needs them (taking a measurement)
 * passes them in explicitly, in `runAutonomousInquiry`, where it is visible.
 */
export type ObservableSystem = Omit<SystemUnderStudy, 'hiddenParameters'>;

/** One competing quantitative claim about the unknown parameters. */
export interface ParameterHypothesis {
  readonly hypothesisId: string;
  readonly statement: string;
  /** The full assignment this hypothesis claims for the system's unknown parameters. */
  readonly claimedValues: Readonly<Record<string, number>>;
  /** Prior confidence, declared by the caller — this module invents no default. */
  readonly priorConfidence: number;
}

export interface HypothesisOutcome {
  readonly hypothesisId: string;
  readonly predicted: number | null;
  readonly assessment: HypothesisAssessment;
  /** |observed - predicted| / |predicted|, or null when no prediction could be made. */
  readonly relativeError: number | null;
  readonly evidenceMagnitude: number;
  readonly confidenceBefore: number;
  readonly confidenceAfter: number;
  readonly reason: string;
}

export interface BeliefSnapshot {
  readonly hypothesisId: string;
  readonly confidence: number;
  readonly status: Hypothesis['status'];
}

export type ProbeSelectionRule =
  /** The caller's declared opening probe: nothing has been observed yet to choose from. */
  | 'OPENING_PROBE_DECLARED'
  /** A setting at which the two strongest surviving hypotheses predict measurably different results. */
  | 'DISCRIMINATES_TOP_TWO'
  /**
   * No untried setting separates the two strongest survivors, but one separates
   * some OTHER pair still in contention — so the inquiry runs it and rules one
   * of them out instead of stopping with the whole field intact.
   *
   * A deliberately weaker claim than `DISCRIMINATES_TOP_TWO`, and named
   * separately for that reason: this measurement narrows the field without
   * settling the strongest disagreement. Reporting it under the top-two rule
   * would overstate what the experiment decides.
   */
  | 'DISCRIMINATES_OTHER_PAIR'
  /** No untried setting separates ANY pair still in contention; the inquiry stops rather than running an uninformative experiment. */
  | 'NO_DISCRIMINATING_PROBE'
  /** Fewer than two hypotheses are still in contention, so there is nothing left to separate. */
  | 'NO_CONTENDERS_LEFT'
  /**
   * The measurement itself did not come back, so no probe is proposed.
   *
   * This exists because the alternative was actively wrong. When a measurement
   * failed, the loop used to break while `selection` still held the selection
   * that had CHOSEN the failed probe — so the run's `nextExperiment` came out
   * as a `READY_TO_RUN` instruction to run the exact measurement that had just
   * failed, and `openQuestions` said nothing about the failure at all. Measured
   * on the real HP-lattice solver by probing `steps=999999`, outside the
   * runner's validated [1, 50000] range: the run stopped with zero rounds and
   * proposed "Measure acceptanceRate at steps=999999" as ready to run. A
   * consumer routing on that status would retry the same failure forever.
   *
   * A failed measurement is not a proposal, so this carries `probeValue: null`
   * and the adapter reports it as RESOLVED-with-no-request, exactly as the
   * other two refusals already do.
   */
  | 'MEASUREMENT_FAILED';

export interface ProbeSelection {
  readonly probeValue: number | null;
  readonly rule: ProbeSelectionRule;
  readonly why: string;
  /** The hypotheses this choice was made to separate — empty for the opening probe. */
  readonly betweenHypothesisIds: readonly string[];
}

export interface InquiryRound {
  readonly round: number;
  readonly probeValue: number;
  /** Why THIS probe — for round 2 onward, an answer written by the previous observation. */
  readonly selection: ProbeSelection;
  readonly observed: number | null;
  readonly outcomes: readonly HypothesisOutcome[];
  readonly beliefsBefore: readonly BeliefSnapshot[];
  readonly beliefsAfter: readonly BeliefSnapshot[];
  /** Real provenance of the measurement run. */
  readonly runId: string;
  readonly runFingerprint: string;
  readonly engine: string | null;
  readonly modelId: string;
  readonly resultStatus: string;
  /** The selection made for the NEXT round, from this round's observation. */
  readonly nextSelection: ProbeSelection;
}

export type InquiryStopReason =
  | 'NO_CONTENDERS_LEFT'
  | 'NO_DISCRIMINATING_PROBE'
  | 'ROUND_BUDGET_EXHAUSTED'
  | 'MEASUREMENT_FAILED';

export interface InquiryLoopInput {
  readonly question: string;
  readonly system: SystemUnderStudy;
  readonly hypotheses: readonly ParameterHypothesis[];
  /** The opening probe. Declared, because nothing has been observed yet to choose one from. */
  readonly openingProbeValue: number;
  readonly maxRounds: number;
}

export interface InquiryLoopResult {
  readonly contractVersion: string;
  readonly question: string;
  readonly systemId: string;
  readonly modelId: string;
  readonly domainId: string;
  readonly rounds: readonly InquiryRound[];
  readonly finalBeliefs: readonly BeliefSnapshot[];
  readonly stopReason: InquiryStopReason;
  /** Still standing after every measurement: neither falsified nor untested. */
  readonly survivingHypothesisIds: readonly string[];
  readonly falsifiedHypothesisIds: readonly string[];
  readonly untestedHypothesisIds: readonly string[];
  /** What the inquiry could not settle, named rather than implied. */
  readonly openQuestions: readonly string[];
  /** The experiment the inquiry proposes next, from the last observation. */
  readonly nextExperiment: ProbeSelection;
  readonly limitations: readonly string[];
}

// ---------------------------------------------------------------------------
// Execution.
// ---------------------------------------------------------------------------

/**
 * One real solver run. Every measurement AND every prediction goes through
 * here, so a hypothesis's prediction is produced by the same model under the
 * same code path as the measurement it is judged against — not by arithmetic
 * duplicated in this file.
 */
function runAt(
  system: ObservableSystem,
  unknownValues: Readonly<Record<string, number>>,
  probeValue: number,
  purpose: string,
): ExperimentRun | null {
  const model = getRouterModel(system.modelId);
  if (model === undefined) return null;
  const described = Object.entries(unknownValues).map(([key, value]) => `${key}=${value}`).join(', ');
  const request = buildStructuredRequestFromModel(
    model,
    { ...system.fixedParameters, ...unknownValues, [system.probeParameterId]: probeValue },
    { sourceText: `${purpose}: ${system.probeParameterId}=${probeValue}, ${described}.` },
  );
  return runExperiment(request);
}

function readMetric(run: ExperimentRun | null, metric: string): number | null {
  const value = run?.result.outputs?.[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The criterion a hypothesis is judged by AT one probe setting: its own real
 * prediction, with the system's declared agreement band around it.
 *
 * Instantiated per probe rather than fixed once, because the hypothesis's
 * scientific content is a claim about the PARAMETER; what that claim implies
 * for an observation is different at every probe setting, and computing it is
 * exactly what running the model does.
 */
function criterionForPrediction(system: ObservableSystem, predicted: number): FalsificationCriterion {
  return {
    metric: system.observedMetric,
    relation: 'equal-within-tolerance',
    expectedValue: predicted,
    tolerance: Math.abs(predicted) * system.agreementTolerance,
    rationale: `This hypothesis's own parameter values, run through ${system.modelId}, predict ${predicted} for ${system.observedMetric}; agreement is declared at ±${system.agreementTolerance * 100}%.`,
  };
}

/**
 * Hypotheses still in contention: everything not yet falsified.
 *
 * Deliberately NOT `beliefRevision.ts`'s `activeHypotheses`, which excludes a
 * SUPPORTED hypothesis on the grounds that it is "a closed question". That is
 * the right answer to ITS question — where one supporting result settles a
 * matter — and the wrong instrument here, because this inquiry exists
 * precisely for the case where it does not: under parameter degeneracy several
 * assignments predict the SAME value at one probe setting, so agreeing with
 * that one measurement closes nothing. Treating support as settlement would
 * end the inquiry at the first round every time, which is exactly what it did
 * before this function existed.
 *
 * Falsification, by contrast, really is final here: a measurement outside the
 * declared band rules that assignment out, and no later probe can restore it.
 */
function inContention(beliefs: ReadonlyMap<string, Hypothesis>): readonly Hypothesis[] {
  return [...beliefs.values()].filter((h) => h.status !== 'FALSIFIED_WITHIN_PROTOCOL');
}

function snapshot(beliefs: ReadonlyMap<string, Hypothesis>): readonly BeliefSnapshot[] {
  return [...beliefs.values()].map((h) => ({ hypothesisId: h.id, confidence: h.confidence, status: h.status }));
}

/**
 * Would a setting at which these two hypotheses make THESE two real predictions
 * separate them? A pure judgement over `checkDiscriminability` — the caller
 * supplies predictions that came from real runs, so this runs no model itself.
 *
 * Asked in BOTH directions, and both must hold. Each hypothesis's agreement
 * band is relative to its OWN prediction, so the bands are asymmetric: a
 * single-direction check would call a probe decisive or not depending on which
 * hypothesis happened to be passed first, which is an artefact of argument
 * order rather than a fact about the experiment. Requiring both is also the
 * scientifically conservative reading: whichever of the two is actually true,
 * this measurement rules the other one out.
 *
 * Null when the pair is not separated — the caller moves on rather than guessing.
 */
function separatesAt(
  system: ObservableSystem,
  a: Hypothesis,
  aPrediction: number,
  b: Hypothesis,
  bPrediction: number,
): { readonly why: string } | null {
  const aRulesOutB = checkDiscriminability(
    { ...a, criterion: criterionForPrediction(system, aPrediction) },
    { ...b, criterion: criterionForPrediction(system, bPrediction) },
    aPrediction,
    aPrediction,
  );
  const bRulesOutA = checkDiscriminability(
    { ...b, criterion: criterionForPrediction(system, bPrediction) },
    { ...a, criterion: criterionForPrediction(system, aPrediction) },
    bPrediction,
    bPrediction,
  );
  if (!aRulesOutB.discriminates || !bRulesOutA.discriminates) return null;
  return { why: aRulesOutB.why };
}

/**
 * Chooses the next probe from the CURRENT belief state.
 *
 * Every input is downstream of the last observation: `inContention` drops
 * whatever that observation falsified, and `rankHypotheses` orders what is left
 * by confidence the observation just moved. The chosen setting is a real
 * `checkDiscriminability` judgement on real predictions from real runs, not a
 * heuristic invented here.
 *
 * ## Information gain: every pair, not only the top two
 *
 * Pairs are searched in rank order, and the TOP TWO come first — so a run that
 * can settle the strongest disagreement still does exactly that, unchanged.
 * Only when no untried setting separates the top two does this widen to the
 * other pairs still in contention.
 *
 * That widening is the whole point, and it is a real one rather than a
 * refinement: before it, an inquiry that could not settle its top two STOPPED,
 * with the entire field still standing — even when an untried setting would
 * have ruled a third hypothesis out. Measured on the real protein-folding
 * fixture: `h:warm` and `h:hot` sit in a saturating region of the Metropolis
 * acceptance rate and genuinely never separate (2.3–10.1% apart at every
 * untried step count, inside the ±15% band), yet at steps=20000 `h:cool`
 * predicts 0.29865 against `h:warm`'s 0.36675 — 18.6% apart, decisively
 * outside it. Ruling `h:cool` out is a real result the old selection threw
 * away.
 *
 * ## What is NOT introduced here
 *
 * No score, no ranking function, no expected-information number. "Information
 * gain" here means only: PREFER AN EXPERIMENT PROVEN TO CHANGE THE BELIEF
 * STATE OVER ONE PROVEN NOT TO. The comparison is the same deterministic
 * band check that already existed, applied to more pairs before giving up, and
 * the order is the confidence order `rankHypotheses` already establishes.
 * Nothing in this codebase justifies weighting one uncertainty above another
 * numerically, and this does not start.
 *
 * Refusing is still a real outcome: when nothing separates ANY pair, this says
 * so instead of running another experiment that could not change anything.
 */
function selectNextProbe(
  system: ObservableSystem,
  beliefs: ReadonlyMap<string, Hypothesis>,
  claimedValuesById: ReadonlyMap<string, Readonly<Record<string, number>>>,
  triedProbes: ReadonlySet<number>,
  predictions: Map<string, number | null>,
): ProbeSelection {
  const contenders = rankHypotheses(inContention(beliefs));
  if (contenders.length < 2) {
    return {
      probeValue: null,
      rule: 'NO_CONTENDERS_LEFT',
      why: contenders.length === 1
        ? `Only "${contenders[0].id}" is still in contention; there is no second hypothesis left for an experiment to separate it from.`
        : 'No hypothesis is still in contention.',
      betweenHypothesisIds: contenders.map((h) => h.id),
    };
  }
  const [first, second] = contenders;

  // One prediction per (hypothesis, setting), however many pairs ask for it and
  // however many rounds re-ask. Purely a cost guard — a prediction is a real
  // model run, the widened search puts the same hypothesis in several pairs,
  // and successive rounds re-scan the same untried settings. Safe on both
  // counts: a prediction depends only on the hypothesis's claimed values and
  // the setting (neither changes as beliefs move), and unlike measurements
  // these runs are never collected — `runAutonomousInquiryWithRuns` gathers
  // only what it actually measured.
  const predictionFor = (h: Hypothesis, probe: number): number | null => {
    const key = `${h.id}@${probe}`;
    const cached = predictions.get(key);
    if (cached !== undefined) return cached;
    const value = readMetric(runAt(system, claimedValuesById.get(h.id)!, probe, `Prediction for ${h.id}`), system.observedMetric);
    predictions.set(key, value);
    return value;
  };

  for (let i = 0; i < contenders.length - 1; i++) {
    for (let j = i + 1; j < contenders.length; j++) {
      const a = contenders[i];
      const b = contenders[j];
      // (0,1) is the top two — checked first, over every untried setting,
      // before any weaker pair is considered.
      const isTopTwo = i === 0 && j === 1;
      for (const probe of system.candidateProbeValues) {
        if (triedProbes.has(probe)) continue;
        const aPrediction = predictionFor(a, probe);
        const bPrediction = predictionFor(b, probe);
        if (aPrediction === null || bPrediction === null) continue;
        const separation = separatesAt(system, a, aPrediction, b, bPrediction);
        if (separation === null) continue;
        return {
          probeValue: probe,
          rule: isTopTwo ? 'DISCRIMINATES_TOP_TWO' : 'DISCRIMINATES_OTHER_PAIR',
          why: isTopTwo
            ? `At ${system.probeParameterId}=${probe} the two strongest surviving hypotheses predict ${aPrediction} ("${a.id}") and ${bPrediction} ("${b.id}") — far enough apart that one measurement decides between them. ${separation.why}`
            : `No untried setting of ${system.probeParameterId} separates the two strongest survivors ("${first.id}" and "${second.id}"), so this measurement narrows the field instead: at ${system.probeParameterId}=${probe} "${a.id}" predicts ${aPrediction} and "${b.id}" predicts ${bPrediction} — far enough apart that it rules one of THEM out. It does not settle the strongest disagreement. ${separation.why}`,
          betweenHypothesisIds: [a.id, b.id],
        };
      }
    }
  }
  return {
    probeValue: null,
    rule: 'NO_DISCRIMINATING_PROBE',
    why: contenders.length === 2
      ? `No untried setting of ${system.probeParameterId} separates "${first.id}" from "${second.id}": at every candidate their predictions agree inside the declared ±${system.agreementTolerance * 100}% band, so no further experiment from this list could decide between them.`
      : `No untried setting of ${system.probeParameterId} separates any pair among the ${contenders.length} hypotheses still in contention (${contenders.map((h) => `"${h.id}"`).join(', ')}): at every candidate, every pair's predictions agree inside the declared ±${system.agreementTolerance * 100}% band, so no further experiment from this list could decide between any of them.`,
    // The top two remain the pair the run could not settle — the honest
    // headline even when more than two are left standing.
    betweenHypothesisIds: [first.id, second.id],
  };
}

/**
 * The inquiry plus the real `ExperimentRun`s its measurements produced.
 *
 * Exposed the same way `runAutonomousDiscoveryWithEngines` exposes its live
 * engines: a caller that needs to record real provenance (Science Memory's
 * `execution` block) gets the actual run object rather than re-executing the
 * measurement and recording a second, different run as if it were the first.
 * The measurements are the ones taken, in order — not the prediction runs,
 * which are the hypotheses' expectations rather than observations of the
 * system.
 */
export interface InquiryExecution {
  readonly result: InquiryLoopResult;
  readonly measurements: readonly ExperimentRun[];
}

/**
 * Runs the inquiry. Deterministic: the same system and hypotheses produce the
 * same probes, the same beliefs and the same proposal.
 */
export function runAutonomousInquiry(input: InquiryLoopInput): InquiryLoopResult {
  return runAutonomousInquiryWithRuns(input).result;
}

export function runAutonomousInquiryWithRuns(input: InquiryLoopInput): InquiryExecution {
  const { system } = input;
  // The answer is unpacked here and nowhere else: `observable` is what every
  // reasoning step below is given, and it structurally cannot carry the values
  // the inquiry is trying to determine.
  const { hiddenParameters, ...observable } = system;
  const model = getRouterModel(system.modelId);
  const claimedValuesById = new Map(input.hypotheses.map((h) => [h.hypothesisId, h.claimedValues]));
  const beliefs = new Map<string, Hypothesis>(
    input.hypotheses.map((h) => [
      h.hypothesisId,
      createHypothesis(
        h.hypothesisId,
        {
          metric: system.observedMetric,
          relation: 'equal-within-tolerance',
          rationale: `${h.statement} (claims ${Object.entries(h.claimedValues).map(([k, v]) => `${k}=${v}`).join(', ')}).`,
        },
        h.priorConfidence,
      ),
    ]),
  );

  const rounds: InquiryRound[] = [];
  const measurements: ExperimentRun[] = [];
  const tried = new Set<number>();
  /** Shared across rounds — see `selectNextProbe`'s `predictionFor` for why that is sound. */
  const predictionCache = new Map<string, number | null>();
  let stopReason: InquiryStopReason = 'ROUND_BUDGET_EXHAUSTED';
  /** The setting whose measurement failed, so the failure can be NAMED rather than left silent. */
  let failedProbeValue: number | null = null;
  let selection: ProbeSelection = {
    probeValue: input.openingProbeValue,
    rule: 'OPENING_PROBE_DECLARED',
    why: `Opening probe declared by the caller at ${system.probeParameterId}=${input.openingProbeValue}: nothing has been measured yet, so there is no observation to choose from.`,
    betweenHypothesisIds: [],
  };

  for (let round = 1; round <= input.maxRounds; round++) {
    if (selection.probeValue === null) {
      stopReason = selection.rule === 'NO_CONTENDERS_LEFT' ? 'NO_CONTENDERS_LEFT' : 'NO_DISCRIMINATING_PROBE';
      break;
    }
    const probeValue = selection.probeValue;
    tried.add(probeValue);
    const beliefsBefore = snapshot(beliefs);

    // --- The measurement: the real solver on the real system --------------
    const measurement = runAt(observable, hiddenParameters, probeValue, `Measurement of ${system.systemId}`);
    const observed = readMetric(measurement, system.observedMetric);
    if (measurement === null || observed === null) {
      stopReason = 'MEASUREMENT_FAILED';
      // The proposal must not survive the failure. Leaving `selection` as it
      // was would report the measurement that just failed as the next one to
      // run — see `ProbeSelectionRule`'s own note on why that was worse than
      // proposing nothing.
      failedProbeValue = probeValue;
      selection = {
        probeValue: null,
        rule: 'MEASUREMENT_FAILED',
        why:
          `The measurement of ${system.systemId} at ${system.probeParameterId}=${probeValue} did not return a ` +
          `usable ${system.observedMetric}, so this round produced no observation and no next probe is proposed. ` +
          'Re-running the same setting would repeat the failure rather than resolve it.',
        betweenHypothesisIds: selection.betweenHypothesisIds,
      };
      break;
    }
    measurements.push(measurement);

    // --- Judge every surviving hypothesis against its OWN real prediction --
    const outcomes: HypothesisOutcome[] = [];
    for (const hypothesis of [...beliefs.values()]) {
      // A falsified assignment stays falsified; everything else is re-tested at every probe.
      if (hypothesis.status === 'FALSIFIED_WITHIN_PROTOCOL') continue;
      const claimed = claimedValuesById.get(hypothesis.id)!;
      const predicted = readMetric(runAt(observable, claimed, probeValue, `Prediction for ${hypothesis.id}`), system.observedMetric);
      if (predicted === null) {
        outcomes.push({
          hypothesisId: hypothesis.id,
          predicted: null,
          assessment: 'INCONCLUSIVE',
          relativeError: null,
          evidenceMagnitude: 0,
          confidenceBefore: hypothesis.confidence,
          confidenceAfter: hypothesis.confidence,
          reason: `${system.modelId} produced no ${system.observedMetric} for this hypothesis's value, so its prediction could not be compared.`,
        });
        continue;
      }
      const criterion = criterionForPrediction(observable, predicted);
      const relation = evaluateTwoArmRelation(criterion, predicted, observed);
      const assessment: HypothesisAssessment = !relation.applicable
        ? 'INCONCLUSIVE'
        : relation.met
          ? 'SUPPORTED_WITHIN_PROTOCOL'
          : 'FALSIFIED_WITHIN_PROTOCOL';
      const magnitude = evidenceMagnitudeWithinTolerance(observed, predicted, criterion.tolerance ?? 0);
      const reason = assessment === 'SUPPORTED_WITHIN_PROTOCOL'
        ? `Predicted ${predicted}, measured ${observed} — inside the declared ±${system.agreementTolerance * 100}% band.`
        : assessment === 'FALSIFIED_WITHIN_PROTOCOL'
          ? `Predicted ${predicted}, measured ${observed} — outside the declared ±${system.agreementTolerance * 100}% band, so this hypothesis's claimed values are not what this system has.`
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

    // --- The next probe, chosen from the belief state this round wrote ----
    const nextSelection = selectNextProbe(observable, beliefs, claimedValuesById, tried, predictionCache);

    rounds.push({
      round,
      probeValue,
      selection,
      observed,
      outcomes,
      beliefsBefore,
      beliefsAfter: snapshot(beliefs),
      runId: measurement.runId,
      runFingerprint: measurement.provenance.runFingerprint,
      engine: model?.engine ?? null,
      modelId: system.modelId,
      resultStatus: measurement.result.status,
      nextSelection,
    });
    selection = nextSelection;
  }

  const all = [...beliefs.values()];
  const falsified = all.filter((h) => h.status === 'FALSIFIED_WITHIN_PROTOCOL');
  const untested = all.filter((h) => h.history.length === 0);
  const surviving = all.filter((h) => h.status !== 'FALSIFIED_WITHIN_PROTOCOL' && h.history.length > 0);

  const result: InquiryLoopResult = {
    contractVersion: INQUIRY_LOOP_CONTRACT_VERSION,
    question: input.question,
    systemId: system.systemId,
    modelId: system.modelId,
    domainId: model?.domainId ?? 'unknown',
    rounds,
    finalBeliefs: snapshot(beliefs),
    stopReason,
    survivingHypothesisIds: surviving.map((h) => h.id),
    falsifiedHypothesisIds: falsified.map((h) => h.id),
    untestedHypothesisIds: untested.map((h) => h.id),
    openQuestions: [
      // A failed measurement is an open question about the APPARATUS, and it
      // comes first: without it a reader sees "never tested" for every
      // hypothesis and no reason why.
      ...(failedProbeValue !== null
        ? [
            `The measurement at ${system.probeParameterId}=${failedProbeValue} returned no usable ` +
              `${system.observedMetric}, so this inquiry took no observation. Whether that setting is outside what ` +
              `${system.modelId} can compute, or the run failed for another reason, is not settled here.`,
          ]
        : []),
      ...(surviving.length > 1
        ? [`${surviving.length} hypotheses are still consistent with every measurement taken: ${surviving.map((h) => h.id).join(', ')}. The inquiry did not separate them.`]
        : []),
      ...(surviving.length === 0 && rounds.length > 0
        ? ['Every declared hypothesis was falsified: the system\'s real value is not among the values anyone proposed.']
        : []),
      ...untested.map((h) => `Never tested: ${h.id}.`),
    ],
    nextExperiment: selection,
    limitations: [
      `Every number here comes from ${system.modelId} (${model?.engine ?? 'unknown engine'}), a model. A hypothesis surviving this inquiry has survived contact with that model, which is not the same as being true of any real substance, organism or apparatus.`,
      `Only the parameter assignments the caller declared were ever in contention; the inquiry cannot find a value nobody proposed.`,
      `Agreement is decided by a declared ±${system.agreementTolerance * 100}% band, not by a measurement's own error model.`,
    ],
  };
  return { result, measurements };
}

/**
 * Content fingerprint of an inquiry result: what was probed, what was measured,
 * what each hypothesis predicted, what it was judged to be, and what the loop
 * proposes next.
 *
 * Deliberately excludes `runId` (a per-process counter, not content) while
 * KEEPING `runFingerprint`, which the executor derives from the request — so
 * two identical inquiries in different processes fingerprint identically, and
 * an inquiry whose numbers moved does not. The same content-vs-identity split
 * `discoveryResultFingerprint` and `crossActionResultFingerprint` already make.
 */
export function inquiryResultFingerprint(result: InquiryLoopResult): string {
  return `inquiry_${fnv1a(canonicalJson({
    contractVersion: result.contractVersion,
    question: result.question,
    systemId: result.systemId,
    modelId: result.modelId,
    domainId: result.domainId,
    stopReason: result.stopReason,
    surviving: result.survivingHypothesisIds,
    falsified: result.falsifiedHypothesisIds,
    untested: result.untestedHypothesisIds,
    nextExperiment: result.nextExperiment,
    finalBeliefs: result.finalBeliefs,
    rounds: result.rounds.map((round) => ({
      round: round.round,
      probeValue: round.probeValue,
      selectionRule: round.selection.rule,
      observed: round.observed,
      runFingerprint: round.runFingerprint,
      engine: round.engine,
      resultStatus: round.resultStatus,
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
