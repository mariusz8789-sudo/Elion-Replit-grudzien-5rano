export type PlacePlayback = 'playing' | 'paused';

export interface PlaceSceneState {
  sceneId: 'observer-at-the-junction';
  sceneVersion: '1.0.0';
  realTimeMs: number;
  worldTimeYears: number;
  simulationTimeYears: number;
  displayTimeYears: number;
  timeScaleYearsPerSecond: number;
  minWorldTimeYears: number;
  maxWorldTimeYears: number;
  playback: PlacePlayback;
}

export interface PlaceSceneRequest {
  worldTimeYears?: number;
  timeScaleYearsPerSecond?: number;
  playback?: PlacePlayback;
}

export const PLACE_TIME_DEFAULTS = {
  minWorldTimeYears: 0,
  maxWorldTimeYears: 1_000_000,
  timeScaleYearsPerSecond: 10,
} as const;

export function createPlaceSceneState(request: PlaceSceneRequest = {}): PlaceSceneState {
  const min = PLACE_TIME_DEFAULTS.minWorldTimeYears;
  const max = PLACE_TIME_DEFAULTS.maxWorldTimeYears;
  const worldTimeYears = clamp(request.worldTimeYears ?? min, min, max);
  return {
    sceneId: 'observer-at-the-junction',
    sceneVersion: '1.0.0',
    realTimeMs: 0,
    worldTimeYears,
    simulationTimeYears: worldTimeYears,
    displayTimeYears: worldTimeYears,
    timeScaleYearsPerSecond: request.timeScaleYearsPerSecond ?? PLACE_TIME_DEFAULTS.timeScaleYearsPerSecond,
    minWorldTimeYears: min,
    maxWorldTimeYears: max,
    playback: request.playback ?? 'paused',
  };
}

export function advancePlaceScene(state: PlaceSceneState, realDeltaMs: number): PlaceSceneState {
  if (state.playback === 'paused' || realDeltaMs <= 0) return state;
  const deltaYears = (realDeltaMs / 1000) * state.timeScaleYearsPerSecond;
  const worldTimeYears = clamp(state.worldTimeYears + deltaYears, state.minWorldTimeYears, state.maxWorldTimeYears);
  const reachedBoundary = worldTimeYears === state.minWorldTimeYears || worldTimeYears === state.maxWorldTimeYears;
  return {
    ...state,
    realTimeMs: state.realTimeMs + realDeltaMs,
    worldTimeYears,
    simulationTimeYears: worldTimeYears,
    displayTimeYears: worldTimeYears,
    playback: reachedBoundary ? 'paused' : state.playback,
  };
}

export function seekPlaceScene(state: PlaceSceneState, worldTimeYears: number): PlaceSceneState {
  const next = clamp(worldTimeYears, state.minWorldTimeYears, state.maxWorldTimeYears);
  return {
    ...state,
    worldTimeYears: next,
    simulationTimeYears: next,
    displayTimeYears: next,
    playback: 'paused',
  };
}

export function setPlacePlayback(state: PlaceSceneState, playback: PlacePlayback): PlaceSceneState {
  return { ...state, playback };
}

export function setPlaceTimeScale(state: PlaceSceneState, timeScaleYearsPerSecond: number): PlaceSceneState {
  return { ...state, timeScaleYearsPerSecond };
}

export function resetPlaceScene(state: PlaceSceneState): PlaceSceneState {
  return createPlaceSceneState({ timeScaleYearsPerSecond: state.timeScaleYearsPerSecond });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
