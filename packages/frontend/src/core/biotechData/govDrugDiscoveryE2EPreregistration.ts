import { canonicalJson, fnv1a } from '../events/hash';
import { A1_PREREGISTRATION } from './a1Glp1Preregistration';
import { A2_PREREGISTRATION } from './a2OzempicSubstitutePreregistration';
import { A3_PREREGISTRATION } from './a3GovernmentPreregistration';

/**
 * GOV-DRUG-DISCOVERY-E2E-01 — SEALED BEFORE THE GENERATED CANDIDATE SPACE
 * WAS PULLED.
 *
 * A1 compared two named drugs. A2 built its candidate space from mechanism
 * but pinned only the 20 molecules that survived its clinical-development
 * gate. A3 made that answerable for a government, with a required
 * population. What NONE of them proves is the property this scenario
 * exists to demonstrate under audit:
 *
 *   GENERATION, NOT SELECTION. A system handed a pinned list of 12
 *   candidates and asked to "find the best" is doing multiple choice. The
 *   claim being tested here is that the candidate space is CONSTRUCTED
 *   from mechanism — hundreds of real molecules, most of which no human
 *   named — and then narrowed by criteria fixed in advance, with every
 *   elimination logged with its reason and its evidence.
 *
 * So the negative control is explicit and adversarial: A2's own pinned
 * candidate list is loaded as `fixture_presupplied_candidates.json` and
 * the run FAILS if the generated set equals it, is smaller than
 * `minimumGeneratedSetSize`, or does not contain at least
 * `minimumOutsidePinnedSetSize` molecules the pinned list never had.
 *
 * WHY AN HONEST NON-WINNER IS A PASS. `E2E01_ALLOWED_OUTCOMES` contains
 * four ways to end without naming a winner. A2's real result on this same
 * evidence was CONFLICTING_EVIDENCE (tirzepatide's real diarrhea risk
 * ratio vetoing the one candidate with an efficacy advantage), so that —
 * or NO_SAFE_WINNER — is the expected honest ending here too. The
 * acceptance criterion is that the outcome is EVIDENCE-DRIVEN, never that
 * a winner was produced. A forced winner is the failure mode this
 * preregistration exists to make impossible.
 *
 * NOTHING BELOW IS RE-DERIVED FROM THE DATA IT GOVERNS. The assay
 * inclusion rule, the safety categories, the existential safety veto and
 * the effect-size thresholds are REUSED BY REFERENCE from A2's own sealed
 * preregistration; the population vocabulary and graded safety labels from
 * A3's. `E2E01_PRIOR_RUN_FINGERPRINTS` records the exact sealed
 * fingerprints this scenario stands on, so a later reader can prove no
 * upstream rule was quietly edited to make this run succeed.
 */

export const E2E01_SCENARIO_ID = 'GOV-DRUG-DISCOVERY-E2E-01';
export const E2E01_CONTRACT_VERSION = '1.0.0';

export const E2E01_PROBLEM =
  'Znajdz najlepsza potencjalna alternatywe dla semaglutydu dla populacji: otylosc + cukrzyca typu 2 (adults), gdy semaglutyd jest niedostepny / zbyt drogi / ma nieakceptowalny profil bezpieczenstwa.';

/** The population this scenario is run for. Supplied — so the run must NOT return REQUIRED_POLICY_INPUT (a separate control asserts the no-population case still does). */
export const E2E01_POPULATION = { kind: 'T2D_AND_OBESITY' } as const;

// ---------------------------------------------------------------------------
// Generation (Tier-0) — the property under test
// ---------------------------------------------------------------------------

export interface E2E01GenerationMethod {
  /** EVERY distinct molecule with qualifying human binding/functional data at the incretin-axis targets — the stage A2 computed and then discarded, kept here because it IS the generated space. */
  readonly source: string;
  readonly targetChemblIds: readonly string[];
  /** Reused verbatim from A2's sealed rule — not restated, not re-tuned. */
  readonly assayInclusionRuleFrom: string;
  readonly excludeMoleculeIds: readonly string[];
  /** No drug name is ever the query for generation. Names enter only at the unavoidable ClinicalTrials.gov lookup, which happens AFTER a candidate already exists. */
  readonly noDrugNameQuery: true;
  readonly generatedByLabel: 'GENERATOR';
  /** T1 thresholds. A real run below these FAILS and is reported as a failure — the numbers are not adjusted afterwards to fit whatever the data gave. */
  readonly minimumGeneratedSetSize: number;
  readonly minimumOutsidePinnedSetSize: number;
  readonly requiredProvenanceFields: readonly string[];
}

