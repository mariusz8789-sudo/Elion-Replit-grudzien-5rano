/* Proprietary / All Rights Reserved - Genesis OS */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EvidenceLedger } from './compute/knowledge-core.mjs';
import {
  knowledgeLedgerPersistenceStatus, listProposals, openKnowledgeLedgerPersistence, proposeStructuredEvidence, publishProposal, rejectProposal,
} from './knowledgeApi.mjs';
import { openDatabase } from './store.mjs';

/**
 * EVIDENCE LEDGER WITH SEVERAL BACKEND PROCESSES (docs/genesis1/BYT-VERIFICATION.md, req. 11).
 *
 * The canonical ledger (src/knowledgeApi.mjs) keeps its entries in genesis.db (schema V16, append-only, chained)
 * instead of a per-process JSON file that each process rewrote from its own memory. These tests run REAL OS
 * processes (the backend modules in child processes, and src/server.mjs itself) on one temp database and JSON
 * path, and kill only the PIDs they spawned.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const href = (f) => JSON.stringify(pathToFileURL(path.join(HERE, f)).href);
const clock = { now: () => Date.now() };

const evidence = (tag) => ({
  sourceUrl: `https://genesis.test/evidence/${tag}`,
  sourceTimestamp: '2026-10-03T00:00:00.000Z',
  claim: `Observation ${tag}`,
  claimType: 'observation',
  confidence: 0.9,
  provenance: { sourceKind: 'dataset', retrievedBy: 'ledger-multi-test', independentSourceIds: [`src-${tag}`] },
});

/** A child backend process: opens the DB and the ledger exactly as server.mjs does, then races the others. */
const PROPOSER = `
import { openDatabase } from ${href('store.mjs')};
import { openKnowledgeLedgerPersistence, proposeStructuredEvidence, publishProposal, listProposals } from ${href('knowledgeApi.mjs')};
const [dbPath, ledgerPath, name, count, shared, startAt] = process.argv.slice(2);
const db = openDatabase(dbPath);
const opened = openKnowledgeLedgerPersistence(ledgerPath, { db });
const evidence = (tag) => ({ sourceUrl: 'https://genesis.test/evidence/' + tag, sourceTimestamp: '2026-10-03T00:00:00.000Z', claim: 'Observation ' + tag, claimType: 'observation', confidence: 0.9, provenance: { sourceKind: 'dataset', retrievedBy: 'ledger-multi-test', independentSourceIds: ['src-' + tag] } });
const tick = () => new Promise((r) => setImmediate(r));
await new Promise((r) => setTimeout(r, Math.max(0, Number(startAt) - Date.now() - 20)));
while (Date.now() < Number(startAt)) { /* align the race */ }
const own = []; const sharedIds = []; const errors = [];
for (let i = 0; i < Number(count); i += 1) {
  try {
    const r = proposeStructuredEvidence(evidence(name + '-' + i));
    if (!r.ok) errors.push(r.error); else own.push(r.proposalId);
    if (i < Number(shared)) { const s = proposeStructuredEvidence(evidence('shared-' + i)); if (s.ok) sharedIds.push(s.proposalId); else errors.push(s.error); }
  } catch (e) { errors.push(String(e.message)); }
  await tick();
}
// Every process tries to publish the first shared proposal: exactly one may win.
let published = null;
try { published = publishProposal(sharedIds[0], 'approver-' + name).ok; } catch (e) { errors.push(String(e.message)); }
const view = listProposals();
process.stdout.write(JSON.stringify({ name, pid: process.pid, opened: opened.status, own, sharedIds, published, errors, seen: view.proposals.length, ledgerOk: view.ledgerOk }) + '\\n');
db.close();
`;

