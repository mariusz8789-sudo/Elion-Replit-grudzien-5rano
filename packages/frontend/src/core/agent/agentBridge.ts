/**
 * D-085 — AGENT COMPOSER. Calls the four canonical agent modules in one
 * sequence so a campaign step cannot quietly skip one of them.
 *
 * ================== WHY THIS IS A COMPOSER AND NOT A BRIDGE ==============
 *
 * The reviewed proposal was a bridge that installed callbacks INTO
 * `experimentFabric/hypothesisLoop`, on the premise that `core/agent/**` is
 * unreachable from the loop. Checked against HEAD, the premise is inverted:
 *
 *   core/agent/nextAction.ts:94
 *     import { selectNextHypothesisExperiment, type HypothesisLoopResult }
 *       from '../experimentFabric/hypothesisLoop';
 *
 * The dependency already runs agent -> experimentFabric. Making the loop call
 * back into the agent would close the cycle
 * `experimentFabric -> agent -> experimentFabric`, which under ESM resolves to
 * `undefined` at one of the two import sites depending on which module the
 * bundler happens to evaluate first — a defect that appears at runtime, not at
 * compile time. `agentBridge.test.ts` asserts the direction stays one-way.
 *
 * So nothing is injected into the loop. This module sits ABOVE both and calls
 * them in order. `hypothesisLoop` is untouched, and its own anti-HARK and
 * preregistration machinery (`verifyAntiHarkingAnchor`,
 * `verifyPreregistrationIntact`) keeps working exactly as before.
 *
 * ========================== FAIL-CLOSED ENUM ============================
 *   CONTRACT_VERSION_MISMATCH  a module's *_CONTRACT_VERSION moved under us
 *   AGENT_MODULE_MISSING       a required port was not supplied
 */

import {
  NOVELTY_GATE_CONTRACT_VERSION,
  type NoveltyGateInput,
  type NoveltyAssessment,
} from './noveltyGate';
import {
  SELF_FALSIFICATION_BATTERY_CONTRACT_VERSION,
  type SelfFalsificationInput,
} from './selfFalsificationBattery';
import {
  DIFFERENTIATING_EXPERIMENT_GENERATOR_CONTRACT_VERSION,
  type PredictionMatrix,
  type HypothesisPrediction,
  type CandidateObservable,
  type ObservableAssessment,
} from './differentiatingExperimentGenerator';
import { NEXT_ACTION_CONTRACT_VERSION, type NextAction } from './nextAction';
import type { HypothesisLoopResult } from '../experimentFabric/hypothesisLoop';

/**
 * The versions this composer was written against. A module may change; it may
 * not change SILENTLY underneath a caller that believes it knows the shape.
 */
export const EXPECTED_CONTRACT_VERSIONS = Object.freeze({
  noveltyGate: '1.0.0',
  selfFalsificationBattery: '1.0.0',
  differentiatingExperimentGenerator: '1.0.0',
  nextAction: '1.0.0',
});

/** The versions actually exported by the modules right now, read at import time. */
export const ACTUAL_CONTRACT_VERSIONS = Object.freeze({
  noveltyGate: NOVELTY_GATE_CONTRACT_VERSION,
  selfFalsificationBattery: SELF_FALSIFICATION_BATTERY_CONTRACT_VERSION,
  differentiatingExperimentGenerator: DIFFERENTIATING_EXPERIMENT_GENERATOR_CONTRACT_VERSION,
  nextAction: NEXT_ACTION_CONTRACT_VERSION,
});

/**
 * Ports, injected rather than imported as values, so a test can prove the
 * composer calls exactly these and a caller cannot substitute a second
 * implementation of novelty without it being visible at the call site.
 */
