/**
 * Genesis Laboratory Closed Loop
 *
 * Thin integration layer over the CURRENT canonical Genesis campaign,
 * Scientific Run, research-gate, provenance and Evidence infrastructure.
 *
 * This module deliberately does NOT:
 * - create another campaign engine,
 * - create another EvidenceLedger,
 * - execute wet-lab procedures,
 * - promote model estimates into observations,
 * - promote a laboratory observation into clinical efficacy.
 *
 * It only closes the software gap:
 *
 * candidate -> validation request -> external lab observation -> human review
 * -> Evidence proposal link -> model/observation comparison -> next research action
 *
 * Persistence reuses campaign_events (append-only) and existing science_runs.
 */
import * as campaignStore from './persistence.mjs';
import { getScienceRun, listScienceRunsForCandidate } from '../store.mjs';
import { sha256Hex16 as sha16 } from '../provenance.mjs';
import { researchGateVerdict } from './scientificIntegration.mjs';
import { protocolInvariantHolds } from './preclinicalProtocol.mjs';
import { buildLabObservationEvidenceInput } from './labEvidenceBridge.mjs';

export const LAB_CLOSED_LOOP_VERSION = '1.0.0';

export const LAB_EVENT = Object.freeze({
  VALIDATION_REQUESTED: 'LAB_VALIDATION_REQUESTED',
  OBSERVATION_INGESTED: 'EXTERNAL_LAB_OBSERVATION_INGESTED',
  OBSERVATION_REVIEWED: 'EXTERNAL_LAB_OBSERVATION_REVIEWED',
  EVIDENCE_PROPOSED: 'LAB_EVIDENCE_PROPOSED',
  MODEL_OBSERVATION_COMPARISON: 'MODEL_OBSERVATION_COMPARISON',
});

export const LAB_REVIEW_VERDICTS = Object.freeze([
  'ACCEPTED_AS_OBSERVATION',
  'NEEDS_CLARIFICATION',
  'REJECTED_INTEGRITY',
]);

export const LAB_PROVIDER_TYPES = Object.freeze([
  'CRO',
  'ACADEMIC_LAB',
  'INTERNAL_LAB',
  'OTHER_EXTERNAL',
]);

const REVIEW_VERDICTS = new Set(LAB_REVIEW_VERDICTS);
const PROVIDER_TYPES = new Set(LAB_PROVIDER_TYPES);
const SHA256_HEX = /^[0-9a-f]{64}$/i;

const CLAIM_BOUNDARY =
  'A laboratory observation is an external measurement artifact. It is not automatically clinical efficacy, safety, therapeutic approval, or proof that a candidate is a medicine.';

function boundedString(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value, fallback = 0.5) {
  const n = finiteOrNull(value);
  return n === null ? fallback : Math.min(1, Math.max(0, n));
}

function findEvent(db, campaignId, predicate) {
  return campaignStore.listEvents(db, campaignId).find(predicate) ?? null;
}

function latestEvent(db, campaignId, predicate) {
  return [...campaignStore.listEvents(db, campaignId)].reverse().find(predicate) ?? null;
}

function requireCampaignCandidate(db, campaignId, candidateId) {
  const campaign = campaignStore.getCampaign(db, campaignId);
  if (!campaign) return { ok: false, error: 'campaign_not_found' };
  const candidate = campaignStore.getCandidate(db, candidateId);
  if (!candidate || candidate.campaignId !== campaignId) {
    return { ok: false, error: 'candidate_not_found' };
  }
  return { ok: true, campaign, candidate };
}

/**
 * Item 2 — outputKey, unit and tolerance are frozen HERE, at request creation.
 * `compareModelToLabObservation` (below) may only read this frozen binding
 * back; it never accepts an outputKey/unit/tolerance from its own caller.
 */
function sanitizeTolerance(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const absolute = finiteOrNull(raw.absolute);
  const relative = finiteOrNull(raw.relative);
  const hasAbsolute = absolute !== null && absolute >= 0;
  const hasRelative = relative !== null && relative >= 0;
  if (!hasAbsolute && !hasRelative) return null;
  return { absolute: hasAbsolute ? absolute : null, relative: hasRelative ? relative : null };
}

