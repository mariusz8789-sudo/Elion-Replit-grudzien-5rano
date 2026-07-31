/**
 * GET /api/science/capabilities (V3 Phase 6 backend) — real runtime capability status for the
 * Discovery Workspace. Public, no fabrication: engine availability from live detects, off-target
 * panel + KG schema + biological-source registry are real definitions; blocked sources say so.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from './api.mjs';

describe('GET /api/science/capabilities', () => {
  const res = handleApi(null, { method: 'GET', pathname: '/api/science/capabilities', token: null, body: null, query: {} });

  test('returns 200 with real capability status (public, no token)', () => {
    assert.equal(res.status, 200);
    const c = res.body.capabilities;
    assert.equal(c.version, 'genesis-science-capabilities/1');
    for (const e of ['rdkit', 'admet', 'docking', 'molecularDynamics', 'mmGbsa']) assert.ok(e in c.engines, e);
    assert.ok(typeof c.engines.rdkit.available === 'boolean');
  });

  test('off-target panel lists named human proteins; KG schema + bio registry present', () => {
    const c = res.body.capabilities;
    assert.ok(c.offTarget.panel.length >= 10 && c.offTarget.panel.every((p) => p.gene && p.protein));
    assert.equal(c.offTarget.epistemicStatus, 'MODEL_INFERRED');
    assert.ok(c.knowledgeGraph.nodeTypes.includes('Protein') && c.knowledgeGraph.provenanceRequired === true);
    assert.ok(c.biologicalSources.length >= 6 && c.biologicalSources.every((s) => /BLOCKED_BY_RUNTIME/.test(s.liveRetrieval)));
  });

  test('unknown science route → 404', () => {
    assert.equal(handleApi(null, { method: 'GET', pathname: '/api/science/nope', token: null, body: null, query: {} }).status, 404);
  });
});
