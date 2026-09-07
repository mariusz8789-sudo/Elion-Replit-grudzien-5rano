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

  return { ok: violations.length === 0, violations };
}
