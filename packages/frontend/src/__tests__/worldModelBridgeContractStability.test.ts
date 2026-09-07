import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { getFrameState, packTransformBuffer, type WorldFrameEntity, type WorldFrameState } from '../core/worldModel/bridge/worldFrameState';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { spawnEntity } from '../core/worldModel/ecs/entityFactory';
import { NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, newtonianKinematicsSolver } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PRIORITY 7 (C1/C2 contract stability): `bridge/worldFrameState.ts` is the
 * canonical, single C1/C2 bridge (never duplicated — see the module's own
 * doc comment). `getFrameState`/`packTransformBuffer` are read by BOTH other
 * Claudes; a silent shape change here (a renamed/removed field, a reordered
 * buffer, a changed determinism guarantee) breaks a consumer that cannot see
 * this file change. These tests pin the exact shape and behavior down so any
 * future change to it is a deliberate, visible diff to this test file, not
 * an accidental regression.
 */
function buildTwoEntityGraph(): WorldGraph {
  const graph = new WorldGraph();
  const cityId = spawnEntity(graph, { ref: { kind: 'city', id: 'c1' }, label: 'City', scaleLevel: 'MACRO_CITY', spatial: { position: { x: 0, y: 0, z: 0 } } });
  spawnEntity(graph, {
    ref: { kind: 'particle', id: 'p1' },
    label: 'Particle',
    scaleLevel: 'MICRO_MOLECULAR',
    parentEntityId: cityId,
    spatial: { position: { x: 4, y: 5, z: 6 } },
    physics: { massKg: 2, velocityMS: { x: 1, y: 0, z: 0 } },
    domainBinding: { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'kinematics' },
    grounding: 'GROUNDED_EXACT',
  });
  return graph;
}

const EXPECTED_FRAME_ENTITY_KEYS = ['id', 'parentId', 'ref', 'label', 'scaleLevel', 'transform', 'grounding', 'domainId', 'scalars', 'statusLabel'].sort();
const EXPECTED_FRAME_STATE_KEYS = ['tick', 'simulatedTime', 'branchId', 'entities', 'relationships', 'events'].sort();

describe('Bridge contract stability (Priority 7): WorldFrameState / WorldFrameEntity / packTransformBuffer', () => {
  it('WorldFrameState exposes exactly its documented top-level fields — no silent addition or removal', () => {
    const engine = new TemporalEngine(buildTwoEntityGraph());
    const frame = getFrameState(engine);
    expect(Object.keys(frame).sort()).toEqual(EXPECTED_FRAME_STATE_KEYS);
  });

  it('every WorldFrameEntity exposes exactly its documented fields, present-but-undefined for an entity missing optional components', () => {
    const engine = new TemporalEngine(buildTwoEntityGraph());
    const frame = getFrameState(engine);
    for (const entity of frame.entities) {
      expect(Object.keys(entity).sort()).toEqual(EXPECTED_FRAME_ENTITY_KEYS);
    }
    const city = frame.entities.find((e) => e.id === 'city:c1')!;
    expect(city.parentId).toBeUndefined();
    expect(city.domainId).toBeUndefined();
    expect(city.statusLabel).toBeUndefined();
    // transform is always fully populated: an omitted rotation/scale on the entity's own
    // SpatialComponent defaults to identity rather than leaving the field partial.
    expect(city.transform).toEqual({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
  });

  it('getFrameState(engine) and getFrameState(engine, engine.tick) are byte-identical — the live-head and explicit-current-tick paths agree', () => {
    const engine = new TemporalEngine(buildTwoEntityGraph());
    const router = new SolverRouter();
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);
    engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));

    const live = getFrameState(engine);
    const explicit = getFrameState(engine, engine.tick);
    expect(canonicalJson(explicit)).toBe(canonicalJson(live));
  });

  it('getFrameState is deterministic under repeated calls with no intervening state change', () => {
    const engine = new TemporalEngine(buildTwoEntityGraph());
    const first = getFrameState(engine);
    const second = getFrameState(engine);
    expect(canonicalJson(second)).toBe(canonicalJson(first));
  });

  it('WorldFrameState.events contains only events recorded at exactly this frame\'s tick, never earlier or later ones', () => {
    const engine = new TemporalEngine(buildTwoEntityGraph());
    const router = new SolverRouter();
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);
    engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));
    engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));

    const tick1 = getFrameState(engine, 1);
    const tick2 = getFrameState(engine, 2);
    for (const event of tick1.events) expect(event.timestamp).toBe(1);
    for (const event of tick2.events) expect(event.timestamp).toBe(2);
  });

  it('packTransformBuffer produces a Float32Array of exactly 3 floats per entity, in frame.entities order, never resorted', () => {
    const engine = new TemporalEngine(buildTwoEntityGraph());
    const frame = getFrameState(engine);
    const buffer = packTransformBuffer(frame);

    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(frame.entities.length * 3);
    frame.entities.forEach((entity, i) => {
      expect(buffer[i * 3]).toBeCloseTo(entity.transform.position.x, 5);
      expect(buffer[i * 3 + 1]).toBeCloseTo(entity.transform.position.y, 5);
      expect(buffer[i * 3 + 2]).toBeCloseTo(entity.transform.position.z, 5);
    });
  });

  it('packTransformBuffer degrades gracefully for a frame with zero entities', () => {
    const emptyFrame: WorldFrameState = { tick: 0, simulatedTime: 0, branchId: 'b', entities: [] as readonly WorldFrameEntity[], relationships: [], events: [] };
    const buffer = packTransformBuffer(emptyFrame);
    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(0);
  });
});
