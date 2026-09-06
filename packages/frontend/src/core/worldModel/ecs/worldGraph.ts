import type { EntityRef } from '../../events/genesisEvent';
import { entityId, type EntityId, type WorldModelEntity, type WorldModelEntityPatch } from './types';

/**
 * WORLD STATE GRAPH — the persistent ECS registry C3 owns. It never depends
 * on whether C1/C2 are currently observing an entity: removal is only ever
 * an explicit `removeEntity` call (destruction), never a side effect of a
 * spatial query or a scale-scoped read.
 */
export class WorldGraph {
  private readonly entities = new Map<EntityId, WorldModelEntity>();
  private readonly childrenByParent = new Map<EntityId, Set<EntityId>>();

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
  };
}

export function makeEntityId(ref: EntityRef): EntityId {
  return entityId(ref);
}
