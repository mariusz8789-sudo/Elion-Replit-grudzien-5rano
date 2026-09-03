/**
 * STANDARD SCIENTIFIC RESULT — the generic shape every real physics case
 * projects itself into, so the physics domain is provably NOT a pile of
 * unrelated hard-coded demos.
 *
 * Each concrete case (`relativisticTimeDilation.ts`, `gravitationalRedshift.ts`,
 * ...) keeps its own rich, case-specific result type — that detail is real and
 * worth preserving. This module adds a SECOND, generic view any caller can
 * consume without knowing which specific case produced it: the same
 * question/assumptions/inputs/constants/equations/calculation/result shape,
 * the same falsification-criteria and next-question shape, regardless of
 * domain. A caller wanting "the physics detail" reads the case's own result;
 * a caller wanting "a scientific result, generically" reads this.
 */
export const PHYSICS_CASE_CONTRACT_VERSION = '1.0.0';

export type EpistemicTag = 'ESTABLISHED' | 'DERIVED' | 'MODEL_BASED' | 'SPECULATIVE' | 'UNRESOLVED' | 'REQUIRES_EXPERIMENT';

export interface PhysicsQuantity {
  symbol: string;
  meaning: string;
  value: number;
  unit: string;
}

export interface PhysicsConstantRef {
  symbol: string;
  meaning: string;
  value: number;
  unit: string;
  source: string;
  status: 'EXACT_BY_DEFINITION' | 'LITERATURE_VALUE';
}

export interface FalsificationCriterion {
  statement: string;
  /** What observation or check would show this statement to be wrong. */
  wouldFalsifyIf: string;
}

export type NextQuestionKind = 'RUNNABLE_IN_GENESIS' | 'REQUIRES_EXTERNAL_DATA' | 'REQUIRES_EXTERNAL_EXPERIMENT';

export interface NextScientificQuestion {
  question: string;
  kind: NextQuestionKind;
}

export interface StandardScientificResult {
  domainId: 'PHYSICS';
  caseId: string;
  contractVersion: string;
  question: string;
  assumptions: readonly string[];
  inputs: readonly PhysicsQuantity[];
  constants: readonly PhysicsConstantRef[];
  equations: readonly string[];
  /** Ordered, traceable derivation steps in plain text — never a hidden computation. */
  calculation: readonly string[];
  result: readonly PhysicsQuantity[];
  /** Null when the case has no basis to state one; never a fabricated error bar. */
  uncertaintyNote: string | null;
  falsificationCriteria: readonly FalsificationCriterion[];
  epistemicTag: EpistemicTag;
  nextQuestion: NextScientificQuestion;
  /** Reused, not recomputed — must equal the source case result's own fingerprint. */
  resultFingerprint: string;
}
