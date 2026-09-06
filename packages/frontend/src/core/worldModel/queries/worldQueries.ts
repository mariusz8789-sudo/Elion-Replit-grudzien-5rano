import type { EntityRef, GenesisEvent } from '../../events/genesisEvent';
import type { WorldChangeTrace } from '../../world/scientificWorldState';
import {
  describeWorldMoment,
  explainEntityChange,
  getFrameState,
  queryEntityState,
  querySpatialContext,
  type WorldFrameState,
  type WorldMomentSummary,
} from '../bridge/worldFrameState';
import { classifyRelationshipKind, type RelationshipCategory } from '../ecs/worldGraph';
import { entityId, type EntityId, type ScaleDomain, type WorldModelEntity } from '../ecs/types';
import type { TemporalBranchRegistry, TemporalEngine } from '../temporal/temporalEngine';

/**
 * WORLD GENERATION 1.0 — CANONICAL C3 WORLD-QUERY LAYER.
 *
 * Every function here is a pure READ over the existing `WorldGraph`/
 * `TemporalEngine`/`WorldJournal` — there is no new store, no cache, no
 * duplicated state. Several queries (`getNearby`, `getEntityAtTime`,
 * `getActiveEvents`) are thin re-exports/wrappers of functions
 * `bridge/worldFrameState.ts` already provides — kept under ONE name here
 * so C1 (or a test/scenario runner) has a single, documented "ask the
 * world a question" surface, without inventing a second contract for
 * anything the bridge already answers.
 */

function graphAt(engine: TemporalEngine, timestamp?: number) {
  return timestamp === undefined ? engine.graph : engine.scrubTo(timestamp);
}

/** "What was this entity's state at tick T?" — an explicit name for `queryEntityState`. */
export function getEntityAtTime(engine: TemporalEngine, id: EntityId, timestamp?: number): WorldModelEntity | undefined {
  return queryEntityState(engine, id, timestamp);
}

/** Every entity within `radius` of `point` — an explicit name for `querySpatialContext`. */
export function getNearby(engine: TemporalEngine, point: { x: number; y: number; z: number }, radius: number, timestamp?: number): readonly WorldModelEntity[] {
  return querySpatialContext(engine, point, radius, timestamp);
}

/** Events recorded at exactly `timestamp` (defaults to the live head) — an explicit name for `getFrameState(...).events`. */
export function getActiveEvents(engine: TemporalEngine, timestamp?: number): WorldFrameState['events'] {
  return getFrameState(engine, timestamp).events;
}

/** Every entity in `scaleLevel`, at `timestamp` (defaults to the live head) — delegates to `WorldGraph.listByScale`, never a second scale index. */
export function getStateAtScale(engine: TemporalEngine, scaleLevel: ScaleDomain, timestamp?: number): readonly WorldModelEntity[] {
  return graphAt(engine, timestamp).listByScale(scaleLevel);
}

/** The full subtree rooted at `parentId` (every descendant, not just direct children), at `timestamp`. */
export function getDescendants(engine: TemporalEngine, parentId: EntityId, timestamp?: number): readonly WorldModelEntity[] {
  const graph = graphAt(engine, timestamp);
  const result: WorldModelEntity[] = [];
  const stack = [...graph.listChildren(parentId)];
  while (stack.length > 0) {
    const next = stack.pop()!;
    result.push(next);
    stack.push(...graph.listChildren(next.id));
  }
  return result;
}

export interface WorldRegion {
  readonly root: WorldModelEntity;
  /** `root` itself plus every descendant — "everything under this region," e.g. for a renderer that wants one region's full entity set. */
  readonly entities: readonly WorldModelEntity[];
}

/** `parentId` and everything under it, as one region — built from `getDescendants`, never a second hierarchy walk. */
export function getWorldRegion(engine: TemporalEngine, parentId: EntityId, timestamp?: number): WorldRegion {
  const graph = graphAt(engine, timestamp);
  const root = graph.getEntity(parentId);
  return { root, entities: [root, ...getDescendants(engine, parentId, timestamp)] };
}

export interface RelatedEntity {
  readonly relationshipKind: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly entity: WorldModelEntity;
}

/** Every entity related to `id` via a non-hierarchical `WorldGraph` relationship (optionally filtered to one `kind`), at `timestamp`. */
export function getRelated(engine: TemporalEngine, id: EntityId, kind?: string, timestamp?: number): readonly RelatedEntity[] {
  const graph = graphAt(engine, timestamp);
  return graph.relationshipsFor(id, kind).map((relationship) => {
    const outgoing = relationship.from === id;
    return { relationshipKind: relationship.kind, direction: outgoing ? 'outgoing' : 'incoming', entity: graph.getEntity(outgoing ? relationship.to : relationship.from) };
  });
}

/** `getRelated`, filtered to relationships whose `kind` classifies (see `classifyRelationshipKind`) as `category` — e.g. every `'dependency'` edge touching `id`, regardless of its exact `kind` string. */
export function getRelatedByCategory(engine: TemporalEngine, id: EntityId, category: RelationshipCategory, timestamp?: number): readonly RelatedEntity[] {
  return getRelated(engine, id, undefined, timestamp).filter((related) => classifyRelationshipKind(related.relationshipKind) === category);
}