export const E2E01_GENERATION_METHOD: E2E01GenerationMethod = {
  source: 'ChEMBL activity query across GLP-1R + GIPR + GCGR, full pagination, every distinct qualifying molecule retained BEFORE any clinical-development gate',
  targetChemblIds: ['CHEMBL1784', 'CHEMBL4383', 'CHEMBL1985'],
  assayInclusionRuleFrom: 'A2_PREREGISTRATION.candidateInclusion.assay',
  excludeMoleculeIds: ['CHEMBL2108724'],
  noDrugNameQuery: true,
  generatedByLabel: 'GENERATOR',
  minimumGeneratedSetSize: 60,
  minimumOutsidePinnedSetSize: 20,
  requiredProvenanceFields: ['source', 'identifier', 'retrievalTime', 'hash'],
};

// ---------------------------------------------------------------------------
// Funnel criteria — fixed here, applied later, never re-chosen after seeing counts
// ---------------------------------------------------------------------------

export interface E2E01TierCriteria {
  readonly tier1: {
    readonly mechanismPlausibility: string;
    readonly dataAvailabilityMinMaxPhase: number;
  };
  readonly tier2: {
    readonly efficacyEvidenceGate: string;
    readonly safetyEvidenceGate: string;
  };
  readonly top3Size: number;
  /**
   * Stage sizes are DATA-DRIVEN. What is asserted is that each stage
   * strictly reduces the previous one and that every eliminated candidate
   * carries a reason and its evidence — never that a stage produced a
   * particular count.
   */
  readonly assertsReductionNotCounts: true;
}

export const E2E01_TIER_CRITERIA: E2E01TierCriteria = {
  tier1: {
    mechanismPlausibility: 'At least one qualifying activity at GLP-1R, GIPR or GCGR under A2_PREREGISTRATION.candidateInclusion.assay.',
    dataAvailabilityMinMaxPhase: 2,
  },
  tier2: {
    efficacyEvidenceGate: 'At least one real posted-result trial yielding a numerically computable efficacy comparison against semaglutide (comparisonType !== NO_COMPARISON and deltaVsSemaglutidePp !== null).',
    safetyEvidenceGate: 'At least one adverse-event category with a computable risk ratio AND 95% CI against the semaglutide reference arm.',
  },
  top3Size: 3,
  assertsReductionNotCounts: true,
};

/** §6 — the six attacks every surviving candidate must be put through before anything is called a winner. */
export type E2E01FalsificationAttack = 'EFFICACY' | 'SAFETY' | 'SUBGROUP' | 'LONG_TERM' | 'EXPOSURE_OR_PUBLICATION_BIAS' | 'CONFLICTING_TRIALS';

export const E2E01_FALSIFICATION_ATTACKS: readonly E2E01FalsificationAttack[] = [
  'EFFICACY', 'SAFETY', 'SUBGROUP', 'LONG_TERM', 'EXPOSURE_OR_PUBLICATION_BIAS', 'CONFLICTING_TRIALS',
];

// ---------------------------------------------------------------------------
// Winner selection — including every way this can honestly end without one
// ---------------------------------------------------------------------------

export type E2E01Outcome = 'WINNER' | 'NO_WINNER' | 'NO_SAFE_WINNER' | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTING_EVIDENCE';

export const E2E01_ALLOWED_OUTCOMES: readonly E2E01Outcome[] = ['WINNER', 'NO_WINNER', 'NO_SAFE_WINNER', 'INSUFFICIENT_EVIDENCE', 'CONFLICTING_EVIDENCE'];

export const E2E01_WINNER_RULES =
  'WINNER requires ALL of: (a) the candidate survives every one of E2E01_FALSIFICATION_ATTACKS with no surfaced counterevidence that remains unresolved, (b) it is not vetoed by A2_PREREGISTRATION.existentialSafetyVeto, (c) no other surviving candidate shows an efficacy signal in the opposite direction on comparable evidence, and (d) at least one trial behind it matches the requested population. Otherwise: every surviving candidate vetoed on safety -> NO_SAFE_WINNER; no candidate reaches Tier-2 at all -> INSUFFICIENT_EVIDENCE; surviving candidates disagree in direction -> CONFLICTING_EVIDENCE; a single candidate leads but carries unresolved counterevidence -> NO_WINNER. A winner is never produced merely because the question asked for one.';

/** A research-grade recipe may ONLY be emitted for outcome WINNER, and never contains individual clinical direction or operational synthesis detail. */
export const E2E01_RECIPE_RULES =
  'ResearchRecipeGenerator runs if and only if outcome === WINNER. The emitted artifact is research/conceptual: mechanism, formulation concept, conceptual route, required properties, material classes, provenance, sources, identifiers, evidence, replay, dualUseGuard. It never contains a dose, a prescription, a patient instruction, or step-level operational synthesis for a controlled or hazardous substance.';

// ---------------------------------------------------------------------------
// Truth-engine assertions (build-failing)
// ---------------------------------------------------------------------------

/** Matched case-insensitively as literal substrings against EVERY string the run emits. Presence of any one fails the run. */
export const E2E01_BANNED_OUTPUT_STRINGS: readonly string[] = [
  'bezpieczny',
  'bez skutkow ubocznych',
  'bez skutków ubocznych',
  'cudowny lek',
  'approved replacement',
];

