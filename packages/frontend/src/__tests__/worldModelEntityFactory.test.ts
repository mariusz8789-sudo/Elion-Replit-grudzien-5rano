import { describe, expect, it } from 'vitest';
import { createEntity, spawnEntity } from '../core/worldModel/ecs/entityFactory';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';

/**
 * PRIORITY 2 (world generation): `createEntity`/`spawnEntity` are the
 * smallest reusable mechanism for constructing an executable world from
 * initial conditions — one blueprint per entity, covering identity, scale,
 * initial state, solver ownership, parent/child placement, and
 * relationships, instead of hand-writing a `WorldModelEntity` literal at
 * every call site.
 */
describe('entityFactory (createEntity / spawnEntity)', () => {
  it('createEntity derives a deterministic id from ref and defaults grounding to UNGROUNDED_APPROXIMATION', () => {
    const entity = createEntity({ ref: { kind: 'sensor', id: 's1' }, label: 'Sensor 1', scaleLevel: 'MESO_LAB' });
    expect(entity.id).toBe('sensor:s1');
    expect(entity.grounding).toBe('UNGROUNDED_APPROXIMATION');
    expect(entity.updatedAtTick).toBe(0);
  });

  it('createEntity is a pure function: the same blueprint always produces an equivalent entity', () => {
    const blueprint = { ref: { kind: 'sensor', id: 's1' }, label: 'Sensor 1', scaleLevel: 'MESO_LAB' as const };
    expect(createEntity(blueprint)).toEqual(createEntity(blueprint));
  });

  it('leaves omitted optional fields undefined rather than fabricating defaults', () => {
    const entity = createEntity({ ref: { kind: 'container', id: 'c1' }, label: 'Container', scaleLevel: 'MACRO_CITY' });
    expect(entity.spatial).toBeUndefined();
    expect(entity.physics).toBeUndefined();
    expect(entity.chemical).toBeUndefined();
    expect(entity.domainBinding).toBeUndefined();
    expect(entity.domainState).toBeUndefined();
    expect(entity.scale.parentEntityId).toBeUndefined();
  });

  it('honors an explicit grounding override for a deliberately grounded entity', () => {
    const entity = createEntity({ ref: { kind: 'measurement', id: 'm1' }, label: 'Measured Value', scaleLevel: 'MESO_LAB', grounding: 'GROUNDED_EXACT' });
    expect(entity.grounding).toBe('GROUNDED_EXACT');
  });

  it('spawnEntity adds the entity to the graph and wires parent/child placement via parentEntityId', () => {
    const graph = new WorldGraph();
    const parentId = spawnEntity(graph, { ref: { kind: 'lab', id: 'l1' }, label: 'Lab', scaleLevel: 'MACRO_CITY' });
    const childId = spawnEntity(graph, { ref: { kind: 'reactor', id: 'r1' }, label: 'Reactor', scaleLevel: 'MESO_LAB', parentEntityId: parentId });

    expect(graph.getEntity(childId).scale.parentEntityId).toBe(parentId);
    expect(graph.listChildren(parentId).map((e) => e.id)).toEqual([childId]);
  });

  it('spawnEntity records relationships to already-existing entities after adding the new entity', () => {
    const graph = new WorldGraph();
    const sensorId = spawnEntity(graph, { ref: { kind: 'sensor', id: 's1' }, label: 'Sensor', scaleLevel: 'MESO_LAB' });
    const reactorId = spawnEntity(graph, {
      ref: { kind: 'reactor', id: 'r1' },
      label: 'Reactor',
      scaleLevel: 'MESO_LAB',
      relationships: [{ to: sensorId, kind: 'monitoredBy' }],
    });

    expect(graph.listRelationships()).toEqual([{ from: reactorId, to: sensorId, kind: 'monitoredBy' }]);
  });

  it('spawnEntity throws for a relationship target that does not exist, never creating a dangling edge', () => {
    const graph = new WorldGraph();
    expect(() =>
      spawnEntity(graph, {
        ref: { kind: 'reactor', id: 'r1' },
        label: 'Reactor',
        scaleLevel: 'MESO_LAB',
        relationships: [{ to: 'sensor:missing', kind: 'monitoredBy' }],
      }),
    ).toThrow();
  });

  it('spawnEntity preserves declared domainBinding (including an explicit solverId: null) without inventing science', () => {
    const graph = new WorldGraph();
    const id = spawnEntity(graph, {
      ref: { kind: 'particle', id: 'p1' },
      label: 'Particle',
      scaleLevel: 'MICRO_MOLECULAR',
      domainBinding: { solverId: null, domainId: 'undeclared' },
    });
    expect(graph.getEntity(id).domainBinding).toEqual({ solverId: null, domainId: 'undeclared' });
  });
});
