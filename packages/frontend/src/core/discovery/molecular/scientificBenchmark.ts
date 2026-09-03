import type { RetrievalOutcome } from '../sources/scientificSourceAccess';
import type { DatasetIngestionResult } from '../sources/datasetEvidenceIngestion';
import type { HypothesisCompetitionResult } from './competingHypotheses';

/**
 * BLIND SCIENTIFIC DISCOVERY BENCHMARK — foundation.
 *
 * "Blind" means the expected answer is declared BEFORE the run, in a form the
 * discovery pipeline never sees (it is compared against the OUTPUT after the
 * fact, never fed in as an input). This module computes metrics FROM REAL RUN
 * OUTPUTS ONLY. There is no scoring function here that can produce a number
 * without a real `RetrievalOutcome`, `DatasetIngestionResult` or
 * `HypothesisCompetitionResult` behind it — that is what stops a benchmark
 * score from becoming a number someone typed in.
 *
 * A case whose ground truth says "no data should exist" is scored CORRECT
 * when the system reports UNKNOWN/BLOCKED/NOT_EXTRACTED, and INCORRECT if it
 * reports anything else — including a plausible-looking value. Getting that
 * case right is worth exactly as much as getting a positive case right; a
 * benchmark that only rewards finding things would push a system toward
 * guessing.
 */
export const SCIENTIFIC_BENCHMARK_VERSION = '1.0.0';

export interface RetrievalGroundTruth {
  /** Whether this specific source is expected to be reachable in THIS runtime. */
  expectedReachable: boolean;
}

export interface RetrievalCaseResult {
  sourceId: string;
  groundTruth: RetrievalGroundTruth;
  outcome: RetrievalOutcome;
  correct: boolean;
  reason: string;
}

/** Scores retrieval outcomes against declared expectations. Every case here is a real network attempt. */
export function scoreRetrieval(cases: readonly { sourceId: string; groundTruth: RetrievalGroundTruth; outcome: RetrievalOutcome }[]): {
  results: readonly RetrievalCaseResult[];
  accuracy: number;
} {
  const results = cases.map((c) => {
    const actuallyReachable = c.outcome.state === 'RETRIEVED';
    const correct = actuallyReachable === c.groundTruth.expectedReachable;
    return {
      sourceId: c.sourceId,
      groundTruth: c.groundTruth,
      outcome: c.outcome,
      correct,
      reason: correct
        ? `Expected reachable=${c.groundTruth.expectedReachable}, observed state ${c.outcome.state} — matches.`
        : `Expected reachable=${c.groundTruth.expectedReachable}, observed state ${c.outcome.state} — does NOT match; the source's real reachability changed or the expectation was wrong.`,
    };
  });
  return { results, accuracy: cases.length === 0 ? 0 : results.filter((r) => r.correct).length / cases.length };
}

export interface EvidenceExtractionScore {
  /** Fraction of retrieved sources that yielded EXTRACTED evidence. */
  extractionRate: number;
  /** Fraction of extracted records carrying every required provenance field. */
  provenanceCompleteness: number;
  checkedRecords: number;
}

/**
 * Scores extraction and provenance from a REAL `DatasetIngestionResult`.
 * Provenance completeness checks the fields that matter for tracing a claim
 * back to its source: URL, content hash, row index, citation.
 */
export function scoreExtraction(ingestions: readonly DatasetIngestionResult[]): EvidenceExtractionScore {
  const extracted = ingestions.filter((i) => i.state === 'EXTRACTED');
  const extractionRate = ingestions.length === 0 ? 0 : extracted.length / ingestions.length;

  const allRecords = extracted.flatMap((i) => i.records);
  const complete = allRecords.filter((r) =>
    r.provenance.url.length > 0
    && r.provenance.contentSha256.length === 64
    && r.provenance.rowIndex > 0
    && r.provenance.citation.length > 0);

  return {
    extractionRate,
    provenanceCompleteness: allRecords.length === 0 ? 0 : complete.length / allRecords.length,
    checkedRecords: allRecords.length,
  };
}

export interface HypothesisCaseGroundTruth {
  hypothesisId: string;
  /** Declared BEFORE the run, from data known independently of this pipeline. */
  expectedStatus: 'SUPPORTED' | 'WEAKENED' | 'FALSIFIED' | 'UNTESTED' | 'BLOCKED';
}

export interface HypothesisCaseResult {
  hypothesisId: string;
  expected: HypothesisCaseGroundTruth['expectedStatus'];
  actual: string;
  correct: boolean;
}

/**
 * Scores a real `HypothesisCompetitionResult` against declared expectations.
 * An UNTESTED expectation scored correct only when the system ALSO says
 * UNTESTED — a system that fabricates SUPPORTED for a compound with no data
 * fails this case exactly as loudly as one that misses a real finding.
 */
export function scoreHypothesisCompetition(
  competition: HypothesisCompetitionResult,
  groundTruth: readonly HypothesisCaseGroundTruth[],
): { results: readonly HypothesisCaseResult[]; accuracy: number; unsupportedClaimCount: number } {
  const results = groundTruth.map((gt) => {
    const outcome = competition.outcomes.find((o) => o.hypothesisId === gt.hypothesisId);
    const actual = outcome?.competitionStatus ?? 'MISSING';
    return { hypothesisId: gt.hypothesisId, expected: gt.expectedStatus, actual, correct: actual === gt.expectedStatus };
  });

  // An "unsupported claim" here means: the system claimed SUPPORTED or
  // WEAKENED (a positive claim about mechanism) where ground truth says no
  // data should support that at all (UNTESTED expected).
  const unsupportedClaimCount = results.filter((r) =>
    r.expected === 'UNTESTED' && (r.actual === 'SUPPORTED' || r.actual === 'WEAKENED')).length;

  return {
    results,
    accuracy: groundTruth.length === 0 ? 0 : results.filter((r) => r.correct).length / groundTruth.length,
    unsupportedClaimCount,
  };
}

