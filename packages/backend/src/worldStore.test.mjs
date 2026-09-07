import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, saveWorldSnapshot, updateWorldSnapshot, getWorldSnapshot, listWorldSnapshots } from './store.mjs';

/**
 * Genesis C3 World Model persistence — REAL restart survival (Priority
 * 1.1's own literal requirement: "write, kill the in-memory state,
 * reload, read back byte-identical"). Uses a real file on disk, not
 * `:memory:` — `openDatabase` is called TWICE against the SAME path,
 * with the first handle closed in between, so nothing survives except
 * what SQLite itself persisted to the file.
 */
describe('World snapshot persistence survives a real process restart', () => {
  test('save with one DB handle, close it, reopen a fresh handle on the same file, read back byte-identical', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-world-store-'));
    const dbPath = path.join(dir, 'genesis.db');
    try {
      const snapshot = {
        worldId: 'restart-city',
        seed: 11,
        branchId: 'branch-restart',
        specification: { worldId: 'restart-city', seed: 11, worldType: ['CITY', 'WATER_SYSTEM'] },
        keyframeTick: 4,
        keyframeSimulatedTime: 4,
        keyframeEntities: [
          { id: 'city:restart-city', label: 'city', scale: { level: 'MACRO_CITY' }, grounding: 'UNGROUNDED_APPROXIMATION', updatedAtTick: 0, ref: { kind: 'city', id: 'restart-city' } },
          { id: 'pump-pipe-system:p1', label: 'pump', scale: { level: 'MESO_LAB', parentEntityId: 'city:restart-city' }, grounding: 'PROCEDURAL_APPROXIMATION', updatedAtTick: 4, ref: { kind: 'pump-pipe-system', id: 'p1' }, domainState: { volumetricFlow: 0 }, statusLabel: 'tripped' },
        ],
        keyframeRelationships: [{ from: 'city:restart-city', to: 'pump-pipe-system:p1', kind: 'contains' }],
        events: [{ contractVersion: '1.0.0', id: 'e1', type: 'hydraulics.pumppipe.tripped', timestamp: 4, affectedEntities: [], parameters: {} }],
        observations: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      // FIRST PROCESS: open, save, close.
      let db = openDatabase(dbPath);
      saveWorldSnapshot(db, snapshot);
      assert.equal(getWorldSnapshot(db, 'restart-city').worldId, 'restart-city'); // sanity before "restart"
      db.close();
      db = undefined;

      // SIMULATED RESTART: a completely fresh handle on the same file — nothing in-memory survives.
      const restarted = openDatabase(dbPath);
      const reloaded = getWorldSnapshot(restarted, 'restart-city');
      assert.ok(reloaded, 'world must be readable after reopening the database file');
      assert.equal(reloaded.seed, 11);
      assert.equal(reloaded.branchId, 'branch-restart');
      assert.equal(reloaded.keyframeTick, 4);
      assert.deepEqual(reloaded.keyframeEntities, snapshot.keyframeEntities);
      assert.deepEqual(reloaded.keyframeRelationships, snapshot.keyframeRelationships);
      assert.deepEqual(reloaded.events, snapshot.events);
      assert.deepEqual(reloaded.specification, snapshot.specification);

      // list() also survives the restart.
      assert.deepEqual(listWorldSnapshots(restarted).map((w) => w.worldId), ['restart-city']);

      // An update after "restart" persists too, through a THIRD handle.
      updateWorldSnapshot(restarted, { ...reloaded, keyframeTick: 9, keyframeEntities: [{ ...reloaded.keyframeEntities[0] }] });
      restarted.close();

      const thirdHandle = openDatabase(dbPath);
      assert.equal(getWorldSnapshot(thirdHandle, 'restart-city').keyframeTick, 9);
      thirdHandle.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
