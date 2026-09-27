/**
 * MECHANISTIC MATCH SCORE — a domain-agnostic, weighted, 7-axis comparison
 * of a candidate against a reference pharmacology profile.
 *
 * "STRUCTURAL SIMILARITY != PHARMACOLOGICAL EQUIVALENCE." This score never
 * reads a Tanimoto value; it reads seven SEPARATE, independently-graded
 * axes (target, mechanism, direction, assay comparability, quantitative
 * comparability, selectivity, safety advantage), each carrying its own
 * evidence-basis tag, and combines them with fixed, declared weights.
 *
 * THE THRESHOLD (0.95) IS A MECHANISTIC SCORE, NEVER A CLINICAL ONE. This
 * module makes no claim about efficacy, potency, or clinical effect — it
 * measures how much of the reference's MECHANISM the evidence available
 * right now supports for one candidate, axis by axis, and discloses exactly
 * which axes are unknown rather than silently treating missing evidence as
 * either support or refutation.
 *
 * UNKNOWN AXES CONTRIBUTE ZERO TO THE SCORE, BUT ARE NEVER REPORTED AS
 * NEGATIVE. `MechanisticMatchResult.unknownWeight` names exactly how many
 * percentage points of the total are unresolved due to missing evidence,
 * separately from `mismatchWeight` (points lost to genuine contradicting
 * evidence) — so a low score for missing data reads differently from a low
 * score for real disagreement.
 */
export const MECHANISTIC_MATCH_SCORE_VERSION = '1.0.0';

export type AxisGrade = 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'UNKNOWN';

/** The evidence-status vocabulary required for every claim this module produces. */
export type EvidenceBasisTag =
  | 'VERIFIED_SOURCE'
  | 'LITERATURE_SUPPORTED'
  | 'COMPUTATIONALLY_SUPPORTED'
  | 'DERIVED'
  | 'HYPOTHESIS'
  | 'UNKNOWN'
  | 'CONFLICTING'
  | 'BLOCKED'
  | 'NOT_AVAILABLE';

export interface MechanisticAxisInput {
  grade: AxisGrade;
  basis: EvidenceBasisTag;
  /** Why this grade — must reference real, checkable evidence, never a bare assertion. */
  rationale: string;
}

export interface MechanisticMatchInputs {
  targetMatch: MechanisticAxisInput;
  mechanismMatch: MechanisticAxisInput;
  directionMatch: MechanisticAxisInput;
  assayMatch: MechanisticAxisInput;
  quantitativeComparability: MechanisticAxisInput;
  selectivity: MechanisticAxisInput;
  safetyAdvantage: MechanisticAxisInput;
}

export type MechanisticAxisId = keyof MechanisticMatchInputs;

/** Fixed, declared weights — sum to 1.0. Never learned, never tuned per candidate. */
export const MECHANISTIC_MATCH_WEIGHTS: Readonly<Record<MechanisticAxisId, number>> = {
  targetMatch: 0.30,
  mechanismMatch: 0.25,
  directionMatch: 0.15,
  assayMatch: 0.10,
  quantitativeComparability: 0.10,
  selectivity: 0.05,
  safetyAdvantage: 0.05,
};

/** Acceptance threshold: a candidate must reach at least this weighted fraction to be treated as mechanistically matching. */
export const MECHANISTIC_MATCH_THRESHOLD = 0.95;

const AXIS_IDS = Object.keys(MECHANISTIC_MATCH_WEIGHTS) as readonly MechanisticAxisId[];

function assertWeightsSumToOne(): void {
  const total = AXIS_IDS.reduce((sum, id) => sum + MECHANISTIC_MATCH_WEIGHTS[id], 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`MECHANISTIC_MATCH_WEIGHTS must sum to 1.0, got ${total}.`);
  }
}
assertWeightsSumToOne();

/** A real grade always contributes 1.0 (MATCH), 0.5 (PARTIAL) or 0.0 (MISMATCH) of its axis's weight. UNKNOWN contributes 0 — never fabricated support, but never reported as refutation either (see `unknownWeight`). */
function gradeFraction(grade: AxisGrade): number {
  switch (grade) {
    case 'MATCH': return 1;
    case 'PARTIAL': return 0.5;
    case 'MISMATCH': return 0;
    case 'UNKNOWN': return 0;
  }
}

export interface ScoredAxis {
  axis: MechanisticAxisId;
  weight: number;
  grade: AxisGrade;
  /** weight * gradeFraction(grade) — the real contribution to the total score. */
  contribution: number;
  basis: EvidenceBasisTag;
  rationale: string;
}

export interface MechanisticMatchResult {
  contractVersion: string;
  candidateKey: string;
  referenceName: string;
  axes: readonly ScoredAxis[];
  /** Sum of all axis contributions, in [0, 1]. */
  totalScore: number;
  /** totalScore as a 0-100 percentage, for display. */
  totalScorePercent: number;
  /** Sum of weights whose axis is UNKNOWN — disclosed separately so a low score from missing evidence is never confused with a low score from real disagreement. */
  unknownWeight: number;
  /** Sum of weights whose axis is a real, graded MISMATCH — the "lost to genuine disagreement" portion. */
  mismatchWeight: number;
  meetsThreshold: boolean;
}

/**
 * Combines seven independently-graded axes into one weighted mechanistic
 * match score. Never invents a grade for a missing axis: the caller must
 * supply one entry per axis, graded UNKNOWN when there is genuinely nothing
 * to go on.
 */
export function computeMechanisticMatchScore(
  candidateKey: string,
  referenceName: string,
  inputs: MechanisticMatchInputs,
): MechanisticMatchResult {
  const axes: ScoredAxis[] = AXIS_IDS.map((axis) => {
    const input = inputs[axis];
    const weight = MECHANISTIC_MATCH_WEIGHTS[axis];
    return { axis, weight, grade: input.grade, contribution: weight * gradeFraction(input.grade), basis: input.basis, rationale: input.rationale };
  });

  const totalScore = axes.reduce((sum, a) => sum + a.contribution, 0);
  const unknownWeight = axes.filter((a) => a.grade === 'UNKNOWN').reduce((sum, a) => sum + a.weight, 0);
  const mismatchWeight = axes.filter((a) => a.grade === 'MISMATCH').reduce((sum, a) => sum + a.weight, 0);

  return {
    contractVersion: MECHANISTIC_MATCH_SCORE_VERSION,
    candidateKey,
    referenceName,
    axes,
    totalScore,
    totalScorePercent: totalScore * 100,
    unknownWeight,
    mismatchWeight,
    meetsThreshold: totalScore >= MECHANISTIC_MATCH_THRESHOLD,
  };
}

/** One sanctioned sentence: never phrased as clinical efficacy or proven equivalence. */
export function mechanisticMatchStatement(result: MechanisticMatchResult): string {
  const pct = result.totalScorePercent.toFixed(1);
  const unknownPct = (result.unknownWeight * 100).toFixed(1);
  const verdict = result.meetsThreshold
    ? `meets the ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}% mechanistic-match threshold`
    : `does not meet the ${(MECHANISTIC_MATCH_THRESHOLD * 100).toFixed(0)}% mechanistic-match threshold`;
  return `${result.candidateKey} vs ${result.referenceName}: ${pct}% weighted mechanistic match (${unknownPct} percentage point(s) unresolved due to missing evidence, not counted as either support or refutation) — ${verdict}. `
    + 'This is a mechanistic comparison score, not a claim of clinical efficacy, potency, or proven pharmacological equivalence.';
}
