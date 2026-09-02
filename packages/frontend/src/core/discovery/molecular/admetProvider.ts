import { admetApplicability, type AdmetPredictResult, type AdmetTransport } from './admetTransport';
import { unavailableProperty, type MoleculeCandidate, type MoleculeProperty } from './types';

/**
 * ADMET PROVIDER — turns real ADMET-AI output into discovery properties.
 *
 * Every value here is `MODEL_PREDICTION`. That status is not decoration: it is
 * what stops the rest of the engine treating a model output as a measurement.
 * `VALUED_STATUSES` includes MODEL_PREDICTION, so these values CAN be screened
 * and ranked — which is the point of connecting the engine — but the dossier
 * grades them PREDICTION, never COMPUTATION and never EXPERIMENTALLY_VALIDATED.
 *
 * `safety` is deliberately NOT produced here. ADMET-AI predicts specific
 * toxicity endpoints; none of them, alone or together, establishes that a
 * compound is safe. `safety` stays REQUIRES_EXPERIMENT no matter how many
 * endpoints come back.
 */
export const ADMET_PROVIDER_VERSION = '1.0.0';

/** discovery property id → the ADMET-AI endpoint that genuinely produces it. */
export const ADMET_PROPERTY_MAP: Readonly<Record<string, { endpoint: string; unit: string; meaning: string }>> = {
  admetAbsorption: { endpoint: 'HIA_Hou', unit: 'probability', meaning: 'Predicted probability of high human intestinal absorption.' },
  bioavailability: { endpoint: 'Bioavailability_Ma', unit: 'probability', meaning: 'Predicted probability of oral bioavailability above the benchmark threshold.' },
  bloodBrainBarrier: { endpoint: 'BBB_Martins', unit: 'probability', meaning: 'Predicted probability of blood-brain barrier penetration.' },
  mutagenicity: { endpoint: 'AMES', unit: 'probability', meaning: 'Predicted probability of an Ames-positive (mutagenic) outcome.' },
  clinicalToxicity: { endpoint: 'ClinTox', unit: 'probability', meaning: 'Predicted probability of clinical-trial toxicity failure.' },
  liverInjury: { endpoint: 'DILI', unit: 'probability', meaning: 'Predicted probability of drug-induced liver injury.' },
  pgpSubstrate: { endpoint: 'Pgp_Broccatelli', unit: 'probability', meaning: 'Predicted probability of being a P-glycoprotein substrate.' },
  cyp3a4Inhibition: { endpoint: 'CYP3A4_Veith', unit: 'probability', meaning: 'Predicted probability of CYP3A4 inhibition.' },
  cyp2d6Inhibition: { endpoint: 'CYP2D6_Veith', unit: 'probability', meaning: 'Predicted probability of CYP2D6 inhibition.' },
};

/** `toxicity` is an aggregate view, and is stated as exactly that. */
export const ADMET_TOXICITY_ENDPOINT = 'AMES';

export const ADMET_PROPERTY_IDS = Object.keys(ADMET_PROPERTY_MAP);

export interface AdmetBatchResult {
  engineId: string;
  available: boolean;
  reason: string;
  result: AdmetPredictResult | null;
  /** Candidates the model was not run on, with why. Never silently skipped. */
  outOfDomain: readonly { candidateId: string; reason: string }[];
  calledWith: readonly string[];
}

function numericProperty(candidate: MoleculeCandidate, propertyId: string): number | null {
  const property = candidate.properties.find((p) => p.propertyId === propertyId);
  return property !== undefined && typeof property.value === 'number' ? property.value : null;
}

/**
 * Runs ADMET-AI over the candidates it is actually applicable to.
 *
 * Applicability is checked BEFORE the call, so an out-of-domain molecule never
 * produces a number that would then have to be explained away.
 */
