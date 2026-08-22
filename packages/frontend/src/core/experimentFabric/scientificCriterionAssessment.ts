import type {
  ExperimentArmEvidence,
  HypothesisAssessmentEvidence,
  ScientificExperimentDesign,
} from './scientificDiscovery';

/**
 * The only evaluator of a preregistered falsification criterion used by both
 * local and backend Discovery executors. It evaluates already completed real
 * run evidence only; it does not execute a model, infer causality, or create a
 * new hypothesis.
 */
export type ScientificCriterionExecutionContext = 'local' | 'backend';

function mean(values: readonly number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function assessPredeclaredScientificCriterion(
  design: ScientificExperimentDesign,
  arms: readonly ExperimentArmEvidence[],
  context: ScientificCriterionExecutionContext = 'local',
): HypothesisAssessmentEvidence {
  const criterion = design.hypothesis.falsification;
  const completed = arms.every((arm) => arm.reproduction === 'MATCH' && arm.outputValues.length === design.repetitionsPerArm);
  const referenceRunIds = arms.flatMap((arm) => [...arm.runIds]);
  const executionQualifier = context === 'backend' ? ' na backendzie' : '';
  const executionLabel = context === 'backend' ? 'realnych backendowych runów' : 'realnych runów';

  if (!completed) {
    return {
      assessment: 'INCONCLUSIVE',
      message: `Nie można ocenić hipotezy: co najmniej jeden prerejestrowany arm nie ukończył się lub nie przeszedł powtórzenia${executionQualifier}.`,
      criterion,
      referenceRunIds,
    };
  }

  const baseline = arms.find((arm) => arm.kind === 'baseline');
  const comparisonArms = arms.filter((arm) => arm.kind === 'variant' || arm.kind === 'replication');
  const baselineMean = baseline ? mean(baseline.outputValues) : null;
  const comparisonMeans = comparisonArms.map((arm) => mean(arm.outputValues));
  if (baselineMean === null || comparisonArms.length === 0 || comparisonMeans.some((value) => value === null)) {
    return {
      assessment: 'INCONCLUSIVE',
      message: `Nie można ocenić hipotezy: brakuje numerycznej wartości baseline lub prerejestrowanego armu porównawczego${context === 'backend' ? ' z backendowego runu' : ''}.`,
      criterion,
      referenceRunIds,
    };
  }

  const numbers = comparisonMeans as number[];
  let supported = false;
  let explanation = '';
  switch (criterion.relation) {
    case 'greater-than':
      supported = numbers.every((value) => value > (criterion.expectedValue ?? baselineMean));
      explanation = `Każdy prerejestrowany arm porównawczy porównano z ${criterion.expectedValue ?? 'baseline'}.`;
      break;
    case 'less-than':
      supported = numbers.every((value) => value < (criterion.expectedValue ?? baselineMean));
      explanation = `Każdy prerejestrowany arm porównawczy porównano z ${criterion.expectedValue ?? 'baseline'}.`;
      break;
    case 'equal-within-tolerance': {
      const expectedValue = criterion.expectedValue;
      const tolerance = criterion.tolerance;
      if (expectedValue === undefined || tolerance === undefined) {
        return {
          assessment: 'INCONCLUSIVE',
          message: 'Kryterium równości wymaga prerejestrowanych expectedValue i tolerance.',
          criterion,
          referenceRunIds,
        };
      }
      supported = numbers.every((value) => Math.abs(value - expectedValue) <= tolerance);
      explanation = `Każdy prerejestrowany arm porównawczy porównano z wartością ${expectedValue} ± ${tolerance}.`;
      break;
    }
    case 'monotonic-increase':
      supported = numbers.every((value, index) => index === 0 || value >= numbers[index - 1]);
      explanation = 'Arms oceniono w prerejestrowanej kolejności protokołu.';
      break;
    case 'monotonic-decrease':
      supported = numbers.every((value, index) => index === 0 || value <= numbers[index - 1]);
      explanation = 'Arms oceniono w prerejestrowanej kolejności protokołu.';
      break;
  }

  return {
    assessment: supported ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL',
    message: `${supported ? 'Kryterium było zgodne' : 'Kryterium nie było zgodne'} z wynikami ${executionLabel}. ${explanation} To nie jest odkrycie ani dowód przyczynowości poza granicami modelu.`,
    criterion,
    referenceRunIds,
  };
}
