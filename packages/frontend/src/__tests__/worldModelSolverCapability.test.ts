import { describe, expect, it } from 'vitest';
import { parseScenarioRequest } from '../core/lookingGlass/scenarioRequest';
import {
  CAPABILITY_CODE,
  describeCapability,
  isModelled,
  NOT_MODELLED_SCENARIO_KINDS,
  SOLVER_CAPABILITY_BY_SCENARIO_KIND,
  solverCapabilityFor,
} from '../core/worldModel/capability/solverCapability';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { makeChemistryKineticsSolver, CHEMISTRY_KINETICS_SOLVER_ID } from '../core/worldModel/domains/chemistryKinetics';
import { makeEpidemicSEIRSolver, EPIDEMIC_SEIR_SOLVER_ID } from '../core/worldModel/domains/epidemicSEIR';
import { DEFAULT_EPIDEMIC } from '../core/epidemic/sir';
import { makeHydraulicsPumpPipeSolver, HYDRAULICS_PUMP_PIPE_SOLVER_ID } from '../core/worldModel/domains/hydraulicsPumpPipe';
import { makeElectricalGeneratorSolver, ELECTRICAL_GENERATOR_SOLVER_ID } from '../core/worldModel/domains/electricalGenerator';
import { makeQuantumTunnelingSolver, QUANTUM_TUNNELING_SOLVER_ID } from '../core/worldModel/domains/quantumTunneling';
import { makeRainfallRunoffSolver, RAINFALL_RUNOFF_SOLVER_ID } from '../core/worldModel/domains/rainfallRunoff';
import { makeSeismicSourceSolver, SEISMIC_SOURCE_SOLVER_ID } from '../core/worldModel/domains/seismicShaking';
import { buildSyntheticTerrain, FLOOD_INUNDATION_SOLVER_ID, makeFloodInundationSolver } from '../core/worldModel/domains/floodInundation';
import { CELL_CYCLE_SOLVER_ID, makeCellCycleSolver } from '../core/worldModel/domains/cellCycle';
import { makeMolecularStructureSolver, MOLECULAR_STRUCTURE_SOLVER_ID } from '../core/worldModel/domains/molecularStructure';
import { buildTrafficNetwork, makeTrafficFlowSolver, TRAFFIC_FLOW_SOLVER_ID } from '../core/worldModel/domains/trafficFlow';
import { buildRoadNetwork } from '../core/world/roadNetwork';
import { buildCity } from '../core/world/cityWorld';
import { FIRE_THERMAL_SOLVER_ID, FUEL_PACKAGES, makeFireThermalSolver } from '../core/worldModel/domains/fireThermal';
import { DROUGHT_SOLVER_ID, makeDroughtWaterBalanceSolver } from '../core/worldModel/domains/drought';

/**
 * PHASE 7 — FIRE/THERMAL AND TRAFFIC.
 *
 * The audit found neither existed. Both now have a real solver for one honest
 * slice: traffic has a fundamental-diagram/CTM network solver
 * (`domains/trafficFlow.ts`), and fire/thermal has a single-source
 * heat-release-rate/radiant-heat solver (`domains/fireThermal.ts`). These
 * tests pin both findings in place: assertions that fail if anyone ever
 * claims more than what was built, or claims a recognisable scenario kind
 * with no capability answer at all.
 */
