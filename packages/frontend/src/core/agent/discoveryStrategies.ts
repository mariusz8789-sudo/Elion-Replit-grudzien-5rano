import {
  discoveryResultFingerprint,
  runAutonomousDiscoveryWithEngines,
  type DiscoveryLoopInput,
  type DiscoveryLoopResult,
} from './discoveryLoop';
import {
  inquiryResultFingerprint,
  runAutonomousInquiryWithRuns,
  type InquiryLoopInput,
  type InquiryLoopResult,
} from './inquiryLoop';
import {
  runAutonomousWorldCalibration,
  worldCalibrationResultFingerprint,
  type WorldParameterCalibrationInput,
  type WorldParameterCalibrationResult,
} from './worldParameterCalibration';
import { parameterInquiryNextAction, worldCalibrationNextAction } from './nextAction';
import { worldGraphMeasurementOrigin } from '../measurementProvenance';
import { admitParameterInquiry, admitWorldCalibration, admitWorldQuestion } from './discoveryAdmission';
import {
  DISCOVERY_STRATEGY_CONTRACT_VERSION,
  type Admission,
  type DiscoveryStrategy,
  type StrategyRound,
  type StrategyRun,
} from './discoveryStrategy';

/**
 * THE THREE ADAPTERS. Indirection only — no science happens in this file.
 *
 * Each wraps one real loop and reports it in the shared `StrategyRun` shape.
 * None of the three loops imports this module, none is modified, and none
 * knows an orchestrator exists. The test that keeps this honest is the one
 * that asserts `run(...).native` is exactly what calling the loop directly
 * returns — the same equivalence discipline `nextAction.ts` established for
 * its own selectors.
 *
 * Where a loop genuinely does not produce something the contract has a slot
 * for, the adapter leaves it null or derives it ONLY from what the loop already
 * decided. Nothing here re-ranks, re-judges or invents a proposal.
 */

export const MECHANISM_STRATEGY_ID = 'worldgraph-mechanism';
export const PARAMETER_STRATEGY_ID = 'fabric-parameter';
export const CALIBRATION_STRATEGY_ID = 'worldgraph-calibration';

// ---------------------------------------------------------------------------
// MECHANISM — the WorldGraph loop.
// ---------------------------------------------------------------------------

function mechanismRounds(result: DiscoveryLoopResult): readonly StrategyRound[] {
  return result.rounds.map((round) => ({
    round: round.round,
    // The loop tests one declared mechanism per round, at one strength. Both
    // are the loop's own values, not a description composed here.
    what: `${round.hypothesisId} at strength ${round.strength}`,
    // The loop decides this BEFORE the round runs and stores it; carried verbatim.
    why: round.selectionReason,
    observed: round.objectiveObserved,
    // The control arm's own reading, so a reader can judge the observation
    // rather than being handed a bare number.
    reference: round.objectiveBaseline,
    // No prediction: this loop's hypotheses assert a direction against that
    // control, never a value. See the contract's own note.
    verdicts: [{ hypothesisId: round.hypothesisId, assessment: round.assessment.assessment, predicted: null }],
  }));
}

/**
 * Projects a result the MECHANISM loop already produced.
 *
 * Kept separate from `mechanismStrategy.run` on purpose: the memory/evidence
 * integration calls `runAutonomousDiscoveryWithEngines` itself because it needs
 * the live engines, and can project the run it already has instead of executing
 * the world a second time to get the same finding in the shared shape.
 *
 * `untested` is derived rather than read: this loop reports every belief with a
 * status, and UNTESTED is one of them, so filtering for it reads a decision the
 * loop already made instead of inferring one it did not.
 *
 * `nextExperiment` is the LAST round's own `nextAction`. When no round ran there
 * is nothing to carry and it stays null — a proposal this loop never made would
 * be a decision nobody took.
 */