/** Returns `{ ok: true, entries }` or `{ ok: false, error }` — never a bare array, so an incomplete
 *  comparison binding (outputKey without a unit+tolerance) refuses the WHOLE request at creation
 *  time rather than silently admitting an endpoint nothing can later compare against. */
function sanitizeEndpointPlan(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: 'endpoint_plan_required' };
  const entries = [];
  for (const rawEntry of raw.slice(0, 16)) {
    const endpointId = boundedString(rawEntry?.endpointId, 120);
    if (!endpointId) continue;
    const expectedUnit = boundedString(rawEntry?.expectedUnit, 80) || null;
    const comparisonOutputKey = boundedString(rawEntry?.comparisonOutputKey, 120) || null;
    const tolerance = sanitizeTolerance(rawEntry?.tolerance);
    if (comparisonOutputKey && (!expectedUnit || !tolerance)) {
      return { ok: false, error: 'endpoint_plan_comparison_binding_incomplete' };
    }
    entries.push({
      endpointId,
      expectedUnit,
      comparisonOutputKey,
      tolerance,
      rationale: boundedString(rawEntry?.rationale, 500) || null,
    });
  }
  if (entries.length === 0) return { ok: false, error: 'endpoint_plan_required' };
  return { ok: true, entries };
}

/**
 * Creates a governed external-validation request.
 *
 * Important: this is a REQUEST artifact, not an executed laboratory experiment.
 * The request contains only high-level endpoints and comparison targets. It does
 * not contain synthesis instructions, culturing procedures, dosing protocols,
 * or other wet-lab execution steps.
 */
/**
 * Item 1 — every request must be governed: it either freezes/references a real
 * PRECLINICAL_CANDIDATE_PROTOCOL's fingerprint and one of its OWN
 * `requiredWetLab` entries (the existing vocabulary from
 * `preclinicalProtocol.mjs` — no competing experiment-request vocabulary is
 * introduced here), or is explicitly marked GOVERNED_MANUAL_REQUEST with a
 * named authorizer and reason. There is no third, ungoverned path.
 */
function resolveProtocolLink({ preclinicalProtocol, requiredWetLabId, governedManualRequest, candidateId }) {
  if (governedManualRequest) {
    const reason = boundedString(governedManualRequest.reason, 1000);
    const authorizedBy = boundedString(governedManualRequest.authorizedBy, 160);
    if (!reason || !authorizedBy) return { ok: false, error: 'governed_manual_request_incomplete' };
    return { ok: true, link: { mode: 'GOVERNED_MANUAL_REQUEST', reason, authorizedBy } };
  }
  if (preclinicalProtocol) {
    if (!protocolInvariantHolds(preclinicalProtocol)) return { ok: false, error: 'preclinical_protocol_invalid' };
    if (preclinicalProtocol.candidateId !== candidateId) return { ok: false, error: 'preclinical_protocol_candidate_mismatch' };
    const entry = preclinicalProtocol.requiredWetLab.find((w) => w.id === requiredWetLabId);
    if (!entry) return { ok: false, error: 'required_wetlab_assay_not_found' };
    return {
      ok: true,
      link: {
        mode: 'PRECLINICAL_PROTOCOL',
        protocolFingerprint: preclinicalProtocol.protocolFingerprint,
        requiredWetLabId: entry.id,
        assay: entry.assay,
        rankIfPassed: entry.rankIfPassed,
      },
    };
  }
  return { ok: false, error: 'preclinical_protocol_or_governed_manual_request_required' };
}

/**
 * Creates a governed external-validation request.
 *
 * Important: this is a REQUEST artifact, not an executed laboratory experiment.
 * The request contains only high-level endpoints and comparison targets. It does
 * not contain synthesis instructions, culturing procedures, dosing protocols,
 * or other wet-lab execution steps.
 */
