import { NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, newtonianKinematicsSolver } from '../worldModel/solvers/solverRouter';
import { WorldGraph } from '../worldModel/ecs/worldGraph';
import type { WorldModelEntity } from '../worldModel/ecs/types';
import type { ScientificSolverBinding } from './scientificSolverIntegration';

/**
 * D-140 real-repo binding: `ScientificSolverBinding` dispatched through the ONE canonical
 * `SolverRouter`/`WorldGraph` classes (`core/worldModel/solvers/solverRouter.ts`,
 * `core/worldModel/ecs/worldGraph.ts`) — the same router/graph machinery
 * `TemporalEngine.advance()` drives for every other Genesis scientific world.
 *
 * Neither D-138 nor D-139 exists in this repository (verified: neither a decision-log entry nor a
 * module is present anywhere in the codebase), so a domain-specific thermal/chemistry solver cannot
 * honestly be claimed as "the existing canonical D-138/D-139 solver." Rather than register a new
 * solver invented for D-140 and present it as proof that a pre-existing canonical solver was reused
 * — which would overstate what this repo already had — this binding dispatches to
 * `newtonianKinematicsSolver` (`solverRouter.ts`'s own `GROUNDED_EXACT` reference solver, exported
 * under `NEWTONIAN_KINEMATICS_SOLVER_ID`), a solver that genuinely existed in this repo before D-140
 * and is already the reference implementation `SolverRouter.routeTick` falls back on for other
 * physics-bound entities. This proves the real SolverRouter dispatch mechanism (input/output
 * fingerprints, Evidence, deterministic replay) against an ACTUAL existing canonical solver, not a
 * purpose-built stand-in — the honest alternative to a fabricated D-138/D-139 claim.
 */

export interface KinematicsSolverInput {
  readonly positionM: readonly [number, number, number];
  readonly velocityMS: readonly [number, number, number];
  readonly elapsedSeconds: number;
}

export interface KinematicsSolverOutput {
  readonly positionM: readonly [number, number, number];
}

let sharedRouter: SolverRouter | null = null;
function getSharedRouter(): SolverRouter {
  if (!sharedRouter) {
    sharedRouter = new SolverRouter();
    sharedRouter.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);
  }
  return sharedRouter;
}

let kinematicsEntitySeq = 0;

/**
 * Builds a `ScientificSolverBinding` that executes the request through a real `WorldGraph` entity +
 * a real `SolverRouter.routeTick` call dispatching to the PRE-EXISTING `newtonianKinematicsSolver`
 * — never a bare function call bypassing the router, and never a solver written for D-140 itself.
 * Each `execute` creates one throwaway entity on a fresh graph (the router/solver registration is
 * shared and canonical; the entity/graph are per-call working state, exactly like any other Genesis
 * solver call operates on whatever graph the caller passes it).
 */
export function createGenesisKinematicsSolverBinding(): ScientificSolverBinding<KinematicsSolverInput, KinematicsSolverOutput> {
  return {
    solverId: NEWTONIAN_KINEMATICS_SOLVER_ID,
    modelId: 'PRE_EXISTING_CANONICAL_NEWTONIAN_KINEMATICS',
    version: '1.0.0',
    execute(input: KinematicsSolverInput): KinematicsSolverOutput {
      if (input.elapsedSeconds < 0) throw new Error('elapsedSeconds must be non-negative');
      const router = getSharedRouter();
      const graph = new WorldGraph();
      kinematicsEntitySeq += 1;
      const entityId = `d140-kinematics:${kinematicsEntitySeq}`;
      const [px, py, pz] = input.positionM;
      const [vx, vy, vz] = input.velocityMS;
      const entity: WorldModelEntity = {
        id: entityId,
        ref: { kind: 'd140-kinematics-sample', id: kinematicsEntitySeq },
        label: 'D-140 kinematics sample',
        scale: { level: 'MESO_LAB' },
        spatial: { position: { x: px, y: py, z: pz } },
        physics: { massKg: 1, velocityMS: { x: vx, y: vy, z: vz } },
        domainBinding: { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'd140-kinematics' },
        grounding: 'UNGROUNDED_APPROXIMATION',
        updatedAtTick: 0,
      };
      graph.addEntity(entity);
      const report = router.routeTick(graph, input.elapsedSeconds, 1, { [NEWTONIAN_KINEMATICS_SOLVER_ID]: input.elapsedSeconds });
      if (report.ungrounded.includes(entityId)) throw new Error('D-140 kinematics request did not route through the real SolverRouter');
      const resultEntity = graph.getEntity(entityId);
      const position = resultEntity.spatial?.position;
      if (!position) throw new Error('SolverRouter did not produce a position result');
      return { positionM: [position.x, position.y, position.z] };
    },
  };
}
