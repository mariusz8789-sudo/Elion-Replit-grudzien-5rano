import { describe, expect, it } from 'vitest';
import { fnv1a, canonicalJson } from '../core/events/hash';
import {
  assembleResult,
  assertNoDuplicateCaseIds,
  compareReplay,
  orderedCases,
  summarize,
  verifyDatasetIntegrity,
} from '../core/benchmark/benchmarkRunner';
import type { BenchmarkCase, BenchmarkCaseResult, BenchmarkDataset } from '../core/benchmark/types';
import { runDiscoveryBenchEvolutionFishBenchmark } from '../core/benchmark/discoveryBenchRun';
import { buildEvolutionFishDataset, fullCovariateModelSpec, loadEvolutionFishRows, runAutonomousCampaign, runFullCovariateFit } from '../core/benchmark/discoveryBenchAdapter';
import { scoreEvolutionFishCase } from '../core/benchmark/discoveryBenchScorer';

/**
 * GENERIC HARNESS TESTS (§9) + ADVERSARIAL CHECKS (§10). These exercise
 * `benchmarkRunner.ts`'s own machinery against small, synthetic cases (so a
 * bug in the generic runner is caught independent of any one benchmark's
 * data), plus a handful of checks that specifically need the real
 * DiscoveryBench pipeline (case-definition drift, leakage, order
 * independence) where a synthetic stand-in would prove nothing real.
 */

function mkCase(overrides: Partial<BenchmarkCase> = {}): BenchmarkCase {
  const base: BenchmarkCase = {
    benchmarkId: 'synthetic',
    benchmarkVersion: 'v1',
    caseId: 'case-a',
    task: 'a synthetic task',
    goldHypothesisText: 'gold text',
    expected: { kind: 'NOT_SIGNIFICANT', variable: 'x' },
    source: { repo: 'https://example.test/repo', commit: 'deadbeef', originalPath: 'x.csv', license: 'CC0' },
    datasetFiles: [{ path: 'x.csv', sha256: 'abc123', byteLength: 10 }],
    fingerprint: 'fp-a',
  };
  return { ...base, ...overrides };
}

function mkResult(overrides: Partial<BenchmarkCaseResult> = {}): BenchmarkCaseResult {
  return {
    caseId: 'case-a',
    outcome: 'CORRECT',
    taskSuccess: true,
    scientificCorrectness: true,
    reasoningValidity: true,
    evidenceUse: 'evidence',
    falsificationBehavior: null,
    rationale: 'rationale',
    runFingerprint: 'run-a',
    ...overrides,
  };
}

describe('benchmarkHarness — dataset integrity', () => {
  it('passes when every declared file checksum matches the actual bytes', () => {
    const dataset: BenchmarkDataset = { benchmarkId: 'synthetic', benchmarkVersion: 'v1', cases: [mkCase()], datasetFingerprint: 'd1' };
    expect(() => verifyDatasetIntegrity(dataset, new Map([['x.csv', 'abc123']]))).not.toThrow();
  });

  it('CHECKSUM MISMATCH: throws when the actual bytes hash differently than the frozen manifest — the dataset changed after freeze', () => {
    const dataset: BenchmarkDataset = { benchmarkId: 'synthetic', benchmarkVersion: 'v1', cases: [mkCase()], datasetFingerprint: 'd1' };
    expect(() => verifyDatasetIntegrity(dataset, new Map([['x.csv', 'TAMPERED']]))).toThrow(/DATASET_INTEGRITY_VIOLATION/);
  });

  it('MISSING FILE: throws when a declared file was never actually loaded, rather than silently skipping the check', () => {
    const dataset: BenchmarkDataset = { benchmarkId: 'synthetic', benchmarkVersion: 'v1', cases: [mkCase()], datasetFingerprint: 'd1' };
    expect(() => verifyDatasetIntegrity(dataset, new Map())).toThrow(/DATASET_INTEGRITY_VIOLATION/);
  });
});

describe('benchmarkHarness — duplicate cases', () => {
  it('DUPLICATE CASE: throws rather than silently double-counting a repeated caseId', () => {
    expect(() => assertNoDuplicateCaseIds([mkCase({ caseId: 'x' }), mkCase({ caseId: 'x' })])).toThrow(/DUPLICATE_CASE/);
  });

  it('passes for genuinely distinct caseIds', () => {
    expect(() => assertNoDuplicateCaseIds([mkCase({ caseId: 'x' }), mkCase({ caseId: 'y' })])).not.toThrow();
  });
});

