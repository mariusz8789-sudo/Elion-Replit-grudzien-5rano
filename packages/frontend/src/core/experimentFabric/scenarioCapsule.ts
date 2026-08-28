import { canonicalJson, fnv1a } from '../events/hash';
import { compareCounterfactual, type CounterfactualComparison } from './counterfactualCompare';
import type { ScientificEvidencePack } from './evidencePack';
import { runExperiment } from './executor';
import { GENESIS_SPATIAL_DATASET_VERSION, OSM_ATTRIBUTION, OSM_LICENSE, type GenesisSpatialDataset } from './spatialImport';
import type { ExperimentRun } from './types';

export const SCENARIO_CAPSULE_VERSION = '1.0.0';

export type ScenarioCapsuleReplayStatus = 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE';

export interface ScenarioCapsuleInput {
  title: string;
  baselineRun: ExperimentRun;
  variantRun?: ExperimentRun;
  comparison?: CounterfactualComparison;
  evidencePack?: ScientificEvidencePack;
  /** Static, provenance-bearing GIS context; it is never a World State. */
  spatialDataset?: GenesisSpatialDataset;
}

/**
 * Portable projection over existing canonical artefacts. It is not an alternative
 * provenance record, simulation state or scientific result source.
 */
export interface SpatialScenarioAttachment {
  status: 'RETAINED_STATIC_ARTIFACT';
  dataset: GenesisSpatialDataset;
  disclaimer: string;
}

export interface ReproducibleScenarioCapsule {
  contractVersion: string;
  capsuleId: string;
  title: string;
  baselineRun: ExperimentRun;
  variantRun?: ExperimentRun;
  comparison?: CounterfactualComparison;
  evidencePack?: ScientificEvidencePack;
  spatial?: SpatialScenarioAttachment;
  references: {
    baselineRunFingerprint: string;
    variantRunFingerprint?: string;
    comparisonId?: string;
    evidencePackId?: string;
    spatialDatasetId?: string;
    spatialNormalizationFingerprint?: string;
  };
  disclaimer: string;
}

export interface ScenarioCapsuleReplay {
  contractVersion: string;
  capsuleId: string;
  status: ScenarioCapsuleReplayStatus;
  baselineRun?: ExperimentRun;
  variantRun?: ExperimentRun;
  comparison?: CounterfactualComparison;
  checks: readonly { artifact: 'baseline' | 'variant' | 'comparison'; expected: string; actual?: string; matched: boolean }[];
  spatial?: { status: 'RETAINED_STATIC_ARTIFACT'; datasetId: string; normalizationFingerprint: string; license: string; attribution: string };
  message: string;
}

function isCompletedRealRun(run: ExperimentRun): boolean {
  return run.result.status === 'completed' && run.provenance.resultOrigin === 'real-engine';
}

function requireRealRun(name: string, run: ExperimentRun): void {
  if (!isCompletedRealRun(run)) {
    throw new Error(`Scenario Capsule requires a completed real-engine ${name} run; received status=${run.result.status}, origin=${run.provenance.resultOrigin}.`);
  }
}

function requireConsistentComparison(baselineRun: ExperimentRun, variantRun: ExperimentRun | undefined, comparison: CounterfactualComparison | undefined): void {
  if (!comparison) return;
  if (!variantRun) throw new Error('Scenario Capsule comparison requires a variant run.');
  if (comparison.status !== 'COMPLETED' || !comparison.evidence) {
    throw new Error('Scenario Capsule requires a completed Counterfactual Evidence Compare result.');
  }
  if (comparison.evidence.baselineRunFingerprint !== baselineRun.provenance.runFingerprint || comparison.evidence.variantRunFingerprint !== variantRun.provenance.runFingerprint) {
    throw new Error('Scenario Capsule comparison fingerprints do not match the provided canonical runs.');
  }
}

function requireConsistentEvidencePack(baselineRun: ExperimentRun, variantRun: ExperimentRun | undefined, evidencePack: ScientificEvidencePack | undefined): void {
  if (!evidencePack) return;
  if (evidencePack.runs.some((run) => run.status !== 'completed' || run.provenance.resultOrigin !== 'real-engine')) {
    throw new Error('Scenario Capsule accepts an Evidence Pack only when all packed runs are completed real-engine runs.');
  }
  const capsuleFingerprints = new Set([baselineRun.provenance.runFingerprint, variantRun?.provenance.runFingerprint].filter((value): value is string => Boolean(value)));
  if (!evidencePack.runs.some((run) => capsuleFingerprints.has(run.provenance.runFingerprint))) {
    throw new Error('Scenario Capsule Evidence Pack must contain at least one canonical run referenced by the capsule.');
  }
}

