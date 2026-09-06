import { describe, expect, it } from 'vitest';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { projectToWorldState } from '../core/worldModel/bridge/worldFrameState';

function entity(kind: string, id: string): WorldModelEntity {
  const ref = { kind, id };
  return {
    id: entityId(ref),
    ref,
    label: kind,
    scale: { level: 'MESO_LAB' },
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
  };
}

/**
 * PRIORITY 6 (schema hardening): "Relationship" is a distinct top-level
 * concept from "Parent/child hierarchy" — a non-hierarchical, labeled edge
 * between two entities (e.g. "pipe-A feedsInto pipe-B"), which
 * `ScaleComponent.parentEntityId` alone cannot express.
 */
describe('WorldGraph relationships (generic, non-hierarchical edges)', () => {
  it('records and lists a relationship between two existing entities', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity('pipe', 'a'));
    graph.addEntity(entity('pipe', 'b'));
    graph.addRelationship('pipe:a', 'pipe:b', 'feedsInto');
    expect(graph.listRelationships()).toEqual([{ from: 'pipe:a', to: 'pipe:b', kind: 'feedsInto' }]);
  });

  it('throws for an unknown endpoint on either side, never creating a dangling edge', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity('pipe', 'a'));
    expect(() => graph.addRelationship('pipe:a', 'pipe:missing', 'feedsInto')).toThrow();
    expect(() => graph.addRelationship('pipe:missing', 'pipe:a', 'feedsInto')).toThrow();
    expect(graph.listRelationships()).toEqual([]);
  });

  it('relationshipsFor finds edges touching an entity from either side, optionally filtered by kind', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity('sensor', 's1'));
    graph.addEntity(entity('reactor', 'r1'));
    graph.addEntity(entity('reactor', 'r2'));
    graph.addRelationship('sensor:s1', 'reactor:r1', 'monitors');
    graph.addRelationship('reactor:r2', 'sensor:s1', 'feeds');

    expect(graph.relationshipsFor('sensor:s1')).toHaveLength(2);
    expect(graph.relationshipsFor('sensor:s1', 'monitors')).toEqual([{ from: 'sensor:s1', to: 'reactor:r1', kind: 'monitors' }]);
    expect(graph.relationshipsFor('reactor:r1')).toEqual([{ from: 'sensor:s1', to: 'reactor:r1', kind: 'monitors' }]);
  });

  it('removeEntity strips relationships touching the removed entity, never leaving a dangling edge', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity('sensor', 's1'));
    graph.addEntity(entity('reactor', 'r1'));
    graph.addRelationship('sensor:s1', 'reactor:r1', 'monitors');
    graph.removeEntity('sensor:s1');
    expect(graph.listRelationships()).toEqual([]);
  });

  it('clone() carries relationships forward independently of the original', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity('sensor', 's1'));
    graph.addEntity(entity('reactor', 'r1'));
    graph.addRelationship('sensor:s1', 'reactor:r1', 'monitors');

    const clone = graph.clone();
    expect(clone.listRelationships()).toEqual([{ from: 'sensor:s1', to: 'reactor:r1', kind: 'monitors' }]);

    clone.addEntity(entity('reactor', 'r2'));
    clone.addRelationship('sensor:s1', 'reactor:r2', 'monitors');
    expect(graph.listRelationships()).toHaveLength(1); // the original is untouched by the clone's own additions
    expect(clone.listRelationships()).toHaveLength(2);
  });

  it('projectToWorldState exposes both parent/child "contains" edges and generic relationships together', () => {
    const graph = new WorldGraph();
    const lab = entity('lab', 'l1');
    graph.addEntity(lab);
    const sensor: WorldModelEntity = { ...entity('sensor', 's1'), scale: { level: 'MESO_LAB', parentEntityId: lab.id } };
    graph.addEntity(sensor);
    const reactor: WorldModelEntity = { ...entity('reactor', 'r1'), scale: { level: 'MESO_LAB', parentEntityId: lab.id } };
    graph.addEntity(reactor);
    graph.addRelationship(sensor.id, reactor.id, 'monitors');

    const state = projectToWorldState(graph, 'w1', 'd1', 0);
    expect(state.relations).toEqual(
      expect.arrayContaining([
        { from: { kind: 'lab', id: 'l1' }, to: { kind: 'sensor', id: 's1' }, kind: 'contains' },
        { from: { kind: 'lab', id: 'l1' }, to: { kind: 'reactor', id: 'r1' }, kind: 'contains' },
        { from: { kind: 'sensor', id: 's1' }, to: { kind: 'reactor', id: 'r1' }, kind: 'monitors' },
      ]),
    );
    expect(state.relations).toHaveLength(3);
  });
});
