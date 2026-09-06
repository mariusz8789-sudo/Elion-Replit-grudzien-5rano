import type { InspectableEvent } from './eventInspection';
import type { WorldClock } from './worldClock';

/**
 * LOOKING GLASS — WHAT THE USER IS DOING RIGHT NOW.
 *
 * Five modes, and the user must always be able to tell which one they are
 * in. Without this the same screen means three different things: a world
 * advancing on its own is a cinematic, a world advancing because the user
 * dragged a scrub bar is exploration, and a world frozen on one moment is an
 * inspection — and a viewer who cannot tell them apart cannot tell what they
 * are being shown either.
 *
 * WORLD CONTINUITY IS THE POINT. Transitions carry the world with them
 * rather than rebuilding it: inspecting an event remembers the time you were
 * at and returns you there, and leaving the cinematic leaves you standing
 * where the last shot put you rather than at day zero. That continuity is
 * what separates "moving through a world" from "loading a series of views".
 *
 * Pure state, no renderer and no clock of its own.
 */
export type ExperienceMode =
  /** Free movement and manual time control. */
  | 'EXPLORE'
  /** The cinematic sequence is driving time and camera. */
  | 'WATCH'
  /** One event is held open; time is deliberately frozen. */
  | 'INSPECT'
  /** Returning to a verified state. */
  | 'REPLAY'
  /** Two states or runs side by side. */
  | 'COMPARE';

export interface ExperienceState {
  readonly mode: ExperienceMode;
  /** The world time the user is at, on the viewer's own clock. */
  readonly worldTime: number;
  /** The event held open in INSPECT/REPLAY, if any. */
  readonly selectedEvent: InspectableEvent | null;
  /**
   * Where WATCH was interrupted, so resuming continues the sequence instead
   * of restarting it. Null when the cinematic has not been entered.
   */
  readonly resumeSeconds: number | null;
}

export function initialExperienceState(worldTime: number, autoPlay: boolean): ExperienceState {
  return {
    mode: autoPlay ? 'WATCH' : 'EXPLORE',
    worldTime,
    selectedEvent: null,
    resumeSeconds: null,
  };
}

/**
 * Opens an event. Freezes time deliberately — a moment being interrogated
 * must not move underneath the person interrogating it — and remembers where
 * the cinematic was so it can be resumed rather than restarted.
 */
export function inspect(
  state: ExperienceState,
  event: InspectableEvent,
  atSeconds: number | null,
  clock?: WorldClock,
): ExperienceState {
  // The clock is the only thing allowed to decide whether the world may move
  // here. An event on a foreign run has no position on this timeline, and a
  // tick this run never produced is not made real by an event referencing it.
  const resolved = clock?.resolveForeign({
    source: 'EVENT_JUMP',
    tick: event.time.tick,
    current: state.worldTime,
    onViewerClock: event.time.onViewerClock,
  });
  const worldTime = resolved
    ? resolved.worldTime
    : (event.time.onViewerClock ? event.time.tick : state.worldTime);
  return {
    mode: 'INSPECT',
    worldTime,
    selectedEvent: event,
    resumeSeconds: state.mode === 'WATCH' ? atSeconds : state.resumeSeconds,
  };
}

/** Closes the inspection and hands the world back in the mode it came from. */
export function closeInspection(state: ExperienceState): ExperienceState {
  return {
    mode: state.resumeSeconds !== null ? 'WATCH' : 'EXPLORE',
    worldTime: state.worldTime,
    selectedEvent: null,
    resumeSeconds: state.resumeSeconds,
  };
}

/**
 * Enters replay for the held event. Refuses when the event was not verified
 * reproducible — the availability check lives on the event itself, and this
 * will not override it.
 */
export function replay(state: ExperienceState): ExperienceState {
  if (!state.selectedEvent?.replay.available) return state;
  return { ...state, mode: 'REPLAY' };
}

/** Takes manual control: the user's hand on the scrub bar ends the cinematic. */
export function explore(worldTime: number): ExperienceState {
  return { mode: 'EXPLORE', worldTime, selectedEvent: null, resumeSeconds: null };
}

export function watch(state: ExperienceState): ExperienceState {
  return { ...state, mode: 'WATCH', selectedEvent: null };
}

export function compare(state: ExperienceState): ExperienceState {
  return { ...state, mode: 'COMPARE', selectedEvent: null };
}

/** True while the world's clock must not advance on its own. */
export function timeIsFrozen(state: ExperienceState): boolean {
  return state.mode === 'INSPECT' || state.mode === 'REPLAY' || state.mode === 'COMPARE';
}

export const MODE_LABEL: Readonly<Record<ExperienceMode, string>> = {
  EXPLORE: 'EKSPLORACJA',
  WATCH: 'SEKWENCJA',
  INSPECT: 'INSPEKCJA',
  REPLAY: 'ODTWORZENIE',
  COMPARE: 'PORÓWNANIE',
};
