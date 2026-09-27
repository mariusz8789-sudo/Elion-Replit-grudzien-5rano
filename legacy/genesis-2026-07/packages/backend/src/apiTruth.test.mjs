/**
 * ZEFIR Truth Engine / R&D Kill-Switch — HTTP router tests (Commercial Hardening Phase 2).
 * Proves the product API runs the REAL engine (no hardcoded decisions), enforces RBAC and
 * project (tenant) isolation, validates input, and never turns malformed input into GO.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import * as fk from './cognitive/formalKernel.mjs';

let db;
beforeEach(() => { db = openDatabase(); });
const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });

function user(email, password = 'password123') {
  const r = call('POST', '/api/auth/register', { body: { email, password } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.token;
}
function project(token, name = 'Proj') {
  const r = call('POST', '/api/projects', { token, body: { name } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.project.id;
}
const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };
const EeqF = { symbol: 'E=F', terms: [{ symbol: 'E', dimension: fk.DIM.ENERGY }, { symbol: 'F', dimension: fk.DIM.FORCE }] };

describe('truth-analyses API', () => {
  test('POST runs the real engine and returns an explainable decision + hashed certificate', () => {
    const token = user('o1@lab.org'); const pid = project(token);
    const r = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body: { claimedResult: 'period ~ sqrt(l/g)', equations: [FMA], assumptions: ['small angle', 'rigid rod'] } });
    assert.equal(r.status, 201);
    assert.equal(r.body.analysis.decision.decision, 'GO');
    assert.match(r.body.analysis.certificate.decisionHash, /^[0-9a-f]{64}$/);
    assert.ok(r.body.analysis.stages.length >= 10);
  });

  test('a dimensionally inconsistent proposal with hype is BLOCKed (marketing changes nothing)', () => {
    const token = user('o2@lab.org'); const pid = project(token);
    const r = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body: { problemStatement: 'REVOLUTIONARY BREAKTHROUGH', claimedResult: 'E=F', equations: [EeqF], assumptions: ['a'] } });
    assert.equal(r.status, 201);
    assert.equal(r.body.analysis.decision.decision, 'BLOCK');
  });

  test('over-unity structured energy is BLOCKed via the constraint registry', () => {
    const token = user('o3@lab.org'); const pid = project(token);
    const r = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body: { claimedResult: 'free energy', assumptions: ['a'], energy: { input: 100, output: 150 } } });
    assert.equal(r.body.analysis.decision.decision, 'BLOCK');
  });

  test('empty proposal is 400 — never a silent GO', () => {
    const token = user('o4@lab.org'); const pid = project(token);
    const r = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body: {} });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'invalid_proposal');
  });

  test('viewer cannot run an analysis (RBAC editor+)', () => {
    const owner = user('owner5@lab.org'); const pid = project(owner);
    const viewer = user('viewer5@lab.org');
    call('POST', `/api/projects/${pid}/members`, { token: owner, body: { email: 'viewer5@lab.org', role: 'viewer' } });
    const r = call('POST', `/api/projects/${pid}/truth-analyses`, { token: viewer, body: { claimedResult: 'x', equations: [FMA], assumptions: ['a'] } });
    assert.equal(r.status, 403);
  });

  test('history and single retrieval + certificate work; non-member is 404 (tenant isolation)', () => {
    const token = user('o6@lab.org'); const pid = project(token);
    const created = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body: { claimedResult: 'x', equations: [FMA], assumptions: ['a'] } });
    const id = created.body.analysis.id;
    assert.ok(id);
    assert.equal(call('GET', `/api/projects/${pid}/truth-analyses`, { token }).body.analyses.length, 1);
    assert.equal(call('GET', `/api/projects/${pid}/truth-analyses/${id}`, { token }).body.analysis.decisionHash, created.body.analysis.certificate.decisionHash);
    assert.ok(call('GET', `/api/projects/${pid}/truth-analyses/${id}/certificate`, { token }).body.certificate.decisionHash);

    const outsider = user('outsider6@lab.org');
    assert.equal(call('GET', `/api/projects/${pid}/truth-analyses/${id}`, { token: outsider }).status, 404);
  });

  test('same canonical proposal → identical decision hash (reproducibility over HTTP)', () => {
    const token = user('o7@lab.org'); const pid = project(token);
    const body = { claimedResult: 'x', equations: [FMA], assumptions: ['a', 'b'] };
    const a = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body });
    const b = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body });
    assert.equal(a.body.analysis.certificate.decisionHash, b.body.analysis.certificate.decisionHash);
  });
});

describe('necropolis API (tenant-isolated)', () => {
  test('recording a failure then a matching proposal BLOCKs for the same tenant', () => {
    const token = user('n1@lab.org'); const pid = project(token);
    const rec = call('POST', `/api/projects/${pid}/necropolis/failures`, { token, body: { failureClass: 'FAILED_PARAMETER_REGION', context: 'reactor', domain: 'thermal', parameterVector: { T: 900 }, scales: { T: 900 } } });
    assert.equal(rec.status, 201);
    const r = call('POST', `/api/projects/${pid}/truth-analyses`, { token, body: { claimedResult: 'run at 905', equations: [FMA], assumptions: ['a'], context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } } });
    assert.equal(r.body.analysis.decision.decision, 'BLOCK');
  });

  test('tenant B is NOT blocked by tenant A necropolis (hostile isolation over the API)', () => {
    const tokA = user('a@lab.org'); const pidA = project(tokA, 'A');
    const tokB = user('b@lab.org'); const pidB = project(tokB, 'B');
    call('POST', `/api/projects/${pidA}/necropolis/failures`, { token: tokA, body: { failureClass: 'F', context: 'reactor', parameterVector: { T: 900 }, scales: { T: 900 } } });
    const r = call('POST', `/api/projects/${pidB}/truth-analyses`, { token: tokB, body: { claimedResult: 'run at 905', equations: [FMA], assumptions: ['a'], context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } } });
    assert.notEqual(r.body.analysis.decision.decision, 'BLOCK');
  });

  test('export requires admin+, import round-trips into another tenant', () => {
    const tokA = user('exp@lab.org'); const pidA = project(tokA, 'A');
    call('POST', `/api/projects/${pidA}/necropolis/failures`, { token: tokA, body: { failureClass: 'F', context: 'reactor', parameterVector: { T: 900 }, scales: { T: 900 } } });
    const exp = call('GET', `/api/projects/${pidA}/necropolis/export`, { token: tokA });
    assert.equal(exp.status, 200);
    assert.ok(exp.body.artifact.exportHash);

    const tokB = user('imp@lab.org'); const pidB = project(tokB, 'B');
    const imp = call('POST', `/api/projects/${pidB}/necropolis/import`, { token: tokB, body: { artifact: exp.body.artifact } });
    assert.equal(imp.status, 200);
    assert.equal(imp.body.result.imported, 1);
    assert.equal(call('GET', `/api/projects/${pidB}/necropolis`, { token: tokB }).body.necropolis.total, 1);
  });
});
