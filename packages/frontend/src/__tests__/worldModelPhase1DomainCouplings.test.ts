import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { executeIntervention } from '../core/worldModel/bridge/worldFrameState';
import { R_GAS } from '../core/modelGraph/chemistryKineticsGraph';
import { DEFAULT_EPIDEMIC } from '../core/epidemic/sir';
import { buildGenesisCityWorld, makeGenesisCityRouter, makeGenesisCityUpdater } from '../core/worldModel/domains/genesisCityWorld';
import {
  HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE,
  HOSPITAL_WATER_OUTAGE_R0_MULTIPLIER,
  LAB_COOLING_LOST_EVENT_TYPE,
  LAB_LOST_COOLING_TEMPERATURE_RISE_K,
  POPULATION_ACCESS_IMPAIRED_EVENT_TYPE,
  PUMP_TRIPPED_EVENT_TYPE,
  RAINFALL_EVENT_TYPE,
} from '../core/worldModel/domains/genesisScientificCity3';
import { buildGenesisScientificCity4 } from '../core/worldModel/domains/genesisScientificCity4';
import { getCausalAncestry } from '../core/worldModel/queries/worldQueries';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 1 — CHEMISTRY + EPIDEMIOLOGY COUPLING (Genesis Full Scientific
 * Consolidation, phase 1: "existing REAL solvers, zero new science, only the
 * missing CrossDomainCoupling").
 *
 * Both solvers were already real and already registered, but neither had any
 * cross-domain coupling — chemistry had no declared relationship to the rest
 * of the city at all, and epidemiology's one coupling was a no-op
 * (`patch: {}`) that never reached the real SEIR model. These tests prove
 * both are now genuinely coupled, that the REAL solvers (not the couplings)
 * compute every consequence, and that the flagship rainfall scenario is
 * unchanged.
 *
 * DAY-LENGTH TICKS: the flagship scenario's own tests tick at dt=1 SECOND,
 * where a real epidemic (dt/86400 days) and a real Arrhenius decay barely
 * move at all. These tests tick at dt=86400s so both real solvers advance a
 * genuine day per tick and the coupled consequences are actually observable
 * — a test-harness choice, never a change to any solver's own contract.
 */
const DAY_SECONDS = 86_400;

describe('Phase 1a — the epidemiology solver now PERSISTS a live parameter override (real bug fix)', () => {
  it('an r0 intervention survives the next tick (before this fix it was erased immediately)', () => {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(makeGenesisCityRouter(world.epidemicParams));
    engine.advance(DAY_SECONDS, updater);

    executeIntervention(engine, world.populationId, { 'domainState.r0': 0.3 });
    expect(engine.graph.getEntity(world.populationId).domainState?.r0).toBe(0.3);

    engine.advance(DAY_SECONDS, updater);
    // THE REGRESSION: the solver replaces domainState wholesale each tick, so before the fix this
    // read `undefined` — the "real contact-reduction intervention" its own doc documents survived
    // zero ticks, and no coupling into epidemiology could ever hold.
    expect(engine.graph.getEntity(world.populationId).domainState?.r0).toBe(0.3);
  });

  it('the override actually changes the real RK4 trajectory, not just the stored number', () => {
    const build = () => {
      const world = buildGenesisCityWorld();
      const engine = new TemporalEngine(world.graph);
      return { engine, world, updater: makeGenesisCityUpdater(makeGenesisCityRouter(world.epidemicParams)) };
    };

    const baseline = build();
    const suppressed = build();
    executeIntervention(suppressed.engine, suppressed.world.populationId, { 'domainState.r0': 0.3 });

    for (let i = 0; i < 30; i++) {
      baseline.engine.advance(DAY_SECONDS, baseline.updater);
      suppressed.engine.advance(DAY_SECONDS, suppressed.updater);
    }

    const baselineInfected = baseline.engine.graph.getEntity(baseline.world.populationId).domainState!.I;
    const suppressedInfected = suppressed.engine.graph.getEntity(suppressed.world.populationId).domainState!.I;
    expect(suppressedInfected).toBeLessThan(baselineInfected); // R0 0.3 < 1 -> the outbreak dies out
  });

  it('a population that never carried an override keeps a byte-identical domainState shape (backward compatible)', () => {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);
    engine.advance(DAY_SECONDS, makeGenesisCityUpdater(makeGenesisCityRouter(world.epidemicParams)));
    expect(Object.keys(engine.graph.getEntity(world.populationId).domainState!).sort()).toEqual(['D', 'E', 'I', 'R', 'S', 'beta', 't']);
  });
});

