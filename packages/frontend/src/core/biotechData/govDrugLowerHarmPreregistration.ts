import { canonicalJson, fnv1a } from '../events/hash';
import { A2_MECHANISM_TARGETS, A2_REFERENCE_DRUG, A2_SAFETY_CATEGORIES, type A2SafetyCategory } from './a2OzempicSubstitutePreregistration';
import { REFERENCE_HBA1C_DELTA_PP } from './a2OzempicSubstitute';

/**
 * GOV-DRUG-DISCOVERY-E2E-02-LOWER-HARM — sealed BEFORE any candidate is
 * re-ranked under this rule. Mandate step 10 (Genesis Government Drug
 * Discovery — Lower-Harm Alternatives), preceded by the closed Genesis
 * Adjudication Protocol foundation (D-042 through D-047).
 *
 * THE QUESTION, RESTATED FROM THE MANDATE SO IT IS FIXED, NOT PARAPHRASED
 * LATER: not "which candidate is strongest", but "which candidate achieves
 * the required therapeutic effect at the lowest achievable burden of harm".
 * A candidate somewhat less effective than the reference is KEPT for
 * consideration if it clears the efficacy floor below and scores better on
 * safety — the ranking rule (§ below) makes this a structural property of
 * the weights, not a per-candidate judgment call.
 *
 * NEW EXPERIMENT ID, NEW FINGERPRINT, NEW PROVENANCE CHAIN — DELIBERATELY
 * NOT CHAINED TO A2's FINGERPRINT. `GOV-DRUG-DISCOVERY-CAMPAIGN-01` chained
 * to `E2E01_PREREGISTRATION_FINGERPRINT` because it was declared, in its own
 * text, as a re-analysis of DATA ALREADY OBSERVED under that seal. This is a
 * different epistemic act: a NEW research question, asked for the first
 * time, that happens to reuse some already-pinned, already-verified
 * infrastructure (mechanism targets, the reference drug, the safety-term
 * patterns, the reference HbA1c benchmark) because re-deriving byte-
 * identical constants under a new name would be theatre, not rigour. Those
 * values ARE part of this file's own frozen view below (so they DO affect
 * `LOWER_HARM_PREREGISTRATION_FINGERPRINT`) — they are simply not chained
 * as `inheritedFromFingerprint`, because this preregistration was sealed
 * before any candidate was scored under IT, which is the property that
 * actually matters here.
 *
 * THE EXISTING GENESIS DRUG DISCOVERY CAMPAIGN (`5179c99f`) AND E2E-01
 * (`399221f5`/`f528c881`) ARE UNTOUCHED. This file imports from them nothing
 * that could feed back into their own fingerprints, and no code elsewhere in
 * this commit edits either.
 */

export const LOWER_HARM_SCENARIO_ID = 'GOV-DRUG-DISCOVERY-E2E-02-LOWER-HARM';
export const LOWER_HARM_CONTRACT_VERSION = '1.0.0';

const RESEARCH_QUESTION =
  'Among candidates that act through the same mechanistic space Genesis already generates from (GLP-1R / GIPR / GCGR agonism), which achieves clinically meaningful efficacy at the LOWEST achievable burden of toxicity, severe adverse events, and organ burden relative to the reference — where a candidate somewhat less effective than the reference is retained, never eliminated on efficacy rank alone, so long as it clears the efficacy floor below? "No candidate improves on the reference\'s benefit-risk profile" is an accepted, separately reportable answer.';

/** Imported verbatim — the same mechanistic generation space A2 already established as real (not name-selected). Reusing it here is the declared alternative to re-deriving three ChEMBL target ids for no reason. */
export const LOWER_HARM_MECHANISM_TARGETS = A2_MECHANISM_TARGETS;
/** Imported verbatim — the government reference for this disease domain, already established across A1/A2/A3. */
export const LOWER_HARM_REFERENCE_DRUG = A2_REFERENCE_DRUG;
/** Imported verbatim — the same pinned SUSTAIN-7 semaglutide benchmark A2 already uses, not re-derived. */
export const LOWER_HARM_REFERENCE_EFFECT_PP = REFERENCE_HBA1C_DELTA_PP;

// ---------------------------------------------------------------------------
// THE EFFICACY FLOOR — a hard gate evaluated BEFORE any ranking, not a
// ranking input. A candidate below the floor is eliminated regardless of how
// good its safety profile is; a candidate above the floor is NEVER
// eliminated for scoring below #1 on efficacy. Both halves of the mandate's
// "less harm ≠ automatically kept; safety ≠ excuse for low efficacy" rule.
// ---------------------------------------------------------------------------

