import { describe, expect, it } from 'vitest';
import {
  advancePlaceScene,
  createPlaceSceneState,
  resetPlaceScene,
  seekPlaceScene,
  setPlacePlayback,
  setPlaceTimeScale,
} from '../core/reality/placeTimeState';

describe('Observer at the Junction — PlaceSceneState', () => {
  it('rozdziela real/world/simulation/display time i zaczyna w pauzie', () => {
    const state = createPlaceSceneState();
    expect(state.realTimeMs).toBe(0);
    expect(state.worldTimeYears).toBe(0);
    expect(state.simulationTimeYears).toBe(0);
    expect(state.displayTimeYears).toBe(0);
    expect(state.playback).toBe('paused');
  });

  it('przyspiesza world time tylko podczas PLAY i zachowuje wspólny stan sceny', () => {
    const playing = setPlacePlayback(setPlaceTimeScale(createPlaceSceneState(), 10), 'playing');
    const next = advancePlaceScene(playing, 10_000);
    expect(next.realTimeMs).toBe(10_000);
    expect(next.worldTimeYears).toBe(100);
    expect(next.simulationTimeYears).toBe(100);
    expect(next.displayTimeYears).toBe(100);
  });

  it('PAUSE nie zmienia czasu, nawet jeśli minie realny czas', () => {
    const state = createPlaceSceneState({ worldTimeYears: 2026 });
    expect(advancePlaceScene(state, 10_000)).toEqual(state);
  });

  it('ujemna skala wykonuje REWIND i zatrzymuje się na dolnej granicy', () => {
    const state = setPlacePlayback(setPlaceTimeScale(createPlaceSceneState({ worldTimeYears: 100 }), -20), 'playing');
    const next = advancePlaceScene(state, 10_000);
    expect(next.worldTimeYears).toBe(0);
    expect(next.playback).toBe('paused');
  });

  it('nie przekracza górnej granicy miliona lat', () => {
    const state = setPlacePlayback(setPlaceTimeScale(createPlaceSceneState({ worldTimeYears: 999_999 }), 1000), 'playing');
    const next = advancePlaceScene(state, 10_000);
    expect(next.worldTimeYears).toBe(1_000_000);
    expect(next.playback).toBe('paused');
  });

  it('SEEK zatrzymuje odtwarzanie i synchronizuje wszystkie osie modelu', () => {
    const state = setPlacePlayback(createPlaceSceneState({ worldTimeYears: 50 }), 'playing');
    const next = seekPlaceScene(state, 2_026);
    expect(next.playback).toBe('paused');
    expect(next.worldTimeYears).toBe(2_026);
    expect(next.simulationTimeYears).toBe(2_026);
    expect(next.displayTimeYears).toBe(2_026);
  });

  it('RESET wraca do początku, ale zachowuje wybraną skalę', () => {
    const state = setPlaceTimeScale(createPlaceSceneState({ worldTimeYears: 2_026 }), 1000);
    const next = resetPlaceScene(state);
    expect(next.worldTimeYears).toBe(0);
    expect(next.timeScaleYearsPerSecond).toBe(1000);
    expect(next.playback).toBe('paused');
  });
});
