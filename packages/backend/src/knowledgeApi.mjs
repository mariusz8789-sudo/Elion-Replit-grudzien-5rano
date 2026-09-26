/* global AbortSignal */
/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * KNOWLEDGE INGESTION API — the server side of the Science Chat command `/ingest <url>`.
 *
 * Runs the Omni-Ingestion controller (packages/core/src/knowledge/ingestion, bundled into
 * compute/knowledge-core.mjs) and hands every fetched item to the propose-only learner. Nothing
 * becomes an active evidence record here: ingestion creates PROPOSALS; publishing one requires an
 * authenticated human (`POST /api/knowledge/proposals/:id/publish`).
 *
 * Server policy is STRICTER than the controller's: a plain-web URL is fetched only when its domain is
 * `legalStatus: 'VERIFIED'` in the source-policy registry (an allowlist), private/loopback hosts are
 * refused before any network call, at most 5 URLs per request, 8 s per fetch, redirects not followed.
 * Platform adapters (YouTube / X / Facebook) use official APIs with keys from the environment only
 * (YOUTUBE_API_KEY, X_API_KEY, FACEBOOK_API_KEY); without a key they report REQUIRES_OFFICIAL_API.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EvidenceLedger, ProposeOnlyLearner, OmniIngestionController, SourcePolicyRegistry, openPersistentLedger,
  YouTubeOfficialApiAdapter, PublicWebAdapter, SocialOfficialApiAdapter, envKeyProvider, KEY_ENV_NAMES, realSleeper, originOf,
} from './compute/knowledge-core.mjs';

const MAX_URLS = 5;
const FETCH_TIMEOUT_MS = 8000;
const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

export function isFetchableUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  return !PRIVATE_HOST.test(u.hostname);
}

class FetchTransport {
  constructor(fetchImpl) { this.fetchImpl = fetchImpl; }
  async fetch(url, opts) {
    const res = await this.fetchImpl(url, { method: opts?.method ?? 'GET', headers: opts?.headers ?? {}, ...(opts?.body !== undefined ? { body: opts.body } : {}), redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) { const e = new Error('HTTP_' + res.status); e.status = res.status; throw e; }
    return { status: res.status, headers: {}, body: body.slice(0, 200_000) };
  }
}

/** One process-wide ledger: proposals live here until a human publishes or rejects them. In-memory until the server
 *  opens persistence (`openKnowledgeLedgerPersistence`, called once at boot with GENESIS_LEDGER_PATH — a JSON snapshot
 *  beside genesis.db, rewritten atomically after every appended entry; a snapshot whose hash chain does not verify is
 *  REJECTED and left in place, the process runs in memory and says so). */
const clock = { now: () => Date.now() };
let ledger = new EvidenceLedger(clock);
let learner = new ProposeOnlyLearner(clock, ledger);
const registry = new SourcePolicyRegistry();
let persistence = { status: 'IN_MEMORY', path: null, entries: 0, reason: null };

/** File-backed snapshot store on the data directory (the same place as genesis.db); atomic rename on save. */
export function fileLedgerSnapshotStore(filePath) {
  return {
    load() { if (!existsSync(filePath)) return null; return JSON.parse(readFileSync(filePath, 'utf8')); },
    save(snapshot) { const dir = path.dirname(filePath); if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); const tmp = `${filePath}.tmp`; writeFileSync(tmp, JSON.stringify(snapshot)); renameSync(tmp, filePath); return true; },
  };
}

/** Restore the process ledger from `filePath` and keep persisting to it. `':memory:'` keeps the in-memory ledger (tests, ephemeral deployments). */
export function openKnowledgeLedgerPersistence(filePath) {
  if (!filePath || filePath === ':memory:') { persistence = { status: 'IN_MEMORY', path: null, entries: ledger.getEntries().length, reason: null }; return persistence; }
  const errors = [];
  const r = openPersistentLedger(clock, fileLedgerSnapshotStore(filePath), (reason) => errors.push(reason));
  ledger = r.ledger; learner = new ProposeOnlyLearner(clock, ledger);
  persistence = { status: r.status === 'REJECTED' ? 'REJECTED_IN_MEMORY' : r.status === 'RESTORED' ? 'RESTORED' : 'PERSISTING_NEW', path: filePath, entries: r.entries, reason: errors[0] ?? null };
  return persistence;
}

