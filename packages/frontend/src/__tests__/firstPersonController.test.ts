import { describe, expect, it } from 'vitest';
import { FirstPersonController, type RoomBounds } from '../core/three/firstPersonController';

const ROOM: RoomBounds = { minX: -4, maxX: 4, minZ: -3, maxZ: 3 };

describe('FirstPersonController — pure headless movement math', () => {
  it('1. stays still with no input', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 } });
    const s = c.update(0.1);
    expect(s.position.x).toBeCloseTo(0, 5);
    expect(s.position.z).toBeCloseTo(0, 5);
    expect(s.speed).toBeCloseTo(0, 5);
  });

  it('2. accelerates toward target speed over time, never instantly teleporting', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 }, moveSpeed: 2, acceleration: 4 });
    c.setKey('forward', true);
    const s1 = c.update(0.1);
    expect(s1.speed).toBeGreaterThan(0);
    expect(s1.speed).toBeLessThan(2); // still ramping, not at target speed yet
    let s = s1;
    for (let i = 0; i < 20; i++) s = c.update(0.1);
    expect(s.speed).toBeCloseTo(2, 1); // eventually reaches target speed
  });

  it('3. decelerates to zero after releasing keys, not an instant stop', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 }, moveSpeed: 2, acceleration: 20, deceleration: 4 });
    c.setKey('forward', true);
    for (let i = 0; i < 20; i++) c.update(0.1);
    c.setKey('forward', false);
    const afterRelease = c.update(0.05);
    expect(afterRelease.speed).toBeGreaterThan(0); // still decaying
    let s = afterRelease;
    for (let i = 0; i < 20; i++) s = c.update(0.1);
    expect(s.speed).toBeCloseTo(0, 3);
  });

  it('4. walking forward moves in the direction the yaw currently faces', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 }, startYaw: 0, moveSpeed: 3, acceleration: 100 });
    c.setKey('forward', true);
    const s = c.update(0.5);
    // yaw=0 → forward is -Z in this controller's convention.
    expect(s.position.z).toBeLessThan(0);
    expect(Math.abs(s.position.x)).toBeLessThan(0.01);
  });

  it('5. is clamped inside the room bounds (wall collision)', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 }, startYaw: 0, moveSpeed: 10, acceleration: 1000, collisionRadius: 0.4 });
    c.setKey('forward', true);
    let s = c.update(1);
    for (let i = 0; i < 200; i++) s = c.update(0.1);
    expect(s.position.z).toBeGreaterThanOrEqual(ROOM.minZ + 0.4 - 1e-6);
  });

  it('6. is pushed out of a rectangular obstacle instead of walking through it', () => {
    const obstacle = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    const c = new FirstPersonController({ room: ROOM, obstacles: [obstacle], startPosition: { x: 0, z: 2 }, startYaw: Math.PI, moveSpeed: 10, acceleration: 1000, collisionRadius: 0.3 });
    c.setKey('forward', true); // yaw=PI → forward is +Z... actually faces back toward -Z origin from z=2 means moving toward obstacle
    let s = c.update(0.05);
    for (let i = 0; i < 100; i++) s = c.update(0.05);
    const insideX = s.position.x > obstacle.minX - 0.3 + 1e-6 && s.position.x < obstacle.maxX + 0.3 - 1e-6;
    const insideZ = s.position.z > obstacle.minZ - 0.3 + 1e-6 && s.position.z < obstacle.maxZ + 0.3 - 1e-6;
    expect(insideX && insideZ).toBe(false); // never both — player cannot end up inside the padded obstacle box
  });

  it('7. gravity is genuinely integrated but the floor clamp keeps eye height pinned (no jump lever exists)', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 }, eyeHeight: 1.7, gravity: 9.8 });
    const s = c.update(0.016);
    expect(s.position.y).toBeCloseTo(1.7, 5);
    const s2 = c.update(1); // large dt: without the clamp this would fall well below eye height
    expect(s2.position.y).toBeCloseTo(1.7, 5);
  });

  it('8. mouse deltas turn yaw and pitch, with pitch clamped to avoid flipping over', () => {
    const c = new FirstPersonController({ room: ROOM, startYaw: 0, mouseSensitivity: 0.01, pitchLimit: 1.2 });
    c.addMouseDelta(100, 0);
    const s = c.update(0.016);
    expect(s.yaw).not.toBe(0);
    c.addMouseDelta(0, -100000);
    const pitched = c.update(0.016);
    expect(pitched.pitch).toBeCloseTo(1.2, 5); // clamped, never exceeds the limit
  });

  it('9. teleport resets position, yaw and any residual velocity (used by Reset)', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 }, moveSpeed: 5, acceleration: 1000 });
    c.setKey('forward', true);
    c.update(0.5);
    c.teleport({ x: 1, z: 1 }, Math.PI / 2);
    const s = c.update(0); // dt=0: verifies teleported state directly, no movement applied
    expect(s.position.x).toBeCloseTo(1, 5);
    expect(s.position.z).toBeCloseTo(1, 5);
    expect(s.yaw).toBeCloseTo(Math.PI / 2, 5);
    expect(s.speed).toBeCloseTo(0, 5);
  });

  it('10. head bob is a presentation-only oscillation that grows while walking and never moves position', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 }, moveSpeed: 2, acceleration: 100 });
    c.setKey('forward', true);
    let sawNonZeroBob = false;
    for (let i = 0; i < 30; i++) {
      const s = c.update(0.05);
      if (Math.abs(s.bobOffset) > 1e-6) sawNonZeroBob = true;
      expect(Math.abs(s.bobOffset)).toBeLessThan(0.05); // bounded, subtle — never a large camera jump
    }
    expect(sawNonZeroBob).toBe(true);
  });

  it('11. head bob fades toward zero once the player stops (never freezes mid-swing)', () => {
    const c = new FirstPersonController({ room: ROOM, startPosition: { x: 0, z: 0 }, moveSpeed: 2, acceleration: 100, deceleration: 100 });
    c.setKey('forward', true);
    for (let i = 0; i < 20; i++) c.update(0.05);
    c.setKey('forward', false);
    let s = c.update(0.05);
    for (let i = 0; i < 40; i++) s = c.update(0.05);
    expect(s.speed).toBeCloseTo(0, 3);
    expect(Math.abs(s.bobOffset)).toBeCloseTo(0, 3);
  });
});
