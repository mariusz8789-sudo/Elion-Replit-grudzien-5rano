/**
 * campaign persistence (Genesis 2.1, Part 2) — store + API. Campaigns survive as
 * server-side per-owner blobs, scoped so one user can never read/write another's.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createSession, listCampaignsForOwner, getCampaignRow, upsertCampaign, deleteCampaignRow } from './store.mjs';
import { hashPassword, generateToken } from './auth.mjs';
import { handleApi } from './api.mjs';

let db;
beforeEach(() => { db = openDatabase(); });
function seed(email) {
  const u = createUser(db, { email, displayName: email, passwordHash: hashPassword('pw12345678') });
  const token = generateToken();
  createSession(db, { userId: u.id, token, ttlMs: 1e9 });
  return { u, token };
}
const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });

describe('campaign store', () => {
  test('upsert creates then updates the same (owner,id); list is per-owner', () => {
    const { u } = seed('a@lab.io');
    upsertCampaign(db, u.id, 'c1', { name: 'Snake Venom', status: 'ACTIVE', molecules: [{ smiles: 'CCO' }] }, 1000);
    let row = getCampaignRow(db, u.id, 'c1');
    assert.equal(row.data.name, 'Snake Venom');
    upsertCampaign(db, u.id, 'c1', { name: 'Renamed', molecules: [] }, 2000);
    row = getCampaignRow(db, u.id, 'c1');
    assert.equal(row.data.name, 'Renamed');
    assert.equal(row.updatedAt, 2000);
    assert.equal(listCampaignsForOwner(db, u.id).length, 1); // updated, not duplicated
  });
  test('deleteCampaignRow removes only the target', () => {
    const { u } = seed('b@lab.io');
    upsertCampaign(db, u.id, 'c1', { name: 'A' });
    upsertCampaign(db, u.id, 'c2', { name: 'B' });
    deleteCampaignRow(db, u.id, 'c1');
    assert.equal(listCampaignsForOwner(db, u.id).length, 1);
    assert.equal(getCampaignRow(db, u.id, 'c1'), null);
  });
});

describe('campaign API (authenticated, owner-scoped)', () => {
  test('PUT → GET list → GET one → DELETE round-trip', () => {
    const { token } = seed('owner@lab.io');
    const data = { name: 'Kinase Inhibitors', status: 'ACTIVE', molecules: [{ id: 'm1', smiles: 'CCO' }] };
    const put = call('PUT', '/api/campaigns/camp1', { token, body: { campaign: data } });
    assert.equal(put.status, 200);
    assert.equal(put.body.campaign.data.name, 'Kinase Inhibitors');
    const list = call('GET', '/api/campaigns', { token });
    assert.equal(list.status, 200);
    assert.equal(list.body.campaigns.length, 1);
    assert.equal(list.body.campaigns[0].molecules, 1); // count, not full blob
    const one = call('GET', '/api/campaigns/camp1', { token });
    assert.equal(one.body.campaign.data.molecules[0].smiles, 'CCO');
    assert.equal(call('DELETE', '/api/campaigns/camp1', { token }).status, 200);
    assert.equal(call('GET', '/api/campaigns/camp1', { token }).status, 404);
  });
  test('unauthenticated → 401; cannot read another owner\'s campaign', () => {
    const a = seed('ua@lab.io');
    call('PUT', '/api/campaigns/x', { token: a.token, body: { campaign: { name: 'secret' } } });
    assert.equal(call('GET', '/api/campaigns', {}).status, 401);          // no token
    const b = seed('ub@lab.io');
    assert.equal(call('GET', '/api/campaigns/x', { token: b.token }).status, 404); // other owner can't see it
    assert.equal(call('GET', '/api/campaigns', { token: b.token }).body.campaigns.length, 0);
  });
  test('PUT with no data → 400', () => {
    const { token } = seed('nd@lab.io');
    assert.equal(call('PUT', '/api/campaigns/z', { token, body: {} }).status, 200); // body IS the data ({} ok)
    assert.equal(call('PUT', '/api/campaigns/z', { token, body: { campaign: null } }).status, 400);
  });
});
