import { describe, expect, it } from 'vitest';
import { fetchNaturalChEMBLActivities, resolveNaturalFunctionalReplacement, resolveNaturalFunctionalReplacementFromSources, resolveReferenceProfile } from '../core/biotechData/naturalReplacement';

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

  it('keeps ChEMBL measurement types separate and records assay context/quality', async () => {
    let call = 0;
    const activities = await fetchNaturalChEMBLActivities([{ name: 'inosine', cid: 6021, formula: 'C10H12N4O5', smiles: 'C', inchiKey: 'KEY', molecularWeight: '268.23', source: 'PubChem', sourceVersion: 'PubChem CID 6021', retrievedAt: '2026-08-29' }], async () => new Response(JSON.stringify(call++ === 0 ? { molecules: [{ molecule_chembl_id: 'CHEMBL-X' }] } : { activities: [{ activity_id: 1, assay_chembl_id: 'CHEMBL-ASSAY', target_chembl_id: 'CHEMBL-TARGET', standard_type: 'Ki', standard_relation: '=', standard_value: '12.5', standard_units: 'nM', assay_description: 'human receptor binding', assay_organism: 'Homo sapiens', assay_type: 'B' }, { activity_id: 2, assay_chembl_id: 'CHEMBL-ASSAY-2', target_chembl_id: 'CHEMBL-TARGET', standard_type: 'EC50', standard_relation: '>', standard_value: '3', standard_units: 'uM', assay_description: 'cell response' }] }), { status: 200 }));
    expect(activities).toHaveLength(2);
    expect(activities.map((activity) => activity.type)).toEqual(['Ki', 'EC50']);
    expect(activities[0]?.assayQuality).toBe('HIGH');
    expect(activities[0]?.targetId).toBe('chembl:target:CHEMBL-TARGET');
  });

  it('resolves a PubChem CID without guessing a reference identity', async () => {
    const profile = await resolveReferenceProfile('2519', async () => new Response(JSON.stringify({ PropertyTable: { Properties: [{ CID: 2519, CanonicalSMILES: 'CCO', InChIKey: 'KEY', MolecularFormula: 'C2H6O', MolecularWeight: '46.07' }] } }), { status: 200 }));
    expect(profile).toMatchObject({ status: 'RESOLVED', sourceId: 'pubchem:CID:2519', smiles: 'CCO', inchiKey: 'KEY' });
  });
});
