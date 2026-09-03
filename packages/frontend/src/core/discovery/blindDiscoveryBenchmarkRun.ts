/**
 * BLIND DISCOVERY BENCHMARK — a genuinely executed run, not fixtures.
 *
 * `molecular/scientificBenchmark.ts` is a real scoring foundation, but until
 * now nothing actually fed it real domain output — every consumer was a unit
 * test with a hand-built fixture. This module closes that gap: it executes
 * REAL domain code (a real HTTP retrieval, real physics derivations, a real
 * epidemic-simulation hypothesis loop) and scores the REAL results, with
 * every ground-truth expectation declared in this file BEFORE being compared
 * against anything a run produces.
 *
 * WHAT COUNTS AS "BLIND" HERE: the expected retrieval reachability and the
 * expected physics verdicts are independently-derivable facts (a public
 * GitHub raw URL that this session has repeatedly proven reachable; and
 * textbook, well-established physics conclusions — GR dominates this GPS
 * orbit, light climbing away from Earth redshifts) — not numbers read off a
 * run and typed back in afterward. The epidemiology axis carries NO
 * hypothesis-accuracy ground truth, deliberately: nobody can honestly declare
 * in advance which scenario "wins" an uncalibrated simulation without that
 * being circular, so epidemiology contributes ONLY to the replay-consistency
 * axis, where self-consistency (not an external answer) is the real thing
 * being measured.
 *
 * RETRIEVAL IS DEPENDENCY-INJECTED so this module stays platform-neutral —
 * the real Node HTTP connector is constructed by the caller (a test running
 * under Node), exactly like every other real-retrieval test in this engine.
 */
import {
  scoreExtraction,
  scoreNextExperimentQuality,
  scoreRetrieval,
  scoreReplayConsistency,
  scoreVerdictCases,
  type EvidenceExtractionScore,
  type NextExperimentQualityCase,
  type ReplayConsistencyCase,
  type VerdictCaseResult,
} from './molecular/scientificBenchmark';
import { ingestCsvDataset } from './sources/datasetEvidenceIngestion';
import type { RetrievalOutcome, SourceDescriptor } from './sources/scientificSourceAccess';
import { replayRelativisticTimeDilationCase, runRelativisticTimeDilationCase, toStandardScientificResult as gpsToStandard } from './physics/relativisticTimeDilation';
import { replayGravitationalRedshiftCase, runGravitationalRedshiftCase, toStandardScientificResult as redshiftToStandard } from './physics/gravitationalRedshift';
import { toNextScientificAction } from './physics/physicsCaseContract';
import type { NextScientificAction } from './nextScientificAction';
import { buildNextActionsFromSpacetimeInquiry, runSpacetimeStructureInquiry } from './physics/spacetimeStructureInquiry';
import { executePreregisteredHypotheses, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS, preregisterHypotheses, buildSavedHypothesisLoop, replaySavedHypothesisLoop } from '../experimentFabric/hypothesisLoop';

export const BLIND_DISCOVERY_BENCHMARK_RUN_VERSION = '1.0.0';

export interface BenchmarkConnector {
  retrieve(descriptor: SourceDescriptor): RetrievalOutcome;
}

/** Declared once, reused for both retrieval and extraction — this session has proven this exact URL reachable repeatedly. */
export const BENCHMARK_RETRIEVAL_CASE: { descriptor: SourceDescriptor; expectedReachable: boolean } = {
  descriptor: {
    sourceId: 'delaney-esol', kind: 'PUBLIC_DATASET',
    url: 'https://raw.githubusercontent.com/deepchem/deepchem/master/datasets/delaney-processed.csv',
    citation: 'Delaney JS 2004', accessTerms: 'public', requiresCredential: false,
  },
  expectedReachable: true,
};

function nextActionQualityCase(action: NextScientificAction): NextExperimentQualityCase {
  return {
    falsifiedIfStated: action.falsificationCriteria.trim().length > 0,
    discriminatesAtLeastOneCandidate: action.targetHypothesisIds.length > 0,
    fabricatesCostOrTiming: action.estimatedBurden !== 'UNKNOWN' && action.burdenReasoning.trim().length === 0,
  };
}

export interface BlindDiscoveryBenchmarkRunReport {
  contractVersion: string;
  retrieval: { accuracy: number; cases: number };
  extraction: EvidenceExtractionScore;
  hypothesisVerdicts: { accuracy: number; cases: number; results: readonly VerdictCaseResult[] };
  replay: { matchRate: number; driftCount: number; blockedCount: number; cases: readonly ReplayConsistencyCase[] };
  nextActionQuality: { defensibleRate: number; cases: number };
  summary: string;
}

/**
 * Runs the benchmark NOW, for real. Every score below is computed from an
 * actual function call this run makes — retrieval and extraction over a real
 * HTTP fetch, physics derivations run twice each (once for the result, once
 * for replay), and the epidemiology hypothesis loop preregistered, executed,
 * and replayed by re-executing it from its own saved inputs.
 */
