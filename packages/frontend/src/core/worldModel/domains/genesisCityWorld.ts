import { DEFAULT_EPIDEMIC, type EpidemicParams } from '../../epidemic/sir';
import type { PumpPipeDefaults } from '../../engineeringGraph/pumpPipe';
import { spawnEntity } from '../ecs/entityFactory';
import type { EntityId } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import { SolverRouter } from '../solvers/solverRouter';
import type { TemporalUpdater } from '../temporal/temporalEngine';
import {
  CHEMISTRY_KINETICS_SOLVER_ID,
  addChemistryLab,
  addChemistrySubstance,
  makeChemistryKineticsSolver,
  type ChemistryExperimentOptions,
} from './chemistryKinetics';
import { EPIDEMIC_SEIR_SOLVER_ID, addPopulation, makeEpidemicSEIRSolver } from './epidemicSEIR';
import { HYDRAULICS_PUMP_PIPE_SOLVER_ID, addPumpPipeSystem, makeHydraulicsPumpPipeSolver } from './hydraulicsPumpPipe';
import { makeRainfallRunoffSolver, RAINFALL_RUNOFF_SOLVER_ID } from './rainfallRunoff';

/**
 * ONE WORLD, THREE REAL SCIENTIFIC SYSTEMS.
 *
 * CITY
 *  ├── HOSPITAL   -> population (real RK4 SEIR)
 *  ├── LAB        -> substance (real Arrhenius kinetics)
 *  └── WATER SYSTEM -> pump-pipe system (real hydraulics EngineeringModel)
 *
 * All three live in ONE `WorldGraph`, share one `TemporalEngine` (world
 * identity, simulated time, journal, branch), and are each advanced by
 * their OWN existing real solver. There is no invented coupling between
 * them — e.g. chemistry temperature has no effect on the epidemic curve or
 * the hydraulic flow, because no validated model connects them. Where two
 * domains are not scientifically coupled, they are exactly what this world
 * represents them as: independent subsystems sharing a world, not a fake
 * shared physics.
 */
export const SECONDS_PER_DAY = 86400;

export interface GenesisCityWorldOptions {
  cityId?: string;
  chemistry?: ChemistryExperimentOptions;
  epidemicParams?: EpidemicParams;
  hydraulicsParams?: Partial<PumpPipeDefaults>;
}

export interface GenesisCityWorld {
  graph: WorldGraph;
  cityId: EntityId;
  hospitalId: EntityId;
  populationId: EntityId;
  labId: EntityId;
  substanceId: EntityId;
  waterSystemId: EntityId;
  pumpPipeId: EntityId;
  epidemicParams: EpidemicParams;
}

/** A pure container — no solver advances it directly, so it stays `UNGROUNDED_APPROXIMATION` (NOT_MODELLED), same honest default `spawnEntity` already applies. */
function addContainer(graph: WorldGraph, kind: string, id: string, label: string, parentEntityId: EntityId | undefined, position: { x: number; y: number; z: number }): EntityId {
  return spawnEntity(graph, { ref: { kind, id }, label, scaleLevel: 'MESO_LAB', parentEntityId, spatial: { position } });
}

export function buildGenesisCityWorld(options: GenesisCityWorldOptions = {}): GenesisCityWorld {
  const graph = new WorldGraph();
  const epidemicParams = options.epidemicParams ?? DEFAULT_EPIDEMIC;

  const cityId = spawnEntity(graph, {
    ref: { kind: 'city', id: options.cityId ?? 'city-1' },
    label: 'Genesis City',
    scaleLevel: 'MACRO_CITY',
    spatial: { position: { x: 0, y: 0, z: 0 } },
  });

  const hospitalId = addContainer(graph, 'hospital', 'hospital-1', 'City Hospital', cityId, { x: -10, y: 0, z: 0 });
  const populationId = addPopulation(graph, { parentEntityId: hospitalId, scale: 'MESO_LAB', params: epidemicParams });

  const labId = addChemistryLab(graph, { parentEntityId: cityId, position: { x: 10, y: 0, z: 0 } });
  const substanceId = addChemistrySubstance(graph, labId, options.chemistry);

  const waterSystemId = addContainer(graph, 'water-system', 'water-system-1', 'City Water System', cityId, { x: 0, y: 10, z: 0 });
  const pumpPipeId = addPumpPipeSystem(graph, { parentEntityId: waterSystemId, params: options.hydraulicsParams });

  return { graph, cityId, hospitalId, populationId, labId, substanceId, waterSystemId, pumpPipeId, epidemicParams };
}

/** Registers all three real domain solvers on one router — the same `SolverRouter` used for a single domain, just with more entries. */
export function makeGenesisCityRouter(epidemicParams: EpidemicParams): SolverRouter {
  const router = new SolverRouter();
  router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
  router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(epidemicParams));
  router.register(HYDRAULICS_PUMP_PIPE_SOLVER_ID, makeHydraulicsPumpPipeSolver());
  router.register(RAINFALL_RUNOFF_SOLVER_ID, makeRainfallRunoffSolver());
  return router;
}

/**
 * One shared tick clock, in seconds, driving three real solvers each in its
 * own natural unit: chemistry takes `dt` directly (seconds); hydraulics
 * ignores it (steady-state); epidemiology gets it converted to fractional
 * days via `dtBySolverId` — a real unit conversion at the routing boundary,
 * never a change to what any solver's own `dt` means.
 */
export function makeGenesisCityUpdater(router: SolverRouter): TemporalUpdater {
  return (g, dtSeconds, tick) => router.routeTick(g, dtSeconds, tick, { [EPIDEMIC_SEIR_SOLVER_ID]: dtSeconds / SECONDS_PER_DAY });
}