export function createLabValidationRequest(db, {
  campaignId,
  candidateId,
  objective,
  endpointPlan = [],
  requestedBy = null,
  externalProvider = null,
  preregistrationRef = null,
  preclinicalProtocol = null,
  requiredWetLabId = null,
  governedManualRequest = null,
} = {}) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;

  const normalizedObjective = boundedString(objective, 1200);
  if (!normalizedObjective) {
    return { ok: false, error: 'objective_required' };
  }

  const protocolLinked = resolveProtocolLink({ preclinicalProtocol, requiredWetLabId, governedManualRequest, candidateId });
  if (!protocolLinked.ok) return protocolLinked;
  const protocolLink = protocolLinked.link;

  const gate = researchGateVerdict(db, campaignId, candidateId);
  const sanitizedPlan = sanitizeEndpointPlan(endpointPlan);
  if (!sanitizedPlan.ok) return sanitizedPlan;
  const normalizedEndpoints = sanitizedPlan.entries;

  const requestFingerprint = sha16({
    v: LAB_CLOSED_LOOP_VERSION,
    campaignId,
    candidateId,
    objective: normalizedObjective,
    endpointPlan: normalizedEndpoints,
    externalProvider: externalProvider ?? null,
    preregistrationRef: preregistrationRef ?? null,
    protocolLink,
  });
  const requestId = `LABREQ-${requestFingerprint}`;

  const existing = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.VALIDATION_REQUESTED && event.payload?.requestId === requestId,
  );
  if (existing) {
    return { ok: true, deduped: true, eventId: existing.id, request: existing.payload };
  }

  const ready = gate.verdict === 'RESEARCH_PRIORITY_ELIGIBLE';
  const payload = {
    contractVersion: LAB_CLOSED_LOOP_VERSION,
    requestId,
    requestFingerprint,
    campaignId,
    candidateId,
    candidateSmiles: linked.candidate.canonicalSmiles,
    objective: normalizedObjective,
    endpointPlan: normalizedEndpoints,
    protocolLink,
    externalProvider: externalProvider ? {
      providerId: boundedString(externalProvider.providerId, 160) || null,
      providerType: PROVIDER_TYPES.has(externalProvider.providerType) ? externalProvider.providerType : 'OTHER_EXTERNAL',
    } : null,
    preregistrationRef: boundedString(preregistrationRef, 500) || null,
    requestedBy: boundedString(requestedBy, 160) || null,
    executionAuthority: 'EXTERNAL_LAB_ONLY',
    researchGate: {
      verdict: gate.verdict,
      reason: gate.reason,
    },
    status: ready ? 'READY_FOR_EXTERNAL_LAB_REVIEW' : 'DRAFT_BLOCKED_BY_RESEARCH_GATE',
    claimBoundary: CLAIM_BOUNDARY,
  };

  const eventId = campaignStore.addEvent(db, {
    campaignId,
    generation: linked.candidate.generation,
    type: LAB_EVENT.VALIDATION_REQUESTED,
    payload,
  });
  return { ok: true, deduped: false, eventId, request: payload };
}

/**
 * Ingests a real external observation as an immutable campaign event.
 *
 * This function NEVER manufactures a result. It requires an external observation
 * id, source URI, laboratory/provider identity, method reference, endpoint and
 * observed value. It is initially INGESTED_UNREVIEWED and cannot drive Evidence
 * until a human review event accepts it.
 */
