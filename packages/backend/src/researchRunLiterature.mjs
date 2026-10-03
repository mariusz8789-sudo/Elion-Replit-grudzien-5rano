/**
 * Literature inside the canonical ResearchRun: retrieval, source custody, citation catalog and offline replay.
 *
 * One KNOWLEDGE_SNAPSHOT event per retrieval in the run's hash chain. Since snapshot@2 the event also names
 * every raw HTTP response body the connectors read (sha256, size, provider, request URL); the bytes are kept
 * in research_source_records (sourceRecordStore.mjs) in the SAME transaction as the event, so a snapshot and
 * its raw responses land together or not at all. Each source carries its identifiers (DOI / PMID / PMCID),
 * the retrieval time and the SHA-256 of its own record as fetched (provenance.recordHash).
 *
 * Replay (LITERATURE_REPLAYED) re-runs the canonical connectors against the stored bodies only, with the
 * original retrieval time and no network, and compares the result fingerprint: MATCH or DRIFT. A stored body
 * that no longer hashes to its key is TAMPERED and nothing is replayed from it.
 *
 * Retrieved metadata stays NOT_EVIDENCE. A host that cannot be reached gives BLOCKED with the connector's
 * reason; the blocked attempt is recorded, never deduplicated into a permanent answer, and never replaced
 * by any other source.
 */
import { appendServerResearchStateEvent } from './agentRun.mjs';
import { canonicalJson, fnv1a } from './determinism.mjs';
import { createResearchRunLiteraturePort } from './literature/researchRunLiteraturePort.mjs';
import { canonicalHash } from './provenance.mjs';
import { getResearchRun, inWriteTransaction, RESEARCH_RUN_CONTRACT_VERSION } from './researchRun.mjs';
import { snapshotIdOf } from './literature/runCitations.mjs';
import { putSourceRecord, readSourceRecord, SOURCE_RECORD_KIND, SOURCE_RECORD_STATUS } from './sourceRecordStore.mjs';

export { hypothesisLiteratureOf, literatureCatalogOf, snapshotIdOf } from './literature/runCitations.mjs';

export const RESEARCH_RUN_LITERATURE_SNAPSHOT_VERSION = 'research-run-literature-snapshot@2';
export const LITERATURE_REPLAY_VERSION = 'research-run-literature-replay@1';
export const LITERATURE_REPLAY_VERDICT = Object.freeze({ MATCH: 'MATCH', DRIFT: 'DRIFT', TAMPERED: 'TAMPERED' });
const STR = (value, max) => typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;

function boundedLimit(value) {
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 10;
}

function snapshotResult(result) {
  return {
    intent: result.intent,
    status: result.status,
    query: result.query ?? null,
    sources: Array.isArray(result.sources) ? result.sources : [],
    links: Array.isArray(result.links) ? result.links : [],
    support: Array.isArray(result.support) ? result.support : [],
    contradictions: Array.isArray(result.contradictions) ? result.contradictions : [],
    missingEvidence: Array.isArray(result.missingEvidence) ? result.missingEvidence : [],
    accessBlockers: Array.isArray(result.accessBlockers) ? result.accessBlockers : [],
  };
}

/**
 * The deterministic part of a retrieval: what the connectors made of the bytes. Claim-to-source links are
 * left out on purpose: an optional linker is a model proposal, not a function of the stored responses.
 */
export function literatureResultFingerprint(primary, contradictionSearch) {
  const part = (r) => ({ status: r.status, sources: r.sources, accessBlockers: r.accessBlockers.filter((b) => b.sourceProvider !== 'CLAIM_EVIDENCE_LINKER') });
  return canonicalHash({ primary: part(primary), contradictionSearch: part(contradictionSearch) });
}

function rawResponseRefs(sink) {
  const unique = new Map();
  for (const r of sink) {
    const key = `${r.requestUrl}|${r.sha256}`;
    if (!unique.has(key)) unique.set(key, r);
  }
  return [...unique.values()]
    .map((r) => ({
      artifactId: `artifact:${r.sha256}`, sha256: r.sha256, bytes: r.bytes, provider: r.provider,
      requestUrl: r.requestUrl, finalUrl: r.finalUrl ?? r.requestUrl, responseStatus: r.responseStatus, mediaType: 'application/json',
    }))
    .sort((a, b) => (a.requestUrl < b.requestUrl ? -1 : a.requestUrl > b.requestUrl ? 1 : a.sha256 < b.sha256 ? -1 : 1));
}

function blockedReason(primary, contradictionSearch) {
  const blockers = [...primary.accessBlockers, ...contradictionSearch.accessBlockers];
  return blockers.length ? [...new Set(blockers.map((b) => `${b.sourceProvider}:${b.failureCode ?? b.status}`))].join(', ') : null;
}

