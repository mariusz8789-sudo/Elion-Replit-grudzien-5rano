import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * Scientific Git przez router API (żywa baza in-memory). Sprawdza gałęzie,
 * odgałęzianie, zgłoszenia scalenia, recenzję z RBAC i graf kontrybucji —
 * dokładnie tak, jak zadziała przez HTTP.
 */

let db;
beforeEach(() => { db = openDatabase(); });

function call(method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}
function reg(email) {
  const r = call('POST', '/api/auth/register', { body: { email, password: 'password123' } });
  return r.body;
}
function project(token, name = 'P') {
  return call('POST', '/api/projects', { token, body: { name } }).body.project;
}

describe('branches API', () => {
  test('a fresh project exposes a main branch', () => {
    const { token } = reg('a@lab.org');
    const p = project(token);
    const r = call('GET', `/api/projects/${p.id}/branches`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.branches.length, 1);
    assert.equal(r.body.branches[0].name, 'main');
  });

  test('editor+ can create a branch; viewer cannot', () => {
    const owner = reg('owner@lab.org');
    const viewer = reg('viewer@lab.org');
    const p = project(owner.token);
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'viewer@lab.org', role: 'viewer' } });

    const okc = call('POST', `/api/projects/${p.id}/branches`, { token: owner.token, body: { name: 'hipoteza-A' } });
    assert.equal(okc.status, 201);
    assert.equal(okc.body.branch.name, 'hipoteza-A');

    const denied = call('POST', `/api/projects/${p.id}/branches`, { token: viewer.token, body: { name: 'z' } });
    assert.equal(denied.status, 403);
  });

  test('reserved name main and duplicates are rejected', () => {
    const { token } = reg('a@lab.org');
    const p = project(token);
    assert.equal(call('POST', `/api/projects/${p.id}/branches`, { token, body: { name: 'main' } }).status, 400);
    call('POST', `/api/projects/${p.id}/branches`, { token, body: { name: 'dup' } });
    assert.equal(call('POST', `/api/projects/${p.id}/branches`, { token, body: { name: 'dup' } }).status, 409);
  });

  test('fork=true copies trials into the new branch', () => {
    const { token } = reg('a@lab.org');
    const p = project(token);
    call('POST', `/api/projects/${p.id}/trials`, { token, body: { experimentId: 'e', params: { x: 1 }, outputs: { y: 2 } } });
    const branch = call('POST', `/api/projects/${p.id}/branches`, { token, body: { name: 'w', fork: true } }).body.branch;
    const trials = call('GET', `/api/projects/${p.id}/trials`, { token, query: { branchId: branch.id } }).body.trials;
    assert.equal(trials.length, 1);
    assert.deepEqual(trials[0].params, { x: 1 });
  });

  test('a trial can target a specific branch; foreign branch is rejected', () => {
    const owner = reg('owner@lab.org');
    const other = reg('other@lab.org');
    const p = project(owner.token);
    const op = project(other.token, 'Other');
    const foreign = call('GET', `/api/projects/${op.id}/branches`, { token: other.token }).body.branches[0];
    const bad = call('POST', `/api/projects/${p.id}/trials`, { token: owner.token, body: { experimentId: 'e', params: {}, outputs: {}, branchId: foreign.id } });
    assert.equal(bad.status, 400);
  });
});

describe('merge requests API', () => {
  function setup() {
    const owner = reg('owner@lab.org');
    const p = project(owner.token);
    const main = call('GET', `/api/projects/${p.id}/branches`, { token: owner.token }).body.branches[0];
    const feature = call('POST', `/api/projects/${p.id}/branches`, { token: owner.token, body: { name: 'feature' } }).body.branch;
    call('POST', `/api/projects/${p.id}/trials`, { token: owner.token, body: { experimentId: 'e', params: { x: 9 }, outputs: { y: 1 }, branchId: feature.id } });
    return { owner, p, main, feature };
  }

  test('editor+ opens a merge request; admin+ approves and it merges', () => {
    const { owner, p, main, feature } = setup();
    const mr = call('POST', `/api/projects/${p.id}/merge-requests`, {
      token: owner.token, body: { sourceBranchId: feature.id, targetBranchId: main.id, title: 'Scal' },
    });
    assert.equal(mr.status, 201);
    assert.equal(mr.body.mergeRequest.status, 'open');

    const decided = call('POST', `/api/projects/${p.id}/merge-requests/${mr.body.mergeRequest.id}/decide`, {
      token: owner.token, body: { approve: true, reviewNote: 'ok' },
    });
    assert.equal(decided.status, 200);
    assert.equal(decided.body.mergeRequest.status, 'merged');

    const onMain = call('GET', `/api/projects/${p.id}/trials`, { token: owner.token, query: { branchId: main.id } }).body.trials;
    assert.equal(onMain.length, 1);
    assert.deepEqual(onMain[0].params, { x: 9 });
  });

  test('an editor (not admin) cannot approve a merge', () => {
    const { owner, p, main, feature } = setup();
    const editor = reg('editor@lab.org');
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'editor@lab.org', role: 'editor' } });

    const mr = call('POST', `/api/projects/${p.id}/merge-requests`, {
      token: editor.token, body: { sourceBranchId: feature.id, targetBranchId: main.id, title: 'X' },
    });
    assert.equal(mr.status, 201);
    const decided = call('POST', `/api/projects/${p.id}/merge-requests/${mr.body.mergeRequest.id}/decide`, {
      token: editor.token, body: { approve: true },
    });
    assert.equal(decided.status, 403);
  });

  test('rejecting merges nothing; deciding twice is 409', () => {
    const { owner, p, main, feature } = setup();
    const mr = call('POST', `/api/projects/${p.id}/merge-requests`, {
      token: owner.token, body: { sourceBranchId: feature.id, targetBranchId: main.id, title: 'X' },
    }).body.mergeRequest;
    const rej = call('POST', `/api/projects/${p.id}/merge-requests/${mr.id}/decide`, { token: owner.token, body: { approve: false } });
    assert.equal(rej.body.mergeRequest.status, 'rejected');
    assert.equal(call('GET', `/api/projects/${p.id}/trials`, { token: owner.token, query: { branchId: main.id } }).body.trials.length, 0);
    const again = call('POST', `/api/projects/${p.id}/merge-requests/${mr.id}/decide`, { token: owner.token, body: { approve: true } });
    assert.equal(again.status, 409);
  });

  test('same source and target branch is rejected', () => {
    const { owner, p, main } = setup();
    const bad = call('POST', `/api/projects/${p.id}/merge-requests`, {
      token: owner.token, body: { sourceBranchId: main.id, targetBranchId: main.id, title: 'X' },
    });
    assert.equal(bad.status, 400);
  });
});

describe('contribution graph API', () => {
  test('aggregates real trial authorship', () => {
    const { token } = reg('owner@lab.org');
    const p = project(token);
    call('POST', `/api/projects/${p.id}/trials`, { token, body: { experimentId: 'e', params: {}, outputs: {} } });
    call('POST', `/api/projects/${p.id}/trials`, { token, body: { experimentId: 'e', params: {}, outputs: {} } });
    const r = call('GET', `/api/projects/${p.id}/contributions`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.contributions.totalTrials, 2);
    assert.equal(r.body.contributions.contributors[0].trials, 2);
  });
});
