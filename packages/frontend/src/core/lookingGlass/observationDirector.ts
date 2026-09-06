import type { EntityRef } from '../events/genesisEvent';
import type { GroundingLevel } from '../worldModel/ecs/types';
import type { WorldEntity, WorldState } from '../world/scientificWorldState';
import type { EventSemanticKind, InspectableEvent } from './eventInspection';
import type { ObservationIntent, ObservationMode, ObservationTimeIntent } from './observationIntent';
import type { LookingGlassSession } from './scenarioSession';
import type { ScenarioComparisonView } from './scenarioComparison';
import type { PerspectiveRequest } from './perspective';
import { PERSPECTIVES, perspectiveRequest } from './perspective';
import type { TimeResolution } from './worldClock';
import type { ViewpointKind } from './scenarioRequest';

/**
 * LOOKING GLASS — THE OBSERVATION DIRECTOR.
 *
 * Turns one `ObservationIntent` plus an already-open `LookingGlassSession`
 * into the four things a person actually asked for: the right MOMENT (via
 * the session's own `WorldClock` — never a second time authority), the
 * right ENTITY (searched in real `WorldState.entities`, never invented),
 * the right CAMERA REQUEST (the exact `PerspectiveRequest` shape
 * `perspective.ts` already sends toward the Graphics Engine — this module
 * adds no second director contract), and a real EXPLANATION when one was
 * asked for (built from `InspectableEvent`/`WorldEntity.properties`, the
 * same data `EventInspector` already renders).
 *
 * This module computes no science and owns no world state. Every number in
 * an `ObservationResult` was already sitting in the session before this
 * function ran; the only thing contributed here is choosing which of those
 * real numbers answer the question that was asked.
 */

export interface PropertyDelta {
  readonly key: string;
  readonly before: number;
  readonly after: number;
  readonly absoluteDelta: number;
  readonly unit?: string;
}

/** Diffs two real `WorldEntity` snapshots of the SAME entity at two ticks — the domain-agnostic counterpart of `worldModelMoment.ts`'s `scalarDeltasOf`, which only works for a live C3 `TemporalEngine`. This works for every domain, because `WorldEntity.properties` is the one contract all of them already project into. */
export function propertyDeltasOf(before: WorldEntity | null, now: WorldEntity): readonly PropertyDelta[] {
  if (!before) return [];
  const beforeByKey = new Map(before.properties.map((p) => [p.key, p]));
  const deltas: PropertyDelta[] = [];
  for (const property of now.properties) {
    const previous = beforeByKey.get(property.key);
    if (!previous || typeof previous.value !== 'number' || typeof property.value !== 'number') continue;
    if (previous.value === property.value) continue;
    deltas.push({
      key: property.key,
      before: previous.value,
      after: property.value,
      absoluteDelta: property.value - previous.value,
      ...(property.unit === undefined ? {} : { unit: property.unit }),
    });
  }
  return deltas;
}

export interface ObservationExplanation {
  readonly entityLabel: string;
  readonly where: string | null;
  readonly whenTick: number;
  readonly byHowMuch: readonly PropertyDelta[];
  readonly why: string | null;
  readonly cause: string | null;
  /** The next real event touching this entity after `whenTick`, or null if none is recorded yet. */
  readonly consequence: string | null;
  readonly evidenceId: string | null;
  readonly grounding: GroundingLevel;
}

export type ObservationStatus = 'RESOLVED' | 'NEEDS_CLARIFICATION' | 'NOT_MODELLED';

export interface ObservationResult {
  readonly intent: ObservationIntent;
  readonly status: ObservationStatus;
  /** Why status is not RESOLVED — empty when it is. */
  readonly reasons: readonly string[];
  readonly time: TimeResolution | null;
  readonly focusEntity: WorldEntity | null;
  /** EXACTLY the payload `perspective.ts` already sends toward the Graphics Engine camera rig — no second contract. */
  readonly cameraRequest: PerspectiveRequest | null;
  readonly mode: ObservationMode;
  readonly explanation: ObservationExplanation | null;
  readonly comparison: ScenarioComparisonView | null;
  /** Factual, grounded, never implying certainty about the real world. */
  readonly narration: string;
}

