import { describe, expect, it } from 'vitest';
import { CameraFlight, Easings, flightBetween } from '../core/reality/cameraSequencer';

describe('CameraFlight', () => {
  it('interpolates position and lookAt linearly under Easings.linear', () => {
    const flight = new CameraFlight([
      { t: 0, position: [0, 0, 0], lookAt: [0, 0, 0] },
      { t: 10, position: [10, 20, 30], lookAt: [1, 2, 3], easing: Easings.linear },
    ]);
    const mid = flight.stateAt(5);
    expect(mid.position).toEqual([5, 10, 15]);
    expect(mid.lookAt).toEqual([0.5, 1, 1.5]);
    expect(mid.progress).toBeCloseTo(0.5);
    expect(mid.done).toBe(false);
  });

  it('reaches exactly the final keyframe at total duration and reports done', () => {
    const flight = new CameraFlight([
      { t: 0, position: [0, 0, 0], lookAt: [0, 0, 0] },
      { t: 4, position: [4, 4, 4], lookAt: [1, 1, 1] },
    ]);
    const end = flight.stateAt(4);
    expect(end.position).toEqual([4, 4, 4]);
    expect(end.done).toBe(true);
  });

  it('clamps past the end instead of extrapolating', () => {
    const flight = new CameraFlight([
      { t: 0, position: [0, 0, 0], lookAt: [0, 0, 0] },
      { t: 2, position: [2, 0, 0], lookAt: [0, 0, 0] },
    ]);
    const past = flight.stateAt(100);
    expect(past.position).toEqual([2, 0, 0]);
    expect(past.progress).toBe(1);
  });

  it('advance() accumulates elapsed time across calls', () => {
    const flight = new CameraFlight([
      { t: 0, position: [0, 0, 0], lookAt: [0, 0, 0], easing: Easings.linear },
      { t: 10, position: [10, 0, 0], lookAt: [0, 0, 0], easing: Easings.linear },
    ]);
    flight.advance(3);
    const s = flight.advance(2);
    expect(s.position[0]).toBeCloseTo(5);
  });

  it('supports multi-keyframe routes, resolving the correct segment', () => {
    const flight = new CameraFlight([
      { t: 0, position: [0, 0, 0], lookAt: [0, 0, 0], label: 'start' },
      { t: 2, position: [10, 0, 0], lookAt: [0, 0, 0], easing: Easings.linear, label: 'mid' },
      { t: 4, position: [10, 10, 0], lookAt: [0, 0, 0], easing: Easings.linear, label: 'end' },
    ]);
    expect(flight.stateAt(1).label).toBe('mid');
    expect(flight.stateAt(1).position).toEqual([5, 0, 0]);
    expect(flight.stateAt(3).label).toBe('end');
    expect(flight.stateAt(3).position).toEqual([10, 5, 0]);
  });

  it('rejects fewer than 2 keyframes', () => {
    expect(() => new CameraFlight([{ t: 0, position: [0, 0, 0], lookAt: [0, 0, 0] }])).toThrow();
  });

  it('rejects non-increasing keyframe times', () => {
    expect(
      () =>
        new CameraFlight([
          { t: 0, position: [0, 0, 0], lookAt: [0, 0, 0] },
          { t: 0, position: [1, 0, 0], lookAt: [0, 0, 0] },
        ]),
    ).toThrow();
  });

  it('flightBetween builds a valid 2-keyframe flight with the given duration', () => {
    const flight = flightBetween(
      { position: [0, 0, 0], lookAt: [0, 0, 0] },
      { position: [5, 5, 5], lookAt: [1, 1, 1] },
      8,
    );
    expect(flight.totalDuration).toBe(8);
    expect(flight.stateAt(8).position).toEqual([5, 5, 5]);
  });
});

describe('Easings', () => {
  it('all pass through (0,0) and (1,1)', () => {
    for (const fn of [Easings.linear, Easings.easeInOutCubic, Easings.easeOutQuint]) {
      expect(fn(0)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(1);
    }
  });
});
