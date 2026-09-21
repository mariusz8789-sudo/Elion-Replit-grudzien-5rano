import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { detect as cernDetect } from './compute/cmsOpenDataAdapter.mjs';

/**
 * GET /api/physics/cms-z — read-only HTTP surface for the existing,
 * unmodified `cmsOpenDataAdapter.mjs` (CMS Open Data record 5208, CC0).
 * No new scientific logic: this test proves the ROUTE wraps the same real
 * adapter the backend already had, honestly — real data when available,
 * 503 DATA_REQUIRED when not, never a substitute/mock/seed.
 */
const CERN = cernDetect().available;

let db;
beforeEach(() => { db = openDatabase(); });

function call(method, pathname) {
  return handleApi(db, { method, pathname });
}

describe('GET /api/physics/cms-z (public, read-only)', () => {
  test('returns the real, checksum-verified CMS Z->mumu statistics when the source data is available', (t) => {
    if (!CERN) return t.skip('CMS Open Data unavailable — BLOCKED_BY_RUNTIME (honest state).');
    const r = call('GET', '/api/physics/cms-z');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.eventCount, 10000);
    assert.equal(r.body.data.uniqueEventCount, 10000);
    assert.ok(r.body.data.invariantMassGeV.median > 89 && r.body.data.invariantMassGeV.median < 92);
    assert.equal(r.body.data.dataset.sha256, '7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1');
    assert.equal(r.body.data.dataset.license, 'CC0-1.0');
    // Full 5 GeV histogram must be present for a real (non-fabricated) chart.
    assert.equal(r.body.data.invariantMassGeV.histogram5GeV60To120.length, 12);
    const total = r.body.data.invariantMassGeV.histogram5GeV60To120.reduce((sum, bin) => sum + bin.eventCount, 0);
    assert.ok(total <= r.body.data.eventCount);
    // The three flags a locked-state/OFFLINE UI test will rely on.
    assert.equal(r.body.resultOrigin, 'real-engine');
    assert.equal(r.body.dataProvenance, 'REAL_EXTERNAL_DATASET');
    assert.equal(r.body.offline, true);
    assert.equal(r.body.live, false);
    assert.equal(r.body.simulation, false);
  });

  test('two independent calls return byte-identical statistics (determinism, no clock)', (t) => {
    if (!CERN) return t.skip('CMS Open Data unavailable — BLOCKED_BY_RUNTIME (honest state).');
    const a = call('GET', '/api/physics/cms-z');
    const b = call('GET', '/api/physics/cms-z');
    assert.deepEqual(a.body.data, b.body.data);
  });

  test('POST is not a valid method for this read-only route', () => {
    const r = call('POST', '/api/physics/cms-z');
    assert.equal(r.status, 404);
  });

  test('an unknown sub-path under physics returns 404, not a silent fallback', () => {
    const r = call('GET', '/api/physics/unknown');
    assert.equal(r.status, 404);
  });

  test('the old /api/compute/cern/zmumu path no longer exists (route moved, not duplicated)', () => {
    const r = call('GET', '/api/compute/cern/zmumu');
    assert.equal(r.status, 404);
  });
});