/** A child that only opens the ledger (concurrent boot / migration). */
const OPENER = `
import { openDatabase } from ${href('store.mjs')};
import { openKnowledgeLedgerPersistence, listProposals } from ${href('knowledgeApi.mjs')};
const [dbPath, ledgerPath, startAt] = process.argv.slice(2);
const db = openDatabase(dbPath);
await new Promise((r) => setTimeout(r, Math.max(0, Number(startAt) - Date.now() - 20)));
while (Date.now() < Number(startAt)) { /* align the race */ }
const opened = openKnowledgeLedgerPersistence(ledgerPath, { db });
process.stdout.write(JSON.stringify({ pid: process.pid, status: opened.status, entries: opened.entries, proposals: listProposals().proposals.length }) + '\\n');
db.close();
`;

function runChild(script, args) {
  const proc = spawn(process.execPath, [script, ...args.map(String)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; let errText = '';
  proc.stderr.on('data', (d) => { errText += d.toString(); });
  proc.stdout.on('data', (d) => { out += d.toString(); });
  const result = new Promise((resolve, reject) => {
    proc.on('exit', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (!line) reject(new Error(`child exited ${code} without output: ${errText.slice(-2000)}`)); else resolve(JSON.parse(line));
    });
  });
  const kill = () => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL'); }; // only the PID this test spawned
  return { result, kill };
}

function dbRows(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  try { return db.prepare('SELECT * FROM evidence_ledger_entries ORDER BY idx').all(); } finally { db.close(); }
}

function verifyExport(file) {
  const snap = JSON.parse(readFileSync(file, 'utf8'));
  return { snap, ledger: EvidenceLedger.fromSnapshot(clock, snap) }; // throws if the chain does not verify
}

/** Build a legacy (pre-V16) JSON ledger file with the single-process code path: proposals, a publish, a reject. */
function writeLegacyLedger(file) {
  openKnowledgeLedgerPersistence(file); // no database: legacy JSON snapshot mode
  const a = proposeStructuredEvidence(evidence('legacy-a'));
  const b = proposeStructuredEvidence(evidence('legacy-b'));
  proposeStructuredEvidence(evidence('legacy-c'));
  assert.equal(publishProposal(a.proposalId, 'legacy-owner').ok, true);
  assert.equal(rejectProposal(b.proposalId, 'legacy-owner').ok, true);
  openKnowledgeLedgerPersistence(':memory:');
  return readFileSync(file, 'utf8');
}

describe('evidence ledger: several backend processes on one database', () => {
  test('four processes propose concurrently: every proposal is present exactly once, the shared ones are deduped, one publish wins, the chain verifies', { timeout: 120_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-ledger-mp-'));
    const dbPath = path.join(dir, 'genesis.db');
    const ledgerPath = path.join(dir, 'evidence-ledger.json');
    const script = path.join(dir, 'proposer.mjs');
    writeFileSync(script, PROPOSER);
    openDatabase(dbPath).close();
    const COUNT = 25; const SHARED = 5; const N = 4;
    const startAt = Date.now() + 2_000;
    const children = Array.from({ length: N }, (_, i) => runChild(script, [dbPath, ledgerPath, `p${i}`, COUNT, SHARED, startAt]));
    try {
      const results = await Promise.all(children.map((c) => c.result));
      for (const r of results) {
        assert.deepEqual(r.errors, [], `${r.name}: ${JSON.stringify(r.errors)}`);
        assert.equal(r.own.length, COUNT);
        assert.equal(r.ledgerOk, true);
      }
      // The shared contents resolve to the same proposal in every process (dedupe across processes).
      for (let i = 0; i < SHARED; i += 1) assert.equal(new Set(results.map((r) => r.sharedIds[i])).size, 1, `shared-${i} proposed once`);
      assert.equal(results.filter((r) => r.published === true).length, 1, 'exactly one process publishes the shared proposal');

      const rows = dbRows(dbPath);
      const proposes = rows.filter((r) => r.kind === 'PROPOSE');
      assert.equal(proposes.length, N * COUNT + SHARED, 'no lost and no duplicated proposal');
      assert.equal(rows.filter((r) => r.kind === 'PUBLISH').length, 1);
      assert.equal(rows.length, N * COUNT + SHARED + 1);
      assert.ok(new Set(rows.map((r) => r.writer)).size >= 2, 'the entries come from several processes');
      rows.forEach((r, i) => assert.equal(r.idx, i));

      // An independent process (this one) reads the same ledger: every id exactly once, chain verified.
      const db = openDatabase(dbPath);
      try {
        assert.equal(openKnowledgeLedgerPersistence(ledgerPath, { db }).status, 'RESTORED');
        const view = listProposals();
        assert.equal(view.ledgerOk, true);
        const ids = view.proposals.map((p) => p.proposalId);
        assert.equal(new Set(ids).size, ids.length);
        for (const r of results) for (const id of [...r.own, ...r.sharedIds]) assert.equal(ids.filter((x) => x === id).length, 1, `${id} present exactly once`);
        assert.equal(view.proposals.filter((p) => p.status === 'approved').length, 1);
        assert.equal(view.activeRecords, 1);
        // The JSON export is a verified snapshot of the same chain.
        const { snap, ledger } = verifyExport(ledgerPath);
        assert.equal(ledger.verifyLedger().ok, true);
        assert.deepEqual(snap.entries.map((e) => e.hash), rows.map((r) => r.hash));
      } finally { openKnowledgeLedgerPersistence(':memory:'); db.close(); }
    } finally {
      children.forEach((c) => c.kill());
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a restart preserves the ledger: same entries, same hashes, same proposals; later appends continue the chain', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-ledger-restart-'));
    const dbPath = path.join(dir, 'genesis.db');
    const ledgerPath = path.join(dir, 'evidence-ledger.json');
    try {
      let db = openDatabase(dbPath);
      assert.equal(openKnowledgeLedgerPersistence(ledgerPath, { db }).status, 'PERSISTING_NEW');
      const a = proposeStructuredEvidence(evidence('restart-a'));
      const b = proposeStructuredEvidence(evidence('restart-b'));
      assert.equal(publishProposal(a.proposalId, 'owner').ok, true);
      assert.equal(rejectProposal(b.proposalId, 'owner').ok, true);
      const before = listProposals();
      const rowsBefore = dbRows(dbPath);
      db.close();
      rmSync(ledgerPath); // the export is not needed to restore: the database is the source of truth

      db = openDatabase(dbPath);
      const reopened = openKnowledgeLedgerPersistence(ledgerPath, { db });
      assert.equal(reopened.status, 'RESTORED');
      assert.equal(reopened.entries, 4);
      assert.deepEqual(listProposals(), before);
      assert.equal(knowledgeLedgerPersistenceStatus().ledgerOk, true);
      assert.ok(existsSync(ledgerPath), 'the export is rewritten at boot');
      assert.deepEqual(verifyExport(ledgerPath).snap.entries.map((e) => e.hash), rowsBefore.map((r) => r.hash));
      proposeStructuredEvidence(evidence('restart-c'));
      const rows = dbRows(dbPath);
      assert.equal(rows.length, 5);
      assert.equal(rows[4].prev_hash, rowsBefore[3].hash);
      db.close();
    } finally {
      openKnowledgeLedgerPersistence(':memory:');
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an existing JSON ledger migrates once, with identical entries and hashes, even when two processes boot on it at once', { timeout: 60_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-ledger-migrate-'));
    const dbPath = path.join(dir, 'genesis.db');
    const ledgerPath = path.join(dir, 'evidence-ledger.json');
    const script = path.join(dir, 'opener.mjs');
    writeFileSync(script, OPENER);
    try {
      const legacyBytes = writeLegacyLedger(ledgerPath);
      const legacy = JSON.parse(legacyBytes);
      assert.equal(legacy.entries.length, 5); // 3 PROPOSE, PUBLISH, REJECT
      openDatabase(dbPath).close();

      const startAt = Date.now() + 1_500;
      const children = [runChild(script, [dbPath, ledgerPath, startAt]), runChild(script, [dbPath, ledgerPath, startAt])];
      const opened = await Promise.all(children.map((c) => c.result));
      assert.deepEqual(opened.map((o) => o.status).sort(), ['MIGRATED_FROM_JSON', 'RESTORED'], 'imported exactly once');
      assert.ok(opened.every((o) => o.entries === 5 && o.proposals === 3));

      const rows = dbRows(dbPath);
      assert.deepEqual(rows.map((r) => JSON.parse(r.entry_json)), legacy.entries, 'same entries, same hashes');
      assert.deepEqual(rows.map((r) => r.hash), legacy.entries.map((e) => e.hash));
      const db = new DatabaseSync(dbPath);
      const base = db.prepare('SELECT * FROM evidence_ledger_base').all();
      db.close();
      assert.equal(base.length, 1);
      assert.equal(base[0].source_sha256, createHash('sha256').update(legacyBytes).digest('hex'));
      // The export rewritten from the database is byte-for-byte the legacy file.
      assert.equal(readFileSync(ledgerPath, 'utf8'), legacyBytes);

      // In this process: the migrated state is the legacy state, and the chain continues from its head.
      const live = openDatabase(dbPath);
      try {
        openKnowledgeLedgerPersistence(ledgerPath, { db: live });
        const view = listProposals();
        assert.deepEqual(view.proposals.map((p) => p.status).sort(), ['approved', 'discarded', 'pending']);
        assert.equal(view.ledgerVersion, legacy.version);
        assert.equal(view.activeRecords, 1);
        proposeStructuredEvidence(evidence('after-migration'));
        const after = dbRows(dbPath);
        assert.equal(after.length, 6);
        assert.equal(after[5].prev_hash, legacy.entries[4].hash);
        assert.equal(after[5].effect_json !== null, true);
      } finally { live.close(); }
    } finally {
      openKnowledgeLedgerPersistence(':memory:');
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('tampering is detected: the table refuses edits, a doctored row or effect is rejected at boot, a tampered JSON is never imported', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-ledger-tamper-'));
    const dbPath = path.join(dir, 'genesis.db');
    const ledgerPath = path.join(dir, 'evidence-ledger.json');
    try {
      let db = openDatabase(dbPath);
      openKnowledgeLedgerPersistence(ledgerPath, { db });
      const a = proposeStructuredEvidence(evidence('tamper-a'));
      proposeStructuredEvidence(evidence('tamper-b'));
      publishProposal(a.proposalId, 'owner');
      // Append-only and chained at the database level, whatever code writes.
      assert.throws(() => db.prepare("UPDATE evidence_ledger_entries SET hash = 'x' WHERE idx = 0").run(), /append-only/);
      assert.throws(() => db.prepare('DELETE FROM evidence_ledger_entries WHERE idx = 2').run(), /append-only/);
      assert.throws(() => db.prepare("INSERT INTO evidence_ledger_entries (idx, kind, record_id, content_hash, prev_hash, hash, entry_json, created_at) VALUES (3, 'PROPOSE', 'r', 'c', 'not-the-head', 'h', '{}', 0)").run(), /extend the current head/);
      assert.throws(() => db.prepare("INSERT INTO evidence_ledger_entries (idx, kind, record_id, content_hash, prev_hash, hash, entry_json, created_at) VALUES (7, 'PROPOSE', 'r', 'c', 'p', 'h', '{}', 0)").run(), /extend the current head/);
      db.close();

      // Doctor a claim inside a stored effect (behind the triggers' back): the record no longer matches its hash.
      const raw = new DatabaseSync(dbPath);
      raw.exec('DROP TRIGGER evidence_ledger_entries_append_only_update');
      const row = raw.prepare('SELECT effect_json FROM evidence_ledger_entries WHERE idx = 1').get();
      const effect = JSON.parse(row.effect_json);
      effect.proposal.record.claim = 'A forged claim';
      raw.prepare('UPDATE evidence_ledger_entries SET effect_json = ? WHERE idx = 1').run(JSON.stringify(effect));
      raw.close();
      db = openDatabase(dbPath);
      let opened = openKnowledgeLedgerPersistence(ledgerPath, { db });
      assert.equal(opened.status, 'REJECTED_IN_MEMORY');
      assert.match(opened.reason, /LEDGER_STATE_REJECTED: EFFECT_RECORD_MISMATCH@1/);
      assert.equal(listProposals().proposals.length, 0, 'a rejected ledger is not served');
      db.close();

      // Doctor an entry's hash consistently in both columns: the chain check rejects it.
      const raw2 = new DatabaseSync(dbPath);
      raw2.prepare('UPDATE evidence_ledger_entries SET effect_json = ? WHERE idx = 1').run(row.effect_json);
      const e0 = JSON.parse(raw2.prepare('SELECT entry_json FROM evidence_ledger_entries WHERE idx = 0').get().entry_json);
      e0.at += 1;
      raw2.prepare('UPDATE evidence_ledger_entries SET entry_json = ? WHERE idx = 0').run(JSON.stringify(e0));
      raw2.close();
      db = openDatabase(dbPath);
      opened = openKnowledgeLedgerPersistence(ledgerPath, { db });
      assert.equal(opened.status, 'REJECTED_IN_MEMORY');
      assert.match(opened.reason, /HASH_MISMATCH@0/);
      db.close();

      // A tampered legacy JSON beside an EMPTY database is refused, not imported, and left untouched.
      const dir2 = mkdtempSync(path.join(tmpdir(), 'genesis-ledger-tamper-json-'));
      try {
        const file2 = path.join(dir2, 'evidence-ledger.json');
        const snap = JSON.parse(writeLegacyLedger(file2));
        snap.entries[0].contentHash = 'deadbeef';
        const tampered = JSON.stringify(snap);
        writeFileSync(file2, tampered);
        const db2 = openDatabase(path.join(dir2, 'genesis.db'));
        const o2 = openKnowledgeLedgerPersistence(file2, { db: db2 });
        assert.equal(o2.status, 'REJECTED_IN_MEMORY');
        assert.match(o2.reason, /LEDGER_SNAPSHOT_REJECTED: HASH_MISMATCH@0/);
        assert.equal(db2.prepare('SELECT COUNT(*) n FROM evidence_ledger_entries').get().n, 0);
        assert.equal(readFileSync(file2, 'utf8'), tampered);
        db2.close();
      } finally { rmSync(dir2, { recursive: true, force: true }); }
    } finally {
      openKnowledgeLedgerPersistence(':memory:');
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a stale or edited JSON export beside a populated database is ignored: the database stays the source of truth', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-ledger-export-'));
    const dbPath = path.join(dir, 'genesis.db');
    const ledgerPath = path.join(dir, 'evidence-ledger.json');
    try {
      let db = openDatabase(dbPath);
      openKnowledgeLedgerPersistence(ledgerPath, { db });
      proposeStructuredEvidence(evidence('export-a'));
      proposeStructuredEvidence(evidence('export-b'));
      db.close();
      const snap = JSON.parse(readFileSync(ledgerPath, 'utf8'));
      snap.entries = snap.entries.slice(0, 1); snap.proposals = snap.proposals.slice(0, 1);
      writeFileSync(ledgerPath, JSON.stringify(snap)); // what a second, older instance overwriting the file would leave
      db = openDatabase(dbPath);
      assert.equal(openKnowledgeLedgerPersistence(ledgerPath, { db }).status, 'RESTORED');
      assert.equal(listProposals().proposals.length, 2);
      assert.equal(JSON.parse(readFileSync(ledgerPath, 'utf8')).entries.length, 2, 'the export is rewritten from the database');
      db.close();
    } finally {
      openKnowledgeLedgerPersistence(':memory:');
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ---------------- two real server.mjs processes ---------------- */

function boot(dbPath, ledgerPath) {
  const proc = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: {
      ...process.env, PORT: '0', GENESIS_DB_PATH: dbPath, GENESIS_LEDGER_PATH: ledgerPath, GENESIS_RESEARCH_WORKER: '0',
      ANTHROPIC_API_KEY: '', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('server did not start in time')); }, 60_000);
    let buf = '';
    proc.stderr.on('data', () => {});
    proc.on('exit', (code, signal) => { if (buf !== null) reject(new Error(`server exited before start: ${code ?? signal}`)); });
    proc.stdout.on('data', (chunk) => {
      if (buf === null) return;
      buf += chunk.toString();
      const started = buf.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((j) => j?.msg === 'started');
      if (!started) return;
      buf = null;
      clearTimeout(timer);
      const url = `http://127.0.0.1:${started.port}`;
      const api = async (method, p, { token, body } = {}) => {
        const res = await fetch(`${url}${p}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      };
      const kill = () => new Promise((done) => {
        if (proc.exitCode !== null || proc.signalCode !== null) { done(); return; }
        proc.once('exit', () => done());
        proc.kill('SIGKILL'); // only the PID this test spawned
      });
      resolve({ api, kill, pid: proc.pid, started });
    });
  });
}

describe('evidence ledger: two server.mjs instances on one data directory', () => {
  test('both instances serve every proposal; concurrent publish/reject of one proposal has one winner; a restart serves the same ledger', { timeout: 120_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-ledger-2srv-'));
    const dbPath = path.join(dir, 'genesis.db');
    const ledgerPath = path.join(dir, 'evidence-ledger.json');
    const script = path.join(dir, 'proposer.mjs');
    writeFileSync(script, PROPOSER);
    const servers = [];
    const children = [];
    try {
      servers.push(...await Promise.all([boot(dbPath, ledgerPath), boot(dbPath, ledgerPath)]));
      const [a, b] = servers;
      assert.equal(a.started.knowledgeLedger, 'PERSISTING_NEW');
      const owner = (await a.api('POST', '/api/auth/register', { body: { email: 'ledger-2srv@genesis.test', password: 'password123' } })).body;
      const tokenB = (await b.api('POST', '/api/auth/login', { body: { email: 'ledger-2srv@genesis.test', password: 'password123' } })).body.token;

      // Two more backend processes propose concurrently while both servers are live.
      const startAt = Date.now() + 1_000;
      children.push(runChild(script, [dbPath, ledgerPath, 'srv-x', 10, 2, startAt]), runChild(script, [dbPath, ledgerPath, 'srv-y', 10, 2, startAt]));
      const results = await Promise.all(children.map((c) => c.result));
      const expected = new Set(results.flatMap((r) => [...r.own, ...r.sharedIds]));
      assert.equal(expected.size, 22);

      const listA = (await a.api('GET', '/api/knowledge/proposals')).body;
      const listB = (await b.api('GET', '/api/knowledge/proposals')).body;
      assert.equal(listA.ledgerOk, true);
      assert.deepEqual(listB, listA, 'both instances read one ledger');
      assert.deepEqual(new Set(listA.proposals.map((p) => p.proposalId)), expected);

      // One pending proposal, decided by both instances at once: exactly one decision lands.
      const target = results[0].own[0];
      const [pub, rej] = await Promise.all([
        a.api('POST', `/api/knowledge/proposals/${target}/publish`, { token: owner.token }),
        b.api('POST', `/api/knowledge/proposals/${target}/reject`, { token: tokenB }),
      ]);
      assert.equal([pub.body.ok, rej.body.ok].filter(Boolean).length, 1, JSON.stringify([pub.body, rej.body]));
      const decided = (await b.api('GET', '/api/knowledge/proposals')).body;
      assert.deepEqual((await a.api('GET', '/api/knowledge/proposals')).body, decided);
      assert.equal(decided.proposals.find((p) => p.proposalId === target).status, pub.body.ok ? 'approved' : 'discarded');

      await Promise.all(servers.map((s) => s.kill()));
      servers.length = 0;
      const c = await boot(dbPath, ledgerPath);
      servers.push(c);
      assert.equal(c.started.knowledgeLedger, 'RESTORED');
      assert.deepEqual((await c.api('GET', '/api/knowledge/proposals')).body, decided, 'the restarted instance serves the same ledger');
      const health = (await c.api('GET', '/api/health')).body;
      assert.equal(health.knowledgeLedger.store, 'SQLITE');
      assert.equal(verifyExport(ledgerPath).ledger.getEntries().length, dbRows(dbPath).length);
    } finally {
      children.forEach((ch) => ch.kill());
      await Promise.all(servers.map((s) => s.kill()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
