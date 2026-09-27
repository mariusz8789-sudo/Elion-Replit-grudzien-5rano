/**
 * GENESIS EPISTEMIC ENGINE — a formal, executable, cross-domain
 * representation of what Genesis knows, does not know, and is uncertain
 * about, plus deterministic inference over the CONSEQUENCES of a scientific
 * state change.
 *
 * THIS IS NOT A NEW STATUS SYSTEM. It reuses `GeneratedHypothesisVerdict`
 * (hypothesisGeneration.ts) as-is for HYPOTHESIS/MODEL/DERIVED nodes, and
 * adds only the two literals that vocabulary has no room for: `ESTABLISHED`
 * (a FACT needs no verdict — it is cited, not tested) and `UNKNOWN` (a node
 * that names a genuine gap, not a hypothesis awaiting a verdict).
 *
 * THIS IS NOT A DUPLICATE OF ANY EXISTING LIFECYCLE. `GeneratedHypothesis`,
 * `ScientificModel`, `ParameterizedModelFamily` all already produce real,
 * computed verdicts — this engine does not recompute or replace that
 * science. What it adds is the missing piece: a NETWORK connecting claims,
 * hypotheses, models, evidence, experiments and unknowns, and a
 * DETERMINISTIC rule for what happens to the network when one node's
 * status changes because of real computation performed elsewhere.
 *
 * WHAT IS EXECUTABLE, AND WHAT IS DELIBERATELY NOT:
 *
 *   `applyEpistemicUpdates` takes REAL, externally-established status
 *   changes (the caller already ran the real computation — a hypothesis
 *   test, a model validation, an experiment) and propagates them through a
 *   small, explicit set of relations this engine can interpret without
 *   guessing, each to a fixed point:
 *
 *   - DEPENDS_ON / BLOCKS: if X depends on Y (or Y blocks X) and Y ends up
 *     FALSIFIED (or already BLOCKED), X becomes BLOCKED.
 *   - FALSIFIES / SUPPORTS: if a node whose status is already "affirmative"
 *     (ESTABLISHED or SUPPORTED — i.e. real, executed evidence, not a mere
 *     assertion) has an outgoing FALSIFIES edge to a target, the target
 *     becomes FALSIFIED; an outgoing SUPPORTS edge makes the target
 *     SUPPORTED. If a target receives BOTH an affirmative FALSIFIES edge
 *     AND an affirmative SUPPORTS edge at once, that is genuinely
 *     conflicting evidence — the target is set to UNRESOLVED (never
 *     silently picks a side) with a reason naming both sources.
 *   - CONTRADICTS: deliberately asymmetric and weaker than FALSIFIES. If A
 *     CONTRADICTS B and A is SUPPORTED while B is still UNRESOLVED, B
 *     becomes WEAKENED — not FALSIFIED, because two hypotheses being framed
 *     as mutually exclusive does not itself constitute a computed
 *     falsification of the other; it is a real but softer signal, and this
 *     engine never overstates it. A node already at a stronger, decided
 *     status (SUPPORTED/FALSIFIED/BLOCKED) is left alone.
 *
 *   PREDICTS, TESTS, DERIVED_FROM and DISTINGUISHES remain stored and
 *   queryable — the graph structure is real and complete — but trigger NO
 *   automatic propagation here. Each names a real structural fact (which
 *   experiment tests which hypothesis, what a model predicts, what an
 *   experiment can distinguish, what a claim was derived from) that a
 *   downstream layer (see experimentSelection.ts) reads to REASON about
 *   what to do next; none of them, alone, tells this engine what a node's
 *   new STATUS should be, so inventing that inference here would be exactly
 *   the kind of fabricated reasoning this project refuses to produce.
 */
import { canonicalJson, fnv1a } from '../events/hash';
import { saveExperiment, type SavedExperiment } from '../scienceMemory';
import { buildNextScientificAction, type NextScientificAction } from './nextScientificAction';
import type { GeneratedHypothesisVerdict } from './hypothesisGeneration';

export const EPISTEMIC_ENGINE_VERSION = '1.0.0';

