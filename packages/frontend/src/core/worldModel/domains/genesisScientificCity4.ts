import { PUMP_PIPE_DEFAULTS } from '../../engineeringGraph/pumpPipe';
import { defineCrossDomainCoupling, type CrossDomainCoupling } from '../crossDomain/crossDomainCoupling';
import type { EntityId } from '../ecs/types';
import {
  addTunnelJunction,
  buildStmImagingCouplings,
  makeQuantumTunnelingSolver,
  QUANTUM_TUNNELING_SOLVER_ID,
} from './quantumTunneling';
import {
  addBackupGenerator,
  applyGeneratorStartCommand,
  ELECTRICAL_GENERATOR_SOLVER_ID,
  GENERATOR_STATUS,
  GENERATOR_STATUS_CHANGED_EVENT_TYPE,
  makeElectricalGeneratorSolver,
} from './electricalGenerator';
import { createScientificWorld, type CreateScientificWorldResult } from '../orchestration/createScientificWorld';
import { WorldRegistry } from '../persistence/worldRegistry';
import type { TemporalEngine, TemporalUpdater } from '../temporal/temporalEngine';
import {
  buildGenesisScientificCity3Specification,
  buildGenesisScientificCity3Updater,
  GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID,
  GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
  type GenesisScientificCity3Options,
} from './genesisScientificCity3';
import { bindEnvironmentToRainfallRunoff } from './rainfallRunoff';

/**
 * GENESIS SCIENTIFIC CITY 4.0 — the first true Trinity demo (Genesis
 * Scientific World Model 3.0, section 17), extended (Genesis Scientific
 * World Model 4.0, Priority 2.4) with a REAL backup-generator recovery
 * path — the pump-trip failure this reference world already models now
 * has a real, controllable INTERVENTION OPTION, not just a one-way
 * failure: starting the generator, waiting out its real startup delay,
 * and reaching RUNNING with sufficient rated power is what restores the
 * pump, the hospital's water service, and the population's access —
 * through the SAME cascade/coupling mechanism the rainfall failure
 * already uses (`crossDomain/crossDomainCoupling.ts`), never a special
 * case or a second orchestration path.
 *
 * The exact same base scenario as Genesis Scientific City 3.0 —SAME
 * specification, SAME templates, SAME real solvers, SAME rainfall ->
 * pump-trip -> hospital-service -> population-access cascade — but built
 * through the ONE canonical Trinity entry point
 * (`orchestration/createScientificWorld.ts`) instead of City 3.0's own
 * bespoke compile/generate/wrap pipeline, and registered in the real
 * `WorldRegistry` (section 6) rather than handed back as a bare object.
 *
 * This is NOT a second world engine, a second branch system, or a second
 * scenario implementation: `buildGenesisScientificCity3Specification` and
 * `buildGenesisScientificCity3Updater` are reused VERBATIM from City 3.0 —
 * only the generator domain and its own recovery couplings are new here,
 * layered on top via `buildGenesisScientificCity3Updater`'s own
 * `extraSolvers`/`extraCouplings` extension points, not a fork of that
 * function. (City 4.0 intentionally has no PLANET/REGION ancestor — that
 * wrap is City 3.0's own one-off composition, not part of the generic
 * `WorldSpecification` -> `createScientificWorld` path; the generated
 * CITY-scale entity ids are identical either way, since the wrap only
 * changes the root's ancestry, never a template's own child ids.)
 */
export interface GenesisScientificCity4Options extends GenesisScientificCity3Options {
  worldId?: string;
  /**
   * Adds the real quantum-tunnelling STM junction to the chemistry lab and
   * couples it to the sample (Phase 2). OPT-IN and off by default, on
   * purpose: enabling it adds an entity, a relationship and a domain to the
   * world, which would change `availableDomains` and the entity count for
   * every existing caller of the flagship scenario. Off, this world is
   * byte-identical to before Phase 2.
   */
  withQuantumLab?: boolean;
}

export interface GenesisScientificCity4 {
  base: CreateScientificWorldResult;
  registry: WorldRegistry;
  updater: TemporalUpdater;
  pumpPipeId: EntityId;
  hospitalBuildingId: EntityId;
  populationId: EntityId;
  labId: EntityId;
  substanceId: EntityId;
  generatorId: EntityId;
  /** Present only when `withQuantumLab` was requested — never a fabricated id for a world that has no junction. */
  tunnelJunctionId?: EntityId;
  waterSystemBuildingId: EntityId;
  /** Real intervention: commands the backup generator to start (mission section 10's "turn on the generator" example) — a thin, tested wrapper over `applyGeneratorStartCommand`, never a second intervention mechanism. */
  startGenerator: (engine: TemporalEngine) => void;
}

