import { createHash } from 'node:crypto';
import { buildEvolutionFishDataset, fullCovariateModelSpec, loadEvolutionFishRows, runAutonomousCampaign, runFullCovariateFit } from './discoveryBenchAdapter';
import { EVOLUTION_FRESHWATER_FISH_CSV } from './discoveryBenchFixtureData';
import { DISCOVERYBENCH_SOURCE } from './discoveryBenchManifest';
import { scoreEvolutionFishCase } from './discoveryBenchScorer';
import { assembleResult, assertNoDuplicateCaseIds, orderedCases, verifyDatasetIntegrity } from './benchmarkRunner';
import type { BenchmarkResult } from './types';

const AUTONOMOUS_CAMPAIGN_CONFIG = {
  autonomousCampaignMaxRounds: 20,
  excludeBases: ['LOG', 'RECIPROCAL', 'POWER', 'EXP_SATURATION', 'INTERACTION'],
} as const;

/** Real sha256 (Node's crypto — this module is Node-side only, reached via core/repro/reproEntry.node.ts, exactly like every other discovery-engine module — see moduleReachability.test.ts's ALLOWED_ORPHANS) over the embedded CSV, keyed by the path the manifest declares. */
function computeActualFileHashes(): ReadonlyMap<string, string> {
  const sha256 = createHash('sha256').update(EVOLUTION_FRESHWATER_FISH_CSV, 'utf8').digest('hex');
  return new Map([[`${DISCOVERYBENCH_SOURCE.originalPath}body-size-evolution-in-south-american-freshwater-fishes.csv`, sha256]]);
}

/**
 * THE ONE E2E ENTRY POINT (§8): PUBLIC DATASET -> LOAD -> FREEZE VERSION ->
 * RUN GENESIS -> EVALUATE -> SCORE -> PROVENANCE -> FINGERPRINT. Calling this
 * twice with no code change between calls must produce byte-identical
 * `BenchmarkResult.runFingerprint`s (verified by `discoveryBenchE2E.test.ts`'s
 * own replay test) — that is this function's whole contract.
 */
export function runDiscoveryBenchEvolutionFishBenchmark(): BenchmarkResult {
  const dataset = buildEvolutionFishDataset();
  assertNoDuplicateCaseIds(dataset.cases);
  const cases = orderedCases(dataset.cases);

  // Dataset integrity: the embedded fixture's real checksum, recomputed now, must match what every case was frozen against.
  verifyDatasetIntegrity(dataset, computeActualFileHashes());

  const rows = loadEvolutionFishRows();
  const facetASpec = fullCovariateModelSpec();
  const facetA = runFullCovariateFit(rows);
  const facetB = runAutonomousCampaign(rows);

  const caseResults = cases.map((c) => scoreEvolutionFishCase(c, facetASpec, facetA, facetB));
  return assembleResult(dataset, caseResults, AUTONOMOUS_CAMPAIGN_CONFIG);
}
