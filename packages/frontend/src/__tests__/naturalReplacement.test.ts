import { describe, expect, it } from 'vitest';
import { resolveNaturalFunctionalReplacement, resolveNaturalFunctionalReplacementFromSources } from '../core/biotechData/naturalReplacement';

describe('Natural Functional Replacement resolver', () => {
  it('resolves a known A1 reference against the three real pinned reports', () => {
    const result = resolveNaturalFunctionalReplacement({ referenceCompound: 'caffeine', target: 'A1' });
    expect(result.status).toBe('RESOLVED');
    expect(result.reports).toHaveLength(12);
    expect(result.reports.every((report) => report.clinicalEfficacy === 'UNKNOWN')).toBe(true);
    expect(result.reason).toMatch(/not.*zamiennikiem|nie.*zamiennik/i);
  });

  it('exposes an explicit ADME/PK/Tox state for every real report', () => {
    const result = resolveNaturalFunctionalReplacement({ referenceCompound: 'caffeine', target: 'A1' });
    expect(result.reports.every((report) => report.admeProfile?.status)).toBe(true);
    expect(result.reports.every((report) => report.admeProfile?.metrics.some((metric) => metric.name === 'ADME/PK/Tox') || report.admeProfile?.metrics.length)).toBe(true);
  });

  it('blocks an unsupported reference or target instead of inventing candidates', () => {
    const result = resolveNaturalFunctionalReplacement({ referenceCompound: 'unknown controlled compound', target: 'unknown receptor' });
    expect(result.status).toBe('BLOCKED');
    expect(result.reports).toEqual([]);
    expect(result.reason).toMatch(/Brak kompatybilnego pinned reference profile/);
  });

  it('admits only schema-valid records returned by the bounded source probe', async () => {
    const result = await resolveNaturalFunctionalReplacementFromSources({ referenceCompound: 'caffeine', target: 'A1' }, async () => new Response(JSON.stringify({ PropertyTable: { Properties: [{ CanonicalSMILES: 'C', InChIKey: 'X', MolecularFormula: 'CH4', MolecularWeight: '16.04' }] } }), { status: 200 }));
    expect(result.status).toBe('RESOLVED');
    expect(result.reason).toMatch(/realnych rekordów/);
    expect(result.reports.some((report) => report.uncertainty.includes('formula CH4'))).toBe(true);
  });
});
