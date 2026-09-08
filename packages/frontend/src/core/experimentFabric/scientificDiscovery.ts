import type { KnowledgeCorpusFile } from '../knowledge/registry';
import type { ObjectiveReducer } from './objectiveReducer';
import type { ExperimentOutputValue, ExperimentRun, ExperimentValue, StructuredExperimentRequest } from './types';

export const SCIENTIFIC_DISCOVERY_VERSION = '1.0.0';

/** A candidate is never presented as a discovery, causal proof, or prediction. */
export type HypothesisAssessment = 'CANDIDATE' | 'SUPPORTED_WITHIN_PROTOCOL' | 'FALSIFIED_WITHIN_PROTOCOL' | 'INCONCLUSIVE';
export type ExperimentArmKind = 'baseline' | 'variant' | 'negative-control' | 'positive-control' | 'replication';
export type ReproductionVerdict = 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE' | 'NOT_EXECUTED';

export interface FalsificationCriterion {
  metric: string;
  relation: 'greater-than' | 'less-than' | 'equal-within-tolerance' | 'monotonic-increase' | 'monotonic-decrease';
  expectedValue?: number;
  tolerance?: number;
  rationale: string;
  /**
   * HOW the metric is measured over a run, as opposed to WHAT relation must
   * hold — a sibling of `relation`/`expectedValue`/`tolerance`, not a new
   * control-flow concept. Omitted means `AT_HORIZON`: the value at the last
   * tick, which is what every objective in Genesis has always meant, so an
   * existing criterion behaves identically down to the last bit.
   *
   * It sits on the criterion, and therefore inside the preregistered question,
   * so `worldCounterfactualQuestionFingerprint` already covers it: a reducer
   * cannot be chosen after seeing the result any more than a relation can.
   *
   * Only the WorldGraph substrate executes it today
   * (`worldModel/discovery/objectiveTrajectory.ts`). A Fabric criterion may
   * declare one, and the Fabric path ignores it rather than pretending to
   * honour it — an unexecuted declaration is visible in the fingerprint,
   * which is better than a silent second meaning.
   */
  reducer?: ObjectiveReducer;
}

export interface ScientificHypothesis {
  contractVersion: string;
  hypothesisId: string;
  statement: string;
  modelId: string;
  domainId: string;
  assessment: HypothesisAssessment;
  knowledgeSources: readonly KnowledgeCorpusFile[];
  declaredAssumptions: readonly string[];
  falsification: FalsificationCriterion;
  disclaimer: string;
}

export interface ExperimentArm {
  armId: string;
  label: string;
  kind: ExperimentArmKind;
  request: StructuredExperimentRequest;
  expectedRole: string;
}

/** Immutable design before any run; all values are inputs, never expected outputs. */
export interface ScientificExperimentDesign {
  contractVersion: string;
  designId: string;
  hypothesis: ScientificHypothesis;
  primaryMetric: string;
  arms: readonly ExperimentArm[];
  repetitionsPerArm: number;
  protocolAssumptions: readonly string[];
  protocolFingerprint: string;
}

export interface ExperimentArmEvidence {
  armId: string;
  kind: ExperimentArmKind;
  runIds: readonly string[];
  runFingerprints: readonly string[];
  /** Scalar values retained for legacy numeric criteria. */
  outputValues: readonly number[];
  /** All produced primary observations, including ordered series. */
  outputObservations: readonly ExperimentOutputValue[];
  units: string;
  reproduction: ReproductionVerdict;
  anomalyFlags: readonly string[];
}

export interface HypothesisAssessmentEvidence {
  assessment: HypothesisAssessment;
  message: string;
  criterion: FalsificationCriterion;
  referenceRunIds: readonly string[];
}

/** Complete auditable chain: hypothesis → predeclared protocol → real runs → evidence. */
export interface ScientificEvidenceChain {
  contractVersion: string;
  evidenceId: string;
  design: ScientificExperimentDesign;
  arms: readonly ExperimentArmEvidence[];
  assessment: HypothesisAssessmentEvidence;
  allRuns: readonly ExperimentRun[];
  provenanceFingerprint: string;
  createdFromRealRunsOnly: true;
}

export interface HypothesisProposal {
  statement: string;
  domainId: string;
  modelId: string;
  declaredAssumptions: readonly string[];
  falsification: FalsificationCriterion;
}

export interface ScientificExperimentInput {
  hypothesis: HypothesisProposal;
  baselineRequest: StructuredExperimentRequest;
  sweep: ParameterSweepSpec;
  repetitionsPerArm?: number;
  /** An optional predeclared calibration/control request; it is still executed by the real model. */
  positiveControl?: Omit<ExperimentArm, 'armId' | 'kind'>;
}

export interface ParameterSweepSpec {
  parameter: string;
  values: readonly ExperimentValue[];
  label: string;
}

export interface CrossDomainLink {
  fromDomainId: string;
  toDomainId: string;
  outputKey: string;
  targetParameter: string;
  transform: 'identity-only';
  status: 'ENGINE_NOT_AVAILABLE' | 'NOT_WIRED';
  reason: string;
}
