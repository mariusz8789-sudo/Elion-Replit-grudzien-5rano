/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * CANDIDATE → LABORATORY LOOP FOR A RESEARCHRUN.
 *
 * Closes the gap between a ResearchRun that supports a candidate computationally and the physical world, without a
 * second lifecycle, store or ledger. Every step is one event on the run's own hash-chained research state
 * (agent_run_steps), so it survives a restart exactly like the experiment events:
 *
 *   LAB_REQUEST_PREPARED            a governed request: the frozen model value, unit and tolerance the lab result will be
 *                                   compared against. Only a SUPPORTED, replay-MATCHed, Evidence-PROPOSED experiment qualifies.
 *   LAB_OBSERVATION_INGESTED        a REAL MEASUREMENT from an external laboratory, with a raw-artifact hash Genesis computed.
 *   LAB_OBSERVATION_REVIEWED        the human gate (reviewer is never the ingester).
 *   LAB_MODEL_MEASUREMENT_COMPARED  model value vs measurement, from the frozen binding only; never a clinical verdict.
 *   LAB_EVIDENCE_PROPOSED           the reviewed measurement as a PROPOSAL on the canonical knowledge ledger (a human publishes).
 *
 * The pure parts (raw-artifact decoding, tolerance checks, the Evidence bridge, the next-action rule) are the existing
 * campaign/labClosedLoop.mjs and campaign/labEvidenceBridge.mjs; this module only binds them to ResearchRun state.
 * Nothing here executes a wet-lab procedure, signs anything or upgrades a model value to a measurement.
 */
import { appendServerResearchStateEvent } from './agentRun.mjs';
import { buildLabObservationEvidenceInput } from './campaign/labEvidenceBridge.mjs';
import {
  decodeRawArtifact, deriveNextResearchAction, LAB_CLAIM_BOUNDARY, LAB_PROVIDER_TYPES, LAB_REVIEW_VERDICTS, sanitizeTolerance, toleranceChecks,
} from './campaign/labClosedLoop.mjs';
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { proposeStructuredEvidence } from './knowledgeApi.mjs';
import { canonicalHash } from './provenance.mjs';
import { getResearchRun, inWriteTransaction, RESEARCH_RUN_CONTRACT_VERSION } from './researchRun.mjs';
import { buildResearchRunEvidencePack, verifyResearchRunEvidencePack } from './researchRunEvidencePack.mjs';
import { PROTOCOL_VERDICT } from './researchRunExecution.mjs';
import { getScienceRun } from './store.mjs';

export const LAB_LOOP_VERSION = 'research-run-lab@1';
export const LAB_PACKAGE_KIND = 'GENESIS_RESEARCH_RUN_LAB_PACKAGE';
export const LAB_EVENT_TYPES = Object.freeze({
  REQUEST: 'LAB_REQUEST_PREPARED',
  OBSERVATION: 'LAB_OBSERVATION_INGESTED',
  REVIEW: 'LAB_OBSERVATION_REVIEWED',
  COMPARISON: 'LAB_MODEL_MEASUREMENT_COMPARED',
  EVIDENCE: 'LAB_EVIDENCE_PROPOSED',
});
export const LAB_LABELS = Object.freeze({
  model: 'GENESIS COMPUTATION',
  measurement: 'REAL MEASUREMENT',
  proposal: 'MODEL PROPOSAL',
  unknown: 'UNKNOWN',
});
export const UNSIGNED_STATEMENT = 'UNSIGNED. No organisational signing key exists yet. Integrity here means fingerprints and replay only; nothing in this package is a signed attestation.';
const PROVIDER_TYPES = new Set(LAB_PROVIDER_TYPES);
const REVIEW_VERDICTS = new Set(LAB_REVIEW_VERDICTS);
const REQUEST_ENVELOPE_KEYS = new Set(['requestId', 'requestFingerprint', 'status', 'requiresHumanApproval', 'executionAuthority', 'labels', 'claimBoundary']);
const QC = ['QC_PASSED', 'QC_FAILED', 'QC_UNKNOWN'];

