/**
 * Genesis Cyber Reasoning Engine — Attack Path Construction & Verification
 *
 * Builds attack paths from evidence-backed nodes and edges.
 * Verifies using strict rules:
 * - All required nodes SUPPORTED → path can be VERIFIED
 * - Any required node FALSIFIED → path is FALSIFIED
 * - Any required node BLOCKED → path is BLOCKED
 * - Any required node UNVERIFIED → path is NOT VERIFIED
 * - Coverage ≠ Confidence
 *
 * FIXED (C3 review): `computePathStatus` originally could report 'VERIFIED'
 * purely from node/edge statuses even when the graph itself was structurally
 * broken (unreachable, out-of-order, or disconnected) — `verifyAttackPath`'s
 * reachability/ordering/coherence checks existed but nothing downstream ever
 * used them to downgrade an already-'VERIFIED' status. `buildAttackPath` now
 * folds those checks in directly, so a structurally broken path is reported
 * as 'PARTIALLY_VERIFIED' rather than a false 'VERIFIED'.
 */

import type {
  AttackPath,
  AttackPathNode,
  AttackPathEdge,
  PathNodeStatus,
  SecurityVerdict,
} from './cyberDomainTypes';

let pathCounter = 0;
let nodeCounter = 0;
let edgeCounter = 0;

export function buildAttackPath(
  pathId: string | null,
  hypotheses: readonly { hypothesisId: string; statement: string; verdict: SecurityVerdict; evidenceRefs: readonly string[] }[],
  edges: readonly { fromHypothesisId: string; toHypothesisId: string; relationship: string }[]
): AttackPath {
  const nodes: AttackPathNode[] = hypotheses.map((h) => ({
    nodeId: `apn-${++nodeCounter}`,
    hypothesisId: h.hypothesisId,
    description: h.statement,
    verificationStatus: verdictToPathStatus(h.verdict),
    evidenceRefs: [...h.evidenceRefs],
    dataProvenance: 'SIMULATED',
    required: true,
  }));

  const nodeIdByHypothesis = new Map<string, string>();
  for (const node of nodes) {
    nodeIdByHypothesis.set(node.hypothesisId, node.nodeId);
  }

  const pathEdges: AttackPathEdge[] = edges
    .filter((e) => nodeIdByHypothesis.has(e.fromHypothesisId) && nodeIdByHypothesis.has(e.toHypothesisId))
    .map((e) => ({
      edgeId: `ape-${++edgeCounter}`,
      fromNodeId: nodeIdByHypothesis.get(e.fromHypothesisId)!,
      toNodeId: nodeIdByHypothesis.get(e.toHypothesisId)!,
      relationship: e.relationship,
      verificationStatus: 'UNVERIFIED' as PathNodeStatus,
      evidenceRefs: [],
      required: true,
    }));

  // Edge verification: an edge is SUPPORTED if both its nodes are SUPPORTED
  const verifiedEdges = pathEdges.map((edge) => {
    const fromNode = nodes.find((n) => n.nodeId === edge.fromNodeId);
    const toNode = nodes.find((n) => n.nodeId === edge.toNodeId);
    const bothSupported = fromNode?.verificationStatus === 'SUPPORTED' && toNode?.verificationStatus === 'SUPPORTED';
    return {
      ...edge,
      verificationStatus: (bothSupported ? 'SUPPORTED' : 'UNVERIFIED') as PathNodeStatus,
    };
  });

  const draftPath: AttackPath = Object.freeze({
    pathId: pathId ?? `ap-${++pathCounter}`,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(verifiedEdges),
    overallStatus: 'UNVERIFIED',
    verificationCoverage: computeCoverage(nodes, verifiedEdges),
    timestamp: new Date().toISOString(),
  });

  const overallStatus = computePathStatus(draftPath);

  return Object.freeze({ ...draftPath, overallStatus });
}

