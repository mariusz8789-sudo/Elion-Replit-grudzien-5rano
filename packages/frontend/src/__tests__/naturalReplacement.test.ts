import { describe, expect, it } from 'vitest';
import { resolveNaturalFunctionalReplacement } from '../core/biotechData/naturalReplacement';

describe('Natural Functional Replacement resolver', () => {
  it('resolves a known A1 reference against the three real pinned reports', () => {
    const result = resolveNaturalFunctionalReplacement({ referenceCompound: 'caffeine', target: 'A1' });
    expect(result.status).toBe('RESOLVED');
    expect(result.reports).toHaveLength(3);
    expect(result.reports.every((report) => report.clinicalEfficacy === 'UNKNOWN')).toBe(true);
    expect(result.reason).toMatch(/not.*zamiennikiem|nie.*zamiennik/i);
  });

  it('blocks an unsupported reference or target instead of inventing candidates', () => {
    const result = resolveNaturalFunctionalReplacement({ referenceCompound: 'unknown controlled compound', target: 'unknown receptor' });
    expect(result.status).toBe('BLOCKED');
    expect(result.reports).toEqual([]);
    expect(result.reason).toMatch(/Brak kompatybilnego pinned reference profile/);
  });
});
