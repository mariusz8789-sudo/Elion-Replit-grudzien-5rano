/**
 * ADMET TRANSPORT — the seam to ADMET-AI, the repository's REAL predictive
 * ADMET/toxicity engine (`packages/backend/src/compute/admetAdapter.mjs` and
 * `admet_worker.py`, wrapping ADMET-AI / Chemprop, Swanson et al. 2024, trained
 * on the TDC ADMET benchmark).
 *
 * THE STATUS RULE THAT GOVERNS THIS WHOLE FILE: every value ADMET-AI produces
 * is a MODEL_PREDICTION. It is not a measurement, not an observation, and not
 * evidence that a compound behaves this way. Classification endpoints are
 * probabilities in [0,1] from a model with a finite applicability domain — a
 * prediction of 0.08 for AMES mutagenicity means the model assigns low
 * probability, not that the compound is non-mutagenic.
 *
 * Nothing in the discovery loop may promote an ADMET value to COMPUTED, and no
 * ADMET value may support a safety claim.
 */
export const ADMET_TRANSPORT_VERSION = '1.0.0';

/** Endpoints the discovery loop consumes. ADMET-AI returns many more. */
export const ADMET_ENDPOINT_IDS = [
  'AMES', 'BBB_Martins', 'Bioavailability_Ma', 'ClinTox', 'DILI', 'HIA_Hou',
  'Pgp_Broccatelli', 'PAMPA_NCATS', 'Caco2_Wang', 'hERG', 'LD50_Zhu',
  'CYP2D6_Veith', 'CYP3A4_Veith', 'CYP2C9_Veith',
] as const;

export type AdmetEndpointId = (typeof ADMET_ENDPOINT_IDS)[number];

export interface AdmetPrediction {
  /** Endpoint values the engine really returned, keyed by endpoint id. */
  values: Readonly<Record<string, number>>;
  engine: string;
}

export type AdmetDetect =
  | { available: true; engine: string; version: string }
  | { available: false; reason: string };

export type AdmetPredictResult =
  | { ok: true; bySmiles: Readonly<Record<string, AdmetPrediction>>; engine: string }
  | { ok: false; error: 'BLOCKED_BY_RUNTIME' | 'INVALID_INPUT' | 'EXECUTION_FAILED'; reason: string };

export interface AdmetTransport {
  transportId: string;
  detect(): AdmetDetect;
  /** Batch prediction. ADMET-AI accepts up to 200 SMILES per call. */
  predict(smilesList: readonly string[]): AdmetPredictResult;
}

/** Hard cap matching the backend adapter's own limit. */
export const ADMET_MAX_BATCH = 200;

const NO_TRANSPORT = 'no ADMET transport configured for this runtime';

export const unavailableAdmetTransport: AdmetTransport = {
  transportId: 'none',
  detect: () => ({ available: false, reason: NO_TRANSPORT }),
  predict: () => ({ ok: false, error: 'BLOCKED_BY_RUNTIME', reason: NO_TRANSPORT }),
};

/**
 * Narrows a worker payload into predictions. Only finite numbers survive;
 * anything else is dropped rather than coerced, so a partial engine reply
 * yields fewer real predictions and never a manufactured one.
 */
export function readAdmetPayload(payload: unknown, engine: string): Record<string, AdmetPrediction> {
  if (typeof payload !== 'object' || payload === null) return {};
  const out: Record<string, AdmetPrediction> = {};
  for (const [smiles, raw] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const values: Record<string, number> = {};
    for (const [endpoint, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) values[endpoint] = value;
    }
    if (Object.keys(values).length > 0) out[smiles] = { values, engine };
  }
  return out;
}

/**
 * APPLICABILITY DOMAIN.
 *
 * ADMET-AI is trained on drug-like small molecules. Outside that range it
 * still returns a number, and that number is not meaningful — so the loop
 * declines to run rather than record a value it would have to caveat into
 * uselessness. This mirrors the NOT_VALID_FOR_DOMAIN refusal in engineRouter.
 */
export interface ApplicabilityVerdict {
  inDomain: boolean;
  reason: string;
}

export function admetApplicability(heavyAtomCount: number | null, molecularWeight: number | null): ApplicabilityVerdict {
  if (heavyAtomCount === null && molecularWeight === null) {
    return { inDomain: false, reason: 'Neither heavy-atom count nor molecular weight is known, so applicability cannot be established.' };
  }
  if (heavyAtomCount !== null && (heavyAtomCount < 5 || heavyAtomCount > 70)) {
    return { inDomain: false, reason: `${heavyAtomCount} heavy atoms is outside the drug-like range these models were trained on.` };
  }
  if (molecularWeight !== null && (molecularWeight < 60 || molecularWeight > 1000)) {
    return { inDomain: false, reason: `Molecular weight ${molecularWeight.toFixed(1)} is outside the drug-like range these models were trained on.` };
  }
  return { inDomain: true, reason: '' };
}