export async function retrieveResearchRunLiterature(db, projectId, runId, input = {}, dependencies = {}) {
  const before = getResearchRun(db, projectId, runId);
  if (!before) return { ok: false, status: 'NOT_FOUND' };
  if (!before.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
  if (before.run.status !== 'RUNNING') return { ok: false, status: 'RUN_NOT_RETRIEVABLE', reason: before.run.status };

  const claim = STR(input.claim, 4_000) ?? before.question;
  const query = STR(input.query, 1_000) ?? claim;
  const contradictionQuery = STR(input.contradictionQuery, 1_000);
  const limit = boundedLimit(input.limit);
  const claimId = STR(input.claimId, 300) ?? `literature-claim-${fnv1a(canonicalJson({ runId, claim }))}`;
  const requestFingerprint = fnv1a(canonicalJson({ runId, claimId, claim, query, contradictionQuery, limit }));
  // A BLOCKED attempt is history, not an answer: the same request may be retried once the host is reachable.
  const answered = (snapshots) => snapshots.find((snapshot) => snapshot.requestFingerprint === requestFingerprint && snapshot.status !== 'BLOCKED');
  const existing = answered(before.literatureSnapshots);
  if (existing) return { ok: true, status: existing.status, deduped: true, snapshot: existing, researchRun: before };

  const port = dependencies.port ?? createResearchRunLiteraturePort();
  if (!port?.findForClaim || !port?.findContradictionsForClaim) {
    return { ok: false, status: 'LITERATURE_PORT_NOT_CONFIGURED' };
  }
  // One retrieval time for the whole step, so a replay can reproduce every timestamp the connectors wrote.
  const retrievedAt = (dependencies.options?.now ?? dependencies.now ?? (() => new Date()))().toISOString();
  const sink = [];
  const options = { ...(dependencies.options ?? {}), now: () => new Date(retrievedAt), rawResponseSink: (record) => sink.push(record) };
  const request = { researchRunId: runId, claimId, claim, query, limit };
  const [primary, contradictionSearch] = await Promise.all([
    port.findForClaim(request, options),
    port.findContradictionsForClaim({ ...request, query: contradictionQuery }, options),
  ]);
  const primarySnapshot = snapshotResult(primary);
  const contradictionSnapshot = snapshotResult(contradictionSearch);
  const sourceCount = new Set([...primarySnapshot.sources, ...contradictionSnapshot.sources].map((source) => source.sourceId)).size;
  const status = sourceCount > 0 ? 'METADATA_RETRIEVED'
    : [...primarySnapshot.accessBlockers, ...contradictionSnapshot.accessBlockers].length > 0 ? 'BLOCKED' : 'NOT_FOUND';
  const rawResponses = rawResponseRefs(sink);
  const bodies = new Map(sink.map((r) => [r.sha256, r.body]));
  const payloadOf = (attempt) => ({
    contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
    snapshotVersion: RESEARCH_RUN_LITERATURE_SNAPSHOT_VERSION,
    snapshotId: `lit-${requestFingerprint}${attempt ? `-${attempt}` : ''}`,
    researchRunId: runId,
    claimId,
    claim,
    query,
    contradictionQuery: contradictionSnapshot.query,
    limit,
    requestFingerprint,
    retrievedAt,
    status,
    blockedReason: status === 'BLOCKED' ? blockedReason(primarySnapshot, contradictionSnapshot) : null,
    epistemicStatus: 'NOT_EVIDENCE',
    sourceCount,
    primary: primarySnapshot,
    contradictionSearch: contradictionSnapshot,
    rawResponses,
    resultFingerprint: literatureResultFingerprint(primarySnapshot, contradictionSnapshot),
    replay: rawResponses.length > 0
      ? { mode: 'OFFLINE_FROM_STORED_RAW_RESPONSES', portVersion: port.contractVersion ?? null }
      : { mode: 'NOT_REPLAYABLE', reason: 'NO_RAW_RESPONSE_CAPTURED' },
  });

  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current || !current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    if (current.run.status !== 'RUNNING') return { ok: false, status: 'RUN_NOT_RETRIEVABLE', reason: current.run.status };
    const duplicate = answered(current.literatureSnapshots);
    if (duplicate) return { ok: true, status: duplicate.status, deduped: true, snapshot: duplicate, researchRun: current };
    for (const ref of rawResponses) {
      const stored = putSourceRecord(db, { kind: SOURCE_RECORD_KIND.LITERATURE_RESPONSE, mediaType: ref.mediaType, body: bodies.get(ref.sha256) });
      if (stored.sha256 !== ref.sha256) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: 'raw_response_hash_mismatch' };
      if (readSourceRecord(db, ref.sha256).status !== SOURCE_RECORD_STATUS.INTACT) return { ok: false, status: 'SOURCE_RECORD_TAMPERED', reason: ref.sha256 };
    }
    const attempt = current.literatureSnapshots.filter((snapshot) => snapshot.requestFingerprint === requestFingerprint).length;
    const appended = appendServerResearchStateEvent(db, runId, 'KNOWLEDGE_SNAPSHOT', payloadOf(attempt), dependencies.at);
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    const researchRun = getResearchRun(db, projectId, runId);
    return { ok: true, status, deduped: false, snapshot: researchRun.literatureSnapshots.at(-1), researchRun };
  });
}

