import type { ExperimentRun } from './types';

export const DISCOVERY_SEAM_VERSION = '1.1.0';

export type DiscoveryFindingKind = 'insufficient-data' | 'observed-correlation' | 'observed-outlier';
export type DiscoveryVerdict = 'INSUFFICIENT_DATA' | 'REQUIRES_SCIENTIFIC_REVIEW';
export type DiscoveryDiagnosticsStatus = 'AVAILABLE' | 'NOT_COMPARABLE';
export type DiscoveryMonotonicTrend = 'STRICTLY_INCREASING' | 'STRICTLY_DECREASING' | 'CONSTANT' | 'NON_MONOTONIC' | 'NOT_ASSESSABLE';

export interface DiscoverySeriesDiagnostics {
  status: DiscoveryDiagnosticsStatus;
  validRuns: number;
  distinctModels: number;
  distinctModelVersions: number;
  distinctEngines: number;
  distinctOutputUnits: number;
  parameterDistinctValueCount: number;
  outputUnit?: string;
  parameterMinimum?: number;
  parameterMaximum?: number;
  outputMinimum?: number;
  outputMaximum?: number;
  /** Descriptive least-squares slope; never a causal estimate or forecast. */
  leastSquaresSlope?: number;
  monotonicTrend: DiscoveryMonotonicTrend;
  /** Difference between outputs at the lowest and highest unique parameter values. */
  endpointAbsoluteDifference?: number;
  /** Undefined where the low-end output is zero; never imputed. */
  endpointRelativeDifference?: number;
  limitations: readonly string[];
}

export interface DiscoveryFinding {
  kind: DiscoveryFindingKind;
  verdict: DiscoveryVerdict;
  message: string;
  evidence: Readonly<Record<string, number | string>>;
  runIds: readonly string[];
}

export interface DiscoveryAnalysis {
  contractVersion: string;
  modelId: string | null;
  parameterKey: string;
  outputKey: string;
  diagnostics: DiscoverySeriesDiagnostics;
  findings: readonly DiscoveryFinding[];
  disclaimer: string;
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let xx = 0;
  let yy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    xx += dx * dx;
    yy += dy * dy;
  }
  if (xx === 0 || yy === 0) return null;
  return numerator / Math.sqrt(xx * yy);
}

function leastSquaresSlope(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (denominator === 0) return null;
  return xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / denominator;
}

function diagnosticsFor(
  valid: readonly ExperimentRun[],
  parameterKey: string,
  outputKey: string,
): DiscoverySeriesDiagnostics {
  const modelIds = new Set(valid.map((run) => run.provenance.modelId ?? ''));
  const versions = new Set(valid.map((run) => run.provenance.modelVersion ?? ''));
  const engines = new Set(valid.map((run) => run.provenance.engine ?? ''));
  const units = new Set(valid.map((run) => run.result.units[outputKey] ?? ''));
  const xs = valid.map((run) => run.provenance.parameterSnapshot[parameterKey] as number);
  const ys = valid.map((run) => run.result.outputs[outputKey] as number);
  const parameterDistinctValueCount = new Set(xs).size;
  const comparable = valid.length >= 3
    && modelIds.size === 1
    && versions.size === 1
    && engines.size === 1
    && units.size === 1
    && parameterDistinctValueCount >= 2;
  if (!comparable) {
    const limitations: string[] = [];
    if (valid.length < 3) limitations.push('Mniej niż trzy ukończone runy z numerycznym parametrem i outputem.');
    if (modelIds.size !== 1) limitations.push('Runy mają różne modele.');
    if (versions.size !== 1) limitations.push('Runy mają różne wersje modelu.');
    if (engines.size !== 1) limitations.push('Runy mają różne engine IDs.');
    if (units.size !== 1) limitations.push('Runy mają niespójne jednostki outputu.');
    if (parameterDistinctValueCount < 2) limitations.push('Brak co najmniej dwóch różnych wartości badanego parametru.');
    return {
      status: 'NOT_COMPARABLE',
      validRuns: valid.length,
      distinctModels: modelIds.size,
      distinctModelVersions: versions.size,
      distinctEngines: engines.size,
      distinctOutputUnits: units.size,
      parameterDistinctValueCount,
      monotonicTrend: 'NOT_ASSESSABLE',
      limitations,
    };
  }

  const points = xs.map((x, index) => ({ x, y: ys[index] })).sort((left, right) => left.x - right.x);
  const hasDuplicateParameters = parameterDistinctValueCount !== points.length;
  const deltas = points.slice(1).map((point, index) => point.y - points[index].y);
  const monotonicTrend: DiscoveryMonotonicTrend = hasDuplicateParameters
    ? 'NOT_ASSESSABLE'
    : deltas.every((delta) => delta > 0)
      ? 'STRICTLY_INCREASING'
      : deltas.every((delta) => delta < 0)
        ? 'STRICTLY_DECREASING'
        : deltas.every((delta) => delta === 0)
          ? 'CONSTANT'
          : 'NON_MONOTONIC';
  const endpointAbsoluteDifference = points.at(-1)!.y - points[0].y;
  const endpointRelativeDifference = points[0].y === 0 ? undefined : endpointAbsoluteDifference / Math.abs(points[0].y);
  return {
    status: 'AVAILABLE',
    validRuns: valid.length,
    distinctModels: modelIds.size,
    distinctModelVersions: versions.size,
    distinctEngines: engines.size,
    distinctOutputUnits: units.size,
    parameterDistinctValueCount,
    outputUnit: [...units][0],
    parameterMinimum: Math.min(...xs),
    parameterMaximum: Math.max(...xs),
    outputMinimum: Math.min(...ys),
    outputMaximum: Math.max(...ys),
    leastSquaresSlope: leastSquaresSlope(xs, ys) ?? undefined,
    monotonicTrend,
    endpointAbsoluteDifference,
    ...(endpointRelativeDifference === undefined ? {} : { endpointRelativeDifference }),
    limitations: [
      'Diagnostyki opisują wyłącznie ukończoną, porównywalną serię realnych runów w granicach istniejącego modelu.',
      'Least-squares slope, monotoniczność i endpoint effect nie są p-value, przedziałem ufności, dowodem przyczynowym, kalibracją ani prognozą.',
      ...(hasDuplicateParameters ? ['Powtórzone wartości parametru blokują ocenę monotoniczności; możliwa zmienność wymaga osobnego prerejestrowanego protokołu.'] : []),
    ],
  };
}