describe('Fire and traffic are real, honestly-bounded solvers', () => {
  it('industrial fire is PARTIALLY_MODELLED by the real HRR/radiation solver, with the actual remaining gaps named', () => {
    const capability = solverCapabilityFor('INDUSTRIAL_FIRE');
    expect(capability.capability).toBe(CAPABILITY_CODE.PARTIALLY_MODELLED);
    expect(capability.solverId).toBe(FIRE_THERMAL_SOLVER_ID);
    expect(capability.caveat).toMatch(/fire spread/);
    expect(capability.caveat).toMatch(/structural response/);
  });

  it('wildfire stays NOT_MODELLED — the fire solver never advances more than one non-spreading source', () => {
    const capability = solverCapabilityFor('WILDFIRE');
    expect(capability.capability).toBe(CAPABILITY_CODE.NOT_MODELLED);
    expect(capability.solverId).toBeUndefined(); // nothing is quietly wired up to answer it
    expect(capability.missing!.join(' ')).toMatch(/spread/);
    expect(capability.missing!.join(' ')).toMatch(/fuel-bed/);
  });

  it('traffic disruption is PARTIALLY_MODELLED by the real CTM solver, with the actual remaining gaps named', () => {
    const capability = solverCapabilityFor('TRANSPORT_DISRUPTION');
    expect(capability.capability).toBe(CAPABILITY_CODE.PARTIALLY_MODELLED);
    expect(capability.solverId).toBe(TRAFFIC_FLOW_SOLVER_ID);
    expect(capability.caveat).toMatch(/origin-destination/);
    expect(capability.caveat).toMatch(/calibration/);
  });

  it('evacuation inherits the traffic caveat plus its own, rather than being silently fully modelled', () => {
    const capability = solverCapabilityFor('EVACUATION');
    expect(capability.capability).toBe(CAPABILITY_CODE.PARTIALLY_MODELLED);
    expect(capability.solverId).toBe(TRAFFIC_FLOW_SOLVER_ID);
    expect(capability.caveat).toMatch(/origin-destination/);
    expect(capability.caveat).toMatch(/evacuation behaviour model/);
  });
});

describe('Every recognisable scenario gets an honest answer', () => {
  it('a NOT_MODELLED entry always names what is missing; a MODELLED one always names a solver', () => {
    for (const [kind, capability] of Object.entries(SOLVER_CAPABILITY_BY_SCENARIO_KIND)) {
      if (capability.capability === CAPABILITY_CODE.NOT_MODELLED) {
        expect(capability.missing, `${kind} must name its gaps`).toBeDefined();
        expect(capability.missing!.length, `${kind} must name its gaps`).toBeGreaterThan(0);
        expect(capability.solverId, `${kind} claims no solver`).toBeUndefined();
      }
      if (capability.capability === CAPABILITY_CODE.MODELLED) {
        expect(capability.solverId, `${kind} must name its solver`).toBeTruthy();
      }
      if (capability.capability === CAPABILITY_CODE.PARTIALLY_MODELLED) {
        expect(capability.caveat, `${kind} must state what it still does not cover`).toBeTruthy();
      }
    }
  });

  it('every solver a MODELLED or PARTIALLY_MODELLED entry names is really registered and really runs', () => {
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(DEFAULT_EPIDEMIC));
    router.register(HYDRAULICS_PUMP_PIPE_SOLVER_ID, makeHydraulicsPumpPipeSolver());
    router.register(ELECTRICAL_GENERATOR_SOLVER_ID, makeElectricalGeneratorSolver());
    router.register(QUANTUM_TUNNELING_SOLVER_ID, makeQuantumTunnelingSolver());
    router.register(RAINFALL_RUNOFF_SOLVER_ID, makeRainfallRunoffSolver());
    router.register(SEISMIC_SOURCE_SOLVER_ID, makeSeismicSourceSolver());
    router.register(FLOOD_INUNDATION_SOLVER_ID, makeFloodInundationSolver(buildSyntheticTerrain()));
    router.register(CELL_CYCLE_SOLVER_ID, makeCellCycleSolver());
    router.register(MOLECULAR_STRUCTURE_SOLVER_ID, makeMolecularStructureSolver());
    router.register(TRAFFIC_FLOW_SOLVER_ID, makeTrafficFlowSolver(buildTrafficNetwork(buildRoadNetwork(buildCity()))));
    router.register(FIRE_THERMAL_SOLVER_ID, makeFireThermalSolver({ growthRate: 'MEDIUM', fuel: FUEL_PACKAGES.FLAMMABLE_LIQUID_POOL, peakHRRkW: 5000 }));
    router.register(DROUGHT_SOLVER_ID, makeDroughtWaterBalanceSolver());

    for (const [kind, capability] of Object.entries(SOLVER_CAPABILITY_BY_SCENARIO_KIND)) {
      if (!capability.solverId) continue;
      // A named solver that isn't registered anywhere would be a claim with nothing behind it.
      expect(router.hasSolver(capability.solverId), `${kind} names ${capability.solverId}, which must exist`).toBe(true);
    }
  });

  it('a request the classifier understands always reaches a capability answer', () => {
    // The failure this guards against: C1 understands "show me a wildfire", and
    // the world model then says nothing at all — which reads as "nothing happened".
    for (const sentence of ['show me a wildfire in the city', 'pokaż pożar przemysłowy', 'simulate an extreme rainfall flood', 'show me an earthquake']) {
      const request = parseScenarioRequest(sentence);
      if (!request.kind) continue;
      const capability = solverCapabilityFor(request.kind);
      expect(Object.values(CAPABILITY_CODE)).toContain(capability.capability);
      expect(describeCapability(request.kind).length).toBeGreaterThan(20);
    }
  });

  it('a wildfire request is understood AND refused with its reason, not answered vaguely', () => {
    const request = parseScenarioRequest('show me a wildfire in the city');
    expect(request.kind).toBe('WILDFIRE');
    expect(isModelled('WILDFIRE')).toBe(false);
    const description = describeCapability('WILDFIRE');
    expect(description).toContain('NOT MODELLED');
    expect(description).toContain('spread');
  });
});

