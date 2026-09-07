import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

function entity(overrides: Partial<WorldModelEntity> & { ref: WorldModelEntity['ref'] }): WorldModelEntity {
  return {
    id: entityId(overrides.ref),
    label: overrides.ref.kind,
    scale: { level: 'MACRO_CITY' },
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
    ...overrides,
  };
}

describe('WorldGraph.fromSnapshot: the exact inverse of listEntities/listRelationships', () => {
  it('reconstructs entities, hierarchy, and relationships from plain data', () => {
    const graph = new WorldGraph();
    const city = entity({ ref: { kind: 'city', id: 'c1' } });
    graph.addEntity(city);
    const building = entity({ ref: { kind: 'building', id: 'b1' }, scale: { level: 'MESO_LAB', parentEntityId: city.id } });
    graph.addEntity(building);
    graph.addRelationship(city.id, building.id, 'contains');

    const restored = WorldGraph.fromSnapshot(graph.listEntities(), graph.listRelationships());
    expect(canonicalJson(restored.listEntities())).toBe(canonicalJson(graph.listEntities()));
    expect(restored.listRelationships()).toEqual(graph.listRelationships());
    expect(restored.listChildren(city.id).map((e) => e.id)).toEqual([building.id]);
  });

  it('the restored graph is independent — mutating it never touches the source', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'x', id: 'x1' }, physics: { massKg: 1 } }));
    const restored = WorldGraph.fromSnapshot(graph.listEntities(), graph.listRelationships());
    restored.updateEntity('x:x1', { physics: { massKg: 99 } });
    expect(graph.getEntity('x:x1').physics?.massKg).toBe(1);
  });
});

describe('TemporalEngine.restore: reconstructs a live engine from a keyframe + delta log', () => {
  it('replays a real delta log onto a fresh keyframe, matching the original engine exactly', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'valve', id: 'v1' }, physics: { massKg: 1, pressurePa: 100 } }));
    const original = new TemporalEngine(graph);
    original.advance(1, (g) => {
      g.updateEntity('valve:v1', { physics: { massKg: 1, pressurePa: 200 } });
    });
    original.advance(1, (g) => {
      g.updateEntity('valve:v1', { physics: { massKg: 1, pressurePa: 300 } });
    });

    // A fresh keyframe graph, built independently from the ORIGINAL keyframe's own snapshot — not
    // the same object, exactly like a real "regenerate, then replay recorded history" restore.
    const keyframeSnapshot = WorldGraph.fromSnapshot([entity({ ref: { kind: 'valve', id: 'v1' }, physics: { massKg: 1, pressurePa: 100 } })], []);
    const restored = TemporalEngine.restore(keyframeSnapshot, {
      frames: original.frames,
      events: original.journal.allEvents(),
      observations: original.journal.allObservations(),
      branchId: original.branchId,
    });

    expect(restored.tick).toBe(original.tick);
    expect(restored.graph.getEntity('valve:v1').physics?.pressurePa).toBe(300);
    expect(canonicalJson(restored.graph.listEntities())).toBe(canonicalJson(original.graph.listEntities()));

    // scrubTo works identically on the restored engine, all the way back to the true keyframe (tick 0) this time — since the full frame log was supplied, unlike worldSnapshot.ts's own deliberately narrower choice.
    expect(canonicalJson(restored.scrubTo(1).getEntity('valve:v1'))).toBe(canonicalJson(original.scrubTo(1).getEntity('valve:v1')));
    expect(() => restored.scrubTo(0)).not.toThrow();
  });

  it('an empty frame log restores exactly the given keyframe, at the given startTick/startSimulatedTime', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'x', id: 'x1' } }));
    const restored = TemporalEngine.restore(graph, { frames: [], startTick: 5, startSimulatedTime: 500 });
    expect(restored.tick).toBe(5);
    expect(restored.simulatedTime).toBe(500);
    expect(restored.graph.getEntity('x:x1')).toBeDefined();
    expect(() => restored.scrubTo(4)).toThrow(/before this branch's keyframe/);
  });
});
