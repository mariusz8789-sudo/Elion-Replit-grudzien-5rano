/* Proprietary / All Rights Reserved - Genesis OS */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runIngest, isFetchableUrl, listProposals, publishProposal } from './knowledgeApi.mjs';

const html = '<html><head><title>Wikimedia test page</title></head><body>hello</body></html>';
const fakeFetch = async (url) => ({ status: url.endsWith('/robots.txt') ? 404 : 200, text: async () => (url.endsWith('/robots.txt') ? '' : html) });
const deps = { fetchImpl: fakeFetch, sleeper: { sleep: async () => {} }, env: {} };

test('refuses private, loopback and non-http URLs before any network call', () => {
  for (const u of ['http://localhost/x', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'ftp://example.org/', 'file:///etc/passwd', 'http://user:pw@example.org/']) assert.equal(isFetchableUrl(u), false, u);
  assert.equal(isFetchableUrl('https://wikimedia.org/page'), true);
});

test('plain-web URL outside the VERIFIED allowlist is skipped as LEGAL_GATE_PENDING, never fetched', async () => {
  let calls = 0;
  const r = await runIngest({ urls: ['https://unknown-site.test/article'] }, { ...deps, fetchImpl: async (...a) => { calls++; return fakeFetch(...a); } });
  assert.equal(r.ok, true);
  assert.equal(r.fetched, 0);
  assert.equal(r.skipped[0].reason, 'LEGAL_GATE_PENDING');
  assert.equal(calls, 0);
});

test('YouTube without a key reports REQUIRES_OFFICIAL_API; nothing is proposed', async () => {
  const r = await runIngest({ urls: ['https://youtu.be/abc123xyz'] }, deps);
  assert.equal(r.fetched, 0);
  assert.equal(r.skipped[0].reason, 'REQUIRES_OFFICIAL_API');
  assert.equal(r.proposalIds.length, 0);
});

test('allowlisted web page becomes a PROPOSAL only; publishing needs an approver and verifies the ledger', async () => {
  const r = await runIngest({ urls: ['https://wikimedia.org/wiki/Test'] }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'PROPOSE_ONLY');
  assert.equal(r.fetched, 1);
  assert.equal(r.proposalIds.length, 1);
  assert.equal(r.proposals[0].claim, 'Wikimedia test page');
  assert.notEqual(r.proposals[0].status, 'verified');
  const before = listProposals();
  assert.ok(before.proposals.some((p) => p.proposalId === r.proposalIds[0] && p.status === 'pending'));
  const pub = publishProposal(r.proposalIds[0], 'OWNER');
  assert.equal(pub.ok, true);
  assert.equal(pub.ledgerOk, true);
  assert.equal(publishProposal(r.proposalIds[0], 'OWNER').ok, false);
});

test('rejects an empty request and caps at 5 URLs', async () => {
  assert.equal((await runIngest({}, deps)).ok, false);
  const r = await runIngest({ urls: Array.from({ length: 9 }, (_, i) => `http://localhost/${i}`) }, deps);
  assert.equal(r.skipped.length, 5);
});
