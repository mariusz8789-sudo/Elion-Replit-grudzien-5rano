import type { EntityRef } from '../../events/genesisEvent';
import { entityId, type EntityId, type WorldModelEntity, type WorldModelEntityPatch } from './types';

export interface ScaleZoomResult {
  supported: boolean;
  children: readonly WorldModelEntity[];
  reason?: string;
}

/**
 * A generic, non-hierarchical edge between two entities (e.g. "pipe-A
 * feedsInto pipe-B", "sensor-1 monitors reactor-1"). Distinct from the
 * strict tree parent/child containment `ScaleComponent.parentEntityId`
 * already provides for scale nesting (lab -> substance) — this is for
 * relationships that are NOT "contained within," which the schema calls
 * out as its own concept. Kept intentionally minimal: a labeled edge, no
 * relationship-specific state of its own (attach that to the entities the
 * edge connects, same as everywhere else in this ECS).
 */
export interface EntityRelationship {
  from: EntityId;
  to: EntityId;
  kind: string;
}

/**
 * WORLD STATE GRAPH — the persistent ECS registry C3 owns. It never depends
 * on whether C1/C2 are currently observing an entity: removal is only ever
 * an explicit `removeEntity` call (destruction), never a side effect of a
 * spatial query or a scale-scoped read.
 */
export class WorldGraph {
  private readonly entities = new Map<EntityId, WorldModelEntity>();
  private readonly childrenByParent = new Map<EntityId, Set<EntityId>>();
  private readonly relationships: EntityRelationship[] = [];

  addEntity(entity: WorldModelEntity): void {
    if (this.entities.has(entity.id)) throw new Error(`Entity already exists: ${entity.id}`);
    this.entities.set(entity.id, entity);
    const parentId = entity.scale.parentEntityId;
    if (parentId !== undefined) {
      if (!this.entities.has(parentId)) throw new Error(`Unknown parent entity: ${parentId}`);
      this.childOf(parentId).add(entity.id);
    }
  }

  getEntity(id: EntityId): WorldModelEntity {
    const found = this.entities.get(id);
    if (!found) throw new Error(`Unknown entity: ${id}`);
    return found;
  }

  tryGetEntity(id: EntityId): WorldModelEntity | undefined {
    return this.entities.get(id);
  }

  has(id: EntityId): boolean {
    return this.entities.has(id);
  }

  /** `tick` defaults to `current.updatedAtTick + 1` — callers that know the absolute simulation tick (e.g. TemporalEngine) should pass it explicitly. */
  updateEntity(id: EntityId, patch: WorldModelEntityPatch, tick?: number): WorldModelEntity {
    const current = this.getEntity(id);
    const next: WorldModelEntity = {
      ...current,
      ...patch,
      scale: patch.scale ? { ...current.scale, ...patch.scale } : current.scale,
      updatedAtTick: tick ?? current.updatedAtTick + 1,
    };
    this.entities.set(id, next);
    return next;
  }

  removeEntity(id: EntityId): void {
    const entity = this.getEntity(id);
    const children = this.childrenByParent.get(id);
    if (children && children.size > 0) {
      throw new Error(`Cannot remove ${id}: it still has ${children.size} child entities`);
    }
    const parentId = entity.scale.parentEntityId;
    if (parentId !== undefined) this.childOf(parentId).delete(id);
    this.entities.delete(id);
    this.childrenByParent.delete(id);
    this.removeRelationshipsFor(id);
  }

  /**
   * Records a generic, non-hierarchical edge between two ALREADY-EXISTING
   * entities. Throws for an unknown endpoint, same as `addEntity`'s parent
   * check — a relationship never dangles at creation time (it can only
   * later dangle if an endpoint is removed, which `removeEntity` already
   * prevents from happening silently by stripping the entity's own edges).
   *
   * Same scope as `ScaleComponent.parentEntityId`: world TOPOLOGY, set up
   * at world-construction time (or between ticks by a caller that owns the
   * graph directly), not tracked as a per-tick temporal delta the way
   * entity STATE is. `WorldGraph.clone()` (the basis for every keyframe and
   * branch fork) carries relationships forward correctly; a relationship
   * added mid-tick by a solver would not itself be replayed by `scrubTo`,
   * exactly like reparenting an entity mid-tick wouldn't be either — solver
   * ticks are expected to evolve entity STATE, not the graph's topology.
   */
  addRelationship(from: EntityId, to: EntityId, kind: string): void {
    this.getEntity(from);
    this.getEntity(to);
    this.relationships.push({ from, to, kind });
  }

  listRelationships(): readonly EntityRelationship[] {
    return this.relationships;
  }

