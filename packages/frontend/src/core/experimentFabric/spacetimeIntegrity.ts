import { assertNoTruthUpgrade, type EpistemicLabel } from '../scientificWorlds/humanLab/epistemic';

/**
 * SPACETIME / TEMPORAL SCIENTIFIC INTEGRITY — validation only (Overnight Science Task 9).
 *
 * This module implements NO renderer, NO world template, and NO second temporal engine. It reuses
 * the existing canonical `EpistemicLabel` taxonomy (`scientificWorlds/humanLab/epistemic.ts`,
 * unmodified) — the same 10-value vocabulary already used to label world content elsewhere in this
 * repo — rather than inventing a parallel "HYPOTHETICAL/INFERRED" vocabulary the mandate's prose
 * names informally. The mapping below is this module's one real decision: which existing label a
 * given physics-claim category is REQUIRED to carry, and a historical-reconstruction claim is
 * downgraded from `RECONSTRUCTION` to `INSUFFICIENT_EVIDENCE` whenever it carries zero real
 * `sourceIds` — "INFERRED unless sourced" becomes "the strong label requires real sources, or the
 * claim must say so honestly instead."
 *
 * Existing temporal/branch substrate on this branch (both read-only, both unmodified):
 * `core/worldModel/temporal/temporalEngine.ts` (`TemporalEngine`/`TemporalBranchRegistry` —
 * generic delta-log branching, no relativistic physics of its own) and
 * `core/worldModel/discovery/worldCounterfactual.ts` (branch-diff/falsification over that engine).
 * Domain physics claims (wormholes, multiverse, time dilation, gravity wells, historical
 * reconstruction) are asserted by callers ABOVE those engines; this module only judges whether the
 * label attached to such a claim is the honest one.
 */
export const SPACETIME_INTEGRITY_VERSION = '1.0.0';

export type PhysicsClaimCategory =
  | 'WORMHOLE'
  | 'MULTIVERSE'
  | 'TIME_DILATION'
  | 'GRAVITY_WELL'
  | 'HISTORICAL_RECONSTRUCTION';

const REQUIRED_LABEL_FOR_NON_HISTORICAL_CATEGORY: Readonly<
  Record<Exclude<PhysicsClaimCategory, 'HISTORICAL_RECONSTRUCTION'>, EpistemicLabel>
> = {
  WORMHOLE: 'HYPOTHESIS',
  MULTIVERSE: 'SIMULATION',
  TIME_DILATION: 'MODEL',
  GRAVITY_WELL: 'MODEL',
};

/**
 * The one honest label a physics claim of this category may carry. Historical reconstruction is
 * the only category that depends on the claim's own evidence: `RECONSTRUCTION` when real
 * `sourceIds` back it, `INSUFFICIENT_EVIDENCE` otherwise — never silently promoted to
 * `RECONSTRUCTION` on an unsourced claim.
 */
export function requiredEpistemicLabelForPhysicsClaim(
  category: PhysicsClaimCategory,
  sourceIds: readonly string[] = [],
): EpistemicLabel {
  if (category === 'HISTORICAL_RECONSTRUCTION') {
    return sourceIds.length > 0 ? 'RECONSTRUCTION' : 'INSUFFICIENT_EVIDENCE';
  }
  return REQUIRED_LABEL_FOR_NON_HISTORICAL_CATEGORY[category];
}

export interface PhysicsClaim {
  readonly claimId: string;
  readonly category: PhysicsClaimCategory;
  readonly statement: string;
  readonly assignedLabel: EpistemicLabel;
  readonly sourceIds: readonly string[];
}

const BACKWARD_TIME_TRAVEL_PATTERNS: readonly RegExp[] = [
  /\btravel(?:l?ed|ling|s)?\s+back(?:wards?)?\s+(?:in|through)\s+time\b/i,
  /\bwent\s+back\s+in\s+time\b/i,
  /\breturn(?:ed|ing)?\s+to\s+the\s+past\b/i,
  /\breverse[sd]?\s+causality\b/i,
  /\bchange[sd]?\s+the\s+past\b/i,
  /\bundo(?:es|ne|ing)?\s+history\b/i,
  /\bretroactively\s+alter/i,
];

/**
 * No spacetime claim in this repo may assert that backward time travel happened or is possible —
 * a real check on the claim text, not just a comment. Throws rather than silently letting a
 * "we went back and changed the past" statement through.
 */
export function assertNoBackwardTimeTravelClaim(statement: string): void {
  for (const pattern of BACKWARD_TIME_TRAVEL_PATTERNS) {
    if (pattern.test(statement)) {
      throw new Error(
        `SPACETIME_INTEGRITY_REJECTED: statement asserts backward time travel (${pattern.source}): "${statement}"`,
      );
    }
  }
}

export interface PhysicsClaimValidation {
  readonly claim: PhysicsClaim;
  readonly requiredLabel: EpistemicLabel;
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Validates one physics claim: rejects a backward-time-travel assertion outright, then checks the
 * claim's `assignedLabel` against the one honest label its category requires. A mismatch is
 * reported (never thrown) as `ok: false` UNLESS it is also a truth upgrade the canonical epistemic
 * firewall (`assertNoTruthUpgrade`) forbids outright (e.g. labeling a wormhole claim
 * `REAL_OBSERVATION`), which throws.
 */
export function validatePhysicsClaim(claim: PhysicsClaim): PhysicsClaimValidation {
  assertNoBackwardTimeTravelClaim(claim.statement);
  const requiredLabel = requiredEpistemicLabelForPhysicsClaim(claim.category, claim.sourceIds);
  assertNoTruthUpgrade(requiredLabel, claim.assignedLabel);
  if (claim.assignedLabel === requiredLabel) {
    return { claim, requiredLabel, ok: true };
  }
  return {
    claim,
    requiredLabel,
    ok: false,
    reason: `${claim.category} claim "${claim.claimId}" is labeled ${claim.assignedLabel}; the honest label for this category is ${requiredLabel}.`,
  };
}

/** Validates a batch of claims, never throwing for a plain mismatch — only for a forbidden upgrade or a backward-time-travel statement. */
export function validatePhysicsClaims(claims: readonly PhysicsClaim[]): readonly PhysicsClaimValidation[] {
  return claims.map((claim) => validatePhysicsClaim(claim));
}