/** Key-order independent: a fingerprint must survive the canonical JSON round trip through the chain. */
const fp16 = (value) => canonicalHash(value).slice(0, 16);
const text = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const fail = (status, reason = null, extra = {}) => ({ ok: false, status, reason, ...extra });
const labEvents = (events, type) => events.filter((event) => event.type === type);

/** Never lets a lab event touch a run whose chain is broken, or one nobody can act on any more. */
function loadRun(db, projectId, runId) {
  const run = getResearchRun(db, projectId, runId);
  if (!run) return fail('NOT_FOUND');
  if (!run.researchState.chain.ok) return fail('STATE_INTEGRITY_FAILURE', 'research-state chain is broken');
  return { ok: true, run };
}

function append(db, runId, type, payload) {
  const appended = appendServerResearchStateEvent(db, runId, type, { contractVersion: RESEARCH_RUN_CONTRACT_VERSION, labLoopVersion: LAB_LOOP_VERSION, researchRunId: runId, ...payload });
  return appended.ok ? { ok: true, event: appended.event } : fail('STATE_INTEGRITY_FAILURE', appended.error);
}

/* ---------------- request ---------------- */

function requestFingerprintOf(body) {
  return fp16({ v: LAB_LOOP_VERSION, ...body });
}

/**
 * A request is a governed ask of an EXTERNAL laboratory. It freezes what will later be compared: the model value, its
 * unit and the tolerance. Nothing the lab sends afterwards can move them.
 */
