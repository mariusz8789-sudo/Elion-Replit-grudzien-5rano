import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { resolveCameraFraming, CameraRig, type CameraIntent } from '../core/three/graphics/cameraRig';

describe('resolveCameraFraming', () => {
  it('always looks exactly at the target', () => {
    const transform = resolveCameraFraming({ intent: 'WIDE', target: [3, 4, 5] });
    expect(transform.lookAt).toEqual([3, 4, 5]);
  });

  it('scales standoff distance with targetRadius — same intent, 10x radius, ~10x distance from target', () => {
    const small = resolveCameraFraming({ intent: 'SCIENTIFIC', target: [0, 0, 0], targetRadius: 1 });
    const large = resolveCameraFraming({ intent: 'SCIENTIFIC', target: [0, 0, 0], targetRadius: 10 });
    const distSmall = new THREE.Vector3(...small.position).length();
    const distLarge = new THREE.Vector3(...large.position).length();
    expect(distLarge / distSmall).toBeCloseTo(10, 5);
  });

  it('defaults targetRadius to 1 when omitted', () => {
    const withDefault = resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0] });
    const explicit = resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 1 });
    expect(withDefault.position).toEqual(explicit.position);
  });

  it('throws on a non-positive targetRadius rather than producing a degenerate/inverted framing', () => {
    expect(() => resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 0 })).toThrow();
    expect(() => resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0], targetRadius: -1 })).toThrow();
  });

  it('every named intent produces a finite, non-degenerate framing (no NaN, camera not at the target)', () => {
    const intents: CameraIntent[] = ['WIDE', 'HUMAN_EYE', 'SCIENTIST_POV', 'MACRO', 'MICRO', 'SCIENTIFIC', 'CINEMATIC', 'DRIVER', 'ORBITAL'];
    for (const intent of intents) {
      const transform = resolveCameraFraming({ intent, target: [0, 0, 0], targetRadius: 2 });
      for (const value of transform.position) expect(Number.isFinite(value)).toBe(true);
      const distance = new THREE.Vector3(...transform.position).length();
      expect(distance).toBeGreaterThan(0);
    }
  });

  it('MACRO frames much closer than WIDE for the same subject (a real ordering the intents must respect)', () => {
    const wide = resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 1 });
    const macro = resolveCameraFraming({ intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 });
    const wideDist = new THREE.Vector3(...wide.position).length();
    const macroDist = new THREE.Vector3(...macro.position).length();
    expect(macroDist).toBeLessThan(wideDist);
  });

  it('MICRO frames closer than MACRO, which frames closer than SCIENTIST_POV\'s human-scale default', () => {
    const distanceFor = (intent: CameraIntent) => new THREE.Vector3(...resolveCameraFraming({ intent, target: [0, 0, 0], targetRadius: 1 }).position).length();
    expect(distanceFor('MICRO')).toBeLessThan(distanceFor('MACRO'));
    expect(distanceFor('MACRO')).toBeLessThan(distanceFor('SCIENTIST_POV'));
  });

  it('azimuth rotates the camera around the target on the horizontal plane, at a constant distance', () => {
    const at0 = resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 1, azimuthDeg: 0 });
    const at90 = resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 1, azimuthDeg: 90 });
    const dist0 = new THREE.Vector3(...at0.position).length();
    const dist90 = new THREE.Vector3(...at90.position).length();
    expect(dist90).toBeCloseTo(dist0, 5); // same distance, different position
    expect(at90.position[0]).not.toBeCloseTo(at0.position[0]);
  });

  it('honors an explicit standoffMultiplier/elevationDeg override over the intent default', () => {
    const withOverride = resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 1, standoffMultiplier: 100, elevationDeg: 89 });
    const distance = new THREE.Vector3(...withOverride.position).length();
    expect(distance).toBeCloseTo(100, 5);
    expect(withOverride.position[1]).toBeGreaterThan(90); // near-vertical elevation -> mostly y
  });

  it('places the camera relative to an arbitrary (non-origin) target, not always relative to world origin', () => {
    const transform = resolveCameraFraming({ intent: 'WIDE', target: [10, 20, 30], targetRadius: 1 });
    expect(transform.position[1]).toBeGreaterThan(20); // elevated above the target's own y
  });
});

describe('CameraRig', () => {
  it('starts already at the initial shot with no transition needed', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    expect(rig.isSettled).toBe(true);
  });

  it('frame() eases toward the new shot over update() calls instead of snapping', () => {
    const rig = new CameraRig(THREE, { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 });
    rig.frame({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 1 });
    expect(rig.isSettled).toBe(false);
    const mid = rig.update(0.05);
    const finalTransform = resolveCameraFraming({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 1 });
    // Partway there: closer to the final shot than the start, but not AT it yet.
    expect(mid.position).not.toEqual(finalTransform.position);
  });

  it('converges to the target shot after enough update() calls', () => {
    const rig = new CameraRig(THREE, { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 });
    rig.frame({ intent: 'WIDE', target: [0, 0, 0], targetRadius: 1 });
    for (let i = 0; i < 200; i++) rig.update(0.1);
    expect(rig.isSettled).toBe(true);
  });

  it('cut() snaps immediately with no transition', () => {
    const rig = new CameraRig(THREE, { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 });
    rig.cut({ intent: 'WIDE', target: [5, 5, 5], targetRadius: 2 });
    expect(rig.isSettled).toBe(true);
    const expected = resolveCameraFraming({ intent: 'WIDE', target: [5, 5, 5], targetRadius: 2 });
    const current = rig.update(0); // dt=0 returns current without moving further
    expect(current.position[0]).toBeCloseTo(expected.position[0]);
    expect(current.position[1]).toBeCloseTo(expected.position[1]);
    expect(current.position[2]).toBeCloseTo(expected.position[2]);
  });
});
