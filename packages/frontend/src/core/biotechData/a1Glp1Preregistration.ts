import { canonicalJson, fnv1a } from '../events/hash';

/**
 * A1 — GLP-1 SUBSTITUTION PREREGISTRATION, SEALED.
 *
 * Every value below is copied VERBATIM from `docs/A1_GLP1_EXECUTION_HANDOFF.md`
 * §5–§8 (the Research Director's contract), written before this module's
 * author had pulled a single ChEMBL activity or ClinicalTrials.gov study. That
 * order — seal, then download, then compute — is the whole point: a threshold
 * chosen after seeing the data is not a threshold, it is a description of the
 * data. `PREREGISTRATION_FINGERPRINT` is computed over exactly the fields
 * below and is asserted, byte-for-byte, by `a1Glp1Preregistration.test.ts`
 * BEFORE any commit that adds real fetched data — so a later edit to a
 * threshold cannot be mistaken for the sealed original.
 *
 * Nothing here is tuned to an observed result, because at the time this was
 * written no result had been observed. §16 of the handoff draws the line this
 * exists to enforce: within-threshold agreement is REPRODUCTION of known
 * pharmacology, not discovery — these numbers are the regulatory
 * non-inferiority convention the handoff cites, not a fit to any pulled data.
 */

export const A1_PREREGISTRATION_CONTRACT_VERSION = '1.0.0';

/** §3/§8 — the three competing claims, fixed before any data existed to favour one. */
export type A1HypothesisId = 'H1_SUBSTITUTION_SUPPORTED' | 'H2_NOT_SUPPORTED' | 'H0_NULL';

export interface A1PotencyWindow {
  readonly min: number;
  readonly max: number;
}

export interface A1EfficacyMargin {
  /** Percentage points. Source: regulatory non-inferiority convention — NOT derived from any pulled trial. */
  readonly maxAbsoluteDeltaHbA1cPp: number;
}

/** §6 — which ChEMBL assays and which ClinicalTrials.gov trials may even be considered. */
export interface A1InclusionCriteria {
  readonly assays: {
    readonly organism: 'Homo sapiens';
    readonly standardTypes: readonly ('IC50' | 'EC50' | 'Ki' | 'Kd')[];
    readonly standardUnits: 'nM';
    readonly excludeConfoundedOrInvalidated: true;
    readonly minIndependentAssaysPerDrug: number;
  };
  readonly trials: {
    readonly population: 'T2DM';
    readonly minDurationWeeks: number;
    readonly requirePostedResults: true;
    readonly requireArmLevelHbA1cWithSpreadAndN: true;
    readonly excludeTrialsUsedToSetPriorMargin: true;
    readonly preferBlindedOverOpenLabel: true;
  };
}

/** §8 — the decision rule itself, fixed before any data pull. Never tuned to the observed result. */
export interface A1DecisionThresholds {
  readonly potencyRatioWindow: A1PotencyWindow;
  readonly efficacyMargin: A1EfficacyMargin;
  readonly minAssaysPerDrugForVerdict: number;
  readonly minTrialsPerDrugForVerdict: number;
}

export interface A1Preregistration {
  readonly contractVersion: string;
  readonly researchQuestion: string;
  readonly hypotheses: Readonly<Record<A1HypothesisId, string>>;
  readonly inclusion: A1InclusionCriteria;
  readonly thresholds: A1DecisionThresholds;
  /** §13 — checks the pipeline against cases whose real-world answer is already known, so the margin test cannot be vacuous. */
  readonly negativeControls: readonly string[];
  readonly fingerprint: string;
}

const RESEARCH_QUESTION =
  'During semaglutide shortage, is liraglutide a pharmacologically defensible substitute at GLP-1R with comparable glycaemic efficacy at labelled doses?';

const HYPOTHESES: Readonly<Record<A1HypothesisId, string>> = {
  H1_SUBSTITUTION_SUPPORTED:
    'median GLP-1R potency ratio lira/sema in [0.1, 10] AND |deltaHbA1c| <= 0.4 percentage points with overlapping 95% CIs across >=2 qualifying trials per drug.',
  H2_NOT_SUPPORTED:
    'potency ratio outside [0.1,10] OR deltaHbA1c 95% CI entirely outside +/-0.4 pp.',
  H0_NULL:
    'no detectable difference beyond assay/trial noise.',
};

const INCLUSION: A1InclusionCriteria = {
  assays: {
    organism: 'Homo sapiens',
    standardTypes: ['IC50', 'EC50', 'Ki', 'Kd'],
    standardUnits: 'nM',
    excludeConfoundedOrInvalidated: true,
    minIndependentAssaysPerDrug: 3,
  },
  trials: {
    population: 'T2DM',
    minDurationWeeks: 24,
    requirePostedResults: true,
    requireArmLevelHbA1cWithSpreadAndN: true,
    excludeTrialsUsedToSetPriorMargin: true,
    preferBlindedOverOpenLabel: true,
  },
};

const THRESHOLDS: A1DecisionThresholds = {
  potencyRatioWindow: { min: 0.1, max: 10 },
  efficacyMargin: { maxAbsoluteDeltaHbA1cPp: 0.4 },
  minAssaysPerDrugForVerdict: 3,
  minTrialsPerDrugForVerdict: 2,
};

const NEGATIVE_CONTROLS: readonly string[] = [
  'Semaglutide vs metformin at GLP-1R -> expect no/low potency (pipeline must not false-positive a substitute).',
  'Semaglutide vs insulin glargine HbA1c -> expect large difference (margin test is not vacuous).',
];

/** Exactly the fields the handoff's §10 fingerprint covers — no timestamp, nothing added later. */
function frozenView() {
  return {
    contractVersion: A1_PREREGISTRATION_CONTRACT_VERSION,
    researchQuestion: RESEARCH_QUESTION,
    hypotheses: HYPOTHESES,
    inclusion: INCLUSION,
    thresholds: THRESHOLDS,
    negativeControls: NEGATIVE_CONTROLS,
  };
}

/**
 * Computed ONCE, at module load, over the frozen content above — the same
 * value every time this module is imported, in this process or the next.
 * `a1Glp1Preregistration.test.ts` asserts this exact literal, so an edit to
 * any threshold above is a visible, reviewed change, never a silent one.
 */
export const A1_PREREGISTRATION_FINGERPRINT = fnv1a(canonicalJson(frozenView()));

export const A1_PREREGISTRATION: A1Preregistration = {
  ...frozenView(),
  fingerprint: A1_PREREGISTRATION_FINGERPRINT,
};
