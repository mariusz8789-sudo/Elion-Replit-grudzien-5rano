import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { entityId, type EntityId, type WorldModelEntity, type WorldModelEntityPatch } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { TemporalUpdateResult, TemporalUpdater } from '../temporal/temporalEngine';

/**
 * WORLD GENERATION 1.0 — CASCADE / DEPENDENCY FOUNDATION.
 *
 * A `CascadeRule` reacts to ONE event another part of the tick already
 * produced (a real solver step, or another cascade rule) and — by walking
 * the SAME `WorldGraph.relationshipsFor` edges the schema already has —
 * patches related entities and/or emits its own derived events. This is
 * the generic mechanism the mission asks for ("PUMP FAILURE -> WATER FLOW
 * CHANGE -> ... -> HOSPITAL ACCESS CHANGE"); it does not itself encode any
 * domain-specific chain. `withCascades` composes into the existing
 * `TemporalUpdater` contract — no new orchestration engine, no second
 * event bus.
 *
 * A cascade rule NEVER computes physics — it only propagates a
 * consequence that a real solver (or a prior cascade step) already
 * established, honestly, through a declared relationship.
 */
export interface CascadeContext {
  readonly tick: number;
  readonly graph: WorldGraph;
}

export interface CascadeEffect {
  readonly patches: readonly { id: EntityId; patch: WorldModelEntityPatch }[];
  readonly events: readonly GenesisEvent[];
}

export type CascadeRule = (triggerEvent: GenesisEvent, ctx: CascadeContext) => CascadeEffect;

const NO_EFFECT: CascadeEffect = { patches: [], events: [] };

/** Applies every rule to every trigger event, patching `graph` in place, and returns the derived events (never mutates or re-emits `triggerEvents` themselves). */
export function applyCascades(rules: readonly CascadeRule[], triggerEvents: readonly GenesisEvent[], graph: WorldGraph, tick: number): GenesisEvent[] {
  if (rules.length === 0 || triggerEvents.length === 0) return [];
  const ctx: CascadeContext = { tick, graph };
  const cascadeEvents: GenesisEvent[] = [];
  for (const event of triggerEvents) {
    for (const rule of rules) {
      const effect = rule(event, ctx);
      for (const { id, patch } of effect.patches) {
        if (graph.has(id)) graph.updateEntity(id, patch, tick);
      }
      cascadeEvents.push(...effect.events);
    }
  }
  return cascadeEvents;
}

/**
 * Wraps an existing `TemporalUpdater` so any events it (or a composed
 * `withEventRules`) already produced this tick are ALSO run through
 * `rules`; derived cascade events are appended. Only one pass — a cascade
 * rule's own derived events are NOT themselves re-fed through the rules
 * this same tick (a multi-hop chain becomes visible one real tick per hop,
 * exactly like a real physical cascade takes time to propagate — this is
 * an honest property, not a limitation to work around).
 */
export function withCascades(updater: TemporalUpdater, rules: readonly CascadeRule[]): TemporalUpdater {
  return (graph, dt, tick): TemporalUpdateResult | void => {
    const result = updater(graph, dt, tick) ?? undefined;
    const triggerEvents = result?.events ?? [];
    const cascadeEvents = applyCascades(rules, triggerEvents, graph, tick);
    if (cascadeEvents.length === 0) return result;
    return { observations: result?.observations, events: [...triggerEvents, ...cascadeEvents] };
  };
}

/**
 * Generic, reusable cascade rule factory: when a `triggerEventType` event's
 * source entity has a `relationshipKind` edge in `direction`, calls
 * `deriveEffect` with the related entity — the factory itself never
 * assumes what the effect means (a status flag, a domainState change, ...).
 * Returning `undefined` from `deriveEffect` means "no effect for this
 * related entity," e.g. because its current state already reflects the
 * cascade or the relationship doesn't apply here.
 */
export function relationshipCascadeRule(options: {
  triggerEventType: string;
  relationshipKind: string;
  /** `'from'`: propagate FROM the trigger entity to whatever it points at. `'to'`: propagate to whatever points AT the trigger entity. */
  direction: 'from' | 'to';
  deriveEffect: (relatedEntity: WorldModelEntity, triggerEvent: GenesisEvent) => { patch: WorldModelEntityPatch; eventType: string; cause: string } | undefined;
}): CascadeRule {
  return (triggerEvent, ctx) => {
    if (triggerEvent.type !== options.triggerEventType || !triggerEvent.source) return NO_EFFECT;
    const sourceId = entityId(triggerEvent.source);
    if (!ctx.graph.has(sourceId)) return NO_EFFECT;

    const patches: { id: EntityId; patch: WorldModelEntityPatch }[] = [];
    const events: GenesisEvent[] = [];
    for (const relationship of ctx.graph.relationshipsFor(sourceId, options.relationshipKind)) {
      if (options.direction === 'from' && relationship.from !== sourceId) continue;
      if (options.direction === 'to' && relationship.to !== sourceId) continue;
      const relatedId = options.direction === 'from' ? relationship.to : relationship.from;
      if (!ctx.graph.has(relatedId)) continue;

      const related = ctx.graph.getEntity(relatedId);
      const effect = options.deriveEffect(related, triggerEvent);
      if (!effect) continue;

      patches.push({ id: relatedId, patch: effect.patch });
      events.push({
        contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
        id: `cascade:${relatedId}:${ctx.tick}:${effect.eventType}`,
        type: effect.eventType,
        timestamp: ctx.tick,
        source: related.ref,
        affectedEntities: [related.ref],
        cause: effect.cause,
        parameters: { triggerEventId: triggerEvent.id, triggerEntity: sourceId },
        provenance: {
          origin: 'consequence-rule',
          ruleId: `${options.triggerEventType}->${options.relationshipKind}`,
          notes: `Propagated via relationship "${options.relationshipKind}" from "${triggerEvent.type}" at ${sourceId}.`,
        },
      });
    }
    return { patches, events };
  };
}
