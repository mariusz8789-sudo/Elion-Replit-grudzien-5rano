import { describe, expect, it } from 'vitest';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';

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

describe('WorldGraph', () => {
  it('registers an entity and retrieves it by its ref-derived id', () => {
    const graph = new WorldGraph();
    const e = entity({ ref: { kind: 'reactor', id: 'r1' } });
    graph.addEntity(e);
    expect(graph.getEntity('reactor:r1')).toEqual(e);
    expect(graph.has('reactor:r1')).toBe(true);
  });

  it('maintains parent/child containment across scale levels', () => {
    const graph = new WorldGraph();
    const city = entity({ ref: { kind: 'city', id: 'c1' }, scale: { level: 'MACRO_CITY' } });
    graph.addEntity(city);
    const lab = entity({ ref: { kind: 'lab', id: 'l1' }, scale: { level: 'MESO_LAB', parentEntityId: city.id } });
    graph.addEntity(lab);
    const molecule = entity({ ref: { kind: 'molecule', id: 'm1' }, scale: { level: 'MICRO_MOLECULAR', parentEntityId: lab.id } });
    graph.addEntity(molecule);

    expect(graph.listChildren(city.id).map((e2) => e2.id)).toEqual([lab.id]);
    expect(graph.listChildren(lab.id).map((e2) => e2.id)).toEqual([molecule.id]);
    expect(graph.listByScale('MICRO_MOLECULAR').map((e2) => e2.id)).toEqual([molecule.id]);
  });

  it('rejects an entity declaring an unknown parent', () => {
    const graph = new WorldGraph();
    expect(() => graph.addEntity(entity({ ref: { kind: 'x', id: 1 }, scale: { level: 'MESO_LAB', parentEntityId: 'nope' } }))).toThrow();
  });

  it('persists entity state across updates regardless of visibility ("out of view" is not a graph concept)', () => {
    const graph = new WorldGraph();
    const e = entity({ ref: { kind: 'agent', id: 'a1' }, spatial: { position: { x: 0, y: 0, z: 0 } } });
    graph.addEntity(e);
    graph.updateEntity(e.id, { spatial: { position: { x: 5, y: 0, z: 0 } } }, 3);
    graph.updateEntity(e.id, { spatial: { position: { x: 9, y: 0, z: 0 } } }, 7);
    const after = graph.getEntity(e.id);
    expect(after.spatial?.position).toEqual({ x: 9, y: 0, z: 0 });
    expect(after.updatedAtTick).toBe(7);
  });

  it('querySpatialContext finds entities within radius and excludes farther ones', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'a', id: 1 }, spatial: { position: { x: 0, y: 0, z: 0 } } }));
    graph.addEntity(entity({ ref: { kind: 'b', id: 2 }, spatial: { position: { x: 1, y: 0, z: 0 } } }));
    graph.addEntity(entity({ ref: { kind: 'c', id: 3 }, spatial: { position: { x: 100, y: 0, z: 0 } } }));
    const near = graph.querySpatialContext({ x: 0, y: 0, z: 0 }, 5);
    expect(near.map((e) => e.ref.kind).sort()).toEqual(['a', 'b']);
  });

  it('refuses to remove an entity that still has children, and allows it once they are gone', () => {
    const graph = new WorldGraph();
    const parent = entity({ ref: { kind: 'lab', id: 'l1' } });
    graph.addEntity(parent);
    const child = entity({ ref: { kind: 'molecule', id: 'm1' }, scale: { level: 'MICRO_MOLECULAR', parentEntityId: parent.id } });
    graph.addEntity(child);
    expect(() => graph.removeEntity(parent.id)).toThrow();
    graph.removeEntity(child.id);
    expect(() => graph.removeEntity(parent.id)).not.toThrow();
    expect(graph.has(parent.id)).toBe(false);
  });

  it('checks mass conservation across a macro/micro scale transition', () => {
    const graph = new WorldGraph();
    const reactor = entity({ ref: { kind: 'reactor', id: 'r1' }, physics: { massKg: 10 } });
    graph.addEntity(reactor);
    graph.addEntity(entity({ ref: { kind: 'molecule', id: 'm1' }, scale: { level: 'MICRO_MOLECULAR', parentEntityId: reactor.id }, physics: { massKg: 4 } }));
    expect(graph.isMassConserved(reactor.id)).toBe(false);
    graph.addEntity(entity({ ref: { kind: 'molecule', id: 'm2' }, scale: { level: 'MICRO_MOLECULAR', parentEntityId: reactor.id }, physics: { massKg: 6 } }));
    expect(graph.isMassConserved(reactor.id)).toBe(true);
  });

  it('clone() produces an independent copy: mutating the clone never affects the original', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'a', id: 1 }, spatial: { position: { x: 0, y: 0, z: 0 } } }));
    const clone = graph.clone();
    clone.updateEntity('a:1', { spatial: { position: { x: 99, y: 0, z: 0 } } }, 1);
    expect(graph.getEntity('a:1').spatial?.position.x).toBe(0);
    expect(clone.getEntity('a:1').spatial?.position.x).toBe(99);
  });
});