export type EpistemicNodeKind = 'FACT' | 'DERIVED' | 'MODEL' | 'HYPOTHESIS' | 'UNKNOWN' | 'EXPERIMENT';

/** Reuses the existing hypothesis-verdict vocabulary; adds only what it has no room for. */
export type EpistemicStatus = GeneratedHypothesisVerdict | 'ESTABLISHED' | 'UNKNOWN';

export interface UnknownDetail {
  whatIsUnknown: string;
  whyUnknown: string;
  missingEvidence: readonly string[];
  competingHypothesisIds: readonly string[];
  /** What experiment or data could resolve this — text, not a fabricated promise it will. */
  potentialResolution: string;
}

export interface EpistemicNode {
  nodeId: string;
  kind: EpistemicNodeKind;
  domainId: string;
  statement: string;
  status: EpistemicStatus;
  /** Populated only for kind === 'UNKNOWN'; null otherwise, never a placeholder object. */
  unknownDetail: UnknownDetail | null;
  /** Why the CURRENT status holds — always real reasoning, appended to on every change, never overwritten silently. */
  statusReason: string;
  provenance: readonly string[];
  fingerprint: string;
}

export type EpistemicRelation =
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'DEPENDS_ON'
  | 'BLOCKS'
  | 'PREDICTS'
  | 'TESTS'
  | 'DERIVED_FROM'
  | 'FALSIFIES'
  | 'DISTINGUISHES';

export interface EpistemicEdge {
  edgeId: string;
  from: string;
  to: string;
  relation: EpistemicRelation;
  rationale: string;
}

export interface EpistemicGraph {
  contractVersion: string;
  graphId: string;
  nodes: readonly EpistemicNode[];
  edges: readonly EpistemicEdge[];
  fingerprint: string;
}

function hashOf(value: unknown): string {
  return fnv1a(canonicalJson(value));
}

export interface BuildEpistemicNodeInput {
  nodeId: string;
  kind: EpistemicNodeKind;
  domainId: string;
  statement: string;
  status: EpistemicStatus;
  unknownDetail?: UnknownDetail | null;
  statusReason: string;
  provenance: readonly string[];
}

/**
 * The only way to construct a node. Refuses a kind/status mismatch that
 * would misrepresent the node: an `UNKNOWN`-kind node without
 * `unknownDetail` (an unknown with no stated reason is not honestly
 * represented), and a non-`UNKNOWN`-kind node whose status is `UNKNOWN`
 * while carrying no `unknownDetail` either — both cases mean the caller
 * has not actually said what is unknown.
 */
export function buildEpistemicNode(input: BuildEpistemicNodeInput): EpistemicNode {
  const unknownDetail = input.unknownDetail ?? null;
  if (input.kind === 'UNKNOWN' && unknownDetail === null) {
    throw new Error(`Node "${input.nodeId}" is kind UNKNOWN but declares no unknownDetail — an unknown with no stated reason is not honestly represented.`);
  }
  if (input.status === 'UNKNOWN' && unknownDetail === null) {
    throw new Error(`Node "${input.nodeId}" has status UNKNOWN but declares no unknownDetail.`);
  }
  if (input.provenance.length === 0) {
    throw new Error(`Node "${input.nodeId}" declares no provenance — an untraceable epistemic claim cannot be honestly represented.`);
  }
  const base = { ...input, unknownDetail };
  const fingerprint = hashOf({ v: EPISTEMIC_ENGINE_VERSION, ...base });
  return { ...base, fingerprint };
}

export function buildEpistemicEdge(input: { edgeId: string; from: string; to: string; relation: EpistemicRelation; rationale: string }): EpistemicEdge {
  return { ...input };
}

/**
 * Builds (or rebuilds, after an update) the graph and its fingerprint.
 * Validates referential integrity: every edge must name real node ids —
 * no undeclared node, ever.
 */