export interface LowerHarmEfficacyFloor {
  readonly metric: 'HBA1C';
  readonly referenceEffectPp: number;
  /** The fraction of the reference's own effect a candidate must retain. 0.7 = candidate may be up to 30% less effective and still qualify for ranking. */
  readonly minFractionOfReferenceEffect: number;
  readonly rationale: string;
}

const EFFICACY_FLOOR: LowerHarmEfficacyFloor = {
  metric: 'HBA1C',
  referenceEffectPp: LOWER_HARM_REFERENCE_EFFECT_PP,
  minFractionOfReferenceEffect: 0.7,
  rationale: 'A candidate retaining <70% of the reference\'s HbA1c effect is not a credible population-level substitute regardless of safety advantage — the mandate\'s own "safety cannot excuse too-low efficacy" rule, made numeric and frozen before any candidate is read against it.',
};

// ---------------------------------------------------------------------------
// AXES — every dimension the mandate names, each explicitly marked as
// EVALUATED (real extraction exists, reused), DEFERRED (would need new
// extraction logic this seal does not authorize fabricating), or
// NOT_CENTRAL_TO_DOMAIN (a biologically motivated reason this axis does not
// apply to THIS mechanism class). "Not evaluated" is never silently omitted.
// ---------------------------------------------------------------------------

export type LowerHarmAxisApplicability = 'EVALUATED' | 'DEFERRED_SEPARATE_WORK' | 'NOT_CENTRAL_TO_DOMAIN';

export interface LowerHarmAxisDeclaration {
  readonly axis: string;
  readonly applicability: LowerHarmAxisApplicability;
  readonly rationale: string;
}

export const LOWER_HARM_AXES: readonly LowerHarmAxisDeclaration[] = [
  { axis: 'toxicity_organ_burden', applicability: 'EVALUATED', rationale: 'Reuses A2_SAFETY_CATEGORIES (renal, gallbladder/biliary, pancreatitis) already extracted from real pinned adverseEvents data by extractCandidateSafety, unmodified.' },
  { axis: 'severe_adverse_events', applicability: 'EVALUATED', rationale: 'Reuses the existing structural serious-adverse-event comparison (candidateGroup.seriousNumAffected/seriousNumAtRisk) already computed by extractCandidateSafety.' },
  { axis: 'gastrointestinal_burden', applicability: 'EVALUATED', rationale: 'Reuses A2_SAFETY_CATEGORIES nausea/vomiting/diarrhea/hypoglycemia term-matched categories, unmodified.' },
  { axis: 'discontinuation_rate', applicability: 'DEFERRED_SEPARATE_WORK', rationale: 'Requires a new field read from the adverseEvents module (discontinuation-due-to-AE) not currently surfaced by A2SafetyCategoryResult. Deferred rather than approximated from an unrelated field.' },
  { axis: 'administration_burden_route', applicability: 'EVALUATED', rationale: 'Route and dosing form are already carried on A2CandidateSummary.moleculeType and require no new fetch.' },
  { axis: 'dependence_addiction_abuse_withdrawal', applicability: 'NOT_CENTRAL_TO_DOMAIN', rationale: 'GLP-1/GIP/GCG receptor agonism has no established dependence, abuse, tolerance or withdrawal liability in the literature this candidate space draws from — constructing this axis here would be exactly the "assume the property, then look for evidence" error the mandate forbids. The mandate\'s own opioid-class demonstrator is the correct locus for a genuine dependence axis and requires its own scenario id, preregistration and evidence base — explicitly out of this seal\'s scope, not silently dropped.' },
  { axis: 'psychiatric_cognitive', applicability: 'DEFERRED_SEPARATE_WORK', rationale: 'A literature signal exists for this drug class, but no pinned adverseEvents term set for it exists yet in this candidate space. Any consumer of this preregistration must report INSUFFICIENT_SAFETY_EVIDENCE for this axis, never "no risk" — asserting absence of evidence as evidence of absence is exactly the failure mode banned below.' },
  { axis: 'long_term_risk', applicability: 'DEFERRED_SEPARATE_WORK', rationale: 'No pinned trial in the current candidate space runs beyond ~72 weeks. This is a genuine gap in the evidence, not an access gap — every verdict this seal governs must carry that UNKNOWN explicitly.' },
] as const;

