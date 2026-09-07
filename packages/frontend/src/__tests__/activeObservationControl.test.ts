import { afterEach, describe, expect, it } from 'vitest';
import {
  registerActiveObservationControl, getActiveObservationControl, hasActiveObservationControl,
} from '../core/activeObservationControl';

describe('activeObservationControl — the camera/time bridge for the global Science Chat', () => {
  afterEach(() => {
    // Defensive: a test that forgets to unregister must not leak into the next one.
    const leftover = getActiveObservationControl();
    if (leftover) registerActiveObservationControl(leftover)();
  });

  it('starts with nothing registered — the honest "no open scene" state', () => {
    expect(hasActiveObservationControl()).toBe(false);
    expect(getActiveObservationControl()).toBeNull();
  });

  it('register/unregister round-trips correctly', () => {
    const control = { applyObservation: (s: string) => ({ found: true, narration: s }) };
    const unregister = registerActiveObservationControl(control);
    expect(hasActiveObservationControl()).toBe(true);
    expect(getActiveObservationControl()).toBe(control);
    unregister();
    expect(hasActiveObservationControl()).toBe(false);
  });

  it('a stale unregister (from a previously-replaced control) never clobbers the CURRENT one', () => {
    const first = { applyObservation: () => ({ found: false, narration: 'first' }) };
    const second = { applyObservation: () => ({ found: false, narration: 'second' }) };
    const unregisterFirst = registerActiveObservationControl(first);
    registerActiveObservationControl(second);
    unregisterFirst();
    expect(getActiveObservationControl()).toBe(second);
    registerActiveObservationControl(second)(); // clean up
  });
});
