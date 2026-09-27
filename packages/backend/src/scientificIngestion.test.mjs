import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  allowlistedIngestionUrl,
  buildIngestionUrl,
  INGESTION_SOURCES,
  ingestScientificSource,
  ingestionStatus,
  normalizeIngestionId,
  pinnedCopyFor,
  recordIngestionResult,
  resetIngestionStatusForTests,
} from './scientificIngestion.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const FIXED_NOW = () => new Date('2026-09-27T12:00:00.000Z');
const okResponse = (body, status = 200) => ({ status, headers: { get: () => null }, arrayBuffer: async () => Uint8Array.from(Buffer.from(body, 'utf8')).buffer });
const redirectResponse = (status, location) => ({ status, headers: { get: (h) => (h.toLowerCase() === 'location' ? location : null) }, arrayBuffer: async () => new ArrayBuffer(0) });

/** An empty repo root: no pinned copy for anything, so PINNED_FALLBACK cannot appear by accident. */
const EMPTY_ROOT = mkdtempSync(path.join(tmpdir(), 'ingestion-empty-'));

test('id grammar per source: canonical ids pass, everything else is rejected', () => {
  assert.equal(normalizeIngestionId('pdb', '1iep'), '1IEP');
  assert.equal(normalizeIngestionId('pdb', '0ABC'), null);
  assert.equal(normalizeIngestionId('pdb', '1IEP.pdb'), null);
  assert.equal(normalizeIngestionId('chembl', 'CHEMBL941'), 'CHEMBL941');
  assert.equal(normalizeIngestionId('chembl', 'CHEMBL941/../target'), null);
  assert.equal(normalizeIngestionId('uniprot', 'P00519'), 'P00519');
  assert.equal(normalizeIngestionId('uniprot', 'A0A024R161'), 'A0A024R161');
  assert.equal(normalizeIngestionId('uniprot', 'XYZ'), null);
  assert.equal(normalizeIngestionId('clinicaltrials', 'NCT03987919'), 'NCT03987919');
  assert.equal(normalizeIngestionId('clinicaltrials', 'NCT0398791'), null);
  assert.equal(normalizeIngestionId('pubmed', '123'), null);
});

test('URL builder is deterministic and every built URL is on the allowlist', () => {
  for (const [source, spec] of Object.entries(INGESTION_SOURCES)) {
    const url = buildIngestionUrl(source, spec.defaultId);
    assert.ok(allowlistedIngestionUrl(url), `${source}: ${url} must be allowlisted`);
  }
  assert.equal(buildIngestionUrl('pdb', '1IEP'), 'https://files.rcsb.org/download/1IEP.pdb');
  assert.equal(buildIngestionUrl('uniprot', 'P00519'), 'https://rest.uniprot.org/uniprotkb/P00519.json');
  assert.equal(buildIngestionUrl('clinicaltrials', 'NCT03987919'), 'https://clinicaltrials.gov/api/v2/studies/NCT03987919');
  assert.equal(buildIngestionUrl('chembl', 'CHEMBL941'), 'https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL941.json');
});

test('allowlist refuses other hosts, http, and path escapes', () => {
  assert.equal(allowlistedIngestionUrl('https://example.com/download/1IEP.pdb'), null);
  assert.equal(allowlistedIngestionUrl('http://files.rcsb.org/download/1IEP.pdb'), null);
  assert.equal(allowlistedIngestionUrl('https://files.rcsb.org/other/1IEP.pdb'), null);
  assert.equal(allowlistedIngestionUrl('https://rest.uniprot.org/uniref/x'), null);
  assert.equal(allowlistedIngestionUrl('https://clinicaltrials.gov/api/v1/studies/NCT1'), null);
  assert.ok(allowlistedIngestionUrl('https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL941.json'));
});

test('unknown source and malformed id are rejected before any fetch', async () => {
  let called = 0;
  const fetchImpl = async () => { called += 1; return okResponse('x'); };
  const bad = await ingestScientificSource({ source: 'pubmed', id: '1' }, { fetchImpl, repoRoot: EMPTY_ROOT });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'unknown_source');
  const badId = await ingestScientificSource({ source: 'pdb', id: '../../etc/passwd' }, { fetchImpl, repoRoot: EMPTY_ROOT });
  assert.equal(badId.ok, false);
  assert.equal(badId.error, 'invalid_id');
  assert.equal(called, 0);
});