describe('The honest inventory is queryable, not buried', () => {
  it('the not-modelled list is sorted, non-empty, contains wildfire, and no longer industrial fire, traffic, or drought', () => {
    expect(NOT_MODELLED_SCENARIO_KINDS).toContain('WILDFIRE');
    expect(NOT_MODELLED_SCENARIO_KINDS).not.toContain('INDUSTRIAL_FIRE');
    expect(NOT_MODELLED_SCENARIO_KINDS).not.toContain('TRANSPORT_DISRUPTION');
    expect(NOT_MODELLED_SCENARIO_KINDS).not.toContain('EVACUATION');
    expect(NOT_MODELLED_SCENARIO_KINDS).not.toContain('DROUGHT');
    expect([...NOT_MODELLED_SCENARIO_KINDS]).toEqual([...NOT_MODELLED_SCENARIO_KINDS].sort());
  });

  it('the modelled kinds describe themselves by naming a real solver', () => {
    expect(describeCapability('EPIDEMIC')).toContain(EPIDEMIC_SEIR_SOLVER_ID);
    expect(describeCapability('HYDRAULIC_SYSTEM')).toContain(HYDRAULICS_PUMP_PIPE_SOLVER_ID);
  });

  it('the partially-modelled kinds state the hole, never only the capability', () => {
    // Phase 8.2 made depth and extent real; the hydrograph is the part that is still absent.
    expect(describeCapability('FLOOD')).toContain('real hydrograph');
    expect(describeCapability('FLOOD')).toMatch(/Still NOT modelled: a flood-wave front/);
    expect(describeCapability('EARTHQUAKE')).toMatch(/Structural damage.*still NOT modelled/);
    expect(describeCapability('TRANSPORT_DISRUPTION')).toMatch(/Still NOT modelled: origin-destination/);
    expect(describeCapability('INDUSTRIAL_FIRE')).toMatch(/Still NOT.*modelled: fire spread/);
    expect(describeCapability('DROUGHT')).toMatch(/Still NOT modelled: this is not the Standardized Precipitation Index/);
  });

  it('consequence-vs-design boundaries stay stated where a request could be misread', () => {
    for (const kind of ['EXPLOSION_CONSEQUENCE', 'BIOLOGICAL_CONTAMINATION', 'RADIOLOGICAL_CONTAMINATION'] as const) {
      expect(solverCapabilityFor(kind).missing!.join(' ')).toMatch(/architectural|out of scope by architecture/);
    }
  });
});