/** Exported for `observationExecution.ts`: the same mode->vantage mapping this director already
 * uses for the chat-only narration path, reused rather than re-derived for the live 3D screens'
 * CameraIntent resolution — one mode->vantage table, not two. */
export const MODE_VIEWPOINT: Readonly<Record<ObservationMode, ViewpointKind>> = {
  SCIENTIST: 'SCIENTIST_POV',
  ENGINEER: 'OPERATOR_POV',
  CITIZEN: 'ANCHORED_HUMAN',
  SYSTEM: 'WIDE',
  INCIDENT: 'RESPONDER_POV',
  CAUSE_EFFECT: 'OBSERVER',
  BEFORE_AFTER: 'OBSERVER',
};

/** Generic incident/status words mapped onto the EXISTING domain-agnostic semantic classification (`eventInspection.ts`) — never a per-domain word list. */
const EVENT_WORD_SEMANTIC: Readonly<Record<string, EventSemanticKind>> = {
  incident: 'FAILURE', failure: 'FAILURE', awaria: 'FAILURE', problem: 'FAILURE',
  alert: 'ALERT', warning: 'ALERT', alarm: 'ALERT',
  anomaly: 'ANOMALY', anomalia: 'ANOMALY', anomalię: 'ANOMALY',
  threshold: 'THRESHOLD_CROSSING', 'próg': 'THRESHOLD_CROSSING', prog: 'THRESHOLD_CROSSING',
  intervention: 'INTERVENTION', interwencj: 'INTERVENTION', interwencja: 'INTERVENTION',
  observation: 'OBSERVATION', obserwacj: 'OBSERVATION', obserwacja: 'OBSERVATION',
  transition: 'TRANSITION', 'przejści': 'TRANSITION', przejscie: 'TRANSITION',
  // Deliberately NOT "step" or "recompute": neither corresponds to a real
  // STATE_CHANGE-matching suffix in classifyEvent's own rule
  // (eventInspection.ts) — chemistry's and hydraulics' own "...step" events
  // are UNCLASSIFIED, not STATE_CHANGE, and this map must never claim
  // otherwise. "change" IS a real matching suffix, so it stays.
  change: 'STATE_CHANGE', zmiana: 'STATE_CHANGE',
};

function entityRefKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** Finds a real entity in a real state by substring match on its label or reference — never a fuzzy science match, only a name lookup. */
export function findEntity(state: WorldState | null, query: string): WorldEntity | null {
  if (!state) return null;
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return null;
  return state.entities.find((entity) =>
    entity.label.toLowerCase().includes(needle)
    || String(entity.ref.id).toLowerCase().includes(needle)
    || entity.ref.kind.toLowerCase().includes(needle)) ?? null;
}

export interface EventMatch {
  readonly event: InspectableEvent | null;
  readonly reason: string;
}

/**
 * Finds a real event matching a name the user gave it. Tries a literal
 * match against the event's own type/cause first (works for a domain whose
 * vocabulary genuinely contains the word), then falls back to the
 * domain-agnostic semantic-kind mapping above — so "the incident" honestly
 * resolves to "no FAILURE-classified event occurred in this run" for a
 * domain that has none, rather than a coincidental wrong match.
 */