function parseObservedAt(raw) {
  const s = boundedString(raw, 80);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Item 4 — the same (labId, externalObservationId) reported with different content is a CONFLICT,
 *  never a silently-created second observation. Only an identical resubmission (same fingerprint,
 *  handled by the caller's own dedupe check) may reuse the same source identity. */
function findObservationBySource(db, campaignId, labId, externalObservationId) {
  return findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.OBSERVATION_INGESTED
      && event.payload?.source?.labId === labId
      && event.payload?.source?.externalObservationId === externalObservationId,
  );
}

export function ingestExternalLabObservation(db, {
  campaignId,
  candidateId,
  requestId,
  observation,
  ingestedBy = null,
} = {}) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;

  const requestEvent = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.VALIDATION_REQUESTED && event.payload?.requestId === requestId,
  );
  if (!requestEvent || requestEvent.payload?.candidateId !== candidateId) {
    return { ok: false, error: 'validation_request_not_found' };
  }
  // Item 5 — DRAFT/BLOCKED requests cannot accept observations.
  if (requestEvent.payload?.status !== 'READY_FOR_EXTERNAL_LAB_REVIEW') {
    return { ok: false, error: 'validation_request_not_ready' };
  }

  const endpointId = boundedString(observation?.endpointId, 120);
  const unit = boundedString(observation?.unit, 80);
  // Item 3 — observedAt must be a real, parseable timestamp, not merely a non-empty string.
  const observedAt = parseObservedAt(observation?.observedAt);
  const methodReference = boundedString(observation?.methodReference, 500);
  const labId = boundedString(observation?.source?.labId, 160);
  const externalObservationId = boundedString(observation?.source?.externalObservationId, 200);
  const sourceUri = boundedString(observation?.source?.sourceUri, 1000);
  const providerType = PROVIDER_TYPES.has(observation?.source?.providerType)
    ? observation.source.providerType
    : 'OTHER_EXTERNAL';
  // Item 3 — a full immutable raw-artifact SHA-256, normalized lowercase.
  const rawArtifactSha256Raw = boundedString(observation?.rawArtifactSha256, 64);
  const rawArtifactSha256 = SHA256_HEX.test(rawArtifactSha256Raw) ? rawArtifactSha256Raw.toLowerCase() : null;

  const value = observation?.value;
  const valueSupported = typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));

  if (!endpointId || !unit || !observedAt || !methodReference || !labId || !externalObservationId || !sourceUri || !valueSupported || !rawArtifactSha256) {
    return { ok: false, error: 'incomplete_external_observation' };
  }
  const ingester = boundedString(ingestedBy, 160);
  if (!ingester) return { ok: false, error: 'ingested_by_required' };

  const qualityStatus = ['QC_PASSED', 'QC_FAILED', 'QC_UNKNOWN'].includes(observation?.quality?.status)
    ? observation.quality.status
    : 'QC_UNKNOWN';
  const quality = {
    status: qualityStatus,
    confidence: clamp01(observation?.quality?.confidence, 0.5),
    notes: boundedString(observation?.quality?.notes, 1000) || null,
  };

  const observationFingerprint = sha16({
    v: LAB_CLOSED_LOOP_VERSION,
    requestId,
    campaignId,
    candidateId,
    endpointId,
    value,
    unit,
    observedAt,
    methodReference,
    rawArtifactSha256,
    source: { labId, externalObservationId, sourceUri, providerType },
    quality,
  });
  const observationId = `LABOBS-${observationFingerprint}`;

  const sameSource = findObservationBySource(db, campaignId, labId, externalObservationId);
  if (sameSource && sameSource.payload?.observationId !== observationId) {
    return {
      ok: false,
      error: 'external_observation_conflict',
      existingObservationId: sameSource.payload?.observationId ?? null,
    };
  }

  const duplicate = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.OBSERVATION_INGESTED && event.payload?.observationId === observationId,
  );
  if (duplicate) {
    return { ok: true, deduped: true, eventId: duplicate.id, observation: duplicate.payload };
  }

  const payload = {
    contractVersion: LAB_CLOSED_LOOP_VERSION,
    observationId,
    observationFingerprint,
    requestId,
    campaignId,
    candidateId,
    endpointId,
    value,
    unit,
    observedAt,
    methodReference,
    rawArtifactSha256,
    source: {
      labId,
      providerType,
      externalObservationId,
      sourceUri,
    },
    quality,
    ingestedBy: ingester,
    status: 'INGESTED_UNREVIEWED',
    evidenceClass: 'EXTERNAL_OBSERVATION',
    clinicalEfficacy: 'UNKNOWN',
    claimBoundary: CLAIM_BOUNDARY,
  };

  const eventId = campaignStore.addEvent(db, {
    campaignId,
    generation: linked.candidate.generation,
    type: LAB_EVENT.OBSERVATION_INGESTED,
    payload,
  });
  return { ok: true, deduped: false, eventId, observation: payload };
}

/**
 * Human review gate over an ingested external observation.
 *
 * ACCEPTED_AS_OBSERVATION means only that Genesis accepts the submitted artifact
 * as an observation for research comparison. It is NOT a clinical verdict.
 */
