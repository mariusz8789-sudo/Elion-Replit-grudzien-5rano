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
import {
  EvidenceLedger, ProposeOnlyLearner, OmniIngestionController, SourcePolicyRegistry,
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
    const res = await this.fetchImpl(url, { headers: opts?.headers ?? {}, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) { const e = new Error('HTTP_' + res.status); e.status = res.status; throw e; }
    return { status: res.status, headers: {}, body: body.slice(0, 200_000) };
  }
}

/** One process-wide ledger: proposals live here until a human publishes or rejects them. Not persisted (yet). */
const clock = { now: () => Date.now() };
const ledger = new EvidenceLedger(clock);
const learner = new ProposeOnlyLearner(clock, ledger);
const registry = new SourcePolicyRegistry();

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
