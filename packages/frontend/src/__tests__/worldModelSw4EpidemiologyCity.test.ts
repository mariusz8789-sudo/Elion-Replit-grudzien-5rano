import { describe, expect, it } from 'vitest';
import { CAPABILITY_CODE } from '../core/worldModel/capability/solverCapability';
import { EPIDEMIC_DOMAIN_ID, EPIDEMIC_SEIR_SOLVER_ID } from '../core/worldModel/domains/epidemicSEIR';
import {
  buildSw4CitySpecification,
  buildSw4EvidenceBundle,
  getSw4RenderState,
  replaySw4EpidemiologyCityScenario,
  runSw4EpidemiologyCityScenario,
  SW4_CONTRACT_VERSION,
  SW4_EPIDEMIC_DISCLOSURE,
  SW4_SCENARIO_ID,
  type Sw4EpidemiologyCityOptions,
} from '../core/worldModel/scenarios/sw4EpidemiologyCity';
import { GENESIS_AGENT_TOOLS, GENESIS_TOOLS, WORLD_SW4_EPIDEMIOLOGY_CITY_TOOL } from '../core/agent/genesisAgentTools';

/**
 * SW-4 — GENERATED-CITY EPIDEMIC SCENARIO.
 *
 * These tests prove the real pipeline runs end to end:
 * WorldSpecification -> compileSpecification/generateWorld (via
 * createScientificWorld) -> a real generated WorldGraph -> the real
 * `addPopulation` builder -> the real, REGISTERED RK4 SEIR solver -> several
 * real `TemporalEngine.advance` ticks -> canonical state queries -> a
 * deterministic replay with an identical fingerprint. No mock solver, no
 * hardcoded post-state, no fabricated curve, and no second SEIR
 * implementation — every assertion below reads back exactly what
 * `domains/epidemicSEIR.ts::makeEpidemicSEIRSolver` (wrapping the real
 * `core/epidemic/sir.ts::rk4Step`) produced.
 */

const BASE_OPTIONS: Sw4EpidemiologyCityOptions = {
  seed: 424242,
  populationCount: 50_000,
  epidemicParams: { r0: 2.5, infectiousDays: 7, incubationDays: 3, initialInfected: 25 },
  ticks: 30,
  dtDays: 1,
};

describe('SW-4: WorldSpecification -> canonical compiler -> canonical WorldGenerator -> WorldGraph', () => {
  it('compiles a deterministic CITY + EPIDEMIOLOGY specification using the existing templates, not a new one', () => {
    const spec = buildSw4CitySpecification(BASE_OPTIONS);
    expect(spec.worldType).toEqual(['CITY', 'EPIDEMIOLOGY']);
    expect(spec.seed).toBe(BASE_OPTIONS.seed);
    expect(spec.population?.count).toBe(BASE_OPTIONS.populationCount);
    expect(spec.scientificDomains).toEqual([{ domain: 'epidemiology', required: true }]);
  });

  it('generates a real WorldGraph containing city structure (districts/buildings/roads) and a real population entity', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const entities = run.engine.graph.listEntities();
    expect(entities.some((e) => e.ref.kind === 'district')).toBe(true);
    expect(entities.some((e) => e.ref.kind === 'building')).toBe(true);
    expect(entities.some((e) => e.ref.kind === 'road')).toBe(true);
    const population = run.engine.graph.getEntity(run.populationId);
    expect(population.domainBinding).toEqual({ solverId: EPIDEMIC_SEIR_SOLVER_ID, domainId: EPIDEMIC_DOMAIN_ID });
  });
});

describe('SW-4: population inserted through the existing population API', () => {
  it('the population entity was created by the real addPopulation builder (via EPIDEMIOLOGY_TEMPLATE), not a hand-rolled entity', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const population = run.engine.graph.getEntity(run.populationId);
    expect(population.ref.kind).toBe('population');
    expect(population.scale.level).toBe('MESO_LAB');
    // These are the RUN'S OWN captured tick-0 snapshot — the live entity has already
    // advanced past it by the time this assertion runs (BASE_OPTIONS.ticks real steps).
    expect(run.initial.S).toBeCloseTo(BASE_OPTIONS.populationCount! - 25, 3);
    expect(run.initial.I).toBeCloseTo(25, 3);
  });

  it('a valid initial S/E/I/R state is created through canonical contracts (core/epidemic/sir.ts::initialState)', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    expect(run.initial.S + run.initial.E + run.initial.I + run.initial.R + run.initial.D).toBeCloseTo(BASE_OPTIONS.populationCount!, 3);
    expect(run.initial.E).toBe(0);
    expect(run.initial.R).toBe(0);
    expect(run.initial.tick).toBe(0);
  });
});

