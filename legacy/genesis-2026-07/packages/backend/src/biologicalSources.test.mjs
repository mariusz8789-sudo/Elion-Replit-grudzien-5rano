/**
 * Biological Data Integration (Genesis V3, Phase 8). Retrieval + provenance contract for public
 * biological databases. Injected fetch verifies: provenance-wrapped success, BLOCKED_BY_RUNTIME on
 * blocked egress (never fabricated), and parse failure. A real probe reflects the actual runtime.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveBiological, wrapProvenance, probeBiologicalSources, BIOLOGICAL_SOURCES, BIO_SERVICES } from './corpus/biologicalSources.mjs';

describe('biologicalSources — registry + provenance', () => {
  test('every source has an endpoint, licence, and entity kind', () => {
    for (const s of BIO_SERVICES) {
      const src = BIOLOGICAL_SOURCES[s];
      assert.ok(typeof src.url('X') === 'string' && src.license && src.kind);
    }
    for (const req of ['OPEN_TARGETS', 'ENSEMBL', 'REACTOME', 'GENE_ONTOLOGY', 'DISGENET', 'CLINICALTRIALS']) assert.ok(BIO_SERVICES.includes(req));
  });

  test('wrapProvenance attaches source URL, accession, licence, epistemic status', () => {
    const w = wrapProvenance('OPEN_TARGETS', 'ENSG00000157764', { x: 1 }, { retrievedAt: 'T', version: '24.06', confidence: 0.7 });
    assert.equal(w.accession, 'ENSG00000157764');
    assert.match(w.sourceUrl, /opentargets/);
    assert.equal(w.epistemicStatus, 'DATABASE_REPORTED');
    assert.equal(w.confidence, 0.7);
    assert.equal(w.provenanceComplete, true);
  });
});

describe('biologicalSources — retrieval (injected fetch)', () => {
  test('successful fetch → provenance-wrapped record', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: JSON.stringify({ id: 'R-HSA-1', version: '88', displayName: 'pathway' }) });
    const r = await retrieveBiological({ service: 'REACTOME', id: 'R-HSA-1', fetchImpl, retrievedAt: '2026-01-01' });
    assert.equal(r.status, 'COMPLETED');
    assert.equal(r.record.service, 'REACTOME');
    assert.equal(r.record.version, '88');
    assert.equal(r.record.raw.displayName, 'pathway');
    assert.match(r.record.sourceUrl, /reactome/);
  });

  test('blocked egress (403 / CONNECT tunnel) → BLOCKED_BY_RUNTIME, no data fabricated', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, error: 'CONNECT tunnel failed' });
    const r = await retrieveBiological({ service: 'DISGENET', id: '673', fetchImpl });
    assert.equal(r.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(r.record, undefined);
    assert.match(r.reason, /no data fabricated/);
    assert.match(r.attemptedUrl, /disgenet/);
  });

  test('network error → BLOCKED_BY_RUNTIME with attempted URL', async () => {
    const fetchImpl = async () => ({ ok: false, error: 'ENOTFOUND' });
    const r = await retrieveBiological({ service: 'ENSEMBL', id: 'ENSG1', fetchImpl });
    assert.equal(r.status, 'BLOCKED_BY_RUNTIME');
    assert.ok(r.attemptedUrl.includes('ensembl'));
  });

  test('malformed payload → PARSE_FAILURE (never a fabricated record)', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: 'not json' });
    const r = await retrieveBiological({ service: 'CLINICALTRIALS', id: 'NCT01', fetchImpl });
    assert.equal(r.status, 'PARSE_FAILURE');
  });

  test('unknown source / missing id → INVALID_INPUT', async () => {
    assert.equal((await retrieveBiological({ service: 'NOPE', id: 'x' })).status, 'INVALID_INPUT');
    assert.equal((await retrieveBiological({ service: 'ENSEMBL' })).status, 'INVALID_INPUT');
  });
});

describe('biologicalSources — probe', () => {
  test('probe reports BLOCKED for all sources under blocked egress (injected)', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, error: 'CONNECT tunnel failed' });
    const p = await probeBiologicalSources({ fetchImpl });
    assert.equal(p.anyReachable, false);
    assert.ok(p.sources.every((s) => s.status === 'BLOCKED_BY_RUNTIME'));
    assert.equal(p.sources.length, BIO_SERVICES.length);
  });
});
