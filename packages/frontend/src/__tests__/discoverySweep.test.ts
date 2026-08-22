import { describe, expect, it } from 'vitest';
import { runParameterSweep, SWEEPABLE_PARAMETERS, NON_SWEEPABLE_PARAMETERS } from '../core/discovery/discoverySweep';
import { runMultiSeed, median, STATISTICAL_NOTE } from '../core/discovery/discoveryMultiRun';

const ic = { nAgents: 160, initialInfected: 5, seed: 777, days: 40, stepsPerDay: 4 };
const tight = { totalBeds: 4, icuBeds: 1, icuShareOfAdmissions: 0.22 };
const sweep = (over = {}) => runParameterSweep({
  question: 'Jak restrykcje wpływają na szczyt zakażeń?',
  scenario: 'BASELINE' as const,
  parameter: 'restrictions',
  values: [0, 0.2, 0.4, 0.6, 0.8],
  initialConditions: ic,
  ...over,
});

describe('Parameter sweep — one real run per point', () => {
  it('executes every point and gives each its own fingerprint', () => {
    const s = sweep();
    expect(s.status).toBe('COMPLETED');
    expect(s.points).toHaveLength(5);
    expect(s.points.every((p) => p.status === 'COMPLETED')).toBe(true);
    const fingerprints = new Set(s.points.map((p) => p.runFingerprint));
    // Pięć różnych wartości musi dać pięć różnych przebiegów, nie pięć kopii.
    expect(fingerprints.size).toBe(5);
  });

  it('every point carries a real summary — no interpolated values', () => {
    for (const p of sweep().points) {
      expect(p.summary).not.toBeNull();
      expect(p.inputFingerprint).toBeTruthy();
      expect(Number.isFinite(p.summary!.peakInfectious)).toBe(true);
    }
  });

  it('is deterministic — the same sweep repeats exactly', () => {
    const a = sweep();
    const b = sweep();
    expect(b.sweepId).toBe(a.sweepId);
    expect(b.points.map((p) => p.runFingerprint)).toEqual(a.points.map((p) => p.runFingerprint));
  });

  it('says so when the sweep overrides a lever the scenario itself declares', () => {
    expect(sweep().scenarioOverrideNotice).toContain('nadpisuje');
    // Pojemność szpitala nie jest deklarowana przez scenariusz BASELINE.
    expect(sweep({ parameter: 'totalBeds', values: [2, 4, 8], hospitalCapacity: tight }).scenarioOverrideNotice).toBeUndefined();
  });

  it('reports monotonicity from the executed points only', () => {
    const beds = sweep({ parameter: 'totalBeds', values: [2, 4, 8, 16, 32], hospitalCapacity: tight });
    const unmet = beds.monotonicity.find((m) => m.metric === 'totalUnmetCareDays')!;
    expect(unmet.values).toHaveLength(5);
    expect(unmet.verdict).toBe('DECREASING');
    expect(unmet.values[0]).toBeGreaterThan(0);
    expect(unmet.values[4]).toBe(0);
  });

  it('calls a non-monotonic series non-monotonic instead of smoothing it', () => {
    const peak = sweep().monotonicity.find((m) => m.metric === 'peakInfectious')!;
    // Przy jednym ziarnie zależność od restrykcji nie jest monotoniczna i tak
    // musi zostać zaraportowana.
    expect(peak.verdict).toBe('NON_MONOTONIC');
  });

  it('needs at least three points before judging monotonicity', () => {
    const s = sweep({ values: [0, 0.5] });
    expect(s.monotonicity.every((m) => m.verdict === 'INSUFFICIENT_POINTS')).toBe(true);
  });
});

