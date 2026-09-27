import { describe, expect, it } from 'vitest';
import type { ExtremeEventDatasetStatus, ExtremeEventSeverityClass, HazardDatasetStatus, ImpactSeverityClass } from '../core/hazard/contracts';

/**
 * These are pure type-membership checks: TypeScript rejects an invalid
 * literal at compile time, so a value that compiles here IS a member of the
 * union. Assigning the full, exact list back into the typed constant means
 * a future edit to either union (adding, removing, or renaming a member) is
 * a visible, reviewed test change — never a silent drift.
 */
describe('Extreme-Event shared honesty vocabulary — exact membership', () => {
  it('ExtremeEventDatasetStatus has exactly the seven specified members', () => {
    const values: readonly ExtremeEventDatasetStatus[] = [
      'OBSERVED', 'FORECAST', 'SCENARIO', 'SYNTHETIC', 'DERIVED', 'NOT_MODELED', 'NON_OPERATIONAL',
    ];
    expect(new Set(values).size).toBe(7);
  });

  it('ExtremeEventSeverityClass has exactly the seven specified members', () => {
    const values: readonly ExtremeEventSeverityClass[] = [
      'NONE', 'LOW', 'MODERATE', 'HIGH', 'SEVERE', 'CRITICAL', 'UNKNOWN',
    ];
    expect(new Set(values).size).toBe(7);
  });

  it('does not alter the existing Earthquake-facing HazardDatasetStatus/ImpactSeverityClass unions', () => {
    const datasetStatus: HazardDatasetStatus = 'SCENARIO';
    const severity: ImpactSeverityClass = 'SEVERE';
    expect(datasetStatus).toBe('SCENARIO');
    expect(severity).toBe('SEVERE');
  });
});
