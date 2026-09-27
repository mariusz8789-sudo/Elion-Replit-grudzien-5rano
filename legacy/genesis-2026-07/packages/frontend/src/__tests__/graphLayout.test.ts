/**
 * graphLayout (V5 Knowledge Graph) — determinism + sanity of the force layout.
 */
import { describe, expect, it } from 'vitest';
import { layoutGraph, type GNode, type GEdge } from '../components/graph/graphLayout';

const nodes: GNode[] = [
  { id: 'ddr1', type: 'Target', label: 'DDR1' },
  { id: 'mol', type: 'Molecule', label: 'GEN-0421' },
  { id: 'canc', type: 'Disease', label: 'Cancer' },
  { id: 'kin', type: 'Pathway', label: 'Kinase' },
  { id: 'pub', type: 'Publication', label: 'Ref' },
];
const edges: GEdge[] = [
  { source: 'ddr1', target: 'mol', label: 'targets' },
  { source: 'ddr1', target: 'canc', label: 'associated' },
  { source: 'ddr1', target: 'kin', label: 'part_of' },
  { source: 'pub', target: 'ddr1', label: 'cites' },
];

describe('layoutGraph', () => {
  it('returns nothing for an empty graph', () => {
    expect(layoutGraph([], [])).toEqual([]);
  });
  it('centres a single node', () => {
    const p = layoutGraph([{ id: 'a', type: 'Target', label: 'A' }], [], { width: 400, height: 300 });
    expect(p[0].x).toBeCloseTo(200, 5);
    expect(p[0].y).toBeCloseTo(150, 5);
  });
  it('is deterministic — identical inputs produce identical positions', () => {
    const a = layoutGraph(nodes, edges, { width: 640, height: 420 });
    const b = layoutGraph(nodes, edges, { width: 640, height: 420 });
    expect(a).toEqual(b);
  });
  it('keeps every node inside the viewport (with margin)', () => {
    const p = layoutGraph(nodes, edges, { width: 640, height: 420 });
    for (const nd of p) {
      expect(nd.x).toBeGreaterThanOrEqual(26);
      expect(nd.x).toBeLessThanOrEqual(640 - 26);
      expect(nd.y).toBeGreaterThanOrEqual(26);
      expect(nd.y).toBeLessThanOrEqual(420 - 26);
    }
  });
  it('preserves node identity and count', () => {
    const p = layoutGraph(nodes, edges);
    expect(p.map((x) => x.id).sort()).toEqual(nodes.map((x) => x.id).sort());
  });
  it('ignores edges that reference unknown nodes without throwing', () => {
    const p = layoutGraph(nodes, [...edges, { source: 'ghost', target: 'mol' }]);
    expect(p.length).toBe(nodes.length);
  });
});
