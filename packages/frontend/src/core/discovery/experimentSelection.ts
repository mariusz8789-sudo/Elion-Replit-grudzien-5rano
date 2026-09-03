/**
 * EXPERIMENT SELECTION — deterministic, domain-agnostic scoring of candidate
 * experiments against the CURRENT epistemic state.
 *
 * This module contains NO physics, chemistry, biology or any other domain
 * logic. It only knows about `EpistemicGraph`/`EpistemicNode` (epistemicEngine.ts,
 * unchanged) and a domain-supplied set of numeric PREDICTIONS per candidate
 * experiment. The domain adapter (e.g. physics/timeDilationReasoningDemo.ts)
 * is responsible for computing those predictions from real formulas; this
 * module only compares them.
 *
 * THE SCORE IS AN EXPLICIT, NAMED PROXY, NOT A PROBABILITY MODEL:
 *
 *   `discriminationScore` is a spread (max - min) of real predicted values —
 *   how much the currently-open explanations disagree about what a
 *   candidate experiment would show. It is NOT expected information gain in
 *   any calibrated, probabilistic sense; Genesis has no such model, and
 *   inventing one would be a fabricated number dressed as science. The name
 *   says exactly what it is.
 *
 * TWO SCORING MODES, BOTH DRIVEN BY THE GRAPH'S CURRENT STATE:
 *
 *   - >= 2 open (UNRESOLVED) target hypotheses: discriminationScore is the
 *     spread among THEIR predictions only — "how much would this experiment
 *     help tell these open alternatives apart?"
 *   - exactly 1 open target hypothesis: there is nothing left to discriminate
 *     it FROM among the still-open set, so the score instead compares it
 *     against the nearest already-SUPPORTED reference prediction (if any) —
 *     "how much would this experiment challenge the sole survivor against
 *     what is already established?" This is what makes the score genuinely
 *     state-dependent: once a hypothesis leaves the open set (by real
 *     computation elsewhere), the candidates that best serve the REMAINING
 *     question can rank differently than they did before.
 *   - 0 open target hypotheses: nothing left to learn from re-running this
 *     experiment; scored 0 and excluded from ranking.
 *
 * COST is an explicit, domain-declared number (default 1, meaning "no basis
 * to differentiate cost" — never a fabricated estimate). VALUE = score / cost.
 */
import type { EpistemicGraph, EpistemicStatus } from './epistemicEngine';

export const EXPERIMENT_SELECTION_VERSION = '1.0.0';

const OPEN_STATUSES: ReadonlySet<EpistemicStatus> = new Set(['UNRESOLVED']);
const SUPPORTED_STATUSES: ReadonlySet<EpistemicStatus> = new Set(['SUPPORTED', 'ESTABLISHED']);

export interface CandidateExperimentSpec {
  experimentId: string;
  /** Every hypothesis node id this candidate could produce evidence about. */
  targetHypothesisIds: readonly string[];
  /** Domain-supplied predicted value per target hypothesis id — real numbers this candidate would actually test, never fabricated. `null` for a hypothesis that makes no numeric prediction here. */
  predictions: Readonly<Record<string, number | null>>;
  /** Explicit, declared cost (defaults to 1 — "no basis to differentiate"). Must be > 0. */
  cost: number;
  costReasoning: string;
}

export interface ScoredCandidateExperiment {
  experimentId: string;
  targetHypothesisIds: readonly string[];
  openHypothesisIds: readonly string[];
  discriminationScore: number;
  scoreBasis: 'SPREAD_AMONG_OPEN' | 'DEVIATION_FROM_SUPPORTED_REFERENCE' | 'NO_OPEN_TARGETS' | 'INSUFFICIENT_PREDICTIONS';
  cost: number;
  value: number;
  rationale: string;
}

export type ExperimentSelectionTermination = 'SELECTED' | 'NO_CANDIDATES' | 'NO_OPEN_HYPOTHESES' | 'NO_DISCRIMINATING_CANDIDATE';

export interface ExperimentSelectionResult {
  contractVersion: string;
  candidates: readonly ScoredCandidateExperiment[];
  ranked: readonly ScoredCandidateExperiment[];
  selected: ScoredCandidateExperiment | null;
  runnerUp: ScoredCandidateExperiment | null;
  selectionExplanation: string;
  termination: ExperimentSelectionTermination;
}

