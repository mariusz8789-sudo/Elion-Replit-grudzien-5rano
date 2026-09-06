import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * Genesis C3 World Model persistence API (Priority 1.1) — the router-level
 * contract for /api/worlds, mirroring apiCompute.test.mjs's style: public
 * routes (no project/user concept for a saved world today), a live
 * in-memory database per test.
 */

let db;
beforeEach(() => { db = openDatabase(); });
const call = (method, pathname, o = {}) => handleApi(db, { method, pathname, token: o.token, body: o.body, query: o.query });

function sampleSnapshot(worldId, overrides = {}) {
  return {
    worldId,
    seed: 7,
    branchId: 'branch-1',
    specification: { worldId, seed: 7, worldType: ['CITY'] },
    keyframeTick: 0,
    keyframeSimulatedTime: 0,
    keyframeEntities: [{ id: `city:${worldId}`, label: 'city', scale: { level: 'MACRO_CITY' }, grounding: 'UNGROUNDED_APPROXIMATION', updatedAtTick: 0, ref: { kind: 'city', id: worldId } }],
    keyframeRelationships: [],
    events: [],
    observations: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('worlds API: public, no token required', () => {
  test('list is empty before any save', () => {
    const r = call('GET', '/api/worlds');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.worlds, []);
  });

  test('saves a world, then reads it back byte-identical', () => {
    const snapshot = sampleSnapshot('city-a');
    const saved = call('POST', '/api/worlds', { body: snapshot });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.world.worldId, 'city-a');

    const fetched = call('GET', '/api/worlds/city-a');
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body.world.keyframeEntities, snapshot.keyframeEntities);
    assert.equal(fetched.body.world.seed, 7);
    assert.equal(fetched.body.world.branchId, 'branch-1');
  });

  test('refuses to double-save the same worldId', () => {
    call('POST', '/api/worlds', { body: sampleSnapshot('city-dup') });
    const second = call('POST', '/api/worlds', { body: sampleSnapshot('city-dup') });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'already_exists');
  });

  test('rejects a malformed body with a clear, specific message', () => {
    assert.equal(call('POST', '/api/worlds', { body: {} }).status, 400);
    assert.equal(call('POST', '/api/worlds', { body: { worldId: 'x' } }).status, 400);
    const r = call('POST', '/api/worlds', { body: { worldId: 'x', seed: 'not-a-number', branchId: 'b', specification: {}, keyframeEntities: [], keyframeTick: 0 } });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /seed/);
  });

  test('GET on an unknown worldId is 404', () => {
    assert.equal(call('GET', '/api/worlds/does-not-exist').status, 404);
  });

  test('updates an existing world in place (e.g. after further ticks)', () => {
    call('POST', '/api/worlds', { body: sampleSnapshot('city-update') });
    const updated = sampleSnapshot('city-update', { keyframeTick: 5, keyframeEntities: [{ id: 'city:city-update', label: 'city', scale: { level: 'MACRO_CITY' }, grounding: 'UNGROUNDED_APPROXIMATION', updatedAtTick: 5, ref: { kind: 'city', id: 'city-update' }, statusLabel: 'evolved' }] });
    const put = call('PUT', '/api/worlds/city-update', { body: updated });
    assert.equal(put.status, 200);
    assert.equal(put.body.world.keyframeTick, 5);

    const fetched = call('GET', '/api/worlds/city-update');
    assert.equal(fetched.body.world.keyframeEntities[0].statusLabel, 'evolved');
  });

  test('updating an unknown worldId is 404', () => {
    const r = call('PUT', '/api/worlds/does-not-exist', { body: sampleSnapshot('does-not-exist') });
    assert.equal(r.status, 404);
  });

  test('list returns metadata for every saved world, newest first, without the heavy keyframe payload', () => {
    call('POST', '/api/worlds', { body: sampleSnapshot('city-1') });
    call('POST', '/api/worlds', { body: sampleSnapshot('city-2') });
    const r = call('GET', '/api/worlds');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.worlds.map((w) => w.worldId).sort(), ['city-1', 'city-2']);
    assert.equal('keyframeEntities' in r.body.worlds[0], false);
  });

  test('a forked world carries its parentWorldId/forkedAtTick through the round trip', () => {
    call('POST', '/api/worlds', { body: sampleSnapshot('city-root') });
    const fork = sampleSnapshot('city-fork', { parentWorldId: 'city-root', parentBranchId: 'branch-1', forkedAtTick: 2, branchId: 'branch-2' });
    call('POST', '/api/worlds', { body: fork });
    const fetched = call('GET', '/api/worlds/city-fork');
    assert.equal(fetched.body.world.parentWorldId, 'city-root');
    assert.equal(fetched.body.world.forkedAtTick, 2);
  });
});
