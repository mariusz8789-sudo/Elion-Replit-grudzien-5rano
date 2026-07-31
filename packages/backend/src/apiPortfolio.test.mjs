import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * Portfolio rollup (Genesis V3, P0). Proves GET /api/portfolio is a real, read-only
 * aggregation over data that already exists: campaigns owned AND shared, molecule
 * status counts, unresolved comments, snapshots, last-activity ordering. It is
 * deliberately scoring-free — no leading-candidate rank is asserted here because the
 * backend never computes one (that stays in the frontend engine).
 */
let db;
beforeEach(() => { db = openDatabase(); });

function call(method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}
function register(email) {
  return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
}
/** Upsert a product campaign (user_campaigns) via the real API, as the client does. */
function putCampaign(token, id, data) {
  return call('PUT', `/api/campaigns/${id}`, { token, body: data });
}
function mol(id, status, withProps = true) {
  return { id, name: id, smiles: 'c1ccccc1', status, ...(status === 'ANALYSED' && withProps ? { props: { molecularWeight: 78 } } : {}) };
}

describe('GET /api/portfolio — dashboard rollup', () => {
  test('requires authentication', () => {
    assert.equal(call('GET', '/api/portfolio').status, 401);
  });

  test('a brand-new user has an empty portfolio (never fabricated)', () => {
    const u = register('empty@lab.org');
    const r = call('GET', '/api/portfolio', { token: u.token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.portfolio, []);
  });

  test('owned campaigns roll up with honest molecule-status counts', () => {
    const u = register('owner@lab.org');
    putCampaign(u.token, 'c1', {
      name: 'JAK2 triage', status: 'ACTIVE',
      molecules: [mol('m1', 'ANALYSED'), mol('m2', 'ANALYSED'), mol('m3', 'PENDING'), mol('m4', 'INVALID')],
    });
    const r = call('GET', '/api/portfolio', { token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.portfolio.length, 1);
    const c = r.body.portfolio[0];
    assert.equal(c.id, 'c1');
    assert.equal(c.name, 'JAK2 triage');
    assert.equal(c.role, 'owner');
    assert.equal(c.total, 4);
    assert.equal(c.analysed, 2);
    assert.equal(c.pending, 1);
    assert.equal(c.invalid, 1);
    assert.equal(c.unresolvedComments, 0);
    assert.equal(c.snapshotCount, 0);
  });

  test('an ANALYSED molecule with no props does not count as analysed (no overclaim)', () => {
    const u = register('noprops@lab.org');
    putCampaign(u.token, 'c1', { name: 'x', molecules: [mol('m1', 'ANALYSED', false)] });
    const c = call('GET', '/api/portfolio', { token: u.token }).body.portfolio[0];
    assert.equal(c.analysed, 0);
    assert.equal(c.pending, 1);
  });

  test('unresolved comments are counted; resolved ones are not', () => {
    const u = register('comments@lab.org');
    putCampaign(u.token, 'c1', { name: 'x', molecules: [mol('m1', 'ANALYSED')] });
    call('POST', '/api/campaigns/c1/comments', { token: u.token, body: { body: 'open question' } });
    const keep = call('POST', '/api/campaigns/c1/comments', { token: u.token, body: { body: 'to resolve' } }).body.comment;
    call('POST', `/api/campaigns/c1/comments/${keep.id}/resolve`, { token: u.token, body: { resolved: true } });
    const c = call('GET', '/api/portfolio', { token: u.token }).body.portfolio[0];
    assert.equal(c.unresolvedComments, 1);
  });

  test('a snapshot is counted and bumps last activity', () => {
    const u = register('snap@lab.org');
    putCampaign(u.token, 'c1', { name: 'x', molecules: [mol('m1', 'ANALYSED')] });
    const before = call('GET', '/api/portfolio', { token: u.token }).body.portfolio[0];
    const snap = call('POST', '/api/campaigns/c1/snapshots', {
      token: u.token, body: { data: { name: 'x', molecules: [mol('m1', 'ANALYSED')] }, triggerKind: 'manual' },
    });
    assert.equal(snap.status, 201);
    const after = call('GET', '/api/portfolio', { token: u.token }).body.portfolio[0];
    assert.equal(after.snapshotCount, 1);
    assert.ok(after.lastActivityAt >= before.lastActivityAt);
  });

  test('a shared campaign appears in the collaborator\'s portfolio with the shared role', () => {
    const owner = register('shareowner@lab.org');
    const collab = register('collab@lab.org');
    putCampaign(owner.token, 'shared1', { name: 'Shared project', molecules: [mol('m1', 'ANALYSED')] });
    const invite = call('POST', '/api/campaigns/shared1/members', {
      token: owner.token, body: { email: 'collab@lab.org', role: 'collaborator' },
    });
    assert.equal(invite.status, 201);

    const collabView = call('GET', '/api/portfolio', { token: collab.token }).body.portfolio;
    assert.equal(collabView.length, 1);
    assert.equal(collabView[0].id, 'shared1');
    assert.equal(collabView[0].role, 'collaborator');

    // The owner still sees it exactly once, as owner (no double-count).
    const ownerView = call('GET', '/api/portfolio', { token: owner.token }).body.portfolio;
    assert.equal(ownerView.filter((c) => c.id === 'shared1').length, 1);
    assert.equal(ownerView[0].role, 'owner');
  });

  test('rows are returned in non-increasing last-activity order', () => {
    const u = register('sort@lab.org');
    putCampaign(u.token, 'a', { name: 'a', molecules: [] });
    putCampaign(u.token, 'b', { name: 'b', molecules: [] });
    putCampaign(u.token, 'c', { name: 'c', molecules: [mol('m1', 'ANALYSED')] });
    const rows = call('GET', '/api/portfolio', { token: u.token }).body.portfolio;
    assert.equal(rows.length, 3);
    // Assert the sort invariant directly — robust even when upserts share a millisecond.
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i - 1].lastActivityAt >= rows[i].lastActivityAt, 'non-increasing lastActivityAt');
    }
  });
});
