import { describe, expect, it } from 'vitest';
import {
  executeIntervention,
  getAvailableBranches,
  getFrameState,
  packTransformBuffer,
  projectToWorldState,
  querySpatialContext,
  queryEntityState,
  toWorldInteractionHandler,
} from '../core/worldModel/bridge/worldFrameState';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, newtonianKinematicsSolver } from '../core/worldModel/solvers/solverRouter';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

function buildEngine(): TemporalEngine {
  const graph = new WorldGraph();
  const city: WorldModelEntity = {
    id: entityId({ kind: 'city', id: 'c1' }),
    ref: { kind: 'city', id: 'c1' },
    label: 'City',
    scale: { level: 'MACRO_CITY' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
  };
  graph.addEntity(city);
  const molecule: WorldModelEntity = {
    id: entityId({ kind: 'molecule', id: 'm1' }),
    ref: { kind: 'molecule', id: 'm1' },
    label: 'Water',
    scale: { level: 'MICRO_MOLECULAR', parentEntityId: city.id },
    spatial: { position: { x: 10, y: 0, z: 0 } },
    physics: { massKg: 3, velocityMS: { x: 1, y: 0, z: 0 } },
    chemical: { formula: 'H2O' },
    domainBinding: { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'kinematics' },
    grounding: 'GROUNDED_EXACT',
    updatedAtTick: 0,
  };
  graph.addEntity(molecule);
  return new TemporalEngine(graph);
}

describe('worldModel bridge', () => {
  it('getFrameState projects transforms for C2, and packTransformBuffer packs them into a flat buffer', () => {
    const engine = buildEngine();
    const frame = getFrameState(engine);
    expect(frame.tick).toBe(0);
    expect(frame.entities).toHaveLength(2);
    const molecule = frame.entities.find((e) => e.id === 'molecule:m1')!;
    expect(molecule.transform.position).toEqual({ x: 10, y: 0, z: 0 });
    expect(molecule.scaleLevel).toBe('MICRO_MOLECULAR');

    const buffer = packTransformBuffer(frame);
    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(6);
    const moleculeIndex = frame.entities.indexOf(molecule);
    expect(buffer[moleculeIndex * 3]).toBe(10);
  });

  it('getFrameState(timestamp) reflects a scrubbed past tick without mutating the live head', () => {
    const engine = buildEngine();
    const router = new SolverRouter();
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);
    engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));
    engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));

    const past = getFrameState(engine, 1);
    const head = getFrameState(engine);
    expect(past.entities.find((e) => e.id === 'molecule:m1')!.transform.position.x).toBe(11);
    expect(head.entities.find((e) => e.id === 'molecule:m1')!.transform.position.x).toBe(12);
  });

  it('querySpatialContext and queryEntityState answer C1 spatial/entity queries', () => {
    const engine = buildEngine();
    const near = querySpatialContext(engine, { x: 10, y: 0, z: 0 }, 1);
    expect(near.map((e) => e.id)).toEqual(['molecule:m1']);
    const state = queryEntityState(engine, 'molecule:m1');
    expect(state?.chemical?.formula).toBe('H2O');
    expect(queryEntityState(engine, 'nope:1')).toBeUndefined();
  });

  it('executeIntervention changes only the targeted leaf field and preserves sibling fields', () => {
    const engine = buildEngine();
    const updated = executeIntervention(engine, 'molecule:m1', { 'physics.massKg': 99 });
    expect(updated.physics?.massKg).toBe(99);
    expect(updated.physics?.velocityMS).toEqual({ x: 1, y: 0, z: 0 });
    expect(updated.spatial?.position).toEqual({ x: 10, y: 0, z: 0 });
  });

  it('getAvailableBranches exposes the registry as the tree of counterfactual worlds', () => {
    const graph = new WorldGraph();
    const registry = new TemporalBranchRegistry();
    const root = new TemporalEngine(graph, { label: 'root', registry });
    root.forkBranch(0, 'variant', () => {});
    const branches = getAvailableBranches(registry);
    expect(branches).toHaveLength(2);
    expect(branches.map((b) => b.label).sort()).toEqual(['root', 'variant']);
  });

  it('projectToWorldState maps scale containment to relations and flags ungrounded entities in notModeled', () => {
    const engine = buildEngine();
    const state = projectToWorldState(engine.graph, 'w1', 'genesis-demo', engine.tick);
    expect(state.worldId).toBe('w1');
    expect(state.entities).toHaveLength(2);
    expect(state.relations).toEqual([{ from: { kind: 'city', id: 'c1' }, to: { kind: 'molecule', id: 'm1' }, kind: 'contains' }]);
    expect(state.notModeled).toEqual(['city:c1']); // city has no domainBinding
    expect(state.fingerprint).toBeTruthy();
  });

  it('toWorldInteractionHandler answers INSPECT and CHANGE_PARAMETER through the existing WorldInteraction contract', () => {
    const engine = buildEngine();
    const handler = toWorldInteractionHandler(engine, { worldId: 'w1', domainId: 'genesis-demo' });

    const inspect = handler({ interactionId: 'i1', entity: { kind: 'molecule', id: 'm1' }, action: 'INSPECT' });
    expect(inspect.accepted).toBe(true);
    expect(inspect.state?.entities.find((e) => e.ref.id === 'm1')).toBeTruthy();

    const change = handler({
      interactionId: 'i2',
      entity: { kind: 'molecule', id: 'm1' },
      action: 'CHANGE_PARAMETER',
      parameters: { 'physics.massKg': 42 },
    });
    expect(change.accepted).toBe(true);
    expect(engine.graph.getEntity('molecule:m1').physics?.massKg).toBe(42);

    const unknown = handler({ interactionId: 'i3', entity: { kind: 'nope', id: 'x' }, action: 'INSPECT' });
    expect(unknown.accepted).toBe(false);

    const unsupported = handler({ interactionId: 'i4', entity: { kind: 'molecule', id: 'm1' }, action: 'START_EXPERIMENT' });
    expect(unsupported.accepted).toBe(false);
  });
});
