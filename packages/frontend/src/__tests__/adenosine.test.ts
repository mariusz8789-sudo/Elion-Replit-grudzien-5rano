import { describe, expect, it } from 'vitest';
import { buildPinnedChEMBLAdenosineDiscovery, CHEMBL_ADENOSINE_ACTIVITY_71801_SOURCE_URL } from '../core/biotechData/adenosine';
import { buildPinnedChEMBLCaffeineDiscovery } from '../core/biotechData/chembl';
import { compareCandidateDiscoveryReports } from '../core/biotechDiscoveryContract';

describe('pinned ChEMBL adenosine A1 comparator', () => {
  it('maps a real adenosine binding record to the existing evidence contracts', () => {
    const discovery = buildPinnedChEMBLAdenosineDiscovery();
    expect(discovery.record.compoundId).toBe('chembl:molecule:CHEMBL477');
    expect(discovery.record.biologicalTarget).toMatchObject({ id: 'chembl:target:CHEMBL318', status: 'OBSERVED' });
    expect(discovery.record.biologicalEvidence).toMatchObject({ id: 'chembl:activity:71801', status: 'LITERATURE_SUPPORTED' });
    expect(discovery.record.activity).toMatchObject({ activityId: 71801, assayId: 'CHEMBL639739', type: 'Ki', relation: '=', value: '12.8', units: 'nM' });
    expect(discovery.record.sourceUrl).toBe(CHEMBL_ADENOSINE_ACTIVITY_71801_SOURCE_URL);
  });

  it('preserves unknown safety and clinical efficacy boundaries', () => {
    const discovery = buildPinnedChEMBLAdenosineDiscovery();
    expect(discovery.safety).toMatchObject({ status: 'UNKNOWN', evidenceQuality: 'UNKNOWN', signalType: 'uncertainty' });
    expect(discovery.report).toMatchObject({ scientificEvidenceStatus: 'HYPOTHESIS', clinicalEfficacy: 'UNKNOWN' });
    expect(discovery.report.uncertainty).toMatch(/safety|uncertainty/i);
  });

  it('adds a real second candidate to the existing deterministic research-priority comparison', () => {
    const caffeine = buildPinnedChEMBLCaffeineDiscovery();
    const adenosine = buildPinnedChEMBLAdenosineDiscovery();
    const comparison = compareCandidateDiscoveryReports([caffeine.report, adenosine.report]);
    expect(comparison.rows).toHaveLength(2);
    expect(new Set(comparison.rows.map((row) => row.candidateId))).toEqual(new Set([
      caffeine.candidate.id,
      adenosine.candidate.id,
    ]));
    expect(comparison.rows[0]?.score).toBeGreaterThanOrEqual(comparison.rows[1]?.score ?? Number.NEGATIVE_INFINITY);
    expect(comparison.epistemicStatus).toBe('PREDICTION');
    expect(comparison.uncertainty).toMatch(/not efficacy|clinical suitability/i);
  });
});