export function runBlindDiscoveryBenchmark(connector: BenchmarkConnector): BlindDiscoveryBenchmarkRunReport {
  // --- Retrieval + extraction: one real HTTP fetch, scored against a ground truth declared above. ---
  const retrievalOutcome = connector.retrieve(BENCHMARK_RETRIEVAL_CASE.descriptor);
  const retrieval = scoreRetrieval([{
    sourceId: BENCHMARK_RETRIEVAL_CASE.descriptor.sourceId,
    groundTruth: { expectedReachable: BENCHMARK_RETRIEVAL_CASE.expectedReachable },
    outcome: retrievalOutcome,
  }]);
  const ingestion = ingestCsvDataset(retrievalOutcome, BENCHMARK_RETRIEVAL_CASE.descriptor, {
    datasetId: 'delaney-esol-benchmark', subjectColumn: 'Compound ID', structureColumn: 'smiles',
    columns: [{ header: 'measured log solubility in mols per litre', kind: 'MEASURED', unit: 'log mol/L', meaning: 'measured solubility' }],
  });
  const extraction = scoreExtraction([ingestion]);

  // --- Physics: two real derivations, each checked against an established, independently-derivable verdict. ---
  const gpsResult = runRelativisticTimeDilationCase();
  const redshiftResult = runGravitationalRedshiftCase();
  const hypothesisVerdicts = scoreVerdictCases([
    {
      caseId: 'GPS_TIME_DILATION:H_GR_DOMINATES',
      expected: 'SUPPORTED',
      actual: gpsResult.hypotheses.find((h) => h.hypothesisId === 'H_GR_DOMINATES')?.verdict ?? 'MISSING',
    },
    {
      caseId: 'GRAVITATIONAL_REDSHIFT:H_CLIMBING_LIGHT_REDSHIFTS',
      expected: 'SUPPORTED',
      actual: redshiftResult.hypotheses.find((h) => h.hypothesisId === 'H_CLIMBING_LIGHT_REDSHIFTS')?.verdict ?? 'MISSING',
    },
  ]);

  // --- Replay: physics (self-contained) + epidemiology (re-executes the preregistered set from its own saved inputs). ---
  const gpsReplay = replayRelativisticTimeDilationCase(gpsResult);
  const redshiftReplay = replayGravitationalRedshiftCase(redshiftResult);

  const epidemiologyProblem = HYPOTHESIS_PROBLEMS[0]!;
  const epidemiologySet = generateCompetingHypotheses(epidemiologyProblem);
  const epidemiologyPrereg = preregisterHypotheses(epidemiologySet);
  const epidemiologyResult = executePreregisteredHypotheses(epidemiologyPrereg);
  const epidemiologySaved = buildSavedHypothesisLoop(epidemiologyResult);
  const epidemiologyReplay = replaySavedHypothesisLoop(epidemiologySaved);

  const replay = scoreReplayConsistency([
    { caseId: 'GPS_TIME_DILATION', status: gpsReplay.status },
    { caseId: 'GRAVITATIONAL_REDSHIFT', status: redshiftReplay.status },
    { caseId: 'EPIDEMIOLOGY_HYPOTHESIS_LOOP', status: epidemiologyReplay.status },
  ]);

  // --- Next-action quality: every physics + temporal next action this run actually produced. ---
  const spacetimeInquiry = runSpacetimeStructureInquiry();
  const nextActions: readonly NextScientificAction[] = [
    toNextScientificAction(gpsToStandard(gpsResult)),
    toNextScientificAction(redshiftToStandard(redshiftResult)),
    ...buildNextActionsFromSpacetimeInquiry(spacetimeInquiry),
  ];
  const nextActionQuality = scoreNextExperimentQuality(nextActions.map(nextActionQualityCase));

  return {
    contractVersion: BLIND_DISCOVERY_BENCHMARK_RUN_VERSION,
    retrieval: { accuracy: retrieval.accuracy, cases: retrieval.results.length },
    extraction,
    hypothesisVerdicts: { accuracy: hypothesisVerdicts.accuracy, cases: hypothesisVerdicts.results.length, results: hypothesisVerdicts.results },
    replay: { matchRate: replay.matchRate, driftCount: replay.driftCount, blockedCount: replay.blockedCount, cases: [
      { caseId: 'GPS_TIME_DILATION', status: gpsReplay.status },
      { caseId: 'GRAVITATIONAL_REDSHIFT', status: redshiftReplay.status },
      { caseId: 'EPIDEMIOLOGY_HYPOTHESIS_LOOP', status: epidemiologyReplay.status },
    ] },
    nextActionQuality: { defensibleRate: nextActionQuality.defensibleRate, cases: nextActions.length },
    summary: `retrieval ${(retrieval.accuracy * 100).toFixed(0)}% (${retrieval.results.length} case), `
      + `extraction rate ${(extraction.extractionRate * 100).toFixed(0)}% / provenance completeness ${(extraction.provenanceCompleteness * 100).toFixed(0)}% (${extraction.checkedRecords} records), `
      + `physics hypothesis-verdict accuracy ${(hypothesisVerdicts.accuracy * 100).toFixed(0)}% (${hypothesisVerdicts.results.length} cases), `
      + `replay match rate ${(replay.matchRate * 100).toFixed(0)}% across ${3} case(s) (physics x2 self-replay, epidemiology hypothesis-loop re-execution), `
      + `next-action defensible rate ${(nextActionQuality.defensibleRate * 100).toFixed(0)}% (${nextActions.length} actions). `
      + 'Every figure is computed from a real call this run made; none is an estimate or a fixture.',
  };
}
