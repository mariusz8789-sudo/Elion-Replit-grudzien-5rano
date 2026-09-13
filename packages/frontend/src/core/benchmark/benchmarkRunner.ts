import { fnv1a, canonicalJson } from '../events/hash';
import { MODEL_SPACE_CONTRACT_VERSION } from '../agent/modelSpace';
import { DISCOVERY_CAMPAIGN_CONTRACT_VERSION } from '../agent/discoveryCampaign';
import type { BenchmarkCase, BenchmarkCaseResult, BenchmarkDataset, BenchmarkResult, BenchmarkScoreSummary, CaseOutcome, ReplayVerdict } from './types';

export const BENCHMARK_RUNNER_CONTRACT_VERSION = '1.0.0';

/**
 * DATASET INTEGRITY. Every declared file's checksum, recomputed against the
 * bytes this run actually used, must match what the case was frozen with.
 * Thrown, not silently logged: a mismatch here means the run about to happen
 * would not be measuring the frozen benchmark at all.
 */
export function verifyDatasetIntegrity(dataset: BenchmarkDataset, actualFileHashes: ReadonlyMap<string, string>): void {
  for (const c of dataset.cases) {
    for (const f of c.datasetFiles) {
      const actual = actualFileHashes.get(f.path);
      if (actual === undefined) {
        throw new Error(`DATASET_INTEGRITY_VIOLATION: case "${c.caseId}" declares file "${f.path}" but no such file was loaded.`);
      }
      if (actual !== f.sha256) {
        throw new Error(`DATASET_INTEGRITY_VIOLATION: case "${c.caseId}"'s file "${f.path}" has sha256 ${actual}, frozen manifest says ${f.sha256} — the dataset changed after freeze.`);
      }
    }
  }
}

/** Duplicate `caseId`s would silently double-count in the summary — refuse outright rather than average over a phantom extra case. */
export function assertNoDuplicateCaseIds(cases: readonly BenchmarkCase[]): void {
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.caseId)) throw new Error(`DUPLICATE_CASE: "${c.caseId}" appears more than once in the frozen dataset.`);
    seen.add(c.caseId);
  }
}

/** Deterministic ordering (§9): cases are always processed in caseId order, regardless of the order they were declared or discovered in — a runner's own summary must not depend on that. */
export function orderedCases(cases: readonly BenchmarkCase[]): readonly BenchmarkCase[] {
  return [...cases].sort((a, b) => a.caseId.localeCompare(b.caseId));
}

const EMPTY_OUTCOME_COUNTS: Readonly<Record<CaseOutcome, number>> = { CORRECT: 0, INCORRECT: 0, PARTIAL: 0, UNKNOWN: 0, NO_ACCESS: 0 };

function rateOf(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function summarize(caseResults: readonly BenchmarkCaseResult[]): BenchmarkScoreSummary {
  const byOutcome: Record<CaseOutcome, number> = { ...EMPTY_OUTCOME_COUNTS };
  for (const r of caseResults) byOutcome[r.outcome] += 1;

  const withTaskSuccess = caseResults.filter((r) => r.taskSuccess !== null);
  const withCorrectness = caseResults.filter((r) => r.scientificCorrectness !== null);
  const withReasoning = caseResults.filter((r) => r.reasoningValidity !== null);

  return {
    totalCases: caseResults.length,
    byOutcome,
    taskSuccessRate: rateOf(withTaskSuccess.filter((r) => r.taskSuccess === true).length, withTaskSuccess.length),
    scientificCorrectnessRate: rateOf(withCorrectness.filter((r) => r.scientificCorrectness === true).length, withCorrectness.length),
    reasoningValidityRate: rateOf(withReasoning.filter((r) => r.reasoningValidity === true).length, withReasoning.length),
    failureCount: byOutcome.INCORRECT,
    unknownOrNoAccessCount: byOutcome.UNKNOWN + byOutcome.NO_ACCESS,
  };
}

/**
 * Assembles the final `BenchmarkResult`. `config` is whatever run-time
 * options genuinely affect the outcome (e.g. round budgets) — folded into
 * the run fingerprint so a config change is visible as a fingerprint change,
 * never a silent drift (§10's "run that changes result without fingerprint
 * change").
 */
export function assembleResult(
  dataset: BenchmarkDataset,
  caseResults: readonly BenchmarkCaseResult[],
  config: Readonly<Record<string, unknown>>,
): BenchmarkResult {
  const genesisContractVersions = {
    modelSpace: MODEL_SPACE_CONTRACT_VERSION,
    discoveryCampaign: DISCOVERY_CAMPAIGN_CONTRACT_VERSION,
  };
  const configFingerprint = fnv1a(canonicalJson(config));
  const runFingerprint = fnv1a(canonicalJson({
    datasetFingerprint: dataset.datasetFingerprint,
    configFingerprint,
    genesisContractVersions,
    caseRunFingerprints: caseResults.map((r) => ({ caseId: r.caseId, runFingerprint: r.runFingerprint })),
  }));
  return {
    benchmarkId: dataset.benchmarkId,
    benchmarkVersion: dataset.benchmarkVersion,
    datasetFingerprint: dataset.datasetFingerprint,
    genesisContractVersions,
    configFingerprint,
    caseResults,
    summary: summarize(caseResults),
    runFingerprint,
  };
}

/** Replay: re-running the identical dataset+config must reproduce the identical `runFingerprint` — the one property this whole harness exists to prove. */
export function compareReplay(a: BenchmarkResult, b: BenchmarkResult): ReplayVerdict {
  return a.runFingerprint === b.runFingerprint ? 'MATCH' : 'MISMATCH';
}
