import type { GenesisEvent } from '../../events/genesisEvent';
import { frictionFactor } from '../../engineeringGraph/pumpPipe';
import type { Observation } from '../../world/scientificWorldState';
import type { EntityId, GroundingLevel, WorldModelEntity, WorldModelEntityPatch } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';

/**
 * SOLVER ROUTER & GROUNDING LAYER.
 *
 * Routes each entity's per-tick update to the real Genesis domain solver its
 * `DomainBindingComponent.solverId` names. When no solver is registered for
 * a declared binding, a generic procedural heuristic advances the entity
 * instead (`PROCEDURAL_APPROXIMATION`). When an entity has no domain
 * binding at all, C3 does not silently invent physics for it: it is left
 * untouched, flagged `UNGROUNDED_APPROXIMATION`, and surfaced to the caller
 * (C1) via `routeTick().ungrounded`.
 *
 * A real solver may also hand back the `Observation`/`GenesisEvent` it
 * produced along the way — `routeTick` collects these so the caller
 * (`TemporalEngine.advance`) can record them as evidence/provenance.
 */
export interface SolverResult {
  patch: WorldModelEntityPatch;
  grounding: GroundingLevel;
  /** Evidence this step produced, if the solver computed something worth recording (not every tick needs one). */
  observation?: Observation;
  event?: GenesisEvent;
}

export interface SolverContext {
  readonly dt: number;
  /** Absolute simulation tick this step advances the world to — real solvers use it to stamp their evidence. */
  readonly tick: number;
  readonly graph: WorldGraph;
}

export type DomainSolver = (entity: WorldModelEntity, ctx: SolverContext) => SolverResult;

export interface SolverRouteReport {
  /** Entities advanced by a registered real solver or the procedural fallback. */
  updated: readonly EntityId[];
  /** Entities that carry no domain binding at all — alert C1, per mission rule #3. */
  ungrounded: readonly EntityId[];
  observations: readonly Observation[];
  events: readonly GenesisEvent[];
}

export class SolverRouter {
  private readonly solvers = new Map<string, DomainSolver>();

  register(solverId: string, solver: DomainSolver): void {
    this.solvers.set(solverId, solver);
  }

  hasSolver(solverId: string): boolean {
    return this.solvers.has(solverId);
  }

  routeTick(graph: WorldGraph, dt: number, tick = 0): SolverRouteReport {
    const updated: EntityId[] = [];
    const ungrounded: EntityId[] = [];
    const observations: Observation[] = [];
    const events: GenesisEvent[] = [];

    for (const entity of graph.listEntities()) {
      const binding = entity.domainBinding;
      if (!binding) {
        graph.updateEntity(entity.id, { grounding: 'UNGROUNDED_APPROXIMATION' });
        ungrounded.push(entity.id);
        continue;
      }

      const ctx: SolverContext = { dt, tick, graph };
      const solver = binding.solverId ? this.solvers.get(binding.solverId) : undefined;
      const result = solver ? solver(entity, ctx) : proceduralFallback(entity, ctx);
      graph.updateEntity(entity.id, { ...result.patch, grounding: result.grounding });
      updated.push(entity.id);
      if (result.observation) observations.push(result.observation);
      if (result.event) events.push(result.event);
    }

    return { updated, ungrounded, observations, events };
  }
}

/**
 * No registered solver for a declared binding: fall back to inertial
 * (constant-velocity) integration when the entity has a physics component,
 * or a no-op hold otherwise. Always disclosed as `PROCEDURAL_APPROXIMATION`.
 */
function proceduralFallback(entity: WorldModelEntity, ctx: SolverContext): SolverResult {
  if (!entity.spatial || !entity.physics?.velocityMS) {
    return { patch: {}, grounding: 'PROCEDURAL_APPROXIMATION' };
  }
  const v = entity.physics.velocityMS;
  const p = entity.spatial.position;
  const { dt } = ctx;
  return {
    patch: { spatial: { ...entity.spatial, position: { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt } } },
    grounding: 'PROCEDURAL_APPROXIMATION',
  };
}

/**
 * GROUNDED_EXACT reference solver: unforced Newtonian kinematics
 * (position += velocity·dt, velocity unchanged). Exact by construction —
 * not a model, a definition.
 */
export const NEWTONIAN_KINEMATICS_SOLVER_ID = 'newtonian-kinematics';

export const newtonianKinematicsSolver: DomainSolver = (entity, ctx) => {
  if (!entity.spatial || !entity.physics?.velocityMS) {
    return { patch: {}, grounding: 'GROUNDED_EXACT' };
  }
  const v = entity.physics.velocityMS;
  const p = entity.spatial.position;
  const { dt } = ctx;
  return {
    patch: { spatial: { ...entity.spatial, position: { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt } } },
    grounding: 'GROUNDED_EXACT',
  };
};

/**
 * MODEL_ESTIMATE example integration with a real Genesis engine: reuses the
 * documented Swamee-Jain friction model from
 * `core/engineeringGraph/pumpPipe.ts` (already disclosed there as
 * `'empirical-model'` honesty) to decelerate a fluid-parcel entity's
 * velocity via pipe friction, rather than reimplementing hydraulics here.
 */
export const HYDRAULIC_FRICTION_SOLVER_ID = 'hydraulic-friction-pump-pipe';

export interface HydraulicFrictionParams {
  pipeDiameterM: number;
  relativeRoughness: number;
}

export function makeHydraulicFrictionSolver(params: HydraulicFrictionParams): DomainSolver {
  return (entity, ctx) => {
    if (!entity.spatial || !entity.physics?.velocityMS) {
      return { patch: {}, grounding: 'MODEL_ESTIMATE' };
    }
    const { dt } = ctx;
    const { velocityMS, densityKgM3 = 1000, viscosityPaS = 1.002e-3 } = entity.physics;
    const speed = Math.hypot(velocityMS.x, velocityMS.y, velocityMS.z);
    if (speed <= 0) return { patch: {}, grounding: 'MODEL_ESTIMATE' };

    const reynolds = (densityKgM3 * speed * params.pipeDiameterM) / viscosityPaS;
    const f = frictionFactor(reynolds, params.relativeRoughness);
    // Darcy friction deceleration per unit length, applied along the flow direction for this tick.
    const decel = f * (speed * speed) / (2 * params.pipeDiameterM);
    const newSpeed = Math.max(0, speed - decel * dt);
    const scale = speed > 0 ? newSpeed / speed : 0;
    const p = entity.spatial.position;
    const newVelocity = { x: velocityMS.x * scale, y: velocityMS.y * scale, z: velocityMS.z * scale };
    return {
      patch: {
        spatial: { ...entity.spatial, position: { x: p.x + velocityMS.x * dt, y: p.y + velocityMS.y * dt, z: p.z + velocityMS.z * dt } },
        physics: { ...entity.physics, velocityMS: newVelocity },
      },
      grounding: 'MODEL_ESTIMATE',
    };
  };
}