export function knowledgeLedgerPersistenceStatus() { return { ...persistence, ledgerOk: ledger.verifyLedger().ok, activeRecords: ledger.getActive().length, entries: ledger.getEntries().length }; }

function buildController(deps) {
  const transport = deps.transport ?? new FetchTransport(deps.fetchImpl ?? globalThis.fetch);
  const sleeper = deps.sleeper ?? realSleeper;
  const env = deps.env ?? process.env;
  const guardedWeb = { ingest: async (url) => (registry.isLegalCleared(originOf(url)) ? new PublicWebAdapter(clock, transport, sleeper).ingest(url) : { ok: false, error: 'LEGAL_GATE_PENDING', items: [] }) };
  return new OmniIngestionController(clock, registry, {
    YOUTUBE: new YouTubeOfficialApiAdapter(clock, transport, sleeper, envKeyProvider(env, KEY_ENV_NAMES.YOUTUBE)),
    X: new SocialOfficialApiAdapter('X', clock, transport, sleeper, envKeyProvider(env, KEY_ENV_NAMES.X)),
    FACEBOOK: new SocialOfficialApiAdapter('FACEBOOK', clock, transport, sleeper, envKeyProvider(env, KEY_ENV_NAMES.FACEBOOK)),
    TELEGRAM: new SocialOfficialApiAdapter('TELEGRAM', clock, transport, sleeper, envKeyProvider(env, 'TELEGRAM_BOT_TOKEN_UNSUPPORTED')),
    WEB: guardedWeb,
  });
}

export async function runIngest(body, deps = {}) {
  const urls = Array.isArray(body?.urls) ? body.urls.filter((u) => typeof u === 'string').slice(0, MAX_URLS) : [];
  if (urls.length === 0) return { ok: false, error: 'invalid_request' };
  const refused = urls.filter((u) => !isFetchableUrl(u)).map((url) => ({ url, reason: 'REFUSED_UNSAFE_URL' }));
  const fetchable = urls.filter(isFetchableUrl);
  const report = fetchable.length > 0 ? await buildController(deps).ingest(fetchable) : { fetched: [], skipped: [], batchFingerprint: null, at: clock.now() };
  const proposalIds = report.fetched.length > 0 ? learner.runBatch({ sourceId: 'science-chat', fetch: () => report.fetched }) : [];
  return {
    ok: true,
    mode: 'PROPOSE_ONLY',
    fetched: report.fetched.length,
    skipped: [...refused, ...report.skipped],
    proposalIds,
    proposals: proposalIds.map((id) => { const p = ledger.getProposals().find((x) => x.proposalId === id); return p ? { proposalId: id, claim: p.record.claim, status: p.record.status, sourceKind: p.record.provenance.sourceKind, sourceUrl: p.record.sourceUrl } : { proposalId: id }; }),
    pendingProposals: ledger.getProposals().filter((p) => p.status === 'pending').length,
    activeRecords: ledger.getActive().length,
    batchFingerprint: report.batchFingerprint,
    disclaimer: 'Ingested claims are proposals with an explicit status; nothing is published without a human approver, and nothing here feeds the clinical channel or the Winner Gate.',
  };
}

export function listProposals() {
  return { ok: true, proposals: ledger.getProposals().map((p) => ({ proposalId: p.proposalId, status: p.status, approverId: p.approverId, claim: p.record.claim, recordStatus: p.record.status, sourceKind: p.record.provenance.sourceKind, sourceUrl: p.record.sourceUrl, contentHash: p.record.contentHash })), activeRecords: ledger.getActive().length, ledgerVersion: ledger.getVersion(), ledgerOk: ledger.verifyLedger().ok };
}