export function prepareLabRequest(db, projectId, runId, { experimentId, endpoint = {}, objective = null, requestedBy = null, externalProvider = null } = {}) {
  const loaded = loadRun(db, projectId, runId);
  if (!loaded.ok) return loaded;
  const x = loaded.run.experiments.find((e) => e.experimentId === experimentId);
  if (!x) return fail('EXPERIMENT_NOT_FOUND');
  if (loaded.run.run.status === 'CANCELLED') return fail('RUN_NOT_ACTIVE', loaded.run.run.status);
  if (!x.execution || x.execution.status !== 'EXECUTED' || !x.falsification || !x.evidence || !x.next) return fail('BLOCKED', 'EXPERIMENT_NOT_CLOSED_WITH_REAL_EXECUTION');
  if (x.falsification.verdict !== PROTOCOL_VERDICT.SUPPORTED) return fail('BLOCKED', 'NOT_SUPPORTED_WITHIN_PROTOCOL', { verdict: x.falsification.verdict });
  if (x.next.replay?.verdict !== 'MATCH') return fail('BLOCKED', 'REPLAY_NOT_MATCHED', { replay: x.next.replay?.verdict ?? null });
  if (!x.evidence.evidenceProposalId) return fail('BLOCKED', 'EVIDENCE_PROPOSAL_MISSING');

  const endpointId = text(endpoint.endpointId, 120);
  const outputKey = text(endpoint.outputKey, 120);
  const expectedUnit = text(endpoint.expectedUnit, 80);
  const tolerance = sanitizeTolerance(endpoint.tolerance);
  const assay = text(endpoint.assay, 300);
  if (!endpointId || !outputKey || !expectedUnit || !assay) return fail('INVALID_ENDPOINT', 'endpointId, outputKey, expectedUnit and assay are required');
  if (!tolerance) return fail('INVALID_ENDPOINT', 'an explicit tolerance is required before the measurement exists');
  const modelValue = finite(x.execution.output?.[outputKey]);
  if (modelValue === null) return fail('INVALID_ENDPOINT', `execution output has no numeric "${outputKey}"`);
  if (/\b(synthes[ei]s|culture|dosing|dose)\b/i.test(`${assay} ${objective ?? ''}`)) return fail('INVALID_ENDPOINT', 'a request names an endpoint, never a wet-lab procedure');

  const provider = externalProvider ? { providerId: text(externalProvider.providerId, 160) || null, providerType: PROVIDER_TYPES.has(externalProvider.providerType) ? externalProvider.providerType : 'OTHER_EXTERNAL' } : null;
  const body = {
    researchRunId: runId,
    experimentId,
    candidateRef: `research-run:${runId}:${experimentId}`,
    candidateInput: x.frozen.input ?? null,
    objective: text(objective, 1200) || `External measurement of ${endpointId} for the candidate of experiment ${experimentId}`,
    endpoint: { endpointId, assay, expectedUnit, tolerance, comparisonOutputKey: outputKey },
    modelBinding: {
      outputKey, modelValue, unit: expectedUnit, unitSource: 'DECLARED_IN_REQUEST',
      scienceRunId: x.execution.scienceRunId ?? null, outputHash: x.execution.outputHash, inputHash: x.execution.inputHash,
      predictionFingerprint: x.frozen.predictionFingerprint, preregistrationFingerprint: x.frozen.preregistrationFingerprint,
    },
    computationalEvidence: {
      status: 'READY', evidenceProposalId: x.evidence.evidenceProposalId, evidenceContentHash: x.evidence.evidenceContentHash ?? null,
      evidenceStatus: x.evidence.status, replayVerdict: x.next.replay.verdict, replayVerificationId: x.next.replay.verificationId ?? null, protocolVerdict: x.falsification.verdict,
    },
    externalProvider: provider,
    requestedBy: text(requestedBy, 160) || null,
  };
  const requestFingerprint = requestFingerprintOf(body);
  const requestId = `LABREQ-${requestFingerprint}`;
  const request = {
    requestId, requestFingerprint, ...body,
    status: 'READY_FOR_EXTERNAL_LAB_REVIEW',
    requiresHumanApproval: true,
    executionAuthority: 'EXTERNAL_LAB_ONLY',
    labels: { modelValue: LAB_LABELS.model, labResult: LAB_LABELS.measurement },
    claimBoundary: LAB_CLAIM_BOUNDARY,
  };

  return inWriteTransaction(db, () => {
    const now = loadRun(db, projectId, runId);
    if (!now.ok) return now;
    const existing = labEvents(now.run.researchState.events, LAB_EVENT_TYPES.REQUEST).find((event) => event.payload.request?.requestId === requestId);
    if (existing) return { ok: true, deduped: true, request: existing.payload.request, seq: existing.seq };
    const appended = append(db, runId, LAB_EVENT_TYPES.REQUEST, { request });
    return appended.ok ? { ok: true, deduped: false, request, seq: appended.event.seq } : appended;
  });
}

/* ---------------- package for the laboratory ---------------- */

const packageBodyHash = (body) => canonicalHash(body);

/**
 * What a laboratory receives. The readable part names the candidate, the endpoint and what to send back. Everything about
 * how Genesis computed its side, including engine names, sits under `technicalDetails` together with the Evidence Pack.
 */