export function buildEpistemicGraph(graphId: string, nodes: readonly EpistemicNode[], edges: readonly EpistemicEdge[]): EpistemicGraph {
  const ids = new Set(nodes.map((n) => n.nodeId));
  if (ids.size !== nodes.length) {
    throw new Error(`Graph "${graphId}" declares duplicate node ids.`);
  }
  for (const edge of edges) {
    if (!ids.has(edge.from)) throw new Error(`Edge "${edge.edgeId}" references unknown node "${edge.from}".`);
    if (!ids.has(edge.to)) throw new Error(`Edge "${edge.edgeId}" references unknown node "${edge.to}".`);
  }
  const fingerprint = hashOf({
    v: EPISTEMIC_ENGINE_VERSION,
    graphId,
    nodes: [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId)).map((n) => n.fingerprint),
    edges: [...edges].sort((a, b) => a.edgeId.localeCompare(b.edgeId)),
  });
  return { contractVersion: EPISTEMIC_ENGINE_VERSION, graphId, nodes, edges, fingerprint };
}

export interface StatusUpdate {
  nodeId: string;
  newStatus: EpistemicStatus;
  /** Why — must reference the real computation that established this, never asserted bare. */
  reason: string;
  /** Additional provenance to append (e.g. a real evidence/result identifier). */
  provenance?: readonly string[];
}

export interface EpistemicChange {
  nodeId: string;
  previousStatus: EpistemicStatus;
  newStatus: EpistemicStatus;
  reason: string;
  /** The node id whose status change caused this one, via propagation — null for a directly-applied update. */
  triggeredBy: string | null;
}

export interface PropagationResult {
  graph: EpistemicGraph;
  changes: readonly EpistemicChange[];
}

function withUpdatedStatus(node: EpistemicNode, newStatus: EpistemicStatus, reason: string, extraProvenance: readonly string[]): EpistemicNode {
  const provenance = extraProvenance.length > 0 ? [...node.provenance, ...extraProvenance] : node.provenance;
  const statusReason = reason;
  const updated = { ...node, status: newStatus, statusReason, provenance };
  const fingerprint = hashOf({
    v: EPISTEMIC_ENGINE_VERSION,
    nodeId: updated.nodeId, kind: updated.kind, domainId: updated.domainId, statement: updated.statement,
    status: updated.status, unknownDetail: updated.unknownDetail, statusReason: updated.statusReason, provenance: updated.provenance,
  });
  return { ...updated, fingerprint };
}

const BLOCKING_STATUSES: ReadonlySet<EpistemicStatus> = new Set(['FALSIFIED', 'BLOCKED']);

/** A node whose status reflects real, executed evidence (not a mere unconfirmed assertion) — the only kind of source this engine will propagate FALSIFIES/SUPPORTS/CONTRADICTS from. */
const AFFIRMATIVE_STATUSES: ReadonlySet<EpistemicStatus> = new Set(['ESTABLISHED', 'SUPPORTED']);

/**
 * Applies real, externally-established status updates, then deterministically
 * propagates DEPENDS_ON / BLOCKS / FALSIFIES / SUPPORTS / CONTRADICTS to a
 * fixed point (repeats until no further node changes). A node already at its
 * target status is left untouched — no update is ever recorded as a "change"
 * when nothing actually changed.
 */