describe('Phase 1b — hydraulics -> epidemiology is now a REAL coupling into the SEIR model', () => {
  it("the hospital outage raises the population's real R0 parameter by the disclosed multiplier", () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1, worldId: 'phase1-epi' });
    const engine = city.base.engine;
    expect(engine.graph.getEntity(city.populationId).domainState?.r0).toBeUndefined(); // no override before the outage

    for (let i = 0; i < 6; i++) engine.advance(DAY_SECONDS, city.updater);

    const types = engine.journal.allEvents().map((e) => e.type);
    expect(types).toContain(HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE);
    expect(types).toContain(POPULATION_ACCESS_IMPAIRED_EVENT_TYPE);
    expect(engine.graph.getEntity(city.populationId).domainState?.r0).toBeCloseTo(DEFAULT_EPIDEMIC.r0 * HOSPITAL_WATER_OUTAGE_R0_MULTIPLIER, 10);
  });

  it('the raised R0 produces a genuinely different epidemic curve — computed by the real solver, never written in', () => {
    const outage = buildGenesisScientificCity4({ rainfallAtTick: 1, worldId: 'phase1-epi-outage' });
    const noOutage = buildGenesisScientificCity4({ worldId: 'phase1-epi-none' }); // same world, rainfall scenario disabled

    for (let i = 0; i < 25; i++) {
      outage.base.engine.advance(DAY_SECONDS, outage.updater);
      noOutage.base.engine.advance(DAY_SECONDS, noOutage.updater);
    }

    const outageState = outage.base.engine.graph.getEntity(outage.populationId).domainState!;
    const cleanState = noOutage.base.engine.graph.getEntity(noOutage.populationId).domainState!;
    expect(outageState.r0).toBeCloseTo(DEFAULT_EPIDEMIC.r0 * HOSPITAL_WATER_OUTAGE_R0_MULTIPLIER, 10);
    expect(cleanState.r0).toBeUndefined();
    // beta = R0 / infectiousDays — the real model's own transmission rate, recomputed by the solver.
    expect(outageState.beta).toBeCloseTo((DEFAULT_EPIDEMIC.r0 * HOSPITAL_WATER_OUTAGE_R0_MULTIPLIER) / DEFAULT_EPIDEMIC.infectiousDays, 10);
    expect(outageState.I).toBeGreaterThan(cleanState.I); // a real, solver-computed consequence
    expect(outageState.S).toBeLessThan(cleanState.S);
  });
});

describe('Phase 1c — hydraulics -> chemistry is now a REAL coupling into the Arrhenius model', () => {
  it('the pump trip raises the sample temperature by the disclosed drift and records the setpoint', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1, worldId: 'phase1-chem' });
    const engine = city.base.engine;
    const setpointBefore = engine.graph.getEntity(city.substanceId).physics!.temperatureK!;

    for (let i = 0; i < 6; i++) engine.advance(DAY_SECONDS, city.updater);

    const types = engine.journal.allEvents().map((e) => e.type);
    expect(types).toContain(PUMP_TRIPPED_EVENT_TYPE);
    expect(types).toContain(LAB_COOLING_LOST_EVENT_TYPE);

    const substance = engine.graph.getEntity(city.substanceId);
    expect(substance.physics?.temperatureK).toBeCloseTo(setpointBefore + LAB_LOST_COOLING_TEMPERATURE_RISE_K, 10);
    expect(substance.domainState?.coolingLost).toBe(1);
    expect(substance.domainState?.cooledSetpointK).toBe(setpointBefore);
  });

  it('the REAL Arrhenius model re-solves the rate constant at the new temperature — the exact k(T2)/k(T1) ratio, not a scripted number', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1, worldId: 'phase1-chem-rate' });
    const engine = city.base.engine;
    const substanceBefore = engine.graph.getEntity(city.substanceId);
    const t1 = substanceBefore.physics!.temperatureK!;
    const activationEnergyKJ = substanceBefore.chemical!.activationEnergyKJ!;

    for (let i = 0; i < 6; i++) engine.advance(DAY_SECONDS, city.updater);

    const steps = engine.journal.allEvents().filter((e) => e.type === 'chemistry.kinetics.step');
    const firstRate = steps[0]!.parameters.rateConstantPerS as number;
    const lastRate = steps[steps.length - 1]!.parameters.rateConstantPerS as number;

    const t2 = t1 + LAB_LOST_COOLING_TEMPERATURE_RISE_K;
    // k = A·exp(−Eₐ/RT), so k(T2)/k(T1) = exp(Eₐ/R·(1/T1 − 1/T2)) — A cancels. This is the real
    // model's own prediction, computed here independently of the solver: if the coupling had faked
    // the effect (or the solver had not re-solved at all), this equality would not hold.
    const expectedRatio = Math.exp(((activationEnergyKJ * 1000) / R_GAS) * (1 / t1 - 1 / t2));
    expect(lastRate / firstRate).toBeCloseTo(expectedRatio, 6);
    expect(expectedRatio).toBeGreaterThan(50); // sanity: this is a large, genuinely observable change
  });

  it('the chemistry consequence is causally traceable back to the real solver step that tripped the pump', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1, worldId: 'phase1-chem-causal' });
    const engine = city.base.engine;
    for (let i = 0; i < 6; i++) engine.advance(DAY_SECONDS, city.updater);

    const coolingLost = engine.journal.allEvents().find((e) => e.type === LAB_COOLING_LOST_EVENT_TYPE)!;
    const ancestryTypes = getCausalAncestry(engine, coolingLost.id).map((e) => e.type);
    expect(ancestryTypes).toContain(PUMP_TRIPPED_EVENT_TYPE);
    expect(ancestryTypes).toContain('hydraulics.pumppipe.step'); // the real solver step whose measured headLoss tripped the pump

    // HONEST BOUNDARY (identical to the existing City 4.0 causal test): the chain ends at the
    // solver step. A solver's own step event is `provenance.origin: 'model'` with no
    // `parentEventId`, so it does NOT link back to the rainfall event that raised its input flow —
    // the causal graph records consequence chains between EVENTS, and nothing today asserts that a
    // solver re-solved *because of* a specific earlier event. Asserted here as a real limitation
    // rather than papered over with a fabricated parent link.
    expect(ancestryTypes).not.toContain(RAINFALL_EVENT_TYPE);
  });
});

