import type { EntityRef, GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson } from '../../events/hash';
import {
  buildWorldState,
  traceWorldChange,
  type Observation,
  type ReplayState,
  type WorldChangeTrace,
  type WorldEntity,
  type WorldRelation,
  type WorldState,
} from '../../world/scientificWorldState';
import type { WorldInteraction, WorldInteractionHandler, WorldInteractionResult } from '../../world/worldContracts';
import { entityId, type EntityId, type GroundingLevel, type ScaleDomain, type Vector3, type WorldModelEntity, type WorldModelEntityPatch } from '../ecs/types';
import type { ScaleZoomResult, WorldGraph } from '../ecs/worldGraph';
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

/**
 * Render-ready projection of one entity. `scalars` is a flat, domain-agnostic
 * numeric map (temperature, concentration fraction, epidemic compartments,
 * flow speed, ...) so C2 never needs to know chemistry, epidemiology, or
 * hydraulics to decide what a number means for a shader/UI — it only needs
 * to know *that* a named scalar changed.
 */
export interface WorldFrameEntity {
  readonly id: EntityId;
  /** Containment parent (e.g. lab -> substance, hospital -> population) — lets C2 build hierarchy without parsing scale/domain strings. Undefined for a root entity. */
  readonly parentId?: EntityId;
  readonly ref: EntityRef;
  readonly label: string;
  readonly scaleLevel: ScaleDomain;
  readonly transform: { position: Vector3; rotation: Vector3; scale: Vector3 };
  readonly grounding: GroundingLevel;
  readonly domainId?: string;
  readonly scalars: Readonly<Record<string, number>>;
  /** Solver-set, human-readable qualitative state (e.g. "largely intact (92.3%)") — display-only. */
  readonly statusLabel?: string;
}

export interface WorldFrameState {
  readonly tick: number;
  readonly simulatedTime: number;
  readonly branchId: string;
  readonly entities: readonly WorldFrameEntity[];
  /** Events recorded at exactly this tick — the timeline's "what just happened" feed. */
  readonly events: readonly GenesisEvent[];
}

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };
const ONE: Vector3 = { x: 1, y: 1, z: 1 };

/** Exported for C1: the same flat scalar projection `WorldFrameEntity.scalars` uses, so a before/after comparison across two `describeWorldMoment` calls reads the identical numbers a rendered frame would. */
export function collectScalars(entity: WorldModelEntity): Record<string, number> {
  const scalars: Record<string, number> = {};
  if (entity.physics) {
    const p = entity.physics;
    if (p.massKg !== undefined) scalars.massKg = p.massKg;
    if (p.densityKgM3 !== undefined) scalars.densityKgM3 = p.densityKgM3;
    if (p.temperatureK !== undefined) scalars.temperatureK = p.temperatureK;
    if (p.pressurePa !== undefined) scalars.pressurePa = p.pressurePa;
    if (p.viscosityPaS !== undefined) scalars.viscosityPaS = p.viscosityPaS;
    if (p.velocityMS) scalars.speedMS = Math.hypot(p.velocityMS.x, p.velocityMS.y, p.velocityMS.z);
  }
  if (entity.chemical) {
    const c = entity.chemical;
    if (c.concentrationFraction !== undefined) scalars.concentrationFraction = c.concentrationFraction;
    if (c.charge !== undefined) scalars.charge = c.charge;
    if (c.energyStateEv !== undefined) scalars.energyStateEv = c.energyStateEv;
  }
  if (entity.domainState) Object.assign(scalars, entity.domainState);
  return scalars;
}

function toFrameEntity(entity: WorldModelEntity): WorldFrameEntity {
  return {
    id: entity.id,
    parentId: entity.scale.parentEntityId,
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
    scalars: collectScalars(entity),
    statusLabel: entity.statusLabel,
  };
}

function graphAt(engine: TemporalEngine, timestamp?: number): WorldGraph {
  return timestamp === undefined ? engine.graph : engine.scrubTo(timestamp);
}

/** Simulated time this branch had reached as of `tick` (branch-local: a fork's clock starts at 0 at its own keyframe). */
function simulatedTimeAt(engine: TemporalEngine, tick: number): number {
  if (tick === engine.tick) return engine.simulatedTime;
  return engine.frames.find((f) => f.tick === tick)?.simulatedTime ?? 0;
}

/** For C2: one frame of render-ready state, at the live head or scrubbed to `timestamp`. */
export function getFrameState(engine: TemporalEngine, timestamp?: number): WorldFrameState {
  const tick = timestamp ?? engine.tick;
  const graph = graphAt(engine, timestamp);
  const events = engine.journal.allEvents().filter((e) => e.timestamp === tick);
  return { tick, simulatedTime: simulatedTimeAt(engine, tick), branchId: engine.branchId, entities: graph.listEntities().map(toFrameEntity), events };
}