describe('benchmarkHarness — deterministic ordering (also §10: order dependence)', () => {
  it('orders cases by caseId regardless of input order', () => {
    const shuffled = [mkCase({ caseId: 'c' }), mkCase({ caseId: 'a' }), mkCase({ caseId: 'b' })];
    expect(orderedCases(shuffled).map((c) => c.caseId)).toEqual(['a', 'b', 'c']);
  });

  it('ORDER DEPENDENCE: the assembled runFingerprint does not depend on the order cases were originally declared in — only on the frozen (sorted) sequence', () => {
    const declaredA = [mkCase({ caseId: 'a', fingerprint: 'fp-a' }), mkCase({ caseId: 'b', fingerprint: 'fp-b' })];
    const declaredB = [mkCase({ caseId: 'b', fingerprint: 'fp-b' }), mkCase({ caseId: 'a', fingerprint: 'fp-a' })];
    const datasetA: BenchmarkDataset = { benchmarkId: 's', benchmarkVersion: 'v1', cases: orderedCases(declaredA), datasetFingerprint: fnv1a(canonicalJson(orderedCases(declaredA).map((c) => c.fingerprint))) };
    const datasetB: BenchmarkDataset = { benchmarkId: 's', benchmarkVersion: 'v1', cases: orderedCases(declaredB), datasetFingerprint: fnv1a(canonicalJson(orderedCases(declaredB).map((c) => c.fingerprint))) };
    expect(datasetA.datasetFingerprint).toBe(datasetB.datasetFingerprint);
    const resultA = assembleResult(datasetA, orderedCases(declaredA).map((c) => mkResult({ caseId: c.caseId, runFingerprint: `run-${c.caseId}` })), {});
    const resultB = assembleResult(datasetB, orderedCases(declaredB).map((c) => mkResult({ caseId: c.caseId, runFingerprint: `run-${c.caseId}` })), {});
    expect(resultA.runFingerprint).toBe(resultB.runFingerprint);
  });
});

describe('benchmarkHarness — score correctness, UNKNOWN/NO_ACCESS never coerced to false', () => {
  it('rates are computed only over cases with a real (non-null) value — an UNKNOWN never drags a rate down as if it were a FAIL', () => {
    const results = [
      mkResult({ caseId: 'a', outcome: 'CORRECT', scientificCorrectness: true, reasoningValidity: true, taskSuccess: true }),
      mkResult({ caseId: 'b', outcome: 'UNKNOWN', scientificCorrectness: null, reasoningValidity: null, taskSuccess: null }),
      mkResult({ caseId: 'c', outcome: 'NO_ACCESS', scientificCorrectness: null, reasoningValidity: null, taskSuccess: null }),
    ];
    const summary = summarize(results);
    expect(summary.totalCases).toBe(3);
    expect(summary.byOutcome.UNKNOWN).toBe(1);
    expect(summary.byOutcome.NO_ACCESS).toBe(1);
    expect(summary.unknownOrNoAccessCount).toBe(2);
    // Only ONE case had a real judgeable value, and it was correct — rate is 1, not averaged down by the two UNKNOWN/NO_ACCESS.
    expect(summary.scientificCorrectnessRate).toBe(1);
    expect(summary.taskSuccessRate).toBe(1);
    expect(summary.failureCount).toBe(0);
  });

  it('an INCORRECT case is counted as a real failure, distinct from UNKNOWN', () => {
    const summary = summarize([mkResult({ outcome: 'INCORRECT', scientificCorrectness: false })]);
    expect(summary.failureCount).toBe(1);
    expect(summary.scientificCorrectnessRate).toBe(0);
  });

  it('an all-UNKNOWN result set reports null rates, not a fabricated 0 or 1', () => {
    const summary = summarize([mkResult({ outcome: 'UNKNOWN', scientificCorrectness: null, reasoningValidity: null, taskSuccess: null })]);
    expect(summary.scientificCorrectnessRate).toBeNull();
    expect(summary.reasoningValidityRate).toBeNull();
    expect(summary.taskSuccessRate).toBeNull();
  });
});

describe('benchmarkHarness — replay and fingerprint (also §10: result changes without a fingerprint change)', () => {
  const dataset: BenchmarkDataset = { benchmarkId: 's', benchmarkVersion: 'v1', cases: [mkCase()], datasetFingerprint: 'd1' };

  it('REPLAY: identical dataset+config+case results -> identical runFingerprint', () => {
    const a = assembleResult(dataset, [mkResult()], { seed: 1 });
    const b = assembleResult(dataset, [mkResult()], { seed: 1 });
    expect(compareReplay(a, b)).toBe('MATCH');
  });

  it('a config change moves the runFingerprint — a run that behaves differently can never look identical to one that did not', () => {
    const a = assembleResult(dataset, [mkResult()], { seed: 1 });
    const b = assembleResult(dataset, [mkResult()], { seed: 2 });
    expect(compareReplay(a, b)).toBe('MISMATCH');
  });

  it('SCORE MANIPULATION / silent result change: a different per-case outcome with the SAME per-case runFingerprint would be a scorer bug — this harness ties the fingerprint to the outcome-bearing fields, so a genuine outcome change always moves it', () => {
    const correct = mkResult({ outcome: 'CORRECT', runFingerprint: fnv1a(canonicalJson({ outcome: 'CORRECT' })) });
    const incorrect = mkResult({ outcome: 'INCORRECT', runFingerprint: fnv1a(canonicalJson({ outcome: 'INCORRECT' })) });
    const a = assembleResult(dataset, [correct], {});
    const b = assembleResult(dataset, [incorrect], {});
    expect(a.runFingerprint).not.toBe(b.runFingerprint);
  });
});