export function applyEpistemicUpdates(graph: EpistemicGraph, updates: readonly StatusUpdate[]): PropagationResult {
  const nodesById = new Map(graph.nodes.map((n) => [n.nodeId, n]));
  for (const u of updates) {
    if (!nodesById.has(u.nodeId)) throw new Error(`Cannot apply an update to unknown node "${u.nodeId}".`);
  }

  const changes: EpistemicChange[] = [];

  function setStatus(nodeId: string, newStatus: EpistemicStatus, reason: string, triggeredBy: string | null, extraProvenance: readonly string[] = []): boolean {
    const node = nodesById.get(nodeId)!;
    if (node.status === newStatus) return false;
    const updated = withUpdatedStatus(node, newStatus, reason, extraProvenance);
    nodesById.set(nodeId, updated);
    changes.push({ nodeId, previousStatus: node.status, newStatus, reason, triggeredBy });
    return true;
  }

  for (const u of updates) {
    setStatus(u.nodeId, u.newStatus, u.reason, null, u.provenance ?? []);
  }

  let progressed = true;
  while (progressed) {
    progressed = false;

    for (const edge of graph.edges) {
      if (edge.relation === 'DEPENDS_ON') {
        const dependedOn = nodesById.get(edge.to)!;
        const dependent = nodesById.get(edge.from)!;
        if (BLOCKING_STATUSES.has(dependedOn.status) && dependent.status !== 'BLOCKED') {
          if (setStatus(edge.from, 'BLOCKED', `Depends on "${edge.to}" (${edge.rationale}), which is ${dependedOn.status}.`, edge.to)) progressed = true;
        }
      } else if (edge.relation === 'BLOCKS') {
        const blocker = nodesById.get(edge.from)!;
        const blocked = nodesById.get(edge.to)!;
        if (BLOCKING_STATUSES.has(blocker.status) && blocked.status !== 'BLOCKED') {
          if (setStatus(edge.to, 'BLOCKED', `Blocked by "${edge.from}" (${edge.rationale}), which is ${blocker.status}.`, edge.from)) progressed = true;
        }
      }
    }

    // FALSIFIES / SUPPORTS: decided per TARGET node, considering every
    // incoming edge at once, so genuinely conflicting evidence (both an
    // affirmative FALSIFIES and an affirmative SUPPORTS pointing at the same
    // node) is detected and reported as UNRESOLVED rather than one relation
    // arbitrarily winning a race.
    for (const node of graph.nodes) {
      const incomingFalsifies = graph.edges.filter((e) => e.relation === 'FALSIFIES' && e.to === node.nodeId && AFFIRMATIVE_STATUSES.has(nodesById.get(e.from)!.status));
      const incomingSupports = graph.edges.filter((e) => e.relation === 'SUPPORTS' && e.to === node.nodeId && AFFIRMATIVE_STATUSES.has(nodesById.get(e.from)!.status));
      if (incomingFalsifies.length > 0 && incomingSupports.length > 0) {
        const reason = `Conflicting evidence: FALSIFIES from "${incomingFalsifies[0]!.from}" and SUPPORTS from "${incomingSupports[0]!.from}" are both currently affirmative — this engine will not silently pick a side.`;
        if (setStatus(node.nodeId, 'UNRESOLVED', reason, null)) progressed = true;
      } else if (incomingFalsifies.length > 0) {
        const source = incomingFalsifies[0]!;
        if (setStatus(node.nodeId, 'FALSIFIED', `Falsified by "${source.from}" (${source.rationale}), which is ${nodesById.get(source.from)!.status}.`, source.from)) progressed = true;
      } else if (incomingSupports.length > 0) {
        const source = incomingSupports[0]!;
        if (setStatus(node.nodeId, 'SUPPORTED', `Supported by "${source.from}" (${source.rationale}), which is ${nodesById.get(source.from)!.status}.`, source.from)) progressed = true;
      }
    }

    // CONTRADICTS: asymmetric and weaker than FALSIFIES/SUPPORTS — a
    // SUPPORTED source only WEAKENS a still-UNRESOLVED contradicted target,
    // never falsifies it and never overrides an already-decided status.
    for (const edge of graph.edges) {
      if (edge.relation === 'CONTRADICTS') {
        const from = nodesById.get(edge.from)!;
        const to = nodesById.get(edge.to)!;
        if (from.status === 'SUPPORTED' && to.status === 'UNRESOLVED') {
          if (setStatus(edge.to, 'WEAKENED', `Contradicted by "${edge.from}" (${edge.rationale}), which is SUPPORTED.`, edge.from)) progressed = true;
        }
      }
    }
  }

  const newNodes = graph.nodes.map((n) => nodesById.get(n.nodeId)!);
  const newGraph = buildEpistemicGraph(graph.graphId, newNodes, graph.edges);
  return { graph: newGraph, changes };
}

export interface EpistemicReplay {
  status: 'MATCH' | 'DRIFT';
  reason: string;
}

