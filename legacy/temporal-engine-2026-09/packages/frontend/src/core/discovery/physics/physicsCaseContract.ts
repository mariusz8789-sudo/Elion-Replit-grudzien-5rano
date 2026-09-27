import { buildNextScientificAction, type NextScientificAction } from '../nextScientificAction';

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

/**
 * Projects ANY case's StandardScientificResult into the domain-agnostic
 * NextScientificAction shape (see nextScientificAction.ts) — this works for
 * every physics case uniformly, precisely because it only reads the generic
 * contract fields, never case-specific internals.
 */
export function toNextScientificAction(standard: StandardScientificResult): NextScientificAction {
  const currentInputs = [...standard.constants.map((c) => c.symbol), ...standard.inputs.map((i) => i.symbol)];
  const availability = standard.nextQuestion.kind === 'RUNNABLE_IN_GENESIS'
    ? 'RUNNABLE_IN_GENESIS' as const
    : standard.nextQuestion.kind === 'REQUIRES_EXTERNAL_DATA'
      ? 'REQUIRES_EXTERNAL_DATA' as const
      : 'REQUIRES_EXTERNAL_EXPERIMENT' as const;

  return buildNextScientificAction({
    actionId: `${standard.caseId}:next`,
    question: standard.nextQuestion.question,
    targetHypothesisIds: [standard.caseId],
    requiredInputs: [...currentInputs, 'independently-measured-comparison-value'],
    availableInputs: currentInputs,
    method: 'Not specified by this generic projection — see the case\'s own result for domain-specific detail (question/equations/calculation).',
    expectedDiscriminatingPower: 'MODERATE',
    discriminatingPowerReasoning: 'A derivation checked so far only by replaying itself has moderate discriminating power at best until compared against independent data: it cannot be HIGH without that comparison, nor LOW since the derivation is otherwise complete, specific, and falsifiable in direction/magnitude.',
    constraints: ['Genesis has no path to independently retrieve or verify external measured physics data in this runtime.'],
    expectedOutputs: ['A quantitative comparison between the derived prediction and an independently measured value, with a stated residual.'],
    successCriteria: 'The independently measured value is obtained and falls within a defensible tolerance of the derived prediction.',
    falsificationCriteria: 'The independently measured value falls outside a defensible tolerance of the derived prediction, given its own reported measurement uncertainty.',
    availability,
    estimatedBurden: 'UNKNOWN',
    burdenReasoning: 'Genesis has no basis to estimate cost, duration, or feasibility for obtaining this external data or experiment.',
  });
}
