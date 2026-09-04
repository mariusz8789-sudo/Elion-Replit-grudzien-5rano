import {
  executePreregisteredHypotheses, executePreregisteredHypothesesAsync, generateCompetingHypotheses,
  HYPOTHESIS_PROBLEMS, preregisterHypotheses, selectNextHypothesisExperiment,
  type HypothesisLoopResult, type HypothesisOutcome, type HypothesisProblem, type HypothesisStatus,
  type NextHypothesisExperiment,
} from './hypothesisLoop';
import type { ScientificEvidenceChain } from './scientificDiscovery';
import { getScenarioTimelineByRunId } from './worldHandoff';
import { analyzeExperiment, type ExperimentAnalysis } from '../observationAnalysis/analysis';
import { extractObservations } from '../observationAnalysis/observationExtraction';
import { deriveFindings, type Finding } from '../observationAnalysis/findings';
import type { Observation } from '../observationAnalysis/observationModel';
import type { ScenarioRun } from '../simulation/scenarioEngine';

/**
 * SCIENTIFIC DISCOVERY LOOP — ASSEMBLES existing systems into one closed
 * cycle: Question → Hypothesis → Experiment Design → Execution →
 * Observation → Analysis → Falsification → Comparison → Next Experiment.
 *
 * Every stage below is an EXISTING Genesis system, called as-is:
 *  - Question/Hypothesis/Experiment Design/Execution/Falsification:
 *    `hypothesisLoop.ts` (`HYPOTHESIS_PROBLEMS`, `generateCompetingHypotheses`,
 *    `preregisterHypotheses`, `executePreregisteredHypotheses`) — unchanged.
 *  - Observation/Analysis/Findings: `observationAnalysis/*` (merged from
 *    PR #4) — unchanged, called exactly as designed (`ScenarioRun` in,
 *    `Observation[]`/`ExperimentAnalysis`/`Finding[]` out).
 *  - Comparison (ranking hypotheses against each other):
 *    `HypothesisLoopResult.discrimination` — unchanged.
 *  - Next Experiment: `selectNextHypothesisExperiment` — unchanged.
 *
 * This file adds EXACTLY ONE new thing: the bridge from a hypothesis's real
 * evidence chain (`ScientificEvidenceChain`, keyed by run IDs) to the real
 * `ScenarioRun` behind each run (via the existing `getScenarioTimelineByRunId`
 * — the same lookup `world/epidemiologyWorldAdapter.ts` already uses), so
 * Observation/Analysis/Findings can be computed per hypothesis. No new
 * simulator, no new replay engine, no new evidence store, no new epistemic
 * ontology, no new renderer.
 */
export const SCIENTIFIC_DISCOVERY_LOOP_VERSION = '1.0.0';

/**
 * One hypothesis's link in the full evidence chain:
 * Hypothesis → Experiment → Run → Observation → Analysis → Finding → Evidence.
 * `evidenceChainId`/`evidencePackId` are the existing `ScientificEvidenceChain`/
 * `ScientificEvidencePack` identifiers already produced by `hypothesisLoop.ts`.
 */
export interface HypothesisEvidenceChainLink {
  hypothesisId: string;
  status: HypothesisStatus;
  evidenceChainId: string | null;
  evidencePackId: string | null;
  baselineRunId: string | null;
  variantRunId: string | null;
  observations: readonly Observation[];
  analysis: ExperimentAnalysis | null;
  findings: readonly Finding[];
  /** Set only when Observation/Analysis genuinely could not run — never a fabricated result. */
  notModeled?: string;
}

function scenarioRunForOutcomeRun(runId: string | null): ScenarioRun | null {
  if (runId === null) return null;
  const timeline = getScenarioTimelineByRunId(runId);
  return timeline !== null && timeline.scenarioRun.status === 'COMPLETED' ? timeline.scenarioRun : null;
}

function emptyLink(outcome: HypothesisOutcome, reason: string): HypothesisEvidenceChainLink {
  return {
    hypothesisId: outcome.hypothesisId,
    status: outcome.status,
    evidenceChainId: outcome.evidenceChainId,
    evidencePackId: outcome.evidencePackId,
    baselineRunId: null,
    variantRunId: null,
    observations: [],
    analysis: null,
    findings: [],
    notModeled: reason,
  };
}

/**
 * Builds the Observation → Analysis → Finding link for ONE hypothesis
 * outcome, reading the real `ScenarioRun` behind its baseline/variant arms.
 * Domains without a registered scenario timeline (e.g. chemistry/physics
 * backend models) report `notModeled` — Observation/Analysis is scoped to
 * the Scenario Engine, and this bridge never invents data for domains it
 * does not cover.
 */
