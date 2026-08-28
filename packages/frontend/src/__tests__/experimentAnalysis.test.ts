import { describe, expect, it } from 'vitest';
import { analyzeTrend, analyzeRun, paramRangeSummary } from '../core/experimentAnalysis';
import type { RunSample } from '../core/experimentRun';
import type { ParamDef } from '../core/types';

function makeSamples(values: Record<string, number[]>): RunSample[] {
  const keys = Object.keys(values);
  const n = values[keys[0]].length;
  return Array.from({ length: n }, (_, i) => ({
    t: i,
    stats: Object.fromEntries(keys.map((k) => [k, values[k][i]])),
  }));
}

describe('analyzeTrend', () => {
  it('detects a rising trend', () => {
    const samples = makeSamples({ x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    const t = analyzeTrend(samples, 'x')!;
    expect(t.trend).toBe('rising');
    expect(t.min).toBe(1);
    expect(t.max).toBe(10);
  });

  it('detects a falling trend', () => {
    const samples = makeSamples({ x: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] });
    expect(analyzeTrend(samples, 'x')!.trend).toBe('falling');
  });

  it('detects a stable (flat) series', () => {
    const samples = makeSamples({ x: [5, 5, 5, 5, 5, 5] });
    const t = analyzeTrend(samples, 'x')!;
    expect(t.trend).toBe('stable');
    expect(t.relativeVariance).toBe(0);
  });

  it('a palindromic series with no net direction is stable, not rising/falling', () => {
    // A palindrome has zero least-squares slope by construction: pairing index i with
    // n-1-i gives equal y but opposite (x-xMean), so every term cancels exactly.
    const samples = makeSamples({ x: [1, 2, 3, 4, 5, 5, 4, 3, 2, 1] });
    expect(analyzeTrend(samples, 'x')!.trend).toBe('stable');
  });

  it('returns null with fewer than 2 finite values', () => {
    expect(analyzeTrend(makeSamples({ x: [5] }), 'x')).toBeNull();
    expect(analyzeTrend([], 'x')).toBeNull();
  });

  it('uses sample timestamps rather than array indexes for uneven sampling', () => {
    const samples: RunSample[] = [
      { t: 0, stats: { x: 0 } },
      { t: 1, stats: { x: 1 } },
      { t: 100, stats: { x: 2 } },
    ];
    expect(analyzeTrend(samples, 'x')?.trend).toBe('rising');
  });
});

describe('analyzeRun', () => {
  it('asks for more data with fewer than 3 samples', () => {
    const blocks = analyzeRun(makeSamples({ x: [1, 2] }));
    expect(blocks[0].title).toMatch(/Za mało danych/);
  });

  it('flags a completely flat run', () => {
    const samples = makeSamples({ x: [5, 5, 5, 5, 5], y: [1, 1, 1, 1, 1] });
    const blocks = analyzeRun(samples);
    expect(blocks.some((b) => b.title === 'Przebieg jest płaski')).toBe(true);
  });

  it('reports a rising stat with its real min/max/mean', () => {
    const samples = makeSamples({ x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    const blocks = analyzeRun(samples);
    const block = blocks.find((b) => b.title.startsWith('x:'));
    expect(block?.title).toContain('rośnie');
    expect(block?.body).toContain('1');
    expect(block?.body).toContain('10');
  });

  it('flags non-finite values as an inconsistency, not a silent crash', () => {
    const samples: RunSample[] = [
      { t: 0, stats: { x: 1 } },
      { t: 1, stats: { x: NaN } },
      { t: 2, stats: { x: 3 } },
    ];
    const blocks = analyzeRun(samples);
    expect(blocks.some((b) => b.title.includes('Niespójność') && b.kind === 'warning')).toBe(true);
  });

  it('flags two strongly correlated rising stats as a testable hypothesis', () => {
    const samples = makeSamples({
      x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      y: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20], // y = 2x, perfectly correlated
    });
    const blocks = analyzeRun(samples);
    const hypothesis = blocks.find((b) => b.kind === 'hypothesis');
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.body).toMatch(/korelacj/i);
  });

  it('does not claim a hypothesis when stats are uncorrelated', () => {
    const samples = makeSamples({
      x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // rising
      y: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], // flat — analyzeTrend excludes it from "dynamic"
    });
    const blocks = analyzeRun(samples);
    expect(blocks.some((b) => b.kind === 'hypothesis')).toBe(false);
  });

  it('reports a stabilized run when nothing is flagged', () => {
    // stable but with some noise (not the all-flat special case) shouldn't happen often,
    // but a single stat with tiny noise around a mean should still say "ustabilizowany"
    const samples = makeSamples({ x: [5.001, 4.999, 5.002, 4.998, 5.0, 5.001] });
    const blocks = analyzeRun(samples);
    expect(blocks.some((b) => b.title.includes('ustabilizowany') || b.title.includes('płaski'))).toBe(true);
  });
});

describe('paramRangeSummary', () => {
  it('lists slider params with their range and current value', () => {
    const defs: ParamDef[] = [
      { key: 'h0', label: "Stała Hubble'a", type: 'slider', min: 50, max: 100, step: 1, default: 70, unit: 'km/s/Mpc' },
    ];
    const block = paramRangeSummary(defs, { h0: 70 });
    expect(block.body).toContain('50–100');
    expect(block.body).toContain('km/s/Mpc');
    expect(block.body).toContain('70');
  });

  it('describes toggles as on/off', () => {
    const defs: ParamDef[] = [{ key: 'flag', label: 'Włącznik', type: 'toggle', default: false }];
    const block = paramRangeSummary(defs, { flag: true });
    expect(block.body).toContain('włączone');
  });
});



describe('analyzeRun: observation completeness', () => {
  it('warns when a stat is missing from part of the recorded series', () => {
    const samples: RunSample[] = [
      { t: 0, stats: { x: 1 } },
      { t: 1, stats: {} },
      { t: 2, stats: { x: 3 } },
      { t: 3, stats: { x: 4 } },
    ];
    const blocks = analyzeRun(samples);
    expect(blocks.some((b) => b.title === 'Niespójność: niepełna seria obserwacji' && b.kind === 'warning')).toBe(true);
  });
});



describe('analyzeRun: jump detection preserves sample adjacency', () => {
  it('does not compare values across a missing sample as if they were consecutive', () => {
    const samples: RunSample[] = [
      { t: 0, stats: { x: 0 } },
      { t: 1, stats: { x: 1 } },
      { t: 2, stats: {} },
      { t: 3, stats: { x: 100 } },
    ];
    const blocks = analyzeRun(samples);
    expect(blocks.some((b) => b.title === 'Skokowa zmiana w x')).toBe(false);
  });
});

describe('analyzeRun: union of observed keys', () => {
  it('reports a stat that disappears in the final sample as incomplete', () => {
    const samples: RunSample[] = [
      { t: 0, stats: { x: 1 } },
      { t: 1, stats: { x: 2 } },
      { t: 2, stats: {} },
    ];
    const blocks = analyzeRun(samples);
    expect(blocks.some((b) => b.title === 'Niespójność: niepełna seria obserwacji' && b.body.includes('x'))).toBe(true);
  });
});

describe('analyzeRun: missing observables', () => {
  it('does not call an empty stats series stabilized', () => {
    const samples: RunSample[] = [
      { t: 0, stats: {} },
      { t: 1, stats: {} },
      { t: 2, stats: {} },
    ];
    const blocks = analyzeRun(samples);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toBe('Brak obserwowalnych wielkości');
    expect(blocks[0].kind).toBe('warning');
  });
});