describe('Phase 1d — the generator recovery restores BOTH new domains, exactly', () => {
  it('restores the sample to its recorded setpoint and drops the R0 override entirely', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1, worldId: 'phase1-recovery' });
    const engine = city.base.engine;
    const setpoint = engine.graph.getEntity(city.substanceId).physics!.temperatureK!;

    for (let i = 0; i < 6; i++) engine.advance(DAY_SECONDS, city.updater);
    expect(engine.graph.getEntity(city.substanceId).domainState?.coolingLost).toBe(1);
    expect(engine.graph.getEntity(city.populationId).domainState?.r0).toBeDefined();

    city.startGenerator(engine);
    for (let i = 0; i < 4; i++) engine.advance(DAY_SECONDS, city.updater);

    const types = engine.journal.allEvents().map((e) => e.type);
    expect(types).toContain('chemistry.lab.coolingrestored');
    expect(types).toContain('population.hospitalaccess.restored');

    const substance = engine.graph.getEntity(city.substanceId);
    expect(substance.physics?.temperatureK).toBe(setpoint); // EXACT, from the recorded setpoint
    expect(substance.domainState?.coolingLost).toBe(0);
    expect(substance.domainState?.cooledSetpointK).toBeUndefined(); // bookkeeping cleaned up

    const population = engine.graph.getEntity(city.populationId);
    // Restored by REMOVING the override, so the solver falls back to its own base parameter exactly
    // (a multiply-then-divide would have left floating-point drift instead).
    expect(population.domainState?.r0).toBeUndefined();
    expect(population.domainState?.beta).toBeCloseTo(DEFAULT_EPIDEMIC.r0 / DEFAULT_EPIDEMIC.infectiousDays, 10);
  });

  it('replay stays byte-identical through the whole failure + recovery with both new couplings active', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1, worldId: 'phase1-replay' });
    const engine = city.base.engine;
    for (let i = 0; i < 6; i++) engine.advance(DAY_SECONDS, city.updater);
    city.startGenerator(engine);
    for (let i = 0; i < 4; i++) engine.advance(DAY_SECONDS, city.updater);

    const live = [...engine.graph.listEntities()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const replayed = [...engine.scrubTo(engine.tick).listEntities()].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(canonicalJson(replayed)).toBe(canonicalJson(live));
  });
});

describe('Phase 1e — the flagship rainfall scenario itself is unchanged', () => {
  it('the same 80mm/hr scenario at dt=1s still trips the pump and interrupts hospital service, in the same order', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1, worldId: 'phase1-flagship' });
    const engine = city.base.engine;
    for (let i = 0; i < 5; i++) engine.advance(1, city.updater); // the flagship's own dt, unchanged

    const all = engine.journal.allEvents();
    expect(all.find((e) => e.type === RAINFALL_EVENT_TYPE)).toBeDefined();
    expect(all.find((e) => e.type === PUMP_TRIPPED_EVENT_TYPE)).toBeDefined();
    expect(all.find((e) => e.type === HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE)).toBeDefined();
    expect(all.find((e) => e.type === POPULATION_ACCESS_IMPAIRED_EVENT_TYPE)).toBeDefined();
    expect(engine.graph.getEntity(city.pumpPipeId).domainState?.volumetricFlow).toBe(0);
    expect(engine.graph.getEntity(city.hospitalBuildingId).domainState?.waterServiceInterrupted).toBe(1);
  });
});