export interface WorldClock {
  readonly tick: number;
  readonly simulatedTime: number;
  readonly branchId: string;
  readonly canReplay: boolean;
}

/** For C1: "what time / branch am I observing?" — a one-call summary, optionally at a scrubbed `timestamp`. */
export function getWorldClock(engine: TemporalEngine, timestamp?: number): WorldClock {
  const tick = timestamp ?? engine.tick;
  return { tick, simulatedTime: simulatedTimeAt(engine, tick), branchId: engine.branchId, canReplay: engine.historyLength > 0 };
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

/**
 * For C1: apply an experimenter/user change to the live world (not a past
 * timestamp — interventions only ever act on the head). Goes through
 * `TemporalEngine.applyExternalPatch`, never a direct `graph.updateEntity`
 * call, so the change is recorded as a real delta — `scrubTo` (and
 * therefore replay, branch comparison, and evidence) stays consistent with
 * the live graph immediately, not only once some later tick happens to
 * touch the same entity again.
 */
export function executeIntervention(
  engine: TemporalEngine,
  id: EntityId,
  parameters: Readonly<Record<string, string | number | boolean>>,
): WorldModelEntity {
  const current = engine.graph.getEntity(id);
  const patch = parametersToPatch(current, parameters);
  return engine.applyExternalPatch(id, patch);
}

/**
 * Builds a component patch from dotted parameter paths (e.g.
 * `{'spatial.position.x': 5}`, `{'domainState.r0': 1.0}`,
 * `{'chemical.activationEnergyKJ': 140}`) without discarding sibling fields
 * already on the entity — `WorldGraph.updateEntity` replaces a whole
 * component object when present in the patch, so untouched siblings must
 * be carried forward. `domainState` is included here because it is the
 * generic ledger real domain solvers read their own intervention-tunable
 * parameters from (epidemic R0, hydraulic flow rate, ...).
 *
 * Exported (Generative Scientific World Model 2.0) so
 * `specification/compiler.ts` can apply a `WorldSpecification`'s
 * `initialConditions` (the same dotted-path vocabulary, applied once at
 * generation time rather than via a live `executeIntervention` call)
 * without a second patch-building implementation.
 */
export function parametersToPatch(
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
    if (root === 'spatial' || root === 'physics' || root === 'chemical' || root === 'scale' || root === 'domainState') {
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
      return { accepted: true, state: projectToWorldState(engine.graph, meta.worldId, meta.domainId, engine.tick, engine.journal.upToTick(engine.tick)) };
    }
    if (request.action === 'CHANGE_PARAMETER') {
      executeIntervention(engine, id, request.parameters ?? {});
      return { accepted: true, state: projectToWorldState(engine.graph, meta.worldId, meta.domainId, engine.tick, engine.journal.upToTick(engine.tick)) };
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
export function projectToWorldState(
  graph: WorldGraph,
  worldId: string,
  domainId: string,
  tick: number,
  journalSlice: { observations: readonly Observation[]; events: readonly GenesisEvent[] } = { observations: [], events: [] },
  /**
   * A REAL replay verdict, when the caller actually checked one (e.g. by
   * independently re-executing this tick and comparing scalars) — never
   * asserted here. Defaults to null, meaning "no replay claim made" — the
   * same honest default every other Genesis adapter uses.
   */
  replay: ReplayState | null = null,
): WorldState {
  const entities = graph.listEntities();
  const worldEntities: WorldEntity[] = entities.map((entity) => ({
    ref: entity.ref,
    label: entity.label,
    properties: toScientificProperties(entity),
  }));
  const relations: WorldRelation[] = [
    ...entities
      .filter((entity) => entity.scale.parentEntityId !== undefined)
      .map((entity) => ({ from: graph.getEntity(entity.scale.parentEntityId!).ref, to: entity.ref, kind: 'contains' })),
    ...graph.listRelationships().map((r) => ({ from: graph.getEntity(r.from).ref, to: graph.getEntity(r.to).ref, kind: r.kind })),
  ];
  const notModeled = entities.filter((e) => e.grounding === 'UNGROUNDED_APPROXIMATION').map((e) => e.id);

  return buildWorldState({
    worldId,
    domainId,
    tick,
    entities: worldEntities,
    relations,
    observations: journalSlice.observations,
    events: journalSlice.events,
    experiment: { experimentId: `${worldId}:${tick}`, status: 'RUNNING', runs: [] },
    epistemic: null,
    evidence: [],
    replay,
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
  push('statusLabel', entity.statusLabel);
  if (entity.domainState) {
    for (const [key, value] of Object.entries(entity.domainState)) push(`domainState.${key}`, value);
  }
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
    push('chemical.concentrationFraction', entity.chemical.concentrationFraction);
  }
  return props;
}

/**
 * For C1: "what is happening here?" — the current tick, the entity's real
 * state, the most recent observation/event that actually touched it, which
 * solver/model produced that state, its grounding, the branch it lives on,
 * and whether replay is available. Every field is read from C3 state or the
 * journal — never an invented narrative.
 */
export interface WorldMomentSummary {
  readonly tick: number;
  readonly branchId: string;
  readonly entity: WorldModelEntity;
  readonly latestObservation: Observation | null;
  readonly latestEvent: GenesisEvent | null;
  readonly solverId: string | null;
  readonly domainId: string | null;
  readonly grounding: GroundingLevel;
  readonly canReplay: boolean;
}

function affects(ref: EntityRef, id: EntityId): boolean {
  return entityId(ref) === id;
}

export function describeWorldMoment(engine: TemporalEngine, id: EntityId, atTick?: number): WorldMomentSummary {
  const tick = atTick ?? engine.tick;
  const entity = graphAt(engine, atTick).getEntity(id);
  const slice = engine.journal.upToTick(tick);
  const latestObservation = [...slice.observations].reverse().find((o) => o.measurements.some((m) => m.entity && affects(m.entity, id))) ?? null;
  const latestEvent = [...slice.events].reverse().find((e) => e.affectedEntities.some((r) => affects(r, id))) ?? null;
  return {
    tick,
    branchId: engine.branchId,
    entity,
    latestObservation,
    latestEvent,
    solverId: entity.domainBinding?.solverId ?? null,
    domainId: entity.domainBinding?.domainId ?? null,
    grounding: entity.grounding,
    canReplay: engine.historyLength > 0,
  };
}

/**
 * For C1: "why did this state change?" — finds the most recent recorded
 * event that touched `id` and traces it through the existing
 * `traceWorldChange` (core/world/scientificWorldState.ts), which reads the
 * event's real causal lineage (affected entities, related hypotheses,
 * parent event) straight from the projected `WorldState`. Returns `null`
 * when nothing in the journal ever touched this entity — never a guess.
 */
export function explainEntityChange(engine: TemporalEngine, id: EntityId, atTick?: number): WorldChangeTrace | null {
  const tick = atTick ?? engine.tick;
  const slice = engine.journal.upToTick(tick);
  const latestEvent = [...slice.events].reverse().find((e) => e.affectedEntities.some((r) => affects(r, id)));
  if (!latestEvent) return null;
  const state = projectToWorldState(graphAt(engine, atTick), 'world-model', 'world-model', tick, slice);
  return traceWorldChange(state, latestEvent.id);
}

/** Multi-scale zoom for C1: reports the honest boundary (see `WorldGraph.zoomInto`) rather than fabricating a deeper representation. */
export function zoomInto(
  engine: TemporalEngine,
  parentId: EntityId,
  targetScale: ScaleDomain,
  timestamp?: number,
): ScaleZoomResult {
  return graphAt(engine, timestamp).zoomInto(parentId, targetScale);
}

export interface EntityStateDiff {
  readonly id: EntityId;
  readonly worldA: WorldModelEntity | undefined;
  readonly worldB: WorldModelEntity | undefined;
  readonly equal: boolean;
}

export interface BranchComparison {
  readonly branchA: TemporalBranchInfo;
  readonly branchB: TemporalBranchInfo;
  readonly tick: number;
  readonly entityDiffs: readonly EntityStateDiff[];
}

/**
 * For C1: "show me WORLD A / WORLD B / the difference." Compares two real
 * branches at the same tick by scrubbing each independently — the
 * difference reported is whatever the two branches' own solver executions
 * actually produced, not a relabeled clone.
 */
export function compareBranches(
  registry: TemporalBranchRegistry,
  branchIdA: string,
  branchIdB: string,
  atTick: number,
): BranchComparison {
  const engineA = registry.get(branchIdA);
  const engineB = registry.get(branchIdB);
  const graphA = engineA.scrubTo(atTick);
  const graphB = engineB.scrubTo(atTick);
  const ids = new Set([...graphA.listEntities().map((e) => e.id), ...graphB.listEntities().map((e) => e.id)]);
  const entityDiffs: EntityStateDiff[] = [...ids].map((id) => {
    const worldA = graphA.tryGetEntity(id);
    const worldB = graphB.tryGetEntity(id);
    return { id, worldA, worldB, equal: canonicalJson(worldA) === canonicalJson(worldB) };
  });
  return { branchA: engineA.describe(), branchB: engineB.describe(), tick: atTick, entityDiffs };
}