export async function exportLabPackage(db, projectId, runId, requestId, { artifactStorage = null } = {}) {
  const loaded = loadRun(db, projectId, runId);
  if (!loaded.ok) return loaded;
  const event = labEvents(loaded.run.researchState.events, LAB_EVENT_TYPES.REQUEST).find((e) => e.payload.request?.requestId === requestId);
  if (!event) return fail('REQUEST_NOT_FOUND');
  const request = event.payload.request;
  const built = await buildResearchRunEvidencePack(db, projectId, runId, { artifactStorage });
  if (!built.ok) return fail(built.status === 'NOT_FOUND' ? 'NOT_FOUND' : 'BLOCKED', 'evidence pack could not be built', { blockers: built.blockers ?? null });
  const packVerification = await verifyResearchRunEvidencePack(built.pack, { db, projectId, artifactStorage });

  const body = {
    kind: LAB_PACKAGE_KIND,
    packageVersion: LAB_LOOP_VERSION,
    requestId,
    requestFingerprint: request.requestFingerprint,
    forLaboratory: {
      candidate: { identity: request.candidateInput?.smiles ?? null, reference: request.candidateRef },
      objective: request.objective,
      endpoint: { endpointId: request.endpoint.endpointId, assay: request.endpoint.assay, expectedUnit: request.endpoint.expectedUnit },
      pleaseReturn: [
        'endpointId, the measured value and its unit (must equal expectedUnit)',
        'observedAt (ISO timestamp), methodReference, your laboratory id and your own observation id',
        'quality (QC_PASSED, QC_FAILED or QC_UNKNOWN) and notes',
        'the raw artifact file itself, so Genesis can hash the bytes it received',
      ],
      status: LAB_LABELS.unknown,
      labels: { genesisSide: LAB_LABELS.model, yourResult: LAB_LABELS.measurement },
    },
    integrity: { signature: { status: 'UNSIGNED', statement: UNSIGNED_STATEMENT }, method: 'fingerprints and replay' },
    humanApproval: { required: true, state: 'PENDING', note: 'Genesis accepts a laboratory result only after a human reviewer other than the person who entered it accepts it.' },
    claimBoundary: LAB_CLAIM_BOUNDARY,
    technicalDetails: {
      request,
      evidencePack: built.pack,
      evidencePackVerification: { status: packVerification.status, ok: packVerification.ok, anchored: packVerification.anchored ?? null, codes: packVerification.codes ?? [], delivery: built.pack.verification?.delivery ?? null, missing: built.pack.verification?.missing ?? [] },
      engines: [...new Set(built.pack.experiments.map((e) => e.summary?.engineId).filter(Boolean))],
    },
  };
  return { ok: true, package: { ...body, packageHash: packageBodyHash(body) } };
}

/** Offline check of a package a holder was given: the package hash, the request fingerprint and the embedded Evidence Pack. */
export async function verifyLabPackage(pkg) {
  const failures = [];
  if (pkg?.kind !== LAB_PACKAGE_KIND) failures.push('KIND');
  if (pkg?.integrity?.signature?.status !== 'UNSIGNED') failures.push('SIGNATURE_STATUS_CLAIMED');
  const { packageHash, ...body } = pkg ?? {};
  if (packageBodyHash(body) !== packageHash) failures.push('PACKAGE_HASH_MISMATCH');
  const request = pkg?.technicalDetails?.request;
  if (request) {
    const rest = Object.fromEntries(Object.entries(request).filter(([key]) => !REQUEST_ENVELOPE_KEYS.has(key)));
    if (requestFingerprintOf(rest) !== request.requestFingerprint || `LABREQ-${request.requestFingerprint}` !== request.requestId || request.requestId !== pkg.requestId) failures.push('REQUEST_FINGERPRINT_MISMATCH');
  } else failures.push('REQUEST_MISSING');
  const pack = pkg?.technicalDetails?.evidencePack;
  if (!pack) failures.push('EVIDENCE_PACK_MISSING');
  else {
    if (pack.researchRunId !== request?.researchRunId) failures.push('EVIDENCE_PACK_RUN_MISMATCH');
    const verified = await verifyResearchRunEvidencePack(pack);
    if (!verified.ok) failures.push(...(verified.codes?.length ? verified.codes : ['EVIDENCE_PACK_REJECTED']));
  }
  return { ok: failures.length === 0, status: failures.length === 0 ? 'VALID_INTEGRITY_ONLY' : 'REJECTED', signature: 'UNSIGNED', failures };
}

/* ---------------- observation, review, comparison, evidence ---------------- */