export interface AgentComposerPorts {
  readonly assessNovelty: (input: NoveltyGateInput) => NoveltyAssessment;
  readonly runSelfFalsificationBattery: (input: SelfFalsificationInput) => unknown;
  readonly buildPredictionMatrix: (
    hypotheses: readonly HypothesisPrediction[],
    observables: readonly CandidateObservable[],
  ) => PredictionMatrix;
  readonly experimentGaps: (
    matrix: PredictionMatrix,
  ) => readonly { readonly hypothesisId: string; readonly observableId: string }[];
  readonly assessObservable: (matrix: PredictionMatrix, observableId: string, sigma: number) => ObservableAssessment;
  readonly hypothesisLoopNextAction: (state: HypothesisLoopResult) => NextAction;
}

export interface AgentComposer {
  readonly novelty: (input: NoveltyGateInput) => NoveltyAssessment;
  readonly falsify: (input: SelfFalsificationInput) => unknown;
  readonly differentiate: (
    hypotheses: readonly HypothesisPrediction[],
    observables: readonly CandidateObservable[],
  ) => {
    readonly matrix: PredictionMatrix;
    readonly gaps: readonly { readonly hypothesisId: string; readonly observableId: string }[];
  };
  readonly assessObservable: (matrix: PredictionMatrix, observableId: string, sigma: number) => ObservableAssessment;
  readonly next: (state: HypothesisLoopResult) => NextAction;
  readonly contractVersions: ContractVersionMap;
}

const REQUIRED_PORTS: readonly (keyof AgentComposerPorts)[] = [
  'assessNovelty',
  'runSelfFalsificationBattery',
  'buildPredictionMatrix',
  'experimentGaps',
  'assessObservable',
  'hypothesisLoopNextAction',
];

/** Widened on purpose: a mismatch must be *representable* or it cannot be tested. */
export type ContractVersionMap = Readonly<Record<keyof typeof EXPECTED_CONTRACT_VERSIONS, string>>;

export function createAgentComposer(
  ports: AgentComposerPorts,
  actual: ContractVersionMap = ACTUAL_CONTRACT_VERSIONS,
): AgentComposer {
  for (const [name, expected] of Object.entries(EXPECTED_CONTRACT_VERSIONS)) {
    const got = actual[name as keyof typeof EXPECTED_CONTRACT_VERSIONS];
    if (got !== expected) {
      throw new Error(`FAIL_CLOSED[CONTRACT_VERSION_MISMATCH]: ${name} is ${String(got)}, this composer was written against ${expected}`);
    }
  }
  for (const port of REQUIRED_PORTS) {
    if (typeof ports[port] !== 'function') {
      throw new Error(`FAIL_CLOSED[AGENT_MODULE_MISSING]: port "${port}" was not supplied; a missing agent module is never a silently skipped step`);
    }
  }

  return Object.freeze({
    novelty: ports.assessNovelty,
    falsify: ports.runSelfFalsificationBattery,
    differentiate: (hypotheses: readonly HypothesisPrediction[], observables: readonly CandidateObservable[]) => {
      const matrix = ports.buildPredictionMatrix(hypotheses, observables);
      return Object.freeze({ matrix, gaps: ports.experimentGaps(matrix) });
    },
    assessObservable: ports.assessObservable,
    next: ports.hypothesisLoopNextAction,
    contractVersions: actual,
  });
}

export interface CampaignStepInput {
  readonly noveltyInput: NoveltyGateInput;
  readonly falsificationInput: SelfFalsificationInput;
  readonly hypotheses: readonly HypothesisPrediction[];
  readonly observables: readonly CandidateObservable[];
  readonly loopState: HypothesisLoopResult;
}

/**
 * One campaign step through all four canonical modules, in order. Pure
 * composition: the loop is never called back into, so this can never be the
 * thing that closes an import cycle.
 */
export function composeCampaignStep(composer: AgentComposer, input: CampaignStepInput) {
  const novelty = composer.novelty(input.noveltyInput);
  const falsification = composer.falsify(input.falsificationInput);
  const differentiation = composer.differentiate(input.hypotheses, input.observables);
  const next = composer.next(input.loopState);
  return Object.freeze({ novelty, falsification, differentiation, next });
}