/**
 * Analyses completed real-engine runs where the swept parameter is a bounded
 * categorical label (for example, an allowlisted PDB ID). It deliberately does
 * not invent an ordinal scale for categories: no Pearson r, least-squares
 * slope, monotonic trend or automatic hypothesis candidate can arise here.
 */
export function analyseCategoricalExperimentSeries(
  runs: readonly ExperimentRun[],
  parameterKey: string,
  outputKey: string,
): DiscoveryAnalysis {
  const valid = runs.filter((run) => {
    const parameter = run.provenance.parameterSnapshot[parameterKey];
    const output = run.result.outputs[outputKey];
    return run.result.status === 'completed'
      && run.provenance.resultOrigin === 'real-engine'
      && typeof parameter === 'string'
      && parameter.trim().length > 0
      && typeof output === 'number'
      && Number.isFinite(output);
  });
  const modelIds = [...new Set(valid.map((run) => run.provenance.modelId ?? ''))].filter(Boolean);
  const modelVersions = new Set(valid.map((run) => run.provenance.modelVersion ?? ''));
  const engines = new Set(valid.map((run) => run.provenance.engine ?? ''));
  const units = new Set(valid.map((run) => run.result.units[outputKey] ?? ''));
  const grouped = new Map<string, ExperimentRun[]>();
  for (const run of valid) {
    const category = run.provenance.parameterSnapshot[parameterKey] as string;
    const existing = grouped.get(category) ?? [];
    existing.push(run);
    grouped.set(category, existing);
  }
  const categoryCounts = [...grouped.values()].map((group) => group.length);
  const outputs = valid.map((run) => run.result.outputs[outputKey] as number);
  const comparable = valid.length >= 4
    && grouped.size >= 2
    && categoryCounts.every((count) => count >= 2)
    && modelIds.length === 1
    && modelVersions.size === 1
    && engines.size === 1
    && units.size === 1;
  const diagnostics: DiscoverySeriesDiagnostics = comparable
    ? {
      status: 'AVAILABLE',
      validRuns: valid.length,
      distinctModels: modelIds.length,
      distinctModelVersions: modelVersions.size,
      distinctEngines: engines.size,
      distinctOutputUnits: units.size,
      parameterDistinctValueCount: grouped.size,
      outputUnit: [...units][0],
      outputMinimum: Math.min(...outputs),
      outputMaximum: Math.max(...outputs),
      monotonicTrend: 'NOT_ASSESSABLE',
      limitations: [
        'Parameter jest kategorią bez jawnej osi liczbowej; Genesis nie wylicza Pearsona, slope, monotoniczności ani endpoint effect.',
        'Porównanie opisuje wyłącznie ukończone real-engine runy w granicach tego samego modelu, wersji i engine.',
        'Kategoryczna obserwacja nie generuje automatycznie kandydata hipotezy; wymaga osobnego naukowego projektu porównawczego.',
      ],
    }
    : {
      status: 'NOT_COMPARABLE',
      validRuns: valid.length,
      distinctModels: modelIds.length,
      distinctModelVersions: modelVersions.size,
      distinctEngines: engines.size,
      distinctOutputUnits: units.size,
      parameterDistinctValueCount: grouped.size,
      monotonicTrend: 'NOT_ASSESSABLE',
      limitations: [
        'Kategoryczna seria wymaga co najmniej dwóch kategorii, dwóch realnych powtórzeń każdej kategorii oraz zgodnego modelu, wersji, engine i jednostki outputu.',
      ],
    };
  const base = {
    contractVersion: DISCOVERY_SEAM_VERSION,
    modelId: modelIds.length === 1 ? modelIds[0] : null,
    parameterKey,
    outputKey,
    diagnostics,
    disclaimer: 'Wynik jest opisową obserwacją z istniejących, audytowalnych real-engine runów. Kategorie nie są sztucznie porządkowane, a wynik nie jest odkryciem, dowodem przyczynowym, rankingiem biologicznym ani prognozą.',
  };
  if (diagnostics.status !== 'AVAILABLE') {
    return {
      ...base,
      findings: [{
        kind: 'insufficient-data',
        verdict: 'INSUFFICIENT_DATA',
        message: `Kategoryczna seria nie jest porównywalna: ${diagnostics.limitations.join(' ')}`,
        evidence: { validRuns: diagnostics.validRuns, categories: diagnostics.parameterDistinctValueCount },
        runIds: valid.map((run) => run.runId),
      }],
    };
  }
  if (diagnostics.outputMinimum === diagnostics.outputMaximum) return { ...base, findings: [] };
  return {
    ...base,
    findings: [{
      kind: 'observed-outlier',
      verdict: 'REQUIRES_SCIENTIFIC_REVIEW',
      message: 'Zaobserwowano różne wartości outputu pomiędzy prerejestrowanymi kategoriami. Nie ustala to porządku przyczynowego, mechanizmu ani skuteczności biologicznej.',
      evidence: {
        validRuns: diagnostics.validRuns,
        categories: diagnostics.parameterDistinctValueCount,
        outputMin: diagnostics.outputMinimum!,
        outputMax: diagnostics.outputMaximum!,
        comparison: 'CATEGORICAL_DESCRIPTIVE_ONLY',
      },
      runIds: valid.map((run) => run.runId),
    }],
  };
}

