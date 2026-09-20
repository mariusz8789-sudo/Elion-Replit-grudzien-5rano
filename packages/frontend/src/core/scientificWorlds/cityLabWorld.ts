import type { Obstacle, RoomBounds, Vec2 } from '../three/firstPersonController';
import type { CommandCatalog } from './worldCommand';
import type { LabStation } from './labWorld';

/**
 * SCIENTIFIC WORLDS — THE EPIDEMIOLOGY CITY WORLD (SW-4, pure data).
 *
 * A small, real command→agent→session world for the epidemiology city — the
 * SAME `WorldCommand`/`ActionPlan`/`AgentController`/`ExperimentSession`/
 * Evidence Ledger pipeline `labWorld.ts`/`biologyLabWorld.ts`/
 * `chemistryRunners.ts` already use, not a second command bus. Its one
 * station's `experimentId` (`epidemic-seir-city`, see `cityRunners.ts`) is
 * computed by the REAL `core/worldModel/domains/epidemicSEIR.ts` domain —
 * the existing World Model "SEIR" seam (`WorldGraph` + `DomainSolver`), not
 * a re-derived epidemic model: that module's own header documents its
 * trajectory as bit-for-bit the same RK4 integration `core/epidemic/sir.ts`
 * already runs everywhere else in Genesis.
 *
 * `st-epidemic-command`'s `kind: 'epidemiology'` is the SAME `StationKind`
 * the physics lab's `st-epidemiology` console already uses — `agentLabScene3D.ts`
 * already has a real build case for it (no new 3D content authored here),
 * and its artifact is typed as the existing `EpidemicArtifact`
 * (`experimentRunners.ts`), which the scene already knows how to draw. This
 * world reuses the SAME generic (non-biology) `AgentLabScene3D` render path
 * physics already uses — no second renderer.
 */

export const CITY_WORLD_ID = 'genesis-epidemiology-city';

export const CITY_ROOM: RoomBounds = { minX: -6, maxX: 6, minZ: -5, maxZ: 5 };

/** Agent spawn: south end of the operations room, facing the command console. */
export const CITY_SPAWN: { readonly position: Vec2; readonly facing: number } = { position: { x: 0, z: 3.6 }, facing: Math.PI };

const fp = (x: number, z: number, w: number, d: number): Obstacle => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

export const CITY_STATIONS: readonly LabStation[] = [
  {
    id: 'st-epidemic-command', kind: 'epidemiology', label: 'Centrum dowodzenia epidemiologicznego', experimentId: 'epidemic-seir-city',
    keywords: ['centrum dowodzenia', 'epidemi', 'miasto', 'city', 'seir', 'zakażeń', 'zakazen', 'pandemi', 'command center', 'epidemic'],
    position: { x: 0, z: -2.2 }, facing: 0, standoff: 1.3, consoleHeight: 0.95, footprint: fp(0, -2.2, 2.6, 1.2),
  },
];

export const CITY_OBSTACLES: readonly Obstacle[] = [
  ...CITY_STATIONS.map((s) => s.footprint),
];

export const CITY_CATALOG: CommandCatalog = {
  worldId: CITY_WORLD_ID,
  stations: CITY_STATIONS,
  allowedIntents: ['NAVIGATE', 'INTERACT', 'RUN_EXPERIMENT', 'ASK', 'SCENARIO', 'INSPECT'],
};

export function cityStation(id: string): LabStation | null {
  return CITY_STATIONS.find((s) => s.id === id) ?? null;
}
