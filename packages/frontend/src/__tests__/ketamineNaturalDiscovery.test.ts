import { describe, expect, it } from 'vitest';
import { ketamineNaturalDiscoverySummary, runKetamineNaturalDiscovery } from '../core/biotechData/ketamineNaturalDiscovery';

describe('natural ketamine-like discovery', () => {
  it('runs a deterministic bounded candidate comparison with trodusquemine ranked by direct functional evidence', () => {
    const first = runKetamineNaturalDiscovery();
    const second = runKetamineNaturalDiscovery();

    expect(first.status).toBe('RESOLVED');
    expect(first.candidates).toHaveLength(5);
    expect(first.comparison).toEqual(second.comparison);
    expect(first.scientificFingerprint).toBe(second.scientificFingerprint);
    expect(first.comparison.rows[0]?.candidateId).toBe('candidate:ketamine-natural:pubchem:9917968');
    expect(first.candidates.find((candidate) => candidate.name === 'Trodusquemine')?.axes).toMatchObject({
      target: 'DIRECT_MEASUREMENT',
      functional: 'DIRECT_MEASUREMENT',
      evidenceQuality: 'HIGH',
    });
  });

  it('keeps structural, target, functional and mechanism evidence as separate axes', () => {
    const result = runKetamineNaturalDiscovery();
    const curcumin = result.candidates.find((candidate) => candidate.name === 'Curcumin');
    const squalamine = result.candidates.find((candidate) => candidate.name === 'Squalamine');

    expect(curcumin?.axes).toMatchObject({ functional: 'LITERATURE_SUPPORTED', mechanistic: 'UNKNOWN' });
    expect(squalamine?.axes).toMatchObject({ target: 'UNKNOWN', functional: 'UNKNOWN', mechanistic: 'UNKNOWN' });
    expect(result.reports.every((report) => report.clinicalEfficacy === 'UNKNOWN')).toBe(true);
    expect(result.reports.every((report) => report.epistemicStatus === 'HYPOTHESIS')).toBe(true);
  });

  it('emits falsification criteria and an unperformed discriminating experiment', () => {
    const result = runKetamineNaturalDiscovery();
    expect(result.candidates.every((candidate) => candidate.falsification.length > 0)).toBe(true);
    expect(result.nextExperiment.status).toBe('REQUIRES_EXPERIMENT');
    expect(result.nextExperiment.candidateIds).toEqual(result.topCandidateIds);
    expect(result.nextExperiment.whatItTests).toMatch(/NMDAR/i);
    expect(result.uncertainty).toMatch(/clinical efficacy|safety|CNS exposure/i);
    expect(ketamineNaturalDiscoverySummary(result)).toMatch(/KETAMINE-LIKE NATURAL DISCOVERY — RESOLVED/);
  });
});
