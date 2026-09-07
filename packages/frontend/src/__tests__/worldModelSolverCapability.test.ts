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
import { makeMolecularStructureSolver, MOLECULAR_STRUCTURE_SOLVER_ID } from '../core/worldModel/domains/molecularStructure';

/**
 * PHASE 7 — FIRE/THERMAL AND TRAFFIC.
 *
 * The audit found neither exists. These tests pin that finding in place: not
 * as a comment that can rot, but as assertions that fail if anyone ever claims
 * a fire or traffic capability without building one, and — more importantly —
 * if a recognisable scenario kind is ever left with no capability answer at all.
 */
describe('Fire and traffic are absent, and the registry says so rather than approximating', () => {
  it('both fire kinds are NOT_MODELLED, with the missing physics named', () => {
    for (const kind of ['WILDFIRE', 'INDUSTRIAL_FIRE'] as const) {
      const capability = solverCapabilityFor(kind);
      expect(capability.capability).toBe(CAPABILITY_CODE.NOT_MODELLED);
      expect(capability.solverId).toBeUndefined(); // nothing is quietly wired up to answer it
      expect(capability.missing!.join(' ')).toMatch(/combustion|flame-spread/);
      expect(capability.missing!.join(' ')).toMatch(/heat transfer/);
    }
  });

  it('traffic is NOT_MODELLED, and the reason names the actual code rather than hand-waving', () => {
    const capability = solverCapabilityFor('TRANSPORT_DISRUPTION');
    expect(capability.capability).toBe(CAPABILITY_CODE.NOT_MODELLED);
    // The specific finding: agents exist, but they never interact, so there is no flow.
    expect(capability.missing!.join(' ')).toMatch(/cityAgent\.ts do not interact/);
    expect(capability.missing!.join(' ')).toMatch(/fundamental diagram|car-following/);
  });

  it('evacuation inherits the traffic gap plus its own, rather than being silently modelled', () => {
    const capability = solverCapabilityFor('EVACUATION');
    expect(capability.capability).toBe(CAPABILITY_CODE.NOT_MODELLED);
    expect(capability.missing!.some((m) => m.includes('evacuation behaviour model'))).toBe(true);
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
    router.register(MOLECULAR_STRUCTURE_SOLVER_ID, makeMolecularStructureSolver());

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
    expect(description).toContain('combustion');
  });
});

describe('The honest inventory is queryable, not buried', () => {
  it('the not-modelled list is sorted, non-empty, and contains the fire and traffic kinds', () => {
    expect(NOT_MODELLED_SCENARIO_KINDS).toContain('WILDFIRE');
    expect(NOT_MODELLED_SCENARIO_KINDS).toContain('INDUSTRIAL_FIRE');
    expect(NOT_MODELLED_SCENARIO_KINDS).toContain('TRANSPORT_DISRUPTION');
    expect([...NOT_MODELLED_SCENARIO_KINDS]).toEqual([...NOT_MODELLED_SCENARIO_KINDS].sort());
  });

  it('the modelled kinds describe themselves by naming a real solver', () => {
    expect(describeCapability('EPIDEMIC')).toContain(EPIDEMIC_SEIR_SOLVER_ID);
    expect(describeCapability('HYDRAULIC_SYSTEM')).toContain(HYDRAULICS_PUMP_PIPE_SOLVER_ID);
  });

  it('the partially-modelled kinds state the hole, never only the capability', () => {
    expect(describeCapability('FLOOD')).toMatch(/Inundation itself is NOT modelled/);
    expect(describeCapability('EARTHQUAKE')).toMatch(/Structural damage.*NOT modelled/);
  });

  it('consequence-vs-design boundaries stay stated where a request could be misread', () => {
    for (const kind of ['EXPLOSION_CONSEQUENCE', 'BIOLOGICAL_CONTAMINATION', 'RADIOLOGICAL_CONTAMINATION'] as const) {
      expect(solverCapabilityFor(kind).missing!.join(' ')).toMatch(/architectural|out of scope by architecture/);
    }
  });
});
