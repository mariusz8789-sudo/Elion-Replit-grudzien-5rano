import type { KnowledgeClaim } from './types.js';

const FORBIDDEN_SELF_DESCRIPTIONS = [
  'conscious',
  'sentient',
  'self-aware',
  'świadomy',
  'samoświadomy',
  'czujący',
] as const;

export function assertConfidence(value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('confidence must be finite and in [0,1]');
  }
}

export function assertClaim(claim: KnowledgeClaim): void {
  assertConfidence(claim.confidence);
  if ((claim.state === 'KNOWN' || claim.state === 'SUPPORTED') && claim.provenance.length === 0) {
    throw new Error(`${claim.state} claims require provenance`);
  }
  if (claim.state === 'SIMULATED' && claim.provenance.length === 0) {
    throw new Error('SIMULATED claims require model/simulation provenance');
  }
}

export function assertNonConsciousnessFraming(text: string): void {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_SELF_DESCRIPTIONS) {
    if (lower.includes(phrase)) {
      throw new Error(`Unsupported consciousness/sentience claim: ${phrase}`);
    }
  }
}

/**
 * Fix area 3 (consciousness-framing guard broadened). V1 only ever called
 * `assertNonConsciousnessFraming` on `DecisionTrace.decision` — every other free-text
 * field across every record type was unscreened. `screenFreeText` runs the same guard
 * over an arbitrary list of strings; `metaEngine.ts` calls it with every free-text field
 * of every record type that accepts one (DecisionTrace's five text fields/arrays,
 * KnowledgeClaim.assumptions, KnowledgeGap.question/reason, MetaLearningRecord.lesson/
 * proposedPolicyChange, CounterfactualRecord.predictedConsequences,
 * SelfRepairProposal.issue/proposedChange).
 */
export function screenFreeText(texts: readonly (string | undefined)[]): void {
  for (const text of texts) {
    if (text !== undefined) assertNonConsciousnessFraming(text);
  }
}

export const META_BOUNDARIES = Object.freeze({
  mayRewriteOwnCode: false,
  mayDeploy: false,
  mayBypassSafety: false,
  mayMutateEvidenceHistory: false,
  mayInventConfidence: false,
  mayClaimConsciousness: false,
});
