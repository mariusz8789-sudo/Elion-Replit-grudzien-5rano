import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { runJob } from './compute/jobs.mjs';
import { detect } from './compute/rdkitAdapter.mjs';
import { detect as admetDetect } from './compute/admetAdapter.mjs';

/**
 * Router API Kampanii Naukowej (Scientific Acceleration Engine). Dowodzi, że
 * warstwa HTTP realnie tworzy/uruchamia/inspekcjonuje kampanię, egzekwuje RBAC i
 * limity zasobów — bez atrap. Bieg realnej kampanii pomijany bez RDKit.
 */
const RDKIT = detect().available;
const ADMET = admetDetect().available;

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
    // ADMET + toksyczność (jeden silnik, dwie zdolności) rejestrowane obok RDKit.
    const admet = r.body.toolchain.find((t) => t.toolId === 'admet');
    const tox = r.body.toolchain.find((t) => t.toolId === 'toxicity');
    assert.ok(admet && tox);
    assert.equal(admet.evidenceClass, 'MODEL_ESTIMATE');
    assert.ok(rdkit.package && rdkit.environment && rdkit.provenance);
    assert.equal(typeof rdkit.availability, 'boolean');
    assert.ok(['VALIDATED_REFERENCE_CASE', 'NOT_EXECUTED'].includes(rdkit.executionStatus));
    assert.match(rdkit.fingerprint, /^[a-f0-9]{16}$/);
  });

  test('GET /api/compute/admet/endpoints exposes the 52-endpoint catalog with published TDC metrics (public)', (t) => {
    if (!ADMET) return t.skip('ADMET-AI niedostępny — BLOCKED_BY_RUNTIME (uczciwy stan).');
    const r = call('GET', '/api/compute/admet/endpoints');
    assert.equal(r.status, 200);
    assert.equal(r.body.endpoints.length, 52);
    const herg = r.body.endpoints.find((e) => e.id === 'hERG');
    assert.equal(herg.category, 'Toxicity');
    assert.ok(herg.publishedMetricValue > 0.5);
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

describe('ADMET/toxicity multi-fidelity stage over the API', () => {
  test('stage route runs real ADMET scoring; thresholds are validated against the real endpoint catalog', async (t) => {
    if (!RDKIT || !ADMET) return t.skip('RDKit/ADMET-AI niedostępne — BLOCKED_BY_RUNTIME (uczciwy stan).');
    const owner = register('owner4@lab.org');
    const project = makeProject(owner.token);
    const c = call('POST', `/api/projects/${project.id}/campaigns`, {
      token: owner.token,
      body: { objective: 'ADMET filter (software validation)', startingSmiles: ['c1ccccc1'], budget: { maxGenerations: 1, maxGeneratedCandidates: 4 } },
    }).body.campaign;

    const started = call('POST', `/api/projects/${project.id}/campaigns/${c.id}/start`, { token: owner.token });
    await runJob(db, started.body.jobId);

    // Junk endpoint id is dropped, not injected as-is; a real one with an impossible bound survives and rejects everyone.
    const stageReq = call('POST', `/api/projects/${project.id}/campaigns/${c.id}/stage`, {
      token: owner.token,
      body: { admet: { enabled: true, thresholds: { not_a_real_endpoint: { max: 1 }, molecular_weight: { max: 1 } } } },
    });
    assert.equal(stageReq.status, 202);
    await runJob(db, stageReq.body.jobId);

    const runs = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/science-runs`, { token: owner.token }).body.scienceRuns;
    const admetRuns = runs.filter((r) => r.capability === 'admet-estimation');
    const toxRuns = runs.filter((r) => r.capability === 'toxicity-risk-estimation');
    assert.ok(admetRuns.length >= 1 && toxRuns.length >= 1, 'both capabilities persisted as real Scientific Runs');
    assert.ok(admetRuns.every((r) => r.evidenceClass === 'MODEL_ESTIMATE'));

    // WHY: stage-selection explains a real rejection with the real endpoint and threshold.
    const cands = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/candidates`, { token: owner.token }).body.candidates;
    const rejected = cands.find((x) => x.status === 'retained');
    const why = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/why`, { token: owner.token, query: { kind: 'stage-selection', candidate: rejected.id } }).body.why;
    assert.equal(why.ok, true);
    assert.match(why.answer, /molecular_weight/);
  });

  test('viewer cannot trigger a stage run (RBAC)', () => {
    const owner = register('owner5@lab.org');
    const viewer = register('viewer5@lab.org');
    const project = makeProject(owner.token);
    call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'viewer5@lab.org', role: 'viewer' } });
    const c = call('POST', `/api/projects/${project.id}/campaigns`, { token: owner.token, body: { objective: 'x', startingSmiles: ['c1ccccc1'] } }).body.campaign;
    assert.equal(call('POST', `/api/projects/${project.id}/campaigns/${c.id}/stage`, { token: viewer.token, body: { admet: { enabled: true } } }).status, 403);
  });
});

describe('Scientific Run replay verification over the API (Priority B)', () => {
  test('editor+ can verify a real run; a fresh replay is compared and appended to history; viewer cannot verify but can read', async (t) => {
    if (!RDKIT || !ADMET) return t.skip('RDKit/ADMET-AI niedostępne — BLOCKED_BY_RUNTIME (uczciwy stan).');
    const owner = register('owner6@lab.org');
    const viewer = register('viewer6@lab.org');
    const project = makeProject(owner.token);
    call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'viewer6@lab.org', role: 'viewer' } });
    const c = call('POST', `/api/projects/${project.id}/campaigns`, {
      token: owner.token,
      body: { objective: 'verify (software validation)', startingSmiles: ['c1ccccc1'], budget: { maxGenerations: 1, maxGeneratedCandidates: 4 } },
    }).body.campaign;
    const started = call('POST', `/api/projects/${project.id}/campaigns/${c.id}/start`, { token: owner.token });
    await runJob(db, started.body.jobId);
    const stageReq = call('POST', `/api/projects/${project.id}/campaigns/${c.id}/stage`, { token: owner.token, body: { admet: { enabled: true } } });
    await runJob(db, stageReq.body.jobId);

    const runs = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/science-runs`, { token: owner.token }).body.scienceRuns;
    const run = runs.find((r) => r.capability === 'admet-estimation');
    assert.ok(run, 'expected a persisted admet-estimation run');

    // Single-run GET (viewer+).
    const single = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/science-runs/${run.id}`, { token: viewer.token });
    assert.equal(single.status, 200);
    assert.equal(single.body.scienceRun.id, run.id);

    // Viewer cannot trigger a verify (costs real compute).
    assert.equal(call('POST', `/api/projects/${project.id}/campaigns/${c.id}/science-runs/${run.id}/verify`, { token: viewer.token }).status, 403);

    // Owner (editor+) verifies; a real replay runs and is classified honestly.
    const verified = call('POST', `/api/projects/${project.id}/campaigns/${c.id}/science-runs/${run.id}/verify`, { token: owner.token });
    assert.equal(verified.status, 201);
    assert.ok(['MATCH', 'DRIFT', 'ENGINE_VERSION_CHANGED', 'BLOCKED_BY_RUNTIME', 'REPLAY_UNSUPPORTED'].includes(verified.body.verification.verdict));
    assert.equal(verified.body.verification.scienceRunId, run.id);

    // History (viewer+) shows the append-only audit trail.
    const history = call('GET', `/api/projects/${project.id}/campaigns/${c.id}/science-runs/${run.id}/verifications`, { token: viewer.token });
    assert.equal(history.status, 200);
    assert.equal(history.body.verifications.length, 1);
    assert.equal(history.body.verifications[0].id, verified.body.verification.id);
  });

  test('a science-run id from a DIFFERENT campaign is a 404, not cross-campaign leakage', async (t) => {
    if (!RDKIT || !ADMET) return t.skip('RDKit/ADMET-AI niedostępne — BLOCKED_BY_RUNTIME (uczciwy stan).');
    const owner = register('owner7@lab.org');
    const project = makeProject(owner.token);
    const c1 = call('POST', `/api/projects/${project.id}/campaigns`, { token: owner.token, body: { objective: 'a', startingSmiles: ['c1ccccc1'], budget: { maxGenerations: 1, maxGeneratedCandidates: 4 } } }).body.campaign;
    const c2 = call('POST', `/api/projects/${project.id}/campaigns`, { token: owner.token, body: { objective: 'b', startingSmiles: ['c1ccccc1'], budget: { maxGenerations: 1, maxGeneratedCandidates: 4 } } }).body.campaign;
    await runJob(db, call('POST', `/api/projects/${project.id}/campaigns/${c1.id}/start`, { token: owner.token }).body.jobId);
    await runJob(db, call('POST', `/api/projects/${project.id}/campaigns/${c1.id}/stage`, { token: owner.token, body: { admet: { enabled: true } } }).body.jobId);
    const run = call('GET', `/api/projects/${project.id}/campaigns/${c1.id}/science-runs`, { token: owner.token }).body.scienceRuns[0];

    assert.equal(call('GET', `/api/projects/${project.id}/campaigns/${c2.id}/science-runs/${run.id}`, { token: owner.token }).status, 404);
    assert.equal(call('POST', `/api/projects/${project.id}/campaigns/${c2.id}/science-runs/${run.id}/verify`, { token: owner.token }).status, 404);
  });

  test('unknown science-run id is a 404, never fabricated', () => {
    const owner = register('owner8@lab.org');
    const project = makeProject(owner.token);
    const c = call('POST', `/api/projects/${project.id}/campaigns`, { token: owner.token, body: { objective: 'x', startingSmiles: ['c1ccccc1'] } }).body.campaign;
    assert.equal(call('GET', `/api/projects/${project.id}/campaigns/${c.id}/science-runs/does-not-exist`, { token: owner.token }).status, 404);
  });
});
