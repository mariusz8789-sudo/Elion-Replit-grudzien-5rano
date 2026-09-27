import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import * as campaignStore from './campaign/persistence.mjs';

/**
 * POST /api/projects/:id/research-intake — the ONE API surface for the governed research-intake
 * layer. Proves real RBAC, real project isolation, real budget bounding, and that the endpoint
 * genuinely delegates to the existing campaign/scientificIntegration components rather than a
 * second campaign persistence model.
 */
let db;
beforeEach(() => { db = openDatabase(); });

function call(method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}
function register(email) {
  return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
}
function makeProject(token) {
  return call('POST', '/api/projects', { token, body: { name: 'RI-API' } }).body.project;
}

describe('POST /api/projects/:id/research-intake — basic contract', () => {
  test('an editor+ (owner) can submit a research question and gets a real governed result', async () => {
    const owner = register('ri-owner@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: owner.token, body: { originalQuery: 'GLP1R', maxCandidateBudget: 2 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.status, 'RESOLVED');
    assert.equal(r.body.result.contractVersion, '1.0.0');
    assert.ok(Array.isArray(r.body.result.candidateMatrix));
    assert.equal(r.body.campaignDraft, null, 'no campaign draft is created unless explicitly requested');
  });

  test('an empty originalQuery is rejected with 400, never a fabricated 200', async () => {
    const owner = register('ri-empty@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: owner.token, body: { originalQuery: '' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'invalid_query');
  });

  test('an unknown declaredInputKind is rejected with a clear 400, not silently coerced', async () => {
    const owner = register('ri-badkind@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: owner.token, body: { originalQuery: 'x', declaredInputKind: 'NOT_A_REAL_KIND' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'invalid_input_kind');
  });

  test('an unauthenticated request is rejected', async () => {
    const owner = register('ri-noauth@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { body: { originalQuery: 'GLP1R' } });
    assert.equal(r.status, 401);
  });
});

describe('Test 17: project access rules prevent foreign project access', () => {
  test('a user with no membership in the project gets 404, never a leaked research-intake result', async () => {
    const owner = register('ri-owner2@lab.org');
    const project = makeProject(owner.token);
    const stranger = register('ri-stranger@lab.org');
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: stranger.token, body: { originalQuery: 'GLP1R' } });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'not_found');
  });

  test('a nonexistent project id also 404s, never revealing whether it exists', async () => {
    const owner = register('ri-owner3@lab.org');
    const r = await call('POST', '/api/projects/does-not-exist/research-intake', { token: owner.token, body: { originalQuery: 'GLP1R' } });
    assert.equal(r.status, 404);
  });
});

describe('Test 18: a viewer cannot start or mutate research intake', () => {
  test('a real viewer-role member is forbidden (403), not silently downgraded to a read-only response', async () => {
    const owner = register('ri-owner4@lab.org');
    const project = makeProject(owner.token);
    const viewer = register('ri-viewer4@lab.org');
    const addMember = call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'ri-viewer4@lab.org', role: 'viewer' } });
    assert.equal(addMember.status, 200);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: viewer.token, body: { originalQuery: 'GLP1R' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'forbidden');
  });

  test('an editor member (not just the owner) CAN submit research intake', async () => {
    const owner = register('ri-owner5@lab.org');
    const project = makeProject(owner.token);
    const editor = register('ri-editor5@lab.org');
    call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'ri-editor5@lab.org', role: 'editor' } });
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: editor.token, body: { originalQuery: 'GLP1R', maxCandidateBudget: 2 } });
    assert.equal(r.status, 200);
  });
});

describe('Test 19 (API level): candidate budget is enforced and clamped', () => {
  test('an absurdly large maxCandidateBudget is clamped, never taken at face value', async () => {
    const owner = register('ri-budget@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: owner.token, body: { originalQuery: 'GLP1R', maxCandidateBudget: 999999 } });
    assert.equal(r.status, 200);
    assert.ok(r.body.result.candidateMatrix.length <= 50, 'clamped to the API\'s own hard ceiling, matching researchIntake.mjs\'s internal clamp');
  });

  test('a negative/zero budget still returns at least the default behavior, never a crash or an unbounded result', async () => {
    const owner = register('ri-budget2@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: owner.token, body: { originalQuery: 'GLP1R', maxCandidateBudget: -5 } });
    assert.equal(r.status, 200);
    assert.ok(r.body.result.candidateMatrix.length >= 1);
  });
});

describe('Test 20: the endpoint uses the EXISTING campaign/scientificIntegration components, not a second campaign engine', () => {
  test('prepareCampaignDraft=true creates a REAL campaign through the canonical campaign/persistence.mjs store', async () => {
    const owner = register('ri-draft@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, {
      token: owner.token,
      body: { originalQuery: 'GLP1R', maxCandidateBudget: 2, prepareCampaignDraft: true },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.campaignDraft.prepared, true);
    assert.ok(r.body.campaignDraft.campaignId);

    // Proves it is a REAL row in the ONE canonical campaign store — visible via the existing,
    // unmodified campaign listing route, not a parallel/private table this file invented.
    const listed = await call('GET', `/api/projects/${project.id}/campaigns`, { token: owner.token });
    assert.equal(listed.status, 200);
    assert.ok(listed.body.campaigns.some((c) => c.id === r.body.campaignDraft.campaignId));

    // And directly via campaign/persistence.mjs, the same module `resolveResearchIntake`/`prepareCampaignDraft` call.
    const directRead = campaignStore.getCampaign(db, r.body.campaignDraft.campaignId);
    assert.ok(directRead);
    assert.equal(directRead.domain, 'DRUG_DISCOVERY');
    assert.equal(directRead.status, 'created', 'a prepared draft is never auto-started — running remains a separate, existing, explicit action');
  });

  test('prepareCampaignDraft is never created automatically when not requested', async () => {
    const owner = register('ri-nodraft@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: owner.token, body: { originalQuery: 'GLP1R' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.campaignDraft, null);
    const listed = await call('GET', `/api/projects/${project.id}/campaigns`, { token: owner.token });
    assert.equal(listed.body.campaigns.length, 0);
  });

  test('requesting a draft from a BLOCKED_TARGET result honestly refuses, never fabricating a campaign', async () => {
    const owner = register('ri-blockeddraft@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, {
      token: owner.token,
      body: { originalQuery: 'lung cancer', declaredInputKind: 'DISEASE_OR_CONDITION', prepareCampaignDraft: true },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.status, 'BLOCKED_TARGET');
    assert.equal(r.body.campaignDraft.prepared, false);
  });
});

describe('malformed identifiers are rejected with clear BLOCKED states, never a fabricated 200 success', () => {
  test('a vaccine/biologic request returns a real, structured BLOCKED_MODALITY result — never HTTP failure, never a fake success', async () => {
    const owner = register('ri-vaccine@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: owner.token, body: { originalQuery: 'design a vaccine for RSV' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.status, 'BLOCKED_MODALITY');
  });

  test('a checksum-invalid CAS-shaped string returns a real BLOCKED_IDENTITY result', async () => {
    const owner = register('ri-badcas@lab.org');
    const project = makeProject(owner.token);
    const r = await call('POST', `/api/projects/${project.id}/research-intake`, { token: owner.token, body: { originalQuery: '50-78-9', declaredInputKind: 'CAS_NUMBER' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.status, 'BLOCKED_IDENTITY');
  });
});
