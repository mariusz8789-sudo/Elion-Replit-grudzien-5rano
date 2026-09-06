import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { executeIntervention } from '../bridge/worldFrameState';
import type { EntityId, WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { TemporalEngine, TemporalUpdateResult, TemporalUpdater } from '../temporal/temporalEngine';

/**
 * WORLD GENERATION 1.0 — GENERIC WORLD EVENTS.
 *
 * A `WorldEventRule` inspects one entity's real before/after state for one
 * tick and, only when a genuine transition happened, returns a
 * `GenesisEvent` — the SAME event contract every domain solver already
 * emits (core/events/genesisEvent.ts), never a second event type. This is
 * deliberately NOT a new orchestration engine: `withEventRules` is a plain
 * `TemporalUpdater` decorator, composed the same way any updater is passed
 * to `TemporalEngine.advance` today.
 *
 * Every event a rule produces is traceable to exactly what the mission
 * requires: TIME (`ctx.tick`), CAUSE (`cause`), STATE CHANGE (`before`/
 * `after` the rule itself compared), and PROVENANCE (`origin:
 * 'consequence-rule'`, `ruleId`) — never fabricated for display.
 */
export interface WorldEventRuleContext {
  readonly tick: number;
  /** The post-tick graph — read-only context for a rule that needs to look at OTHER entities, not just the one entity being diffed. */
  readonly graph: WorldGraph;
}

export type WorldEventRule = (before: WorldModelEntity, after: WorldModelEntity, ctx: WorldEventRuleContext) => GenesisEvent | undefined;

/**
 * Runs every rule against every entity that existed both before and after
 * this tick (a newly created entity has no "before" to diff against — not
 * this mechanism's concern, exactly like `diffGraphs` in temporalEngine.ts
 * only diffs entities present in both graphs).
 */
export function runWorldEventRules(rules: readonly WorldEventRule[], before: WorldGraph, after: WorldGraph, tick: number): GenesisEvent[] {
  if (rules.length === 0) return [];
  const events: GenesisEvent[] = [];
  const ctx: WorldEventRuleContext = { tick, graph: after };
  for (const entity of after.listEntities()) {
    const previous = before.tryGetEntity(entity.id);
    if (!previous) continue;
    for (const rule of rules) {
      const event = rule(previous, entity, ctx);
      if (event) events.push(event);
    }
  }
  return events;
}

/**
 * Wraps an existing `TemporalUpdater` (e.g. `SolverRouter.routeTick`, or a
 * composite like `makeGenesisCityUpdater`) so every tick is ALSO checked
 * against `rules`, with any derived events appended to what the inner
 * updater already returned. Snapshots the graph before the inner updater
 * runs (a cheap, already-existing `WorldGraph.clone()`) so rules see the
 * real pre-tick state, not a partially-mutated one.
 */
export function withEventRules(updater: TemporalUpdater, rules: readonly WorldEventRule[]): TemporalUpdater {
  return (graph, dt, tick): TemporalUpdateResult | void => {
    const before = graph.clone();
    const result = updater(graph, dt, tick) ?? undefined;
    const ruleEvents = runWorldEventRules(rules, before, graph, tick);
    if (ruleEvents.length === 0) return result;
    return { observations: result?.observations, events: [...(result?.events ?? []), ...ruleEvents] };
  };
}

/**
 * Generic, reusable rule factory: emits `eventType` the first tick a
 * numeric value crossed `threshold` in the declared `direction`. `read`
 * decides WHAT value matters (a `domainState` key, a physics field, a
 * chemical fraction, ...) — this factory never assumes a domain.
 */
export function thresholdCrossingRule(options: {
  eventType: string;
  read: (entity: WorldModelEntity) => number | undefined;
  threshold: number;
  direction: 'rising' | 'falling';
  cause?: string;
}): WorldEventRule {
  return (before, after, ctx) => {
    const previousValue = options.read(before);
    const newValue = options.read(after);
    if (previousValue === undefined || newValue === undefined) return undefined;
    const crossed =
      options.direction === 'rising'
        ? previousValue < options.threshold && newValue >= options.threshold
        : previousValue > options.threshold && newValue <= options.threshold;
    if (!crossed) return undefined;
    return {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `world-event:${after.id}:${ctx.tick}:${options.eventType}`,
      type: options.eventType,
      timestamp: ctx.tick,
      source: after.ref,
      affectedEntities: [after.ref],
      cause: options.cause ?? `${options.direction}-threshold-crossing`,
      parameters: { previousValue, newValue, threshold: options.threshold },
      provenance: {
        origin: 'consequence-rule',
        ruleId: options.eventType,
        notes: `Derived from a real ${before.id} state transition (${previousValue} -> ${newValue}), not fabricated for display.`,
      },
    };
  };
}

/**
 * WORLD EVENTS 2.0 — STATE-TRANSITION EVENT: generalizes
 * `thresholdCrossingRule` to any real before/after value change, not just a
 * numeric threshold (e.g. a qualitative `statusLabel` moving from
 * `'operational'` to `'failed'`, or a `domainState` flag flipping). Kept as
 * a SEPARATE, additional primitive rather than a refactor of
 * `thresholdCrossingRule` — that existing, tested function is left exactly
 * as it is.
 */
export function stateTransitionRule<T>(options: {
  eventType: string;
  read: (entity: WorldModelEntity) => T | undefined;
  isTransition: (previous: T, next: T) => boolean;
  cause?: string;
}): WorldEventRule {
  return (before, after, ctx) => {
    const previousValue = options.read(before);
    const newValue = options.read(after);
    if (previousValue === undefined || newValue === undefined) return undefined;
    if (!options.isTransition(previousValue, newValue)) return undefined;
    return {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `world-event:${after.id}:${ctx.tick}:${options.eventType}`,
      type: options.eventType,
      timestamp: ctx.tick,
      source: after.ref,
      affectedEntities: [after.ref],
      cause: options.cause ?? 'state-transition',
      parameters: { previousValue, newValue },
      provenance: {
        origin: 'consequence-rule',
        ruleId: options.eventType,
        notes: `Derived from a real ${before.id} state transition, not fabricated for display.`,
      },
    };
  };
}

/**
 * WORLD EVENTS 2.0 — SCHEDULED EVENT: fires `build` exactly once, at
 * `atTick`, regardless of any entity's own state (a calendar/plan trigger,
 * e.g. "extreme rainfall begins at tick 5" — the rainfall's actual
 * hydrological consequence is still whatever a real solver/cascade derives
 * afterward, this only marks WHEN the scripted condition itself starts).
 * Composes into the same `TemporalUpdater` contract as `withEventRules` —
 * a second, parallel decorator, not a second loop.
 */
export interface ScheduledEvent {
  atTick: number;
  build: (ctx: WorldEventRuleContext) => GenesisEvent;
}

export function withScheduledEvents(updater: TemporalUpdater, schedule: readonly ScheduledEvent[]): TemporalUpdater {
  return (graph, dt, tick): TemporalUpdateResult | void => {
    const result = updater(graph, dt, tick) ?? undefined;
    const due = schedule.filter((entry) => entry.atTick === tick).map((entry) => entry.build({ tick, graph }));
    if (due.length === 0) return result;
    return { observations: result?.observations, events: [...(result?.events ?? []), ...due] };
  };
}

/**
 * WORLD EVENTS 2.0 — INTERVENTION EVENT: wraps the existing
 * `executeIntervention` (bridge/worldFrameState.ts) so an explicit user/
 * experimenter change is ALSO recorded as real, traceable evidence in the
 * branch's own journal — never a second intervention mechanism, just
 * making the ALREADY-REAL state change visible as an event too (previously
 * `executeIntervention` changed state silently as far as the journal was
 * concerned).
 */
export function applyInterventionWithEvent(
  engine: TemporalEngine,
  targetId: EntityId,
  parameters: Readonly<Record<string, string | number | boolean>>,
  options: { eventType?: string; cause?: string } = {},
): WorldModelEntity {
  const updated = executeIntervention(engine, targetId, parameters);
  const event: GenesisEvent = {
    contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
    id: `intervention:${targetId}:${engine.tick}:${Object.keys(parameters).sort().join(',')}`,
    type: options.eventType ?? 'world.intervention.applied',
    timestamp: engine.tick,
    source: updated.ref,
    affectedEntities: [updated.ref],
    cause: options.cause ?? 'user-intervention',
    parameters: { ...parameters },
    provenance: { origin: 'experiment-action', notes: 'Explicit user/experimenter intervention, not derived from a solver.' },
  };
  engine.journal.recordEvent(event);
  return updated;
}