function scoreCandidate(spec: CandidateExperimentSpec, graph: EpistemicGraph): ScoredCandidateExperiment {
  const nodesById = new Map(graph.nodes.map((n) => [n.nodeId, n]));
  for (const id of spec.targetHypothesisIds) {
    if (!nodesById.has(id)) throw new Error(`Candidate "${spec.experimentId}" targets unknown node "${id}".`);
  }
  if (spec.cost <= 0) throw new Error(`Candidate "${spec.experimentId}" declares a non-positive cost (${spec.cost}) — cost must be a real positive number.`);

  const openHypothesisIds = spec.targetHypothesisIds.filter((id) => OPEN_STATUSES.has(nodesById.get(id)!.status));

  if (openHypothesisIds.length === 0) {
    return { experimentId: spec.experimentId, targetHypothesisIds: spec.targetHypothesisIds, openHypothesisIds, discriminationScore: 0, scoreBasis: 'NO_OPEN_TARGETS', cost: spec.cost, value: 0, rationale: 'Every target hypothesis is already resolved — re-running this experiment would teach Genesis nothing new.' };
  }

  if (openHypothesisIds.length >= 2) {
    const values = openHypothesisIds.map((id) => spec.predictions[id]).filter((v): v is number => v !== null && v !== undefined);
    if (values.length < 2) {
      return { experimentId: spec.experimentId, targetHypothesisIds: spec.targetHypothesisIds, openHypothesisIds, discriminationScore: 0, scoreBasis: 'INSUFFICIENT_PREDICTIONS', cost: spec.cost, value: 0, rationale: `${openHypothesisIds.length} open hypotheses are targeted, but fewer than 2 declare a numeric prediction — no spread can be computed.` };
    }
    const spread = Math.max(...values) - Math.min(...values);
    return {
      experimentId: spec.experimentId, targetHypothesisIds: spec.targetHypothesisIds, openHypothesisIds,
      discriminationScore: spread, scoreBasis: 'SPREAD_AMONG_OPEN', cost: spec.cost, value: spread / spec.cost,
      rationale: `Distinguishes ${openHypothesisIds.length} currently open hypothesis(es) (${openHypothesisIds.join(', ')}) with a discrimination score of ${spread.toExponential(4)} (spread of their predicted values).`,
    };
  }

  // Exactly one open target: compare it against the nearest SUPPORTED/ESTABLISHED reference among ALL targets.
  const soleOpenId = openHypothesisIds[0]!;
  const soleOpenPrediction = spec.predictions[soleOpenId];
  const referenceIds = spec.targetHypothesisIds.filter((id) => id !== soleOpenId && SUPPORTED_STATUSES.has(nodesById.get(id)!.status));
  const referencePredictions = referenceIds.map((id) => spec.predictions[id]).filter((v): v is number => v !== null && v !== undefined);

  if (soleOpenPrediction === null || soleOpenPrediction === undefined || referencePredictions.length === 0) {
    return { experimentId: spec.experimentId, targetHypothesisIds: spec.targetHypothesisIds, openHypothesisIds, discriminationScore: 0, scoreBasis: 'INSUFFICIENT_PREDICTIONS', cost: spec.cost, value: 0, rationale: `Only one open hypothesis ("${soleOpenId}") remains, and no already-SUPPORTED reference prediction is available to test it against here.` };
  }
  const deviation = Math.max(...referencePredictions.map((r) => Math.abs(soleOpenPrediction - r)));
  return {
    experimentId: spec.experimentId, targetHypothesisIds: spec.targetHypothesisIds, openHypothesisIds,
    discriminationScore: deviation, scoreBasis: 'DEVIATION_FROM_SUPPORTED_REFERENCE', cost: spec.cost, value: deviation / spec.cost,
    rationale: `Only one open hypothesis ("${soleOpenId}") remains; scored by how far its prediction deviates (${deviation.toExponential(4)}) from the nearest already-established reference (${referenceIds.join(', ')}).`,
  };
}

function rankCandidates(candidates: readonly ScoredCandidateExperiment[]): readonly ScoredCandidateExperiment[] {
  return [...candidates].sort((a, b) => (b.value - a.value) || a.experimentId.localeCompare(b.experimentId));
}

/**
 * Scores and ranks every candidate against the CURRENT graph state, and
 * selects the top-ranked one with value > 0. Never selects a candidate that
 * cannot actually discriminate anything (value === 0) — that is reported as
 * NO_DISCRIMINATING_CANDIDATE, not a fabricated selection.
 */
export function selectNextExperiment(graph: EpistemicGraph, specs: readonly CandidateExperimentSpec[]): ExperimentSelectionResult {
  if (specs.length === 0) {
    return { contractVersion: EXPERIMENT_SELECTION_VERSION, candidates: [], ranked: [], selected: null, runnerUp: null, selectionExplanation: 'No candidate experiments were supplied.', termination: 'NO_CANDIDATES' };
  }

  const candidates = specs.map((spec) => scoreCandidate(spec, graph));
  const ranked = rankCandidates(candidates);
  const totalOpen = new Set(candidates.flatMap((c) => c.openHypothesisIds)).size;

  if (totalOpen === 0) {
    return { contractVersion: EXPERIMENT_SELECTION_VERSION, candidates, ranked, selected: null, runnerUp: null, selectionExplanation: 'Every hypothesis targeted by every candidate is already resolved — there is nothing left to discriminate.', termination: 'NO_OPEN_HYPOTHESES' };
  }

  const top = ranked[0]!;
  if (top.value <= 0) {
    return { contractVersion: EXPERIMENT_SELECTION_VERSION, candidates, ranked, selected: null, runnerUp: null, selectionExplanation: 'Open hypotheses remain, but no candidate experiment can discriminate among them or challenge them against an established reference.', termination: 'NO_DISCRIMINATING_CANDIDATE' };
  }
  const runnerUp = ranked[1] ?? null;
  const explanation = runnerUp
    ? `Experiment "${top.experimentId}" was selected over "${runnerUp.experimentId}" because it distinguishes ${top.openHypothesisIds.length} open hypothesis(es) with a discrimination score of ${top.discriminationScore.toExponential(4)} (value ${top.value.toExponential(4)}), versus ${runnerUp.openHypothesisIds.length} and ${runnerUp.value.toExponential(4)} respectively.`
    : `Experiment "${top.experimentId}" was selected: it is the only candidate able to discriminate among the currently open hypotheses.`;

  return { contractVersion: EXPERIMENT_SELECTION_VERSION, candidates, ranked, selected: top, runnerUp, selectionExplanation: explanation, termination: 'SELECTED' };
}
