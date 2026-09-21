/* Proprietary / All Rights Reserved - Genesis OS */
import type { HyperEdge, RsmResult, ScenarioNode } from '@genesis/core/postmythos/RecursiveSimulationMatrix.js';

/**
 * Rebuilds the scenario lattice that `RecursiveSimulationMatrix.run()` walked
 * from the edges it returns, so the GPU hypergraph layer can draw the REAL
 * run (the result carries edges and the best path, not the node list).
 *
 * Only order-2 edges are tree edges (parent -> child, weight = score delta),
 * so a node's score is the cumulative delta from the root. The root's own
 * score is not in the result, so scores here are RELATIVE to the root (root
 * = 0) — enough for ranking and colouring, never presented as absolute.
 *
 * `margins` (0..1) is what the layer colours by: rank of the node's relative
 * score within the lattice (1 = best). Pure and deterministic: same result
 * in, same lattice out.
 */
export interface HypergraphView {
  readonly nodes: readonly ScenarioNode[];
  readonly margins: ReadonlyMap<string, number>;
  readonly bestPath: ReadonlySet<string>;
}

const depthOf = (id: string): number => (id === 'R' ? 0 : id.split('-').length - 1);
const parentOf = (id: string): string | null => (id === 'R' ? null : id.slice(0, id.lastIndexOf('-')));

export function hypergraphFromRsm(result: Pick<RsmResult, 'edges' | 'bestPath'>): HypergraphView {
  const treeEdges: HyperEdge[] = result.edges.filter((e) => e.order === 2);
  const relScore = new Map<string, number>([['R', 0]]);
  // Edges arrive parent-first (the run pushes each child right after expanding its parent), one pass suffices.
  for (const e of treeEdges) relScore.set(e.to, (relScore.get(e.from) ?? 0) + e.weight);
  const ids = [...relScore.keys()].sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b));
  const nodes: ScenarioNode[] = ids.map((id) => ({ id, depth: depthOf(id), state: new Float64Array(0), parentId: parentOf(id), score: relScore.get(id) ?? 0 }));
  const ranked = [...nodes].sort((a, b) => a.score - b.score);
  const margins = new Map<string, number>();
  ranked.forEach((n, i) => margins.set(n.id, ranked.length > 1 ? i / (ranked.length - 1) : 1));
  return { nodes, margins, bestPath: new Set(result.bestPath) };
}
