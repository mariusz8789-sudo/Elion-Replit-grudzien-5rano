import { describe, expect, it } from 'vitest';
import { ASTEX_PREREG, ASTEX_RUNS, imatinibKitCase } from '../core/reviewer/dockingBenchmark';

describe('reviewer docking benchmark (Astex Diverse Set)', () => {
  it('every run covers all 85 preregistered cases, and failures stay in the denominator', () => {
    const ids = ASTEX_PREREG.cases.map((c) => c.pdbId).sort();
    expect(ids).toHaveLength(85);
    for (const run of ASTEX_RUNS) {
      expect(run.cases.map((c) => c.pdbId).sort()).toEqual(ids);
      expect(run.summary.cases).toBe(85);
      expect(run.summary.successes).toBe(run.cases.filter((c) => c.success).length);
      expect(run.summary.successes).toBe(run.cases.filter((c) => c.rmsdA !== undefined && c.rmsdA < 2).length);
      expect(run.summary.docked + run.summary.preparationOrDockingFailures).toBe(85);
      expect(run.summary.successRate).toBeCloseTo(run.summary.successes / 85, 4);
    }
  });

  it('run 3 was produced under the current preregistered protocol and runs 1 and 2 under earlier ones', () => {
    const [run1, run2, run3] = ASTEX_RUNS;
    expect(run3.protocolFingerprint).toBe(ASTEX_PREREG.protocolFingerprint);
    expect(run2.protocolFingerprint).not.toBe(ASTEX_PREREG.protocolFingerprint);
    expect(run1.protocolFingerprint).not.toBe(ASTEX_PREREG.protocolFingerprint);
    expect(new Set(ASTEX_RUNS.map((r) => r.protocolFingerprint)).size).toBe(3);
    expect(ASTEX_PREREG.amendments.length).toBeGreaterThanOrEqual(4);
  });

  it('imatinib in c-KIT (1T46) is in the set', () => {
    for (const run of ASTEX_RUNS) expect(imatinibKitCase(run)).toBeDefined();
  });
});