function requireSpatialDataset(dataset: GenesisSpatialDataset | undefined): void {
  if (!dataset) return;
  if (dataset.contractVersion !== GENESIS_SPATIAL_DATASET_VERSION) {
    throw new Error(`Scenario Capsule supports ${GENESIS_SPATIAL_DATASET_VERSION} spatial datasets only.`);
  }
  if (dataset.license !== OSM_LICENSE || dataset.attribution !== OSM_ATTRIBUTION) {
    throw new Error('Scenario Capsule requires ODbL license and OpenStreetMap attribution for an OSM spatial dataset.');
  }
  if (dataset.worldIntegration !== 'NOT_WIRED') {
    throw new Error('Scenario Capsule cannot attach a spatial dataset that claims World State integration.');
  }
  if (!dataset.sourceTimestamp || !dataset.sourceUrl || !dataset.sourceQuery || !dataset.provenance.rawArtifactFingerprint || !dataset.provenance.normalizationFingerprint) {
    throw new Error('Scenario Capsule spatial dataset requires source timestamp, URL, query and both provenance fingerprints.');
  }
}

function spatialReplayAttachment(dataset: GenesisSpatialDataset | undefined): ScenarioCapsuleReplay['spatial'] | undefined {
  if (!dataset) return undefined;
  return {
    status: 'RETAINED_STATIC_ARTIFACT',
    datasetId: dataset.datasetId,
    normalizationFingerprint: dataset.provenance.normalizationFingerprint,
    license: dataset.license,
    attribution: dataset.attribution,
  };
}

function replayInputIssues(capsule: ReproducibleScenarioCapsule): string[] {
  const issues: string[] = [];
  if (!capsule.baselineRun || typeof capsule.baselineRun !== 'object') issues.push('baselineRun');
  if (!capsule.references || typeof capsule.references !== 'object') issues.push('references');
  if (capsule.contractVersion !== SCENARIO_CAPSULE_VERSION) issues.push(`contractVersion=${capsule.contractVersion || '(brak)'}`);
  if (!capsule.capsuleId) issues.push('capsuleId');
  if (!capsule.title?.trim()) issues.push('title');
  if (!capsule.references?.baselineRunFingerprint) issues.push('references.baselineRunFingerprint');
  if (capsule.variantRun && !capsule.references?.variantRunFingerprint) issues.push('references.variantRunFingerprint');
  return issues;
}

function blockedReplay(capsule: ReproducibleScenarioCapsule, issues: string[]): ScenarioCapsuleReplay {
  return {
    contractVersion: SCENARIO_CAPSULE_VERSION,
    capsuleId: capsule.capsuleId ?? '',
    status: 'NOT_COMPARABLE',
    checks: [],
    message: `Replay BLOCKED — kapsuła nie spełnia kontraktu: ${issues.join(', ')}. Nie uruchomiono silnika.`,
  };
}

function capsuleIdFor(input: ScenarioCapsuleInput): string {
  return `capsule_${fnv1a(canonicalJson({
    version: SCENARIO_CAPSULE_VERSION,
    title: input.title,
    baseline: input.baselineRun.provenance.runFingerprint,
    variant: input.variantRun?.provenance.runFingerprint ?? null,
    comparison: input.comparison?.comparisonId ?? null,
    evidencePack: input.evidencePack?.evidencePackId ?? null,
    spatialDataset: input.spatialDataset?.provenance.normalizationFingerprint ?? null,
  }))}`;
}

/** Creates a portable record only after verifying references to real existing artefacts. */
export function createScenarioCapsule(input: ScenarioCapsuleInput): ReproducibleScenarioCapsule {
  if (!input.title.trim()) throw new Error('Scenario Capsule requires a non-empty title.');
  requireRealRun('baseline', input.baselineRun);
  if (input.variantRun) requireRealRun('variant', input.variantRun);
  requireConsistentComparison(input.baselineRun, input.variantRun, input.comparison);
  requireConsistentEvidencePack(input.baselineRun, input.variantRun, input.evidencePack);
  requireSpatialDataset(input.spatialDataset);
  return {
    contractVersion: SCENARIO_CAPSULE_VERSION,
    capsuleId: capsuleIdFor(input),
    title: input.title.trim(),
    baselineRun: input.baselineRun,
    ...(input.variantRun ? { variantRun: input.variantRun } : {}),
    ...(input.comparison ? { comparison: input.comparison } : {}),
    ...(input.evidencePack ? { evidencePack: input.evidencePack } : {}),
    ...(input.spatialDataset ? {
      spatial: {
        status: 'RETAINED_STATIC_ARTIFACT' as const,
        dataset: input.spatialDataset,
        disclaimer: 'Artefakt przestrzenny zachowano jako realny kontekst danych OSM z provenance. Nie jest World State, nie modyfikuje parametrów eksperymentu i nie oznacza Digital Twin ani kalibracji do lokalizacji.',
      },
    } : {}),
    references: {
      baselineRunFingerprint: input.baselineRun.provenance.runFingerprint,
      ...(input.variantRun ? { variantRunFingerprint: input.variantRun.provenance.runFingerprint } : {}),
      ...(input.comparison ? { comparisonId: input.comparison.comparisonId } : {}),
      ...(input.evidencePack ? { evidencePackId: input.evidencePack.evidencePackId } : {}),
      ...(input.spatialDataset ? {
        spatialDatasetId: input.spatialDataset.datasetId,
        spatialNormalizationFingerprint: input.spatialDataset.provenance.normalizationFingerprint,
      } : {}),
    },
    disclaimer: 'Scenario Capsule zachowuje rzeczywiste runy i ich provenance jako przenośny rekord. Re-run może wykazać MATCH, DRIFT albo NOT_COMPARABLE; kapsuła nie kalibruje modelu do świata rzeczywistego, nie tworzy nowego wyniku i nie zastępuje review eksperckiego.',
  };
}

