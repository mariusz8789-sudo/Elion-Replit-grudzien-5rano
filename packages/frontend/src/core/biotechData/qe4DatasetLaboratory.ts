import { fnv1a, canonicalJson } from '../events/hash';
import {
  type DatasetLaboratory,
  type DatasetLaboratoryConfig,
  type DatasetLaboratoryResult,
  type DatasetObservablePoint,
  DATASET_LABORATORY_CONTRACT_VERSION,
} from '../agent/datasetLaboratory';
import { runQe4BrydgesAnalysis, type Qe4PointResult } from './qe4BrydgesAnalysis';
import { QE4_EVIDENCE_CASE_ID } from './qe4EvidenceCase';
import qe4Manifest from './qe4-brydges/manifest.json';

/**
 * The QE4 instance of `DatasetLaboratory` (`core/agent/datasetLaboratory.ts`).
 * Pure glue over `qe4BrydgesAnalysis.ts::runQe4BrydgesAnalysis` — computes
 * nothing itself. Every `(dataset, T, k)` point this exposes is one Genesis
 * has ALREADY computed via the real bootstrap estimator over the pinned
 * Brydges CSVs; this module only reshapes that into the shared
 * `DatasetLaboratoryResult` contract so an autonomous discovery loop can
 * treat it exactly like any other observation source.
 */

interface Qe4Manifest {
  readonly zenodo: { readonly recordUrl: string; readonly doi: string; readonly license: string };
  readonly retrieval: { readonly retrievedAt: string };
}

/**
 * `runQe4BrydgesAnalysis()` is a deterministic pure function of the pinned,
 * static CSVs (see that module's own doc) — it takes no runtime input and its
 * result cannot change within a process. A real discovery loop calls this
 * laboratory many times per round, and the underlying analysis re-runs a
 * 2000-iteration bootstrap across every declared point each time, so this
 * module memoizes it once. This changes performance only, never correctness:
 * every value served is still exactly what `qe4BrydgesAnalysis.ts` itself
 * computed, just computed once instead of once per call.
 */
let cachedAnalysis: ReturnType<typeof runQe4BrydgesAnalysis> | null = null;
function getAnalysis(): ReturnType<typeof runQe4BrydgesAnalysis> {
  if (!cachedAnalysis) cachedAnalysis = runQe4BrydgesAnalysis();
  return cachedAnalysis;
}

function pointId(dataset: 'clean' | 'disorder', p: Qe4PointResult): string {
  return `${dataset}:T=${p.t}:k=${p.k}`;
}

function parsePointId(id: string): { dataset: 'clean' | 'disorder'; t: number; k: number } | null {
  const match = /^(clean|disorder):T=(-?\d+(?:\.\d+)?):k=(-?\d+(?:\.\d+)?)$/.exec(id);
  if (!match) return null;
  return { dataset: match[1] as 'clean' | 'disorder', t: Number(match[2]), k: Number(match[3]) };
}

function findPoint(analysis: ReturnType<typeof runQe4BrydgesAnalysis>, dataset: 'clean' | 'disorder', t: number, k: number): Qe4PointResult | undefined {
  const points = dataset === 'clean' ? analysis.cleanPoints : analysis.disorderPoints;
  return points.find((p) => p.t === t && p.k === k);
}

function observableSpec(): readonly DatasetObservablePoint[] {
  const analysis = getAnalysis();
  const clean = analysis.cleanPoints.map((p) => ({
    pointId: pointId('clean', p),
    label: `clean 10-ion chain, T=${p.t}ms, k=${p.k}`,
  }));
  const disorder = analysis.disorderPoints.map((p) => ({
    pointId: pointId('disorder', p),
    label: `disordered 10-ion chain, T=${p.t}ms, k=${p.k}`,
  }));
  return [...clean, ...disorder];
}

function run(config: DatasetLaboratoryConfig, seed?: number): DatasetLaboratoryResult {
  const analysis = getAnalysis();
  const manifest = qe4Manifest as unknown as Qe4Manifest;
  const provenance = {
    datasetId: 'zenodo-2527010-brydges-2019',
    sourceUrl: manifest.zenodo.recordUrl,
    sourceVersion: `DOI ${analysis.provenance.datasetDoi}`,
    retrievedAt: manifest.retrieval.retrievedAt,
    license: analysis.provenance.datasetLicense,
    archiveSha256: analysis.provenance.archiveSha256,
  };
  // The underlying analysis is seeded with a literal constant
  // (`qe4BrydgesAnalysis.ts::BOOTSTRAP_SEED`) for reproducibility — it is not
  // configurable per call. A caller-supplied `seed` is deliberately ignored
  // rather than threaded through: honoring it without actually using it
  // would fabricate seeded behavior this substrate does not have.
  void seed;
  const replaySeed = analysis.provenance.bootstrapSeed;

  const parsed = parsePointId(config.pointId);
  const point = parsed ? findPoint(analysis, parsed.dataset, parsed.t, parsed.k) : undefined;

  if (!parsed || !point) {
    const fingerprint = fnv1a(canonicalJson({ labId: QE4_EVIDENCE_CASE_ID, pointId: config.pointId, status: 'rejected' }));
    return {
      contractVersion: DATASET_LABORATORY_CONTRACT_VERSION,
      labId: QE4_EVIDENCE_CASE_ID,
      status: 'rejected',
      observation: null,
      provenance,
      fingerprint,
      replay: { inputs: { pointId: config.pointId }, seed: replaySeed },
      rejectedReason: `"${config.pointId}" is not a declared point in this dataset's own grid — it was never measured, so it cannot be observed.`,
    };
  }

  const fingerprint = fnv1a(
    canonicalJson({ labId: QE4_EVIDENCE_CASE_ID, pointId: config.pointId, s2: point.s2, sigma: point.sigma, datasetVersion: provenance.archiveSha256 }),
  );

  return {
    contractVersion: DATASET_LABORATORY_CONTRACT_VERSION,
    labId: QE4_EVIDENCE_CASE_ID,
    status: 'completed',
    observation: { pointId: config.pointId, metric: 's2', value: point.s2, uncertainty: point.sigma },
    provenance,
    fingerprint,
    replay: { inputs: { pointId: config.pointId }, seed: replaySeed },
    rejectedReason: null,
  };
}

export const QE4_DATASET_LABORATORY: DatasetLaboratory = {
  labId: QE4_EVIDENCE_CASE_ID,
  observableSpec,
  run,
};

export interface Qe4GridPoint {
  readonly t: number;
  readonly s2: number;
  readonly sigma: number;
}

/**
 * A domain-specific convenience alongside the generic `run()`/`observableSpec()`
 * contract: every already-computed `(T, k)` point for one dataset/partition,
 * sorted by T ascending. Used by `qe4RegimeHypotheses.ts` (P0.2) to fit a
 * growth curve across time without re-deriving anything `run()` does not
 * already expose — still pure delegation to `getAnalysis()`, no new computation.
 */
export function pointsForGrid(dataset: 'clean' | 'disorder', k: number): readonly Qe4GridPoint[] {
  const analysis = getAnalysis();
  const points = dataset === 'clean' ? analysis.cleanPoints : analysis.disorderPoints;
  return points
    .filter((p) => p.k === k)
    .map((p) => ({ t: p.t, s2: p.s2, sigma: p.sigma }))
    .slice()
    .sort((a, b) => a.t - b.t);
}
