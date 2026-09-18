/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { RecursiveSimulationMatrix } from '../../../core/src/postmythos/RecursiveSimulationMatrix.js';
import { hypergraphFromRsm } from './hypergraphFromRsm.js';

const cfg = { dims: 6, horizon: 4, branching: 3, beamK: 8, maxScenarios: 2000, eps: 0.05, seed: 0x47454e45 };
const obj = new Float64Array([0.4, -0.2, 0.6, 0.1, 0.3, -0.5]);
const inter = new Float64Array(36).fill(0.02);

describe('hypergraphFromRsm — the lattice the layer draws is the run the engine made', () => {
  const result = new RecursiveSimulationMatrix(cfg, obj, inter).run();
  const view = hypergraphFromRsm(result);

  it('rebuilds every node the run enumerated, root first, with the right depth and parent', () => {
    expect(view.nodes.length).toBe(result.enumerated);
    expect(view.nodes[0]).toMatchObject({ id: 'R', depth: 0, parentId: null, score: 0 });
    for (const n of view.nodes.slice(1)) {
      expect(n.depth).toBe(n.id.split('-').length - 1);
      expect(n.parentId).toBe(n.id.slice(0, n.id.lastIndexOf('-')));
      expect(view.nodes.some((p) => p.id === n.parentId)).toBe(true);
    }
  });

  it('every edge endpoint resolves to a node (nothing the layer would silently drop)', () => {
    const ids = new Set(view.nodes.map((n) => n.id));
    for (const e of result.edges) { expect(ids.has(e.from)).toBe(true); expect(ids.has(e.to)).toBe(true); }
  });

  it('margins are a 0..1 rank of relative score and the best path ends at the top', () => {
    const vals = [...view.margins.values()];
    expect(Math.min(...vals)).toBe(0);
    expect(Math.max(...vals)).toBe(1);
    const leaf = result.bestPath[result.bestPath.length - 1];
    expect(view.bestPath.has(leaf)).toBe(true);
    expect(view.margins.get(leaf)).toBeGreaterThan(0.5);
  });

  it('is deterministic for the same run', () => {
    const again = hypergraphFromRsm(new RecursiveSimulationMatrix(cfg, obj, inter).run());
    expect(again.nodes.map((n) => [n.id, n.score])).toEqual(view.nodes.map((n) => [n.id, n.score]));
  });
});
