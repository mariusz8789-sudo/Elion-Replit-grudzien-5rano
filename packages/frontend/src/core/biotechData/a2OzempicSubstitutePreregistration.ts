import { canonicalJson, fnv1a } from '../events/hash';

/**
 * A2 — AUTONOMOUS OZEMPIC-SUBSTITUTE DISCOVERY, SEALED BEFORE ANY CANDIDATE
 * DATA WAS PULLED.
 *
 * Unlike A1 (a fixed semaglutide-vs-liraglutide comparison), this task asks
 * Genesis to build its OWN candidate space from mechanism: every molecule
 * with real, qualifying binding/functional data at the three incretin-axis
 * targets a GLP-1-based therapy can act through (GLP-1R, GIPR, GCGR — so a
 * dual or triple agonist enters on its own mechanistic merits, not because
 * a human named it). The target ids below (`CHEMBL1784`/`CHEMBL4383`/
 * `CHEMBL1985`) and the ten named dual/triple/mono agonists' ChEMBL ids were
 * confirmed real via `scripts/recon-a2-ozempic-substitute.mjs` (CI-only,
 * sandbox egress to ChEMBL/ClinicalTrials.gov confirmed blocked — same
 * finding as A1) — recon only established WHICH APIs and fields exist, not
 * any analysis result; every threshold below is a value chosen and frozen
 * here, before `scripts/fetch-a2-ozempic-substitute-fixture.mjs` pulls a
 * single candidate's activity or trial data.
 *
 * WHY NO POSITIVE RESULT IS ASSUMED. The candidate-generation and inclusion
 * rules below are mechanistic and evidentiary (does a molecule act at these
 * targets; has it reached real human trials), never "is it similar to a
 * drug we already like". Nothing here privileges tirzepatide, semaglutide's
 * own class, or any other named compound — the SAME rule is applied to
 * whatever the mechanism query returns. `A2_ALLOWED_VERDICTS` includes four
 * ways this can end without naming a winner, and the ranking function's own
 * existential safety veto (§A2 THRESHOLDS below) can override a high
 * efficacy score — a candidate does not win by efficacy evidence alone.
 */

export const A2_PREREGISTRATION_CONTRACT_VERSION = '1.0.0';

export const A2_REFERENCE_DRUG = {
  name: 'semaglutide',
  moleculeChemblId: 'CHEMBL2108724',
  /** Real subcutaneous T2DM head-to-head evidence already established and pinned for A1 (SUSTAIN 10 — Capehorn et al. 2020 — NCT03191396; the "SUSTAIN 7" label used here in earlier revisions was a documentation error, fixed D-111: the trial's own pinned briefTitle is "Research Study Comparing a New Medicine Semaglutide to Liraglutide in People With Type 2 Diabetes", i.e. SUSTAIN 10, not SUSTAIN 7 — no data, number or rule changed) — reused, not re-derived, as the reference arm wherever a candidate's own trial does not include semaglutide directly. */
  referenceTrialNctId: 'NCT03191396',
} as const;

/** Confirmed real via recon; re-resolved LIVE at fetch time regardless (never hardcoded into the fetch path itself), exactly like A1's target/compound resolution. */
export const A2_MECHANISM_TARGETS = {
  glp1r: { chemblId: 'CHEMBL1784', label: 'GLP-1 receptor' },
  gipr: { chemblId: 'CHEMBL4383', label: 'Gastric inhibitory polypeptide receptor' },
  gcgr: { chemblId: 'CHEMBL1985', label: 'Glucagon receptor' },
} as const;

/** §6 — the assay-level inclusion rule, identical in spirit to A1's (verbatim reuse of the same four criteria), applied at all three targets. */
export interface A2AssayInclusion {
  readonly organism: 'Homo sapiens';
  readonly standardTypes: readonly ('IC50' | 'EC50' | 'Ki' | 'Kd')[];
  readonly standardUnits: 'nM';
  readonly standardRelation: '=';
  readonly excludeConfoundedOrInvalidated: true;
  readonly excludeFlaggedDuplicates: true;
}

