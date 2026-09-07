import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, defaultMobilityFor, resolveCameraFraming } from '../core/three/graphics/cameraRig';

/**
 * Coverage for CameraRig's mobility layer (STATIC/FOLLOW/ORBIT/FREE) built
 * on top of resolveCameraFraming/frame/cut — see graphicsCameraRig.test.ts
 * for the base intent->transform math these build on.
 */
describe('defaultMobilityFor', () => {
  it('assigns FREE to free-roam vantages, ORBIT to inspection vantages, FOLLOW to tracking shots, STATIC to establishing shots', () => {
    expect(defaultMobilityFor('HUMAN_EYE')).toBe('FREE');
    expect(defaultMobilityFor('SCIENTIST_POV')).toBe('FREE');
    expect(defaultMobilityFor('MACRO')).toBe('ORBIT');
    expect(defaultMobilityFor('MICRO')).toBe('ORBIT');
    expect(defaultMobilityFor('ORBITAL')).toBe('ORBIT');
    expect(defaultMobilityFor('CINEMATIC')).toBe('FOLLOW');
    expect(defaultMobilityFor('DRIVER')).toBe('FOLLOW');
    expect(defaultMobilityFor('WIDE')).toBe('STATIC');
    expect(defaultMobilityFor('SCIENTIFIC')).toBe('STATIC');
  });
});

describe('CameraRig mobility exposure', () => {
  it('currentMobility reflects the framed intent, and updates across frame()/cut()', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    expect(rig.currentMobility).toBe('STATIC');
    rig.cut({ intent: 'MACRO', target: [0, 0, 0] });
    expect(rig.currentMobility).toBe('ORBIT');
    rig.frame({ intent: 'CINEMATIC', target: [0, 0, 0] });
    expect(rig.currentMobility).toBe('FOLLOW');
  });
});

describe('CameraRig ORBIT mobility', () => {
  it('auto-advances azimuth every update(), tracing a constant-radius circle around the target', () => {
    const rig = new CameraRig(THREE, { intent: 'ORBITAL', target: [0, 0, 0], targetRadius: 1 });
    rig.setOrbitSpeed(45); // degrees/second, easy to reason about

    const p0 = rig.update(0).position;
    const p1 = rig.update(0.5).position;
    const p2 = rig.update(0.5).position;

    const radiusOf = (p: readonly number[]) => Math.hypot(p[0], p[2]);
    expect(radiusOf(p1)).toBeCloseTo(radiusOf(p0), 5);
    expect(radiusOf(p2)).toBeCloseTo(radiusOf(p0), 5);
    // It actually moved — not stuck at the same azimuth.
    expect(p1[0]).not.toBeCloseTo(p0[0], 3);
  });

  it('never lags behind its own circle — position exactly matches resolveCameraFraming at the same accumulated azimuth', () => {
    const rig = new CameraRig(THREE, { intent: 'MACRO', target: [2, 1, -3], targetRadius: 1 });
    rig.setOrbitSpeed(10);
    const transform = rig.update(1 / 60);

    const expected = resolveCameraFraming({ intent: 'MACRO', target: [2, 1, -3], targetRadius: 1, azimuthDeg: 10 / 60 });
    expect(transform.position[0]).toBeCloseTo(expected.position[0], 5);
    expect(transform.position[1]).toBeCloseTo(expected.position[1], 5);
    expect(transform.position[2]).toBeCloseTo(expected.position[2], 5);
  });

  it('orbits around a live-tracked target when setTarget is called every frame', () => {
    const rig = new CameraRig(THREE, { intent: 'ORBITAL', target: [0, 0, 0], targetRadius: 1 });
    rig.setTarget([50, 0, 50]);
    const transform = rig.update(1 / 60);
    expect(transform.lookAt[0]).toBeCloseTo(50, 5);
    expect(transform.lookAt[2]).toBeCloseTo(50, 5);
  });
});

describe('CameraRig FOLLOW mobility', () => {
  it('eases toward a moving live target rather than snapping instantly', () => {
    const rig = new CameraRig(THREE, { intent: 'CINEMATIC', target: [0, 0, 0], targetRadius: 1 });
    rig.setTarget([20, 0, 0]);
    const transform = rig.update(0.05); // small step
    expect(transform.lookAt[0]).toBeGreaterThan(0);
    expect(transform.lookAt[0]).toBeLessThan(20);
  });

  it('converges to the live target\'s resolved shot after enough frames', () => {
    const rig = new CameraRig(THREE, { intent: 'CINEMATIC', target: [0, 0, 0], targetRadius: 1 });
    rig.setTarget([20, 0, 0]);
    let last = rig.update(1 / 30);
    for (let i = 0; i < 300; i++) last = rig.update(1 / 30);
    const expected = resolveCameraFraming({ intent: 'CINEMATIC', target: [20, 0, 0], targetRadius: 1 });
    expect(last.lookAt[0]).toBeCloseTo(expected.lookAt[0], 2);
    expect(last.position[0]).toBeCloseTo(expected.position[0], 1);
  });

  it('without setTarget, FOLLOW behaves exactly like a normal frame()/update() ease toward the static target', () => {
    const rig = new CameraRig(THREE, { intent: 'CINEMATIC', target: [0, 0, 0], targetRadius: 1 });
    rig.frame({ intent: 'CINEMATIC', target: [5, 0, 0], targetRadius: 1 });
    for (let i = 0; i < 200; i++) rig.update(0.1);
    expect(rig.isSettled).toBe(true);
  });
});

describe('CameraRig STATIC/FREE mobility', () => {
  it('STATIC settles and then holds — no further drift once settled', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [3, 3, 3], targetRadius: 2 });
    for (let i = 0; i < 50; i++) rig.update(1 / 30);
    const settled = rig.update(1 / 30);
    for (let i = 0; i < 50; i++) rig.update(1 / 30);
    const stillSettled = rig.update(1 / 30);
    expect(stillSettled.position[0]).toBeCloseTo(settled.position[0], 6);
    expect(stillSettled.position[1]).toBeCloseTo(settled.position[1], 6);
    expect(stillSettled.position[2]).toBeCloseTo(settled.position[2], 6);
  });

  it('FREE (SCIENTIST_POV) settles the same way — a caller who stops applying update() output owns the camera from there', () => {
    const rig = new CameraRig(THREE, { intent: 'SCIENTIST_POV', target: [0, 0, 0], targetRadius: 1 });
    expect(rig.isSettled).toBe(true); // already at the initial cut, nothing left for the rig to do
  });
});