describe('Parameter sweep — invalid parameters and values', () => {
  it('refuses an isolation intensity sweep because the model has no such dial', () => {
    const s = sweep({ parameter: 'isolate', values: [0.1, 0.2, 0.3, 0.4, 0.5] });
    expect(s.status).toBe('NOT_MODELED');
    expect(s.points).toEqual([]);
    expect(s.message).toContain('włączona/wyłączona');
  });

  it('refuses to sweep the seed and points at multi-run instead', () => {
    const s = sweep({ parameter: 'seed', values: [1, 2, 3] });
    expect(s.status).toBe('NOT_MODELED');
    expect(s.message).toContain('multi-run');
  });

  it('refuses a parameter the model does not have', () => {
    const s = sweep({ parameter: 'vaccineCoverage', values: [0.1, 0.5] });
    expect(s.status).toBe('BLOCKED_INVALID_PARAMETER');
    expect(s.message).toContain('restrictions');
  });

  it('refuses a sweep with fewer than two values', () => {
    expect(sweep({ values: [0.5] }).status).toBe('BLOCKED_NOT_ENOUGH_POINTS');
  });

  it('marks an out-of-range value invalid instead of clamping it silently', () => {
    const s = sweep({ values: [0, 0.5, 1.4] });
    expect(s.status).toBe('COMPLETED');
    const bad = s.points[2];
    expect(bad.status).toBe('INVALID_VALUE');
    expect(bad.summary).toBeNull();
    expect(bad.runFingerprint).toBeNull();
    expect(bad.reason).toContain('poza dopuszczalnym zakresem');
  });

  it('rejects a fractional value for an integer parameter', () => {
    const s = sweep({ parameter: 'icuBeds', values: [2, 3.5, 4], hospitalCapacity: tight });
    expect(s.points[1].status).toBe('INVALID_VALUE');
    expect(s.points[1].reason).toContain('całkowitą');
  });

  it('excludes non-executed points from the monotonicity series', () => {
    const s = sweep({ parameter: 'totalBeds', values: [2, 4, 8, -5], hospitalCapacity: tight });
    expect(s.points[3].status).toBe('INVALID_VALUE');
    expect(s.monotonicity[0].values).toHaveLength(3);
  });

  it('documents where each bound comes from and why a parameter is excluded', () => {
    for (const def of Object.values(SWEEPABLE_PARAMETERS)) {
      expect(def.boundsSource.length).toBeGreaterThan(20);
      expect(def.max).toBeGreaterThan(def.min);
    }
    for (const reason of Object.values(NON_SWEEPABLE_PARAMETERS)) expect(reason.length).toBeGreaterThan(30);
  });
});

describe('Multi-run — many seeds, honest dispersion', () => {
  const multi = (over = {}) => runMultiSeed({
    question: 'Jak bardzo wynik zależy od losowego przebiegu świata?',
    scenario: 'BASELINE' as const,
    seeds: [1, 2, 3, 4, 5, 6, 7],
    initialConditions: { nAgents: 160, initialInfected: 5, days: 40, stepsPerDay: 4 },
    ...over,
  });

  it('runs one real simulation per seed', () => {
    const m = multi();
    expect(m.status).toBe('COMPLETED');
    expect(m.runs).toHaveLength(7);
    expect(m.runs.every((r) => r.status === 'COMPLETED')).toBe(true);
    expect(new Set(m.runs.map((r) => r.runFingerprint)).size).toBe(7);
  });

  it('reports min, max, median and the full distribution', () => {
    const peak = multi().dispersion.find((d) => d.metric === 'peakInfectious')!;
    expect(peak.distribution).toHaveLength(7);
    expect(peak.min).toBe(Math.min(...peak.distribution));
    expect(peak.max).toBe(Math.max(...peak.distribution));
    expect(peak.median).toBe(median(peak.distribution));
    expect(peak.range).toBe(peak.max - peak.min);
    // Ziarna faktycznie się różnią — inaczej ten raport byłby bezwartościowy.
    expect(peak.max).toBeGreaterThan(peak.min);
  });

  it('never calls the dispersion a confidence interval', () => {
    const m = multi();
    expect(m.statisticalNote).toBe(STATISTICAL_NOTE);
    expect(m.statisticalNote).toContain('nie jest przedział ufności');
    expect(JSON.stringify(m).toLowerCase()).not.toContain('confidence');
  });

  it('is deterministic across repeats', () => {
    expect(multi().dispersion).toEqual(multi().dispersion);
  });

  it('refuses duplicate seeds that would fake a narrow spread', () => {
    const m = multi({ seeds: [1, 1, 2] });
    expect(m.status).toBe('BLOCKED_DUPLICATE_SEEDS');
    expect(m.runs).toEqual([]);
  });

  it('refuses a single seed — there is no dispersion to report', () => {
    expect(multi({ seeds: [1] }).status).toBe('BLOCKED_NOT_ENOUGH_SEEDS');
  });

  it('median handles an even count without inventing a value', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});