/* ---------------- offline replay ---------------- */

function replayFetch(stored) {
  const byUrl = new Map(stored.map((r) => [r.requestUrl, r]));
  const unrecorded = [];
  const fetchImpl = async (url) => {
    const key = url.toString();
    const record = byUrl.get(key);
    if (!record) {
      unrecorded.push(key);
      throw new Error('LITERATURE_REPLAY_REQUEST_NOT_RECORDED');
    }
    return {
      status: record.responseStatus,
      ok: record.responseStatus >= 200 && record.responseStatus < 300,
      headers: { get: () => null },
      text: async () => record.body,
    };
  };
  return { fetchImpl, unrecorded };
}

export function literatureReplaysOf(researchState) {
  return (researchState?.events ?? []).filter((e) => e.type === 'LITERATURE_REPLAYED').map((e) => ({ ...e.payload, eventSeq: e.seq }));
}

/** Verifies every raw response a snapshot names. Returns { ok, records, failures }. */
export function verifySnapshotRawResponses(db, snapshot) {
  const records = [];
  const failures = [];
  for (const ref of snapshot.rawResponses ?? []) {
    const read = readSourceRecord(db, ref.sha256);
    if (read.status !== SOURCE_RECORD_STATUS.INTACT || read.bytes !== ref.bytes) {
      failures.push({ sha256: ref.sha256, requestUrl: ref.requestUrl, status: read.status === SOURCE_RECORD_STATUS.INTACT ? SOURCE_RECORD_STATUS.TAMPERED : read.status });
      continue;
    }
    records.push({ ...ref, body: read.body.toString('utf8') });
  }
  return { ok: failures.length === 0, records, failures };
}

/**
 * Replays one literature step from its stored raw responses: no network, the original retrieval time,
 * the canonical connectors. The verdict is appended to the chain when the run can still take events.
 */
export async function replayResearchRunLiterature(db, projectId, runId, snapshotId, dependencies = {}) {
  const before = getResearchRun(db, projectId, runId);
  if (!before) return { ok: false, status: 'NOT_FOUND' };
  if (!before.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
  const snapshot = before.literatureSnapshots.find((s) => snapshotIdOf(s) === snapshotId);
  if (!snapshot) return { ok: false, status: 'SNAPSHOT_NOT_FOUND' };
  if (!Array.isArray(snapshot.rawResponses) || snapshot.rawResponses.length === 0 || !snapshot.resultFingerprint) {
    return { ok: false, status: 'SNAPSHOT_NOT_REPLAYABLE', reason: snapshot.replay?.reason ?? 'NO_RAW_RESPONSE_CAPTURED' };
  }
  const verified = verifySnapshotRawResponses(db, snapshot);
  let replay;
  if (!verified.ok) {
    replay = {
      verdict: LITERATURE_REPLAY_VERDICT.TAMPERED,
      originalResultFingerprint: snapshot.resultFingerprint,
      replayResultFingerprint: null,
      sourceRecordFailures: verified.failures,
      unrecordedRequests: [],
    };
  } else {
    const { fetchImpl, unrecorded } = replayFetch(verified.records);
    const port = dependencies.replayPort ?? createResearchRunLiteraturePort();
    const options = { fetchImpl, now: () => new Date(snapshot.retrievedAt), timeoutMs: 1_000 };
    const request = { researchRunId: runId, claimId: snapshot.claimId, claim: snapshot.claim, query: snapshot.query, limit: snapshot.limit };
    const [primary, contradictionSearch] = await Promise.all([
      port.findForClaim(request, options),
      port.findContradictionsForClaim({ ...request, query: snapshot.contradictionQuery }, options),
    ]);
    const replayResultFingerprint = literatureResultFingerprint(snapshotResult(primary), snapshotResult(contradictionSearch));
    replay = {
      verdict: replayResultFingerprint === snapshot.resultFingerprint ? LITERATURE_REPLAY_VERDICT.MATCH : LITERATURE_REPLAY_VERDICT.DRIFT,
      originalResultFingerprint: snapshot.resultFingerprint,
      replayResultFingerprint,
      sourceRecordFailures: [],
      unrecordedRequests: [...new Set(unrecorded)].sort(),
    };
  }
  const payload = {
    contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
    replayVersion: LITERATURE_REPLAY_VERSION,
    researchRunId: runId,
    snapshotId,
    rawResponseHashes: snapshot.rawResponses.map((r) => r.sha256),
    network: 'NONE',
    ...replay,
    epistemicStatus: 'NOT_EVIDENCE',
  };
  if (before.run.status !== 'RUNNING') return { ok: true, status: payload.verdict, recorded: false, replay: payload };
  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current || !current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    const appended = appendServerResearchStateEvent(db, runId, 'LITERATURE_REPLAYED', payload, dependencies.at);
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    return { ok: true, status: payload.verdict, recorded: true, replay: payload, researchRun: getResearchRun(db, projectId, runId) };
  });
}
