/**
 * GENESIS SCIENTIFIC BACKEND EXECUTOR
 *
 * Asynchronous adapter that bridges a preregistered ScientificExperimentDesign
 * with the existing confirmBackendEvidenceGuidedExperiment() path.
 *
 * Design constraints (enforced):
 * - Accepts ONLY arms whose model has capability === 'BACKEND_REAL_ENGINE'.
 * - Rejects ENGINE_NOT_AVAILABLE, local REAL_ENGINE, HYPOTHETICAL_VISUALIZATION.
 * - Does NOT create a second router, parser, provenance store, or executor.
 * - Does NOT perform any scientific calculation in this module.
 * - Preserves every backend runId, fingerprint, engine/version, inputs and provenance.
 * - Evaluates fingerprint agreement for determinism (MATCH / DRIFT).
 * - Does NOT launch mass sweeps or HPC jobs.
 */

import { canonicalJson, fnv1a } from '../events/hash';
import { getRouterModel } from './router';
import { confirmBackendEvidenceGuidedExperiment, isBackendEvidenceGuidedPlan } from './backendExecution';
import { planEvidenceGuidedExperiment } from './evidenceGuidedChat';
import { assessPredeclaredScientificCriterion } from './scientificCriterionAssessment';
import {
  SCIENTIFIC_DISCOVERY_VERSION,
  type ExperimentArmEvidence,
  type ReproductionVerdict,
  type ScientificEvidenceChain,
  type ScientificExperimentDesign,
} from './scientificDiscovery';
import type { ExperimentRun } from './types';

export const SCIENTIFIC_BACKEND_EXECUTOR_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Backend run IDs are intentionally unique for every remote invocation, so the
 * canonical runFingerprint includes a different backendRunId for each repeat.
 * Reproducibility must therefore compare a semantic result fingerprint that
 * retains the reviewed request, model/version, engine, outputs, units and
 * warnings, while excluding only that invocation-specific identifier.
 */
function semanticReproductionFingerprint(run: ExperimentRun): string {
  return `reproduction_${fnv1a(canonicalJson({
    requestFingerprint: run.provenance.requestFingerprint,
    modelId: run.provenance.modelId ?? null,
    modelVersion: run.provenance.modelVersion ?? null,
    engine: run.provenance.engine ?? null,
    deterministic: run.provenance.deterministic,
    outputs: run.result.outputs,
    units: run.result.units,
    warnings: run.result.warnings,
    backendEngine: run.provenance.backendExecution?.backendEngine ?? null,
    backendModelVersion: run.provenance.backendExecution?.backendModelVersion ?? null,
    backendProvenance: run.provenance.backendExecution?.backendProvenance ?? null,
  }))}`;
}

function reproductionVerdict(runs: readonly ExperimentRun[]): ReproductionVerdict {
  if (runs.length === 0 || runs.some((run) => run.result.status !== 'completed')) return 'NOT_EXECUTED';
  if (runs.some((run) => !run.provenance.deterministic)) return 'NOT_COMPARABLE';
  const fingerprints = new Set(runs.map(semanticReproductionFingerprint));
  return fingerprints.size === 1 ? 'MATCH' : 'DRIFT';
}

/**
 * Validates that the arm's model is registered as BACKEND_REAL_ENGINE.
 * Returns a rejection reason string, or null if the arm is admissible.
 */
function admissionCheck(design: ScientificExperimentDesign, arm: ScientificExperimentDesign['arms'][number]): string | null {
  const modelId = arm.request.modelId;
  if (!modelId) return `Arm '${arm.armId}' has no modelId; backend execution requires an explicit model.`;
  const routerModel = getRouterModel(modelId);
  if (!routerModel) return `Model '${modelId}' is not registered in the Experiment Router.`;
  const capability = routerModel.capability ?? 'REAL_ENGINE';
  if (capability !== 'BACKEND_REAL_ENGINE') {
    return `Model '${modelId}' has capability '${capability}'; backend Discovery executor only accepts BACKEND_REAL_ENGINE. Use executeScientificExperiment() for local REAL_ENGINE models.`;
  }
  if (arm.request.domainId !== design.hypothesis.domainId) {
    return `Arm '${arm.armId}' targets domain '${arm.request.domainId}' which differs from the preregistered hypothesis domain '${design.hypothesis.domainId}'.`;
  }
  return null;
}

/**
 * Executes a single arm repetitionsPerArm times via the canonical backend Fabric path.
 * Each repetition calls planEvidenceGuidedExperiment → confirmBackendEvidenceGuidedExperiment.
 */
