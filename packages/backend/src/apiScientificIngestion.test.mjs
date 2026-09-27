import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { resetIngestionStatusForTests } from './scientificIngestion.mjs';

/**
 * GET /api/ingestion/source and /api/ingestion/status (D-149). The route is a thin, public wrapper over
 * scientificIngestion.mjs: the status it returns is the module's, the fetch is injected here so no test
 * ever depends on the sandbox's (blocked) egress, and the in-memory "last result" is the only state.
 */
let db;
beforeEach(() => { db = openDatabase(); resetIngestionStatusForTests(); });

const call = (pathname, query, fetchImpl) => handleApi(db, { method: 'GET', pathname, query, fetchImpl });
const okResponse = (body, status = 200) => ({ status, headers: { get: () => null }, arrayBuffer: async () => Uint8Array.from(Buffer.from(body, 'utf8')).buffer });

describe('GET /api/ingestion/source', () => {
  test('LIVE result carries url, httpStatus, sha256 of the payload, bytes and fetchedAt', async () => {
    const payload = '{"molecule_chembl_id":"CHEMBL941"}';
    const r = await call('/api/ingestion/source', { source: 'chembl', id: 'CHEMBL941' }, async () => okResponse(payload));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { result } = r.body;
    assert.equal(result.status, 'LIVE');
    assert.equal(result.url, 'https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL941.json');
    assert.equal(result.httpStatus, 200);
    assert.equal(result.sha256, createHash('sha256').update(payload).digest('hex'));
    assert.equal(result.bytes, payload.length);
    assert.match(result.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('a refused network is NO_ACCESS with the error, HTTP 200 from the route (the answer is honest, not an outage)', async () => {
    const r = await call('/api/ingestion/source', { source: 'uniprot', id: 'P00519' }, async () => { throw new Error('CONNECT tunnel failed, response 403'); });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.status, 'NO_ACCESS');
    assert.equal(r.body.result.sha256, null);
    assert.match(r.body.result.error, /CONNECT tunnel failed/);
  });

  test('a pinned id falls back to the repo copy and labels it PINNED_FALLBACK', async () => {
    const r = await call('/api/ingestion/source', { source: 'clinicaltrials', id: 'NCT03987919' }, async () => okResponse('', 403));
    assert.equal(r.body.result.status, 'PINNED_FALLBACK');
    assert.equal(r.body.result.httpStatus, 403);
    assert.match(r.body.result.pinned.path, /reference-semaglutide-NCT03987919\.json$/);
    assert.equal(r.body.result.pinned.matchesRecord, true);
  });

  test('unknown source or malformed id → 400 without a fetch', async () => {
    let called = 0;
    const fetchImpl = async () => { called += 1; return okResponse('x'); };
    const a = await call('/api/ingestion/source', { source: 'pubmed', id: '1' }, fetchImpl);
    assert.equal(a.status, 400);
    assert.equal(a.body.error, 'unknown_source');
    const b = await call('/api/ingestion/source', { source: 'pdb', id: 'https://evil.example/x' }, fetchImpl);
    assert.equal(b.status, 400);
    assert.equal(b.body.error, 'invalid_id');
    assert.equal(called, 0);
  });

  test('POST and unknown sub-routes are 404', async () => {
    const r = await handleApi(db, { method: 'POST', pathname: '/api/ingestion/source', query: { source: 'pdb', id: '1IEP' } });
    assert.equal(r.status, 404);
    const s = await handleApi(db, { method: 'GET', pathname: '/api/ingestion/anything' });
    assert.equal(s.status, 404);
  });
});

describe('GET /api/ingestion/status', () => {
  test('lists the four sources with allowlist, id grammar, pinned ids, and the last result after a call', async () => {
    const before = await call('/api/ingestion/status');
    assert.equal(before.status, 200);
    assert.deepEqual(before.body.sources.map((s) => s.source), ['pdb', 'chembl', 'uniprot', 'clinicaltrials']);
    for (const s of before.body.sources) {
      assert.ok(s.allowlist.startsWith('https://'), s.source);
      assert.ok(s.idPattern.startsWith('^'), s.source);
      assert.equal(s.lastResult, null);
    }
    await call('/api/ingestion/source', { source: 'pdb', id: '2HYY' }, async () => okResponse('', 403));
    const after = await call('/api/ingestion/status');
    const pdb = after.body.sources.find((s) => s.source === 'pdb');
    assert.equal(pdb.lastResult.status, 'NO_ACCESS');
    assert.equal(pdb.lastResult.id, '2HYY');
    assert.deepEqual(pdb.pinnedIds, ['1IEP']);
    assert.deepEqual(after.body.statuses, ['LIVE', 'NO_ACCESS', 'PINNED_FALLBACK']);
  });
});
