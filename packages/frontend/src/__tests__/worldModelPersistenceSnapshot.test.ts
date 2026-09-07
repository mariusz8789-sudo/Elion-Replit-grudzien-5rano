import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { compareBranches, executeIntervention, getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { createScientificWorld } from '../core/worldModel/orchestration/createScientificWorld';
import { WorldRegistry } from '../core/worldModel/persistence/worldRegistry';
import { restoreWorld, serializeWorld } from '../core/worldModel/persistence/worldSnapshot';
import { TemporalBranchRegistry } from '../core/worldModel/temporal/temporalEngine';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';

function canonicalEntities(entities: readonly unknown[]): string {
  return canonicalJson([...entities].sort((a, b) => ((a as { id: string }).id < (b as { id: string }).id ? -1 : 1)));
}

/**
 * WORLD PERSISTENCE — SURVIVES A PROCESS RESTART (Genesis Scientific World
 * Model 4.0, closing the mission's own "WorldRegistry is in-memory only"
 * gap). `serializeWorld`/`restoreWorld` are pure, synchronous, and know
 * nothing about HTTP or a database — a REAL restart is simulated here by
 * round-tripping through `JSON.stringify`/`JSON.parse` (exactly what any
 * durable store, backend or otherwise, actually persists), never trusting
 * in-memory object identity to survive the round trip.
 */
describe('WorldSnapshot: serialize -> JSON round-trip -> restore is byte-identical to the live world', () => {
  const spec: WorldSpecification = {
    worldId: 'snapshot-city',
    seed: 3,
    worldType: ['CITY', 'WATER_SYSTEM'],
    scientificDomains: [{ domain: 'hydraulics', required: true }],
  };

  it('a freshly created (never-ticked) world restores identically', () => {
    const created = createScientificWorld({ kind: 'specification', specification: spec });
    const registry = new WorldRegistry();
    const record = registry.save(created);

    const snapshot = serializeWorld(record, created.engine);
    const roundTripped = JSON.parse(JSON.stringify(snapshot)); // the actual "process restart" boundary
    const restored = restoreWorld(roundTripped);

    expect(restored.record).toEqual(record);
    expect(canonicalEntities(restored.engine.graph.listEntities())).toBe(canonicalEntities(created.engine.graph.listEntities()));
    expect(restored.engine.graph.listRelationships()).toEqual(created.engine.graph.listRelationships());
    expect(restored.engine.tick).toBe(created.engine.tick);
    expect(restored.engine.simulatedTime).toBe(created.engine.simulatedTime);
    expect(restored.engine.branchId).toBe(created.engine.branchId);
    expect(restored.engine.journal.allEvents()).toEqual(created.engine.journal.allEvents());
  });

  it('a world with real ticks and a real intervention restores identically, including scrubTo replay', () => {
    const created = createScientificWorld({ kind: 'specification', specification: { ...spec, worldId: 'snapshot-city-ticked' } });
    for (let i = 0; i < 3; i++) created.engine.advance(1, () => undefined);
    executeIntervention(created.engine, 'pump-pipe-system:pump-pipe-1', { 'domainState.volumetricFlow': 0.42 });
    created.engine.advance(1, () => undefined);

    const record = { worldId: created.worldId, seed: created.specification.seed, specification: created.specification, createdAt: new Date().toISOString(), branchId: created.engine.branchId };
    const snapshot = serializeWorld(record, created.engine);
    const roundTripped = JSON.parse(JSON.stringify(snapshot));
    const restored = restoreWorld(roundTripped);

    expect(restored.engine.graph.getEntity('pump-pipe-system:pump-pipe-1').domainState?.volumetricFlow).toBe(0.42);
    expect(canonicalEntities(restored.engine.graph.listEntities())).toBe(canonicalEntities(created.engine.graph.listEntities()));

    // scrubTo(head) matches live state on the restored engine (the standard replay-consistency
    // invariant) — but a restored engine's OWN keyframe starts AT the save point (its state is
    // already current there, by construction), so it cannot scrub to a tick BEFORE that, unlike
    // the still-live original: an honest, documented scope boundary (see the module doc), not a bug.
    expect(restored.engine.scrubTo(restored.engine.tick).listEntities()).toEqual(restored.engine.graph.listEntities());
    expect(() => restored.engine.scrubTo(restored.engine.tick - 1)).toThrow(/before this branch's keyframe/);

    // Continuing to tick AFTER restoration works exactly like any live engine.
    restored.engine.advance(1, () => undefined);
    expect(restored.engine.tick).toBe(created.engine.tick + 1);
  });

  it('a forked (counterfactual) branch restores identically, and stays comparable to a restored sibling', () => {
    const created = createScientificWorld({ kind: 'specification', specification: { ...spec, worldId: 'snapshot-city-fork-base' } });
    const registry = new TemporalBranchRegistry();
    registry.register(created.engine);
    created.engine.advance(1, () => undefined);

    const fork = created.engine.forkBranch(1, 'snapshot-fork', (graph) => {
      const pump = graph.getEntity('pump-pipe-system:pump-pipe-1');
      graph.updateEntity('pump-pipe-system:pump-pipe-1', { domainState: { ...pump.domainState, volumetricFlow: 0 } });
    });
    registry.register(fork);
    created.engine.advance(1, () => undefined);
    fork.advance(1, () => undefined);

    const baseRecord = { worldId: 'snapshot-city-fork-base', seed: spec.seed, specification: created.specification, createdAt: new Date().toISOString(), branchId: created.engine.branchId };
    const forkRecord = { worldId: 'snapshot-city-fork-child', parentWorldId: 'snapshot-city-fork-base', seed: spec.seed, specification: created.specification, createdAt: new Date().toISOString(), branchId: fork.branchId, forkedAtTick: 1 };

    const baseSnapshot = JSON.parse(JSON.stringify(serializeWorld(baseRecord, created.engine)));
    const forkSnapshot = JSON.parse(JSON.stringify(serializeWorld(forkRecord, fork)));

    const restoredRegistry = new TemporalBranchRegistry();
    const restoredBase = restoreWorld(baseSnapshot, restoredRegistry);
    const restoredFork = restoreWorld(forkSnapshot, restoredRegistry);

    expect(canonicalEntities(restoredBase.engine.graph.listEntities())).toBe(canonicalEntities(created.engine.graph.listEntities()));
    expect(canonicalEntities(restoredFork.engine.graph.listEntities())).toBe(canonicalEntities(fork.graph.listEntities()));

    // compareBranches works on the RESTORED registry exactly like it does on the live one.
    const liveComparison = compareBranches(registry, created.engine.branchId, fork.branchId, 2);
    const restoredComparison = compareBranches(restoredRegistry, restoredBase.engine.branchId, restoredFork.engine.branchId, 2);
    const livePumpDiff = liveComparison.entityDiffs.find((d) => d.id === 'pump-pipe-system:pump-pipe-1')!;
    const restoredPumpDiff = restoredComparison.entityDiffs.find((d) => d.id === 'pump-pipe-system:pump-pipe-1')!;
    expect(livePumpDiff.equal).toBe(false); // sanity: the counterfactual genuinely diverged
    expect(restoredPumpDiff.equal).toBe(false);
    expect(canonicalJson(restoredPumpDiff.worldA)).toBe(canonicalJson(livePumpDiff.worldA));
    expect(canonicalJson(restoredPumpDiff.worldB)).toBe(canonicalJson(livePumpDiff.worldB));
  });

  it('a restored WorldFrame projects identically to the live one', () => {
    const created = createScientificWorld({ kind: 'specification', specification: { ...spec, worldId: 'snapshot-city-frame' } });
    created.engine.advance(1, () => undefined);
    const record = { worldId: created.worldId, seed: created.specification.seed, specification: created.specification, createdAt: new Date().toISOString(), branchId: created.engine.branchId };
    const restored = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(record, created.engine))));

    const liveFrame = getFrameState(created.engine);
    const restoredFrame = getFrameState(restored.engine);
    expect(canonicalJson(restoredFrame)).toBe(canonicalJson(liveFrame));
  });
});