function requestOf(events, requestId) {
  return labEvents(events, LAB_EVENT_TYPES.REQUEST).find((e) => e.payload.request?.requestId === requestId)?.payload.request ?? null;
}
const observationOf = (events, observationId) => labEvents(events, LAB_EVENT_TYPES.OBSERVATION).find((e) => e.payload.observation?.observationId === observationId)?.payload.observation ?? null;
const latestReviewOf = (events, observationId) => labEvents(events, LAB_EVENT_TYPES.REVIEW).filter((e) => e.payload.review?.observationId === observationId).at(-1)?.payload.review ?? null;

export function ingestLabObservation(db, projectId, runId, { requestId, observation = {}, ingestedBy = null } = {}) {
  const loaded = loadRun(db, projectId, runId);
  if (!loaded.ok) return loaded;
  const events = loaded.run.researchState.events;
  const request = requestOf(events, requestId);
  if (!request) return fail('REQUEST_NOT_FOUND');
  const ingester = text(ingestedBy, 160);
  if (!ingester) return fail('INGESTED_BY_REQUIRED');

  const endpointId = text(observation.endpointId, 120);
  const unit = text(observation.unit, 80);
  const methodReference = text(observation.methodReference, 500);
  const labId = text(observation.source?.labId, 160);
  const externalObservationId = text(observation.source?.externalObservationId, 200);
  const sourceUri = text(observation.source?.sourceUri, 1000);
  const providerType = PROVIDER_TYPES.has(observation.source?.providerType) ? observation.source.providerType : 'OTHER_EXTERNAL';
  const observedAtMs = Date.parse(text(observation.observedAt, 80));
  const declared = /^[0-9a-f]{64}$/i.test(text(observation.rawArtifactSha256, 64)) ? text(observation.rawArtifactSha256, 64).toLowerCase() : null;
  const decoded = decodeRawArtifact(observation.rawArtifactBase64);
  if (decoded.present && !decoded.ok) return fail(decoded.error.toUpperCase());
  if (decoded.ok && declared && declared !== decoded.sha256) return fail('RAW_ARTIFACT_HASH_MISMATCH', 'declared and computed SHA-256 differ; nothing was ingested', { declaredSha256: declared, computedSha256: decoded.sha256 });
  const rawArtifactSha256 = decoded.ok ? decoded.sha256 : declared;
  const value = observation.value;
  const valueOk = typeof value === 'string' || typeof value === 'boolean' || finite(value) !== null;
  if (!endpointId || !unit || !Number.isFinite(observedAtMs) || !methodReference || !labId || !externalObservationId || !sourceUri || !valueOk || !rawArtifactSha256) return fail('INCOMPLETE_EXTERNAL_OBSERVATION');
  if (endpointId !== request.endpoint.endpointId) return fail('ENDPOINT_NOT_REQUESTED', `request asks for ${request.endpoint.endpointId}`);

  const quality = {
    status: QC.includes(observation.quality?.status) ? observation.quality.status : 'QC_UNKNOWN',
    confidence: finite(observation.quality?.confidence) === null ? 0.5 : Math.min(1, Math.max(0, observation.quality.confidence)),
    notes: text(observation.quality?.notes, 1000) || null,
  };
  const integrity = decoded.ok
    ? { level: 'VERIFIED_BY_GENESIS', computedBy: 'Genesis, from the bytes received in this request', algorithm: 'sha256', byteLength: decoded.bytes.length, declaredSha256: declared, limitation: 'Genesis hashed the bytes it was given. That proves which bytes it holds; it does not prove the instrument produced them.' }
    : { level: 'DECLARED_BY_CLIENT', computedBy: null, algorithm: 'sha256', byteLength: null, declaredSha256: declared, limitation: 'The raw artifact was NOT transmitted; this hash is a claim by the submitting client about a file Genesis does not hold.' };
  const source = { labId, providerType, externalObservationId, sourceUri };
  const fingerprintBody = { v: LAB_LOOP_VERSION, requestId, endpointId, value, unit, observedAt: new Date(observedAtMs).toISOString(), methodReference, rawArtifactSha256, integrityLevel: integrity.level, source, quality };
  const observationFingerprint = fp16(fingerprintBody);
  const observationId = `LABOBS-${observationFingerprint}`;

  return inWriteTransaction(db, () => {
    const now = loadRun(db, projectId, runId);
    if (!now.ok) return now;
    const sameSource = labEvents(now.run.researchState.events, LAB_EVENT_TYPES.OBSERVATION).map((e) => e.payload.observation)
      .find((o) => o.source.labId === labId && o.source.externalObservationId === externalObservationId);
    if (sameSource) {
      return sameSource.observationId === observationId
        ? { ok: true, deduped: true, observation: sameSource }
        : fail('EXTERNAL_OBSERVATION_CONFLICT', 'the same laboratory observation id was reported with different content', { existingObservationId: sameSource.observationId });
    }
    const payload = {
      observationId, observationFingerprint, requestId, candidateId: request.candidateRef,
      endpointId, value, unit, observedAt: fingerprintBody.observedAt, methodReference, rawArtifactSha256, rawArtifactIntegrity: integrity, source, quality,
      ingestedBy: ingester, status: 'INGESTED_UNREVIEWED', evidenceClass: LAB_LABELS.measurement, clinicalEfficacy: LAB_LABELS.unknown, claimBoundary: LAB_CLAIM_BOUNDARY,
    };
    const appended = append(db, runId, LAB_EVENT_TYPES.OBSERVATION, { observation: payload });
    return appended.ok ? { ok: true, deduped: false, observation: payload, seq: appended.event.seq } : appended;
  });
}

