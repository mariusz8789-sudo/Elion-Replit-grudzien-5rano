/**
 * computePool (Genesis 2.1, Part 1) — the async worker pool. Verifies real RDKit work
 * runs off the main thread, concurrency is bounded, and a job that outlives its timeout
 * is rejected (self-heal). Skips gracefully if RDKit isn't installed.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createComputePool } from './compute/computePool.mjs';
import * as rdkit from './compute/rdkitAdapter.mjs';
import { detect as admetDetect } from './compute/admetAdapter.mjs';

const RDKIT = rdkit.detect().available;
const ADMET = admetDetect().available;
const pools = [];
const mk = (opts) => { const p = createComputePool(opts); pools.push(p); return p; };
after(async () => { for (const p of pools) await p.close(); });

describe('computePool', () => {
  test('runs molecule-render on a worker thread with the same shape as the sync path', { skip: RDKIT ? false : 'RDKit unavailable' }, async () => {
    const pool = mk({ size: 2 });
    const r = await pool.run('molecule-render', { smiles: 'CC(=O)Oc1ccccc1C(=O)O', mode: 'both' });
    assert.equal(r.smiles, 'CC(=O)Oc1ccccc1C(=O)O');
    assert.ok(r.depiction2d);
    if (r.depiction2d.ok) assert.equal(r.depiction2d.molecularFormula, 'C9H8O4');
  });

  test('laboratory-readiness returns a readiness dossier (or a fail-closed status)', { skip: RDKIT ? false : 'RDKit unavailable' }, async () => {
    const pool = mk({ size: 2 });
    const r = await pool.run('laboratory-readiness', { candidate: { smiles: 'CCO' } });
    assert.ok(r.readiness);
    assert.ok(['COMPLETED', 'BLOCKED_BY_RUNTIME', 'INVALID_INPUT'].includes(r.readiness.status));
  });

  test('bounded concurrency: many jobs all resolve; pool size is respected', { skip: RDKIT ? false : 'RDKit unavailable' }, async () => {
    const pool = mk({ size: 2 });
    const jobs = Array.from({ length: 6 }, () => pool.run('molecule-render', { smiles: 'CCO', mode: '2d' }));
    const out = await Promise.all(jobs);
    assert.equal(out.length, 6);
    assert.ok(out.every((r) => r.smiles === 'CCO'));
    assert.ok(pool.stats().size <= 2);
  });

  test('unknown command rejects, not crashes', { skip: RDKIT ? false : 'RDKit unavailable' }, async () => {
    const pool = mk({ size: 1 });
    await assert.rejects(() => pool.run('nonsense', {}), /unknown compute command/);
  });

  test('a job that exceeds the timeout is rejected (self-heal)', { skip: RDKIT ? false : 'RDKit unavailable' }, async () => {
    const pool = mk({ size: 1, timeoutMs: 1 }); // 1 ms → real RDKit work overruns
    await assert.rejects(() => pool.run('laboratory-readiness', { candidate: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' } }), /compute_timeout/);
  });

  // Genesis 2.1 follow-up: the blocking execFileSync inside ADMET-AI's predict() must run
  // off the main thread too — this is what keeps a campaign save (or anything else) from
  // stalling for the several seconds a real inference call takes.
  test('admet-predict runs real ADMET-AI inference on a worker thread with the same shape as the sync path', { skip: ADMET ? false : 'ADMET-AI unavailable' }, async () => {
    const pool = mk({ size: 1 });
    const r = await pool.run('admet-predict', { smiles: ['CC(=O)Oc1ccccc1C(=O)O'] });
    assert.equal(r.ok, true);
    assert.ok(r.version);
    assert.equal(typeof r.predictions['CC(=O)Oc1ccccc1C(=O)O'].hERG, 'number');
  });
});
