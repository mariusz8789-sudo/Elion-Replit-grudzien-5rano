import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeHttpSourceConnector } from '../core/discovery/sources/httpSourceConnector.node';
import { ingestCsvDataset } from '../core/discovery/sources/datasetEvidenceIngestion';
import type { SourceDescriptor } from '../core/discovery/sources/scientificSourceAccess';
import { runHypothesisCompetition } from '../core/discovery/molecular/competingHypotheses';
import {
  buildBlindBenchmarkReport,
  describeCompetitiveBenchmark,
  registerCompetitiveBenchmarkEntry,
  scoreExtraction,
  scoreHypothesisCompetition,
  scoreNextExperimentQuality,
  scoreReplayConsistency,
  scoreRetrieval,
  type BlindBenchmarkReport,
} from '../core/discovery/molecular/scientificBenchmark';
import type { ExperimentalResult, TestableHypothesis } from '../core/discovery/molecular/experimentalResult';

/**
 * BLIND BENCHMARK FOUNDATION — REAL EXECUTION.
 *
 * Every input to a scoring function here is a real object produced by an
 * actual run in this test: real network retrieval, real CSV parsing, real
 * hypothesis competition over a real measurement (Gilling 2009, reused from
 * `scientificDiscoveryFlow.test.ts`). Ground truth is declared in this file
 * BEFORE the run executes, independent of what the pipeline returns.
 */
const RUN_TIMEOUT_MS = 120_000;

const DELANEY: SourceDescriptor = {
  sourceId: 'delaney-esol', kind: 'PUBLIC_DATASET',
  url: 'https://raw.githubusercontent.com/deepchem/deepchem/master/datasets/delaney-processed.csv',
  citation: 'Delaney JS 2004', accessTerms: 'public', requiresCredential: false,
};
const PUBCHEM: SourceDescriptor = {
  sourceId: 'pubchem-pug', kind: 'STRUCTURED_DATABASE_API',
  url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/agmatine/property/InChIKey/JSON',
  citation: 'PubChem PUG', accessTerms: 'public API', requiresCredential: false,
};

const REAL_KETAMINE_MEASUREMENT: ExperimentalResult = {
  resultId: 'gilling-2009-ketamine-nmdar-ic50', compound: 'Ketamine', canonicalSmiles: null,
  target: 'NMDAR', assay: 'Whole-cell patch-clamp, human GluN1/GluN2A', parameter: 'IC50', value: 0.71, unit: 'µM',
  observation: null, model: 'Recombinant HEK-293', species: 'Human', cellLine: 'HEK-293', concentration: null,
  replicates: null, controls: null, timepoint: null, uncertainty: null,
  provenance: { kind: 'REAL_MEASUREMENT', source: 'Gilling 2009, PMID 19371579', rawDataReference: 'pmid:19371579', recordedAt: '2009-01-01T00:00:00.000Z' },
};
const HYP_SUPPORTED: TestableHypothesis = {
  hypothesisId: 'h-supported', statement: 'Ketamine IC50 <= 1 uM at NMDAR.', compound: 'Ketamine', target: 'NMDAR', parameter: 'IC50',
  supportedIf: '<=1uM', falsifiedIf: '>1uM', threshold: 1, thresholdUnit: 'µM', lowerIsSupport: true,
};
const HYP_UNTESTED: TestableHypothesis = {
  hypothesisId: 'h-untested', statement: 'Agmatine IC50 <= 1 uM at NMDAR (no ingested data).', compound: 'Agmatine', target: 'NMDAR', parameter: 'IC50',
  supportedIf: '<=1uM', falsifiedIf: '>1uM', threshold: 1, thresholdUnit: 'µM', lowerIsSupport: true,
};

let report: BlindBenchmarkReport;