export function toMechanismRun(result: DiscoveryLoopResult): StrategyRun {
  const lastRound = result.rounds[result.rounds.length - 1];
  return {
    contractVersion: DISCOVERY_STRATEGY_CONTRACT_VERSION,
    strategyId: MECHANISM_STRATEGY_ID,
    shape: 'MECHANISM',
    question: result.question,
    domainId: result.domainId,
    rounds: mechanismRounds(result),
    surviving: result.bestSupported.map((belief) => belief.hypothesisId),
    falsified: result.failedHypotheses.map((belief) => belief.hypothesisId),
    untested: result.beliefs.filter((belief) => belief.status === 'UNTESTED').map((belief) => belief.hypothesisId),
    stopReason: result.stopReason,
    nextExperiment: lastRound?.nextAction ?? null,
    openQuestions: result.unresolvedQuestions,
    // Both lists are things this world declared about its own limits; the
    // contract carries them together because a reader needs both to know what
    // the run does not cover.
    limitations: [...result.declaredAssumptions, ...result.notModelledFactors],
    // WorldGraph arms are simulated trajectories by construction — every one is
    // a TemporalEngine advanced through SolverRouter. Derived from that path
    // rather than assumed.
    measurementProvenance: worldGraphMeasurementOrigin(),
    resultFingerprint: discoveryResultFingerprint(result),
    native: result,
  };
}

export const mechanismStrategy: DiscoveryStrategy<DiscoveryLoopInput> = {
  id: MECHANISM_STRATEGY_ID,
  handles: 'MECHANISM',
  admit: (input): Admission => admitWorldQuestion(input.question),
  // The engine-carrying entry point, so a caller that later needs the live
  // branches reaches the same execution this adapter reported on. The engines
  // stop here: `StrategyRun` has to stay serialisable, and `discoveryLoop.ts`
  // deliberately keeps non-serialisable state behind that one escape hatch.
  run: (input): StrategyRun => toMechanismRun(runAutonomousDiscoveryWithEngines(input).result),
};

// ---------------------------------------------------------------------------
// PARAMETER — the Experiment Fabric loop.
// ---------------------------------------------------------------------------

function parameterRounds(result: InquiryLoopResult, probeParameterId: string): readonly StrategyRound[] {
  return result.rounds.map((round) => ({
    round: round.round,
    what: `measure at ${probeParameterId}=${round.probeValue}`,
    // The loop's own justification for choosing this probe, written by the
    // previous observation. Carried verbatim.
    why: round.selection.why,
    observed: round.observed,
    // Null on purpose: this loop's reference is per-hypothesis, and it is
    // carried on each verdict below rather than collapsed to one number.
    reference: null,
    // This loop judges EVERY surviving hypothesis each round, not one.
    verdicts: round.outcomes.map((outcome) => ({
      hypothesisId: outcome.hypothesisId,
      assessment: outcome.assessment,
      // A real solver run at this probe setting, under the same code path as
      // the measurement it is judged against — carried, not recomputed.
      predicted: outcome.predicted,
    })),
  }));
}

/**
 * Projects a result the PARAMETER loop already produced.
 *
 * Takes the input as well because the contract reports what each round DID,
 * and the probe's parameter name lives on the system under study rather than
 * on the round. Nothing else is read from it.
 *
 * `nextExperiment` delegates to the EXISTING `parameterInquiryNextAction`
 * adapter rather than converting `ProbeSelection` here — that conversion
 * already exists, is already tested, and already knows when to refuse to build
 * an executable request. A second converter would be free to disagree with it.
 */
export function toParameterRun(result: InquiryLoopResult, input: InquiryLoopInput): StrategyRun {
  return {
    contractVersion: DISCOVERY_STRATEGY_CONTRACT_VERSION,
    strategyId: PARAMETER_STRATEGY_ID,
    shape: 'PARAMETER',
    question: result.question,
    domainId: result.domainId,
    rounds: parameterRounds(result, input.system.probeParameterId),
    surviving: result.survivingHypothesisIds,
    falsified: result.falsifiedHypothesisIds,
    untested: result.untestedHypothesisIds,
    stopReason: result.stopReason,
    nextExperiment: parameterInquiryNextAction({ result, system: input.system }),
    openQuestions: result.openQuestions,
    limitations: result.limitations,
    // Carried from the loop, which derived it from the real ExperimentRuns it took.
    measurementProvenance: result.measurementProvenance,
    resultFingerprint: inquiryResultFingerprint(result),
    native: result,
  };
}

