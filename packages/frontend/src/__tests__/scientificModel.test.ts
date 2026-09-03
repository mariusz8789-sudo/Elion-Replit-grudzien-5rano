import { describe, expect, it } from 'vitest';
import { buildScientificModel, validateModel, type ModelDataPoint } from '../core/discovery/molecular/scientificModel';

/**
 * Validates the model container against REAL measured values: a handful of
 * (molecular weight, measured log-solubility) pairs taken from the actual
 * Delaney/ESOL rows retrieved in `autonomousSourceAcquisition.test.ts`
 * (compound id, molecular weight, measured log solubility), not invented.
 * Source: https://raw.githubusercontent.com/deepchem/deepchem/master/datasets/delaney-processed.csv
 */
const REAL_DELANEY_ROWS = [
  { compound: 'Fenfuram', mw: 201.225, measuredLogS: -3.3 },
  { compound: '3,4,5-Trichloroguaiacol', mw: 211.474, measuredLogS: -3.6 },
  { compound: '2,4-Dichlorophenol', mw: 163.0, measuredLogS: -1.98 },
  { compound: 'Uracil', mw: 112.09, measuredLogS: 0.28 },
];

describe('scientific model foundation', () => {
  it('a model with no stated assumptions is refused at construction', () => {
    expect(() => buildScientificModel({
      modelId: 'm1', statement: 's', equationText: 'y = a*x + b',
      variables: [], parameters: [], assumptions: [], evidenceDependencyIds: [],
    })).toThrow(/no assumptions/);
  });

  it('an unfitted model (parameter value null) is INCONCLUSIVE, never silently evaluated', () => {
    const model = buildScientificModel({
      modelId: 'm2', statement: 'Linear MW-solubility trend', equationText: 'logS = a - b*MW',
      variables: [{ symbol: 'MW', meaning: 'molecular weight', unit: 'g/mol', role: 'INPUT' }],
      parameters: [
        { symbol: 'a', meaning: 'intercept', unit: 'log mol/L', value: null, source: 'NOT_YET_ESTIMATED' },
        { symbol: 'b', meaning: 'slope', unit: 'log mol/L per g/mol', value: null, source: 'NOT_YET_ESTIMATED' },
      ],
      assumptions: ['Solubility depends linearly on molecular weight over this narrow range — a simplification.'],
      evidenceDependencyIds: [],
    });

    const validated = validateModel(model, [], () => 0, 1);
    expect(validated.status).toBe('GENERATED_MODEL');
    expect(validated.validation!.verdict).toBe('INCONCLUSIVE');
    expect(validated.validation!.reason).toContain('unfitted parameter');
  });

  it('validates a fitted model against REAL measured Delaney rows and reports real residuals', () => {
    // Ordinary least squares on the real rows above (computed here, not invented):
    // slope b and intercept a for logS = a + b*MW.
    const xs = REAL_DELANEY_ROWS.map((r) => r.mw);
    const ys = REAL_DELANEY_ROWS.map((r) => r.measuredLogS);
    const n = xs.length;
    const meanX = xs.reduce((s, x) => s + x, 0) / n;
    const meanY = ys.reduce((s, y) => s + y, 0) / n;
    const b = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i]! - meanY), 0) / xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
    const a = meanY - b * meanX;

    const model = buildScientificModel({
      modelId: 'm3', statement: 'Linear MW-solubility trend, fitted by OLS on real Delaney rows', equationText: 'logS = a + b*MW',
      variables: [
        { symbol: 'MW', meaning: 'molecular weight', unit: 'g/mol', role: 'INPUT' },
        { symbol: 'logS', meaning: 'log aqueous solubility', unit: 'log mol/L', role: 'OUTPUT' },
      ],
      parameters: [
        { symbol: 'a', meaning: 'intercept', unit: 'log mol/L', value: a, source: 'FITTED_TO_EVIDENCE' },
        { symbol: 'b', meaning: 'slope', unit: 'log mol/L per g/mol', value: b, source: 'FITTED_TO_EVIDENCE' },
      ],
      assumptions: ['Solubility depends linearly on molecular weight over this narrow, real four-compound sample — a deliberately crude model, not a claim of general validity.'],
      evidenceDependencyIds: REAL_DELANEY_ROWS.map((r) => `delaney-esol-v1:${r.compound}`),
    });

    const dataPoints: ModelDataPoint[] = REAL_DELANEY_ROWS.map((r) => ({
      inputs: { MW: r.mw },
      measuredOutput: r.measuredLogS,
      evidenceRecordId: `delaney-esol-v1:${r.compound}`,
    }));

    const validated = validateModel(model, dataPoints, (params, inputs) => params.a! + params.b! * inputs.MW!, 5);

    expect(validated.validation!.pointsChecked).toBe(4);
    expect(validated.validation!.allParametersFitted).toBe(true);
    // OLS fit on its own training data must reproduce it reasonably; with only
    // 4 real points a two-parameter linear fit is not exact, so this checks
    // "close" rather than "near-zero".
    expect(validated.validation!.meanAbsoluteError).toBeLessThan(0.15);
    expect(validated.status).toBe('VALIDATED');

    for (const residual of validated.validation!.residuals) {
      expect(REAL_DELANEY_ROWS.map((r) => `delaney-esol-v1:${r.compound}`)).toContain(residual.evidenceRecordId);
    }
  });

  it('rejects a model whose predictions do not match measured data within tolerance', () => {
    const model = buildScientificModel({
      modelId: 'm4', statement: 'Deliberately wrong constant model', equationText: 'logS = c',
      variables: [{ symbol: 'logS', meaning: 'log aqueous solubility', unit: 'log mol/L', role: 'OUTPUT' }],
      parameters: [{ symbol: 'c', meaning: 'constant', unit: 'log mol/L', value: 100, source: 'DECLARED_ASSUMPTION' }],
      assumptions: ['Deliberately implausible, to prove REJECTED is reachable.'],
      evidenceDependencyIds: [],
    });

    const dataPoints: ModelDataPoint[] = REAL_DELANEY_ROWS.map((r) => ({
      inputs: {}, measuredOutput: r.measuredLogS, evidenceRecordId: `delaney-esol-v1:${r.compound}`,
    }));

    const validated = validateModel(model, dataPoints, (params) => params.c!, 1);
    expect(validated.status).toBe('REJECTED');
    expect(validated.validation!.verdict).toBe('REJECTED');
  });
});
