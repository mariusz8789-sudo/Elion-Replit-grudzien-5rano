import { describe, it, expect } from 'vitest';
import { compareEpidemic, defaultComparison, type ModelConfig } from '../core/epidemic/compare';
import { DEFAULT_EPIDEMIC, type EpidemicParams } from '../core/epidemic/sir';

const cfg = (label: string, over: Partial<EpidemicParams>): ModelConfig => ({
  label, params: { ...DEFAULT_EPIDEMIC, population: 100_000, initialInfected: 50, ...over },
});

describe('model comparison: reuses the real engine, computes honest diffs', () => {
  it('higher R0 (B) yields a strictly higher peak than lower R0 (A)', () => {
    const r = compareEpidemic(cfg('A', { model: 'SIR', r0: 1.5 }), cfg('B', { model: 'SIR', r0: 3 }), 200);
    expect(r.diff.peakInfected.b).toBeGreaterThan(r.diff.peakInfected.a);
    expect(r.diff.peakInfected.delta).toBeGreaterThan(0);
    expect(r.diff.peakInfected.pct).not.toBeNull();
    expect(r.diff.peakInfected.pct!).toBeGreaterThan(0);
  });

  it('delta and pct are consistent with a and b', () => {
    const r = compareEpidemic(cfg('A', { r0: 2 }), cfg('B', { r0: 4 }), 150);
    const d = r.diff.totalInfected;
    expect(d.delta).toBeCloseTo(d.b - d.a, 6);
    expect(d.pct!).toBeCloseTo(((d.b - d.a) / d.a) * 100, 6);
  });

  it('pct is null when the baseline metric is zero (no divide-by-zero lie)', () => {
    // SEIR (no deaths) → finalDead == 0 for both, so pct must be null, not Infinity/NaN.
    const r = compareEpidemic(cfg('A', { model: 'SEIR', r0: 2 }), cfg('B', { model: 'SEIR', r0: 3 }), 200);
    expect(r.diff.finalDead.a).toBe(0);
    expect(r.diff.finalDead.pct).toBeNull();
  });

  it('is deterministic — identical configs give identical results', () => {
    const a = compareEpidemic(cfg('A', { r0: 2.2 }), cfg('B', { r0: 2.2 }), 120);
    expect(a.diff.peakInfected.delta).toBe(0);
    expect(a.a.result.peakInfected).toBe(a.b.result.peakInfected);
  });

  it('defaultComparison is SIR R0=1.5 vs R0=3.0 (per directive)', () => {
    const { a, b } = defaultComparison();
    expect(a.params.model).toBe('SIR');
    expect(a.params.r0).toBe(1.5);
    expect(b.params.r0).toBe(3);
  });
});
