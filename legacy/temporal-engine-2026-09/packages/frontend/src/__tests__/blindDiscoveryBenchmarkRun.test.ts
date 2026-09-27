import { describe, expect, it } from 'vitest';
import { createNodeHttpSourceConnector } from '../core/discovery/sources/httpSourceConnector.node';
import { BENCHMARK_RETRIEVAL_CASE, runBlindDiscoveryBenchmark, type BenchmarkConnector } from '../core/discovery/blindDiscoveryBenchmarkRun';
import type { RetrievalOutcome, SourceDescriptor } from '../core/discovery/sources/scientificSourceAccess';

const RUN_TIMEOUT_MS = 60_000;

describe('blind discovery benchmark — genuinely executed, not fixtures', () => {
  it('runs against the REAL Node HTTP connector: real retrieval, real physics, real epidemiology replay', () => {
    const connector = createNodeHttpSourceConnector({ timeoutSeconds: 30 });
    const report = runBlindDiscoveryBenchmark(connector);

    // Retrieval: this exact public GitHub raw URL has been proven reachable
    // repeatedly across this session; a real 403/blocked result here would be
    // scored INCORRECT, not silently accepted.
    expect(report.retrieval.cases).toBe(1);

    // Physics: both established, independently-derivable verdicts must hold.
    expect(report.hypothesisVerdicts.cases).toBe(2);
    expect(report.hypothesisVerdicts.accuracy).toBe(1);
    for (const result of report.hypothesisVerdicts.results) {
      expect(result.correct).toBe(true);
    }

    // Replay: 5 real cases (2 physics self-replays + 1 epidemiology re-execution + 2 generated-hypothesis re-generations).
    expect(report.replay.cases).toHaveLength(5);
    expect(report.replay.matchRate).toBe(1);
    expect(report.replay.driftCount).toBe(0);
    expect(report.replay.blockedCount).toBe(0);

    // Next-action quality: every produced action must be defensible (states a
    // falsification criterion, discriminates something, fabricates no burden).
    expect(report.nextActionQuality.cases).toBeGreaterThan(0);
    expect(report.nextActionQuality.defensibleRate).toBe(1);

    // Hypothesis generation: real candidates from both generation strategies, with real falsification.
    expect(report.hypothesisGeneration.candidatesGenerated).toBeGreaterThan(2);
    expect(report.hypothesisGeneration.provenanceCompleteness).toBe(1);
    expect(report.hypothesisGeneration.formalizationSuccessRate).toBe(1);
    expect(report.hypothesisGeneration.falsificationSuccessRate).toBeGreaterThan(0);
    expect(report.hypothesisGeneration.unsupportedClaimRate).toBe(0);

    expect(report.summary).toMatch(/none is an estimate or a fixture/);
  }, RUN_TIMEOUT_MS);

  it('scores a BLOCKED retrieval as INCORRECT against an expectedReachable=true ground truth, never silently passing', () => {
    const blockedConnector: BenchmarkConnector = {
      retrieve: (descriptor: SourceDescriptor): RetrievalOutcome => ({
        sourceId: descriptor.sourceId,
        url: descriptor.url,
        state: 'BLOCKED',
        httpStatus: null,
        contentSha256: null,
        contentBytes: null,
        content: null,
        retrievedAt: new Date().toISOString(),
        reason: 'simulated proxy block for this test',
      }),
    };
    const report = runBlindDiscoveryBenchmark(blockedConnector);
    expect(BENCHMARK_RETRIEVAL_CASE.expectedReachable).toBe(true);
    expect(report.retrieval.accuracy).toBe(0);
    expect(report.extraction.extractionRate).toBe(0);
    // Physics and epidemiology do not depend on retrieval succeeding — they still run for real.
    expect(report.hypothesisVerdicts.accuracy).toBe(1);
    expect(report.replay.matchRate).toBe(1);
  });
});