export function findEvent(events: readonly InspectableEvent[], query: string): EventMatch {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return { event: null, reason: 'no event name was given' };

  const literal = events.find((event) =>
    event.type.toLowerCase().includes(needle)
    || (event.cause?.toLowerCase().includes(needle) ?? false));
  if (literal) return { event: literal, reason: `matched "${query}" against this run's own event type/cause` };

  const word = Object.keys(EVENT_WORD_SEMANTIC).find((candidate) => needle.includes(candidate));
  if (word) {
    const kind = EVENT_WORD_SEMANTIC[word]!;
    const match = events.find((event) => event.semanticKind === kind);
    if (match) return { event: match, reason: `"${word}" read as a ${kind} event` };
    return { event: null, reason: `no ${kind}-classified event is recorded in this run` };
  }

  return { event: null, reason: `no event matching "${query}" was found in this run` };
}

/** Real, honest grounding for one entity: reads the property C3 domains already disclose, falls back to the honest default every simulation-model domain in Genesis carries today. */
function groundingOf(entity: WorldEntity): GroundingLevel {
  const declared = entity.properties.find((p) => p.key === 'grounding')?.value;
  if (declared === 'GROUNDED_EXACT' || declared === 'MODEL_ESTIMATE' || declared === 'PROCEDURAL_APPROXIMATION' || declared === 'UNGROUNDED_APPROXIMATION') {
    return declared;
  }
  return 'MODEL_ESTIMATE';
}

function resolveTimeIntent(
  session: LookingGlassSession,
  time: ObservationTimeIntent | null,
  currentTick: number,
  events: readonly InspectableEvent[],
): TimeResolution {
  const clock = session.world!.clock;
  const range = session.world!.getTemporalRange();

  if (!time || time.kind === 'NOW') {
    return clock.resolve({ source: 'SCRUB', tick: currentTick, current: currentTick });
  }

  if (time.kind === 'BEFORE_EVENT' || time.kind === 'AFTER_EVENT') {
    const match = findEvent(events, time.eventRef);
    if (!match.event) {
      return { granted: false, worldTime: currentTick, source: 'EVENT_JUMP', snapped: false, reason: match.reason };
    }
    const target = time.kind === 'BEFORE_EVENT' ? match.event.time.tick - 1 : match.event.time.tick + 1;
    return clock.resolve({ source: 'EVENT_JUMP', tick: target, current: currentTick });
  }

  if (time.kind === 'ABSOLUTE') {
    if (time.unit !== range.unit) {
      return { granted: false, worldTime: currentTick, source: 'SCRUB', snapped: false, reason: `cannot convert ${time.unit.toLowerCase()}s to this world's own ${range.unit.toLowerCase()} ticks` };
    }
    return clock.resolve({ source: 'SCRUB', tick: time.amount, current: currentTick });
  }

  // RELATIVE: `unit: null` means "one step in whatever this world's own unit
  // is" — honoured literally as 1 tick; a stated unit must match the
  // world's own, for the same reason ABSOLUTE refuses to guess a conversion.
  if (time.unit !== null && time.unit !== range.unit) {
    return { granted: false, worldTime: currentTick, source: 'SCRUB', snapped: false, reason: `cannot convert ${time.unit.toLowerCase()}s to this world's own ${range.unit.toLowerCase()} ticks` };
  }
  const delta = time.direction === 'FORWARD' ? time.amount : -time.amount;
  return clock.resolve({ source: 'SCRUB', tick: currentTick + delta, current: currentTick });
}

