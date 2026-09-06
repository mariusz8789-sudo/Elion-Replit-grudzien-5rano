import type { EntityRef } from '../../events/genesisEvent';
import { buildWorldState, type WorldEntity, type WorldRelation, type WorldState } from '../../world/scientificWorldState';
import type { WorldInteraction, WorldInteractionHandler, WorldInteractionResult } from '../../world/worldContracts';
import { entityId, type EntityId, type GroundingLevel, type ScaleDomain, type Vector3, type WorldModelEntity, type WorldModelEntityPatch } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { TemporalBranchInfo, TemporalBranchRegistry, TemporalEngine } from '../temporal/temporalEngine';

/**
 * C1 / C2 INTERFACE CONTRACT.
 *
 * This is C3's only public boundary toward the other two Claudes: C2 reads
 * `WorldFrameState`/`packTransformBuffer` (or the existing `WorldState`
 * contract via `projectToWorldState`, which plugs straight into
 * `core/world/worldRuntime.ts::ScientificWorldRuntime`); C1 reads the query
 * functions below and issues interventions, including through the existing
 * `WorldInteraction` contract via `toWorldInteractionHandler`. Nothing here
 * computes physics — it only projects/queries the `TemporalEngine`/`WorldGraph`
 * built by ecs/temporal/solvers.
 */

export interface WorldFrameEntity {
  readonly id: EntityId;
  readonly ref: EntityRef;
  readonly label: string;
  readonly scaleLevel: ScaleDomain;
  readonly transform: { position: Vector3; rotation: Vector3; scale: Vector3 };
  readonly grounding: GroundingLevel;
  readonly domainId?: string;
}

export interface WorldFrameState {
  readonly tick: number;
  readonly entities: readonly WorldFrameEntity[];
}

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };
const ONE: Vector3 = { x: 1, y: 1, z: 1 };

function toFrameEntity(entity: WorldModelEntity): WorldFrameEntity {
  return {
    id: entity.id,
    ref: entity.ref,
    label: entity.label,
    scaleLevel: entity.scale.level,
    transform: {
      position: entity.spatial?.position ?? ZERO,
      rotation: entity.spatial?.rotation ?? ZERO,
      scale: entity.spatial?.scale ?? ONE,
    },
    grounding: entity.grounding,
    domainId: entity.domainBinding?.domainId,
  };
}

function graphAt(engine: TemporalEngine, timestamp?: number): WorldGraph {
  return timestamp === undefined ? engine.graph : engine.scrubTo(timestamp);
}

/** For C2: one frame of render-ready state, at the live head or scrubbed to `timestamp`. */
export function getFrameState(engine: TemporalEngine, timestamp?: number): WorldFrameState {
  const graph = graphAt(engine, timestamp);
  return { tick: timestamp ?? engine.tick, entities: graph.listEntities().map(toFrameEntity) };
}

/** Flat Float32Array of [x,y,z] per entity, in frame order — droppable straight into a WebGPU vertex/instance buffer. */
export function packTransformBuffer(frame: WorldFrameState): Float32Array {
  const buffer = new Float32Array(frame.entities.length * 3);
  frame.entities.forEach((entity, i) => {
    buffer[i * 3] = entity.transform.position.x;
    buffer[i * 3 + 1] = entity.transform.position.y;
    buffer[i * 3 + 2] = entity.transform.position.z;
  });
  return buffer;
}

/** For C1: what exists near `point` (world units) within `radius`, optionally at a past `timestamp`. */
export function querySpatialContext(
  engine: TemporalEngine,
  point: Vector3,
  radius: number,
  timestamp?: number,
): readonly WorldModelEntity[] {
  return graphAt(engine, timestamp).querySpatialContext(point, radius);
}

/** For C1: full physical/chemical inspection of one entity, optionally at a past `timestamp`. */
export function queryEntityState(engine: TemporalEngine, id: EntityId, timestamp?: number): WorldModelEntity | undefined {
  return graphAt(engine, timestamp).tryGetEntity(id);
}

/** For C1: the tree of counterfactual world timelines derived from a common root. */
export function getAvailableBranches(registry: TemporalBranchRegistry): readonly TemporalBranchInfo[] {
  return registry.list();
}

/** For C1: apply an experimenter/user change to the live world (not a past timestamp — interventions only ever act on the head). */
export function executeIntervention(
  engine: TemporalEngine,
  id: EntityId,
  parameters: Readonly<Record<string, string | number | boolean>>,
): WorldModelEntity {
  const current = engine.graph.getEntity(id);
  const patch = parametersToPatch(current, parameters);
  return engine.graph.updateEntity(id, patch);
}

/**
 * Builds a component patch from dotted parameter paths (e.g.
 * `{'spatial.position.x': 5}`) without discarding sibling fields already on
 * the entity — `WorldGraph.updateEntity` replaces a whole component object
 * when present in the patch, so untouched siblings must be carried forward.
 */