function replaySingle(capsule: ReproducibleScenarioCapsule): ScenarioCapsuleReplay {
  const baselineRun = runExperiment(capsule.baselineRun.request);
  const matched = baselineRun.result.status === 'completed' && baselineRun.provenance.runFingerprint === capsule.references.baselineRunFingerprint;
  return {
    contractVersion: SCENARIO_CAPSULE_VERSION,
    capsuleId: capsule.capsuleId,
    status: baselineRun.result.status !== 'completed' ? 'NOT_COMPARABLE' : matched ? 'MATCH' : 'DRIFT',
    baselineRun,
    checks: [{ artifact: 'baseline', expected: capsule.references.baselineRunFingerprint, actual: baselineRun.provenance.runFingerprint, matched }],
    ...(spatialReplayAttachment(capsule.spatial?.dataset) ? { spatial: spatialReplayAttachment(capsule.spatial?.dataset) } : {}),
    message: baselineRun.result.status !== 'completed'
      ? 'Nie można porównać kapsuły: re-run baseline nie ukończył się.'
      : matched ? 'Re-run baseline odpowiada fingerprintowi kapsuły.' : 'Re-run baseline ukończył się, lecz fingerprint różni się od kapsuły.',
  };
}

/**
 * Re-executes only the stored canonical requests. Persisted outputs are not treated as replay output.
 */
export function replayScenarioCapsule(capsule: ReproducibleScenarioCapsule): ScenarioCapsuleReplay {
  const issues = replayInputIssues(capsule);
  if (issues.length > 0) return blockedReplay(capsule, issues);
  if (!capsule.variantRun) return replaySingle(capsule);
  const comparison = compareCounterfactual({
    baseline: capsule.baselineRun.request,
    variant: capsule.variantRun.request,
    labels: capsule.comparison?.labels,
  });
  const baselineRun = comparison.baseline;
  const variantRun = comparison.variant;
  const baselineMatched = Boolean(baselineRun && baselineRun.result.status === 'completed' && baselineRun.provenance.runFingerprint === capsule.references.baselineRunFingerprint);
  const variantMatched = Boolean(variantRun && variantRun.result.status === 'completed' && variantRun.provenance.runFingerprint === capsule.references.variantRunFingerprint);
  const comparable = comparison.status === 'COMPLETED' && baselineRun && variantRun;
  const status: ScenarioCapsuleReplayStatus = !comparable ? 'NOT_COMPARABLE' : baselineMatched && variantMatched ? 'MATCH' : 'DRIFT';
  return {
    contractVersion: SCENARIO_CAPSULE_VERSION,
    capsuleId: capsule.capsuleId,
    status,
    ...(baselineRun ? { baselineRun } : {}),
    ...(variantRun ? { variantRun } : {}),
    comparison,
    ...(spatialReplayAttachment(capsule.spatial?.dataset) ? { spatial: spatialReplayAttachment(capsule.spatial?.dataset) } : {}),
    checks: [
      { artifact: 'baseline', expected: capsule.references.baselineRunFingerprint, ...(baselineRun ? { actual: baselineRun.provenance.runFingerprint } : {}), matched: baselineMatched },
      { artifact: 'variant', expected: capsule.references.variantRunFingerprint ?? '', ...(variantRun ? { actual: variantRun.provenance.runFingerprint } : {}), matched: variantMatched },
      { artifact: 'comparison', expected: 'COMPLETED', actual: comparison.status, matched: comparison.status === 'COMPLETED' },
    ],
    message: status === 'MATCH'
      ? 'Re-run A/B odpowiada fingerprintom kapsuły.'
      : status === 'DRIFT'
        ? 'Re-run A/B ukończył się, ale co najmniej jeden fingerprint różni się od kapsuły.'
        : 'Nie można porównać kapsuły A/B: re-run nie ukończył się albo nie utworzył wspólnych metryk.',
  };
}

export function serializeScenarioCapsule(capsule: ReproducibleScenarioCapsule): string {
  return canonicalJson(capsule);
}