/** Builds the WHAT/WHERE/WHEN/BY-HOW-MUCH/WHY/CAUSE/CONSEQUENCE/EVIDENCE/GROUNDING explanation for one real entity at one real tick. Works for every domain — it reads only `WorldState`/`InspectableEvent`, never a live engine. */
export function explainEntity(
  session: LookingGlassSession,
  entity: WorldEntity,
  atTick: number,
): ObservationExplanation {
  const world = session.world!;
  const nearestBefore = world.clock.allTicks.filter((tick) => tick < atTick).at(-1) ?? null;
  const beforeState = nearestBefore !== null ? world.getStateAt(nearestBefore) : null;
  const beforeEntity = beforeState ? findEntity(beforeState, String(entity.ref.id)) ?? findEntity(beforeState, entity.label) : null;
  const byHowMuch = propertyDeltasOf(beforeEntity, entity);

  const events = world.getInspectableEvents();
  const key = entityRefKey(entity.ref);
  const touching = (event: InspectableEvent) => event.affectedEntities.some((affected) => entityRefKey(affected.ref) === key);
  const causeEvent = [...events].reverse().find((event) => event.time.tick <= atTick && touching(event)) ?? null;
  const consequenceEvent = events.find((event) => event.time.tick > atTick && touching(event)) ?? null;

  return {
    entityLabel: entity.label,
    where: entity.properties.find((p) => p.key.includes('position') || p.key === 'location')?.value.toString() ?? null,
    whenTick: atTick,
    byHowMuch,
    why: causeEvent ? `${causeEvent.type} (${causeEvent.semanticKind.toLowerCase().replace(/_/g, ' ')})` : null,
    cause: causeEvent?.cause ?? null,
    consequence: consequenceEvent ? `${consequenceEvent.type} at tick ${consequenceEvent.time.tick}` : null,
    evidenceId: causeEvent?.evidence?.id ?? null,
    grounding: groundingOf(entity),
  };
}

function narrate(
  mode: ObservationMode,
  entity: WorldEntity | null,
  explanation: ObservationExplanation | null,
  timeReason: string,
): string {
  const parts: string[] = [];
  if (entity) {
    parts.push(`Observing ${entity.label}.`);
  }
  parts.push(timeReason);
  if (explanation) {
    if (explanation.byHowMuch.length > 0) {
      const changes = explanation.byHowMuch
        .map((d) => `${d.key} ${d.before.toFixed(2)} -> ${d.after.toFixed(2)}${d.unit ? ` ${d.unit}` : ''}`)
        .join(', ');
      parts.push(`Under this model, ${changes}.`);
    } else {
      parts.push('Under this model, nothing measurable changed at this moment.');
    }
    parts.push(explanation.cause
      ? `Recorded cause: ${explanation.cause}.`
      : 'No recorded cause is attached to this moment.');
    parts.push(explanation.consequence
      ? `Next recorded effect: ${explanation.consequence}.`
      : 'No later effect on this entity is recorded yet.');
    parts.push(`Grounding: ${explanation.grounding} — this is a model output, not an observation of the real world.`);
  }
  if (mode) parts.push(`Mode: ${mode}.`);
  return parts.join(' ');
}

/**
 * Resolves one `ObservationIntent` against an already-open session. Pure:
 * calling it twice with the same intent and the same session state produces
 * the same result. `currentTick` is the tick the viewer is presently at —
 * required for RELATIVE time and for choosing "the" entity when the intent
 * names none.
 */