export interface A2CandidateInclusion {
  readonly assay: A2AssayInclusion;
  /**
   * A molecule needs SOME real human clinical development to have any trial
   * evidence to compare at all — this is a feasibility gate on ANSWERABILITY,
   * not a popularity filter: a molecule stuck at max_phase 0-1 has no posted
   * efficacy/safety trial data this pipeline could read regardless of how
   * promising its binding data looks, so scoring it would be a guess dressed
   * as a comparison. ChEMBL's own `max_phase` field, not a human's list.
   */
  readonly minMaxPhase: number;
  readonly excludeMoleculeIds: readonly string[];
  readonly trialEvidence: {
    readonly population: readonly ('Type 2 Diabetes' | 'Obesity')[];
    readonly requirePostedResults: true;
    readonly requireArmLevelHbA1cOrWeightOutcome: true;
    readonly minArmSizeForComparison: number;
  };
}

/** §6/§7 — what "comparable" and "different" mean, fixed before any candidate's numbers are read. */
export interface A2EffectSizeThresholds {
  /** Percentage points — the SAME regulatory non-inferiority convention A1 used, not re-derived from A2's own data. */
  readonly efficacyComparableMarginPp: number;
  /** A candidate's risk ratio for a safety category must clear this AND have its 95% CI exclude 1 to count as a real signal either direction. */
  readonly safetyRiskRatioMeaningfulDeviation: number;
}

export interface A2SafetyCategory {
  readonly key: string;
  readonly label: string;
  /** Regex SOURCE (case-insensitive) matched against an adverseEventsModule event's `term`. Stored as a string so it is part of the frozen, fingerprinted record, not embedded logic a reader has to trust separately. */
  readonly termPattern: string;
}

/** §7 — every category this task named explicitly, plus renal events and serious/discontinuation handled structurally (not by term match — see a2OzempicSubstitute.ts). */
export const A2_SAFETY_CATEGORIES: readonly A2SafetyCategory[] = [
  { key: 'nausea', label: 'Nausea', termPattern: '\\bnausea\\b' },
  { key: 'vomiting', label: 'Vomiting', termPattern: '\\bvomit' },
  { key: 'diarrhea', label: 'Diarrhea', termPattern: '\\bdiarrh' },
  { key: 'pancreatitis', label: 'Pancreatitis', termPattern: '\\bpancreatitis\\b' },
  { key: 'gallbladder', label: 'Gallbladder / biliary events', termPattern: 'gallbladder|cholelithiasis|cholecystitis|biliary' },
  { key: 'hypoglycemia', label: 'Hypoglycemia', termPattern: 'hypoglyc' },
  { key: 'renal', label: 'Renal events', termPattern: 'renal|kidney' },
] as const;

export interface A2MultipleComparisonPolicy {
  readonly method: 'Bonferroni';
  /** Number of safety categories tested per candidate — the Bonferroni family size, fixed by A2_SAFETY_CATEGORIES.length, not chosen after seeing results. */
  readonly familySize: number;
  readonly nominalAlpha: number;
  readonly correctedAlpha: number;
}

export interface A2RankingWeights {
  readonly efficacy: number;
  readonly safety: number;
  readonly evidenceStrength: number;
  readonly uncertaintyPenalty: number;
  readonly conflictPenalty: number;
}

export type A2FinalVerdictLabel =
  | 'BEST_SUPPORTED_CANDIDATE'
  | 'PROMISING_BUT_UNCERTAIN'
  | 'NO_SUPERIOR_CANDIDATE'
  | 'NO_SAFE_SUPERIOR_CANDIDATE'
  | 'CONFLICTING_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE';

/** Every value this task's §14 explicitly permits as an ending — fixed before any candidate is scored, so a run cannot silently narrow its own exits. */
export const A2_ALLOWED_VERDICTS: readonly A2FinalVerdictLabel[] = [
  'BEST_SUPPORTED_CANDIDATE',
  'PROMISING_BUT_UNCERTAIN',
  'NO_SUPERIOR_CANDIDATE',
  'NO_SAFE_SUPERIOR_CANDIDATE',
  'CONFLICTING_EVIDENCE',
  'INSUFFICIENT_EVIDENCE',
] as const;