function transitiveClosure(engine: TemporalEngine, id: EntityId, direction: 'outgoing' | 'incoming', timestamp?: number): readonly WorldModelEntity[] {
  const graph = graphAt(engine, timestamp);
  const visited = new Set<EntityId>([id]);
  const result: WorldModelEntity[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const relationship of graph.relationshipsFor(current)) {
      const isOutgoing = relationship.from === current;
      if ((direction === 'outgoing') !== isOutgoing) continue;
      const nextId = isOutgoing ? relationship.to : relationship.from;
      if (visited.has(nextId)) continue; // cycle guard — a relationship graph is not guaranteed to be acyclic
      visited.add(nextId);
      result.push(graph.getEntity(nextId));
      stack.push(nextId);
    }
  }
  return result;
}

/** Every entity transitively reachable by following relationships FROM `id` outward — "what does this affect, directly or indirectly." */
export function getDownstream(engine: TemporalEngine, id: EntityId, timestamp?: number): readonly WorldModelEntity[] {
  return transitiveClosure(engine, id, 'outgoing', timestamp);
}

/** Every entity transitively reachable by following relationships INTO `id` — "what, directly or indirectly, affects this." */
export function getUpstream(engine: TemporalEngine, id: EntityId, timestamp?: number): readonly WorldModelEntity[] {
  return transitiveClosure(engine, id, 'incoming', timestamp);
}

export interface CausalDependencies {
  /** Entities `id` points AT via a relationship — what it depends on. */
  readonly dependsOn: readonly EntityRef[];
  /** Entities that point AT `id` via a relationship — what depends on it. */
  readonly dependents: readonly EntityRef[];
  /** The real event that produced `id`'s own most recent state change — reuses `explainEntityChange`, never a second causal trace. */
  readonly lastChange: WorldChangeTrace | null;
}

/** What `id` causally depends on / is depended on by, plus the event that last changed it. */
export function getCausalDependencies(engine: TemporalEngine, id: EntityId, timestamp?: number): CausalDependencies {
  const graph = graphAt(engine, timestamp);
  const relationships = graph.relationshipsFor(id);
  return {
    dependsOn: relationships.filter((r) => r.from === id).map((r) => graph.getEntity(r.to).ref),
    dependents: relationships.filter((r) => r.to === id).map((r) => graph.getEntity(r.from).ref),
    lastChange: explainEntityChange(engine, id, timestamp),
  };
}

export interface EntityStateAtTick {
  readonly tick: number;
  /** `undefined` if the entity had been removed by this tick. */
  readonly entity: WorldModelEntity | undefined;
}

/**
 * Every tick at which `id`'s own state actually changed (add/update/remove),
 * with its state reconstructed via the existing `scrubTo` replay at each of
 * those ticks — never a second, parallel history store.
 */
export function getStateHistory(engine: TemporalEngine, id: EntityId): readonly EntityStateAtTick[] {
  const changedTicks = new Set<number>();
  for (const frame of engine.frames) {
    if (frame.deltas.some((delta) => delta.id === id)) changedTicks.add(frame.tick);
  }
  return [...changedTicks].sort((a, b) => a - b).map((tick) => ({ tick, entity: engine.scrubTo(tick).tryGetEntity(id) }));
}

/** One branch's full frame state, at `timestamp` (defaults to that branch's own live head) — resolves `branchId` through the registry, never a second branch index. */
export function getBranchState(registry: TemporalBranchRegistry, branchId: string, timestamp?: number): WorldFrameState {
  return getFrameState(registry.get(branchId), timestamp);
}

/** C1's standard "what is this entity, right now, and why" question — re-exported here for a single query-layer import surface. */
export function getWorldMoment(engine: TemporalEngine, id: EntityId, atTick?: number): WorldMomentSummary {
  return describeWorldMoment(engine, id, atTick);
}

/** Every event recorded (at ANY tick, not just one) whose `affectedEntities` includes `id` — "what events affected this entity, over its whole recorded history." */
export function getEventHistoryFor(engine: TemporalEngine, id: EntityId): readonly GenesisEvent[] {
  return engine.journal.allEvents().filter((event) => event.affectedEntities.some((ref) => entityId(ref) === id));
}

/**
 * CAUSAL GRAPH FOUNDATION: walks `GenesisEvent.parentEventId` BACKWARD from
 * `eventId` to its root cause — e.g. a cascade-derived
 * `building.waterservice.interrupted` event's ancestry leads back to the
 * real `hydraulics.pumppipe.step` event that triggered it (see
 * cascade/cascadeRules.ts's `relationshipCascadeRule`, which sets
 * `parentEventId`). Returns `[eventId's own event, ..., the root cause]` —
 * empty if `eventId` is not found. Guards against a malformed cycle rather
 * than looping forever.
 */
export function getCausalAncestry(engine: TemporalEngine, eventId: string): readonly GenesisEvent[] {
  const byId = new Map(engine.journal.allEvents().map((event) => [event.id, event] as const));
  const chain: GenesisEvent[] = [];
  const visited = new Set<string>();
  let current = byId.get(eventId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentEventId ? byId.get(current.parentEventId) : undefined;
  }
  return chain;
}

/** The reverse of `getCausalAncestry`: every event (transitively) CAUSED by `eventId`, via `parentEventId` chains forward. */
export function getCausalDescendants(engine: TemporalEngine, eventId: string): readonly GenesisEvent[] {
  const byParent = new Map<string, GenesisEvent[]>();
  for (const event of engine.journal.allEvents()) {
    if (!event.parentEventId) continue;
    const siblings = byParent.get(event.parentEventId) ?? [];
    siblings.push(event);
    byParent.set(event.parentEventId, siblings);
  }
  const result: GenesisEvent[] = [];
  const stack = [...(byParent.get(eventId) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    result.push(next);
    stack.push(...(byParent.get(next.id) ?? []));
  }
  return result;
}