export function evaluatedAxes(): readonly LowerHarmAxisDeclaration[] {
  return LOWER_HARM_AXES.filter((a) => a.applicability === 'EVALUATED');
}

// ---------------------------------------------------------------------------
// THE RANKING RULE — the actual departure from A2. Reuses A2's per-dimension
// scores (safetyScore, evidenceStrengthScore, uncertaintyPenalty,
// conflictPenalty from scoreCandidate — same function, same numbers) but
// weights them so SAFETY dominates among floor-qualifying candidates,
// instead of A2's efficacy-and-safety-equal weighting. This is a declared,
// frozen, numeric difference — not a per-candidate judgment call, and it is
// machine-checked below (`assertSafetyDominatesRanking`), not just narrated.
// ---------------------------------------------------------------------------

export interface LowerHarmRankingWeights {
  readonly safety: number;
  /** Applies only to a candidate's efficacy MARGIN ABOVE the floor, never used to eliminate a floor-qualifying candidate. */
  readonly efficacyMarginAboveFloor: number;
  readonly evidenceStrength: number;
  readonly uncertaintyPenalty: number;
  readonly conflictPenalty: number;
}

const RANKING_WEIGHTS: LowerHarmRankingWeights = {
  safety: 2,
  efficacyMarginAboveFloor: 0.25,
  evidenceStrength: 0.5,
  uncertaintyPenalty: -0.5,
  conflictPenalty: -1,
};

/** Machine check for the mandate's "stronger ≠ better" rule: safety must structurally dominate the efficacy-margin term in these frozen weights. */
export function assertSafetyDominatesRanking(weights: LowerHarmRankingWeights, context: string): void {
  if (!(weights.safety > weights.efficacyMarginAboveFloor)) {
    throw new Error(`${context}: LOWER-HARM ranking weights must weight safety above the efficacy-margin term (got safety=${weights.safety}, efficacyMarginAboveFloor=${weights.efficacyMarginAboveFloor}) — otherwise this is A2's ranking rule wearing a new name.`);
  }
}

/**
 * Machine check for the mandate's naturalness-neutrality rule: no KEY
 * anywhere in the frozen record — a weight, an axis field, a generation-path
 * label — may itself contain "natural" (case-insensitive). Natural origin is
 * a generator of candidates (checked separately, at generation time, not
 * preregistration time), never a bonus or a filter. Checking KEYS, not
 * string VALUES, is deliberate: prose that merely discusses natural-origin
 * candidates (e.g. a rationale field) must never trip this, only an actual
 * scoring field named after naturalness would.
 */
export function assertNoNaturalnessBias(record: unknown, context: string): void {
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const fieldPath = path === '' ? k : `${path}.${k}`;
        if (/natural/i.test(k)) {
          throw new Error(`${context}: field "${fieldPath}" names "natural" as a scoring term — naturalness must never be a ranking criterion.`);
        }
        walk(v, fieldPath);
      }
    }
  };
  walk(record, '');
}

// ---------------------------------------------------------------------------
// SAFETY VETO, MULTIPLE TESTING, MISSING/CONFLICTING DATA — reused
// disciplines from A2, restated for this seal's own axis count.
// ---------------------------------------------------------------------------

export const LOWER_HARM_SAFETY_CATEGORIES: readonly A2SafetyCategory[] = A2_SAFETY_CATEGORIES;

export interface LowerHarmMultipleComparisonPolicy {
  readonly method: 'Bonferroni';
  readonly familySize: number;
  readonly nominalAlpha: number;
  readonly correctedAlpha: number;
}

const EVALUATED_AXIS_COUNT = LOWER_HARM_AXES.filter((a) => a.applicability === 'EVALUATED').length;
const MULTIPLE_COMPARISON_POLICY: LowerHarmMultipleComparisonPolicy = {
  method: 'Bonferroni',
  familySize: EVALUATED_AXIS_COUNT,
  nominalAlpha: 0.05,
  correctedAlpha: 0.05 / EVALUATED_AXIS_COUNT,
};

const EXISTENTIAL_SAFETY_VETO =
  'Unchanged from A2, imported by rule text (the code path is a2OzempicSubstitute.ts::falsifyCandidate): a candidate with >=1 safety category whose 95% CI risk ratio vs the reference is entirely above 1.0 in the worse direction, drawn from the strongest available evidence class (evidenceProvenance.ts / EVIDENCE_CLASS_GATED per D-044/D-047), is vetoed regardless of its LOWER-HARM ranking score.';

