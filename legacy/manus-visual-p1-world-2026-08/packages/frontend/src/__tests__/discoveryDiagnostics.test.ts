import { describe, expect, it } from 'vitest';
import { analyseExperimentSeries, parseScienceChatMessage, runExperiment } from '../core/experimentFabric';

describe('Genesis Discovery descriptive diagnostics', () => {
  it('reports model-bounded trend and endpoint diagnostics only from real comparable Schwarzschild runs', () => {
    const runs = [1, 2, 3].map((mass) => runExperiment(
      parseScienceChatMessage(`Oblicz promień Schwarzschilda dla ${mass} masy Słońca.`),
    ));
    const analysis = analyseExperimentSeries(runs, 'massSolar', 'radiusKm');

    expect(analysis.contractVersion).toBe('1.1.0');
    expect(analysis.diagnostics).toMatchObject({
      status: 'AVAILABLE',
      validRuns: 3,
      distinctModels: 1,
      distinctModelVersions: 1,
      distinctEngines: 1,
      distinctOutputUnits: 1,
      parameterDistinctValueCount: 3,
      monotonicTrend: 'STRICTLY_INCREASING',
    });
    expect(analysis.diagnostics.leastSquaresSlope).toBeGreaterThan(0);
    expect(analysis.diagnostics.endpointAbsoluteDifference).toBeGreaterThan(0);
    expect(analysis.findings[0]?.evidence).toMatchObject({
      monotonicTrend: 'STRICTLY_INCREASING',
    });
    expect(analysis.findings[0]?.evidence).not.toHaveProperty('pValue');
    expect(analysis.findings[0]?.evidence).not.toHaveProperty('confidenceInterval');
    expect(analysis.disclaimer).toContain('nie jest odkryciem');
  });

  it('blocks descriptive diagnostics when a real series has no parameter variation', () => {
    const runs = [1, 2, 3].map(() => runExperiment(
      parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'),
    ));
    const analysis = analyseExperimentSeries(runs, 'massSolar', 'radiusKm');

    expect(analysis.diagnostics).toMatchObject({
      status: 'NOT_COMPARABLE',
      parameterDistinctValueCount: 1,
      monotonicTrend: 'NOT_ASSESSABLE',
    });
    expect(analysis.findings[0]).toMatchObject({
      kind: 'insufficient-data',
      verdict: 'INSUFFICIENT_DATA',
    });
    expect(analysis.diagnostics.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining('co najmniej dwóch różnych wartości'),
    ]));
  });
});
