import { describe, expect, it, vi } from 'vitest';
import { ModelGraph, type ModelNodeDef } from '../core/modelGraph/graph';

function paramNode(id: string): ModelNodeDef {
  return {
    id, label: id, unit: '', domain: 'test', honesty: 'exact', honestyNote: '', derivation: 'direct',
    inputs: [], compute: (inputs) => inputs[id] ?? 0, formula: id,
  };
}

describe('ModelGraph', () => {
  it('computes a derived node from a parameter at add-time', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('x'), 3);
    g.addNode({
      id: 'double', label: 'double', unit: '', domain: 'test', honesty: 'exact', honestyNote: '', derivation: 'direct',
      inputs: ['x'], compute: (inputs) => inputs.x * 2, formula: 'double = 2x',
    });
    expect(g.getValue('x')).toBe(3);
    expect(g.getValue('double')).toBe(6);
  });

  it('propagates a parameter change through a multi-hop chain in topological order', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('mass'), 1);
    g.addNode({
      id: 'period', label: 'period', unit: 'yr', domain: 'orbital', honesty: 'exact', honestyNote: '', derivation: 'direct',
      inputs: ['mass'], compute: (i) => 10 / i.mass, formula: 'T = 10/M',
    });
    g.addNode({
      id: 'speed', label: 'speed', unit: 'AU/yr', domain: 'orbital', honesty: 'exact', honestyNote: '', derivation: 'direct',
      inputs: ['mass'], compute: (i) => Math.sqrt(i.mass), formula: 'v = sqrt(M)',
    });
    g.addNode({
      id: 'period_squared', label: 'period_squared', unit: 'yr^2', domain: 'orbital', honesty: 'exact', honestyNote: '', derivation: 'direct',
      inputs: ['period'], compute: (i) => i.period * i.period, formula: 'T^2',
    });

    const steps = g.setParameter('mass', 4);
    expect(g.getValue('mass')).toBe(4);
    expect(g.getValue('period')).toBeCloseTo(2.5);
    expect(g.getValue('speed')).toBeCloseTo(2);
    expect(g.getValue('period_squared')).toBeCloseTo(6.25);

    // 'period' must appear before 'period_squared' (its consumer) in the propagation order.
    const ids = steps.map((s) => s.nodeId);
    expect(ids[0]).toBe('mass');
    expect(ids.indexOf('period')).toBeLessThan(ids.indexOf('period_squared'));
    expect(ids).toContain('speed');
  });

  it('does not report unchanged descendants as propagation steps', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('a'), 1);
    g.addNode(paramNode('b'), 5);
    g.addNode({
      id: 'sumAB', label: 'sumAB', unit: '', domain: 'test', honesty: 'exact', honestyNote: '', derivation: 'direct',
      inputs: ['a', 'b'], compute: (i) => i.a + i.b, formula: 'a+b',
    });
    // Changing 'a' to the same value it already has should produce zero steps.
    const steps = g.setParameter('a', 1);
    expect(steps).toEqual([]);
  });

  it('rejects a node whose inputs reference a non-existent id (structurally prevents cycles/dangling edges)', () => {
    const g = new ModelGraph();
    expect(() =>
      g.addNode({
        id: 'orphan', label: 'orphan', unit: '', domain: 'test', honesty: 'exact', honestyNote: '', derivation: 'direct',
        inputs: ['does-not-exist'], compute: () => 0, formula: 'x',
      }),
    ).toThrow();
  });

  it('rejects duplicate node ids', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('x'), 1);
    expect(() => g.addNode(paramNode('x'), 2)).toThrow();
  });

  it('rejects setParameter on a derived (non-parameter) node', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('x'), 1);
    g.addNode({
      id: 'y', label: 'y', unit: '', domain: 'test', honesty: 'exact', honestyNote: '', derivation: 'direct',
      inputs: ['x'], compute: (i) => i.x + 1, formula: 'x+1',
    });
    expect(() => g.setParameter('y', 9)).toThrow();
  });

  it('notifies subscribers exactly once per setParameter call with a non-empty step list', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('x'), 1);
    g.addNode({
      id: 'y', label: 'y', unit: '', domain: 'test', honesty: 'exact', honestyNote: '', derivation: 'direct',
      inputs: ['x'], compute: (i) => i.x * 10, formula: '10x',
    });
    const listener = vi.fn();
    const unsubscribe = g.subscribe(listener);
    g.setParameter('x', 2);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    g.setParameter('x', 3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a diamond dependency (two paths converging) only recomputes the shared descendant once', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('x'), 2);
    g.addNode({ id: 'left', label: 'left', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['x'], compute: (i) => i.x + 1, formula: '' });
    g.addNode({ id: 'right', label: 'right', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['x'], compute: (i) => i.x * 2, formula: '' });
    g.addNode({ id: 'sum', label: 'sum', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['left', 'right'], compute: (i) => i.left + i.right, formula: '' });

    const steps = g.setParameter('x', 5);
    const sumSteps = steps.filter((s) => s.nodeId === 'sum');
    expect(sumSteps).toHaveLength(1);
    expect(g.getValue('sum')).toBe((5 + 1) + (5 * 2));
  });

  it('causedBy records the real upstream inputs that changed (answers "why did this node change")', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('x'), 2);
    g.addNode({ id: 'left', label: 'left', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['x'], compute: (i) => i.x + 1, formula: '' });
    g.addNode({ id: 'right', label: 'right', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['x'], compute: (i) => i.x * 2, formula: '' });
    g.addNode({ id: 'sum', label: 'sum', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['left', 'right'], compute: (i) => i.left + i.right, formula: '' });

    const steps = g.setParameter('x', 5);
    const byId = Object.fromEntries(steps.map((s) => [s.nodeId, s]));
    expect(byId.x.causedBy).toEqual([]); // the changed root itself has no cause in this batch
    expect(byId.left.causedBy).toEqual(['x']);
    expect(byId.right.causedBy).toEqual(['x']);
    // sum changed because BOTH of its inputs changed in the same batch — both recorded, in declared input order.
    expect(byId.sum.causedBy).toEqual(['left', 'right']);
  });

  it('causedBy of a downstream node only lists the inputs that actually changed, not all inputs', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('a'), 1);
    g.addNode(paramNode('b'), 1);
    g.addNode({ id: 'onlyA', label: 'onlyA', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['a'], compute: (i) => i.a * 3, formula: '' });
    g.addNode({ id: 'combo', label: 'combo', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['onlyA', 'b'], compute: (i) => i.onlyA + i.b, formula: '' });

    const steps = g.setParameter('a', 4);
    const combo = steps.find((s) => s.nodeId === 'combo')!;
    // combo depends on onlyA and b, but only onlyA changed (b is untouched) — so only onlyA is the cause.
    expect(combo.causedBy).toEqual(['onlyA']);
  });

  it('getParameterNodeIds / getParameterSnapshot expose exactly the roots and their current values', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('a'), 2);
    g.addNode(paramNode('b'), 7);
    g.addNode({ id: 'derived', label: 'd', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['a'], compute: (i) => i.a + 1, formula: '' });
    expect(new Set(g.getParameterNodeIds())).toEqual(new Set(['a', 'b']));
    expect(g.getParameterSnapshot()).toEqual({ a: 2, b: 7 });
    g.setParameter('a', 5);
    expect(g.getParameterSnapshot()).toEqual({ a: 5, b: 7 });
  });

  it('applyParameterSnapshot sets multiple parameters in one batch and recomputes a shared child exactly once', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('a'), 1);
    g.addNode(paramNode('b'), 1);
    g.addNode({ id: 'sum', label: 'sum', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['a', 'b'], compute: (i) => i.a + i.b, formula: '' });

    const steps = g.applyParameterSnapshot({ a: 3, b: 4 });
    expect(g.getValue('sum')).toBe(7);
    const sumSteps = steps.filter((s) => s.nodeId === 'sum');
    expect(sumSteps).toHaveLength(1);
    // sum changed because BOTH a and b changed in this snapshot batch.
    expect(sumSteps[0].causedBy).toEqual(['a', 'b']);
  });

  it('applyParameterSnapshot ignores unknown and non-parameter keys silently', () => {
    const g = new ModelGraph();
    g.addNode(paramNode('a'), 1);
    g.addNode({ id: 'd', label: 'd', unit: '', domain: 't', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs: ['a'], compute: (i) => i.a + 1, formula: '' });
    // 'd' is not a parameter, 'ghost' does not exist — both ignored; only 'a' applies.
    const steps = g.applyParameterSnapshot({ a: 9, d: 999, ghost: 1 });
    expect(g.getValue('a')).toBe(9);
    expect(g.getValue('d')).toBe(10); // recomputed from a, not from the ignored 999
    expect(steps.some((s) => s.nodeId === 'a')).toBe(true);
  });
});
