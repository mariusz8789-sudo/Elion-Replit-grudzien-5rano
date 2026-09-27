/**
 * Autonomous Discovery Forge — HTTP router tests (Final WOW Mandate product surface).
 * Runs a small REAL campaign through the API path; asserts the contract, RBAC, and tenant
 * isolation. Uses tiny bounds so the real-RDKit run stays fast.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

let db;
beforeEach(() => { db = openDatabase(); });
const call = (m, p, o = {}) => handleApi(db, { method: m, pathname: p, ...o });
const user = (e) => call('POST', '/api/auth/register', { body: { email: e, password: 'password123' } }).body.token;
const project = (t, n = 'P') => call('POST', '/api/projects', { token: t, body: { name: n } }).body.project.id;
const SEED = { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1' };
const VALID_STATUS = new Set(['COMPLETED_WITH_COMPUTATIONAL_CANDIDATES', 'COMPLETED_NO_SURVIVORS']);

describe('discovery-campaigns API', () => {
  test('POST runs a real bounded campaign and returns a dossier (computational candidates only)', () => {
    const t = user('d1@x.io'); const p = project(t);
    const r = call('POST', `/api/projects/${p}/discovery-campaigns`, { token: t, body: { seeds: [SEED], challenge: { grandChallenge: 'demo', maxMolWt: 320, maxAlerts: 0 }, maxGenerations: 2, maxCandidatesPerGen: 6 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(VALID_STATUS.has(r.body.status));
    assert.ok(r.body.dossier);
    assert.match(r.body.dossier.classification, /COMPUTATIONAL_CANDIDATE/);
    assert.match(r.body.dossier.limitationStatement, /not experimentally validated/);
    // Docking/MD/QM must be honestly blocked (no receptor/system/QM question).
    const blocked = r.body.dossier.enginesSkipped.map((e) => e.engine);
    assert.ok(blocked.includes('AutoDock Vina') && blocked.includes('OpenMM'));
  });

  test('empty seeds → 400 (never a fabricated campaign)', () => {
    const t = user('d2@x.io'); const p = project(t);
    assert.equal(call('POST', `/api/projects/${p}/discovery-campaigns`, { token: t, body: { seeds: [] } }).status, 400);
  });

  test('viewer cannot run a campaign (RBAC editor+)', () => {
    const owner = user('d3o@x.io'); const p = project(owner);
    const viewer = user('d3v@x.io');
    call('POST', `/api/projects/${p}/members`, { token: owner, body: { email: 'd3v@x.io', role: 'viewer' } });
    assert.equal(call('POST', `/api/projects/${p}/discovery-campaigns`, { token: viewer, body: { seeds: [SEED] } }).status, 403);
  });

  test('list + get + dossier work; cross-tenant access is 404', () => {
    const t = user('d4@x.io'); const p = project(t);
    const cid = call('POST', `/api/projects/${p}/discovery-campaigns`, { token: t, body: { seeds: [SEED], maxGenerations: 1, maxCandidatesPerGen: 4 } }).body.campaignId;
    assert.equal(call('GET', `/api/projects/${p}/discovery-campaigns`, { token: t }).body.campaigns.length, 1);
    assert.equal(call('GET', `/api/projects/${p}/discovery-campaigns/${cid}`, { token: t }).body.campaign.id, cid);
    assert.ok(call('GET', `/api/projects/${p}/discovery-campaigns/${cid}/dossier`, { token: t }).body.dossier.dossierHash);
    const other = user('d4b@x.io');
    assert.equal(call('GET', `/api/projects/${p}/discovery-campaigns/${cid}`, { token: other }).status, 404);
    assert.equal(call('GET', `/api/projects/${p}/discovery-campaigns/${cid}/dossier`, { token: other }).status, 404);
  });
});
