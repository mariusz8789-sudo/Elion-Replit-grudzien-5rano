import { entityId } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';

/**
 * WORLD CONSISTENCY (Generative Scientific World Model 2.0, section 5).
 *
 * Structural invariants a GENERATED graph must hold. Most of the mission's
 * examples ("hospital belongs to a city", "a relationship never dangles")
 * are already enforced by construction — `WorldGraph.addEntity` throws for
 * an unknown parent, and `addRelationship` throws for an unknown endpoint —
 * so a generated world literally cannot exist in most invalid shapes to
 * begin with. What is NOT already enforced by construction, and genuinely
 * needs checking after a world is fully assembled, is covered here: that
 * composing several templates produced ONE coherent world (a single root),
 * not several disconnected ones, and that no entity is malformed in a way
 * construction-time checks don't catch (a self-parent, an empty ref).
 *
 * `generateSpecifiedWorld` (specification/compiler.ts) runs this
 * automatically and throws on failure — "fail fast if structurally
 * invalid," never a silent repair.
 */
export interface WorldInvariantViolation {
  entityId?: string;
  message: string;
}

export interface WorldInvariantResult {
  ok: boolean;
  violations: readonly WorldInvariantViolation[];
}

export function validateWorldInvariants(graph: WorldGraph): WorldInvariantResult {
  const violations: WorldInvariantViolation[] = [];
  const entities = graph.listEntities();
  const roots = entities.filter((e) => e.scale.parentEntityId === undefined);

  if (roots.length !== 1) {
    violations.push({
      message: `Expected exactly one root entity (no parentEntityId) for one coherent generated world; found ${roots.length}: ${roots.map((r) => r.id).join(', ') || '(none)'}.`,
    });
  }

  for (const entity of entities) {
    if (!entity.ref.kind || entity.ref.id === undefined || entity.ref.id === '') {
      violations.push({ entityId: entity.id, message: 'Entity has an empty or missing ref.kind/ref.id.' });
    }
    if (entity.scale.parentEntityId === entity.id) {
      violations.push({ entityId: entity.id, message: 'Entity is declared as its own parent.' });
    }
    if (entity.domainBinding && !entity.domainBinding.domainId) {
      violations.push({ entityId: entity.id, message: 'Entity declares a domainBinding with no domainId.' });
    }
  }

  for (const relationship of graph.listRelationships()) {
    if (relationship.from === relationship.to) {
      violations.push({ entityId: relationship.from, message: `Self-referential relationship "${relationship.kind}" (from === to) — almost always unintended.` });
    }
  }

  validateGeometryInvariants(graph, entities, violations);
  validateNavigationReachability(entities, violations);

  return { ok: violations.length === 0, violations };
}

/**
 * GEOMETRY-AWARE VALIDATION (World Generation Phase 4) — extends the SAME
 * gate every generated world already passes through
 * (`generateSpecifiedWorld` calls this function unconditionally), never a
 * second validator package (non-negotiable #12). Every check below is a
 * no-op for a world with no `geometry` component anywhere — the ~85
 * pre-existing worldModel tests carry none, so this never changes their
 * result.
 */
function validateGeometryInvariants(graph: WorldGraph, entities: readonly ReturnType<WorldGraph['listEntities']>[number][], violations: WorldInvariantViolation[]): void {
  const requireExists = (ref: { kind: string; id: string | number }, ownerId: string, fieldName: string) => {
    const id = entityId(ref);
    if (!graph.has(id)) {
      violations.push({ entityId: ownerId, message: `${fieldName} references unknown entity "${id}".` });
    }
  };

  for (const entity of entities) {
    const geometry = entity.geometry;
    if (!geometry) continue;
    switch (geometry.kind) {
      case 'PARCEL':
        requireExists(geometry.districtRef, entity.id, 'PARCEL.districtRef');
        break;
      case 'BUILDING':
        requireExists(geometry.parcelRef, entity.id, 'BUILDING.parcelRef');
        requireExists(geometry.districtRef, entity.id, 'BUILDING.districtRef');
        break;
      case 'FLOOR':
        requireExists(geometry.buildingRef, entity.id, 'FLOOR.buildingRef');
        break;
      case 'ROOM':
        requireExists(geometry.floorRef, entity.id, 'ROOM.floorRef');
        requireExists(geometry.buildingRef, entity.id, 'ROOM.buildingRef');
        break;
      case 'DOOR':
        requireExists(geometry.fromRef, entity.id, 'DOOR.fromRef');
        requireExists(geometry.toRef, entity.id, 'DOOR.toRef');
        break;
      case 'STAIR':
        requireExists(geometry.buildingRef, entity.id, 'STAIR.buildingRef');
        for (const floorRef of geometry.connectsFloorRefs) requireExists(floorRef, entity.id, 'STAIR.connectsFloorRefs');
        break;
      case 'ELEVATOR':
        requireExists(geometry.buildingRef, entity.id, 'ELEVATOR.buildingRef');
        for (const floorRef of geometry.connectsFloorRefs) requireExists(floorRef, entity.id, 'ELEVATOR.connectsFloorRefs');
        break;
      case 'ASSET_SLOT':
        requireExists(geometry.roomRef, entity.id, 'ASSET_SLOT.roomRef');
        if (geometry.occupantRef) requireExists(geometry.occupantRef, entity.id, 'ASSET_SLOT.occupantRef');
        break;
      case 'NAV_EDGE':
        requireExists(geometry.fromRef, entity.id, 'NAV_EDGE.fromRef');
        requireExists(geometry.toRef, entity.id, 'NAV_EDGE.toRef');
        if (geometry.costM < 0) violations.push({ entityId: entity.id, message: `NAV_EDGE.costM must be non-negative (got ${geometry.costM}).` });
        break;
      case 'APPROACH_POINT':
      case 'INTERACTION_POINT':
        requireExists(geometry.targetRef, entity.id, `${geometry.kind}.targetRef`);
        break;
      default:
        break;
    }
  }
}

/**
 * REACHABILITY VALIDATION (World Generation Phase 5, non-negotiable #10):
 * whenever a generated world declares a navigation graph (one or more
 * `NAV_NODE` entities), every nav node must be reachable from every other
 * via `NAV_EDGE`s — real graph connectivity, checked by traversal, never
 * assumed from generation order. A world with no nav nodes (navigation not
 * requested) skips this entirely.
 */
function validateNavigationReachability(entities: readonly ReturnType<WorldGraph['listEntities']>[number][], violations: WorldInvariantViolation[]): void {
  const navNodeIds = entities.filter((e) => e.geometry?.kind === 'NAV_NODE').map((e) => e.id);
  if (navNodeIds.length === 0) return;

  const adjacency = new Map<string, string[]>();
  for (const id of navNodeIds) adjacency.set(id, []);
  for (const entity of entities) {
    if (entity.geometry?.kind !== 'NAV_EDGE') continue;
    const fromId = entityId(entity.geometry.fromRef);
    const toId = entityId(entity.geometry.toRef);
    if (adjacency.has(fromId)) adjacency.get(fromId)!.push(toId);
    if (adjacency.has(toId)) adjacency.get(toId)!.push(fromId);
  }

  const visited = new Set<string>();
  const queue = [navNodeIds[0]];
  visited.add(navNodeIds[0]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const unreachable = navNodeIds.filter((id) => !visited.has(id));
  if (unreachable.length > 0) {
    violations.push({
      message: `Navigation graph is not fully connected: ${unreachable.length} of ${navNodeIds.length} nav nodes unreachable from "${navNodeIds[0]}" (e.g. ${unreachable.slice(0, 3).join(', ')}).`,
    });
  }
}
