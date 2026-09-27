/**
 * EPISTEMIC REASONING LOOP — turns the (already executable) Epistemic Engine
 * into an active SELECT -> EXECUTE -> UPDATE -> RE-SCORE loop.
 *
 * Still domain-agnostic: this module knows `EpistemicGraph` (epistemicEngine.ts)
 * and `CandidateExperimentSpec`/`selectNextExperiment` (experimentSelection.ts),
 * and nothing about physics, chemistry or any other domain. A domain adapter
 * supplies two callbacks:
 *
 *   - `generateCandidates(graph)`: given the CURRENT graph, return the
 *     candidate experiments still worth considering (Phase C: "the
 *     candidates must depend on the CURRENT epistemic state" — a domain
 *     adapter typically excludes experiments whose EXPERIMENT node is no
 *     longer UNRESOLVED, i.e. already executed).
 *   - `execute(experimentId, graph)`: given the SELECTED experiment id and
 *     the current graph, actually run the real domain computation and
 *     return the real `StatusUpdate`s it produced, plus provenance.
 *
 * This module does not invent evidence, does not decide verdicts, and does
 * not know what "correct" means in any domain — it only sequences real
 * decisions and real computations that already exist elsewhere, and records
 * WHY each one was made (Phase H).
 */
import {
  applyEpistemicUpdates,
  type EpistemicChange,
  type EpistemicGraph,
  type EpistemicNode,
  type StatusUpdate,
} from './epistemicEngine';
import { selectNextExperiment, type CandidateExperimentSpec, type ExperimentSelectionResult } from './experimentSelection';

export const EPISTEMIC_REASONING_LOOP_VERSION = '1.0.0';

export interface ReasoningExecutionResult {
  updates: readonly StatusUpdate[];
  /** Extra provenance describing the real computation performed (e.g. the real measured/derived value), independent of any single node's provenance. */
  provenance: readonly string[];
  narrative: string;
}

export interface ReasoningDomainAdapter {
  generateCandidates(graph: EpistemicGraph): readonly CandidateExperimentSpec[];
  execute(experimentId: string, graph: EpistemicGraph): ReasoningExecutionResult;
}

/** Phase H — a structured, machine-readable explanation of one decision. UI is NOT required to read this; it is a data contract. */
export interface StepExplanation {
  currentQuestion: string;
  whatWeKnow: readonly string[];
  whatWeDontKnow: readonly string[];
  competingHypotheses: readonly { hypothesisId: string; statement: string; status: string }[];
  candidateExperiments: readonly { experimentId: string; discriminationScore: number; value: number }[];
  selectedExperiment: string | null;
  whyThisExperiment: string;
  result: string;
  whatChanged: readonly string[];
  whatRemainsUnknown: readonly string[];
  nextBestExperiment: string | null;
}

export interface ReasoningStepResult {
  stepIndex: number;
  before: EpistemicGraph;
  selection: ExperimentSelectionResult;
  selectedExperimentId: string | null;
  executed: boolean;
  updates: readonly StatusUpdate[];
  changes: readonly EpistemicChange[];
  after: EpistemicGraph;
  explanation: StepExplanation;
}

function describeKnown(nodes: readonly EpistemicNode[]): readonly string[] {
  return nodes.filter((n) => n.status === 'ESTABLISHED' || n.status === 'SUPPORTED').map((n) => `[${n.status}] ${n.statement}`);
}

function describeUnknown(nodes: readonly EpistemicNode[]): readonly string[] {
  return nodes.filter((n) => n.status === 'UNRESOLVED' || n.status === 'UNKNOWN').map((n) => `[${n.status}] ${n.statement}`);
}

function buildExplanation(
  question: string,
  before: EpistemicGraph,
  selection: ExperimentSelectionResult,
  after: EpistemicGraph,
  changes: readonly EpistemicChange[],
): StepExplanation {
  const hypotheses = before.nodes.filter((n) => n.kind === 'HYPOTHESIS');
  const selected = selection.selected;
  return {
    currentQuestion: question,
    whatWeKnow: describeKnown(before.nodes),
    whatWeDontKnow: describeUnknown(before.nodes),
    competingHypotheses: hypotheses.map((h) => ({ hypothesisId: h.nodeId, statement: h.statement, status: h.status })),
    candidateExperiments: selection.candidates.map((c) => ({ experimentId: c.experimentId, discriminationScore: c.discriminationScore, value: c.value })),
    selectedExperiment: selected?.experimentId ?? null,
    whyThisExperiment: selection.selectionExplanation,
    result: changes.length > 0 ? changes.map((c) => `${c.nodeId}: ${c.previousStatus} -> ${c.newStatus} (${c.reason})`).join(' ') : 'No experiment was executed this step.',
    whatChanged: changes.map((c) => `${c.nodeId}: ${c.previousStatus} -> ${c.newStatus}`),
    whatRemainsUnknown: describeUnknown(after.nodes),
    nextBestExperiment: selection.runnerUp?.experimentId ?? null,
  };
}