export function resolveObservation(
  intent: ObservationIntent,
  session: LookingGlassSession,
  currentTick: number,
): ObservationResult {
  const mode: ObservationMode = intent.mode ?? 'SCIENTIST';
  const world = session.world;

  if (!world) {
    return {
      intent, mode, status: 'NOT_MODELLED',
      reasons: ['this session never resolved to a real world — there is nothing to observe'],
      time: null, focusEntity: null, cameraRequest: null, explanation: null, comparison: null,
      narration: 'This request never produced a real world, so there is nothing to observe.',
    };
  }

  const events = world.getInspectableEvents();
  const resolution = resolveTimeIntent(session, intent.time, currentTick, events);
  const reasons: string[] = [];
  if (!resolution.granted) reasons.push(resolution.reason);

  const stateAtTime = world.getStateAt(resolution.worldTime) ?? world.getStateAt(world.clock.nearest(resolution.worldTime) ?? resolution.worldTime);
  const targetQuery = intent.target ?? intent.focus;
  const focusEntity = targetQuery ? findEntity(stateAtTime, targetQuery) : (stateAtTime?.entities[0] ?? null);
  if (targetQuery && !focusEntity) reasons.push(`no entity matching "${targetQuery}" was found in this run`);

  const bounds = world.getBounds();
  const viewpoint = intent.perspective ?? MODE_VIEWPOINT[mode];
  const centre: readonly [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1] + (PERSPECTIVES[viewpoint].eyeHeight ?? (bounds.max[1] - bounds.min[1]) * 0.4),
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const scaleViewpoint: ViewpointKind = intent.scale === 'WIDE' ? 'WIDE' : intent.scale === 'MACRO' ? 'MACRO' : viewpoint;
  const cameraRequest = perspectiveRequest(scaleViewpoint, centre, bounds);

  const wantsExplanation = intent.askingWhy || mode === 'CAUSE_EFFECT' || mode === 'BEFORE_AFTER' || mode === 'INCIDENT';
  const explanation = wantsExplanation && focusEntity ? explainEntity(session, focusEntity, resolution.worldTime) : null;
  if (wantsExplanation && !focusEntity) reasons.push('an explanation was requested but no entity was resolved to explain');

  const comparison = intent.comparison || intent.returningToBaseline
    ? (intent.returningToBaseline ? null : session.requestComparison())
    : null;
  if (intent.comparison && !intent.returningToBaseline && !comparison) {
    reasons.push('this domain has no comparison available for this run');
  }

  const status: ObservationStatus = reasons.length === 0 ? 'RESOLVED'
    : focusEntity || !targetQuery ? 'NEEDS_CLARIFICATION'
      : 'NOT_MODELLED';

  return {
    intent, mode, status, reasons,
    time: resolution,
    focusEntity,
    cameraRequest,
    explanation,
    comparison,
    narration: narrate(mode, focusEntity, explanation, resolution.reason),
  };
}

/**
 * THE SEMANTIC TIMELINE — real events, in their real order, each carrying
 * the state change it produced, its next real effect and the other events
 * that share its causal parent. No chronology is invented: every field here
 * is read off `getInspectableEvents()`, the same source the event rail and
 * `EventInspector` already render, plus one diff (`propertyDeltasOf`)
 * against the nearest earlier real state.
 */
export interface SemanticTimelineEntry {
  readonly event: InspectableEvent;
  readonly stateChange: readonly PropertyDelta[];
  /** The next real event touching the same entity, or null if none is recorded yet. */
  readonly consequenceEventId: string | null;
  /** Other events recorded with the SAME parentEventId — siblings in one real causal chain, never inferred. */
  readonly relatedEventIds: readonly string[];
}

export function buildSemanticTimeline(session: LookingGlassSession): readonly SemanticTimelineEntry[] {
  const world = session.world;
  if (!world) return [];
  const events = world.getInspectableEvents();

  return events.map((event, index) => {
    const entity = event.affectedEntities[0] ?? null;
    let stateChange: readonly PropertyDelta[] = [];
    if (entity) {
      const nearestBefore = world.clock.allTicks.filter((tick) => tick < event.time.tick).at(-1) ?? null;
      const beforeState = nearestBefore !== null ? world.getStateAt(nearestBefore) : null;
      const beforeEntity = beforeState
        ? findEntity(beforeState, String(entity.ref.id)) ?? findEntity(beforeState, entity.label)
        : null;
      stateChange = propertyDeltasOf(beforeEntity, entity);
    }

    const entityKey = entity ? entityRefKey(entity.ref) : null;
    const consequence = entityKey
      ? events.slice(index + 1).find((later) => later.affectedEntities.some((affected) => entityRefKey(affected.ref) === entityKey))
      : undefined;

    const relatedEventIds = event.parentEventId
      ? events.filter((other) => other.id !== event.id && other.parentEventId === event.parentEventId).map((other) => other.id)
      : [];

    return {
      event,
      stateChange,
      consequenceEventId: consequence?.id ?? null,
      relatedEventIds,
    };
  });
}
