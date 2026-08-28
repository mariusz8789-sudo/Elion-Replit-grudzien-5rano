import { describe, expect, it } from 'vitest';
import {
  CHEMBL_ACTIVITY_189031_RELEASE,
  CHEMBL_ACTIVITY_189031_RETRIEVED_AT,
  CHEMBL_ACTIVITY_189031_SOURCE_URL,
  mapPinnedChEMBLCaffeineA1Activity,
} from '../core/biotechData/chembl';

describe('pinned ChEMBL bioactivity', () => {
  it('maps a real caffeine bioactivity record to target and evidence contracts', () => {
    const record = mapPinnedChEMBLCaffeineA1Activity();

    expect(record.compoundId).toBe('pubchem:CID:2519');
    expect(record.biologicalTarget).toMatchObject({
      id: 'chembl:target:CHEMBL318',
      label: 'Adenosine receptor A1',
      targetType: 'SINGLE PROTEIN',
      status: 'OBSERVED',
    });
    expect(record.biologicalEvidence).toMatchObject({
      id: 'chembl:activity:189031',
      status: 'LITERATURE_SUPPORTED',
      subjectIds: ['pubchem:CID:2519', 'chembl:target:CHEMBL318'],
    });
    expect(record.activity).toEqual({
      activityId: 189031,
      assayId: 'CHEMBL876556',
      type: 'Ki',
      relation: '=',
      value: '41000.0',
      units: 'nM',
      assayContext: 'Ability to inhibit binding of [3H]R-PIA to Adenosine A1 receptor in rat brain cortical membranes',
    });
  });

  it('preserves source release, retrieval context, raw response and replay fingerprint', () => {
    const first = mapPinnedChEMBLCaffeineA1Activity();
    const second = mapPinnedChEMBLCaffeineA1Activity();

    expect(first.sourceUrl).toBe(CHEMBL_ACTIVITY_189031_SOURCE_URL);
    expect(first.sourceVersion).toBe(CHEMBL_ACTIVITY_189031_RELEASE);
    expect(first.retrievedAt).toBe(CHEMBL_ACTIVITY_189031_RETRIEVED_AT);
    expect(first.rawResponse.activity.activityId).toBe(189031);
    expect(first.rawResponse.target.targetChemblId).toBe('CHEMBL318');
    expect(first.rawResponse.assay.assayChemblId).toBe('CHEMBL876556');
    expect(first.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it('does not turn the binding record into efficacy or safety claims', () => {
    const record = mapPinnedChEMBLCaffeineA1Activity();

    expect(record.biologicalEvidence.claim).not.toMatch(/efficacy|safety|therapeutic benefit/i);
    expect(record.biologicalEvidence.provenance[0]?.uncertainty).toMatch(/clinical efficacy|safety/i);
    expect(record.biologicalTarget.provenance[0]?.sourceId).toBe('chembl:target:CHEMBL318');
  });
});