function parametersToPatch(
  entity: WorldModelEntity,
  parameters: Readonly<Record<string, string | number | boolean>>,
): WorldModelEntityPatch {
  const patch: Record<string, unknown> = {};
  for (const [dottedKey, value] of Object.entries(parameters)) {
    const [root, ...rest] = dottedKey.split('.');
    if (root === 'label' || root === 'grounding') {
      patch[root] = value;
      continue;
    }
    if (root === 'spatial' || root === 'physics' || root === 'chemical' || root === 'scale') {
      if (!(root in patch)) patch[root] = deepClone((entity as unknown as Record<string, unknown>)[root] ?? {});
      setPath(patch, [root, ...rest], value);
    }
  }
  return patch as WorldModelEntityPatch;
}

function setPath(root: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const existing = cursor[key];
    cursor[key] = existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Adapts C3 onto the existing `WorldInteractionHandler` contract
 * (core/world/worldContracts.ts) so C1 can drive the world model through
 * the one interaction contract it already has, instead of a parallel one.
 * Only `INSPECT` and `CHANGE_PARAMETER` are C3's to answer; every other
 * action is explicitly declined rather than silently ignored.
 */
export function toWorldInteractionHandler(
  engine: TemporalEngine,
  meta: { worldId: string; domainId: string },
): WorldInteractionHandler {
  return (request: WorldInteraction): WorldInteractionResult => {
    const id = entityId(request.entity);
    if (!engine.graph.has(id)) return { accepted: false, reason: `Unknown entity: ${id}` };

    if (request.action === 'INSPECT') {
      return { accepted: true, state: projectToWorldState(engine.graph, meta.worldId, meta.domainId, engine.tick) };
    }
    if (request.action === 'CHANGE_PARAMETER') {
      executeIntervention(engine, id, request.parameters ?? {});
      return { accepted: true, state: projectToWorldState(engine.graph, meta.worldId, meta.domainId, engine.tick) };
    }
    return { accepted: false, reason: `Genesis World Model (C3) does not handle action ${request.action}` };
  };
}

/**
 * Projects a `WorldGraph` into the existing, canonical `WorldState`
 * contract (core/world/scientificWorldState.ts) — the same contract every
 * other Genesis world adapter produces, so `ScientificWorldRuntime` (C2)
 * and everything built on `worldContracts.ts` (C1) need no C3-specific
 * code path.
 */
export function projectToWorldState(graph: WorldGraph, worldId: string, domainId: string, tick: number): WorldState {
  const entities = graph.listEntities();
  const worldEntities: WorldEntity[] = entities.map((entity) => ({
    ref: entity.ref,
    label: entity.label,
    properties: toScientificProperties(entity),
  }));
  const relations: WorldRelation[] = entities
    .filter((entity) => entity.scale.parentEntityId !== undefined)
    .map((entity) => ({ from: graph.getEntity(entity.scale.parentEntityId!).ref, to: entity.ref, kind: 'contains' }));
  const notModeled = entities.filter((e) => e.grounding === 'UNGROUNDED_APPROXIMATION').map((e) => e.id);

  return buildWorldState({
    worldId,
    domainId,
    tick,
    entities: worldEntities,
    relations,
    observations: [],
    events: [],
    experiment: { experimentId: `${worldId}:${tick}`, status: 'RUNNING', runs: [] },
    epistemic: null,
    evidence: [],
    replay: null,
    notModeled,
  });
}

function toScientificProperties(entity: WorldModelEntity): WorldEntity['properties'] {
  const props: Array<WorldEntity['properties'][number]> = [];
  const push = (key: string, value: number | string | boolean | undefined, unit?: string) => {
    if (value !== undefined) props.push({ key, value, unit });
  };

  push('scale.level', entity.scale.level);
  push('grounding', entity.grounding);
  if (entity.domainBinding) {
    push('domainBinding.domainId', entity.domainBinding.domainId);
    push('domainBinding.solverId', entity.domainBinding.solverId ?? 'none');
  }
  if (entity.spatial) {
    push('spatial.position.x', entity.spatial.position.x, 'm');
    push('spatial.position.y', entity.spatial.position.y, 'm');
    push('spatial.position.z', entity.spatial.position.z, 'm');
    push('spatial.boundingRadius', entity.spatial.boundingRadius, 'm');
  }
  if (entity.physics) {
    push('physics.massKg', entity.physics.massKg, 'kg');
    push('physics.densityKgM3', entity.physics.densityKgM3, 'kg/m³');
    push('physics.temperatureK', entity.physics.temperatureK, 'K');
    push('physics.pressurePa', entity.physics.pressurePa, 'Pa');
    push('physics.viscosityPaS', entity.physics.viscosityPaS, 'Pa·s');
    push('physics.stateOfMatter', entity.physics.stateOfMatter);
    if (entity.physics.velocityMS) {
      push('physics.velocityMS.x', entity.physics.velocityMS.x, 'm/s');
      push('physics.velocityMS.y', entity.physics.velocityMS.y, 'm/s');
      push('physics.velocityMS.z', entity.physics.velocityMS.z, 'm/s');
    }
  }
  if (entity.chemical) {
    push('chemical.smiles', entity.chemical.smiles);
    push('chemical.formula', entity.chemical.formula);
    push('chemical.charge', entity.chemical.charge);
    push('chemical.energyStateEv', entity.chemical.energyStateEv, 'eV');
  }
  return props;
}