export function reviewExternalLabObservation(db, {
  campaignId,
  candidateId,
  observationId,
  verdict,
  reviewerId,
  note = null,
} = {}) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;
  if (!REVIEW_VERDICTS.has(verdict)) {
    return { ok: false, error: 'invalid_review_verdict' };
  }
  const reviewer = boundedString(reviewerId, 160);
  if (!reviewer) return { ok: false, error: 'reviewer_required' };

  const observationEvent = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.OBSERVATION_INGESTED && event.payload?.observationId === observationId,
  );
  if (!observationEvent || observationEvent.payload?.candidateId !== candidateId) {
    return { ok: false, error: 'observation_not_found' };
  }

  // Item 10 — reviewer != ingester. Evidence publication remains a separate, later, authorized
  // action (this function only ever PROPOSES via the caller's bridge — see linkLabEvidenceProposal).
  if (observationEvent.payload?.ingestedBy && reviewer === observationEvent.payload.ingestedBy) {
    return { ok: false, error: 'reviewer_cannot_be_ingester' };
  }

  const normalizedNote = boundedString(note, 1000) || null;

  if (verdict === 'ACCEPTED_AS_OBSERVATION') {
    // Item 5 — QC_FAILED can never be accepted.
    if (observationEvent.payload?.quality?.status === 'QC_FAILED') {
      return { ok: false, error: 'qc_failed_cannot_be_accepted' };
    }
    // Item 9 — validate the Evidence bridge BEFORE persisting acceptance, so an ACCEPTED review
    // that could never actually reach an Evidence proposal is refused outright, rather than
    // leaving an ACCEPTED_WITHOUT_PROPOSAL partial state for a caller to discover later.
    const bridgeCheck = buildLabObservationEvidenceInput({
      observation: observationEvent.payload,
      review: { verdict },
    });
    if (!bridgeCheck.ok) {
      return { ok: false, error: 'evidence_bridge_validation_failed', bridgeError: bridgeCheck.error };
    }
  }

  const previous = latestEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.OBSERVATION_REVIEWED && event.payload?.observationId === observationId,
  );

  const reviewFingerprint = sha16({
    v: LAB_CLOSED_LOOP_VERSION,
    observationId,
    verdict,
    reviewerId: reviewer,
    note: normalizedNote,
  });

  // Item 7 — idempotent: repeating the SAME review call (same observation/verdict/reviewer/note)
  // returns the existing event rather than growing the supersession chain. A genuinely different
  // review (correction, different verdict/reviewer/note) still creates a new, superseding event.
  if (previous && previous.payload?.reviewFingerprint === reviewFingerprint) {
    return { ok: true, deduped: true, eventId: previous.id, review: previous.payload, observation: observationEvent.payload };
  }

  const payload = {
    contractVersion: LAB_CLOSED_LOOP_VERSION,
    observationId,
    candidateId,
    requestId: observationEvent.payload.requestId,
    verdict,
    reviewerId: reviewer,
    note: normalizedNote,
    reviewFingerprint,
    supersedesReviewEventId: previous?.id ?? null,
    status: verdict,
    clinicalEfficacy: 'UNKNOWN',
    claimBoundary: CLAIM_BOUNDARY,
  };
  const eventId = campaignStore.addEvent(db, {
    campaignId,
    generation: linked.candidate.generation,
    type: LAB_EVENT.OBSERVATION_REVIEWED,
    payload,
  });
  return { ok: true, deduped: false, eventId, review: payload, observation: observationEvent.payload };
}

/** Item 7 — the latest EVIDENCE_PROPOSED link for an observation, or null. Lets a caller (the API
 *  route) reuse an already-created proposal instead of minting a second one on a repeated/idempotent
 *  review call. */
export function findLabEvidenceProposal(db, campaignId, observationId) {
  return latestEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.EVIDENCE_PROPOSED && event.payload?.observationId === observationId,
  )?.payload ?? null;
}