/**
 * Runs exactly ONE decision: generate candidates from the CURRENT graph,
 * select the best one, execute it (real domain computation), apply the
 * resulting updates, and propagate. If no candidate can be usefully
 * selected, the step still returns (unexecuted) with the selection's
 * termination reason — never a fabricated experiment.
 */
export function runReasoningStep(
  stepIndex: number,
  question: string,
  graph: EpistemicGraph,
  adapter: ReasoningDomainAdapter,
): ReasoningStepResult {
  const specs = adapter.generateCandidates(graph);
  const selection = selectNextExperiment(graph, specs);

  if (selection.selected === null) {
    return {
      stepIndex, before: graph, selection, selectedExperimentId: null, executed: false,
      updates: [], changes: [], after: graph,
      explanation: buildExplanation(question, graph, selection, graph, []),
    };
  }

  const execution = adapter.execute(selection.selected.experimentId, graph);
  const { graph: after, changes } = applyEpistemicUpdates(graph, execution.updates);

  return {
    stepIndex, before: graph, selection, selectedExperimentId: selection.selected.experimentId, executed: true,
    updates: execution.updates, changes, after,
    explanation: buildExplanation(question, graph, selection, after, changes),
  };
}

export type ReasoningTermination = 'RESOLVED' | 'NO_USEFUL_EXPERIMENT' | 'BLOCKED' | 'MAX_ITERATIONS_REACHED';

export interface ReasoningLoopResult {
  contractVersion: string;
  question: string;
  steps: readonly ReasoningStepResult[];
  finalGraph: EpistemicGraph;
  termination: ReasoningTermination;
  terminationReason: string;
}

/**
 * Repeats `runReasoningStep` until an explicit termination condition:
 * RESOLVED (fewer than 2 hypotheses remain open — nothing left to
 * discriminate), NO_USEFUL_EXPERIMENT (the selector found no candidate that
 * can teach Genesis anything), BLOCKED (every remaining open hypothesis is
 * itself BLOCKED), or MAX_ITERATIONS_REACHED (a safety bound — never an
 * infinite loop).
 */
export function runReasoningLoop(
  question: string,
  initialGraph: EpistemicGraph,
  adapter: ReasoningDomainAdapter,
  maxIterations: number,
): ReasoningLoopResult {
  const steps: ReasoningStepResult[] = [];
  let graph = initialGraph;

  for (let i = 0; i < maxIterations; i++) {
    const hypotheses = graph.nodes.filter((n) => n.kind === 'HYPOTHESIS');
    const openHypotheses = hypotheses.filter((n) => n.status === 'UNRESOLVED');

    if (openHypotheses.length === 0) {
      const blockedCount = hypotheses.filter((n) => n.status === 'BLOCKED').length;
      if (blockedCount > 0) {
        return { contractVersion: EPISTEMIC_REASONING_LOOP_VERSION, question, steps, finalGraph: graph, termination: 'BLOCKED', terminationReason: `${blockedCount} of ${hypotheses.length} hypothesis(es) ended up BLOCKED rather than resolved by a real verdict.` };
      }
      return { contractVersion: EPISTEMIC_REASONING_LOOP_VERSION, question, steps, finalGraph: graph, termination: 'RESOLVED', terminationReason: 'No hypothesis remains open (UNRESOLVED) — every one has a real, computed verdict.' };
    }

    const step = runReasoningStep(i, question, graph, adapter);
    steps.push(step);
    graph = step.after;

    if (!step.executed) {
      return { contractVersion: EPISTEMIC_REASONING_LOOP_VERSION, question, steps, finalGraph: graph, termination: 'NO_USEFUL_EXPERIMENT', terminationReason: step.selection.selectionExplanation };
    }
  }

  return { contractVersion: EPISTEMIC_REASONING_LOOP_VERSION, question, steps, finalGraph: graph, termination: 'MAX_ITERATIONS_REACHED', terminationReason: `Reached the ${maxIterations}-iteration safety bound.` };
}
