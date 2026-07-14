import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { runJob } from './compute/jobs.mjs';
import { detect } from './compute/rdkitAdapter.mjs';

/**
 * Router API Kampanii Naukowej (Scientific Acceleration Engine). Dowodzi, że
 * warstwa HTTP realnie tworzy/uruchamia/inspekcjonuje kampanię, egzekwuje RBAC i
 * limity zasobów — bez atrap. Bieg realnej kampanii pomijany bez RDKit.
 */
const RDKIT = detect().available;

let db;
beforeEach(() => { db = openDatabase(); });

function call(method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}
function register(email) {
  return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
}
function makeProject(token) {
  return call('POST', '/api/projects', { token, body: { name: 'Camp' } }).body.project;
}

describe('toolchain registry route', () => {
  test('GET /api/compute/toolchain lists engines (public)', () => {
    const r = call('GET', '/api/compute/toolchain');
    assert.equal(r.status, 200);
    const rdkit = r.body.toolchain.find((t) => t.toolId === 'rdkit');
    assert.ok(rdkit);
    assert.equal(rdkit.license, 'BSD-3-Clause');
    // Status ustalony w runtime realną walidacją; nie jest zmyślony.
    assert.ok(['AVAILABLE', 'BLOCKED_BY_RUNTIME', 'VALIDATION_FAILED'].includes(rdkit.status));
  });
});

describe('campaign CRUD + RBAC + resource limits', () => {
  test('create requires editor, validates domain and starting molecules, clamps budget', () => {
    const owner = register('owner1@lab.org');
    const project = makeProject(owner.token);

    // Brak molekuł startowych → 400.
    assert.equal(call('POST', `/api/projects/${project.id}/campaigns`, { token: owner.token, body: { objective: 'x', startingSmiles: [] } }).status, 400);
    // Niewspierana domena → 400 (jawna luka, nie faked).
    assert.equal(call('POST', `/api/projects/${project.id}/campaigns`, { token: owner.token, body: { objective: 'x', domain: 'MATERIALS', startingSmiles: ['c1ccccc1'] } }).status, 400);

    // Poprawne utworzenie: budżet ponad limit zostaje przycięty (P14).
    const created = call('POST', `/api/projects/${project.id}/campaigns`, {
      token: owner.token,
      body: { objective: 'MPO benchmark', startingSmiles: ['c1ccccc1', 'Oc1ccccc1'], budget: { maxGenerations: 999, maxGeneratedCandidates: 99999 } },
    });
    assert.equal(created.status, 201);
    const c = created.body.campaign;
    assert.equal(c.status, 'created');
    assert.ok(c.budget.maxGenerations <= 8, 'twardy limit generacji');
    assert.ok(c.budget.maxGeneratedCandidates <= 400, 'twardy limit kandydatów');

    // Widoczne na liście.
    const list = call('GET', `/api/projects/${project.id}/campaigns`, { token: owner.token });
    assert.equal(list.body.campaigns.length, 1);

    // Inspekcja przed startem: liczniki zerowe (żadnych fałszywych liczb).
    const insp = call('GET', `/api/projects/${project.id}/campaigns/${c.id}`, { token: owner.token });
    assert.equal(insp.status, 200);
    assert.equal(insp.body.campaign.stats.candidatesGenerated, 0);
    assert.equal(insp.body.campaign.stats.retained, 0);
  });

  test('viewer cannot create or start a campaign (RBAC)', () => {
    const owner = register('owner2@lab.org');
    const viewer = register('viewer2@lab.org');
    const project = makeProject(owner.token);
    call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'viewer2@lab.org', role: 'viewer' } });

    assert.equal(call('POST', `/api/projects/${project.id}/campaigns`, { token: viewer.token, body: { objective: 'x', startingSmiles: ['c1ccccc1'] } }).status, 403);

    const c = call('POST', `/api/projects/${project.id}/campaigns`, { token: owner.token, body: { objective: 'x', startingSmiles: ['c1ccccc1'] } }).body.campaign;
    assert.equal(call('POST', `/api/projects/${project.id}/campaigns/${c.id}/start`, { token: viewer.token }).status, 403);
  });
});

describe('campaign execution over the API (real RDKit)', () => {
  test('start runs the real orchestrator; inspect/graph/why reflect persisted evidence', async (t) => {
    if (!RDKIT) return t.skip('RDKit niedostępny — zdolność BLOCKED_BY_RUNTIME (uczciwy stan).');
    const owner = register('owner3@lab.org');
    const project = makeProject(owner.token);
    const c = call('POST', `/api/projects/${project.id}/campaigns`, {
      token: owner.token,
      body: { objective: 'MPO benchmark (software validation)', startingSmiles: ['c1ccccc1'], budget: { maxGenerations: 1, maxGeneratedCandidates: 8 } },
    }).body.campaign;

    // Start → 202 z jobId (wykonanie w tle przez system zadań).
    const started = call('POST', `/api/projects/${project.id}/campaigns/${c.id}/start`, { token: owner.token });
    assert.equal(started.status, 202);
    assert.ok(started.body.jobId);

    // Wykonaj zadanie synchronicznie w teście (idempotentne z zaplanowanym setImmediate).
    await runJob(db, started.body.jobId);

    const insp = call('GET', `/api/projects/${project.id}/campaigns/${c.id}`, { token: owner.token }).body.campaign;
    assert.equal(insp.status, 'completed');
    assert.ok(insp.stats.candidatesGenerated >= 1);
    assert.ok(insp.stats.retained >= 1);
    assert.ok(['STOP_RESOURCE_LIMIT', 'STOP_NO_IMPROVEMENT', 'STOP_OBJECTIVE_REACHED'].includes(insp.stopReason));

    // Graf odkryć zbudowany z realnych danych.
    const graph = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/graph`, { token: owner.token }).body.graph;
    assert.ok(graph.nodes.length >= 2 && graph.edges.length >= 1);

    // WHY dla konkretnego kandydata → dowód z utrwalonego Scientific Run.
    const cands = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/candidates`, { token: owner.token }).body.candidates;
    const child = cands.find((x) => x.transformation);
    const why = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/why`, { token: owner.token, query: { kind: 'engine', candidate: child.id } }).body.why;
    assert.equal(why.ok, true);
    assert.ok(why.answer.includes('chem-rdkit-descriptors'));

    // WHY stop
    const whyStop = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/why`, { token: owner.token, query: { kind: 'stop' } }).body.why;
    assert.equal(whyStop.ok, true);
  });
});