const WATER_SYSTEM_BUILDING_ID: EntityId = 'building:water-system-building';
const LAB_ID: EntityId = 'lab:lab1';
const SUBSTANCE_ID: EntityId = 'substance:s1';

/** The 3 couplings restoring the pump/hospital/population chain once the backup generator reaches RUNNING — the exact mirror of City 3.0's own 3 failure couplings, in the opposite direction. */
function buildRecoveryCouplings(): readonly CrossDomainCoupling[] {
  const generatorToPump = defineCrossDomainCoupling({
    id: 'generator-running-to-pump-power',
    sourceDomain: 'electrical',
    targetDomain: 'hydraulics',
    triggerEventType: GENERATOR_STATUS_CHANGED_EVENT_TYPE,
    relationshipKind: 'powers',
    direction: 'from',
    condition: 'Backup generator reaches RUNNING with rated power available',
    effect: "Pump-pipe system's volumetric flow is restored to its nominal baseline; the real hydraulics model re-solves headLoss/shaftPower on its own next tick",
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (pumpPipe, triggerEvent) => {
      if (triggerEvent.parameters.newStatus !== GENERATOR_STATUS.RUNNING) return undefined;
      if ((pumpPipe.domainState?.volumetricFlow ?? 0) > 0) return undefined; // already flowing — nothing to restore
      return {
        patch: { domainState: { ...pumpPipe.domainState, volumetricFlow: PUMP_PIPE_DEFAULTS.volumetricFlow }, statusLabel: 'Pump restored (backup generator online)' },
        eventType: 'hydraulics.pumppipe.restored',
        cause: 'backup-generator-restored-power',
      };
    },
  });

  const pumpRestoredToHospitalService = defineCrossDomainCoupling({
    id: 'pump-restored-to-hospital-service',
    sourceDomain: 'hydraulics',
    targetDomain: 'infrastructure',
    triggerEventType: 'hydraulics.pumppipe.restored',
    relationshipKind: 'feedsInto',
    direction: 'from',
    condition: 'Pump-pipe system restored by the backup generator',
    effect: "Hospital building's water service flag cleared",
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (hospitalBuilding) => {
      if (hospitalBuilding.domainState?.waterServiceInterrupted !== 1) return undefined;
      return {
        patch: { statusLabel: 'Water service restored (backup generator online)', domainState: { ...hospitalBuilding.domainState, waterServiceInterrupted: 0 } },
        eventType: 'building.waterservice.restored',
        cause: 'pump-restored',
      };
    },
  });

  const hospitalRestoredToPopulationAccess = defineCrossDomainCoupling({
    id: 'hospital-service-restored-to-population-access',
    sourceDomain: 'infrastructure',
    targetDomain: 'epidemiology',
    triggerEventType: 'building.waterservice.restored',
    relationshipKind: 'affects',
    direction: 'from',
    condition: 'Hospital building water service restored',
    effect:
      "Removes the outage's R0 override entirely, so the real SEIR solver falls back to its own base parameter EXACTLY (no arithmetic inverse, no floating-point drift, no leftover bookkeeping) — the precise mirror of the impairment coupling in genesisScientificCity3.ts. The S/E/I/R/D compartments are never written by this coupling either.",
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (population) => {
      const state = population.domainState ?? {};
      if (state.r0 === undefined) return undefined; // no outage override in force — nothing to restore
      const { r0: _outageR0, ...withoutOverride } = state;
      return {
        patch: { domainState: withoutOverride },
        eventType: 'population.hospitalaccess.restored',
        cause: 'hospital-water-service-restored',
      };
    },
  });

  /** Mirror of City 3.0's `pump-trip-to-lab-cooling`: the restored pump feeds the lab's cooling loop again, returning the sample to the EXACT setpoint that coupling recorded — the real Arrhenius model then re-solves k at the restored temperature on its own next tick. */
  const pumpRestoredToLabCooling = defineCrossDomainCoupling({
    id: 'pump-restored-to-lab-cooling',
    sourceDomain: 'hydraulics',
    targetDomain: 'chemistry-kinetics',
    triggerEventType: 'hydraulics.pumppipe.restored',
    relationshipKind: 'cools',
    direction: 'from',
    condition: 'Pump-pipe system restored, lab cooling loop fed again',
    effect: 'Lab sample returns to the cooling setpoint recorded when the loop was lost; the real Arrhenius kinetics model re-solves the rate constant at that temperature on its own next tick',
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (substance) => {
      const state = substance.domainState ?? {};
      if (state.coolingLost !== 1) return undefined; // cooling was never lost — nothing to restore
      const setpointK = state.cooledSetpointK;
      if (setpointK === undefined) return undefined; // no recorded setpoint: refuse to invent one
      const { cooledSetpointK: _recorded, ...withoutSetpoint } = state;
      return {
        patch: {
          physics: { ...substance.physics, massKg: substance.physics?.massKg ?? 0, temperatureK: setpointK },
          domainState: { ...withoutSetpoint, coolingLost: 0 },
          statusLabel: 'Cooling restored (backup generator online)',
        },
        eventType: 'chemistry.lab.coolingrestored',
        cause: 'pump-restored',
      };
    },
  });

  return [generatorToPump, pumpRestoredToHospitalService, hospitalRestoredToPopulationAccess, pumpRestoredToLabCooling];
}

