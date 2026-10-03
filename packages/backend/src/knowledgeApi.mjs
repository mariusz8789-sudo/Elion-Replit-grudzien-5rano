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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EvidenceLedger, ProposeOnlyLearner, OmniIngestionController, SourcePolicyRegistry, openPersistentLedger, restoreLedger,
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

/**
 * One process-wide ledger: proposals live here until a human publishes or rejects them.
 *
 * Durable form (`openKnowledgeLedgerPersistence(path, { db })`, called once at boot by server.mjs):
 *  - with a database (the same genesis.db the run state uses): SQLite is the source of truth. Every mutation runs
 *    under `BEGIN IMMEDIATE` (the database write lock, shared by every process on the file): the in-memory ledger is
 *    first brought up to the database head, the mutation is applied, and its entries are inserted into the
 *    append-only `evidence_ledger_entries` table (schema V16; contiguity and prev-hash linkage are also enforced by a
 *    trigger) before COMMIT. Two processes therefore never append on a stale head and never overwrite each other.
 *    Reads catch up with entries other processes appended. A legacy JSON snapshot found beside the DB is imported
 *    once (same entries, same hashes) when the table is empty. The JSON file stays as an EXPORT, rewritten inside
 *    the write transaction (so in database order); it is never read back while the database holds entries.
 *  - without a database: the legacy single-process JSON snapshot (rewritten atomically after every entry).
 *  - `':memory:'`: in-memory only.
 * A snapshot or a database chain that does not verify is REJECTED and left in place; the process runs in memory and
 * says so (`REJECTED_IN_MEMORY`).
 */
const clock = { now: () => Date.now() };
let ledger = new EvidenceLedger(clock);
const registry = new SourcePolicyRegistry();
let persistence = { status: 'IN_MEMORY', store: 'MEMORY', path: null, entries: 0, reason: null };
/** Set only while SQLite is the source of truth: `{ db, exportPath, loadedCount, loadedHead }`. */
let sqlite = null;

