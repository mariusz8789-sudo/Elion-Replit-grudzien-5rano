import { describe, expect, it } from 'vitest';
import { createOscillator, createRotator, createSway } from '../core/three/graphics/animation';

describe('createOscillator', () => {
  it('rejects a non-positive period', () => {
    expect(() => createOscillator({ period: 0 })).toThrow();
    expect(() => createOscillator({ period: -1 })).toThrow();
  });

  it('stays within the requested range', () => {
    const osc = createOscillator({ period: 2, range: [-5, 5] });
    for (let i = 0; i < 50; i++) {
      const value = osc.update(0.1);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  it('defaults to a [-1, 1] range', () => {
    const osc = createOscillator({ period: 1 });
    for (let i = 0; i < 20; i++) {
      const value = osc.update(0.05);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('completes one full cycle back to its starting value after `period` seconds', () => {
    const osc = createOscillator({ period: 1 });
    const start = osc.update(0);
    let value = start;
    for (let i = 0; i < 10; i++) value = osc.update(0.1);
    expect(value).toBeCloseTo(start, 5);
  });

  it('two oscillators with different phaseOffsets are out of sync', () => {
    const a = createOscillator({ period: 4, phaseOffset: 0 });
    const b = createOscillator({ period: 4, phaseOffset: 0.25 });
    const va = a.update(0.1);
    const vb = b.update(0.1);
    expect(va).not.toBeCloseTo(vb, 3);
  });

  it('reset() restarts the cycle from phase 0', () => {
    const osc = createOscillator({ period: 2 });
    osc.update(1.3);
    osc.reset();
    const afterReset = osc.update(0);
    const fresh = createOscillator({ period: 2 }).update(0);
    expect(afterReset).toBeCloseTo(fresh, 5);
  });
});

describe('createRotator', () => {
  it('advances rotation on the configured axis by speed * dt', () => {
    const rotator = createRotator('y', 2);
    const object = { rotation: { x: 0, y: 0, z: 0 } };
    rotator.update(1, object);
    expect(object.rotation.y).toBeCloseTo(2);
    expect(object.rotation.x).toBe(0);
    expect(object.rotation.z).toBe(0);
  });

  it('supports a negative speed for the opposite direction', () => {
    const rotator = createRotator('x', -1);
    const object = { rotation: { x: 0, y: 0, z: 0 } };
    rotator.update(1, object);
    expect(object.rotation.x).toBeCloseTo(-1);
  });

  it('supports a live-tracked speed thunk instead of a fixed constant', () => {
    let liveSpeed = 0;
    const rotator = createRotator('z', () => liveSpeed);
    const object = { rotation: { x: 0, y: 0, z: 0 } };
    rotator.update(1, object);
    expect(object.rotation.z).toBe(0);
    liveSpeed = 3;
    rotator.update(1, object);
    expect(object.rotation.z).toBeCloseTo(3);
  });

  it('dt=0 is a harmless no-op', () => {
    const rotator = createRotator('y', 5);
    const object = { rotation: { x: 0, y: 0, z: 0 } };
    rotator.update(0, object);
    expect(object.rotation.y).toBe(0);
  });
});

describe('createSway', () => {
  it('stays within [-amplitudeRad, amplitudeRad]', () => {
    const sway = createSway({ amplitudeRad: 0.2, period: 3 });
    const object = { rotation: { x: 0, y: 0, z: 0 } };
    for (let i = 0; i < 60; i++) {
      sway.update(0.1, object);
      expect(object.rotation.z).toBeGreaterThanOrEqual(-0.2);
      expect(object.rotation.z).toBeLessThanOrEqual(0.2);
    }
  });

  it('defaults to the z axis, and respects an explicit axis override', () => {
    const swayZ = createSway({ amplitudeRad: 0.1, period: 2 });
    const objZ = { rotation: { x: 0, y: 0, z: 0 } };
    swayZ.update(0.5, objZ);
    expect(objZ.rotation.z).not.toBe(0);

    const swayX = createSway({ amplitudeRad: 0.1, period: 2, axis: 'x' });
    const objX = { rotation: { x: 0, y: 0, z: 0 } };
    swayX.update(0.5, objX);
    expect(objX.rotation.x).not.toBe(0);
    expect(objX.rotation.z).toBe(0);
  });
});
