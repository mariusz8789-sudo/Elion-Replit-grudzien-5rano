import type { WorldState } from '../world/scientificWorldState';
import type { WorldCaptureTimeline } from '../world/worldCapture';
import type { TemporalUnit, ViewpointKind } from './scenarioRequest';
import type { ShotAxis } from './shotPlan';
import { collectInspectableEvents, type InspectableEvent } from './eventInspection';
import { WorldClock } from './worldClock';

/**
 * LOOKING GLASS — THE UNIVERSAL SCENARIO CONTRACT.
 *
 * One domain-independent view of "a world you can experience". An epidemic
 * across a city and a culture in a bioreactor share no physics, no units and
 * no geometry, but the experience layer needs the same six things from both:
 * how long it runs, what state it was in, what happened, what was observed,
 * what evidence backs that, and where a person could stand. Everything above
 * this line — the orchestrator, the director, the renderer — talks to THIS
 * and never to a domain.
 *
 * WHAT THIS IS NOT. It is not a simulator and it computes nothing. Every
 * method reads something an engine already produced. Adding a solver later
 * means writing an adapter to this contract, not touching the Looking Glass.
 *
 * WHY IT IS SYNCHRONOUS. The engines behind it are: `runScenario` and the
 * pre-registered hypothesis loop both return complete results. Wrapping them
 * in promises would advertise a streaming capability that does not exist and
 * would make deterministic replay harder to reason about, so the contract
 * matches the engines rather than a general shape.
 */

export interface TemporalRange {
  /** First and last tick on the world's OWN clock (day 0 … day 59). */
  readonly from: number;
  readonly to: number;
  readonly unit: TemporalUnit;
  /** How many real steps the model produced across that range. */
  readonly stepCount: number;
}

export interface WorldBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** A marker's clock. See `ShotAxis` — these are genuinely different axes. */
export interface WorldMarkerTime {
  readonly tick: number;
  readonly axis: ShotAxis;
  /**
   * Whether `tick` is on the SAME clock as the series the viewer scrubs.
   * False when a marker came from a run of a different length — the
   * pre-registered loop runs its own scenarios — in which case a renderer
   * must NOT jump its timeline there. That would be showing a day the
   * viewer's run never had.
   */
  readonly onViewerClock: boolean;
}

export interface WorldObservable {
  readonly id: string;
  readonly time: WorldMarkerTime;
  readonly statement: string;
  readonly provenance: readonly string[];
}

export interface WorldEventRef {
  readonly id: string;
  readonly type: string;
  readonly time: WorldMarkerTime;
}

export interface EvidenceRef {
  readonly id: string;
  readonly statement: string;
  readonly provenance: readonly string[];
  /** MATCH / DRIFT / BLOCKED from the existing replay protocol, or null. */
  readonly replayStatus: string | null;
}

export interface PerspectiveOption {
  readonly kind: ViewpointKind;
  readonly available: boolean;
  /** Why not, when unavailable — never left blank so a UI can explain itself. */
  readonly reason: string | null;
}

export interface ScenarioWorld {
  readonly worldId: string;
  readonly domainId: string;
  /** The engine that produced this world, for provenance. */
  readonly producedBy: string;

  getTemporalRange(): TemporalRange;
  /** The real state at a tick, or null — never an interpolated one. */
  getStateAt(tick: number): WorldState | null;
  getEvents(fromTick: number, toTick: number): readonly WorldEventRef[];
  getObservables(fromTick: number, toTick: number): readonly WorldObservable[];
  getEvidence(markerId: string): EvidenceRef | null;
  /**
   * Every real event, with the detail the capture timeline throws away —
   * location, severity, cause, causal parent, provenance and whether the
   * moment can be replayed. This is what makes an event in the world
   * interrogable rather than decorative.
   */
  getInspectableEvents(): readonly InspectableEvent[];
  inspectEvent(eventId: string): InspectableEvent | null;
  getAvailablePerspectives(): readonly PerspectiveOption[];
  /**
   * The one authority on what time this world may be shown at. Every path
   * that moves the clock — sequence, scrub, event jump, replay — resolves
   * through it, so the rule cannot drift apart across call sites again.
   */
  readonly clock: WorldClock;
  getBounds(): WorldBounds;
}

