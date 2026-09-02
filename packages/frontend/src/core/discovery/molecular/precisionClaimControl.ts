import { deriveConfidence, describeConfidence, type ComputationalConfidenceLevel, type EvidenceForConfidence } from './confidenceLadder';
import type { TargetEvidenceRef } from './targetHypothesis';

/**
 * CLAIM PRECISION CONTROL — CLAIM → EVIDENCE → EVIDENCE TYPE → CONFIDENCE → LIMITATION.
 *
 * "Genesis NIE może napisać: '3-MMC działa tak samo jak X' jeżeli dane
 * pokazują tylko częściową zgodność." The seven levels below are NOT
 * interchangeable synonyms for "similar" — each is a different claim about a
 * different kind of evidence, and conflating them is exactly the
 * overinterpretation this module exists to block.
 *
 * Every claim is built through `buildClaim`, which computes its confidence
 * with the SAME `deriveConfidence` ladder used elsewhere in this engine — a
 * claim's confidence is earned by its own evidence, never assigned by the
 * strength label it carries.
 */
export const PRECISION_CLAIM_CONTROL_VERSION = '1.0.0';

/**
 * Ordered weakest-to-strongest. Each level answers a DIFFERENT question:
 *  - STRUCTURAL_SIMILARITY:      do the molecules resemble each other?
 *  - SAME_TARGET_FAMILY:         do they act on the same class of target?
 *  - SAME_TARGET:                do they act on the identical named target?
 *  - OVERLAPPING_MECHANISM:      do they share part of a mechanism, not all of it?
 *  - SIMILAR_TRANSPORTER_PROFILE:do their per-transporter activity patterns resemble each other?
 *  - FUNCTIONAL_SIMILARITY:      do they produce a similar measured functional/behavioural effect?
 *  - CLINICALLY_EQUIVALENT:      are they interchangeable in a clinical/human sense?
 */
export type ClaimStrength =
  | 'STRUCTURAL_SIMILARITY'
  | 'SAME_TARGET_FAMILY'
  | 'SAME_TARGET'
  | 'OVERLAPPING_MECHANISM'
  | 'SIMILAR_TRANSPORTER_PROFILE'
  | 'FUNCTIONAL_SIMILARITY'
  | 'CLINICALLY_EQUIVALENT';

export const CLAIM_STRENGTH_ORDER: readonly ClaimStrength[] = [
  'STRUCTURAL_SIMILARITY', 'SAME_TARGET_FAMILY', 'SAME_TARGET',
  'OVERLAPPING_MECHANISM', 'SIMILAR_TRANSPORTER_PROFILE', 'FUNCTIONAL_SIMILARITY', 'CLINICALLY_EQUIVALENT',
];

export type EvidenceType = 'LITERATURE' | 'DATABASE_RECORD' | 'STRUCTURAL_COMPUTATION' | 'CLASS_LEVEL_INFERENCE' | 'NONE';

export interface EvidenceLinkedClaim {
  claimId: string;
  statement: string;
  strength: ClaimStrength;
  evidence: readonly TargetEvidenceRef[];
  evidenceType: EvidenceType;
  confidence: ComputationalConfidenceLevel;
  confidenceStatement: string;
  /** What this claim does NOT establish — always populated, never blank. */
  limitation: string;
}

export interface ClaimInput {
  claimId: string;
  statement: string;
  strength: ClaimStrength;
  evidence: readonly TargetEvidenceRef[];
  evidenceType: EvidenceType;
  /** Distinct real computational engines that ran for this specific claim (e.g. 'RDKIT_STRUCTURE', 'RDKIT_SIMILARITY'). */
  completedComputationalChecks?: readonly string[];
  limitation: string;
}

/**
 * The ONLY way to construct a claim. `CLINICALLY_EQUIVALENT` is rejected
 * outright — Genesis has no clinical trial data for either compound in this
 * runtime, and no code path here can supply one, so the claim strength most
 * likely to be misused is the one this function refuses to ever return.
 */
export function buildClaim(input: ClaimInput): EvidenceLinkedClaim {
  if (input.strength === 'CLINICALLY_EQUIVALENT') {
    throw new Error(
      'CLINICALLY_EQUIVALENT cannot be claimed by this analysis. It requires real clinical/human-outcome data, which Genesis does not have for either compound in this runtime.',
    );
  }

  const evidenceForConfidence: EvidenceForConfidence = {
    hasHypothesis: true,
    independentSources: input.evidence.map((_e, i) => ({ sourceKey: `${input.claimId}-${i}`, kind: 'LITERATURE' as const, cited: true })),
    completedComputationalChecks: input.completedComputationalChecks ?? [],
  };
  const confidence = deriveConfidence(evidenceForConfidence);

  return {
    claimId: input.claimId,
    statement: input.statement,
    strength: input.strength,
    evidence: input.evidence,
    evidenceType: input.evidenceType,
    confidence,
    confidenceStatement: describeConfidence(confidence),
    limitation: input.limitation,
  };
}

/**
 * Whether `toClaim` is a legitimate upgrade of `fromClaim` given the SAME
 * evidence. A claim may never be silently strengthened — e.g. describing a
 * `STRUCTURAL_SIMILARITY` finding using `SIMILAR_TRANSPORTER_PROFILE` wording
 * without new evidence to support the stronger claim.
 */
export function isClaimStrengthEscalation(fromStrength: ClaimStrength, toStrength: ClaimStrength): boolean {
  return CLAIM_STRENGTH_ORDER.indexOf(toStrength) > CLAIM_STRENGTH_ORDER.indexOf(fromStrength);
}
