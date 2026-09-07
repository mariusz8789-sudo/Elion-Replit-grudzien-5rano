import { describe, expect, it } from 'vitest';
import { entityId, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { applyInterventionWithEvent, stateTransitionRule, withEventRules } from '../core/worldModel/events/worldEventRules';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

function entity(overrides: Partial<WorldModelEntity> & { ref: WorldModelEntity['ref'] }): WorldModelEntity {
  return {
    id: entityId(overrides.ref),
    label: overrides.ref.kind,
    scale: { level: 'MACRO_CITY' },
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
    ...overrides,
  };
}

/**
 * WORLD EVENTS 2.0 (Genesis Scientific World Model 3.0, section 9) —
 * `stateTransitionRule` and `applyInterventionWithEvent` had no dedicated
 * tests of their own (only exercised indirectly, if at all, through
 * scenario-specific code) — this closes that gap directly, on minimal
 * synthetic fixtures rather than a whole reference world.
 */
describe('stateTransitionRule: generic before/after transition detection', () => {
  const statusRule = stateTransitionRule<string>({
    eventType: 'pump.status.changed',
    read: (e) => e.statusLabel,
    isTransition: (before, after) => before !== after,
  });

  // `withEventRules` diffs the state as of the START of an `advance()` call against its END — so a
  // real transition must happen INSIDE the updater it wraps (exactly how every real solver/cascade
  // in this codebase produces one), never via a mutation applied before `advance()` is even called.
  function updaterThatSets(id: string, statusLabel: string | undefined) {
    return (graph: WorldGraph) => {
      if (statusLabel !== undefined) graph.updateEntity(id, { statusLabel });
    };
  }

  it('emits an event only on the tick the read value actually changes, with the real before/after values', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'pump', id: 'p1' }, statusLabel: 'operational' }));
    const engine = new TemporalEngine(graph);

    engine.advance(1, withEventRules(() => undefined, [statusRule])); // tick 1: nothing touches statusLabel
    expect(engine.journal.allEvents().some((e) => e.type === 'pump.status.changed')).toBe(false);

    engine.advance(1, withEventRules(updaterThatSets('pump:p1', 'failed'), [statusRule])); // tick 2: a real transition
    const event = engine.journal.allEvents().find((e) => e.type === 'pump.status.changed');
    expect(event).toBeDefined();
    expect(event!.parameters).toEqual({ previousValue: 'operational', newValue: 'failed' });
    expect(event!.timestamp).toBe(2);

    engine.advance(1, withEventRules(updaterThatSets('pump:p1', 'failed'), [statusRule])); // tick 3: already failed, no NEW transition
    expect(engine.journal.allEvents().filter((e) => e.type === 'pump.status.changed')).toHaveLength(1);
  });

  it('never fires when the transition predicate says no real transition happened, even if the raw value differs', () => {
    const caseInsensitive = stateTransitionRule<string>({
      eventType: 'x.changed',
      read: (e) => e.statusLabel,
      isTransition: (before, after) => before.toLowerCase() !== after.toLowerCase(),
    });
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'x', id: 'x1' }, statusLabel: 'OK' }));
    const engine = new TemporalEngine(graph);
    engine.advance(1, withEventRules(updaterThatSets('x:x1', 'ok'), [caseInsensitive])); // same value, different case
    expect(engine.journal.allEvents().some((e) => e.type === 'x.changed')).toBe(false);
  });

  it('is silent for an entity where `read` returns undefined on either side', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'pump', id: 'p2' } })); // no statusLabel at all, before or after
    const engine = new TemporalEngine(graph);
    expect(() => engine.advance(1, withEventRules(() => undefined, [statusRule]))).not.toThrow();
    expect(engine.journal.allEvents().some((e) => e.type === 'pump.status.changed')).toBe(false);
  });
});

describe('applyInterventionWithEvent: makes an explicit intervention real, traceable evidence', () => {
  it('patches the entity exactly like executeIntervention, and records a real, well-formed event in the journal', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'valve', id: 'v1' }, physics: { massKg: 1, pressurePa: 100 } }));
    const engine = new TemporalEngine(graph);

    const updated = applyInterventionWithEvent(engine, 'valve:v1', { 'physics.pressurePa': 250 }, { cause: 'operator-shutoff' });
    expect(updated.physics?.pressurePa).toBe(250);
    expect(engine.graph.getEntity('valve:v1').physics?.pressurePa).toBe(250); // the SAME real state change, not a parallel copy

    const events = engine.journal.allEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.type).toBe('world.intervention.applied');
    expect(event.cause).toBe('operator-shutoff');
    expect(event.parameters).toEqual({ 'physics.pressurePa': 250 });
    expect(event.provenance?.origin).toBe('experiment-action');
    expect(event.timestamp).toBe(engine.tick);
  });

  it('supports a custom eventType, and defaults cause to "user-intervention"', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'reactor', id: 'r1' }, domainState: { temperatureSetpoint: 300 } }));
    const engine = new TemporalEngine(graph);
    applyInterventionWithEvent(engine, 'reactor:r1', { 'domainState.temperatureSetpoint': 400 }, { eventType: 'reactor.setpoint.changed' });
    const event = engine.journal.allEvents()[0];
    expect(event.type).toBe('reactor.setpoint.changed');
    expect(event.cause).toBe('user-intervention');
  });

  it('is real, replayable evidence: scrubTo(head) matches the live graph immediately, and stays consistent through a later, unrelated tick', () => {
    const graph = new WorldGraph();
    graph.addEntity(entity({ ref: { kind: 'valve', id: 'v2' }, physics: { massKg: 1, pressurePa: 100 } }));
    const engine = new TemporalEngine(graph);
    engine.advance(1, () => undefined); // tick 1: nothing happens

    const beforeIntervention = engine.scrubTo(1);
    expect(beforeIntervention.getEntity('valve:v2').physics?.pressurePa).toBe(100);

    applyInterventionWithEvent(engine, 'valve:v2', { 'physics.pressurePa': 999 });
    expect(engine.graph.getEntity('valve:v2').physics?.pressurePa).toBe(999);
    // A direct `graph.updateEntity` call would be invisible to `scrubTo` here (and would STAY
    // invisible forever, since a later tick that doesn't touch this entity produces no catch-up
    // delta either) — `applyInterventionWithEvent`/`executeIntervention` go through
    // `TemporalEngine.applyExternalPatch` specifically so this never happens.
    expect(engine.scrubTo(engine.tick).getEntity('valve:v2').physics?.pressurePa).toBe(999);

    engine.advance(1, () => undefined); // a later, unrelated tick
    expect(engine.scrubTo(engine.tick).getEntity('valve:v2').physics?.pressurePa).toBe(999);
  });
});
