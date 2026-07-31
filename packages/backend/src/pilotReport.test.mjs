/**
 * Pilot report + analysis comparison tests (Verification Mandate Mission 4).
 * The report/comparison are built ENTIRELY from stored real analysis output — nothing
 * is recomputed. Also tested end-to-end through the real API path.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import * as te from './cognitive/truthEngine.mjs';
import * as pr from './cognitive/pilotReport.mjs';
import * as necro from './cognitive/necropolis.mjs';
import { getTruthAnalysis, listTruthAnalyses } from './store.mjs';
import * as fk from './cognitive/formalKernel.mjs';

const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };
const storedFor = (db, projectId, hash) => getTruthAnalysis(db, listTruthAnalyses(db, { projectId }).find((a) => a.decisionHash === hash).id);

describe('pilot report (from stored output)', () => {
  test('buildReport projects every required field from the stored certificate', () => {
    const db = openDatabase(':memory:');
    const out = te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['a'], energy: { input: 100, output: 200 } }, { db, projectId: 'p' });
    const rep = pr.buildReport(storedFor(db, 'p', out.certificate.decisionHash));
    assert.equal(rep.schema, 'zefir-pilot-report/1');
    assert.equal(rep.projectId, 'p');
    assert.equal(rep.finalDecision, 'BLOCK');
    assert.match(rep.decisionHash, /^[0-9a-f]{64}$/);
    assert.ok(rep.criticalFailures.length >= 1);
    assert.ok(rep.constraintFindings.some((c) => c.id === 'energy-balance'));
    assert.ok(rep.enginesExecuted.length >= 1);
    assert.ok(rep.limitationStatement.includes('NECESSARY, not sufficient'));
    assert.ok(rep.certificate.engineVersions.truthEngine);
    db.close();
  });

  test('report reflects Necropolis influence honestly', () => {
    const db = openDatabase(':memory:');
    necro.recordFailure(db, { projectId: 'p', failureClass: 'F', context: 'r', parameterVector: { T: 900 }, scales: { T: 900 } });
    const out = te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['a'], context: 'r', parameterVector: { T: 905 }, scales: { T: 900 } }, { db, projectId: 'p' });
    const rep = pr.buildReport(storedFor(db, 'p', out.certificate.decisionHash));
    assert.equal(rep.necropolisInfluence.influenced, true);
    assert.equal(rep.finalDecision, 'BLOCK');
    db.close();
  });

  test('compareReports shows decision change and Necropolis newly influencing the later run', () => {
    const db = openDatabase(':memory:');
    const before = te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['a'], context: 'r', parameterVector: { T: 905 }, scales: { T: 900 } }, { db, projectId: 'p' });
    necro.recordFailure(db, { projectId: 'p', failureClass: 'F', context: 'r', parameterVector: { T: 900 }, scales: { T: 900 } });
    const after = te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['a'], context: 'r', parameterVector: { T: 905 }, scales: { T: 900 } }, { db, projectId: 'p' });
    const cmp = pr.compareReports(storedFor(db, 'p', before.certificate.decisionHash), storedFor(db, 'p', after.certificate.decisionHash));
    assert.equal(cmp.decisionChanged, true);
    assert.equal(cmp.from !== cmp.to, true);
    assert.equal(cmp.to, 'BLOCK');
    assert.equal(cmp.necropolis.newlyInfluenced, true);
    db.close();
  });
});

describe('pilot report + compare over the real API', () => {
  let db; beforeEach(() => { db = openDatabase(); });
  const call = (m, p, o = {}) => handleApi(db, { method: m, pathname: p, ...o });
  const user = (e) => call('POST', '/api/auth/register', { body: { email: e, password: 'password123' } }).body.token;
  const project = (t) => call('POST', '/api/projects', { token: t, body: { name: 'P' } }).body.project.id;

  test('GET report returns a stored-output report; cross-tenant is 404', () => {
    const t = user('r1@x.io'); const p = project(t);
    const id = call('POST', `/api/projects/${p}/truth-analyses`, { token: t, body: { claimedResult: 'x', equations: [FMA], assumptions: ['a'], energy: { input: 100, output: 200 } } }).body.analysis.id;
    const rep = call('GET', `/api/projects/${p}/truth-analyses/${id}/report`, { token: t });
    assert.equal(rep.status, 200);
    assert.equal(rep.body.report.finalDecision, 'BLOCK');
    assert.ok(rep.body.report.limitationStatement.length > 40);
    const other = user('r1b@x.io');
    assert.equal(call('GET', `/api/projects/${p}/truth-analyses/${id}/report`, { token: other }).status, 404);
  });

  test('GET compare?a=&b= diffs two stored analyses; missing/foreign ids are 404', () => {
    const t = user('c1@x.io'); const p = project(t);
    const a = call('POST', `/api/projects/${p}/truth-analyses`, { token: t, body: { claimedResult: 'x', equations: [FMA], assumptions: ['a'] } }).body.analysis.id;
    const b = call('POST', `/api/projects/${p}/truth-analyses`, { token: t, body: { claimedResult: 'x', equations: [FMA], assumptions: ['a'], energy: { input: 100, output: 200 } } }).body.analysis.id;
    const cmp = call('GET', `/api/projects/${p}/truth-analyses/compare`, { token: t, query: { a, b } });
    assert.equal(cmp.status, 200);
    assert.equal(cmp.body.comparison.decisionChanged, true);
    assert.equal(cmp.body.comparison.to, 'BLOCK');
    assert.equal(call('GET', `/api/projects/${p}/truth-analyses/compare`, { token: t, query: { a, b: 'missing' } }).status, 404);
  });
});
