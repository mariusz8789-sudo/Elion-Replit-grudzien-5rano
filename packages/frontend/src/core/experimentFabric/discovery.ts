import type { ExperimentRun } from './types';

export const DISCOVERY_SEAM_VERSION = '1.0.0';

export type DiscoveryFindingKind = 'insufficient-data' | 'observed-correlation' | 'observed-outlier';
export type DiscoveryVerdict = 'INSUFFICIENT_DATA' | 'REQUIRES_SCIENTIFIC_REVIEW';

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

/**
 * Analyses comparable, already-executed runs. It has no simulator, no search
 * over hypothetical points and no causal claim. A finding is only a prompt for
 * scientist review with complete run IDs as evidence.
 */
export function analyseExperimentSeries(
  runs: readonly ExperimentRun[],
  parameterKey: string,
  outputKey: string,
): DiscoveryAnalysis {
  const valid = runs.filter((run) => {
    const parameter = run.provenance.parameterSnapshot[parameterKey];
    const output = run.result.outputs[outputKey];
    return run.result.status === 'completed' && typeof parameter === 'number' && Number.isFinite(parameter)
      && typeof output === 'number' && Number.isFinite(output);
  });
  const modelIds = [...new Set(valid.map((run) => run.provenance.modelId ?? ''))].filter(Boolean);
  const base = {
    contractVersion: DISCOVERY_SEAM_VERSION,
    modelId: modelIds.length === 1 ? modelIds[0] : null,
    parameterKey,
    outputKey,
    disclaimer: 'Wynik jest obserwacją z istniejących, audytowalnych runów; nie jest odkryciem, dowodem przyczynowym ani prognozą.',
  };
  if (valid.length < 3 || modelIds.length !== 1) {
    return {
      ...base,
      findings: [{
        kind: 'insufficient-data', verdict: 'INSUFFICIENT_DATA',
        message: valid.length < 3
          ? 'Potrzebne są co najmniej trzy porównywalne, zakończone runy z numerycznym parametrem i wynikiem.'
          : 'Runy pochodzą z różnych modeli i nie są porównywalne bez jawnej metody normalizacji.',
        evidence: { validRuns: valid.length, distinctModels: modelIds.length }, runIds: valid.map((run) => run.runId),
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
      evidence: { pearsonR: r, validRuns: valid.length, parameterMin: Math.min(...xs), parameterMax: Math.max(...xs), outputMin: Math.min(...ys), outputMax: Math.max(...ys) },
      runIds: valid.map((run) => run.runId),
    }],
  };
}
