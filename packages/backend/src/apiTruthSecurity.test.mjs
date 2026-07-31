/**
 * ZEFIR Truth Engine — hostile application-level authorization audit (Verification Mandate
 * Mission 2). NOT a penetration test. Proves fail-closed behavior: a client-controlled
 * project_id/tenant identifier can never override the authenticated authorization context,
 * and no cross-tenant read/enumeration/influence is possible.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import * as fk from './cognitive/formalKernel.mjs';

let db;
beforeEach(() => { db = openDatabase(); });
const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });
function user(email) { return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body.token; }
function project(token, name) { return call('POST', '/api/projects', { token, body: { name } }).body.project.id; }
const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };
const runBody = { claimedResult: 'x', equations: [FMA], assumptions: ['a'] };

describe('hostile tenant authorization audit', () => {
  test('cross-tenant Truth Analysis read is 404 (no existence leak)', () => {
    const a = user('a1@x.io'); const pa = project(a, 'A');
    const created = call('POST', `/api/projects/${pa}/truth-analyses`, { token: a, body: runBody });
    const id = created.body.analysis.id;
    const b = user('b1@x.io');
    assert.equal(call('GET', `/api/projects/${pa}/truth-analyses/${id}`, { token: b }).status, 404);
  });

  test('cross-tenant certificate read is 404', () => {
    const a = user('a2@x.io'); const pa = project(a, 'A');
    const id = call('POST', `/api/projects/${pa}/truth-analyses`, { token: a, body: runBody }).body.analysis.id;
    const b = user('b2@x.io');
    assert.equal(call('GET', `/api/projects/${pa}/truth-analyses/${id}/certificate`, { token: b }).status, 404);
  });

  test('cross-tenant history enumeration is 404 (cannot list another tenant analyses)', () => {
    const a = user('a3@x.io'); const pa = project(a, 'A');
    call('POST', `/api/projects/${pa}/truth-analyses`, { token: a, body: runBody });
    const b = user('b3@x.io');
    assert.equal(call('GET', `/api/projects/${pa}/truth-analyses`, { token: b }).status, 404);
  });

  test('cross-tenant Necropolis assessment: B is NOT influenced by A memory', () => {
    const a = user('a4@x.io'); const pa = project(a, 'A');
    const b = user('b4@x.io'); const pb = project(b, 'B');
    call('POST', `/api/projects/${pa}/necropolis/failures`, { token: a, body: { failureClass: 'F', context: 'r', parameterVector: { T: 900 }, scales: { T: 900 } } });
    const res = call('POST', `/api/projects/${pb}/truth-analyses`, { token: b, body: { ...runBody, context: 'r', parameterVector: { T: 905 }, scales: { T: 900 } } });
    assert.notEqual(res.body.analysis.decision.decision, 'BLOCK');
  });

  test('cross-tenant Necropolis export is 404 for a non-member', () => {
    const a = user('a5@x.io'); const pa = project(a, 'A');
    const b = user('b5@x.io');
    assert.equal(call('GET', `/api/projects/${pa}/necropolis/export`, { token: b }).status, 404);
  });

  test('cross-tenant Necropolis import is 404 for a non-member (cannot inject into A)', () => {
    const a = user('a6@x.io'); const pa = project(a, 'A');
    const b = user('b6@x.io');
    const artifact = { schema: 'zefir-necropolis/1', projectId: 'X', regions: [{ failureClass: 'F', normalized: { T: 1 }, context: 'r' }] };
    assert.equal(call('POST', `/api/projects/${pa}/necropolis/import`, { token: b, body: { artifact } }).status, 404);
  });

  test('forged / non-existent project ID is 404', () => {
    const a = user('a7@x.io');
    assert.equal(call('POST', `/api/projects/does-not-exist/truth-analyses`, { token: a, body: runBody }).status, 404);
    assert.equal(call('GET', `/api/projects/does-not-exist/necropolis`, { token: a }).status, 404);
  });

  test('valid token with insufficient RBAC (viewer) cannot run / record / export', () => {
    const owner = user('own8@x.io'); const p = project(owner, 'P');
    const viewer = user('view8@x.io');
    call('POST', `/api/projects/${p}/members`, { token: owner, body: { email: 'view8@x.io', role: 'viewer' } });
    assert.equal(call('POST', `/api/projects/${p}/truth-analyses`, { token: viewer, body: runBody }).status, 403);
    assert.equal(call('POST', `/api/projects/${p}/necropolis/failures`, { token: viewer, body: { failureClass: 'F', parameterVector: { T: 1 } } }).status, 403);
    assert.equal(call('GET', `/api/projects/${p}/necropolis/export`, { token: viewer }).status, 403);
    // A viewer CAN read (viewer+): history + necropolis stats.
    assert.equal(call('GET', `/api/projects/${p}/truth-analyses`, { token: viewer }).status, 200);
  });

  test('editor cannot export (admin+ only) — RBAC ladder is enforced', () => {
    const owner = user('own9@x.io'); const p = project(owner, 'P');
    const editor = user('ed9@x.io');
    call('POST', `/api/projects/${p}/members`, { token: owner, body: { email: 'ed9@x.io', role: 'editor' } });
    assert.equal(call('POST', `/api/projects/${p}/truth-analyses`, { token: editor, body: runBody }).status, 201); // editor CAN run
    assert.equal(call('GET', `/api/projects/${p}/necropolis/export`, { token: editor }).status, 403);          // but NOT export
  });

  test('unauthenticated request is 401', () => {
    const a = user('a10@x.io'); const p = project(a, 'A');
    assert.equal(call('POST', `/api/projects/${p}/truth-analyses`, { body: runBody }).status, 401);
    assert.equal(call('GET', `/api/projects/${p}/truth-analyses`, { token: 'garbage-token' }).status, 401);
  });

  test('malformed analysis ID is 404, not a crash or a leak', () => {
    const a = user('a11@x.io'); const p = project(a, 'A');
    assert.equal(call('GET', `/api/projects/${p}/truth-analyses/${'../../etc/passwd'}`, { token: a }).status, 404);
    assert.equal(call('GET', `/api/projects/${p}/truth-analyses/${"'; DROP TABLE truth_analyses;--"}`, { token: a }).status, 404);
  });

  test('CRITICAL: a body-supplied projectId cannot override the URL/authorization context', () => {
    const a = user('a12@x.io'); const pa = project(a, 'A');
    const b = user('b12@x.io'); const pb = project(b, 'B');
    // Attacker A records a dead end in their OWN project, then tries to make a run "belong" to B
    // by injecting projectId=pb in the body. The engine must scope by the URL project (pa), not the body.
    call('POST', `/api/projects/${pa}/necropolis/failures`, { token: a, body: { failureClass: 'F', context: 'r', parameterVector: { T: 900 }, scales: { T: 900 } } });
    const res = call('POST', `/api/projects/${pa}/truth-analyses`, { token: a, body: { ...runBody, projectId: pb, project_id: pb, tenant: pb, context: 'r', parameterVector: { T: 905 }, scales: { T: 900 } } });
    // The analysis is scoped to pa (A sees its own dead end → BLOCK), and it is stored under pa, never pb.
    assert.equal(res.body.analysis.decision.decision, 'BLOCK');
    assert.equal(call('GET', `/api/projects/${pb}/truth-analyses`, { token: b }).body.analyses.length, 0, 'nothing leaked into tenant B');
    assert.equal(call('GET', `/api/projects/${pa}/truth-analyses`, { token: a }).body.analyses.length, 1);
  });

  test('duplicate import is idempotent (no double influence), modified artifact re-hashes under destination', () => {
    const a = user('a13@x.io'); const pa = project(a, 'A');
    call('POST', `/api/projects/${pa}/necropolis/failures`, { token: a, body: { failureClass: 'F', context: 'r', parameterVector: { T: 900 }, scales: { T: 900 } } });
    const artifact = call('GET', `/api/projects/${pa}/necropolis/export`, { token: a }).body.artifact;
    const b = user('b13@x.io'); const pb = project(b, 'B');
    assert.equal(call('POST', `/api/projects/${pb}/necropolis/import`, { token: b, body: { artifact } }).body.result.imported, 1);
    assert.equal(call('POST', `/api/projects/${pb}/necropolis/import`, { token: b, body: { artifact } }).body.result.imported, 0); // dup
    // Tamper with the artifact's declared projectId — import still lands under B (URL), de-duplicated.
    const tampered = { ...artifact, projectId: 'evil-corp' };
    assert.equal(call('POST', `/api/projects/${pb}/necropolis/import`, { token: b, body: { artifact: tampered } }).body.result.imported, 0);
    assert.equal(call('GET', `/api/projects/${pb}/necropolis`, { token: b }).body.necropolis.total, 1);
  });
});
