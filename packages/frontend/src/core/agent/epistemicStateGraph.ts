import { canonicalJson, fnv1a } from '../events/hash';
import { buildMatrixRelationGraph, type MatrixEdgeKind } from './matrixRelations';
import { listExperiments, type SavedExperiment } from '../scienceMemory';
import type { GraphEpistemicStatus } from '../experimentFabric/experimentGraph';

/**
 * EPISTEMIC STATE GRAPH — a canonical, fingerprinted, deterministic snapshot
 * of Science Memory as a whole: one node per persisted `SavedExperiment`,
 * edges reused VERBATIM from `matrixRelations.ts`, and a per-node epistemic
 * status that is DERIVED from real fields already on the record, never
 * declared and never read from `SavedExperiment.epistemicStatus` (that field
 * is a free-text `string` with 13 distinct literals from at least four
 * unrelated vocabularies — see the audit that motivated this module — and is
 * therefore not a source of truth for anything).
 *
 * WHAT THIS IS NOT, AND WHY IT IS A SEPARATE MODULE FROM `experimentGraph.ts`:
 * `experimentGraph.ts::buildExperimentGraph` already has the right node shape
 * (`ExperimentGraphNode`, `GraphEpistemicStatus`, `graphFingerprint`), but it
 * answers a DIFFERENT question over a DIFFERENT substrate: "what happened in
 * THIS ONE live investigation session" over transient `ExperimentRun[]`,
 * wired to `executeNextExperiment` and `ExperimentPilotScreen.tsx`'s
 * actionable next-step proposals. Retargeting that function at
 * `SavedExperiment[]` would either break that live, actionable screen or
 * require inventing a fake "which records belong to this session" grouping
 * Science Memory does not have. This module answers a different, real
 * question instead — "what is the whole persisted research state" — and is
 * additive: it does not touch `buildExperimentGraph`, `executeNextExperiment`,
 * or anything `ExperimentPilotScreen.tsx` depends on.
 *
 * NODE STATUS REUSES `GraphEpistemicStatus` (already 8 real, derived values),
 * not a new enum. Inventing a further, unrelated status vocabulary here would
 * be exactly the duplication this codebase's own guard suite exists to catch
 * — see `scientificIntegrityGuard.test.ts` section 9 & 10.
 *
 * EDGES ARE NOT REBUILT. `buildMatrixRelationGraph` is the one relation
 * engine (guarded by name, `scientificIntegrityGuard.test.ts`); this module
 * calls it and reindexes its `MatrixEdge[]` by node id, adding nothing to the
 * relation logic itself.
 */
export const EPISTEMIC_STATE_GRAPH_CONTRACT_VERSION = '1.0.0';

export interface EpistemicStateNode {
  readonly nodeId: string;
  readonly label: string;
  readonly epistemicStatus: GraphEpistemicStatus;
  /**
   * The exact rule that produced `epistemicStatus` — auditable, never silent.
   * A node whose shape this module does not yet know how to derive a status
   * for reports `UNKNOWN` with a rule that says so, rather than guessing.
   */
  readonly derivationRule: string;
  readonly createdAt: string;
}

export interface EpistemicStateEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: MatrixEdgeKind;
  /** The exact field that proves this edge — copied verbatim from `MatrixEdge.basis`. */
  readonly basis: string;
  readonly directed: boolean;
}