export function linkLabEvidenceProposal(db, {
  campaignId,
  candidateId,
  observationId,
  proposalId,
  evidenceContentHash = null,
} = {}) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;
  const proposal = boundedString(proposalId, 200);
  if (!proposal) return { ok: false, error: 'proposal_id_required' };

  const observationEvent = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.OBSERVATION_INGESTED && event.payload?.observationId === observationId,
  );
  if (!observationEvent || observationEvent.payload?.candidateId !== candidateId) {
    return { ok: false, error: 'observation_not_found' };
  }

  // Item 8 — linkLabEvidenceProposal must itself prove the latest review is ACCEPTED; it never
  // trusts a caller's say-so.
  if (!acceptedReviewFor(db, campaignId, observationId)) {
    return { ok: false, error: 'observation_not_accepted' };
  }

  // Item 7 — idempotent: linking the SAME (observationId, proposalId) pair again returns the
  // existing link rather than appending a duplicate.
  const existing = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.EVIDENCE_PROPOSED
      && event.payload?.observationId === observationId
      && event.payload?.proposalId === proposal,
  );
  if (existing) {
    return { ok: true, deduped: true, eventId: existing.id, link: existing.payload };
  }

  const payload = {
    contractVersion: LAB_CLOSED_LOOP_VERSION,
    observationId,
    candidateId,
    proposalId: proposal,
    evidenceContentHash: boundedString(evidenceContentHash, 200) || null,
    mode: 'PROPOSE_ONLY',
    status: 'PENDING_HUMAN_PUBLICATION',
  };
  const eventId = campaignStore.addEvent(db, {
    campaignId,
    generation: linked.candidate.generation,
    type: LAB_EVENT.EVIDENCE_PROPOSED,
    payload,
  });
  return { ok: true, deduped: false, eventId, link: payload };
}

function acceptedReviewFor(db, campaignId, observationId) {
  const latest = latestEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.OBSERVATION_REVIEWED && event.payload?.observationId === observationId,
  );
  return latest?.payload?.verdict === 'ACCEPTED_AS_OBSERVATION' ? latest : null;
}

function toleranceChecks(deltaAbs, deltaRel, tolerance) {
  const checks = [];
  if (typeof tolerance?.absolute === 'number' && Number.isFinite(tolerance.absolute) && tolerance.absolute >= 0) {
    checks.push({ kind: 'absolute', threshold: tolerance.absolute, actual: deltaAbs, pass: deltaAbs <= tolerance.absolute });
  }
  if (typeof tolerance?.relative === 'number' && Number.isFinite(tolerance.relative) && tolerance.relative >= 0) {
    checks.push({ kind: 'relative', threshold: tolerance.relative, actual: deltaRel, pass: deltaRel <= tolerance.relative });
  }
  return checks;
}

/**
 * Compares one already-persisted MODEL_ESTIMATE/COMPUTATIONAL run output with
 * one human-accepted external observation.
 *
 * "AGREES_WITHIN_TOLERANCE" means numerical agreement for the declared endpoint
 * and tolerance only. It does not mean efficacy or clinical validation.
 *
 * Item 2/6 — outputKey, unit and tolerance are NEVER accepted from this
 * function's own caller. They are read back from the endpointPlan entry
 * frozen on the original validation request at creation time
 * (`createLabValidationRequest`), matched by the observation's endpointId.
 * The frozen unit must match BOTH the model run's unit and the observation's
 * unit exactly — a "compatible" or coerced match is refused, not accepted.
 */
