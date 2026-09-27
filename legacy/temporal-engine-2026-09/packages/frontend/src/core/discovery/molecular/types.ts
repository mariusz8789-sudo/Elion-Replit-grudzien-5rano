/**
 * GENESIS MOLECULAR DISCOVERY — DOMAIN CONTRACT (VERTICAL SPIKE).
 *
 * Purpose: prove Genesis can run a traceable, reproducible COMPUTATIONAL
 * discovery loop (question → hypothesis → candidates → screening →
 * falsification → evidence → next experiment) on its EXISTING engines.
 *
 * Honest scope, stated in the contract itself:
 *  - Candidate generation here is a DETERMINISTIC COMPOSITION ENUMERATOR over
 *    molecular formulas. It is NOT a generative model, and a molecular formula
 *    is NOT a structure — so every structural property (logP, TPSA, HBD/HBA,
 *    fingerprints) is `REQUIRES_EXTERNAL_ENGINE` unless a real chemistry engine
 *    (RDKit) actually supplied it.
 *  - Target affinity, ADMET, toxicity and safety have NO engine in this
 *    repository for this path; they are `REQUIRES_EXTERNAL_ENGINE` or
 *    `REQUIRES_EXPERIMENT`, never guessed, never "good", never "safe".
 *
 * The repository ALSO contains a real SMILES-level campaign engine
 * (`packages/backend/src/campaign/orchestrator.mjs` + `compute/rdkitAdapter.mjs`),
 * which is the structural counterpart of this loop and is `BLOCKED_BY_RUNTIME`
 * wherever RDKit is not installed. This module does not duplicate it.
 */
export const MOLECULAR_DISCOVERY_CONTRACT_VERSION = '1.0.0';

/**
 * Where a value came from. These are never collapsed: a model prediction is
 * never reported as an observation, and an absent value is never a number.
 */
export type PropertyStatus =
  | 'ACTUAL_SOURCE'
  | 'COMPUTED'
  | 'MODEL_PREDICTION'
  | 'USER_SUPPLIED'
  | 'TEST_FIXTURE'
  | 'NOT_AVAILABLE'
  | 'REQUIRES_EXTERNAL_ENGINE'
  | 'REQUIRES_EXPERIMENT';

/** Statuses that carry a real number. Everything else has `value: null`. */
export const VALUED_STATUSES: readonly PropertyStatus[] = ['ACTUAL_SOURCE', 'COMPUTED', 'MODEL_PREDICTION', 'USER_SUPPLIED', 'TEST_FIXTURE'];

export interface MoleculeProperty {
  propertyId: string;
  status: PropertyStatus;
  value: number | null;
  unit: string;
  /** Engine/source that produced it, e.g. "genesis-formula-chemistry@1.0.0" or "RDKit 2026.03.5". */
  engine: string | null;
}

export function unavailableProperty(propertyId: string, status: Extract<PropertyStatus, 'NOT_AVAILABLE' | 'REQUIRES_EXTERNAL_ENGINE' | 'REQUIRES_EXPERIMENT'>, unit = ''): MoleculeProperty {
  return { propertyId, status, value: null, unit, engine: null };
}

export function computedProperty(propertyId: string, value: number, unit: string, engine: string): MoleculeProperty {
  return { propertyId, status: 'COMPUTED', value, unit, engine };
}

/** Structural identity, when a real chemistry engine provided one. */
export interface MoleculeStructure {
  status: Extract<PropertyStatus, 'ACTUAL_SOURCE' | 'USER_SUPPLIED' | 'TEST_FIXTURE' | 'REQUIRES_EXTERNAL_ENGINE'>;
  /** Canonical SMILES — present only when a real engine canonicalised it. */
  canonicalSmiles: string | null;
  engine: string | null;
}

/**
 * One candidate. `formula` is the Hill-canonical molecular formula, which is
 * what the composition enumerator actually produces and deduplicates on.
 */