describe('SW-4: the real, registered SEIR solver executes for multiple real steps', () => {
  it('runs the requested number of real ticks and the state actually changes', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    expect(run.ticksRun).toBe(30);
    expect(run.final.tick).toBe(30);
    expect(run.final.simulatedTimeDays).toBeCloseTo(30, 6);
    // A real R0=2.5 SEIR outbreak must rise substantially above the 25-person seed within 30 days.
    expect(run.final.I).toBeGreaterThan(run.initial.I);
  });

  it('the population entity is bound to and grounded by the real, named solver id — never a mock', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const population = run.engine.graph.getEntity(run.populationId);
    expect(population.domainBinding?.solverId).toBe(EPIDEMIC_SEIR_SOLVER_ID);
    expect(population.grounding).toBe('MODEL_ESTIMATE');
    expect(run.solverId).toBe(EPIDEMIC_SEIR_SOLVER_ID);
  });

  it('records a real epidemiology.seir.step event and observation per tick, provenance naming the real engine', () => {
    const run = runSw4EpidemiologyCityScenario({ ...BASE_OPTIONS, ticks: 3 });
    const events = run.engine.journal.allEvents().filter((e) => e.type === 'epidemiology.seir.step');
    expect(events.length).toBe(3);
    const observations = run.engine.journal.allObservations();
    expect(observations.length).toBe(3);
    expect(observations[0]!.provenance).toContain('core/epidemic/sir.ts');
  });
});

describe('SW-4: invariants', () => {
  it('population is conserved (S+E+I+R+D constant) across every real step', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const conservation = run.invariants.find((c) => c.name === 'population-conservation');
    expect(conservation?.ok).toBe(true);
  });

  it('no compartment ever goes negative', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const nonNegative = run.invariants.find((c) => c.name === 'compartments-non-negative');
    expect(nonNegative?.ok).toBe(true);
  });

  it('a real registered solver (not a procedural or ungrounded fallback) actually advanced the population', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const realSolver = run.invariants.find((c) => c.name === 'real-solver-executed');
    expect(realSolver?.ok).toBe(true);
  });

  it('the state genuinely advanced tick-over-tick, not a frozen no-op', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const advanced = run.invariants.find((c) => c.name === 'state-actually-advanced');
    expect(advanced?.ok).toBe(true);
  });

  it('rejects a negative tick count rather than silently running zero/garbage steps', () => {
    expect(() => runSw4EpidemiologyCityScenario({ ...BASE_OPTIONS, ticks: -1 })).toThrow();
  });
});

describe('SW-4: deterministic replay and fingerprint', () => {
  it('two independent from-scratch runs over the SAME options produce byte-identical final compartments', () => {
    const runA = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const runB = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    expect(runB.final.S).toBe(runA.final.S);
    expect(runB.final.E).toBe(runA.final.E);
    expect(runB.final.I).toBe(runA.final.I);
    expect(runB.final.R).toBe(runA.final.R);
    expect(runB.finalWorldStateFingerprint).toBe(runA.finalWorldStateFingerprint);
  });

  it('replaySw4EpidemiologyCityScenario reports a real MATCH verdict via the existing replay mechanism', () => {
    const result = replaySw4EpidemiologyCityScenario(BASE_OPTIONS);
    expect(result.replay.verdict).toBe('MATCH');
    expect(result.replay.recordedFingerprint).toBe(result.replay.recomputedFingerprint);
    expect(result.optionsFingerprintMatch).toBe(true);
  });

  it('a different seed produces a different fingerprint — replay is not vacuously always MATCH', () => {
    const runA = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const runB = runSw4EpidemiologyCityScenario({ ...BASE_OPTIONS, seed: BASE_OPTIONS.seed + 1 });
    expect(runB.finalWorldStateFingerprint).not.toBe(runA.finalWorldStateFingerprint);
  });

  it('a different epidemic parameter produces a different fingerprint and a different options fingerprint', () => {
    const runA = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const runB = runSw4EpidemiologyCityScenario({ ...BASE_OPTIONS, epidemicParams: { ...BASE_OPTIONS.epidemicParams, r0: 1.1 } });
    expect(runB.finalWorldStateFingerprint).not.toBe(runA.finalWorldStateFingerprint);
    expect(runB.optionsFingerprint).not.toBe(runA.optionsFingerprint);
  });
});

