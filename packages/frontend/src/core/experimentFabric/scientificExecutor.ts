import { canonicalJson, fnv1a } from '../events/hash';
import { runExperiment } from './executor';
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

function mean(values: readonly number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function assessPredeclaredCriterion(design: ScientificExperimentDesign, arms: readonly ExperimentArmEvidence[]): ScientificEvidenceChain['assessment'] {
  const criterion = design.hypothesis.falsification;
  const completed = arms.every((arm) => arm.reproduction === 'MATCH' && arm.outputValues.length === design.repetitionsPerArm);
  const referenceRunIds = arms.flatMap((arm) => arm.runIds);
  if (!completed) {
    return { assessment: 'INCONCLUSIVE', message: 'Nie można ocenić hipotezy: co najmniej jeden prerejestrowany arm nie ukończył się lub nie przeszedł powtórzenia.', criterion, referenceRunIds };
  }
  const baseline = arms.find((arm) => arm.kind === 'baseline');
  const variants = arms.filter((arm) => arm.kind === 'variant');
  const baselineMean = baseline ? mean(baseline.outputValues) : null;
  const variantMeans = variants.map((arm) => mean(arm.outputValues));
  if (baselineMean === null || variants.length === 0 || variantMeans.some((value) => value === null)) {
    return { assessment: 'INCONCLUSIVE', message: 'Nie można ocenić hipotezy: brakuje numerycznej wartości baseline lub wariantu.', criterion, referenceRunIds };
  }
  const numbers = variantMeans as number[];
  let supported = false;
  let explanation = '';
  switch (criterion.relation) {
    case 'greater-than':
      supported = numbers.every((value) => value > (criterion.expectedValue ?? baselineMean));
      explanation = `Każdy wariant porównano z ${criterion.expectedValue ?? 'baseline'}.`;
      break;
    case 'less-than':
      supported = numbers.every((value) => value < (criterion.expectedValue ?? baselineMean));
      explanation = `Każdy wariant porównano z ${criterion.expectedValue ?? 'baseline'}.`;
      break;
    case 'equal-within-tolerance': {
      if (criterion.expectedValue === undefined || criterion.tolerance === undefined) {
        return { assessment: 'INCONCLUSIVE', message: 'Kryterium równości wymaga prerejestrowanych expectedValue i tolerance.', criterion, referenceRunIds };
      }
      supported = numbers.every((value) => Math.abs(value - criterion.expectedValue!) <= criterion.tolerance!);
      explanation = `Każdy wariant porównano z prerejestrowaną wartością ${criterion.expectedValue} ± ${criterion.tolerance}.`;
      break;
    }
    case 'monotonic-increase':
      supported = numbers.every((value, index) => index === 0 || value >= numbers[index - 1]);
      explanation = 'Warianty oceniono w prerejestrowanej kolejności sweepu.';
      break;
    case 'monotonic-decrease':
      supported = numbers.every((value, index) => index === 0 || value <= numbers[index - 1]);
      explanation = 'Warianty oceniono w prerejestrowanej kolejności sweepu.';
      break;
  }
  return {
    assessment: supported ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL',
    message: `${supported ? 'Kryterium było zgodne' : 'Kryterium nie było zgodne'} z wynikami realnych runów. ${explanation} To nie jest odkrycie ani dowód przyczynowości poza granicami modelu.`,
    criterion,
    referenceRunIds,
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
  const assessment = assessPredeclaredCriterion(design, arms);
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
