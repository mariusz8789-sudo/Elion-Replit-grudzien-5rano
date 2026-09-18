/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Genesis5DManifoldEngine, tartariaSdf, MAX_MANIFOLD_POINTS, type Manifold5DPoint } from './Genesis5DManifoldEngine.js';
import { GenesisEnterpriseCore, telemetryFromSample } from './GenesisEnterpriseCore.js';
import type { ResourceSampler } from '../native/SystemResourceBridge.js';

const clock = { t: 1000, now() { return this.t; } };
const pt = (x: number, y: number, z: number, t = 0, w = 0): Manifold5DPoint => ({ x, y, z, temporalT: t, hyperspaceW: w });
const engine = () => new Genesis5DManifoldEngine(clock);

describe('Genesis5DManifoldEngine — real discrete geometry in R^5', () => {
  it('a straight line has zero curvature, stability exactly 1, rank 1 and a symmetric PSD Gram matrix', () => {
    const line = Array.from({ length: 10 }, (_, i) => pt(i, 2 * i, 0, 3 * i, 0));
    const e = engine().evaluatePath(line);
    expect(e.curvature.mean).toBe(0);
    expect(e.curvature.max).toBe(0);
    expect(e.temporalStabilityIndex).toBe(1);
    expect(e.metricRankLowerBound).toBe(3); // x, y, t move; z and w do not
    expect(e.pathLength).toBeCloseTo(9 * Math.sqrt(1 + 4 + 9), 9);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) expect(e.metricTensor[r * 5 + c]).toBeCloseTo(e.metricTensor[c * 5 + r], 12);
    for (let i = 0; i < 5; i++) expect(e.metricTensor[i * 5 + i]).toBeGreaterThanOrEqual(0);
    expect(e.selfIntersectionFree).toBe(true);
    expect(e.label).toBe('GEOMETRIC_MODEL');
  });

  it('a circle of radius r in the x–y plane has discrete curvature ≈ 1/r at every vertex', () => {
    const r = 4;
    const n = 360;
    const circle = Array.from({ length: n + 1 }, (_, i) => pt(r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n), 0));
    const e = engine().evaluatePath(circle);
    expect(e.curvature.mean).toBeCloseTo(1 / r, 3);
    expect(e.curvature.max).toBeCloseTo(1 / r, 3);
    expect(e.pathLength).toBeCloseTo(2 * Math.PI * r, 1);
    expect(e.temporalStabilityIndex).toBeGreaterThan(0);
    expect(e.temporalStabilityIndex).toBeLessThan(1);
  });

  it('detects a genuine self-intersection (figure-eight) and clears a helix that only looks crossed in projection', () => {
    const figureEight = [pt(0, 0, 0), pt(2, 2, 0), pt(2, 0, 0), pt(0, 2, 0)]; // segment 0 crosses segment 2 at (1,1)
    expect(engine().evaluatePath(figureEight).selfIntersectionFree).toBe(false);
    const helix = Array.from({ length: 40 }, (_, i) => pt(Math.cos(i * 0.5), Math.sin(i * 0.5), i * 0.1)); // separated in z
    expect(engine().evaluatePath(helix).selfIntersectionFree).toBe(true);
  });

  it('the CPU SDF agrees with the shader formula at hand-computed points', () => {
    // origin: floor = 3, columns = |(−3,−3)| − 0.8, dome = |(0,−2.5,0)| − 2 = 0.5 → min = 0.5
    expect(tartariaSdf(0, 0, 0)).toBeCloseTo(0.5, 12);
    // inside the dome centre (0, 2.5, 0): dome = −2 → negative (inside)
    expect(tartariaSdf(0, 2.5, 0)).toBeCloseTo(-2, 12);
    // far below the floor: floor term dominates and is negative
    expect(tartariaSdf(0, -10, 0)).toBeLessThan(0);
    const e = engine().evaluatePath([pt(0, 0, 0), pt(0, 2.5, 0), pt(0, -10, 0)]);
    expect(e.sdf.insideFraction).toBeCloseTo(2 / 3, 12);
    expect(e.sdf.minDistance).toBeLessThan(-2);
  });

  it('provenance is deterministic for the same path and changes with the path; timestamp comes from the Clock', () => {
    const p = [pt(0, 0, 0, 0, 1), pt(1, 1, 1, 1, 2), pt(2, 0, 1, 2, 3)];
    const a = engine().evaluatePath(p);
    clock.t = 2000;
    const b = engine().evaluatePath(p);
    expect(a.cryptographicProof).toBe(b.cryptographicProof);
    expect(a.manifoldId).toBe(b.manifoldId);
    expect(b.evaluatedAt).toBe(2000);
    const c = engine().evaluatePath([...p, pt(3, 3, 3, 3, 3)]);
    expect(c.cryptographicProof).not.toBe(a.cryptographicProof);
  });

  it('refuses non-finite coordinates and oversized paths', () => {
    expect(() => engine().evaluatePath([pt(Number.NaN, 0, 0)])).toThrow('NON_FINITE_COORDINATE');
    expect(() => engine().evaluatePath(Array.from({ length: MAX_MANIFOLD_POINTS + 1 }, () => pt(0, 0, 0)))).toThrow('TOO_MANY_POINTS');
    const empty = engine().evaluatePath([]);
    expect(empty.pointCount).toBe(0);
    expect(empty.temporalStabilityIndex).toBe(1);
  });
});