export interface ScenarioWorldInput {
  readonly worldId: string;
  readonly domainId: string;
  readonly producedBy: string;
  readonly states: readonly WorldState[];
  readonly timeline: WorldCaptureTimeline;
  /** The viewer's own clock — the series being scrubbed. */
  readonly viewerTicks: readonly number[];
  readonly unit: TemporalUnit;
  readonly perspectives: readonly PerspectiveOption[];
  readonly bounds: WorldBounds;
}

/**
 * Wraps what the adapters already produced. Deliberately a plain function
 * over data rather than a class per domain: an "EpidemicScenarioAdapter"
 * whose only job was to hold these same arrays would be a name, not an
 * abstraction. A domain earns its own builder when it genuinely answers one
 * of these questions differently.
 */
export function buildScenarioWorld(input: ScenarioWorldInput): ScenarioWorld {
  const viewerTickSet = new Set(input.viewerTicks);
  const statesByTick = new Map(input.states.map((state) => [state.tick, state]));

  // An observation is recorded against the state it belongs to; a canonical
  // event carries a timestamp in the world's own clock. Only a tick that
  // actually appears in the viewer's series may move the viewer's timeline.
  const observables: WorldObservable[] = input.timeline.observations.map((observation) => ({
    id: observation.observationId,
    time: { tick: observation.tick, axis: 'STATE_INDEX', onViewerClock: false },
    statement: observation.statement,
    provenance: [],
  }));

  const events: WorldEventRef[] = input.timeline.events.map((event) => ({
    id: event.eventId,
    type: event.type,
    time: { tick: event.tick, axis: 'WORLD_TIME', onViewerClock: viewerTickSet.has(event.tick) },
  }));

  const evidenceById = new Map<string, EvidenceRef>();
  for (const state of input.states) {
    for (const observation of state.observations) {
      evidenceById.set(observation.observationId, {
        id: observation.observationId,
        statement: observation.statement,
        provenance: observation.provenance,
        replayStatus: state.replay?.status ?? null,
      });
    }
    for (const event of state.events) {
      evidenceById.set(event.id, {
        id: event.id,
        statement: `${event.type} (${state.worldId})`,
        provenance: [event.id],
        replayStatus: state.replay?.status ?? null,
      });
    }
  }

  const inspectable = collectInspectableEvents({
    states: input.states,
    observables,
    getEvidence: (markerId) => evidenceById.get(markerId) ?? null,
    viewerTicks: input.viewerTicks,
  });
  const inspectableById = new Map(inspectable.map((event) => [event.id, event]));

  const clock = new WorldClock(input.viewerTicks);
  const first = input.viewerTicks[0] ?? 0;
  const last = input.viewerTicks[input.viewerTicks.length - 1] ?? first;

  return {
    worldId: input.worldId,
    domainId: input.domainId,
    producedBy: input.producedBy,
    getTemporalRange: () => ({ from: first, to: last, unit: input.unit, stepCount: input.viewerTicks.length }),
    getStateAt: (tick) => statesByTick.get(tick) ?? null,
    getEvents: (fromTick, toTick) => events.filter((event) => event.time.tick >= fromTick && event.time.tick <= toTick),
    getObservables: (fromTick, toTick) => observables.filter((o) => o.time.tick >= fromTick && o.time.tick <= toTick),
    getEvidence: (markerId) => evidenceById.get(markerId) ?? null,
    clock,
    getInspectableEvents: () => inspectable,
    inspectEvent: (eventId) => inspectableById.get(eventId) ?? null,
    getAvailablePerspectives: () => input.perspectives,
    getBounds: () => input.bounds,
  };
}
