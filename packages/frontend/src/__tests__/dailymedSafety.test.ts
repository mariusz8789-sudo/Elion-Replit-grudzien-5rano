import { describe, expect, it } from 'vitest';
import { buildPinnedChEMBLAdenosineDiscovery } from '../core/biotechData/adenosine';
import { buildPinnedChEMBLTheophyllineDiscovery } from '../core/biotechData/theophylline';

describe('official DailyMed safety provenance', () => {
  it('attaches the adenosine label signal without converting it into efficacy', () => {
    const discovery = buildPinnedChEMBLAdenosineDiscovery();
    expect(discovery.safety).toMatchObject({ status: 'LITERATURE_SUPPORTED', evidenceQuality: 'HIGH', signalType: 'adverse-effect' });
    expect(discovery.safety.provenance[0]).toMatchObject({ source: 'DailyMed', sourceId: expect.stringContaining('546642f2'), status: 'LITERATURE_SUPPORTED' });
    expect(discovery.report.clinicalEfficacy).toBe('UNKNOWN');
  });

  it('attaches the theophylline label signal with pharmacokinetic uncertainty', () => {
    const discovery = buildPinnedChEMBLTheophyllineDiscovery();
    expect(discovery.safety).toMatchObject({ status: 'LITERATURE_SUPPORTED', evidenceQuality: 'HIGH', signalType: 'adverse-effect' });
    expect(discovery.safety.description).toMatch(/concentration|pharmacokinetic|monitoring/i);
    expect(discovery.safety.provenance[0]?.sourceUrl).toContain('dailymed.nlm.nih.gov');
    expect(discovery.report.clinicalEfficacy).toBe('UNKNOWN');
  });
});
