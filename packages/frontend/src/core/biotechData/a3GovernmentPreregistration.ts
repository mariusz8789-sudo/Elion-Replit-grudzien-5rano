import { canonicalJson, fnv1a } from '../events/hash';

/**
 * A3 — GENESIS GOVERNMENT RESEARCH: AUTONOMOUS SEMAGLUTIDE-SUBSTITUTE
 * RECOMMENDATION, SEALED BEFORE ANY NEW DATA WAS PULLED.
 *
 * A3 is a GOVERNMENT DECISION layer sitting on top of A2's already-sealed,
 * already-pinned, already-verified candidate space and analysis
 * (`a2OzempicSubstitute.ts`, D-029/D-030) — it does not re-run candidate
 * discovery or re-derive efficacy/safety numbers. What it adds, and what
 * needs its own preregistration BEFORE being used, is everything the
 * government mandate asks for that A2 did not: (1) a REQUIRED population
 * input with a hard refusal when it is missing, (2) real per-trial
 * population tagging, (3) a GOVERNMENT_DECISION_SCORE across cost/
 * availability/supply/manufacturing/scalability dimensions kept SEPARATE
 * from the scientific ranking, and (4) a controlled safety-language
 * vocabulary that never asserts "safe" outright.
 *
 * WHY POPULATION IS A HARD GATE, NOT A DEFAULT. The mandate is explicit:
 * "Jeżeli populacja nie została podana: NIE ZGADUJ. Zwróć
 * REQUIRED_POLICY_INPUT." `runA3GovernmentRecommendation` (see
 * a3GovernmentDrugRecommendation.ts) therefore takes an OPTIONAL population
 * argument and short-circuits to REQUIRED_POLICY_INPUT before touching any
 * candidate data when it is absent — this is the literal, tested behaviour
 * for the government's own request in this session, which named no
 * population.
 *
 * WHY POPULATION MATCHING NEEDS ITS OWN FETCH. A2's pinned trial records
 * never retained ClinicalTrials.gov's own structured
 * `conditionsModule.conditions` field — only a free-text `briefTitle`.
 * Matching population from `briefTitle` substrings would be an INFERENCE
 * dressed as a FACT (see §2 of the mandate: FACT/OBSERVATION/MODEL/
 * INFERENCE/HYPOTHESIS/UNKNOWN must never be mixed). So
 * `scripts/fetch-a3-trial-conditions.mjs` pulls the real `conditions` array
 * for the exact 31 NCT ids already used by A2 (no new trial search) — this
 * is what `A3_TRIAL_CONDITIONS_SOURCE` below documents, sealed before that
 * fetch's output is read anywhere in the analysis code.
 *
 * WHY COST/AVAILABILITY/SUPPLY/MANUFACTURING ARE SEALED AS
 * INSUFFICIENT_EVIDENCE, NOT FABRICATED OR SILENTLY DROPPED. No real,
 * cheaply reachable, per-candidate public source for ex-factory pricing,
 * national procurement volume, or manufacturing capacity was found or
 * integrated in this session. The mandate explicitly allows this
 * ("uwzględnij koszty/dostępność/produkcję, JEŻELI DANE SĄ DOSTĘPNE") and
 * separately forbids fabrication ("ZERO FABRICATED DATA"). The honest
 * choice sealed here is to keep these dimensions as NAMED, VISIBLE fields
 * in `A3_GOVERNMENT_WEIGHTS` with a zero contribution and an explicit
 * INSUFFICIENT_EVIDENCE status — never hidden, never invented.
 */

export const A3_PREREGISTRATION_CONTRACT_VERSION = '1.0.0';

export const A3_GOVERNMENT_QUESTION =
  'Jaka interwencja farmakologiczna jest obecnie najlepszą evidence-supported alternatywą dla semaglutydu dla populacji określonej przez rząd, biorąc pod uwagę skuteczność, bezpieczeństwo, dostępność, koszty i jakość dowodów?';

/** §1 — the only population shapes this run can answer without guessing. RISK_GROUP takes free-text condition keywords, matched literally against the real per-trial `conditions` field (never a synonym expansion). */
export type A3PopulationSpec =
  | { readonly kind: 'T2D' }
  | { readonly kind: 'OBESITY' }
  | { readonly kind: 'T2D_AND_OBESITY' }
  | { readonly kind: 'RISK_GROUP'; readonly conditionKeywords: readonly string[] };

export const A3_POPULATION_CONDITION_PATTERNS: Record<'T2D' | 'OBESITY', string> = {
  T2D: 'type\\s*2\\s*diabetes',
  OBESITY: 'obesity',
};

/** Where real per-trial population tags come from — sealed before the fetch script's output is read. Reuses the exact 31 NCT ids A2 already analyzed; no new trial discovery. */
export const A3_TRIAL_CONDITIONS_SOURCE = {
  api: 'ClinicalTrials.gov API v2',
  endpoint: '/studies/{nctId}?fields=NCTId,Condition',
  field: 'protocolSection.conditionsModule.conditions',
  nctIdCount: 31,
  reusesA2NctIdSet: true,
} as const;

/** §9 — the government decision score. `efficacy`/`safety`/`evidenceStrength`/`uncertaintyPenalty`/`conflictPenalty` mirror A2_PREREGISTRATION.rankingWeights exactly (same evidence, same scientific weights) — the NEW dimensions below are sealed at weight>0 (so a real source, if integrated later, would count) but their status starts INSUFFICIENT_EVIDENCE, which the scoring function must treat as a zero contribution, never as a default-favorable or default-neutral guess. */
export interface A3GovernmentDecisionWeights {
  readonly efficacy: number;
  readonly safety: number;
  readonly evidenceStrength: number;
  readonly uncertaintyPenalty: number;
  readonly conflictPenalty: number;
  readonly cost: number;
  readonly availability: number;
  readonly scalability: number;
  readonly supplySecurity: number;
  readonly manufacturingFeasibility: number;
  readonly populationCoverage: number;
}

