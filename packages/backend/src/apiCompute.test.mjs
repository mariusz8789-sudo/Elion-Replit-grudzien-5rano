import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/** Backend Compute Engine przez router API (żywa baza in-memory). */

let db;
beforeEach(() => { db = openDatabase(); });
const call = (method, pathname, o = {}) => handleApi(db, { method, pathname, token: o.token, body: o.body, query: o.query });
function reg(email) {
  return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
}

describe('compute API', () => {
  test('models list + detail are public (no token)', () => {
    const list = call('GET', '/api/compute/models');
    assert.equal(list.status, 200);
    assert.ok(list.body.models.length >= 10);
    const one = call('GET', '/api/compute/models/nuclear-semf');
    assert.equal(one.status, 200);
    assert.equal(one.body.model.id, 'nuclear-semf');
    assert.equal(call('GET', '/api/compute/models/nope').status, 404);
  });

  test('run without project is ephemeral (persisted:false) and returns provenance', () => {
    const r = call('POST', '/api/compute/run', { body: { modelId: 'sr-lorentz', inputs: { velocityFraction: 0.8 } } });
    assert.equal(r.status, 200);
    assert.equal(r.body.persisted, false);
    assert.equal(r.body.run.status, 'ok');
    assert.ok(Math.abs(r.body.run.outputs.lorentzGammaFactor - 1.66667) < 0.001);
    assert.ok(r.body.run.provenance.formula.length > 0);
  });

  test('invalid inputs → 400 rejected; unknown model → 500 error surfaced', () => {
    assert.equal(call('POST', '/api/compute/run', { body: { modelId: 'sr-lorentz', inputs: { velocityFraction: 2 } } }).status, 400);
    assert.equal(call('POST', '/api/compute/run', { body: { modelId: 'ghost', inputs: {} } }).status, 500);
  });

  test('run with project persists (editor+) and appears in project runs', () => {
    const owner = reg('owner@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'Compute' } }).body.project;
    const r = call('POST', '/api/compute/run', {
      token: owner.token,
      body: { modelId: 'nuclear-semf', inputs: { protonNumber: 26, neutronNumber: 30 }, projectId: p.id },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.persisted, true);
    const runs = call('GET', `/api/projects/${p.id}/runs`, { token: owner.token });
    assert.equal(runs.body.runs.length, 1);
    assert.equal(runs.body.runs[0].modelId, 'nuclear-semf');
    assert.ok(Math.abs(runs.body.runs[0].outputs.bindingPerNucleon - 8.896) < 0.2);
  });

  test('persisting to a project requires membership + editor role', () => {
    const owner = reg('owner@lab.org');
    const viewer = reg('viewer@lab.org');
    const stranger = reg('stranger@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'P' } }).body.project;
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'viewer@lab.org', role: 'viewer' } });

    // non-member → 404 (no existence leak)
    assert.equal(call('POST', '/api/compute/run', { token: stranger.token, body: { modelId: 'sr-lorentz', inputs: {}, projectId: p.id } }).status, 404);
    // viewer → 403
    assert.equal(call('POST', '/api/compute/run', { token: viewer.token, body: { modelId: 'sr-lorentz', inputs: {}, projectId: p.id } }).status, 403);
    // unauthenticated + projectId → 401
    assert.equal(call('POST', '/api/compute/run', { body: { modelId: 'sr-lorentz', inputs: {}, projectId: p.id } }).status, 401);
  });
});
