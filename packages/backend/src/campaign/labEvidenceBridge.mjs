/**
 * Bridge from a HUMAN-REVIEWED external laboratory observation into the
 * existing canonical EvidenceLedger proposal channel.
 *
 * The bridge produces NewEvidenceInput-compatible data only.
 * It does not publish evidence. Publication stays propose-only + human approval.
 */
export const LAB_EVIDENCE_BRIDGE_VERSION = '1.0.0';

const CLAIM_BOUNDARY =
  'This evidence record attests to the stated external laboratory observation only. It does not establish clinical efficacy, safety, therapeutic approval, or patient benefit.';

function clamp01(value, fallback = 0.5) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function buildLabObservationEvidenceInput({ observation, review } = {}) {
  if (!observation || !review) return { ok: false, error: 'observation_and_review_required' };
  if (review.verdict !== 'ACCEPTED_AS_OBSERVATION') {
    return { ok: false, error: 'observation_not_accepted' };
  }
  if (observation.quality?.status !== 'QC_PASSED') return { ok: false, error: 'qc_pass_required_for_evidence' };
  if (!/^[a-f0-9]{64}$/i.test(observation.rawArtifactSha256 ?? '')) {
    return { ok: false, error: 'raw_artifact_sha256_required' };
  }

  const source = observation.source ?? {};
  if (!source.labId || !source.externalObservationId || !source.sourceUri) {
    return { ok: false, error: 'observation_source_incomplete' };
  }

  const timestamp = isoOrNull(observation.observedAt);
  if (!timestamp) return { ok: false, error: 'invalid_observed_at' };

  const independentSourceId = `${source.labId}:${source.externalObservationId}`;
  const unit = observation.unit ? ` ${observation.unit}` : '';
  const claim = [
    `External laboratory observation for candidate ${observation.candidateId}:`,
    `${observation.endpointId} = ${String(observation.value)}${unit}.`,
    `Method reference: ${observation.methodReference}. Raw artifact SHA-256: ${observation.rawArtifactSha256}.`,
    CLAIM_BOUNDARY,
  ].join(' ');

  return {
    ok: true,
    input: {
      sourceUrl: source.sourceUri,
      sourceTimestamp: timestamp,
      claim,
      claimType: 'observation',
      confidence: clamp01(observation.quality?.confidence, 0.5),
      provenance: {
        // The current canonical EvidenceLedger source vocabulary has no
        // dedicated "laboratory" member. An external lab result arrives as a
        // structured dataset artifact, so use the existing dataset category
        // rather than extending global core types here.
        sourceKind: 'dataset',
        author: source.labId,
        retrievedBy: `genesis-lab-evidence-bridge/${LAB_EVIDENCE_BRIDGE_VERSION}`,
        independentSourceIds: [independentSourceId, `sha256:${observation.rawArtifactSha256.toLowerCase()}`],
      },
    },
    boundary: CLAIM_BOUNDARY,
  };
}