/** Safety may only be expressed through A3's graded vocabulary — never as an unqualified claim. */
export const E2E01_GRADED_SAFETY_LABELS: readonly string[] = [
  'SAFE_RELATIVE_TO_X', 'LOWER_OBSERVED_RISK', 'NO_SIGNAL_DETECTED', 'INSUFFICIENT_SAFETY_EVIDENCE', 'CONFLICTING_EVIDENCE',
];

/** A required source that cannot be reached is DECLARED, never filled in from the model's own prior. */
export const E2E01_NO_ACCESS_LABEL = 'NO_ACCESS_DECLARED';

export const E2E01_POLICY_NEVER_ALTERS_TRUTH =
  'The Action layer may withhold, gate, or decline to surface a finding. It may never rewrite a field already written into the AnswerRecord. An Action-layer preference that contradicts the AnswerRecord is rejected by assertion, and the AnswerRecord is returned unchanged.';

// ---------------------------------------------------------------------------
// Required output shape
// ---------------------------------------------------------------------------

/** The 18 fields every government output must carry. `researchRecipe` is deliberately NOT in this list: it is present only for outcome WINNER. */
export const E2E01_REQUIRED_OUTPUT_FIELDS: readonly string[] = [
  'problem',
  'candidateSpace',
  'method',
  'evidence',
  'top3',
  'whyEachSurvived',
  'whyOthersFailed',
  'winner',
  'whyWinnerSurvivedFalsification',
  'counterevidence',
  'safetyProfile',
  'uncertainty',
  'whatWouldChangeVerdict',
  'nextExperiment',
  'governmentRecommendation',
  'fullProvenance',
  'replayFingerprint',
  'status',
];

/** Anti-HARK lineage: the exact sealed fingerprints this scenario stands on. A reader can verify no upstream rule was edited to make this run pass. */
export const E2E01_PRIOR_RUN_FINGERPRINTS = {
  a1Glp1: A1_PREREGISTRATION.fingerprint,
  a2OzempicSubstitute: A2_PREREGISTRATION.fingerprint,
  a3Government: A3_PREREGISTRATION.fingerprint,
} as const;

export interface E2E01Preregistration {
  readonly scenarioId: string;
  readonly contractVersion: string;
  readonly problem: string;
  readonly population: typeof E2E01_POPULATION;
  readonly generationMethod: E2E01GenerationMethod;
  readonly tierCriteria: E2E01TierCriteria;
  readonly falsificationAttacks: readonly E2E01FalsificationAttack[];
  readonly allowedOutcomes: readonly E2E01Outcome[];
  readonly winnerRules: string;
  readonly recipeRules: string;
  readonly bannedOutputStrings: readonly string[];
  readonly gradedSafetyLabels: readonly string[];
  readonly noAccessLabel: string;
  readonly policyNeverAltersTruth: string;
  readonly requiredOutputFields: readonly string[];
  readonly priorRunFingerprints: typeof E2E01_PRIOR_RUN_FINGERPRINTS;
  readonly existentialSafetyVetoFrom: string;
  readonly fingerprint: string;
}

function frozenView() {
  return {
    scenarioId: E2E01_SCENARIO_ID,
    contractVersion: E2E01_CONTRACT_VERSION,
    problem: E2E01_PROBLEM,
    population: E2E01_POPULATION,
    generationMethod: E2E01_GENERATION_METHOD,
    tierCriteria: E2E01_TIER_CRITERIA,
    falsificationAttacks: E2E01_FALSIFICATION_ATTACKS,
    allowedOutcomes: E2E01_ALLOWED_OUTCOMES,
    winnerRules: E2E01_WINNER_RULES,
    recipeRules: E2E01_RECIPE_RULES,
    bannedOutputStrings: E2E01_BANNED_OUTPUT_STRINGS,
    gradedSafetyLabels: E2E01_GRADED_SAFETY_LABELS,
    noAccessLabel: E2E01_NO_ACCESS_LABEL,
    policyNeverAltersTruth: E2E01_POLICY_NEVER_ALTERS_TRUTH,
    requiredOutputFields: E2E01_REQUIRED_OUTPUT_FIELDS,
    priorRunFingerprints: E2E01_PRIOR_RUN_FINGERPRINTS,
    existentialSafetyVetoFrom: 'A2_PREREGISTRATION.existentialSafetyVeto',
  };
}

/** Computed ONCE, over exactly the fields above — asserted as a literal BEFORE scripts/fetch-gov-drug-discovery-generated-space.mjs pulls the generated candidate space. */
export const E2E01_PREREGISTRATION_FINGERPRINT = fnv1a(canonicalJson(frozenView()));

export const E2E01_PREREGISTRATION: E2E01Preregistration = {
  ...frozenView(),
  fingerprint: E2E01_PREREGISTRATION_FINGERPRINT,
};