export function compareModelToLabObservation(db, {
  campaignId,
  candidateId,
  scienceRunId,
  observationId,
  comparedBy = null,
} = {}) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;

  const run = getScienceRun(db, scienceRunId);
  if (!run || run.campaignId !== campaignId || run.candidateId !== candidateId) {
    return { ok: false, error: 'science_run_not_found' };
  }

  const observationEvent = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.OBSERVATION_INGESTED && event.payload?.observationId === observationId,
  );
  if (!observationEvent || observationEvent.payload?.candidateId !== candidateId) {
    return { ok: false, error: 'observation_not_found' };
  }
  if (!acceptedReviewFor(db, campaignId, observationId)) {
    return { ok: false, error: 'observation_not_accepted' };
  }

  const requestEvent = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.VALIDATION_REQUESTED && event.payload?.requestId === observationEvent.payload.requestId,
  );
  const endpointPlanEntry = requestEvent?.payload?.endpointPlan?.find(
    (entry) => entry.endpointId === observationEvent.payload.endpointId,
  );
  if (!endpointPlanEntry?.comparisonOutputKey || !endpointPlanEntry?.expectedUnit || !endpointPlanEntry?.tolerance) {
    return { ok: false, error: 'endpoint_plan_missing_comparison_binding' };
  }
  const key = endpointPlanEntry.comparisonOutputKey;
  const expectedUnit = endpointPlanEntry.expectedUnit;
  const tolerance = endpointPlanEntry.tolerance;

  if (!Object.prototype.hasOwnProperty.call(run.outputs ?? {}, key)) {
    return { ok: false, error: 'model_output_key_not_found' };
  }

  const modelValue = finiteOrNull(run.outputs[key]);
  const observedValue = finiteOrNull(observationEvent.payload?.value);
  if (modelValue === null || observedValue === null) {
    return { ok: false, error: 'non_numeric_comparison_not_supported' };
  }

  // Item 6 — the model output unit must be known, and must exactly match the frozen canonical
  // unit; so must the observation's own unit. No coercion, no "compatible enough".
  const modelUnit = boundedString(run.units?.[key], 80) || null;
  const observationUnit = boundedString(observationEvent.payload?.unit, 80) || null;
  if (!modelUnit || modelUnit !== expectedUnit || observationUnit !== expectedUnit) {
    return {
      ok: false,
      error: 'unit_mismatch',
      modelUnit,
      observationUnit,
      expectedUnit,
    };
  }

  const delta = observedValue - modelValue;
  const deltaAbs = Math.abs(delta);
  const denominator = Math.max(Math.abs(modelValue), Math.abs(observedValue), Number.EPSILON);
  const deltaRel = deltaAbs / denominator;
  const checks = toleranceChecks(deltaAbs, deltaRel, tolerance);
  if (checks.length === 0) {
    return { ok: false, error: 'explicit_tolerance_required' };
  }

  const agrees = checks.every((check) => check.pass);
  const comparisonFingerprint = sha16({
    v: LAB_CLOSED_LOOP_VERSION,
    campaignId,
    candidateId,
    scienceRunId,
    observationId,
    outputKey: key,
    modelValue,
    observedValue,
    unit: modelUnit ?? observationUnit,
    checks,
  });
  const comparisonId = `LABCMP-${comparisonFingerprint}`;

  const duplicate = findEvent(
    db,
    campaignId,
    (event) => event.type === LAB_EVENT.MODEL_OBSERVATION_COMPARISON && event.payload?.comparisonId === comparisonId,
  );
  if (duplicate) {
    return { ok: true, deduped: true, eventId: duplicate.id, comparison: duplicate.payload };
  }

  const payload = {
    contractVersion: LAB_CLOSED_LOOP_VERSION,
    comparisonId,
    comparisonFingerprint,
    campaignId,
    candidateId,
    scienceRunId,
    scienceRunEvidenceClass: run.evidenceClass,
    observationId,
    endpointId: observationEvent.payload.endpointId,
    outputKey: key,
    modelValue,
    observedValue,
    unit: modelUnit ?? observationUnit,
    delta,
    deltaAbs,
    deltaRel,
    toleranceChecks: checks,
    verdict: agrees ? 'AGREES_WITHIN_TOLERANCE' : 'DISAGREES_OUTSIDE_TOLERANCE',
    comparedBy: boundedString(comparedBy, 160) || null,
    clinicalEfficacy: 'UNKNOWN',
    claimBoundary: CLAIM_BOUNDARY,
  };
  const eventId = campaignStore.addEvent(db, {
    campaignId,
    generation: linked.candidate.generation,
    type: LAB_EVENT.MODEL_OBSERVATION_COMPARISON,
    payload,
  });
  return { ok: true, deduped: false, eventId, comparison: payload };
}

function latestReviewMap(events) {
  const out = new Map();
  for (const event of events) {
    if (event.type === LAB_EVENT.OBSERVATION_REVIEWED) {
      out.set(event.payload?.observationId, event);
    }
  }
  return out;
}

