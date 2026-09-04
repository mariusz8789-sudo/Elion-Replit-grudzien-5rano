import { describe, expect, it } from 'vitest';
import { ModelGraph, type ModelNodeDef } from '../core/modelGraph/graph';
import { propagateProvenance, weakerProvenance } from '../core/engineeringGraph/provenance';
import { sensitivityRanking, measurementRecommendations } from '../core/engineeringGraph/sensitivity';
import { formatEngineeringValue, isComputed, representativeScalar, scalar, range } from '../core/engineeringGraph/valueModel';
import { EngineeringModel } from '../core/engineeringGraph/EngineeringModel';

function node(id: string, inputs: string[], compute: (i: Record<string, number>) => number): ModelNodeDef {
  return { id, label: id, unit: '', domain: 'eng', honesty: 'exact', honestyNote: '', derivation: 'direct', inputs, compute, formula: '' };
}

function paramGraph(): ModelGraph {
  const g = new ModelGraph();
  g.addNode(node('a', [], (i) => i.a ?? 0), 2);
  g.addNode(node('b', [], (i) => i.b ?? 0), 3);
  g.addNode(node('mid', ['a'], (i) => i.a * 10));
  g.addNode(node('out', ['mid', 'b'], (i) => i.mid + i.b));
  return g;
}

describe('valueModel', () => {
  it('scalar/range are computed; distribution/field/timeseries are typed placeholders (not computed)', () => {
    expect(isComputed(scalar(5, 'm'))).toBe(true);
    expect(isComputed(range(5, 4, 6, 'm'))).toBe(true);
    expect(isComputed({ kind: 'distribution', nominal: 5, unit: 'm', computed: false, note: '' })).toBe(false);
    expect(isComputed({ kind: 'field-ref', unit: 'Pa', computed: false, note: '' })).toBe(false);
  });

  it('representativeScalar returns value/nominal, NaN for uncomputed kinds', () => {
    expect(representativeScalar(scalar(7, 'm'))).toBe(7);
    expect(representativeScalar(range(7, 5, 9, 'm'))).toBe(7);
    expect(Number.isNaN(representativeScalar({ kind: 'timeseries-ref', unit: 's', computed: false, note: '' }))).toBe(true);
  });

  it('formats scalar and range distinctly', () => {
    expect(formatEngineeringValue(scalar(1.5, 'm/s'))).toContain('1.5');
    expect(formatEngineeringValue(range(1.5, 1, 2, 'm/s'))).toContain('1–2');
  });
});

describe('provenance propagation', () => {
  it('weakerProvenance returns the lower-ranked one', () => {
    expect(weakerProvenance('measured', 'requires-validation')).toBe('requires-validation');
    expect(weakerProvenance('calculated', 'manufacturer')).toBe('calculated');
  });

  it('a calculated node is capped by its weakest input', () => {
    const g = paramGraph();
    const eff = propagateProvenance(g, {
      parameterProvenance: { a: 'measured', b: 'engineering-estimate' },
      modelProvenance: { mid: 'calculated', out: 'calculated' },
    });
    // 'mid' input 'a' is measured, but mid's OWN model is 'calculated' — a derived
    // result can never be more certain than the model that produced it, so 'calculated'.
    expect(eff.get('mid')!.provenance).toBe('calculated');
    // 'out' depends on mid(calculated) and b(engineering-estimate) -> capped at the weakest, engineering-estimate
    expect(eff.get('out')!.provenance).toBe('engineering-estimate');
  });

  it('a node cannot be more certain than its own model provenance', () => {
    const g = paramGraph();
    const eff = propagateProvenance(g, {
      parameterProvenance: { a: 'measured', b: 'measured' },
      modelProvenance: { mid: 'empirical-model', out: 'calculated' },
    });
    // mid uses an empirical model even though its input is measured -> empirical-model
    expect(eff.get('mid')!.provenance).toBe('empirical-model');
    // out depends on mid(empirical-model) -> cannot exceed empirical-model
    expect(eff.get('out')!.provenance).toBe('empirical-model');
  });

  it('requires-validation propagates as validationLimited to all descendants', () => {
    const g = paramGraph();
    const eff = propagateProvenance(g, {
      parameterProvenance: { a: 'requires-validation', b: 'measured' },
      modelProvenance: {},
    });
    expect(eff.get('a')!.validationLimited).toBe(true);
    expect(eff.get('mid')!.validationLimited).toBe(true); // depends on a
    expect(eff.get('out')!.validationLimited).toBe(true); // depends on mid
    expect(eff.get('b')!.validationLimited).toBe(false); // independent
    expect(eff.get('out')!.limitingInputs).toContain('a');
  });
});

