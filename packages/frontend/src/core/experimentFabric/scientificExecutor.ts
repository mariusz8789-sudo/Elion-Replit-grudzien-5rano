import { canonicalJson, fnv1a } from '../events/hash';
import { runExperiment } from './executor';
import { assessPredeclaredScientificCriterion } from './scientificCriterionAssessment';
import { SCIENTIFIC_DISCOVERY_VERSION, type ExperimentArmEvidence, type ReproductionVerdict, type ScientificEvidenceChain, type ScientificExperimentDesign } from './scientificDiscovery';
import type { ExperimentRun } from './types';

function reproductionVerdict(runs: readonly ExperimentRun[]): ReproductionVerdict {
  if (runs.length === 0 || runs.some((run) => run.result.status !== 'completed')) return 'NOT_EXECUTED';
  const fingerprints = new Set(runs.map((run) => run.provenance.runFingerprint));
  return fingerprints.size === 1 ? 'MATCH' : 'DRIFT';
}

function armEvidence(design: ScientificExperimentDesign, arm: ScientificExperimentDesign['arms'][number]): { evidence: ExperimentArmEvidence; runs: ExperimentRun[] } {
  const runs = Array.from({ length: design.repetitionsPerArm }, () => runExperiment(arm.request));
  const numeric = runs.map((run) => run.result.outputs[design.primaryMetric]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const firstWithUnit = runs.find((run) => Boolean(run.result.units[design.primaryMetric]));
  const flags: string[] = [];
  if (runs.some((run) => run.result.status !== 'completed')) flags.push('ARM_NOT_COMPLETED');
  if (numeric.length !== runs.length) flags.push('PRIMARY_METRIC_NOT_NUMERIC');
  const reproduction = reproductionVerdict(runs);
  if (reproduction === 'DRIFT') flags.push('REPEAT_DRIFT');
  if (reproduction === 'NOT_EXECUTED') flags.push('REPEAT_NOT_EXECUTED');
  return {
    evidence: {
      armId: arm.armId, kind: arm.kind,
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

/**
 * Runs an immutable design only through the established Fabric executor. No
 * simulator, random sample or numerical result is produced in this module.
 */
export function executeScientificExperiment(design: ScientificExperimentDesign): ScientificEvidenceChain {
  const executed = design.arms.map((arm) => armEvidence(design, arm));
  const arms = executed.map((entry) => entry.evidence);
  const allRuns = executed.flatMap((entry) => entry.runs);
  const assessment = assessPredeclaredScientificCriterion(design, arms);
  const provenanceFingerprint = `evidence_${fnv1a(canonicalJson({
    protocol: design.protocolFingerprint,
    primaryMetric: design.primaryMetric,
    arms: arms.map((arm) => ({ armId: arm.armId, runFingerprints: arm.runFingerprints, values: arm.outputValues, reproduction: arm.reproduction })),
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
