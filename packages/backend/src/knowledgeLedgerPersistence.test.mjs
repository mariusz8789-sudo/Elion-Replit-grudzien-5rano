/* Proprietary / All Rights Reserved - Genesis OS */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runIngest, listProposals, publishProposal, openKnowledgeLedgerPersistence, knowledgeLedgerPersistenceStatus, fileLedgerSnapshotStore } from './knowledgeApi.mjs';

const html = '<html><head><title>Wikimedia restart page</title></head><body>hello</body></html>';
const fakeFetch = async (url) => ({ status: url.endsWith('/robots.txt') ? 404 : 200, text: async () => (url.endsWith('/robots.txt') ? '' : html) });
const deps = { fetchImpl: fakeFetch, sleeper: { sleep: async () => {} }, env: {} };
const tmpFile = (name) => path.join(mkdtempSync(path.join(tmpdir(), 'ledger-')), name);

test('KNOWLEDGE LEDGER: proposals and published records survive a process restart; the chain verifies after reload', async () => {
  const f = tmpFile('evidence-ledger.json');
  const opened = openKnowledgeLedgerPersistence(f);
  assert.equal(opened.status, 'PERSISTING_NEW');
  const r = await runIngest({ urls: ['https://wikimedia.org/wiki/Restart'] }, deps);
  assert.equal(r.proposalIds.length, 1);
  assert.equal(publishProposal(r.proposalIds[0], 'OWNER').ok, true);
  assert.ok(existsSync(f));
  const onDisk = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(onDisk.schema, 'evidence-ledger-snapshot/1');
  assert.equal(onDisk.entries.length, 2); // PROPOSE + PUBLISH
  // "restart": reopen from the same file — same proposals, same active record, chain intact
  const reopened = openKnowledgeLedgerPersistence(f);
  assert.equal(reopened.status, 'RESTORED');
  assert.equal(reopened.entries, 2);
  const after = listProposals();
  assert.ok(after.proposals.some((p) => p.proposalId === r.proposalIds[0] && p.status === 'approved'));
  assert.equal(after.activeRecords, 1);
  assert.equal(after.ledgerOk, true);
  assert.equal(after.ledgerVersion, 2);
  assert.equal(knowledgeLedgerPersistenceStatus().status, 'RESTORED');
  // a later append continues the persisted chain
  const r2 = await runIngest({ urls: ['https://wikimedia.org/wiki/Second'] }, deps);
  assert.equal(r2.proposalIds.length, 1);
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).entries.length, 3);
});

test('KNOWLEDGE LEDGER: a tampered snapshot is rejected at boot — in-memory ledger, file left untouched, status says so', async () => {
  const f = tmpFile('evidence-ledger.json');
  openKnowledgeLedgerPersistence(f);
  await runIngest({ urls: ['https://wikimedia.org/wiki/Tamper'] }, deps);
  const snap = JSON.parse(readFileSync(f, 'utf8'));
  snap.entries[0].contentHash = 'deadbeef';
  writeFileSync(f, JSON.stringify(snap));
  const opened = openKnowledgeLedgerPersistence(f);
  assert.equal(opened.status, 'REJECTED_IN_MEMORY');
  assert.match(opened.reason, /LEDGER_SNAPSHOT_REJECTED: HASH_MISMATCH@0/);
  await runIngest({ urls: ['https://wikimedia.org/wiki/AfterTamper'] }, deps);
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).entries[0].contentHash, 'deadbeef');
  assert.equal(fileLedgerSnapshotStore(f).load().entries.length, 1);
  openKnowledgeLedgerPersistence(':memory:');
});