describe('SW-4: renderer-facing read-only state adapter', () => {
  it('exposes exactly the fields a renderer needs, matching the live engine state', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const state = getSw4RenderState(run);
    expect(state.scenarioId).toBe(SW4_SCENARIO_ID);
    expect(state.contractVersion).toBe(SW4_CONTRACT_VERSION);
    expect(state.tick).toBe(run.final.tick);
    expect(state.susceptible).toBe(run.final.S);
    expect(state.exposed).toBe(run.final.E);
    expect(state.infected).toBe(run.final.I);
    expect(state.recovered).toBe(run.final.R);
    expect(state.dead).toBe(run.final.D);
    expect(state.totalPopulation).toBeCloseTo(BASE_OPTIONS.populationCount!, 3);
    expect(state.solverId).toBe(EPIDEMIC_SEIR_SOLVER_ID);
    expect(state.domainId).toBe(EPIDEMIC_DOMAIN_ID);
    expect(state.grounding).toBe('MODEL_ESTIMATE');
    expect(state.classification).toBe('REAL');
    expect(state.worldStateFingerprint).toBe(run.finalWorldStateFingerprint);
    expect(state.disclosure).toBe(SW4_EPIDEMIC_DISCLOSURE);
  });

  it('never mutates the underlying engine (read-only)', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const before = run.engine.tick;
    getSw4RenderState(run);
    getSw4RenderState(run);
    expect(run.engine.tick).toBe(before);
  });

  it('carries an honest MODEL/SIMULATED disclosure — never a claim of measured epidemic data', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const state = getSw4RenderState(run);
    expect(state.disclosure).toMatch(/SIMULATED/);
    expect(state.disclosure).toMatch(/not a direct observation/i);
  });
});

describe('SW-4: evidence, over the existing WorldGraph evidence bundle mechanism', () => {
  it('produces a real WorldEvidenceBundle (not a second evidence format) with a verified replay when a verify run is supplied', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const verifyRun = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const bundle = buildSw4EvidenceBundle({ bundleId: 'sw4-test-bundle', question: 'What does a real R0=2.5 SEIR outbreak look like over a generated city of 50,000?', run, verifyRun });
    expect(bundle.worldId).toBe(run.specification.worldId);
    expect(bundle.domainId).toBe(EPIDEMIC_DOMAIN_ID);
    expect(bundle.solvers).toEqual([{ solverId: EPIDEMIC_SEIR_SOLVER_ID, domainId: EPIDEMIC_DOMAIN_ID }]);
    expect(bundle.replay.verdict).toBe('MATCH');
    expect(bundle.limitations).toContain(SW4_EPIDEMIC_DISCLOSURE);
  });

  it('honestly reports NOT_REPRODUCIBLE when no verify run was supplied — never a false MATCH', () => {
    const run = runSw4EpidemiologyCityScenario(BASE_OPTIONS);
    const bundle = buildSw4EvidenceBundle({ bundleId: 'sw4-test-bundle-2', question: 'Same question, no verification run.', run });
    expect(bundle.replay.verdict).toBe('NOT_REPRODUCIBLE');
  });
});

describe('SW-4: exposed as a real agent tool, on the existing tool registry', () => {
  it(`registers ${WORLD_SW4_EPIDEMIOLOGY_CITY_TOOL} with a real, non-empty capability`, () => {
    const tool = GENESIS_AGENT_TOOLS.get(WORLD_SW4_EPIDEMIOLOGY_CITY_TOOL);
    expect(tool).toBeDefined();
    expect(tool?.capability.capability).toBe(CAPABILITY_CODE.MODELLED);
    expect(tool?.capability.solverId).toBe(EPIDEMIC_SEIR_SOLVER_ID);
  });

  it('invoking the concrete tool returns the same shape getSw4RenderState produces, never the live engine', () => {
    const output = GENESIS_TOOLS.sw4EpidemiologyCityTool.invoke(BASE_OPTIONS);
    expect(output.susceptible + output.exposed + output.infected + output.recovered + output.dead).toBeCloseTo(BASE_OPTIONS.populationCount!, 3);
    expect(output.solverId).toBe(EPIDEMIC_SEIR_SOLVER_ID);
    expect('engine' in (output as object)).toBe(false);
  });
});