export function runAdmetBatch(
  transport: AdmetTransport,
  candidates: readonly MoleculeCandidate[],
  options: { maxCandidates?: number } = {},
): AdmetBatchResult {
  const maxCandidates = options.maxCandidates ?? 50;
  const detected = transport.detect();
  const engineId = detected.available ? detected.engine : `admet-ai:unavailable:${transport.transportId}`;

  if (!detected.available) {
    return { engineId, available: false, reason: detected.reason, result: null, outOfDomain: [], calledWith: [] };
  }

  const outOfDomain: { candidateId: string; reason: string }[] = [];
  const runnable: string[] = [];

  for (const candidate of candidates) {
    const smiles = candidate.structure.canonicalSmiles;
    if (smiles === null || smiles.length === 0) {
      outOfDomain.push({ candidateId: candidate.candidateId, reason: 'No resolved structure; ADMET prediction needs a structure, not a formula.' });
      continue;
    }
    const applicability = admetApplicability(
      numericProperty(candidate, 'heavyAtomCount'),
      numericProperty(candidate, 'molecularWeight'),
    );
    if (!applicability.inDomain) {
      outOfDomain.push({ candidateId: candidate.candidateId, reason: applicability.reason });
      continue;
    }
    if (runnable.length >= maxCandidates) {
      outOfDomain.push({ candidateId: candidate.candidateId, reason: `Exceeded the ADMET call budget of ${maxCandidates} candidates for this run.` });
      continue;
    }
    runnable.push(smiles);
  }

  if (runnable.length === 0) {
    return { engineId, available: true, reason: '', result: null, outOfDomain, calledWith: [] };
  }

  // Deterministic call order so a run is reproducible.
  const calledWith = [...new Set(runnable)].sort();
  return { engineId, available: true, reason: '', result: transport.predict(calledWith), outOfDomain, calledWith };
}

/**
 * ADMET properties for ONE candidate, from a batch result.
 *
 * Absence is expressed with the status that says WHY: no engine in the runtime
 * is REQUIRES_EXTERNAL_ENGINE, while an engine that ran and produced nothing
 * for this molecule is NOT_AVAILABLE.
 */
export function admetPropertiesFor(candidate: MoleculeCandidate, batch: AdmetBatchResult): MoleculeProperty[] {
  const blocked = (status: 'REQUIRES_EXTERNAL_ENGINE' | 'NOT_AVAILABLE') =>
    ADMET_PROPERTY_IDS.map((id) => unavailableProperty(id, status, ADMET_PROPERTY_MAP[id]!.unit));

  if (!batch.available) return blocked('REQUIRES_EXTERNAL_ENGINE');
  if (batch.result === null || !batch.result.ok) return blocked('NOT_AVAILABLE');

  const smiles = candidate.structure.canonicalSmiles;
  const prediction = smiles === null ? undefined : batch.result.bySmiles[smiles];
  if (prediction === undefined) return blocked('NOT_AVAILABLE');

  return ADMET_PROPERTY_IDS.map((propertyId) => {
    const mapping = ADMET_PROPERTY_MAP[propertyId]!;
    const value = prediction.values[mapping.endpoint];
    return value === undefined || !Number.isFinite(value)
      ? unavailableProperty(propertyId, 'NOT_AVAILABLE', mapping.unit)
      : {
        propertyId,
        // NEVER COMPUTED. A model output is a prediction.
        status: 'MODEL_PREDICTION' as const,
        value,
        unit: mapping.unit,
        engine: prediction.engine,
      };
  });
}

/**
 * Attaches ADMET predictions to candidates, replacing the placeholder
 * `admetAbsorption`/`toxicity` entries the enumerator emitted.
 *
 * `safety` is preserved untouched as REQUIRES_EXPERIMENT: connecting a
 * toxicity model does not make a compound's safety computable.
 */
export function withAdmetProperties(
  candidates: readonly MoleculeCandidate[],
  batch: AdmetBatchResult,
): readonly MoleculeCandidate[] {
  const replaced = new Set(ADMET_PROPERTY_IDS);
  return candidates.map((candidate) => ({
    ...candidate,
    properties: [
      ...candidate.properties.filter((p) => !replaced.has(p.propertyId)),
      ...admetPropertiesFor(candidate, batch),
    ],
  }));
}

/** Human-readable statement of what this engine did and did not establish. */
export function admetLimitations(batch: AdmetBatchResult): readonly string[] {
  if (!batch.available) {
    return [`ADMET prediction did not run: ${batch.reason}. No absorption, toxicity or liver-injury value exists for any candidate.`];
  }
  const notes = [
    'All ADMET values are MODEL_PREDICTIONS from ADMET-AI, not measurements. A low predicted probability is not evidence that an effect is absent.',
    'No ADMET endpoint, alone or combined, establishes that a compound is safe. Safety remains REQUIRES_EXPERIMENT.',
  ];
  if (batch.outOfDomain.length > 0) {
    notes.push(`${batch.outOfDomain.length} candidate(s) were not predicted because they fell outside the model's applicability domain or the call budget; they carry no ADMET value rather than an unreliable one.`);
  }
  return notes;
}
