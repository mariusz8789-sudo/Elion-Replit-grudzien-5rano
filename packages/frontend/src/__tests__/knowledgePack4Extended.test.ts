import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_PACK_4_EXTENDED_RECORDS, listKnowledgePack4ExtendedRecords } from '../core/discovery/molecular/knowledgePack4Extended';

describe('Knowledge Pack #4 extended import', () => {
  it('imports the supplied metabolite and cathinone panel without promoting Kimi statuses', () => {
    expect(listKnowledgePack4ExtendedRecords()).toHaveLength(24);
    expect(KNOWLEDGE_PACK_4_EXTENDED_RECORDS.every((record) => record.validationStatus === 'NOT_EXTRACTED')).toBe(true);
    expect(KNOWLEDGE_PACK_4_EXTENDED_RECORDS.filter((record) => record.comparability === 'SAME_ASSAY_COMPARABLE')).toHaveLength(17);
    expect(KNOWLEDGE_PACK_4_EXTENDED_RECORDS.filter((record) => record.comparability === 'NOT_COMPARABLE')).toHaveLength(7);
  });

  it('preserves separate binding, uptake, release, Ki, IC50 and EC50 records', () => {
    const records = KNOWLEDGE_PACK_4_EXTENDED_RECORDS.filter((record) => record.compound === '4-MMC');
    expect(records.some((record) => record.assayType === 'Binding' && record.parameter === 'Ki')).toBe(true);
    expect(records.some((record) => record.assayType === 'Functional' && record.parameter === 'IC50')).toBe(true);
    expect(records.some((record) => record.assayType === 'Release' && record.parameter === 'EC50')).toBe(true);
  });
});