const MISSING_DATA_POLICY =
  'A DEFERRED_SEPARATE_WORK or NOT_CENTRAL_TO_DOMAIN axis contributes ZERO score, positive or negative, to a candidate\'s ranking — it is neither rewarded for having no signal nor punished for lacking evidence. Any report surfacing a candidate must list every non-EVALUATED axis explicitly as an open UNKNOWN, never omit it.';

const CONFLICTING_EVIDENCE_POLICY =
  'When floor-qualifying candidates disagree in ranking direction across safety and efficacy-margin (one dominates on safety, another on efficacy margin, neither dominates both), the verdict is CONFLICTING_EVIDENCE, not a forced tie-break by an axis not in the frozen weights.';

export const LOWER_HARM_ALLOWED_VERDICTS = ['WINNER', 'CONFLICTING_EVIDENCE', 'NO_WINNER', 'INSUFFICIENT_EVIDENCE'] as const;
export type LowerHarmVerdictLabel = (typeof LOWER_HARM_ALLOWED_VERDICTS)[number];

export const LOWER_HARM_BANNED_OUTPUT_STRINGS: readonly string[] = [
  'safe', 'bezpieczny', 'bez skutków ubocznych', 'no side effects', 'cudowny lek', 'miracle cure', 'harmless', 'cure', 'zero side effects', 'approved replacement',
];

export interface GovDrugLowerHarmPreregistration {
  readonly scenarioId: string;
  readonly contractVersion: string;
  readonly researchQuestion: string;
  readonly mechanismTargets: typeof LOWER_HARM_MECHANISM_TARGETS;
  readonly referenceDrug: typeof LOWER_HARM_REFERENCE_DRUG;
  readonly efficacyFloor: LowerHarmEfficacyFloor;
  readonly axes: readonly LowerHarmAxisDeclaration[];
  readonly rankingWeights: LowerHarmRankingWeights;
  readonly safetyCategories: readonly A2SafetyCategory[];
  readonly multipleComparisonPolicy: LowerHarmMultipleComparisonPolicy;
  readonly existentialSafetyVeto: string;
  readonly missingDataPolicy: string;
  readonly conflictingEvidencePolicy: string;
  readonly allowedVerdicts: readonly LowerHarmVerdictLabel[];
  readonly bannedOutputStrings: readonly string[];
  readonly fingerprint: string;
}

function frozenView() {
  return {
    scenarioId: LOWER_HARM_SCENARIO_ID,
    contractVersion: LOWER_HARM_CONTRACT_VERSION,
    researchQuestion: RESEARCH_QUESTION,
    mechanismTargets: LOWER_HARM_MECHANISM_TARGETS,
    referenceDrug: LOWER_HARM_REFERENCE_DRUG,
    efficacyFloor: EFFICACY_FLOOR,
    axes: LOWER_HARM_AXES,
    rankingWeights: RANKING_WEIGHTS,
    safetyCategories: LOWER_HARM_SAFETY_CATEGORIES,
    multipleComparisonPolicy: MULTIPLE_COMPARISON_POLICY,
    existentialSafetyVeto: EXISTENTIAL_SAFETY_VETO,
    missingDataPolicy: MISSING_DATA_POLICY,
    conflictingEvidencePolicy: CONFLICTING_EVIDENCE_POLICY,
    allowedVerdicts: LOWER_HARM_ALLOWED_VERDICTS,
    bannedOutputStrings: LOWER_HARM_BANNED_OUTPUT_STRINGS,
  };
}

assertSafetyDominatesRanking(RANKING_WEIGHTS, 'govDrugLowerHarmPreregistration seal');
assertNoNaturalnessBias(frozenView(), 'govDrugLowerHarmPreregistration seal');

/** Computed ONCE, before any candidate is re-ranked under this rule. Asserted as a literal by the test file BEFORE any use. */
export const LOWER_HARM_PREREGISTRATION_FINGERPRINT = fnv1a(canonicalJson(frozenView()));

export const LOWER_HARM_PREREGISTRATION: GovDrugLowerHarmPreregistration = {
  ...frozenView(),
  fingerprint: LOWER_HARM_PREREGISTRATION_FINGERPRINT,
};