export const A3_GOVERNMENT_WEIGHTS: A3GovernmentDecisionWeights = {
  efficacy: 1,
  safety: 1,
  evidenceStrength: 0.5,
  uncertaintyPenalty: -0.5,
  conflictPenalty: -1,
  cost: 0.5,
  availability: 0.5,
  scalability: 0.3,
  supplySecurity: 0.3,
  manufacturingFeasibility: 0.3,
  populationCoverage: 0.5,
};

/** §9 — dimensions with no integrated real source in this session. Scored INSUFFICIENT_EVIDENCE (contributes 0), disclosed by name in every report, never silently dropped from the weight vector above. */
export const A3_POLICY_DIMENSIONS_WITHOUT_SOURCE: readonly (keyof A3GovernmentDecisionWeights)[] = [
  'cost', 'availability', 'scalability', 'supplySecurity', 'manufacturingFeasibility', 'populationCoverage',
];

/** §7 — the controlled safety-language vocabulary. `SAFE_RELATIVE_TO_X` still names the comparator explicitly at the call site; the raw word "safe" alone is never emitted by any A3 report string. */
export type A3SafetyLabel = 'SAFE_RELATIVE_TO_X' | 'LOWER_OBSERVED_RISK' | 'NO_SIGNAL_DETECTED' | 'INSUFFICIENT_SAFETY_EVIDENCE';

export const A3_SAFETY_LABELS: readonly A3SafetyLabel[] = ['SAFE_RELATIVE_TO_X', 'LOWER_OBSERVED_RISK', 'NO_SIGNAL_DETECTED', 'INSUFFICIENT_SAFETY_EVIDENCE'];

/** §1 — the hard gate this whole module exists to enforce. */
export type A3TopLevelStatus = 'REQUIRED_POLICY_INPUT' | 'ANSWERED';

/** §11 — the exact ending labels the final government recommendation may use, mirroring A2's own 6 (reused verbatim: this layer never invents a rosier or gloomier vocabulary than the science underneath it). */
export type A3RecommendationLabel =
  | 'BEST_SUPPORTED_CANDIDATE'
  | 'PROMISING_BUT_UNCERTAIN'
  | 'NO_SUPERIOR_CANDIDATE'
  | 'NO_SAFE_SUPERIOR_CANDIDATE'
  | 'CONFLICTING_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE';

export const A3_ALLOWED_RECOMMENDATIONS: readonly A3RecommendationLabel[] = [
  'BEST_SUPPORTED_CANDIDATE',
  'PROMISING_BUT_UNCERTAIN',
  'NO_SUPERIOR_CANDIDATE',
  'NO_SAFE_SUPERIOR_CANDIDATE',
  'CONFLICTING_EVIDENCE',
  'INSUFFICIENT_EVIDENCE',
] as const;

export interface A3Preregistration {
  readonly contractVersion: string;
  readonly governmentQuestion: string;
  readonly populationConditionPatterns: typeof A3_POPULATION_CONDITION_PATTERNS;
  readonly trialConditionsSource: typeof A3_TRIAL_CONDITIONS_SOURCE;
  readonly governmentWeights: A3GovernmentDecisionWeights;
  readonly policyDimensionsWithoutSource: readonly (keyof A3GovernmentDecisionWeights)[];
  readonly safetyLabels: readonly A3SafetyLabel[];
  readonly allowedRecommendations: readonly A3RecommendationLabel[];
  readonly answerRecordVsActionRecord: string;
  readonly fingerprint: string;
}

const ANSWER_VS_ACTION =
  'AnswerRecord (the scientific finding: candidate space, evidence, ranking, verdict) is TRUTH and is never edited by policy. ActionRecord (recommended government action, reusing core/agent/practicalCandidateGate.ts GOVERNMENT_RESEARCH/GOVERNMENT_ACTION surfacing, unchanged from A1/A2) is POLICY: it may limit what is surfaced or require human approval, but it can never alter a field already written into AnswerRecord.';

function frozenView() {
  return {
    contractVersion: A3_PREREGISTRATION_CONTRACT_VERSION,
    governmentQuestion: A3_GOVERNMENT_QUESTION,
    populationConditionPatterns: A3_POPULATION_CONDITION_PATTERNS,
    trialConditionsSource: A3_TRIAL_CONDITIONS_SOURCE,
    governmentWeights: A3_GOVERNMENT_WEIGHTS,
    policyDimensionsWithoutSource: A3_POLICY_DIMENSIONS_WITHOUT_SOURCE,
    safetyLabels: A3_SAFETY_LABELS,
    allowedRecommendations: A3_ALLOWED_RECOMMENDATIONS,
    answerRecordVsActionRecord: ANSWER_VS_ACTION,
  };
}

/** Computed ONCE, over exactly the fields above — asserted as a literal by a3GovernmentPreregistration.test.ts BEFORE scripts/fetch-a3-trial-conditions.mjs's output is read anywhere. */
export const A3_PREREGISTRATION_FINGERPRINT = fnv1a(canonicalJson(frozenView()));

export const A3_PREREGISTRATION: A3Preregistration = {
  ...frozenView(),
  fingerprint: A3_PREREGISTRATION_FINGERPRINT,
};