describe('GenesisEnterpriseCore — telemetry from the sampler, never from constants', () => {
  const sampler: ResourceSampler = { sample: () => ({ totalMemBytes: 8e9, freeMemBytes: 2e9, loadAvg: [4, 3, 2], cpuCount: 8 }) };
  it('reports exactly the sampled machine values and lists only the modules that ran', () => {
    const core = new GenesisEnterpriseCore(clock, sampler);
    const r = core.executePipeline('NODE-1', [pt(0, 0, 0), pt(1, 0, 0), pt(2, 1, 0)]);
    expect(r.telemetry.cpuCount).toBe(8);
    expect(r.telemetry.totalMemBytes).toBe(8e9);
    expect(r.telemetry.freeMemBytes).toBe(2e9);
    expect(r.telemetry.loadAvg).toEqual([4, 3, 2]);
    expect(r.telemetry.source).toBe('os');
    expect(r.telemetry.pressure).toBeCloseTo(0.5 * 0.75 + 0.5 * 0.5, 12);
    expect(r.modulesExecuted).toEqual(['manifold5d', 'telemetry']);
    expect(r.label).toBe('GEOMETRIC_MODEL');
    expect(r.compositeChecksum).toHaveLength(64);
  });
  it('a different machine sample yields a different checksum (telemetry is part of the receipt)', () => {
    const a = new GenesisEnterpriseCore(clock, sampler).executePipeline('N', [pt(0, 0, 0), pt(1, 0, 0)]);
    const other: ResourceSampler = { sample: () => ({ totalMemBytes: 8e9, freeMemBytes: 1e9, loadAvg: [1, 1, 1], cpuCount: 4 }) };
    const b = new GenesisEnterpriseCore(clock, other).executePipeline('N', [pt(0, 0, 0), pt(1, 0, 0)]);
    expect(a.compositeChecksum).not.toBe(b.compositeChecksum);
    expect(a.manifold.cryptographicProof).toBe(b.manifold.cryptographicProof);
  });
  it('telemetryFromSample never invents a value', () => {
    const t = telemetryFromSample('X', { totalMemBytes: 1, freeMemBytes: 1, loadAvg: [0, 0, 0], cpuCount: 1 }, 5);
    expect(t.pressure).toBe(0);
    expect(t.sampledAt).toBe(5);
  });
});

describe('iron rules', () => {
  for (const f of ['Genesis5DManifoldEngine.ts', 'GenesisEnterpriseCore.ts']) {
    it(f + ' bez Math.random/Date.now', () => {
      const s = readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
      expect(s).not.toContain('Math.random(');
      expect(s).not.toContain('Date.now(');
    });
  }
});