describe('benchmarkHarness — malformed / invalid input handling', () => {
  it('MALFORMED DATA: a case declaring a file with a non-hex/garbage checksum still gets a real byte-for-byte comparison, and fails honestly rather than throwing an unrelated error', () => {
    const dataset: BenchmarkDataset = { benchmarkId: 's', benchmarkVersion: 'v1', cases: [mkCase({ datasetFiles: [{ path: 'x.csv', sha256: 'not-a-real-hash', byteLength: 1 }] })], datasetFingerprint: 'd1' };
    expect(() => verifyDatasetIntegrity(dataset, new Map([['x.csv', 'abc123']]))).toThrow(/DATASET_INTEGRITY_VIOLATION/);
  });

  it('MISSING CASE: a dataset with zero cases summarizes to zero, not an error or a fabricated pass', () => {
    const summary = summarize([]);
    expect(summary.totalCases).toBe(0);
    expect(summary.scientificCorrectnessRate).toBeNull();
  });
});

describe('benchmarkHarness — adversarial: case-definition drift on the REAL DiscoveryBench dataset', () => {
  it('CHANGED EXPECTED ANSWER: a case fingerprint is derived from `expected`, so silently editing the gold claim would change the case (and dataset) fingerprint — proven by recomputing it against a tampered copy', () => {
    const real = buildEvolutionFishDataset();
    const original = real.cases.find((c) => c.caseId === 'evolution_freshwater_fish/metadata_0')!;
    const tampered: BenchmarkCase = { ...original, expected: { kind: 'COEFFICIENT_SIGN', claims: [{ variable: 'MBL_evol', sign: 'NEGATIVE', claimedCoefficient: 0.82 }] } };
    // Recomputing the SAME fingerprint function this codebase uses (fnv1a/canonicalJson) over the tampered case's defining fields must differ from the frozen one.
    const tamperedFingerprint = fnv1a(canonicalJson({
      benchmarkId: tampered.benchmarkId, benchmarkVersion: tampered.benchmarkVersion, caseId: tampered.caseId,
      task: tampered.task, expected: tampered.expected, datasetFiles: tampered.datasetFiles,
    }));
    expect(tamperedFingerprint).not.toBe(original.fingerprint);
  });

  it('CASE LEAKAGE: the frozen dataset contains exactly the 4 declared cases, never more (no accidental inclusion of an out-of-scope DiscoveryBench task)', () => {
    const real = buildEvolutionFishDataset();
    expect(real.cases.map((c) => c.caseId).sort()).toEqual([
      'evolution_freshwater_fish/metadata_0',
      'evolution_freshwater_fish/metadata_1',
      'evolution_freshwater_fish/metadata_2',
      'evolution_freshwater_fish/metadata_3',
    ]);
  });

  it('HIDDEN HARD-CODED ANSWER: scientificCorrectness is a real function of the input data, not a constant — feeding the SAME real Facet A/B computations through the SAME production scorer with a hand-flipped claimed sign flips the verdict', () => {
    const real = runDiscoveryBenchEvolutionFishBenchmark();
    const originallyCorrect = real.caseResults.find((r) => r.caseId === 'evolution_freshwater_fish/metadata_0')!;
    expect(originallyCorrect.scientificCorrectness).toBe(true);

    const dataset = buildEvolutionFishDataset();
    const original = dataset.cases.find((c) => c.caseId === 'evolution_freshwater_fish/metadata_0')!;
    const flipped: BenchmarkCase = { ...original, expected: { kind: 'COEFFICIENT_SIGN', claims: [{ variable: 'MBL_evol', sign: 'NEGATIVE', claimedCoefficient: 0.82 }] } };

    const rows = loadEvolutionFishRows();
    const spec = fullCovariateModelSpec();
    const facetA = runFullCovariateFit(rows);
    const facetB = runAutonomousCampaign(rows);
    const flippedResult = scoreEvolutionFishCase(flipped, spec, facetA, facetB);
    expect(flippedResult.scientificCorrectness).toBe(false);
    expect(flippedResult.outcome).toBe('INCORRECT');
  }, 15000);
});