export function publishProposal(proposalId, approverId) {
  const rec = ledger.publish(proposalId, approverId);
  return rec ? { ok: true, published: { id: rec.id, claim: rec.claim, status: rec.status, contentHash: rec.contentHash }, activeRecords: ledger.getActive().length, ledgerOk: ledger.verifyLedger().ok } : { ok: false, error: 'not_pending' };
}

export function rejectProposal(proposalId, approverId) {
  return ledger.rejectProposal(proposalId, approverId) ? { ok: true } : { ok: false, error: 'not_pending' };
}

/**
 * Structured-evidence entry point for an already-ingested, human-reviewed
 * artifact (e.g. an external lab observation, via `campaign/labEvidenceBridge.mjs`).
 *
 * Reuses the SAME process-wide canonical `ledger` every other proposal helper
 * in this file uses — no second EvidenceLedger — and remains propose-only:
 * publication stays the existing human `publishProposal`/`rejectProposal` flow.
 */
export function proposeStructuredEvidence(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_evidence_input' };
  const allowedClaimTypes = new Set(['observation', 'reported_claim', 'hypothesis', 'model', 'conclusion']);
  const allowedSourceKinds = new Set(['video', 'document', 'peer_reviewed', 'archive', 'dataset', 'web']);
  if (!allowedClaimTypes.has(input.claimType)) return { ok: false, error: 'invalid_claim_type' };
  if (!allowedSourceKinds.has(input.provenance?.sourceKind)) return { ok: false, error: 'invalid_source_kind' };
  if (typeof input.sourceUrl !== 'string' || !input.sourceUrl.trim()) return { ok: false, error: 'source_url_required' };
  if (typeof input.claim !== 'string' || !input.claim.trim()) return { ok: false, error: 'claim_required' };
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence)) return { ok: false, error: 'confidence_required' };
  if (typeof input.sourceTimestamp !== 'string' || !Number.isFinite(Date.parse(input.sourceTimestamp))) {
    return { ok: false, error: 'valid_source_timestamp_required' };
  }
  if (!Array.isArray(input.provenance?.independentSourceIds)
    || !input.provenance.independentSourceIds.some((id) => typeof id === 'string' && id.trim())) {
    return { ok: false, error: 'independent_source_id_required' };
  }

  const normalized = {
    sourceUrl: input.sourceUrl.trim().slice(0, 2000),
    sourceTimestamp: typeof input.sourceTimestamp === 'string' ? input.sourceTimestamp : null,
    claim: input.claim.trim().slice(0, 5000),
    claimType: input.claimType,
    confidence: Math.min(1, Math.max(0, input.confidence)),
    provenance: {
      sourceKind: input.provenance.sourceKind,
      ...(typeof input.provenance.author === 'string' && input.provenance.author.trim()
        ? { author: input.provenance.author.trim().slice(0, 500) }
        : {}),
      retrievedBy: String(input.provenance.retrievedBy ?? 'genesis-structured-evidence').slice(0, 500),
      independentSourceIds: Array.isArray(input.provenance.independentSourceIds)
        ? input.provenance.independentSourceIds.filter((id) => typeof id === 'string' && id.trim()).slice(0, 64)
        : [],
    },
  };

  const contentHash = ledger.contentHashOf(normalized);
  const existing = ledger.getProposals().find(
    (entry) => entry.record.contentHash === contentHash && (entry.status === 'pending' || entry.status === 'approved'),
  );
  const proposalId = existing?.proposalId ?? ledger.propose(normalized);
  const proposal = existing ?? ledger.getProposals().find((entry) => entry.proposalId === proposalId);
  return {
    ok: true,
    mode: 'PROPOSE_ONLY',
    proposalId,
    deduped: Boolean(existing),
    record: proposal ? {
      id: proposal.record.id,
      status: proposal.record.status,
      contentHash: proposal.record.contentHash,
      claimType: proposal.record.claimType,
      sourceKind: proposal.record.provenance.sourceKind,
    } : null,
    ledgerOk: ledger.verifyLedger().ok,
  };
}