export function verifyAttackPath(path: AttackPath): {
  canBeMarkedVerified: boolean;
  reason: string;
  reachabilityValid: boolean;
  orderingConsistent: boolean;
  graphCoherent: boolean;
} {
  const requiredNodes = path.nodes.filter((n) => n.required);
  const requiredEdges = path.edges.filter((e) => e.required);

  const allNodesSupported = requiredNodes.every((n) => n.verificationStatus === 'SUPPORTED');
  const allEdgesSupported = requiredEdges.every((e) => e.verificationStatus === 'SUPPORTED');
  const anyNodeFalsified = requiredNodes.some((n) => n.verificationStatus === 'FALSIFIED');
  const anyEdgeFalsified = requiredEdges.some((e) => e.verificationStatus === 'FALSIFIED');
  const anyNodeBlocked = requiredNodes.some((n) => n.verificationStatus === 'BLOCKED');
  const anyNodeUnverified = requiredNodes.some((n) => n.verificationStatus === 'UNVERIFIED');

  const reachabilityValid = checkReachability(path);
  const orderingConsistent = checkOrdering(path);
  const graphCoherent = checkCoherence(path);

  let canBeMarkedVerified = false;
  let reason: string;

  if (anyNodeFalsified || anyEdgeFalsified) {
    reason = 'Required element FALSIFIED → path is FALSIFIED.';
  } else if (anyNodeBlocked) {
    reason = 'Required element BLOCKED → path is BLOCKED.';
  } else if (anyNodeUnverified) {
    reason = 'Required element UNVERIFIED → path is NOT VERIFIED.';
  } else if (allNodesSupported && allEdgesSupported) {
    canBeMarkedVerified = reachabilityValid && orderingConsistent && graphCoherent;
    reason = canBeMarkedVerified
      ? 'All required nodes and edges SUPPORTED. Path is VERIFIED.'
      : 'All elements SUPPORTED but graph structure invalid.';
  } else {
    reason = 'Insufficient verification coverage.';
  }

  return { canBeMarkedVerified, reason, reachabilityValid, orderingConsistent, graphCoherent };
}

function verdictToPathStatus(verdict: SecurityVerdict): PathNodeStatus {
  switch (verdict) {
    case 'SUPPORTED': return 'SUPPORTED';
    case 'FALSIFIED': return 'FALSIFIED';
    case 'BLOCKED': return 'BLOCKED';
    case 'INCONCLUSIVE': return 'UNVERIFIED';
  }
}

function computePathStatus(path: AttackPath): AttackPath['overallStatus'] {
  const requiredNodes = path.nodes.filter((n) => n.required);
  const requiredEdges = path.edges.filter((e) => e.required);

  if (requiredNodes.some((n) => n.verificationStatus === 'FALSIFIED')) return 'FALSIFIED';
  if (requiredNodes.some((n) => n.verificationStatus === 'BLOCKED')) return 'BLOCKED';
  if (requiredNodes.some((n) => n.verificationStatus === 'UNVERIFIED')) return 'UNVERIFIED';

  const allSupported = requiredNodes.every((n) => n.verificationStatus === 'SUPPORTED')
    && requiredEdges.every((e) => e.verificationStatus === 'SUPPORTED');

  if (allSupported) {
    // Node/edge statuses alone are not enough: a structurally broken graph
    // (unreachable, out-of-order, disconnected) must never read as VERIFIED.
    const structurallyValid = checkReachability(path) && checkOrdering(path) && checkCoherence(path);
    return structurallyValid ? 'VERIFIED' : 'PARTIALLY_VERIFIED';
  }

  const someSupported = requiredNodes.some((n) => n.verificationStatus === 'SUPPORTED');
  return someSupported ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED';
}

function computeCoverage(
  nodes: readonly AttackPathNode[],
  edges: readonly AttackPathEdge[]
): number {
  const requiredNodes = nodes.filter((n) => n.required);
  const requiredEdges = edges.filter((e) => e.required);
  const total = requiredNodes.length + requiredEdges.length;
  if (total === 0) return 0;
  const verified = requiredNodes.filter((n) => n.verificationStatus === 'SUPPORTED').length
    + requiredEdges.filter((e) => e.verificationStatus === 'SUPPORTED').length;
  return Math.round((verified / total) * 1000) / 1000;
}

function checkReachability(path: AttackPath): boolean {
  if (path.nodes.length <= 1) return true;
  const first = path.nodes[0];
  const last = path.nodes[path.nodes.length - 1];
  if (!first || !last) return false;

  const visited = new Set<string>();
  const queue = [first.nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === last.nodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of path.edges) {
      if (edge.fromNodeId === current && !visited.has(edge.toNodeId)) {
        queue.push(edge.toNodeId);
      }
    }
  }
  return false;
}

function checkOrdering(path: AttackPath): boolean {
  const nodeOrder = new Map(path.nodes.map((n, i) => [n.nodeId, i]));
  for (const edge of path.edges) {
    const fromIdx = nodeOrder.get(edge.fromNodeId);
    const toIdx = nodeOrder.get(edge.toNodeId);
    if (fromIdx !== undefined && toIdx !== undefined && fromIdx >= toIdx) return false;
  }
  return true;
}

function checkCoherence(path: AttackPath): boolean {
  if (path.nodes.length === 0) return true;
  const first = path.nodes[0];
  if (!first) return true;
  const visited = new Set<string>();
  const queue = [first.nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of path.edges) {
      if (edge.fromNodeId === current) queue.push(edge.toNodeId);
    }
  }
  return visited.size === path.nodes.length;
}