export function reviewLabObservation(db, projectId, runId, { observationId, verdict, reviewerId, note = null } = {}) {
  if (!REVIEW_VERDICTS.has(verdict)) return fail('INVALID_REVIEW_VERDICT');
  const reviewer = text(reviewerId, 160);
  if (!reviewer) return fail('REVIEWER_REQUIRED');
  return inWriteTransaction(db, () => {
    const loaded = loadRun(db, projectId, runId);
    if (!loaded.ok) return loaded;
    const events = loaded.run.researchState.events;
    const observation = observationOf(events, observationId);
    if (!observation) return fail('OBSERVATION_NOT_FOUND');
    if (reviewer === observation.ingestedBy) return fail('REVIEWER_CANNOT_BE_INGESTER');
    if (verdict === 'ACCEPTED_AS_OBSERVATION') {
      if (observation.quality.status === 'QC_FAILED') return fail('QC_FAILED_CANNOT_BE_ACCEPTED');
      const bridge = buildLabObservationEvidenceInput({ observation, review: { verdict } });
      if (!bridge.ok) return fail('EVIDENCE_BRIDGE_VALIDATION_FAILED', bridge.error);
    }
    const normalizedNote = text(note, 1000) || null;
    const reviewFingerprint = fp16({ v: LAB_LOOP_VERSION, observationId, verdict, reviewerId: reviewer, note: normalizedNote });
    const previous = latestReviewOf(events, observationId);
    if (previous?.reviewFingerprint === reviewFingerprint) return { ok: true, deduped: true, review: previous, observation };
    const review = { observationId, requestId: observation.requestId, verdict, reviewerId: reviewer, note: normalizedNote, reviewFingerprint, supersedesReviewFingerprint: previous?.reviewFingerprint ?? null, status: verdict, clinicalEfficacy: LAB_LABELS.unknown, claimBoundary: LAB_CLAIM_BOUNDARY };
    const appended = append(db, runId, LAB_EVENT_TYPES.REVIEW, { review });
    return appended.ok ? { ok: true, deduped: false, review, observation, seq: appended.event.seq } : appended;
  });
}

const accepted = (events, observationId) => latestReviewOf(events, observationId)?.verdict === 'ACCEPTED_AS_OBSERVATION';

