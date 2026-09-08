import type { EntityId, GroundingLevel } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { TemporalEngine } from '../temporal/temporalEngine';
import type { WorldLever, WorldLeverCatalog } from '../../agent/worldGoalIntent';

/**
 * GENERIC INTERACTION SYSTEM — the C2-side bridge that lets ANY WorldFrame
 * entity, not just the pump, support "walk up -> inspect -> change a
 * parameter -> create a fork", by reading directly off the two things that
 * already exist and are already real:
 *
 *  - `WorldGraph` — the entity's actual current state (`inspectEntity`).
 *  - `WorldLeverCatalog.levers` — the world's own declared, tunable
 *    mechanisms (`leversForEntity`, keyed by `WorldLever.targetEntityId`).
 *
 * This deliberately does NOT wrap `discoveryLoop.ts`'s multi-round search
 * (preregistered criteria, belief ladders — a fit for an autonomous
 * question, not a real-time button press) or invent a second tunability
 * mechanism. `applyLeverIntervention` is the single-shot analogue of what
 * `discoveryLoop.ts`'s own `runArm` does per round: fork the engine at its
 * current tick, run exactly one lever's real `apply` at full strength, and
 * hand back the forked engine — the same primitive `GenesisWorldScreen.tsx`'s
 * pump-only `createFork()` already performed by hand, now generic over any
 * entity that has a lever targeting it.
 */

export interface EntityInspection {
  readonly id: EntityId;
  readonly label: string;
  readonly domainState: Readonly<Record<string, number>> | undefined;
  readonly statusLabel: string | undefined;
  readonly grounding: GroundingLevel;
}

/** Reads an entity's real, current state off the live graph — never a re-derivation or a guess. */
export function inspectEntity(graph: WorldGraph, entityId: EntityId): EntityInspection | null {
  if (!graph.has(entityId)) return null;
  const entity = graph.getEntity(entityId);
  return {
    id: entity.id,
    label: entity.label,
    domainState: entity.domainState,
    statusLabel: entity.statusLabel,
    grounding: entity.grounding,
  };
}

/**
 * The catalog's own real levers whose `apply` mutates this exact entity —
 * empty for an entity the world declares no mechanism for (e.g. the
 * hospital, the population: real entities, honestly inspect-only today).
 */
export function leversForEntity(catalog: WorldLeverCatalog, entityId: EntityId): readonly WorldLever[] {
  return catalog.levers.filter((lever) => lever.targetEntityId === entityId);
}

/**
 * Runs ONE real lever at full strength (`strength: 1`, the same convention
 * `discoveryLoop.ts`'s own belief-ladder search converges toward for a
 * confirmed mechanism) as a real intervention branch off the engine's
 * current tick — a single press-E action, not a search.
 *
 * `metric`/`direction` only select the criterion/statement text a lever's
 * `hypothesis()` narrates (every lever's `apply` ignores them and always
 * performs the same real mutation) — callers with no specific question in
 * mind may pass the catalog's own primary objective.
 */
export function applyLeverIntervention(
  engine: TemporalEngine,
  lever: WorldLever,
  metric: string,
  direction: 'minimize' | 'maximize',
  label: string,
): TemporalEngine {
  const hypothesis = lever.hypothesis(metric, direction);
  return engine.forkBranch(engine.tick, label, (graph) => hypothesis.apply(graph, 1));
}