export interface A2Preregistration {
  readonly contractVersion: string;
  readonly researchQuestion: string;
  readonly referenceDrug: typeof A2_REFERENCE_DRUG;
  readonly mechanismTargets: typeof A2_MECHANISM_TARGETS;
  readonly candidateInclusion: A2CandidateInclusion;
  readonly effectSizeThresholds: A2EffectSizeThresholds;
  readonly safetyCategories: readonly A2SafetyCategory[];
  readonly multipleComparisonPolicy: A2MultipleComparisonPolicy;
  readonly rankingWeights: A2RankingWeights;
  /**
   * The existential safety veto, stated in words here (the actual check
   * lives in code, but the RULE is fixed here): a candidate whose serious-
   * adverse-event risk ratio vs semaglutide clears
   * `safetyRiskRatioMeaningfulDeviation` in the WORSE direction, with its CI
   * excluding 1, can never reach BEST_SUPPORTED_CANDIDATE regardless of its
   * weighted ranking score or efficacy advantage.
   */
  readonly existentialSafetyVeto: string;
  readonly allowedVerdicts: readonly A2FinalVerdictLabel[];
  readonly fingerprint: string;
}

const RESEARCH_QUESTION =
  'Which available or experimental candidate currently has the best efficacy/safety profile as a potential substitute for semaglutide, with the lowest plausible burden of clinically relevant adverse events — where "no candidate clears this bar" is an accepted, and separately reportable, answer?';

const ASSAY_INCLUSION: A2AssayInclusion = {
  organism: 'Homo sapiens',
  standardTypes: ['IC50', 'EC50', 'Ki', 'Kd'],
  standardUnits: 'nM',
  standardRelation: '=',
  excludeConfoundedOrInvalidated: true,
  excludeFlaggedDuplicates: true,
};

const CANDIDATE_INCLUSION: A2CandidateInclusion = {
  assay: ASSAY_INCLUSION,
  minMaxPhase: 2,
  excludeMoleculeIds: [A2_REFERENCE_DRUG.moleculeChemblId],
  trialEvidence: {
    population: ['Type 2 Diabetes', 'Obesity'],
    requirePostedResults: true,
    requireArmLevelHbA1cOrWeightOutcome: true,
    minArmSizeForComparison: 30,
  },
};

const EFFECT_SIZE_THRESHOLDS: A2EffectSizeThresholds = {
  efficacyComparableMarginPp: 0.4,
  safetyRiskRatioMeaningfulDeviation: 1.0,
};

const MULTIPLE_COMPARISON_POLICY: A2MultipleComparisonPolicy = {
  method: 'Bonferroni',
  familySize: A2_SAFETY_CATEGORIES.length,
  nominalAlpha: 0.05,
  correctedAlpha: 0.05 / A2_SAFETY_CATEGORIES.length,
};

const RANKING_WEIGHTS: A2RankingWeights = {
  efficacy: 1,
  safety: 1,
  evidenceStrength: 0.5,
  uncertaintyPenalty: -0.5,
  conflictPenalty: -1,
};

const EXISTENTIAL_SAFETY_VETO =
  'A candidate with >=1 safety category (including structural serious-adverse-event rate) whose 95% CI risk ratio vs semaglutide is entirely above 1.0 in the WORSE direction is capped at PROMISING_BUT_UNCERTAIN at best, never BEST_SUPPORTED_CANDIDATE, regardless of efficacy advantage or aggregate ranking score.';

function frozenView() {
  return {
    contractVersion: A2_PREREGISTRATION_CONTRACT_VERSION,
    researchQuestion: RESEARCH_QUESTION,
    referenceDrug: A2_REFERENCE_DRUG,
    mechanismTargets: A2_MECHANISM_TARGETS,
    candidateInclusion: CANDIDATE_INCLUSION,
    effectSizeThresholds: EFFECT_SIZE_THRESHOLDS,
    safetyCategories: A2_SAFETY_CATEGORIES,
    multipleComparisonPolicy: MULTIPLE_COMPARISON_POLICY,
    rankingWeights: RANKING_WEIGHTS,
    existentialSafetyVeto: EXISTENTIAL_SAFETY_VETO,
    allowedVerdicts: A2_ALLOWED_VERDICTS,
  };
}

/** Computed ONCE, over exactly the fields above — asserted as a literal by a2OzempicSubstitutePreregistration.test.ts BEFORE any real candidate data is fetched, mirroring a1Glp1Preregistration.ts. */
export const A2_PREREGISTRATION_FINGERPRINT = fnv1a(canonicalJson(frozenView()));

export const A2_PREREGISTRATION: A2Preregistration = {
  ...frozenView(),
  fingerprint: A2_PREREGISTRATION_FINGERPRINT,
};
