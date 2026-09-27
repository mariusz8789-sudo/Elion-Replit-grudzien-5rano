import {
  applyEpistemicUpdates,
  buildEpistemicEdge,
  buildEpistemicGraph,
  buildEpistemicNode,
  type EpistemicChange,
  type EpistemicGraph,
  type StatusUpdate,
} from '../discovery/epistemicEngine';
import type { ScenarioRun } from '../simulation/scenarioEngine';

/**
 * LIVE EXPERIMENT HYPOTHESIS FRAMING.
 *
 * Reuses `epistemicEngine.ts` completely unchanged — this file only supplies
 * the two competing statements and reads the REAL scenario result to decide
 * which one is SUPPORTED and which is FALSIFIED. Nothing here invents a
 * verdict: `run.summary.firstCriticalDay` already comes straight out of
 * `runScenario()`, which this module does not touch.
 */
export const HYPOTHESIS_FRAMING_VERSION = '1.0.0';

export const CAPACITY_HOLDS_NODE_ID = 'hyp-capacity-holds';
export const CAPACITY_EXCEEDED_NODE_ID = 'hyp-capacity-exceeded';
export const HYPOTHESIS_GRAPH_ID = 'live-lab-hospital-capacity';

/**
 * Builds the two competing hypotheses, both UNRESOLVED, BEFORE the scenario's
 * outcome is consulted — exactly the "Genesis stawia hipotezę" moment the
 * live session narrates before the run plays out.
 */
export function buildInitialCapacityHypothesisGraph(scenarioLabel: string): EpistemicGraph {
  const holds = buildEpistemicNode({
    nodeId: CAPACITY_HOLDS_NODE_ID, kind: 'HYPOTHESIS', domainId: 'EPIDEMIOLOGY',
    statement: `Hospital capacity holds throughout "${scenarioLabel}" — bed/ICU occupancy never reaches CRITICAL.`,
    status: 'UNRESOLVED', statusReason: 'Not yet run.',
    provenance: [`scenario:${scenarioLabel}`],
  });
  const exceeded = buildEpistemicNode({
    nodeId: CAPACITY_EXCEEDED_NODE_ID, kind: 'HYPOTHESIS', domainId: 'EPIDEMIOLOGY',
    statement: `Hospital capacity is exceeded (reaches CRITICAL, or unmet care occurs) during "${scenarioLabel}".`,
    status: 'UNRESOLVED', statusReason: 'Not yet run.',
    provenance: [`scenario:${scenarioLabel}`],
  });
  const edge = buildEpistemicEdge({
    edgeId: 'e-mutually-exclusive', from: CAPACITY_HOLDS_NODE_ID, to: CAPACITY_EXCEEDED_NODE_ID,
    relation: 'CONTRADICTS', rationale: 'Exactly one of these two statements about the same real run can be true.',
  });
  return buildEpistemicGraph(HYPOTHESIS_GRAPH_ID, [holds, exceeded], [edge]);
}

/**
 * Resolves the two hypotheses against the REAL, already-computed
 * `ScenarioRun.summary`. Throws rather than guesses if the run has no
 * summary (e.g. a NOT_MODELED scenario) — there is nothing real to resolve
 * against.
 */
export function resolveCapacityHypotheses(run: ScenarioRun): { updates: readonly StatusUpdate[]; verdict: 'HOLDS' | 'EXCEEDED' } {
  if (run.summary === null) {
    throw new Error(`Cannot resolve hospital-capacity hypotheses for scenario "${run.scenarioId}": run has no summary (status ${run.status}).`);
  }
  const exceeded = run.summary.firstCriticalDay !== null || run.summary.totalUnmetCareDays > 0;
  const provenance = [`resultFingerprint:${run.resultFingerprint ?? 'none'}`];

  if (exceeded) {
    const reason = `Real run reached CRITICAL on day ${run.summary.firstCriticalDay ?? 'n/a'} with ${run.summary.totalUnmetCareDays} day(s) of unmet care (peak bed occupancy ${(run.summary.peakBedOccupancy * 100).toFixed(1)}%).`;
    return {
      verdict: 'EXCEEDED',
      updates: [
        { nodeId: CAPACITY_EXCEEDED_NODE_ID, newStatus: 'SUPPORTED', reason, provenance },
        { nodeId: CAPACITY_HOLDS_NODE_ID, newStatus: 'FALSIFIED', reason, provenance },
      ],
    };
  }
  const reason = `Real run completed all ${run.series.length} day(s) with no CRITICAL status and no unmet care (peak bed occupancy ${(run.summary.peakBedOccupancy * 100).toFixed(1)}%).`;
  return {
    verdict: 'HOLDS',
    updates: [
      { nodeId: CAPACITY_HOLDS_NODE_ID, newStatus: 'SUPPORTED', reason, provenance },
      { nodeId: CAPACITY_EXCEEDED_NODE_ID, newStatus: 'FALSIFIED', reason, provenance },
    ],
  };
}

export function applyCapacityVerdict(graph: EpistemicGraph, run: ScenarioRun): { graph: EpistemicGraph; changes: readonly EpistemicChange[]; verdict: 'HOLDS' | 'EXCEEDED' } {
  const { updates, verdict } = resolveCapacityHypotheses(run);
  const propagation = applyEpistemicUpdates(graph, updates);
  return { graph: propagation.graph, changes: propagation.changes, verdict };
}
