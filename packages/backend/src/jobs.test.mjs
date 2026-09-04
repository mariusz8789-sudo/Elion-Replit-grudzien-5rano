import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, createCandidate, createJob, getJob } from './store.mjs';
import { runJob, requestCancel } from './compute/jobs.mjs';
import { handleApi } from './api.mjs';
import { hashPassword } from './auth.mjs';

/** Compute Jobs (P5): runner + API. Batch candidate eval używa realnego silnika. */

function seed(db) {
  const u = createUser(db, { email: 'j@lab.org', displayName: 'J', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'Batch', ownerId: u.id });
  return { u, p };
}

describe('job runner', () => {
  test('batch-candidate-eval completes with a real ranking', async () => {
    const db = openDatabase();
    const { u, p } = seed(db);
    createCandidate(db, { projectId: p.id, label: 'a', formula: 'C6H6', composition: { C: 6, H: 6 }, molecularWeight: 78.11, createdBy: u.id });
    createCandidate(db, { projectId: p.id, label: 'b', formula: 'C60', composition: { C: 60 }, molecularWeight: 720.66, createdBy: u.id });
    const job = createJob(db, { projectId: p.id, type: 'batch-candidate-eval', params: {}, createdBy: u.id });
    await runJob(db, job.id);
    const done = getJob(db, job.id);
    assert.equal(done.status, 'completed');
    assert.equal(done.progress, 1);
    assert.equal(done.result.count, 2);
    assert.equal(done.result.ranking.length, 2);
    assert.equal(done.result.ranking[0].rankBasis.lipinskiMwPass, 1); // benzene ranks first
    assert.ok(done.runIds.length >= 2);
  });

  test('empty project → completed with count 0', async () => {
    const db = openDatabase();
    const { p } = seed(db);
    const job = createJob(db, { projectId: p.id, type: 'batch-candidate-eval' });
    await runJob(db, job.id);
    assert.equal(getJob(db, job.id).result.count, 0);
  });

  test('cancellation requested before run → cancelled, not completed', async () => {
    const db = openDatabase();
    const { u, p } = seed(db);
    createCandidate(db, { projectId: p.id, label: 'a', formula: 'C6H6', composition: { C: 6, H: 6 }, molecularWeight: 78.11, createdBy: u.id });
    const job = createJob(db, { projectId: p.id, type: 'batch-candidate-eval' });
    requestCancel(job.id);
    await runJob(db, job.id);
    assert.equal(getJob(db, job.id).status, 'cancelled');
  });

  test('unknown job type → failed', async () => {
    const db = openDatabase();
    const { p } = seed(db);
    const job = createJob(db, { projectId: p.id, type: 'nope' });
    await runJob(db, job.id);
    assert.equal(getJob(db, job.id).status, 'failed');
  });

  test('runJob is idempotent (only queued runs)', async () => {
    const db = openDatabase();
    const { p } = seed(db);
    const job = createJob(db, { projectId: p.id, type: 'batch-candidate-eval' });
    await runJob(db, job.id);
    const first = getJob(db, job.id).updatedAt;
    await runJob(db, job.id); // no-op (not queued)
    assert.equal(getJob(db, job.id).status, 'completed');
    assert.equal(getJob(db, job.id).updatedAt, first);
  });
});

describe('jobs API', () => {
  let db;
  beforeEach(() => { db = openDatabase(); });
  const call = (m, path, o = {}) => handleApi(db, { method: m, pathname: path, token: o.token, body: o.body });
  function reg(email) { return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body; }

  test('editor+ creates a queued job; runner completes it; visible via GET', async () => {
    const owner = reg('owner@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'P' } }).body.project;
    call('POST', `/api/projects/${p.id}/candidates`, { token: owner.token, body: { label: 'a', formula: 'C6H6' } });
    const created = call('POST', `/api/projects/${p.id}/jobs`, { token: owner.token, body: { type: 'batch-candidate-eval' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.job.status, 'queued');
    await runJob(db, created.body.job.id);
    const got = call('GET', `/api/projects/${p.id}/jobs/${created.body.job.id}`, { token: owner.token });
    assert.equal(got.body.job.status, 'completed');
    assert.equal(got.body.job.result.count, 1);
  });

  test('invalid job type → 400; viewer cannot create (403)', () => {
    const owner = reg('owner@lab.org');
    const viewer = reg('v@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'P' } }).body.project;
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'v@lab.org', role: 'viewer' } });
    assert.equal(call('POST', `/api/projects/${p.id}/jobs`, { token: owner.token, body: { type: 'ghost' } }).status, 400);
    assert.equal(call('POST', `/api/projects/${p.id}/jobs`, { token: viewer.token, body: { type: 'batch-candidate-eval' } }).status, 403);
  });

  test('cancelling a finished job → 409', async () => {
    const owner = reg('owner@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'P' } }).body.project;
    const j = call('POST', `/api/projects/${p.id}/jobs`, { token: owner.token, body: { type: 'batch-candidate-eval' } }).body.job;
    await runJob(db, j.id);
    assert.equal(call('POST', `/api/projects/${p.id}/jobs/${j.id}/cancel`, { token: owner.token }).status, 409);
  });
});
