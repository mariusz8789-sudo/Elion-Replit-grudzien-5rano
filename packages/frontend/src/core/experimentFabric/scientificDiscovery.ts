import type { KnowledgeCorpusFile } from '../knowledge/registry';
import type { ExperimentRun, ExperimentValue, StructuredExperimentRequest } from './types';

export const SCIENTIFIC_DISCOVERY_VERSION = '1.0.0';

/** A candidate is never presented as a discovery, causal proof, or prediction. */
export type HypothesisAssessment = 'CANDIDATE' | 'SUPPORTED_WITHIN_PROTOCOL' | 'FALSIFIED_WITHIN_PROTOCOL' | 'INCONCLUSIVE';
export type ExperimentArmKind = 'baseline' | 'variant' | 'negative-control' | 'positive-control' | 'replication';
export type ReproductionVerdict = 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE' | 'NOT_EXECUTED';

export interface FalsificationCriterion {
  metric: string;
  relation: 'greater-than' | 'less-than' | 'equal-within-tolerance' | 'equal-to-baseline-within-tolerance' | 'monotonic-increase' | 'monotonic-decrease';
  expectedValue?: number;
  tolerance?: number;
  rationale: string;
}

/**
 * An immutable, source-bound reference used to justify a preregistered
 * hypothesis. It records existing Registry metadata only; it never turns a
 * source into a calculation, a solver capability or a scientific conclusion.
 */
export interface HypothesisKnowledgeReference {
  referenceId: string;
  kind: 'knowledge-corpus' | 'supplemental-knowledge';
  domainId: string;
  title: string;
  epistemicStatus: 'CORPUS_REFERENCE' | 'FACT' | 'MODEL' | 'THEORY' | 'HYPOTHESIS';
  source: {
    title: string;
    /** Corpus-relative path or immutable public URL from an existing registry record. */
    locator: string;
    retrievedAt: string | null;
  };
  statement: string;
  limitation: string;
}

/** Input accepted by the deterministic evidence resolver. */
export interface HypothesisKnowledgeReferenceInput {
  domainId: string;
  modelId: string;
  supplementalKnowledgeIds?: readonly string[];
}

export interface ScientificHypothesis {
  contractVersion: string;
  hypothesisId: string;
  statement: string;
  modelId: string;
  domainId: string;
  assessment: HypothesisAssessment;
  knowledgeSources: readonly KnowledgeCorpusFile[];
  /** Source-bound rationale present before the protocol is executed. */
  knowledgeReferences: readonly HypothesisKnowledgeReference[];
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
  outputValues: readonly number[];
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
  /**
   * Optional IDs of already registered supplemental knowledge records.
   * The planner validates their domain, target model and epistemic status;
   * unknown, fictional and scenario-assumption records are rejected.
   */
  supplementalKnowledgeIds?: readonly string[];
  falsification: FalsificationCriterion;
}

export interface ScientificExperimentInput {
  hypothesis: HypothesisProposal;
  baselineRequest: StructuredExperimentRequest;
  /** One bounded real input sweep for models with registered parameters. */
  sweep?: ParameterSweepSpec;
  /**
   * One fresh, identical preregistered execution for a deterministic model that
   * has no admissible input parameters. It is a repeatability check, never a
   * synthetic variant or a hidden solver input. Exactly one of sweep/replication
   * must be present.
   */
  replication?: ReplicationSpec;
  repetitionsPerArm?: number;
  /** An optional predeclared calibration/control request; it is still executed by the real model. */
  positiveControl?: Omit<ExperimentArm, 'armId' | 'kind'>;
}

export interface ReplicationSpec {
  label: string;
  rationale: string;
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