export function buildGenesisScientificCity4(options: GenesisScientificCity4Options = {}): GenesisScientificCity4 {
  const specification = {
    ...buildGenesisScientificCity3Specification(options),
    worldId: options.worldId ?? 'genesis-scientific-city-4',
  };

  // Added via `augmentGraph` — runs BEFORE `createScientificWorld` constructs the `TemporalEngine`,
  // so the generator (and its relationship to the pump) is genuinely part of tick 0, exactly like
  // City 3.0's own postGenerate leaves attach to a compiled blueprint. Adding it AFTER construction
  // (either to `specified.graph` or directly to `engine.graph`) would be a real bug: the
  // constructor clones `initialGraph` for both `current` and its own `keyframeGraph`, so either
  // spot would either never reach the engine at all, or reach the live graph but not the keyframe
  // `scrubTo` replays from — silently breaking replay the instant anything scrubs backward (see
  // `createScientificWorld.ts`'s own `augmentGraph` doc for the full explanation).
  let generatorId!: EntityId;
  let tunnelJunctionId: EntityId | undefined;
  const base = createScientificWorld(
    { kind: 'specification', specification },
    {
      augmentGraph: (graph) => {
        // Phase 5: same real catchment binding City 3.0 applies on its own construction path, so
        // both paths tick an identically-solved environment node rather than diverging.
        bindEnvironmentToRainfallRunoff(graph, GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID);
        generatorId = addBackupGenerator(graph, { parentEntityId: WATER_SYSTEM_BUILDING_ID });
        graph.addRelationship(generatorId, GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID, 'powers');
        if (options.withQuantumLab) {
          // The junction lives inside the SAME chemistry lab the Arrhenius sample sits in, and
          // `images` is the declared edge its cross-domain coupling travels over.
          tunnelJunctionId = addTunnelJunction(graph, { parentEntityId: LAB_ID });
          graph.addRelationship(tunnelJunctionId, SUBSTANCE_ID, 'images');
        }
      },
    },
  );

  const updater = buildGenesisScientificCity3Updater(specification, options, {
    extraSolvers: [
      { solverId: ELECTRICAL_GENERATOR_SOLVER_ID, solver: makeElectricalGeneratorSolver() },
      ...(options.withQuantumLab ? [{ solverId: QUANTUM_TUNNELING_SOLVER_ID, solver: makeQuantumTunnelingSolver() }] : []),
    ],
    extraCouplings: [...buildRecoveryCouplings(), ...(options.withQuantumLab ? buildStmImagingCouplings() : [])],
  });

  const registry = new WorldRegistry();
  registry.save(base);

  return {
    base,
    registry,
    updater,
    pumpPipeId: GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
    hospitalBuildingId: 'building:hospital-building',
    populationId: 'population:city-1',
    labId: 'lab:lab1',
    substanceId: 'substance:s1',
    generatorId,
    tunnelJunctionId,
    waterSystemBuildingId: WATER_SYSTEM_BUILDING_ID,
    startGenerator: (engine) => {
      applyGeneratorStartCommand(engine, generatorId);
    },
  };
}