/** File-backed snapshot store on the data directory (the same place as genesis.db); atomic rename on save. */
export function fileLedgerSnapshotStore(filePath) {
  return {
    load() { if (!existsSync(filePath)) return null; return JSON.parse(readFileSync(filePath, 'utf8')); },
    save(snapshot) { const dir = path.dirname(filePath); if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); const tmp = `${filePath}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(snapshot)); renameSync(tmp, filePath); return true; },
  };
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const ledgerRejected = (reason) => new Error(`LEDGER_STATE_REJECTED: ${reason}`);
const INSERT_ENTRY = 'INSERT INTO evidence_ledger_entries (idx, kind, record_id, content_hash, prev_hash, hash, entry_json, effect_json, writer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

/** Head of the database chain: `{ count, hash }` (hash null when empty). */
function dbHead(db) {
  const row = db.prepare('SELECT idx, hash FROM evidence_ledger_entries ORDER BY idx DESC LIMIT 1').get();
  return row ? { count: row.idx + 1, hash: row.hash } : { count: 0, hash: null };
}

/**
 * Rebuild the ledger from the database: the imported base state (if any), then every entry's effect replayed in
 * order. Every row is checked against its own entry JSON and every effect against its entry, and the result goes
 * through `EvidenceLedger.fromSnapshot`, which re-verifies the whole hash chain. Throws `LEDGER_STATE_REJECTED: …`.
 */
function loadLedgerFromDb(db) {
  const rows = db.prepare('SELECT * FROM evidence_ledger_entries ORDER BY idx').all();
  const base = db.prepare('SELECT * FROM evidence_ledger_base WHERE id = 1').get();
  let version = 1;
  const records = new Map(); const byHash = new Map(); const proposals = new Map(); let activeIds = [];
  const baseCount = base ? base.head_count : 0;
  if (base) {
    let state;
    try { state = JSON.parse(base.state_json); } catch { throw ledgerRejected('BASE_STATE_UNREADABLE'); }
    version = state.version;
    for (const r of state.records ?? []) { records.set(r.id, r); byHash.set(r.contentHash, r); }
    for (const p of state.proposals ?? []) proposals.set(p.proposalId, p);
    activeIds = [...(state.activeIds ?? [])];
    if (rows.length < baseCount) throw ledgerRejected(`BASE_AHEAD_OF_ENTRIES@${rows.length}`);
  }
  const probe = new EvidenceLedger(clock);
  const checkRecord = (rec, entry) => {
    if (!rec || rec.id !== entry.recordId || rec.contentHash !== entry.contentHash || probe.contentHashOf(rec) !== rec.contentHash) throw ledgerRejected(`EFFECT_RECORD_MISMATCH@${entry.index}`);
  };
  const entries = [];
  for (const row of rows) {
    let entry;
    try { entry = JSON.parse(row.entry_json); } catch { throw ledgerRejected(`ENTRY_UNREADABLE@${row.idx}`); }
    if (entry?.index !== row.idx || entry.kind !== row.kind || entry.hash !== row.hash || entry.prevHash !== row.prev_hash || entry.recordId !== row.record_id || entry.contentHash !== row.content_hash) throw ledgerRejected(`ROW_ENTRY_MISMATCH@${row.idx}`);
    entries.push(entry);
    if (row.idx < baseCount) { if (row.effect_json !== null) throw ledgerRejected(`EFFECT_ON_IMPORTED_ENTRY@${row.idx}`); continue; }
    let effect = null;
    try { effect = JSON.parse(row.effect_json); } catch { /* reported below */ }
    if (!effect) throw ledgerRejected(`EFFECT_MISSING@${row.idx}`);
    if (entry.kind === 'ADD') {
      checkRecord(effect.record, entry);
      if (byHash.has(entry.contentHash)) throw ledgerRejected(`DUPLICATE_ADD@${row.idx}`);
      records.set(effect.record.id, effect.record); byHash.set(entry.contentHash, effect.record); activeIds.push(effect.record.id);
    } else if (entry.kind === 'PROPOSE') {
      const p = effect.proposal;
      checkRecord(p?.record, entry);
      if (p.status !== 'pending' || p.approverId !== null || proposals.has(p.proposalId)) throw ledgerRejected(`EFFECT_PROPOSAL_INVALID@${row.idx}`);
      proposals.set(p.proposalId, p);
    } else {
      const p = proposals.get(effect.proposalId);
      if (!p || p.status !== 'pending' || p.record.id !== entry.recordId || p.record.contentHash !== entry.contentHash || typeof effect.approverId !== 'string') throw ledgerRejected(`EFFECT_DECISION_INVALID@${row.idx}`);
      if (entry.kind === 'PUBLISH') {
        proposals.set(p.proposalId, { ...p, status: 'approved', approverId: effect.approverId });
        if (!byHash.has(p.record.contentHash)) { records.set(p.record.id, p.record); byHash.set(p.record.contentHash, p.record); activeIds.push(p.record.id); }
        version += 1;
      } else {
        proposals.set(p.proposalId, { ...p, status: 'discarded', approverId: effect.approverId });
      }
    }
  }
  try {
    return EvidenceLedger.fromSnapshot(clock, { schema: 'evidence-ledger-snapshot/1', version, entries, records: [...records.values()], proposals: [...proposals.values()], activeIds });
  } catch (e) { throw ledgerRejected(e.message); }
}

/** What an appended entry did, read from the ledger right after the append (the listener runs synchronously). */
function effectOf(entry, l, knownStatus) {
  if (entry.kind === 'ADD') {
    const record = l.getActive().at(-1);
    if (record?.id !== entry.recordId) throw new Error('LEDGER_EFFECT_UNRESOLVED: ADD');
    return { record };
  }
  if (entry.kind === 'PROPOSE') {
    const proposal = l.getProposals().at(-1);
    if (!proposal || proposal.record.id !== entry.recordId || knownStatus.has(proposal.proposalId)) throw new Error('LEDGER_EFFECT_UNRESOLVED: PROPOSE');
    knownStatus.set(proposal.proposalId, proposal.status);
    return { proposal };
  }
  const decided = l.getProposals().filter((p) => knownStatus.get(p.proposalId) === 'pending' && p.status !== 'pending' && p.record.id === entry.recordId);
  if (decided.length !== 1) throw new Error(`LEDGER_EFFECT_UNRESOLVED: ${entry.kind}`);
  knownStatus.set(decided[0].proposalId, decided[0].status);
  return { proposalId: decided[0].proposalId, approverId: decided[0].approverId };
}

/** Rewrite the JSON export (inside the write transaction, so exports land in database order). Never fatal. */
function writeExport() {
  if (!sqlite?.exportPath) return;
  try { fileLedgerSnapshotStore(sqlite.exportPath).save(ledger.toSnapshot()); if (persistence.exportError) persistence = { ...persistence, exportError: null }; }
  catch (e) { persistence = { ...persistence, exportError: `EXPORT_FAILED: ${e.message}` }; }
}

function markLoaded() {
  const entries = ledger.getEntries();
  sqlite.loadedCount = entries.length; sqlite.loadedHead = entries.at(-1)?.hash ?? null;
}

/** Bring this process's ledger up to the database head (entries other processes appended). */
function catchUp() {
  if (!sqlite) return;
  const head = dbHead(sqlite.db);
  if (head.count === sqlite.loadedCount && head.hash === sqlite.loadedHead) return;
  ledger = loadLedgerFromDb(sqlite.db);
  markLoaded();
}

/**
 * Run one ledger mutation. With SQLite: under the database write lock, on the current head, committed together
 * with its entries — or rolled back entirely (the in-memory ledger is then reloaded from the database).
 */
function mutateLedger(fn) {
  if (!sqlite) return fn(ledger);
  const { db } = sqlite;
  const nested = db.isTransaction;
  db.exec(nested ? 'SAVEPOINT evidence_ledger_write' : 'BEGIN IMMEDIATE');
  let unsubscribe = null;
  try {
    catchUp();
    const knownStatus = new Map(ledger.getProposals().map((p) => [p.proposalId, p.status]));
    const appended = [];
    unsubscribe = ledger.onAppend((entry, l) => { appended.push([entry, effectOf(entry, l, knownStatus)]); });
    const result = fn(ledger);
    unsubscribe(); unsubscribe = null;
    if (appended.length > 0) {
      const insert = db.prepare(INSERT_ENTRY);
      for (const [entry, effect] of appended) {
        insert.run(entry.index, entry.kind, entry.recordId, entry.contentHash, entry.prevHash, entry.hash, JSON.stringify(entry), JSON.stringify(effect), `pid-${process.pid}`, Date.now());
      }
      writeExport();
    }
    db.exec(nested ? 'RELEASE evidence_ledger_write' : 'COMMIT');
    markLoaded();
    return result;
  } catch (error) {
    unsubscribe?.();
    try { db.exec(nested ? 'ROLLBACK TO evidence_ledger_write; RELEASE evidence_ledger_write' : 'ROLLBACK'); } catch { /* already rolled back */ }
    try { sqlite.loadedCount = -1; catchUp(); } catch { /* the next call reports it */ }
    throw error;
  }
}

/** Read access: catch up with other processes first (SQLite mode), then read. */
function readLedger() { catchUp(); return ledger; }

/** Import a verified legacy JSON snapshot into the empty table: its entries verbatim, its state as the base row. */
function importJsonSnapshot(db, filePath, raw) {
  const snapshot = JSON.parse(raw);
  const insert = db.prepare(INSERT_ENTRY);
  const now = Date.now();
  for (const e of snapshot.entries) insert.run(e.index, e.kind, e.recordId, e.contentHash, e.prevHash, e.hash, JSON.stringify(e), null, `import-pid-${process.pid}`, now);
  db.prepare('INSERT INTO evidence_ledger_base (id, head_count, state_json, source_path, source_sha256, imported_at) VALUES (1, ?, ?, ?, ?, ?)')
    .run(snapshot.entries.length, JSON.stringify({ version: snapshot.version, records: snapshot.records, proposals: snapshot.proposals, activeIds: snapshot.activeIds }), filePath, sha256(raw), now);
}

function openSqliteLedger(filePath, db) {
  const rejectedInMemory = (reason) => {
    if (db.isTransaction) db.exec('ROLLBACK');
    ledger = new EvidenceLedger(clock);
    persistence = { status: 'REJECTED_IN_MEMORY', store: 'SQLITE', path: filePath, entries: 0, reason };
    return persistence;
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    let status = 'RESTORED';
    let imported = null;
    if (dbHead(db).count === 0) {
      status = 'PERSISTING_NEW';
      if (filePath && existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf8');
        const r = restoreLedger(clock, { load: () => JSON.parse(raw), save: () => false });
        if (r.status === 'REJECTED') return rejectedInMemory(r.reason);
        if (r.status === 'RESTORED' && r.entries > 0) {
          importJsonSnapshot(db, filePath, raw);
          status = 'MIGRATED_FROM_JSON';
          imported = { entries: r.entries, sourceSha256: sha256(raw), head: r.ledger.getEntries().at(-1).hash };
        }
      }
    }
    try { ledger = loadLedgerFromDb(db); } catch (e) { return rejectedInMemory(e.message); }
    if (imported && ledger.getEntries().at(-1).hash !== imported.head) throw new Error('LEDGER_IMPORT_MISMATCH');
    sqlite = { db, exportPath: filePath, loadedCount: 0, loadedHead: null };
    markLoaded();
    persistence = { status, store: 'SQLITE', path: filePath, entries: ledger.getEntries().length, reason: null, ...(imported ? { imported } : {}) };
    if (ledger.getEntries().length > 0) writeExport();
    db.exec('COMMIT');
    return persistence;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    sqlite = null;
    throw error;
  }
}

/**
 * Restore the process ledger and keep persisting it. With `{ db }` the database is the source of truth and
 * `filePath` is the legacy snapshot to import once and the JSON export; without it, `filePath` is the snapshot
 * itself (single process). `':memory:'` keeps the in-memory ledger (tests, ephemeral deployments).
 */
export function openKnowledgeLedgerPersistence(filePath, { db = null } = {}) {
  sqlite = null;
  if (db) return openSqliteLedger(filePath && filePath !== ':memory:' ? filePath : null, db);
  if (!filePath || filePath === ':memory:') { persistence = { status: 'IN_MEMORY', store: 'MEMORY', path: null, entries: ledger.getEntries().length, reason: null }; return persistence; }
  const errors = [];
  const r = openPersistentLedger(clock, fileLedgerSnapshotStore(filePath), (reason) => errors.push(reason));
  ledger = r.ledger;
  persistence = { status: r.status === 'REJECTED' ? 'REJECTED_IN_MEMORY' : r.status === 'RESTORED' ? 'RESTORED' : 'PERSISTING_NEW', store: 'JSON', path: filePath, entries: r.entries, reason: errors[0] ?? null };
  return persistence;
}

export function knowledgeLedgerPersistenceStatus() { const l = readLedger(); return { ...persistence, ledgerOk: l.verifyLedger().ok, activeRecords: l.getActive().length, entries: l.getEntries().length }; }

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
  const proposalIds = report.fetched.length > 0 ? mutateLedger((l) => new ProposeOnlyLearner(clock, l).runBatch({ sourceId: 'science-chat', fetch: () => report.fetched })) : [];
  const ledger = readLedger();
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
  const ledger = readLedger();
  return { ok: true, proposals: ledger.getProposals().map((p) => ({ proposalId: p.proposalId, status: p.status, approverId: p.approverId, claim: p.record.claim, recordStatus: p.record.status, sourceKind: p.record.provenance.sourceKind, sourceUrl: p.record.sourceUrl, contentHash: p.record.contentHash })), activeRecords: ledger.getActive().length, ledgerVersion: ledger.getVersion(), ledgerOk: ledger.verifyLedger().ok };
}

export function publishProposal(proposalId, approverId) {
  const rec = mutateLedger((l) => l.publish(proposalId, approverId));
  const ledger = readLedger();
  return rec ? { ok: true, published: { id: rec.id, claim: rec.claim, status: rec.status, contentHash: rec.contentHash }, activeRecords: ledger.getActive().length, ledgerOk: ledger.verifyLedger().ok } : { ok: false, error: 'not_pending' };
}

export function rejectProposal(proposalId, approverId) {
  return mutateLedger((l) => l.rejectProposal(proposalId, approverId)) ? { ok: true } : { ok: false, error: 'not_pending' };
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

  // Dedupe and propose in ONE ledger write: with several processes the check sees every other process's proposals.
  const { existing, proposalId } = mutateLedger((l) => {
    const contentHash = l.contentHashOf(normalized);
    const found = l.getProposals().find(
      (entry) => entry.record.contentHash === contentHash && (entry.status === 'pending' || entry.status === 'approved'),
    );
    return { existing: found ?? null, proposalId: found?.proposalId ?? l.propose(normalized) };
  });
  const ledger = readLedger();
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