/**
 * Replays a state transition: re-applies the SAME updates to the SAME
 * initial graph and compares the resulting fingerprint against a saved
 * final graph. A different node set/edge set/propagation outcome is DRIFT,
 * never silently accepted as reproduced.
 */
export function replayEpistemicUpdates(initialGraph: EpistemicGraph, updates: readonly StatusUpdate[], savedFinalGraph: EpistemicGraph): EpistemicReplay {
  const recomputed = applyEpistemicUpdates(initialGraph, updates);
  if (recomputed.graph.fingerprint !== savedFinalGraph.fingerprint) {
    return { status: 'DRIFT', reason: `Re-applying the same updates to the same initial graph produced a different final fingerprint (${savedFinalGraph.fingerprint} -> ${recomputed.graph.fingerprint}).` };
  }
  return { status: 'MATCH', reason: '' };
}

/** Nodes still genuinely open — the hook a future experiment-selection engine reads. */
export function listUnresolved(graph: EpistemicGraph): readonly EpistemicNode[] {
  return graph.nodes.filter((n) => n.status === 'UNRESOLVED' || n.status === 'UNKNOWN');
}

export interface UnknownExplanation {
  nodeId: string;
  whatIsUnknown: string;
  whyUnknown: string;
  missingEvidence: readonly string[];
  /** Competing explanations, resolved to their CURRENT status — never a static snapshot from when the unknown was declared. */
  competingHypotheses: readonly { hypothesisId: string; statement: string; status: EpistemicStatus }[];
  /** Nodes that DEPENDS_ON this unknown, read live from the graph's edges — not a declared, possibly-stale list. */
  dependentNodeIds: readonly string[];
  potentialResolution: string;
  status: EpistemicStatus;
  provenance: readonly string[];
}

/**
 * Upgrades a stored `UnknownDetail` into an ACTIONABLE explanation: answers
 * "what don't we know?" and "why don't we know it?" by combining the node's
 * own declared detail with a live read of the graph's structure (which
 * hypotheses currently depend on this unknown, and what their CURRENT
 * status is) — not merely echoing back the static fields it was built with.
 */
export function explainUnknown(graph: EpistemicGraph, nodeId: string): UnknownExplanation {
  const node = graph.nodes.find((n) => n.nodeId === nodeId);
  if (!node) throw new Error(`Cannot explain unknown node "${nodeId}": no such node in graph "${graph.graphId}".`);
  if (node.unknownDetail === null) throw new Error(`Node "${nodeId}" has no unknownDetail — there is nothing to explain.`);

  const nodesById = new Map(graph.nodes.map((n) => [n.nodeId, n]));
  const competingHypotheses = node.unknownDetail.competingHypothesisIds.map((id) => {
    const h = nodesById.get(id);
    if (!h) throw new Error(`Node "${nodeId}" declares competing hypothesis "${id}", which does not exist in graph "${graph.graphId}".`);
    return { hypothesisId: id, statement: h.statement, status: h.status };
  });
  const dependentNodeIds = graph.edges.filter((e) => e.relation === 'DEPENDS_ON' && e.to === nodeId).map((e) => e.from);

  return {
    nodeId,
    whatIsUnknown: node.unknownDetail.whatIsUnknown,
    whyUnknown: node.unknownDetail.whyUnknown,
    missingEvidence: node.unknownDetail.missingEvidence,
    competingHypotheses,
    dependentNodeIds,
    potentialResolution: node.unknownDetail.potentialResolution,
    status: node.status,
    provenance: node.provenance,
  };
}

/**
 * Projects one UNKNOWN/UNRESOLVED node into the existing NextScientificAction
 * shape (nextScientificAction.ts, unchanged) — the clean hook for a future
 * experiment-selection stage. Returns null for a node that is not open.
 */