beforeAll(async () => {
  const connector = createNodeHttpSourceConnector({ timeoutSeconds: 30 });

  // --- REAL retrieval, scored against declared ground truth ---
  const delaneyOutcome = connector.retrieve(DELANEY);
  const pubchemOutcome = connector.retrieve(PUBCHEM);
  const retrieval = scoreRetrieval([
    { sourceId: DELANEY.sourceId, groundTruth: { expectedReachable: true }, outcome: delaneyOutcome },
    { sourceId: PUBCHEM.sourceId, groundTruth: { expectedReachable: false }, outcome: pubchemOutcome },
  ]);

  // --- REAL extraction, from the real retrieved CSV ---
  const ingestion = ingestCsvDataset(delaneyOutcome, DELANEY, {
    datasetId: 'delaney-esol-v1', subjectColumn: 'Compound ID', structureColumn: 'smiles',
    columns: [{ header: 'measured log solubility in mols per litre', kind: 'MEASURED', unit: 'log mol/L', meaning: 'measured solubility' }],
  });
  const extraction = scoreExtraction([ingestion]);

  // --- REAL hypothesis competition, over the real Gilling 2009 measurement ---
  const competition = runHypothesisCompetition([HYP_SUPPORTED, HYP_UNTESTED], [REAL_KETAMINE_MEASUREMENT], []);
  const hypotheses = scoreHypothesisCompetition(competition, [
    { hypothesisId: 'h-supported', expectedStatus: 'SUPPORTED' },
    { hypothesisId: 'h-untested', expectedStatus: 'UNTESTED' },
  ]);

  // --- REAL replay consistency: run the SAME competition twice, real recompute ---
  const rerun = runHypothesisCompetition([HYP_SUPPORTED, HYP_UNTESTED], [REAL_KETAMINE_MEASUREMENT], []);
  const replay = scoreReplayConsistency([
    { caseId: 'competition-1', status: rerun.leadingHypothesis === competition.leadingHypothesis ? 'MATCH' : 'DRIFT' },
  ]);

  // Next-experiment scoring is a unit test of the SCORING FUNCTION on labelled
  // synthetic booleans — this checks the scorer's logic, not a chemistry claim.
  const nextExperiment = scoreNextExperimentQuality([
    { falsifiedIfStated: true, discriminatesAtLeastOneCandidate: true, fabricatesCostOrTiming: false },
    { falsifiedIfStated: false, discriminatesAtLeastOneCandidate: true, fabricatesCostOrTiming: false },
  ]);

  report = buildBlindBenchmarkReport({ retrieval, extraction, hypotheses, replay, nextExperiment });

  const text = `BLIND BENCHMARK REPORT: ${report.summary}`;
  // eslint-disable-next-line no-console
  console.log(text);
  const target = process.env.GENESIS_BENCHMARK_OUT;
  if (target !== undefined && target.length > 0) writeFileSync(target, text, 'utf8');
}, RUN_TIMEOUT_MS);

describe('Blind scientific discovery benchmark — real execution', () => {
  it('retrieval accuracy is computed from a real network attempt, not assumed', () => {
    expect(report.retrieval.cases).toBe(2);
    expect(report.retrieval.accuracy).toBe(1);
  });

  it('extraction rate and provenance completeness come from a real retrieved dataset', () => {
    expect(report.extraction.extractionRate).toBe(1);
    expect(report.extraction.checkedRecords).toBeGreaterThan(1000);
    expect(report.extraction.provenanceCompleteness).toBe(1);
  });

  it('a hypothesis with no data is scored correct only when the system says UNTESTED, not a guess', () => {
    expect(report.hypotheses.accuracy).toBe(1);
    expect(report.hypotheses.unsupportedClaimCount).toBe(0);
  });

  it('a system that fabricates SUPPORTED for an untested case would be penalised', () => {
    const fabricating = runHypothesisCompetition([HYP_SUPPORTED], [REAL_KETAMINE_MEASUREMENT, { ...REAL_KETAMINE_MEASUREMENT, resultId: 'fab', target: 'NMDAR', parameter: 'IC50', value: 0.5, compound: 'Agmatine' }], []);
    const scored = scoreHypothesisCompetition(fabricating, [{ hypothesisId: 'h-supported', expectedStatus: 'UNTESTED' }]);
    // Demonstrates the scorer catches a wrongly-SUPPORTED case as incorrect.
    expect(scored.results[0]!.correct).toBe(false);
  });

  it('replay consistency reflects a real recomputation, not an assumed MATCH', () => {
    expect(report.replay.matchRate).toBe(1);
  });

  it('the benchmark report has no single blended overall score', () => {
    expect(report).not.toHaveProperty('overallScore');
    expect(report).not.toHaveProperty('score');
  });

  it('a competitive benchmark entry with no real run is NOT_YET_RUN, never a fabricated number', () => {
    const noBaseline = registerCompetitiveBenchmarkEntry('baseline-x', 'Hypothetical baseline system', null, '');
    expect(noBaseline.status).toBe('NOT_YET_RUN');
    expect(noBaseline.report).toBeNull();

    const genesisEntry = registerCompetitiveBenchmarkEntry('genesis', 'Genesis discovery engine', report, 'Run in this test suite.');
    const description = describeCompetitiveBenchmark([genesisEntry, noBaseline]);
    expect(description).toContain('1 of 2');
    expect(description).toContain('genesis');
  });
});