test('LIVE: HTTP 200 → sha256 of exactly the raw payload bytes, with url, bytes and fetchedAt', async () => {
  const payload = '{"primaryAccession":"P00519"}';
  const seen = [];
  const r = await ingestScientificSource({ source: 'uniprot', id: 'P00519' }, {
    fetchImpl: async (url, init) => { seen.push({ url: String(url), init }); return okResponse(payload); },
    now: FIXED_NOW,
    repoRoot: EMPTY_ROOT,
  });
  assert.equal(r.ok, true);
  assert.equal(r.result.status, 'LIVE');
  assert.equal(r.result.httpStatus, 200);
  assert.equal(r.result.sha256, sha256(payload));
  assert.equal(r.result.bytes, Buffer.byteLength(payload));
  assert.equal(r.result.url, 'https://rest.uniprot.org/uniprotkb/P00519.json');
  assert.equal(r.result.fetchedAt, '2026-09-27T12:00:00.000Z');
  assert.equal(r.result.pinned, undefined);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].init.redirect, 'manual');
  assert.equal(seen[0].init.headers.accept, 'application/json');
});

test('NO_ACCESS: HTTP 403 carries the status and error; nothing is substituted', async () => {
  const r = await ingestScientificSource({ source: 'chembl', id: 'CHEMBL941' }, { fetchImpl: async () => okResponse('denied', 403), repoRoot: EMPTY_ROOT });
  assert.equal(r.result.status, 'NO_ACCESS');
  assert.equal(r.result.httpStatus, 403);
  assert.equal(r.result.error, 'http_403');
  assert.equal(r.result.sha256, null);
  assert.equal(r.result.bytes, 0);
});

test('NO_ACCESS: network error (proxy CONNECT refused) is reported, not hidden', async () => {
  const r = await ingestScientificSource({ source: 'uniprot', id: 'P00519' }, { fetchImpl: async () => { throw new Error('fetch failed: CONNECT tunnel failed, response 403'); }, repoRoot: EMPTY_ROOT });
  assert.equal(r.result.status, 'NO_ACCESS');
  assert.equal(r.result.httpStatus, null);
  assert.match(r.result.error, /network_error: fetch failed: CONNECT tunnel failed/);
});

test('NO_ACCESS: an empty 200 body is not a LIVE result', async () => {
  const r = await ingestScientificSource({ source: 'pdb', id: '4HG7' }, { fetchImpl: async () => okResponse(''), repoRoot: EMPTY_ROOT });
  assert.equal(r.result.status, 'NO_ACCESS');
  assert.equal(r.result.error, 'empty_body');
});

test('redirects: off-allowlist target is never fetched; on-allowlist hop is followed and hashed', async () => {
  const fetched = [];
  const off = await ingestScientificSource({ source: 'pdb', id: '4HG7' }, {
    fetchImpl: async (url) => { fetched.push(String(url)); return fetched.length === 1 ? redirectResponse(302, 'http://169.254.169.254/latest/') : okResponse('leak'); },
    repoRoot: EMPTY_ROOT,
  });
  assert.equal(off.result.status, 'NO_ACCESS');
  assert.equal(off.result.error, 'redirect_not_allowlisted');
  assert.equal(fetched.length, 1);

  const seen = [];
  const on = await ingestScientificSource({ source: 'pdb', id: '4HG7' }, {
    fetchImpl: async (url) => { seen.push(String(url)); return seen.length === 1 ? redirectResponse(301, 'https://files.rcsb.org/download/4hg7.pdb') : okResponse('HEADER'); },
    repoRoot: EMPTY_ROOT,
  });
  assert.equal(on.result.status, 'LIVE');
  assert.equal(on.result.sha256, sha256('HEADER'));
  assert.equal(on.result.finalUrl, 'https://files.rcsb.org/download/4hg7.pdb');
  assert.equal(seen.length, 2);
});

