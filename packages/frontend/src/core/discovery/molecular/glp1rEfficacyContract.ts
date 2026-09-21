/**
 * D-076/077 — the GLP-1R predicted-activity contract, types only.
 *
 * This mirrors the shape `packages/backend/src/campaign/glp1rEfficacyAdapter.mjs`
 * produces, so a frontend reader gets the fields WITH their epistemic
 * qualifiers attached rather than a bare number. There is no computation here
 * and no second model: the QSAR runs backend-side against the pinned,
 * hash-verified human activity table.
 *
 * NO NEW TAXONOMY. `evidenceClass` is the literal `'MODEL_ESTIMATE'` and is
 * deliberately NOT imported from `core/agent/evidenceProvenance.ts`'s
 * `EvidenceClass` union — MODEL_ESTIMATE is not a member of that union
 * (DIRECT_RANDOMISED | INDIRECT_RANDOMISED | POOLED_META | NETWORK_META |
 * OBSERVATIONAL | REGULATORY_LABEL | POST_MARKETING | MECHANISTIC |
 * COMPUTATIONAL | UNVERIFIED), and that is the point: fed through
 * `core/orchestrator/winnerGate.ts::asEvidenceClass` it degrades to
 * `UNVERIFIED` (rank 1), nowhere near the INDIRECT_RANDOMISED (rank 9) the
 * D-057 Winner Gate requires. A QSAR estimate cannot promote a WinnerRecord,
 * by the type system as well as by the rule.
 */

export const GLP1R_EFFICACY_CONTRACT_VERSION = '1.0.0';

export type Glp1rEfficacyStatus = 'AVAILABLE' | 'BLOCKED';

/**
 * A GLP-1R activity PREDICTION. Never a measurement: `value` is a model
 * output on a pActivity scale, and when it is present `uncertainty` (a
 * split-conformal interval half-width) is present with it — a point estimate
 * without an interval is not a valid AVAILABLE state of this contract.
 */
export interface GLP1REfficacyPrediction {
  readonly status: Glp1rEfficacyStatus;
  readonly axis: 'GLP1R_PREDICTED_ACTIVITY';
  readonly target: 'GLP1R';
  readonly value: number | null;
  readonly unit: 'pActivity';
  /** Split-conformal half-width. Non-null whenever `status === 'AVAILABLE'`. */
  readonly uncertainty: number | null;
  /** True when the candidate is outside the training set's structural domain (nearest-train Tanimoto below the model's threshold) — a real caveat on the value, not a rejection of it. */
  readonly outOfDomain: boolean | null;
  /** Algorithm/contract identity, e.g. `glp1r-qsar-ridge-ecfp4-512bit-v1`. Distinct from `modelFingerprint`. */
  readonly modelVersion: string | null;
  /** sha256 of the pinned training bytes this model was fitted on. */
  readonly trainingDataHash: string | null;
  /** Deterministic hash over algorithm + hyperparameters + frozen gate + split policy + training data + engine version. */
  readonly modelFingerprint: string | null;
  readonly inputFingerprint: string;
  readonly outputHash: string | null;
  readonly provenance: string;
  readonly evidenceClass: 'MODEL_ESTIMATE';
  readonly honestyNote: string;
  readonly blockedReason?: string;
}

/** What this axis contributes to a comparable-axis set, with its qualifiers attached. */
export interface Glp1rAxisContribution {
  readonly axis: 'GLP1R_PREDICTED_ACTIVITY';
  readonly status: Glp1rEfficacyStatus;
  readonly evidenceClass: 'MODEL_ESTIMATE';
  /** Always false: closing the absence of a prediction axis is not entitlement to adjudicate on it. */
  readonly decisive: false;
  /** True only when a gate-clearing model actually produced a value. */
  readonly closesEfficacyAxis: boolean;
  readonly isMeasurement: false;
  readonly honestyNote: string;
  readonly blockedReason: string | null;
}

export const GLP1R_EFFICACY_HONESTY =
  'QSAR model estimate with a split-conformal interval. NOT a measurement, NOT clinical efficacy. It may close the technical absence of a prediction axis once the model clears the frozen D-077 validation gate, but D-057 still adjudicates promotion on evidence class — and MODEL_ESTIMATE cannot promote a WinnerRecord.';

/**
 * The one sanctioned way to describe a value from this axis in UI copy.
 * Always states the negative case, so a caller cannot render the number
 * without the qualifier that makes it honest.
 */
export function glp1rEfficacyStatement(prediction: GLP1REfficacyPrediction): string {
  if (prediction.status !== 'AVAILABLE' || prediction.value === null) {
    return `GLP-1R predicted activity unavailable (${prediction.blockedReason ?? 'BLOCKED'}). This is not a negative result about any molecule — it is the absence of a validated model.`;
  }
  const interval = prediction.uncertainty === null
    ? ''
    : ` ±${prediction.uncertainty.toFixed(2)} (90% conformal interval)`;
  const domain = prediction.outOfDomain
    ? ' The candidate lies OUTSIDE the training set’s structural domain, so this estimate is an extrapolation.'
    : '';
  return `Predicted GLP-1R activity ${prediction.value.toFixed(2)} pActivity${interval} — a QSAR MODEL ESTIMATE, not a measured potency.${domain}`;
}