export const parameterStrategy: DiscoveryStrategy<InquiryLoopInput> = {
  id: PARAMETER_STRATEGY_ID,
  handles: 'PARAMETER',
  admit: (input): Admission => admitParameterInquiry(input.system.modelId),
  // Same reasoning as MECHANISM: the run-carrying entry point, with the
  // `ExperimentRun[]` left behind because the shared shape reports findings,
  // not solver payloads. `native` still carries the loop's whole result.
  run: (input): StrategyRun => toParameterRun(runAutonomousInquiryWithRuns(input).result, input),
};

// ---------------------------------------------------------------------------
// CALIBRATION — the WorldGraph parameter-calibration composition.
// ---------------------------------------------------------------------------

function calibrationRounds(result: WorldParameterCalibrationResult, worldId: string): readonly StrategyRound[] {
  return result.rounds.map((round) => ({
    round: round.round,
    what: `read at tick=${round.probeTick} in ${worldId}`,
    // The composition decides this BEFORE the round runs, from what the
    // previous reading showed — carried verbatim, same as the PARAMETER path.
    why: round.selection.why,
    observed: round.observed,
    // Null on purpose, the identical reason PARAMETER's is null: this
    // composition judges the observation against EACH hypothesis's own
    // independently-built world, not one shared baseline.
    reference: null,
    verdicts: round.outcomes.map((outcome) => ({
      hypothesisId: outcome.hypothesisId,
      assessment: outcome.assessment,
      // A real reading off this hypothesis's own advanced `TemporalEngine`,
      // under the same `reduceObjectiveTrajectory` call the measurement it is
      // judged against used — carried, not recomputed.
      predicted: outcome.predicted,
    })),
  }));
}

/**
 * Projects a result the CALIBRATION composition already produced.
 *
 * Takes the input as well for the same reason `toParameterRun` does: the
 * contract reports what each round DID, and the world id it read from lives
 * on the system under study rather than on the round.
 *
 * `nextExperiment` delegates to `worldCalibrationNextAction` rather than
 * converting `CalibrationProbeSelection` here — same discipline as
 * `toParameterRun`'s use of `parameterInquiryNextAction`: that conversion
 * already exists, is already tested, and a second one here would be free to
 * disagree with it. `NO_DISCRIMINATING_PROBE` and `NO_CONTENDERS_LEFT` both
 * travel through unchanged as `result.stopReason`, exactly as the loop
 * reported them — this adapter neither renames nor reinterprets a stop reason.
 */
export function toCalibrationRun(result: WorldParameterCalibrationResult, input: WorldParameterCalibrationInput): StrategyRun {
  return {
    contractVersion: DISCOVERY_STRATEGY_CONTRACT_VERSION,
    strategyId: CALIBRATION_STRATEGY_ID,
    shape: 'CALIBRATION',
    question: result.question,
    domainId: result.domainId,
    rounds: calibrationRounds(result, result.worldId),
    surviving: result.survivingHypothesisIds,
    falsified: result.falsifiedHypothesisIds,
    untested: result.untestedHypothesisIds,
    stopReason: result.stopReason,
    nextExperiment: worldCalibrationNextAction({ result, system: input.system }),
    openQuestions: result.openQuestions,
    limitations: result.limitations,
    // Same substrate as MECHANISM: independently built worlds, advanced by solvers.
    measurementProvenance: worldGraphMeasurementOrigin(),
    resultFingerprint: worldCalibrationResultFingerprint(result),
    native: result,
  };
}

export const calibrationStrategy: DiscoveryStrategy<WorldParameterCalibrationInput> = {
  id: CALIBRATION_STRATEGY_ID,
  handles: 'CALIBRATION',
  admit: (input): Admission => admitWorldCalibration(input.system.scenarioKind),
  run: (input): StrategyRun => toCalibrationRun(runAutonomousWorldCalibration(input), input),
};