/**
 * Analyses comparable, already-executed real-engine runs. It has no simulator,
 * no search over hypothetical points and no causal claim. A finding is only a
 * prompt for scientist review with complete run IDs as evidence.
 */
export function analyseExperimentSeries(
  runs: readonly ExperimentRun[],
  parameterKey: string,
  outputKey: string,
): DiscoveryAnalysis {
  const valid = runs.filter((run) => {
    const parameter = run.provenance.parameterSnapshot[parameterKey];
    const output = run.result.outputs[outputKey];
    return run.result.status === 'completed'
      && run.provenance.resultOrigin === 'real-engine'
      && typeof parameter === 'number'
      && Number.isFinite(parameter)
      && typeof output === 'number'
      && Number.isFinite(output);
  });
  const modelIds = [...new Set(valid.map((run) => run.provenance.modelId ?? ''))].filter(Boolean);
  const diagnostics = diagnosticsFor(valid, parameterKey, outputKey);
  const base = {
    contractVersion: DISCOVERY_SEAM_VERSION,
    modelId: modelIds.length === 1 ? modelIds[0] : null,
    parameterKey,
    outputKey,
    diagnostics,
    disclaimer: 'Wynik jest obserwacją z istniejących, audytowalnych real-engine runów; nie jest odkryciem, dowodem przyczynowym, p-value, przedziałem ufności ani prognozą.',
  };
  if (diagnostics.status !== 'AVAILABLE') {
    return {
      ...base,
      findings: [{
        kind: 'insufficient-data', verdict: 'INSUFFICIENT_DATA',
        message: `Seria nie jest porównywalna dla diagnostyki: ${diagnostics.limitations.join(' ')}`,
        evidence: {
          validRuns: diagnostics.validRuns,
          distinctModels: diagnostics.distinctModels,
          distinctModelVersions: diagnostics.distinctModelVersions,
          distinctEngines: diagnostics.distinctEngines,
          distinctOutputUnits: diagnostics.distinctOutputUnits,
        },
        runIds: valid.map((run) => run.runId),
      }],
    };
  }
  const xs = valid.map((run) => run.provenance.parameterSnapshot[parameterKey] as number);
  const ys = valid.map((run) => run.result.outputs[outputKey] as number);
  const r = pearson(xs, ys);
  if (r === null || Math.abs(r) < 0.8) return { ...base, findings: [] };
  return {
    ...base,
    findings: [{
      kind: 'observed-correlation', verdict: 'REQUIRES_SCIENTIFIC_REVIEW',
      message: `Zaobserwowano silną korelację Pearsona (r=${r.toFixed(3)}) w tej serii. Wymaga ona niezależnej analizy założeń i replikacji.`,
      evidence: {
        pearsonR: r,
        validRuns: valid.length,
        parameterMin: diagnostics.parameterMinimum!,
        parameterMax: diagnostics.parameterMaximum!,
        outputMin: diagnostics.outputMinimum!,
        outputMax: diagnostics.outputMaximum!,
        leastSquaresSlope: diagnostics.leastSquaresSlope ?? 'NOT_ASSESSABLE',
        monotonicTrend: diagnostics.monotonicTrend,
        endpointAbsoluteDifference: diagnostics.endpointAbsoluteDifference!,
        ...(diagnostics.endpointRelativeDifference === undefined ? {} : { endpointRelativeDifference: diagnostics.endpointRelativeDifference }),
      },
      runIds: valid.map((run) => run.runId),
    }],
  };
}
