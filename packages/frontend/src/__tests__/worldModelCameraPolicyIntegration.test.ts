import { describe, expect, it } from 'vitest';
import { cameraDecisionFor, cameraModeForEventType } from '../core/world/cameraPolicy';
import { buildGenesisScientificCity3, PUMP_TRIPPED_EVENT_TYPE, HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE, POPULATION_ACCESS_IMPAIRED_EVENT_TYPE, RAINFALL_EVENT_TYPE } from '../core/worldModel/domains/genesisScientificCity3';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * C1 CAPABILITY WIRING (Genesis Scientific World Model 3.0, section 16) —
 * proves a REAL C3 `GenesisEvent`, produced by the actual rainfall/flood
 * cross-domain scenario (not a synthetic fixture), routes through C1's
 * EXISTING, UNMODIFIED `cameraDecisionFor`/`cameraModeForEventType`
 * (core/world/cameraPolicy.ts) into a valid, non-null camera decision — the
 * "Pokaż wydarzenie awarii." (show me the failure event) capability, without
 * building a second camera-intent system.
 */
describe('C1 camera policy responds to real C3 world-model events', () => {
  it('every canonical C3 event type this scenario can emit has a camera-policy opinion', () => {
    for (const type of [RAINFALL_EVENT_TYPE, PUMP_TRIPPED_EVENT_TYPE, HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE, POPULATION_ACCESS_IMPAIRED_EVENT_TYPE]) {
      expect(cameraModeForEventType(type)).not.toBeNull();
    }
  });

  it('a real pump-trip event from the running scenario yields a SCIENTIFIC camera decision', () => {
    const city = buildGenesisScientificCity3({ rainfallAtTick: 1 });
    const engine = new TemporalEngine(city.graph);
    for (let i = 0; i < 5; i++) engine.advance(1, city.updater);

    const tripEvent = engine.journal.allEvents().find((e) => e.type === PUMP_TRIPPED_EVENT_TYPE);
    expect(tripEvent).toBeDefined(); // the scenario must actually have tripped the pump for this proof to mean anything

    const decision = cameraDecisionFor(tripEvent!);
    expect(decision).not.toBeNull();
    expect(decision!.mode).toBe('SCIENTIFIC');
    expect(decision!.eventId).toBe(tripEvent!.id);
    expect(decision!.timestamp).toBe(tripEvent!.timestamp);
  });

  it('the full real cascade chain (rainfall -> trip -> hospital service -> population access) each produce a distinct, valid camera decision', () => {
    const city = buildGenesisScientificCity3({ rainfallAtTick: 1 });
    const engine = new TemporalEngine(city.graph);
    for (let i = 0; i < 5; i++) engine.advance(1, city.updater);

    const chainTypes = [RAINFALL_EVENT_TYPE, PUMP_TRIPPED_EVENT_TYPE, HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE, POPULATION_ACCESS_IMPAIRED_EVENT_TYPE];
    const allEvents = engine.journal.allEvents();
    for (const type of chainTypes) {
      const event = allEvents.find((e) => e.type === type);
      expect(event, `scenario should have emitted a real ${type} event`).toBeDefined();
      const decision = cameraDecisionFor(event!);
      expect(decision, `${type} should have a camera-policy opinion`).not.toBeNull();
    }
  });

  it('an event type C3 emits but this policy has no opinion on (the base per-tick solver step) is honestly null, not guessed', () => {
    const city = buildGenesisScientificCity3();
    const engine = new TemporalEngine(city.graph);
    engine.advance(1, city.updater);
    const stepEvent = engine.journal.allEvents().find((e) => e.type === 'hydraulics.pumppipe.step');
    expect(stepEvent).toBeDefined();
    expect(cameraDecisionFor(stepEvent!)).toBeNull();
  });
});
