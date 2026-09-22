import { describe, expect, it } from 'vitest';
import {
  chronologyProtectionLabel,
  explainParadoxType,
  gravityWellPotentialField,
  validateCausalityGraph,
  wormholeEmbeddingGeometry,
  wormholeScientificClaim,
  type CausalityGraph,
} from '../core/spacetime/spacetimeVisualization';

describe('gravityWellPotentialField', () => {
  it('produces a real Newtonian potential grid, deepest at the center, labeled MODEL', () => {
    const field = gravityWellPotentialField({ massKg: 1.989e30, gridHalfExtentM: 2e9, gridSamples: 9, softeningM: 1e7 });
    expect(field.label).toBe('MODEL');
    expect(field.points.length).toBe(9 * 9);
    const center = field.points.reduce((best, p) => (Math.hypot(p.x, p.z) < Math.hypot(best.x, best.z) ? p : best));
    const corner = field.points.reduce((best, p) => (Math.hypot(p.x, p.z) > Math.hypot(best.x, best.z) ? p : best));
    expect(center.normalizedDepth).toBeGreaterThan(corner.normalizedDepth);
  });

  it('rejects invalid inputs rather than fabricating a field', () => {
    expect(() => gravityWellPotentialField({ massKg: 0, gridHalfExtentM: 1, gridSamples: 5, softeningM: 1 })).toThrow();
    expect(() => gravityWellPotentialField({ massKg: 1, gridHalfExtentM: 1, gridSamples: 5, softeningM: 0 })).toThrow();
  });

  it('is deterministic', () => {
    const a = gravityWellPotentialField({ massKg: 5e24, gridHalfExtentM: 1e6, gridSamples: 5, softeningM: 1e4 });
    const b = gravityWellPotentialField({ massKg: 5e24, gridHalfExtentM: 1e6, gridSamples: 5, softeningM: 1e4 });
    expect(a).toEqual(b);
  });
});

describe('wormholeEmbeddingGeometry + wormholeScientificClaim', () => {
  it('generates a symmetric throat embedding and never claims real traversability', () => {
    const points = wormholeEmbeddingGeometry({ throatRadius: 2, radialExtent: 12, radialSamples: 16, angularSamples: 24 });
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((p) => p.r >= 2)).toBe(true);
    const claim = wormholeScientificClaim();
    expect(claim.label).toBe('HYPOTHESIS');
    expect(claim.statement).toMatch(/not experimental evidence/);
  });

  it('rejects a degenerate throat', () => {
    expect(() => wormholeEmbeddingGeometry({ throatRadius: 0, radialExtent: 5, radialSamples: 4, angularSamples: 8 })).toThrow();
    expect(() => wormholeEmbeddingGeometry({ throatRadius: 5, radialExtent: 5, radialSamples: 4, angularSamples: 8 })).toThrow();
  });
});

describe('validateCausalityGraph', () => {
  it('accepts a forward-only causal graph', () => {
    const graph: CausalityGraph = {
      nodes: [{ id: 'a', time: 0, label: 'A' }, { id: 'b', time: 1, label: 'B' }],
      edges: [{ from: 'a', to: 'b', relation: 'CAUSES' }],
    };
    expect(validateCausalityGraph(graph)).toEqual({ valid: true, issues: [] });
  });

  it('flags a backward-in-time CAUSES edge', () => {
    const graph: CausalityGraph = {
      nodes: [{ id: 'a', time: 5, label: 'A' }, { id: 'b', time: 1, label: 'B' }],
      edges: [{ from: 'a', to: 'b', relation: 'CAUSES' }],
    };
    const result = validateCausalityGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/backward causal edge/);
  });

  it('flags a dangling edge referencing a missing node', () => {
    const graph: CausalityGraph = { nodes: [{ id: 'a', time: 0, label: 'A' }], edges: [{ from: 'a', to: 'missing', relation: 'CORRELATES' }] };
    expect(validateCausalityGraph(graph).valid).toBe(false);
  });

  it('does not flag a backward CONSTRAINS/CORRELATES edge — only CAUSES is time-ordered', () => {
    const graph: CausalityGraph = {
      nodes: [{ id: 'a', time: 5, label: 'A' }, { id: 'b', time: 1, label: 'B' }],
      edges: [{ from: 'a', to: 'b', relation: 'CORRELATES' }],
    };
    expect(validateCausalityGraph(graph).valid).toBe(true);
  });
});

describe('explainParadoxType', () => {
  it('returns a distinct, labeled explanation for each of the four kinds', () => {
    for (const kind of ['GRANDFATHER', 'BOOTSTRAP', 'INFORMATION_LOOP', 'CONSISTENCY'] as const) {
      const result = explainParadoxType(kind);
      expect(result.kind).toBe(kind);
      expect(result.label).toBe('HYPOTHESIS');
      expect(result.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('chronologyProtectionLabel', () => {
  it('reports NO_CTC_IN_MODEL when the caller declares no closed timelike curve', () => {
    expect(chronologyProtectionLabel(false).status).toBe('NO_CTC_IN_MODEL');
  });

  it('reports HYPOTHETICAL_CHRONOLOGY_RISK when the caller declares one, and never claims real time travel', () => {
    const result = chronologyProtectionLabel(true);
    expect(result.status).toBe('HYPOTHETICAL_CHRONOLOGY_RISK');
    expect(result.note).toMatch(/does not prove or enable real time travel/);
  });
});