describe('sensitivity (finite-difference elasticity)', () => {
  it('ranks a strongly-controlling parameter above a weakly-controlling one', () => {
    // out = a*10 + b : d out/d a = 10, d out/d b = 1. Elasticities at a=2,b=3,out=23:
    // E_a = (10 * 2/23) = 0.87 ; E_b = (1 * 3/23) = 0.13
    const g = paramGraph();
    const ranking = sensitivityRanking(g, 'out', ['a', 'b']);
    expect(ranking[0].parameterId).toBe('a');
    expect(ranking[0].magnitude).toBeGreaterThan(ranking[1].magnitude);
  });

  it('restores the graph to its original state after ranking (no side effects)', () => {
    const g = paramGraph();
    const before = g.getParameterSnapshot();
    sensitivityRanking(g, 'out', ['a', 'b']);
    expect(g.getParameterSnapshot()).toEqual(before);
  });

  it('generates a measurement recommendation only for weak-provenance AND high-sensitivity params', () => {
    const g = paramGraph();
    const eff = propagateProvenance(g, {
      parameterProvenance: { a: 'engineering-estimate', b: 'engineering-estimate' },
      modelProvenance: {},
    });
    const recs = measurementRecommendations(g, 'out', ['a', 'b'], eff, 'out', (id) => id);
    // 'a' dominates (elasticity ~0.87 > 0.25) and is weak -> recommended.
    // 'b' is weak but low sensitivity (~0.13 < 0.25) -> NOT recommended.
    expect(recs.map((r) => r.parameterId)).toContain('a');
    expect(recs.map((r) => r.parameterId)).not.toContain('b');
    expect(recs[0].message).toContain('Zmierz');
  });

  it('does not recommend measuring a strongly-controlling but well-supported (measured) parameter', () => {
    const g = paramGraph();
    const eff = propagateProvenance(g, {
      parameterProvenance: { a: 'measured', b: 'engineering-estimate' },
      modelProvenance: {},
    });
    const recs = measurementRecommendations(g, 'out', ['a', 'b'], eff, 'out', (id) => id);
    expect(recs.map((r) => r.parameterId)).not.toContain('a'); // dominant but already measured
  });
});

describe('EngineeringModel wrapper', () => {
  it('exposes graph values, provenance, sensitivity, and recommendations together', () => {
    const g = paramGraph();
    const model = new EngineeringModel(g, {
      provenance: {
        parameterProvenance: { a: 'engineering-estimate', b: 'manufacturer' },
        modelProvenance: { mid: 'calculated', out: 'calculated' },
      },
    });
    expect(model.parameterIds().sort()).toEqual(['a', 'b']);
    expect(model.getValue('out')).toBe(2 * 10 + 3);
    expect(model.effectiveProvenance('out').provenance).toBe('engineering-estimate'); // capped by 'a'
    expect(model.valueKind('out')).toBe('scalar'); // default
    const ranking = model.sensitivityRanking('out');
    expect(ranking[0].parameterId).toBe('a');
    const recs = model.measurementRecommendations('out');
    expect(recs.map((r) => r.parameterId)).toContain('a'); // weak + dominant
  });

  it('applyParameterSnapshot flows through to the underlying graph', () => {
    const g = paramGraph();
    const model = new EngineeringModel(g, { provenance: { parameterProvenance: {}, modelProvenance: {} } });
    model.applyParameterSnapshot({ a: 5 });
    expect(model.getValue('mid')).toBe(50);
  });
});