export interface MoleculeCandidate {
  candidateId: string;
  formula: string;
  structure: MoleculeStructure;
  /** Formula this candidate was derived from; `null` for a seed. */
  parentFormula: string | null;
  /** Declared transformation that produced it; `null` for a seed. */
  transformation: string | null;
  properties: readonly MoleculeProperty[];
  origin: 'SEED' | 'ENUMERATED';
}

export type ComparisonOperator = 'lte' | 'gte' | 'range';

/** One screening criterion. `required: true` means failure falsifies the batch hypothesis. */
export interface DiscoveryCriterion {
  criterionId: string;
  propertyId: string;
  op: ComparisonOperator;
  value: number;
  /** Upper bound for `range`; ignored otherwise. */
  valueMax?: number;
  required: boolean;
  rationale: string;
}

export interface DiscoveryConstraints {
  /** Elements a candidate may contain. A candidate using anything else is rejected. */
  allowedElements: readonly string[];
  maxHeavyAtoms: number;
  criteria: readonly DiscoveryCriterion[];
}

/**
 * The biological/physical target. Genesis has no target-affinity engine on
 * this path, so `affinityCapability` is always a non-valued status — the
 * target exists to be named and traced, never to produce an invented score.
 */
export interface TargetDefinition {
  targetId: string;
  label: string;
  source: Extract<PropertyStatus, 'ACTUAL_SOURCE' | 'USER_SUPPLIED' | 'TEST_FIXTURE' | 'NOT_AVAILABLE'>;
  affinityCapability: Extract<PropertyStatus, 'REQUIRES_EXTERNAL_ENGINE' | 'REQUIRES_EXPERIMENT'>;
}

export interface DiscoveryQuestion {
  questionId: string;
  question: string;
  target: TargetDefinition;
  constraints: DiscoveryConstraints;
}

export type CriterionVerdict = 'PASS' | 'FAIL' | 'NOT_AVAILABLE';

export interface CriterionResult {
  criterionId: string;
  propertyId: string;
  verdict: CriterionVerdict;
  observed: number | null;
  observedStatus: PropertyStatus;
  detail: string;
}

export type CandidateVerdict = 'RETAINED' | 'REJECTED' | 'NOT_RESOLVED';

export interface CandidateAssessment {
  candidateId: string;
  formula: string;
  verdict: CandidateVerdict;
  criteria: readonly CriterionResult[];
  /** Required criteria that failed — the reason a candidate is REJECTED. */
  failedRequired: readonly string[];
  /** Required criteria with no available value — the reason a candidate is NOT_RESOLVED. */
  unresolvedRequired: readonly string[];
  /** Deterministic ordering key over PASSED criteria only; `null` when nothing rankable. */
  rankScore: number | null;
}

export interface DiscoveryBatch {
  batchId: string;
  seedFormulas: readonly string[];
  transformations: readonly string[];
  candidates: readonly MoleculeCandidate[];
  /** Formulas rejected before assessment (invalid, duplicate, disallowed element). */
  discarded: readonly { formula: string; reason: string }[];
  batchFingerprint: string;
}

export type HypothesisVerdict = 'SUPPORTED_WITHIN_PROTOCOL' | 'FALSIFIED_WITHIN_PROTOCOL' | 'NOT_RESOLVED';

export interface DiscoveryDecision {
  verdict: HypothesisVerdict;
  reason: string;
  retainedCount: number;
  rejectedCount: number;
  notResolvedCount: number;
}

export interface DiscoveryResult {
  contractVersion: string;
  question: DiscoveryQuestion;
  batch: DiscoveryBatch;
  assessments: readonly CandidateAssessment[];
  /** RETAINED candidates in deterministic rank order (best first). */
  ranking: readonly CandidateAssessment[];
  decision: DiscoveryDecision;
  /** Capability gaps that blocked at least one criterion, surfaced not hidden. */
  capabilityGaps: readonly { propertyId: string; status: PropertyStatus; detail: string }[];
  resultFingerprint: string;
}