export function buildHypothesisEvidenceLink(outcome: HypothesisOutcome, chain: ScientificEvidenceChain | undefined): HypothesisEvidenceChainLink {
  if (outcome.status === 'BLOCKED' || chain === undefined) {
    return emptyLink(outcome, 'Hipoteza nie została wykonana — brak łańcucha dowodowego do zaobserwowania.');
  }
  const baselineRunId = chain.arms.find((arm) => arm.kind === 'baseline')?.runIds[0] ?? null;
  const variantRunId = chain.arms.find((arm) => arm.kind === 'variant')?.runIds[0] ?? null;
  const variantRun = scenarioRunForOutcomeRun(variantRunId);
  if (variantRun === null) {
    return {
      ...emptyLink(outcome, 'Ta domena/model nie ma zarejestrowanej osi czasu Scenario Engine — Observation/Analysis obejmuje wyłącznie scenario-timeline.'),
      baselineRunId, variantRunId,
    };
  }
  const baselineRun = scenarioRunForOutcomeRun(baselineRunId) ?? undefined;
  const observations = extractObservations(variantRun);
  const analysis = analyzeExperiment(variantRun, baselineRun);
  const findings = deriveFindings(variantRun, analysis);
  return {
    hypothesisId: outcome.hypothesisId,
    status: outcome.status,
    evidenceChainId: outcome.evidenceChainId,
    evidencePackId: outcome.evidencePackId,
    baselineRunId,
    variantRunId,
    observations,
    analysis,
    findings,
  };
}

/** Builds the evidence chain link for every hypothesis outcome in a real, executed loop. */
export function buildEvidenceChain(loopResult: HypothesisLoopResult): readonly HypothesisEvidenceChainLink[] {
  return loopResult.outcomes.map((outcome) => {
    const chain = loopResult.chains.find((entry) => entry.evidenceId === outcome.evidenceChainId);
    return buildHypothesisEvidenceLink(outcome, chain);
  });
}

export interface ScientificDiscoveryLoopResult {
  contractVersion: string;
  problem: HypothesisProblem;
  loop: HypothesisLoopResult;
  evidenceChain: readonly HypothesisEvidenceChainLink[];
  nextExperiment: NextHypothesisExperiment;
}

/**
 * Runs the FULL closed loop for one declared research question, end to end,
 * deterministically: Question(`HypothesisProblem`) → Hypothesis
 * (`generateCompetingHypotheses`) → Experiment Design (built into the same
 * step) → Execution (`executePreregisteredHypotheses`, real Scenario Engine
 * runs) → Observation/Analysis (`buildEvidenceChain`, real
 * `observationAnalysis/*`) → Falsification (`outcomes[].status`, already
 * computed by execution) → Comparison (`discrimination`) → Next Experiment
 * (`selectNextHypothesisExperiment`).
 */
function resolveProblem(problemId: string): HypothesisProblem {
  const problem = HYPOTHESIS_PROBLEMS.find((entry) => entry.problemId === problemId);
  if (problem === undefined) {
    throw new Error(`Nieznany problem badawczy: ${problemId}. Dostępne: ${HYPOTHESIS_PROBLEMS.map((entry) => entry.problemId).join(', ')}.`);
  }
  return problem;
}

export function runScientificDiscoveryLoop(problemId: string): ScientificDiscoveryLoopResult {
  const problem = resolveProblem(problemId);
  const loop = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(problem)));
  return {
    contractVersion: SCIENTIFIC_DISCOVERY_LOOP_VERSION,
    problem,
    loop,
    evidenceChain: buildEvidenceChain(loop),
    nextExperiment: selectNextHypothesisExperiment(loop),
  };
}

/**
 * ASYNC / BACKEND-AWARE TWIN OF `runScientificDiscoveryLoop`.
 *
 * `HYPOTHESIS_PROBLEMS` already declares questions whose model is
 * `BACKEND_REAL_ENGINE` (real RDKit, real PySCF) rather than a local
 * synchronous model — the sync loop above can only report BLOCKED for
 * those, because `executePreregisteredHypotheses` has no path to the
 * network. This function changes nothing about the loop's shape: it
 * calls the already-existing `executePreregisteredHypothesesAsync`
 * (`hypothesisLoop.ts`), which itself already routes BACKEND_REAL_ENGINE
 * hypotheses through the real Fabric backend and leaves local models on
 * the synchronous path unchanged. This is what makes
 * `runScientificDiscoveryLoop*` a general entry point over the WHOLE
 * declared `HYPOTHESIS_PROBLEMS` catalog, not only its local-model
 * subset — no new executor was added.
 */
export async function runScientificDiscoveryLoopAsync(problemId: string): Promise<ScientificDiscoveryLoopResult> {
  const problem = resolveProblem(problemId);
  const loop = await executePreregisteredHypothesesAsync(preregisterHypotheses(generateCompetingHypotheses(problem)));
  return {
    contractVersion: SCIENTIFIC_DISCOVERY_LOOP_VERSION,
    problem,
    loop,
    evidenceChain: buildEvidenceChain(loop),
    nextExperiment: selectNextHypothesisExperiment(loop),
  };
}