export function nextActionForOpenNode(node: EpistemicNode): NextScientificAction | null {
  if (node.status !== 'UNRESOLVED' && node.status !== 'UNKNOWN') return null;
  const detail = node.unknownDetail;
  return buildNextScientificAction({
    actionId: `${node.nodeId}:resolve`,
    question: detail ? detail.whatIsUnknown : `What would resolve: ${node.statement}?`,
    targetHypothesisIds: detail && detail.competingHypothesisIds.length > 0 ? detail.competingHypothesisIds : [node.nodeId],
    requiredInputs: detail ? detail.missingEvidence : [],
    availableInputs: [],
    method: detail ? detail.potentialResolution : 'Not specified by this node.',
    expectedDiscriminatingPower: 'UNKNOWN',
    discriminatingPowerReasoning: detail ? detail.whyUnknown : 'This node has no declared unknownDetail; discriminating power cannot be assessed.',
    constraints: [],
    expectedOutputs: [node.statement],
    successCriteria: `Resolves node "${node.nodeId}" to a real, computed status (SUPPORTED, WEAKENED, or FALSIFIED).`,
    falsificationCriteria: detail ? `The node remains ${node.status} if ${detail.missingEvidence.join(', ') || 'the missing evidence'} cannot be obtained.` : `The node remains ${node.status} without further evidence.`,
    availability: 'REQUIRES_EXTERNAL_DATA',
    estimatedBurden: 'UNKNOWN',
    burdenReasoning: 'Genesis has no basis to estimate cost, duration, or feasibility for resolving this node.',
  });
}

export function saveEpistemicGraphToMemory(graph: EpistemicGraph, changes: readonly EpistemicChange[] = []): SavedExperiment {
  const byStatus = (s: EpistemicStatus) => graph.nodes.filter((n) => n.status === s).length;
  return saveExperiment({
    labId: 'epistemic-engine',
    experimentId: `${graph.graphId}:${graph.fingerprint}`,
    experimentName: `Epistemic graph — ${graph.graphId}`,
    params: { graphId: graph.graphId, nodeCount: graph.nodes.length, edgeCount: graph.edges.length },
    stats: {
      supported: byStatus('SUPPORTED'),
      weakened: byStatus('WEAKENED'),
      falsified: byStatus('FALSIFIED'),
      unresolved: byStatus('UNRESOLVED'),
      blocked: byStatus('BLOCKED'),
      established: byStatus('ESTABLISHED'),
      unknown: byStatus('UNKNOWN'),
    },
    analysis: [
      ...graph.nodes.map((n) => ({ title: n.nodeId, kind: `epistemic-${n.kind.toLowerCase()}`, body: `[${n.status}] ${n.statement} — ${n.statusReason}` })),
      ...changes.map((c) => ({ title: `${c.nodeId}:change`, kind: 'epistemic-change', body: `${c.previousStatus} -> ${c.newStatus}: ${c.reason}${c.triggeredBy ? ` (propagated from "${c.triggeredBy}")` : ''}` })),
    ],
    honesty: 'simplified',
    honestyNote:
      'Every node status was either directly established by real computation performed elsewhere in this engine, or deterministically propagated through a DEPENDS_ON/BLOCKS/FALSIFIES/SUPPORTS/CONTRADICTS edge — this module performs no independent scientific reasoning of its own. '
      + 'UNKNOWN nodes are never silently converted to a resolved status without a real update supplying one.',
    epistemicStatus: `NODES=${graph.nodes.length};SUPPORTED=${byStatus('SUPPORTED')};FALSIFIED=${byStatus('FALSIFIED')};UNRESOLVED=${byStatus('UNRESOLVED')};UNKNOWN=${byStatus('UNKNOWN')};BLOCKED=${byStatus('BLOCKED')}`,
    assumptions: [
      'This engine automatically propagates DEPENDS_ON, BLOCKS, FALSIFIES, SUPPORTS and CONTRADICTS; PREDICTS/TESTS/DERIVED_FROM/DISTINGUISHES are stored and queryable but do not trigger automatic status changes in this version.',
      'FALSIFIES/SUPPORTS only propagate from a source node whose OWN status is already ESTABLISHED or SUPPORTED (real, executed evidence) — never from a merely UNRESOLVED or WEAKENED source.',
      'CONTRADICTS only ever WEAKENS a still-UNRESOLVED target from a SUPPORTED source; it never FALSIFIES and never overrides an already-decided status.',
    ],
  });
}