async function executeBackendArm(
  design: ScientificExperimentDesign,
  arm: ScientificExperimentDesign['arms'][number],
): Promise<{ evidence: ExperimentArmEvidence; runs: ExperimentRun[] }> {
  const runs: ExperimentRun[] = [];
  const flags: string[] = [];

  for (let repetition = 0; repetition < design.repetitionsPerArm; repetition++) {
    const plan = planEvidenceGuidedExperiment(arm.request);
    if (!isBackendEvidenceGuidedPlan(plan)) {
      flags.push(`PLAN_NOT_BACKEND_REAL_ENGINE_REP${repetition}`);
      break;
    }
    try {
      const confirmed = await confirmBackendEvidenceGuidedExperiment(plan);
      runs.push(confirmed.run);
    } catch (error) {
      flags.push(`BACKEND_EXECUTION_ERROR_REP${repetition}:${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
      break;
    }
  }

  const numeric = runs
    .map((run) => run.result.outputs[design.primaryMetric])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const firstWithUnit = runs.find((run) => Boolean(run.result.units[design.primaryMetric]));

  if (runs.some((run) => run.result.status !== 'completed')) flags.push('ARM_NOT_COMPLETED');
  if (numeric.length !== runs.length) flags.push('PRIMARY_METRIC_NOT_NUMERIC');
  const reproduction = reproductionVerdict(runs);
  if (reproduction === 'DRIFT') flags.push('REPEAT_DRIFT');
  if (reproduction === 'NOT_EXECUTED') flags.push('REPEAT_NOT_EXECUTED');

  return {
    evidence: {
      armId: arm.armId,
      kind: arm.kind,
      runIds: runs.map((run) => run.runId),
      runFingerprints: runs.map((run) => run.provenance.runFingerprint),
      outputValues: numeric,
      units: firstWithUnit?.result.units[design.primaryMetric] ?? '',
      reproduction,
      anomalyFlags: flags,
    },
    runs,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Executes a preregistered ScientificExperimentDesign on BACKEND_REAL_ENGINE models.
 *
 * For each arm it calls:
 *   planEvidenceGuidedExperiment(arm.request)
 *   → confirmBackendEvidenceGuidedExperiment(plan)
 *
 * Returns a ScientificEvidenceChain with full provenance from the backend.
 *
 * Throws if any arm is not BACKEND_REAL_ENGINE (fail-fast admission).
 */
export async function executeScientificExperimentOnBackend(
  design: ScientificExperimentDesign,
): Promise<ScientificEvidenceChain> {
  // Admission: all arms must be BACKEND_REAL_ENGINE
  for (const arm of design.arms) {
    const rejection = admissionCheck(design, arm);
    if (rejection) throw new Error(`[ScientificBackendExecutor] Admission rejected: ${rejection}`);
  }

  // Deliberately sequential: Discovery executes the bounded, preregistered
  // protocol without creating a concurrent backend sweep or HPC workload.
  const executed: Awaited<ReturnType<typeof executeBackendArm>>[] = [];
  for (const arm of design.arms) {
    executed.push(await executeBackendArm(design, arm));
  }
  const arms = executed.map((entry) => entry.evidence);
  const allRuns = executed.flatMap((entry) => entry.runs);
  const assessment = assessPredeclaredScientificCriterion(design, arms, 'backend');

  const provenanceFingerprint = `evidence_backend_${fnv1a(canonicalJson({
    version: SCIENTIFIC_BACKEND_EXECUTOR_VERSION,
    protocol: design.protocolFingerprint,
    primaryMetric: design.primaryMetric,
    arms: arms.map((arm) => ({
      armId: arm.armId,
      runFingerprints: arm.runFingerprints,
      values: arm.outputValues,
      reproduction: arm.reproduction,
    })),
  }))}`;

  return {
    contractVersion: SCIENTIFIC_DISCOVERY_VERSION,
    evidenceId: provenanceFingerprint,
    design,
    arms,
    assessment,
    allRuns,
    provenanceFingerprint,
    createdFromRealRunsOnly: true,
  };
}

/**
 * Returns true if all arms in the design target BACKEND_REAL_ENGINE models.
 * Use this to route between executeScientificExperiment (sync, local) and
 * executeScientificExperimentOnBackend (async, backend).
 */
export function isBackendDiscoveryDesign(design: ScientificExperimentDesign): boolean {
  return design.arms.every((arm) => {
    const modelId = arm.request.modelId;
    if (!modelId) return false;
    const routerModel = getRouterModel(modelId);
    return (routerModel?.capability ?? 'REAL_ENGINE') === 'BACKEND_REAL_ENGINE';
  });
}
