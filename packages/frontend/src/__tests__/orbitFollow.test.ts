import { describe, expect, it } from 'vitest';
import { DEFAULT_ORBIT_FOLLOW_DIRECTION, lerp, orbitFollowDesiredPosition } from '../core/three/orbitFollow';

describe('orbitFollowDesiredPosition', () => {
  it('places the desired position at target + normalized(default direction) * focusDistance when no preset direction is given', () => {
    const target = { x: 10, y: 0, z: -5 };
    const focusDistance = 20;
    const desired = orbitFollowDesiredPosition(target, undefined, focusDistance);

    const len = Math.hypot(DEFAULT_ORBIT_FOLLOW_DIRECTION.x, DEFAULT_ORBIT_FOLLOW_DIRECTION.y, DEFAULT_ORBIT_FOLLOW_DIRECTION.z);
    expect(desired.x).toBeCloseTo(target.x + (DEFAULT_ORBIT_FOLLOW_DIRECTION.x / len) * focusDistance);
    expect(desired.y).toBeCloseTo(target.y + (DEFAULT_ORBIT_FOLLOW_DIRECTION.y / len) * focusDistance);
    expect(desired.z).toBeCloseTo(target.z + (DEFAULT_ORBIT_FOLLOW_DIRECTION.z / len) * focusDistance);
  });

  it('normalizes an arbitrary, non-unit preset direction before scaling by focusDistance', () => {
    const target = { x: 0, y: 0, z: 0 };
    const desired = orbitFollowDesiredPosition(target, { x: 0, y: 10, z: 0 }, 5);
    expect(desired).toEqual({ x: 0, y: 5, z: 0 });
  });

  it('lands exactly focusDistance away from the target regardless of preset direction magnitude', () => {
    const target = { x: 3, y: -2, z: 8 };
    const focusDistance = 12;
    const desired = orbitFollowDesiredPosition(target, { x: 2, y: 2, z: 1 }, focusDistance);
    const dx = desired.x - target.x;
    const dy = desired.y - target.y;
    const dz = desired.z - target.z;
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(focusDistance, 5);
  });

  it('falls back to the default direction if a zero-length preset direction is given (division-by-zero guard)', () => {
    const target = { x: 0, y: 0, z: 0 };
    const desired = orbitFollowDesiredPosition(target, { x: 0, y: 0, z: 0 }, 10);
    expect(Number.isFinite(desired.x)).toBe(true);
    expect(Number.isFinite(desired.y)).toBe(true);
    expect(Number.isFinite(desired.z)).toBe(true);
  });
});

describe('lerp', () => {
  it('moves partway from current toward target, never snapping in one step', () => {
    const step1 = lerp(0, 100, 0.09);
    expect(step1).toBeCloseTo(9);
    expect(step1).not.toBe(100);
  });

  it('converges toward the target over repeated calls, matching the render loop calling it every frame', () => {
    let value = 0;
    for (let i = 0; i < 200; i += 1) {
      value = lerp(value, 100, 0.09);
    }
    expect(value).toBeCloseTo(100, 3);
  });

  it('returns the current value unchanged when factor is 0, and the target when factor is 1', () => {
    expect(lerp(5, 50, 0)).toBe(5);
    expect(lerp(5, 50, 1)).toBe(50);
  });
});