test('PINNED_FALLBACK only for an id with a hash-recorded copy in the repo, and it says so', async () => {
  const deny = async () => { throw new Error('CONNECT tunnel failed, response 403'); };
  const pinnedPdb = await ingestScientificSource({ source: 'pdb', id: '1IEP' }, { fetchImpl: deny });
  assert.equal(pinnedPdb.result.status, 'PINNED_FALLBACK');
  assert.equal(pinnedPdb.result.pinned.path, 'packages/backend/src/compute/targets/abl1-1iep/1iep_receptorH.pdb');
  assert.equal(pinnedPdb.result.pinned.matchesRecord, true, 'bytes on disk must hash to SOURCE.json sha256');
  assert.equal(pinnedPdb.result.sha256, pinnedPdb.result.pinned.sha256);
  assert.match(pinnedPdb.result.pinned.nature, /PREPARED receptor, not the raw RCSB file/);
  assert.match(pinnedPdb.result.error, /CONNECT tunnel failed/, 'the failed live attempt stays on record');
  assert.match(pinnedPdb.result.note, /NIE powiodło się/);

  const pinnedTrial = await ingestScientificSource({ source: 'clinicaltrials', id: 'NCT03987919' }, { fetchImpl: deny });
  assert.equal(pinnedTrial.result.status, 'PINNED_FALLBACK');
  assert.equal(pinnedTrial.result.pinned.matchesRecord, true);
  assert.match(pinnedTrial.result.pinned.nature, /narrowed extraction/);

  // Same source, a different id: no pinned copy → NO_ACCESS, never a borrowed fallback.
  const other = await ingestScientificSource({ source: 'pdb', id: '2HYY' }, { fetchImpl: deny });
  assert.equal(other.result.status, 'NO_ACCESS');
  assert.equal(other.result.pinned, undefined);
  const otherTrial = await ingestScientificSource({ source: 'clinicaltrials', id: 'NCT00000001' }, { fetchImpl: deny });
  assert.equal(otherTrial.result.status, 'NO_ACCESS');
});

test('a successful live fetch wins over an existing pinned copy (pinned is a fallback, not a cache)', async () => {
  const r = await ingestScientificSource({ source: 'pdb', id: '1IEP' }, { fetchImpl: async () => okResponse('ATOM 1') });
  assert.equal(r.result.status, 'LIVE');
  assert.equal(r.result.sha256, sha256('ATOM 1'));
  assert.equal(r.result.pinned, undefined);
});

test('pinnedCopyFor reports drift when the pinned bytes no longer match the recorded hash', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ingestion-drift-'));
  const rel = 'packages/backend/src/compute/targets/abl1-1iep/1iep_receptorH.pdb';
  mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  writeFileSync(path.join(root, rel), 'tampered');
  const p = pinnedCopyFor('pdb', '1IEP', { repoRoot: root });
  assert.equal(p.matchesRecord, false);
  assert.equal(p.sha256, sha256('tampered'));
  assert.equal(pinnedCopyFor('pdb', '9ZZZ', { repoRoot: root }), null);
});

test('ingestionStatus lists the four sources, their allowlist, pinned ids and the last in-memory result', () => {
  resetIngestionStatusForTests();
  const before = ingestionStatus();
  assert.deepEqual(before.sources.map((s) => s.source), ['pdb', 'chembl', 'uniprot', 'clinicaltrials']);
  assert.deepEqual(before.sources.find((s) => s.source === 'pdb').pinnedIds, ['1IEP']);
  assert.deepEqual(before.sources.find((s) => s.source === 'clinicaltrials').pinnedIds, ['NCT03987919']);
  assert.deepEqual(before.sources.find((s) => s.source === 'uniprot').pinnedIds, []);
  assert.ok(before.sources.every((s) => s.lastResult === null));
  recordIngestionResult({ source: 'uniprot', id: 'P00519', status: 'NO_ACCESS', sha256: null });
  const after = ingestionStatus();
  assert.equal(after.sources.find((s) => s.source === 'uniprot').lastResult.status, 'NO_ACCESS');
  assert.deepEqual(after.statuses, ['LIVE', 'NO_ACCESS', 'PINNED_FALLBACK']);
  resetIngestionStatusForTests();
});
