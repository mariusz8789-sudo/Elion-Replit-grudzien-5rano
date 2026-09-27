import { describe, expect, it } from 'vitest';
import { ASTEX_PREREG, ASTEX_RUNS, imatinibKitCase } from '../core/reviewer/dockingBenchmark';

describe('reviewer docking benchmark (Astex Diverse Set)', () => {
  it('both runs cover all 85 preregistered cases, and failures stay in the denominator', () => {
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

  it('run 2 was produced under the final preregistered protocol and run 1 under an earlier one', () => {
    const [run1, run2] = ASTEX_RUNS;
    expect(run2.protocolFingerprint).toBe(ASTEX_PREREG.protocolFingerprint);
    expect(run1.protocolFingerprint).not.toBe(ASTEX_PREREG.protocolFingerprint);
    expect(ASTEX_PREREG.amendments.length).toBeGreaterThanOrEqual(3);
  });

  it('imatinib in c-KIT (1T46) is in the set', () => {
    for (const run of ASTEX_RUNS) expect(imatinibKitCase(run)).toBeDefined();
  });
});
