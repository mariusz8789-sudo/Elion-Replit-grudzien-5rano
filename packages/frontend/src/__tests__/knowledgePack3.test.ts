import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_PACK_3_RECORDS,
  knowledgePack3EvidenceRefs,
  knowledgePack3RecordsFor,
  KNOWLEDGE_PACK_3_VERSION,
} from '../core/discovery/molecular/knowledgePack3';

describe('Knowledge Pack #3 ingestion', () => {
  it('keeps the supplied records source-attributed and not silently verified', () => {
    expect(KNOWLEDGE_PACK_3_VERSION).toBe('3.0.0-excerpt');
    expect(KNOWLEDGE_PACK_3_RECORDS.length).toBe(9);
    expect(KNOWLEDGE_PACK_3_RECORDS.every((record) => record.sourceType === 'Primary')).toBe(true);
    expect(KNOWLEDGE_PACK_3_RECORDS.every((record) => record.validationStatus === 'NOT_YET_VERIFIED')).toBe(true);
  });

  it('preserves negative and mechanistic distinction records without changing parameters', () => {
    const butylone = KNOWLEDGE_PACK_3_RECORDS.find((record) => record.compound === 'Butylone')!;
    const ketamine = KNOWLEDGE_PACK_3_RECORDS.find((record) => record.compound === 'Ketamine')!;
    expect(butylone.value).toBe('NO_RELEASE');
    expect(butylone.parameter).toBe('Release');
    expect(ketamine.value).toBe('ACCELERATES');
    expect(ketamine.parameter).toBe('Desensitization effect');
  });

  it('filters by compound and emits only real DOI/PMID references', () => {
    const records = knowledgePack3RecordsFor(['4-MMC', 'Memantine']);
    expect(records.map((record) => record.compound)).toEqual(['Memantine', '4-MMC']);
    expect(knowledgePack3EvidenceRefs().every((ref) => ref.identifier.startsWith('doi:') || ref.identifier.startsWith('pmid:'))).toBe(true);
  });
});