export function deriveNextResearchAction(dossier) {
  if (!dossier) return { action: 'BLOCKED', reason: 'DOSSIER_MISSING' };

  if (dossier.requests.length === 0) {
    return { action: 'PREPARE_EXTERNAL_VALIDATION_REQUEST', reason: 'NO_VALIDATION_REQUEST' };
  }

  if (dossier.observations.length === 0) {
    return { action: 'AWAIT_EXTERNAL_OBSERVATION', reason: 'NO_LAB_OBSERVATION' };
  }

  const accepted = dossier.observations.filter((entry) => entry.latestReview?.payload?.verdict === 'ACCEPTED_AS_OBSERVATION');
  if (accepted.length === 0) {
    return { action: 'HUMAN_REVIEW_REQUIRED', reason: 'NO_ACCEPTED_OBSERVATION' };
  }

  if (dossier.comparisons.length === 0) {
    return { action: 'COMPARE_MODEL_TO_OBSERVATION', reason: 'ACCEPTED_OBSERVATION_NOT_COMPARED' };
  }

  const latestComparison = dossier.comparisons[dossier.comparisons.length - 1];
  if (latestComparison.payload?.verdict === 'DISAGREES_OUTSIDE_TOLERANCE') {
    return {
      action: 'REVISE_MODEL_OR_HYPOTHESIS',
      reason: 'MODEL_OBSERVATION_DISAGREEMENT',
      comparisonId: latestComparison.payload.comparisonId,
    };
  }

  const independentLabs = new Set(
    accepted.map((entry) => entry.event.payload?.source?.labId).filter(Boolean),
  );
  if (independentLabs.size < 2) {
    return {
      action: 'SEEK_INDEPENDENT_REPLICATION',
      reason: 'SINGLE_LAB_OBSERVATION',
    };
  }

  return {
    action: 'EVIDENCE_ACCUMULATION_READY',
    reason: 'MULTI_LAB_OBSERVATION_AVAILABLE',
    claimBoundary: CLAIM_BOUNDARY,
  };
}

/** Read-only aggregate for UI, grant demos and subsequent agent reasoning. */
export function buildLabValidationDossier(db, campaignId, candidateId) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;

  const events = campaignStore.listEvents(db, campaignId);
  const reviews = latestReviewMap(events);

  const requests = events.filter(
    (event) => event.type === LAB_EVENT.VALIDATION_REQUESTED && event.payload?.candidateId === candidateId,
  );
  const observations = events
    .filter((event) => event.type === LAB_EVENT.OBSERVATION_INGESTED && event.payload?.candidateId === candidateId)
    .map((event) => ({
      event,
      latestReview: reviews.get(event.payload?.observationId) ?? null,
    }));
  const evidenceLinks = events.filter(
    (event) => event.type === LAB_EVENT.EVIDENCE_PROPOSED && event.payload?.candidateId === candidateId,
  );
  const comparisons = events.filter(
    (event) => event.type === LAB_EVENT.MODEL_OBSERVATION_COMPARISON && event.payload?.candidateId === candidateId,
  );
  const scienceRuns = listScienceRunsForCandidate(db, candidateId);
  const researchGate = researchGateVerdict(db, campaignId, candidateId);

  const dossier = {
    contractVersion: LAB_CLOSED_LOOP_VERSION,
    campaignId,
    candidateId,
    candidate: linked.candidate,
    researchGate,
    scienceRuns,
    requests,
    observations,
    evidenceLinks,
    comparisons,
    clinicalEfficacy: 'UNKNOWN',
    claimBoundary: CLAIM_BOUNDARY,
  };
  return {
    ok: true,
    dossier: {
      ...dossier,
      nextResearchAction: deriveNextResearchAction(dossier),
      dossierFingerprint: sha16({
        v: LAB_CLOSED_LOOP_VERSION,
        campaignId,
        candidateId,
        requestIds: requests.map((event) => event.payload?.requestId),
        observationIds: observations.map((entry) => entry.event.payload?.observationId),
        reviewVerdicts: observations.map((entry) => entry.latestReview?.payload?.verdict ?? null),
        evidenceProposalIds: evidenceLinks.map((event) => event.payload?.proposalId),
        comparisonIds: comparisons.map((event) => event.payload?.comparisonId),
      }),
    },
  };
}