  /** Every relationship touching `id` (as either endpoint), optionally filtered to one `kind`. */
  relationshipsFor(id: EntityId, kind?: string): readonly EntityRelationship[] {
    return this.relationships.filter((r) => (r.from === id || r.to === id) && (kind === undefined || r.kind === kind));
  }

  private removeRelationshipsFor(id: EntityId): void {
    for (let i = this.relationships.length - 1; i >= 0; i--) {
      const r = this.relationships[i];
      if (r.from === id || r.to === id) this.relationships.splice(i, 1);
    }
  }

  listEntities(): readonly WorldModelEntity[] {
    return [...this.entities.values()];
  }

  listByScale(level: WorldModelEntity['scale']['level']): readonly WorldModelEntity[] {
    return this.listEntities().filter((e) => e.scale.level === level);
  }

  listChildren(parentId: EntityId): readonly WorldModelEntity[] {
    const ids = this.childrenByParent.get(parentId);
    if (!ids) return [];
    return [...ids].map((id) => this.getEntity(id));
  }

  /**
   * Multi-scale zoom, honestly bounded: if `targetScale` children already
   * exist, returns them (still the same world/graph — never a second,
   * unrelated simulation). If none exist, this explicitly reports that no
   * deeper-scale representation is modeled, rather than fabricating one.
   */
  zoomInto(parentId: EntityId, targetScale: WorldModelEntity['scale']['level']): ScaleZoomResult {
    this.getEntity(parentId); // throws if unknown
    const children = this.listChildren(parentId).filter((child) => child.scale.level === targetScale);
    if (children.length > 0) return { supported: true, children };
    return {
      supported: false,
      children: [],
      reason: `No ${targetScale} representation exists for "${parentId}" — Genesis has no executable solver at this scale yet.`,
    };
  }

  /**
   * Linear-scan spatial query (a correct baseline; swap for a real octree
   * index behind this same signature once entity counts demand it — the
   * ECS contract above does not change).
   */
  querySpatialContext(point: { x: number; y: number; z: number }, radius: number): readonly WorldModelEntity[] {
    return this.listEntities().filter((entity) => {
      if (!entity.spatial) return false;
      const p = entity.spatial.position;
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      const dz = p.z - point.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius;
    });
  }

  /** Total mass of an entity's declared children, for cross-scale conservation checks. */
  sumChildMassKg(parentId: EntityId): number {
    return this.listChildren(parentId).reduce((sum, child) => sum + (child.physics?.massKg ?? 0), 0);
  }

  /**
   * Conservation check for a macro<->micro scale transition: the parent's own
   * mass (if it carries a physics component) must equal the sum of its
   * children's mass within `toleranceKg`. Entities that are purely
   * containers (no physics component) are exempt.
   */
  isMassConserved(parentId: EntityId, toleranceKg = 1e-6): boolean {
    const parent = this.getEntity(parentId);
    if (!parent.physics) return true;
    const childMass = this.sumChildMassKg(parentId);
    return Math.abs(parent.physics.massKg - childMass) <= toleranceKg;
  }

  /** Deep, independent copy — the basis for temporal keyframes and branch forks. */
  clone(): WorldGraph {
    const copy = new WorldGraph();
    for (const entity of this.entities.values()) {
      copy.entities.set(entity.id, structuredCloneEntity(entity));
    }
    for (const [parentId, children] of this.childrenByParent) {
      copy.childrenByParent.set(parentId, new Set(children));
    }
    copy.relationships.push(...this.relationships.map((r) => ({ ...r })));
    return copy;
  }

  private childOf(parentId: EntityId): Set<EntityId> {
    let set = this.childrenByParent.get(parentId);
    if (!set) {
      set = new Set();
      this.childrenByParent.set(parentId, set);
    }
    return set;
  }
}

function structuredCloneEntity(entity: WorldModelEntity): WorldModelEntity {
  return {
    ...entity,
    scale: { ...entity.scale },
    spatial: entity.spatial
      ? { ...entity.spatial, position: { ...entity.spatial.position }, rotation: entity.spatial.rotation ? { ...entity.spatial.rotation } : undefined, scale: entity.spatial.scale ? { ...entity.spatial.scale } : undefined }
      : undefined,
    physics: entity.physics ? { ...entity.physics, velocityMS: entity.physics.velocityMS ? { ...entity.physics.velocityMS } : undefined } : undefined,
    chemical: entity.chemical ? { ...entity.chemical } : undefined,
    domainBinding: entity.domainBinding ? { ...entity.domainBinding } : undefined,
    domainState: entity.domainState ? { ...entity.domainState } : undefined,
  };
}

export function makeEntityId(ref: EntityRef): EntityId {
  return entityId(ref);
}
