import { describe, expect, it } from 'vitest';
import { sphericalNodeLayout, nodeColor } from '../core/three/genesisPulseScene';

describe('Genesis Pulse ambient scene — pure layout math (no WebGL)', () => {
  it('sphericalNodeLayout places exactly `count` points, each at the requested radius', () => {
    const points = sphericalNodeLayout(12, 2.4);
    expect(points).toHaveLength(12);
    for (const p of points) {
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      expect(r).toBeCloseTo(2.4, 5);
    }
  });

  it('sphericalNodeLayout is deterministic (same count/radius -> identical layout)', () => {
    expect(sphericalNodeLayout(9, 3)).toEqual(sphericalNodeLayout(9, 3));
  });

  it('sphericalNodeLayout handles zero/negative count without throwing', () => {
    expect(sphericalNodeLayout(0, 2)).toEqual([]);
    expect(sphericalNodeLayout(-3, 2)).toEqual([]);
  });

  it('nodeColor cycles through a fixed, deterministic palette', () => {
    const first = nodeColor(0);
    const wrapped = nodeColor(4); // palette has 4 entries
    expect(wrapped).toBe(first);
    expect(new Set([nodeColor(0), nodeColor(1), nodeColor(2), nodeColor(3)]).size).toBe(4);
  });
});