export interface ReplayConsistencyCase {
  caseId: string;
  status: 'MATCH' | 'DRIFT' | 'BLOCKED';
}

export function scoreReplayConsistency(cases: readonly ReplayConsistencyCase[]): { matchRate: number; driftCount: number; blockedCount: number } {
  return {
    matchRate: cases.length === 0 ? 0 : cases.filter((c) => c.status === 'MATCH').length / cases.length,
    driftCount: cases.filter((c) => c.status === 'DRIFT').length,
    blockedCount: cases.filter((c) => c.status === 'BLOCKED').length,
  };
}

export interface NextExperimentQualityCase {
  falsifiedIfStated: boolean;
  discriminatesAtLeastOneCandidate: boolean;
  fabricatesCostOrTiming: boolean;
}

/**
 * A proposal is DEFENSIBLE only when it states a falsification condition,
 * actually discriminates something, and invents no cost/timing/feasibility
 * numbers Genesis has no basis for.
 */
export function scoreNextExperimentQuality(cases: readonly NextExperimentQualityCase[]): { defensibleRate: number } {
  const defensible = cases.filter((c) => c.falsifiedIfStated && c.discriminatesAtLeastOneCandidate && !c.fabricatesCostOrTiming);
  return { defensibleRate: cases.length === 0 ? 0 : defensible.length / cases.length };
}

export interface BlindBenchmarkReport {
  retrieval: { accuracy: number; cases: number };
  extraction: EvidenceExtractionScore;
  hypotheses: { accuracy: number; unsupportedClaimCount: number; cases: number };
  replay: { matchRate: number; driftCount: number; blockedCount: number };
  nextExperiment: { defensibleRate: number };
  summary: string;
}

/**
 * Assembles the full report from real component scores. There is no
 * aggregate "overall score" — a single blended number would hide which
 * capability is actually weak, which is the opposite of what a benchmark is
 * for.
 */
export function buildBlindBenchmarkReport(input: {
  retrieval: ReturnType<typeof scoreRetrieval>;
  extraction: EvidenceExtractionScore;
  hypotheses: ReturnType<typeof scoreHypothesisCompetition>;
  replay: ReturnType<typeof scoreReplayConsistency>;
  nextExperiment: ReturnType<typeof scoreNextExperimentQuality>;
}): BlindBenchmarkReport {
  return {
    retrieval: { accuracy: input.retrieval.accuracy, cases: input.retrieval.results.length },
    extraction: input.extraction,
    hypotheses: { accuracy: input.hypotheses.accuracy, unsupportedClaimCount: input.hypotheses.unsupportedClaimCount, cases: input.hypotheses.results.length },
    replay: input.replay,
    nextExperiment: input.nextExperiment,
    summary: `retrieval ${(input.retrieval.accuracy * 100).toFixed(0)}% (${input.retrieval.results.length} cases), `
      + `extraction rate ${(input.extraction.extractionRate * 100).toFixed(0)}%, provenance completeness ${(input.extraction.provenanceCompleteness * 100).toFixed(0)}% `
      + `(${input.extraction.checkedRecords} records), hypothesis accuracy ${(input.hypotheses.accuracy * 100).toFixed(0)}% `
      + `(${input.hypotheses.unsupportedClaimCount} unsupported claim(s)), replay match rate ${(input.replay.matchRate * 100).toFixed(0)}%, `
      + `defensible next-experiment rate ${(input.nextExperiment.defensibleRate * 100).toFixed(0)}%. `
      + 'Every figure above is computed from a real run recorded elsewhere in this report; none is an estimate.',
  };
}

/**
 * COMPETITIVE BENCHMARK — foundation only.
 *
 * A comparison entry for another system is legitimate ONLY when it carries
 * its own real run record. `NOT_YET_RUN` is the default and the only value
 * this module will accept without one — there is no path here that produces
 * a comparison number for a system nobody actually executed.
 */
export type CompetitiveBenchmarkStatus = 'NOT_YET_RUN' | 'RUN_RECORDED';

export interface CompetitiveBenchmarkEntry {
  systemId: string;
  systemDescription: string;
  status: CompetitiveBenchmarkStatus;
  /** Present only when status is RUN_RECORDED, and must reference a real report. */
  report: BlindBenchmarkReport | null;
  /** How the run was actually executed, for anyone auditing the comparison. */
  executionNote: string;
}

export function registerCompetitiveBenchmarkEntry(
  systemId: string,
  systemDescription: string,
  report: BlindBenchmarkReport | null,
  executionNote: string,
): CompetitiveBenchmarkEntry {
  if (report === null) {
    return { systemId, systemDescription, status: 'NOT_YET_RUN', report: null, executionNote: 'No comparison run exists yet for this system in this runtime.' };
  }
  return { systemId, systemDescription, status: 'RUN_RECORDED', report, executionNote };
}

export function describeCompetitiveBenchmark(entries: readonly CompetitiveBenchmarkEntry[]): string {
  const recorded = entries.filter((e) => e.status === 'RUN_RECORDED');
  return `${recorded.length} of ${entries.length} system(s) have a real recorded run. `
    + (recorded.length === 0
      ? 'No comparison is possible yet — no baseline has actually been executed.'
      : `Compared: ${recorded.map((e) => e.systemId).join(', ')}. Systems with NOT_YET_RUN carry no score and are not ranked.`);
}