/**
 * Model value vs REAL MEASUREMENT. The binding (output key, unit, tolerance, model value) is read back from the request frozen
 * before the measurement existed, and the model value is re-read from the stored execution and Scientific Run: if either moved,
 * the comparison is refused instead of silently comparing against a different number.
 */
export function compareModelToMeasurement(db, projectId, runId, { observationId, comparedBy = null } = {}) {
  return inWriteTransaction(db, () => {
    const loaded = loadRun(db, projectId, runId);
    if (!loaded.ok) return loaded;
    const events = loaded.run.researchState.events;
    const observation = observationOf(events, observationId);
    if (!observation) return fail('OBSERVATION_NOT_FOUND');
    if (!accepted(events, observationId)) return fail('OBSERVATION_NOT_ACCEPTED');
    const request = requestOf(events, observation.requestId);
    const binding = request.modelBinding;
    const x = loaded.run.experiments.find((e) => e.experimentId === request.experimentId);
    const stored = finite(x?.execution?.output?.[binding.outputKey]);
    const scienceRun = binding.scienceRunId ? getScienceRun(db, binding.scienceRunId) : null;
    if (stored !== binding.modelValue || x?.execution?.outputHash !== binding.outputHash || (scienceRun && finite(scienceRun.outputs?.[binding.outputKey]) !== binding.modelValue)) {
      return fail('MODEL_VALUE_CHANGED', 'the stored model output no longer equals the value frozen in the request');
    }
    const observed = finite(observation.value);
    if (observed === null) return fail('NON_NUMERIC_COMPARISON_NOT_SUPPORTED');
    if (observation.unit !== binding.unit) return fail('UNIT_MISMATCH', null, { modelUnit: binding.unit, observationUnit: observation.unit });
    const deltaAbs = Math.abs(observed - binding.modelValue);
    const deltaRel = deltaAbs / Math.max(Math.abs(binding.modelValue), Math.abs(observed), Number.EPSILON);
    const checks = toleranceChecks(deltaAbs, deltaRel, request.endpoint.tolerance);
    if (checks.length === 0) return fail('EXPLICIT_TOLERANCE_REQUIRED');
    const verdict = checks.every((c) => c.pass) ? 'AGREES_WITHIN_TOLERANCE' : 'DISAGREES_OUTSIDE_TOLERANCE';
    const comparisonFingerprint = fp16({ v: LAB_LOOP_VERSION, requestId: request.requestId, observationId, modelValue: binding.modelValue, observedValue: observed, unit: binding.unit, checks });
    const comparisonId = `LABCMP-${comparisonFingerprint}`;
    const existing = labEvents(events, LAB_EVENT_TYPES.COMPARISON).find((e) => e.payload.comparison?.comparisonId === comparisonId);
    if (existing) return { ok: true, deduped: true, comparison: existing.payload.comparison };
    const comparison = {
      comparisonId, comparisonFingerprint, requestId: request.requestId, observationId, experimentId: request.experimentId, endpointId: request.endpoint.endpointId, outputKey: binding.outputKey,
      model: { label: LAB_LABELS.model, value: binding.modelValue, outputHash: binding.outputHash }, measurement: { label: LAB_LABELS.measurement, value: observed, observationId },
      unit: binding.unit, delta: observed - binding.modelValue, deltaAbs, deltaRel, toleranceChecks: checks, verdict,
      comparedBy: text(comparedBy, 160) || null, clinicalEfficacy: LAB_LABELS.unknown, claimBoundary: LAB_CLAIM_BOUNDARY,
    };
    const appended = append(db, runId, LAB_EVENT_TYPES.COMPARISON, { experimentId: request.experimentId, comparison });
    return appended.ok ? { ok: true, deduped: false, comparison, seq: appended.event.seq } : appended;
  });
}

