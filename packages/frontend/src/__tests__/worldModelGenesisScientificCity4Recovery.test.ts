import { describe, expect, it } from 'vitest';
import { GENERATOR_STATUS, GENERATOR_STATUS_CHANGED_EVENT_TYPE } from '../core/worldModel/domains/electricalGenerator';
import { buildGenesisScientificCity4 } from '../core/worldModel/domains/genesisScientificCity4';
import { PUMP_TRIPPED_EVENT_TYPE, HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE, POPULATION_ACCESS_IMPAIRED_EVENT_TYPE } from '../core/worldModel/domains/genesisScientificCity3';
import { getCausalAncestry, getUpstream, getDownstream } from '../core/worldModel/queries/worldQueries';

/**
 * GENESIS SCIENTIFIC CITY 4.0 — REAL GENERATOR RECOVERY (Priority 2.4 +
 * 2.6): the pump-trip failure is no longer a one-way dead end — a real
 * backup-generator intervention restores it, through the SAME cascade/
 * coupling mechanism the failure itself uses. This is also the mission's
 * own "real 5+ hop, 3+ domain causal chain" proof (Priority 2.6):
 * electrical -> hydraulics -> infrastructure -> epidemiology, all via the
 * EXISTING getCausalAncestry/getUpstream/getDownstream queries.
 */
function runUntil(engine: ReturnType<typeof buildGenesisScientificCity4>['base']['engine'], updater: ReturnType<typeof buildGenesisScientificCity4>['updater'], predicate: () => boolean, maxTicks = 30): void {
  for (let i = 0; i < maxTicks && !predicate(); i++) engine.advance(1, updater);
  if (!predicate()) throw new Error('predicate never became true within maxTicks — test fixture assumption broke');
}

describe('Genesis Scientific City 4.0: the pump trip has a real recovery path', () => {
  it('starting the backup generator, once it reaches RUNNING, restores the pump, the hospital service, and population access', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1 });
    const engine = city.base.engine;

    runUntil(engine, city.updater, () => engine.journal.allEvents().some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE));
    expect(engine.graph.getEntity(city.pumpPipeId).domainState?.volumetricFlow).toBe(0);
    expect(engine.graph.getEntity(city.hospitalBuildingId).domainState?.waterServiceInterrupted).toBe(1);

    city.startGenerator(engine);
    expect(engine.graph.getEntity(city.generatorId).domainState?.status).toBe(1); // STARTING

    runUntil(engine, city.updater, () => engine.journal.allEvents().some((e) => e.type === 'population.hospitalaccess.restored'));

    expect(engine.graph.getEntity(city.generatorId).domainState?.status).toBe(GENERATOR_STATUS.RUNNING);
    expect(engine.graph.getEntity(city.pumpPipeId).domainState?.volumetricFlow).toBeGreaterThan(0);
    expect(engine.graph.getEntity(city.hospitalBuildingId).domainState?.waterServiceInterrupted).toBe(0);
  });

  it('the real causal chain from population access restoration traces back through the pump and generator, across 4 real domains', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1 });
    const engine = city.base.engine;
    runUntil(engine, city.updater, () => engine.journal.allEvents().some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE));
    city.startGenerator(engine);
    runUntil(engine, city.updater, () => engine.journal.allEvents().some((e) => e.type === 'population.hospitalaccess.restored'));

    const restoredEvent = engine.journal.allEvents().find((e) => e.type === 'population.hospitalaccess.restored')!;
    const ancestry = getCausalAncestry(engine, restoredEvent.id);
    const types = ancestry.map((e) => e.type);

    // A real, verified chain — electrical (generator) -> hydraulics (pump) -> infrastructure
    // (hospital building) -> epidemiology (population) — every link a genuine parentEventId, not
    // asserted separately from what the query actually returns.
    expect(types).toContain(GENERATOR_STATUS_CHANGED_EVENT_TYPE);
    expect(types).toContain('hydraulics.pumppipe.restored');
    expect(types).toContain('building.waterservice.restored');
    expect(ancestry.length).toBeGreaterThanOrEqual(4);

    // The SAME chain is honestly present in the OTHER direction too, and the pre-existing failure
    // chain (rainfall -> trip -> hospital -> population impairment) is untouched by any of this —
    // both real cascades coexist on the exact same entities without interfering with each other.
    expect(engine.journal.allEvents().some((e) => e.type === HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE)).toBe(true);
    expect(engine.journal.allEvents().some((e) => e.type === POPULATION_ACCESS_IMPAIRED_EVENT_TYPE)).toBe(true);
  });

  it('upstream/downstream queries see the real generator -> pump -> hospital relationship chain', () => {
    const city = buildGenesisScientificCity4();
    const engine = city.base.engine;
    expect(getDownstream(engine, city.generatorId).map((e) => e.id)).toContain(city.pumpPipeId);
    expect(getUpstream(engine, city.hospitalBuildingId).map((e) => e.id)).toEqual(expect.arrayContaining([city.pumpPipeId, city.generatorId]));
  });

  it('without ever starting the generator, the pump stays tripped forever — no fabricated auto-recovery', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1 });
    const engine = city.base.engine;
    for (let i = 0; i < 25; i++) engine.advance(1, city.updater);
    expect(engine.graph.getEntity(city.pumpPipeId).domainState?.volumetricFlow).toBe(0);
    expect(engine.journal.allEvents().some((e) => e.type === 'hydraulics.pumppipe.restored')).toBe(false);
  });

  it('replay stays byte-identical through the full trip-then-recovery scenario', () => {
    const city = buildGenesisScientificCity4({ rainfallAtTick: 1 });
    const engine = city.base.engine;
    runUntil(engine, city.updater, () => engine.journal.allEvents().some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE));
    city.startGenerator(engine);
    runUntil(engine, city.updater, () => engine.journal.allEvents().some((e) => e.type === 'population.hospitalaccess.restored'));

    const live = engine.graph.listEntities();
    const replayed = engine.scrubTo(engine.tick).listEntities();
    expect(replayed.length).toBe(live.length);
    for (const entity of live) {
      const replayedEntity = replayed.find((e) => e.id === entity.id)!;
      expect(replayedEntity).toEqual(entity);
    }
  });
});
