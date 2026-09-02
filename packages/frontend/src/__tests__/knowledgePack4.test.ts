import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_PACK_4_RECORDS, knowledgePack4EvidenceRefs, KNOWLEDGE_PACK_4_VERSION } from '../core/discovery/molecular/knowledgePack4';

describe('Knowledge Pack #4 critical NMDAR ingestion', () => {
  it('keeps all eight records in the same human recombinant assay family', () => {
    expect(KNOWLEDGE_PACK_4_VERSION).toBe('4.0.0-critical-nmdar-excerpt');
    expect(KNOWLEDGE_PACK_4_RECORDS).toHaveLength(8);
    expect(KNOWLEDGE_PACK_4_RECORDS.every((record) => record.validationStatus === 'VERIFIED')).toBe(true);
    expect(KNOWLEDGE_PACK_4_RECORDS.every((record) => record.comparability === 'SAME_ASSAY_COMPARABLE')).toBe(true);
    expect(new Set(KNOWLEDGE_PACK_4_RECORDS.map((record) => record.pmid))).toEqual(new Set(['19371579']));
  });

  it('preserves exact parameter, value, and unit pairs', () => {
    const find = (compound: string, parameter: string) => KNOWLEDGE_PACK_4_RECORDS.find((record) => record.compound === compound && record.parameter === parameter)!;
    expect(find('Memantine', 'IC50')).toMatchObject({ value: '0.79', unit: 'µM' });
    expect(find('Ketamine', 'IC50')).toMatchObject({ value: '0.71', unit: 'µM' });
    expect(find('Memantine', 'Kon')).toMatchObject({ value: '0.32×10^6', unit: 'M^-1s^-1' });
    expect(find('Ketamine', 'Koff')).toMatchObject({ value: '0.22', unit: 's^-1' });
    expect(find('Memantine', 'delta')).toMatchObject({ value: '0.90', unit: 'dimensionless' });
  });

  it('emits PMID provenance without the incorrect Pack #4 DOI', () => {
    const refs = knowledgePack4EvidenceRefs();
    expect(refs).toHaveLength(8);
    expect(refs.every((ref) => ref.identifier === 'pmid:19371579')).toBe(true);
    expect(refs.every((ref) => ref.establishes.includes('Whole-cell patch-clamp'))).toBe(true);
  });
});
