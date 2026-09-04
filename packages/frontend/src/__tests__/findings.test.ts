import { describe, expect, it } from 'vitest';
import { runScenario } from '../core/simulation/scenarioEngine';
import { analyzeExperiment } from '../core/observationAnalysis/analysis';
import { deriveFindings } from '../core/observationAnalysis/findings';

describe('structured findings', () => {
  it('derives evidence-backed peak and baseline findings', () => {
    const baseline = runScenario('BASELINE', { days: 24, stepsPerDay: 2 });
    const variant = runScenario('ISOLATION', { days: 24, stepsPerDay: 2 });
    const findings = deriveFindings(variant, analyzeExperiment(variant, baseline));

    expect(findings.some((finding) => finding.metric === 'infectious' && finding.status === 'OBSERVED')).toBe(true);
    expect(findings.some((finding) => finding.comparison !== null)).toBe(true);
    for (const finding of findings) {
      expect(finding.evidence.resultFingerprint).toBe(variant.resultFingerprint);
      expect(finding.sourceSnapshot.resultFingerprint).toBe(variant.resultFingerprint);
      expect(variant.series[finding.evidence.sampleIndex].day).toBe(finding.sourceSnapshot.day);
    }
  });

  it('is deterministic and rejects analysis from another experiment', () => {
    const run = runScenario('BASELINE', { days: 18, stepsPerDay: 2 });
    const analysis = analyzeExperiment(run);
    expect(deriveFindings(run, analysis)).toEqual(deriveFindings(run, analysis));

    const other = runScenario('ISOLATION', { days: 18, stepsPerDay: 2 });
    expect(() => deriveFindings(other, analysis)).toThrow(/does not belong/);
  });
});