/** The reviewed measurement as a PROPOSAL on the canonical ledger. Publication stays a human act. */
export function proposeLabEvidence(db, projectId, runId, { observationId, proposeEvidence = proposeStructuredEvidence } = {}) {
  const loaded = loadRun(db, projectId, runId);
  if (!loaded.ok) return loaded;
  const events = loaded.run.researchState.events;
  const observation = observationOf(events, observationId);
  if (!observation) return fail('OBSERVATION_NOT_FOUND');
  const review = latestReviewOf(events, observationId);
  if (review?.verdict !== 'ACCEPTED_AS_OBSERVATION') return fail('OBSERVATION_NOT_ACCEPTED');
  const prior = labEvents(events, LAB_EVENT_TYPES.EVIDENCE).find((e) => e.payload.link?.observationId === observationId);
  if (prior) return { ok: true, deduped: true, link: prior.payload.link };
  const bridge = buildLabObservationEvidenceInput({ observation, review });
  if (!bridge.ok) return fail('EVIDENCE_BRIDGE_VALIDATION_FAILED', bridge.error);
  // The ledger is its own store and proposing the same content returns the same proposal, so a crash before the append is harmless.
  const proposed = proposeEvidence(bridge.input);
  if (!proposed.ok) return fail('EVIDENCE_PROPOSAL_FAILED', proposed.error);
  return inWriteTransaction(db, () => {
    const now = loadRun(db, projectId, runId);
    if (!now.ok) return now;
    const again = labEvents(now.run.researchState.events, LAB_EVENT_TYPES.EVIDENCE).find((e) => e.payload.link?.observationId === observationId);
    if (again) return { ok: true, deduped: true, link: again.payload.link };
    const link = { observationId, requestId: observation.requestId, proposalId: proposed.proposalId, evidenceContentHash: proposed.record?.contentHash ?? null, mode: 'PROPOSE_ONLY', status: 'PENDING_HUMAN_PUBLICATION', evidenceClass: LAB_LABELS.measurement, boundary: bridge.boundary };
    const appended = append(db, runId, LAB_EVENT_TYPES.EVIDENCE, { link });
    return appended.ok ? { ok: true, deduped: false, link, seq: appended.event.seq } : appended;
  });
}

/* ---------------- read ---------------- */

/** Everything the lab loop of one run knows, rebuilt from the chain. The next action is the existing campaign rule. */
export function readLabLoop(db, projectId, runId) {
  const loaded = loadRun(db, projectId, runId);
  if (!loaded.ok) return loaded;
  const events = loaded.run.researchState.events;
  const requests = labEvents(events, LAB_EVENT_TYPES.REQUEST).map((e) => e.payload.request);
  const observations = labEvents(events, LAB_EVENT_TYPES.OBSERVATION).map((e) => ({ ...e.payload.observation, review: latestReviewOf(events, e.payload.observation.observationId) }));
  const comparisons = labEvents(events, LAB_EVENT_TYPES.COMPARISON).map((e) => e.payload.comparison);
  const evidenceLinks = labEvents(events, LAB_EVENT_TYPES.EVIDENCE).map((e) => e.payload.link);
  const next = deriveNextResearchAction({
    requests,
    observations: observations.map((o) => ({ event: { payload: o }, latestReview: o.review ? { payload: o.review } : null })),
    comparisons: comparisons.map((c) => ({ payload: c })),
  });
  return {
    ok: true,
    lab: {
      researchRunId: runId, labLoopVersion: LAB_LOOP_VERSION, requests, observations, comparisons, evidenceLinks,
      nextResearchAction: next, clinicalEfficacy: LAB_LABELS.unknown, claimBoundary: LAB_CLAIM_BOUNDARY,
      labFingerprint: sha256Hex(canonicalJson({ requests: requests.map((r) => r.requestId), observations: observations.map((o) => [o.observationId, o.review?.verdict ?? null]), comparisons: comparisons.map((c) => c.comparisonId), evidence: evidenceLinks.map((l) => l.proposalId) })),
    },
  };
}