export interface EpistemicStateGraph {
  readonly contractVersion: string;
  readonly nodes: readonly EpistemicStateNode[];
  readonly edges: readonly EpistemicStateEdge[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  /** How many nodes landed at each `GraphEpistemicStatus` — a real count, not asserted. */
  readonly statusDistribution: Readonly<Record<GraphEpistemicStatus, number>>;
  /** `fnv1a(canonicalJson(...))` over the whole graph minus this field — same discipline as `experimentGraph.ts::graphFingerprint`. */
  readonly fingerprint: string;
}

/**
 * DERIVATION RULES, IN PRIORITY ORDER — the first rule whose precondition
 * holds decides the node's status. Every rule reads a REAL field the record
 * already carries; none of them reads `record.epistemicStatus`.
 *
 * 1. `realExperimentVerification` present → OBSERVED. Reaching this shape at
 *    all already required `realRun.provenance.dataProvenance` to be
 *    REAL_EXPERIMENTAL or REFERENCE (`scienceMemory.ts`'s
 *    `EXTERNAL_VERIFICATION_PROVENANCE` gate) — the data behind the node is
 *    real by construction, independent of which way the verdict went.
 * 2. `researchChain.terminalStatus` — BLOCKED -> BLOCKED (the chain never
 *    ran, not weak evidence); INCONCLUSIVE -> VERIFY_REQUIRED; SETTLED/OPEN
 *    -> MODEL_ESTIMATE (a settled or still-open chain over solver-executed
 *    steps — never OBSERVED, since nothing here is a physical measurement).
 * 3. `hypothesisLoop.outcomes[]` / `discoveryLoop.evidenceChain[]` statuses
 *    (the same fields `evidenceImpact.ts::recordedStatuses` already reads):
 *    any BLOCKED -> BLOCKED; else any FALSIFIED/INCONCLUSIVE -> VERIFY_REQUIRED;
 *    else (all SUPPORTED) -> MODEL_ESTIMATE — a real solver ran and produced
 *    a within-protocol verdict, which `experimentGraph.ts::statusFor` already
 *    treats as MODEL_ESTIMATE, never OBSERVED, for the exact same reason.
 * 4. `worldDiscovery` present -> SIMULATION. A WorldGraph domain run; the
 *    conservative, honest default this codebase already uses elsewhere
 *    (`experimentGraph.ts::statusFor`'s own SIMULATION branch) rather than
 *    inspecting per-domain `GroundingLevel`, which this module does not yet do.
 * 5. `execution.dataProvenance` (present on scenario-run records) ->
 *    REAL_EXPERIMENTAL/REFERENCE => OBSERVED, SIMULATED => SIMULATION.
 * 6. Everything else (cyberInvestigation, deciphermentCase,
 *    substitutionInvestigation, mechanismComposition, parameterInquiry,
 *    investigation, biotech, and any record matching none of the above) ->
 *    UNKNOWN. This module does not yet derive a status for these shapes;
 *    UNKNOWN said honestly is correct here, not a placeholder to silence —
 *    the alternative would be guessing, which the derivation rule (1)-(5)
 *    above deliberately never does.
 */
function deriveNodeStatus(record: SavedExperiment): { status: GraphEpistemicStatus; rule: string } {
  if (record.realExperimentVerification !== undefined) {
    return { status: 'OBSERVED', rule: 'realExperimentVerification present (data gated REAL_EXPERIMENTAL/REFERENCE at write time)' };
  }

  if (record.researchChain !== undefined) {
    const terminal = record.researchChain.terminalStatus;
    if (terminal === 'BLOCKED') return { status: 'BLOCKED', rule: 'researchChain.terminalStatus === BLOCKED' };
    if (terminal === 'INCONCLUSIVE') return { status: 'VERIFY_REQUIRED', rule: 'researchChain.terminalStatus === INCONCLUSIVE' };
    return { status: 'MODEL_ESTIMATE', rule: `researchChain.terminalStatus === ${terminal}` };
  }

  const loopStatuses: string[] = [
    ...(record.hypothesisLoop?.outcomes ?? []).map((outcome) => outcome.status),
    ...(record.discoveryLoop?.evidenceChain ?? []).map((link) => link.status),
  ];
  if (loopStatuses.length > 0) {
    if (loopStatuses.includes('BLOCKED')) return { status: 'BLOCKED', rule: 'hypothesisLoop/discoveryLoop status includes BLOCKED' };
    if (loopStatuses.includes('FALSIFIED') || loopStatuses.includes('INCONCLUSIVE')) {
      return { status: 'VERIFY_REQUIRED', rule: 'hypothesisLoop/discoveryLoop status includes FALSIFIED or INCONCLUSIVE' };
    }
    return { status: 'MODEL_ESTIMATE', rule: 'hypothesisLoop/discoveryLoop status all SUPPORTED' };
  }

  if (record.worldDiscovery !== undefined) {
    return { status: 'SIMULATION', rule: 'worldDiscovery present (WorldGraph domain run)' };
  }

  const dataProvenance = record.execution?.dataProvenance;
  if (dataProvenance === 'REAL_EXPERIMENTAL' || dataProvenance === 'REFERENCE') {
    return { status: 'OBSERVED', rule: `execution.dataProvenance === ${dataProvenance}` };
  }
  if (dataProvenance === 'SIMULATED') {
    return { status: 'SIMULATION', rule: 'execution.dataProvenance === SIMULATED' };
  }

  return { status: 'UNKNOWN', rule: 'no derivation rule for this record\'s populated shape yet — reported honestly, not guessed' };
}

/**
 * Builds the whole-Memory epistemic snapshot. `records` defaults to
 * `listExperiments()`, the same default `synthesizeNextQuestion` already
 * uses, so a caller who already has the array (e.g. inside a `subscribe`
 * callback) never pays for a second read.
 */
export function buildEpistemicStateGraph(records?: readonly SavedExperiment[]): EpistemicStateGraph {
  const all = records ?? listExperiments();
  const sorted = [...all].sort((a, b) => a.id.localeCompare(b.id));

  const nodes: EpistemicStateNode[] = sorted.map((record) => {
    const { status, rule } = deriveNodeStatus(record);
    return { nodeId: record.id, label: record.experimentName, epistemicStatus: status, derivationRule: rule, createdAt: record.createdAt };
  });

  const relationGraph = buildMatrixRelationGraph(sorted);
  const edges: EpistemicStateEdge[] = relationGraph.edges.map((edge) => ({
    from: edge.fromId, to: edge.toId, kind: edge.kind, basis: edge.basis, directed: edge.directed,
  }));

  const statusDistribution: Record<GraphEpistemicStatus, number> = {
    QUESTION: 0, HYPOTHESIS: 0, SIMULATION: 0, MODEL_ESTIMATE: 0, OBSERVED: 0, UNKNOWN: 0, BLOCKED: 0, VERIFY_REQUIRED: 0,
  };
  for (const node of nodes) statusDistribution[node.epistemicStatus] += 1;

  const fingerprintBase = {
    contractVersion: EPISTEMIC_STATE_GRAPH_CONTRACT_VERSION,
    nodes: nodes.map((node) => ({ id: node.nodeId, status: node.epistemicStatus })),
    edges: edges.map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind })),
  };

  return {
    contractVersion: EPISTEMIC_STATE_GRAPH_CONTRACT_VERSION,
    nodes, edges,
    nodeCount: nodes.length, edgeCount: edges.length,
    statusDistribution,
    fingerprint: fnv1a(canonicalJson(fingerprintBase)),
  };
}
