import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, defaultMobilityFor, resolveShot } from '../core/three/graphics/cameraRig';

describe('resolveShot (pure intent -> transform)', () => {
  it('places the camera at target + standoff on +Z and looks at target, for a zero-azimuth WIDE shot', () => {
    const shot = resolveShot({ vantage: 'WIDE', target: [0, 0, 0] });
    expect(shot.lookAt).toEqual([0, 0, 0]);
    expect(shot.position[2]).toBeCloseTo(12, 5); // WIDE's default standoff
    expect(shot.position[1]).toBeCloseTo(6, 5); // WIDE's default elevation
    expect(shot.fov).toBe(60);
  });

  it('offsets position by the given target, never hardcoding a world coordinate', () => {
    const shot = resolveShot({ vantage: 'SCIENTIFIC', target: [100, 5, -40] });
    expect(shot.lookAt).toEqual([100, 5, -40]);
    expect(shot.position[0]).toBeCloseTo(100, 5);
    expect(shot.position[1]).toBeCloseTo(5 + 2.2, 5);
    expect(shot.position[2]).toBeCloseTo(-40 + 4, 5);
  });

  it('MACRO and MICRO are progressively tighter than WIDE (standoff and FOV)', () => {
    const wide = resolveShot({ vantage: 'WIDE', target: [0, 0, 0] });
    const macro = resolveShot({ vantage: 'MACRO', target: [0, 0, 0] });
    const micro = resolveShot({ vantage: 'MICRO', target: [0, 0, 0] });
    const distance = (s: typeof wide) => Math.hypot(s.position[0], s.position[1], s.position[2]);
    expect(distance(macro)).toBeLessThan(distance(wide));
    expect(distance(micro)).toBeLessThan(distance(macro));
    expect(micro.fov).toBeLessThan(macro.fov);
  });

  it('an explicit standoff/elevation/fov override wins over the vantage default', () => {
    const shot = resolveShot({ vantage: 'WIDE', target: [0, 0, 0], standoff: 3, elevation: 1, fov: 90 });
    expect(shot.position[2]).toBeCloseTo(3, 5);
    expect(shot.position[1]).toBeCloseTo(1, 5);
    expect(shot.fov).toBe(90);
  });

  it('azimuth rotates the camera around the target at constant distance', () => {
    const front = resolveShot({ vantage: 'ORBITAL', target: [0, 0, 0], azimuth: 0 });
    const side = resolveShot({ vantage: 'ORBITAL', target: [0, 0, 0], azimuth: Math.PI / 2 });
    const distanceOf = (s: typeof front) => Math.hypot(s.position[0], s.position[2]);
    expect(distanceOf(front)).toBeCloseTo(distanceOf(side), 5);
    expect(front.position[0]).toBeCloseTo(0, 5);
    expect(side.position[2]).toBeCloseTo(0, 5);
  });

  it('bounds widen (never narrow) standoff so the given sphere fits in frame', () => {
    const tight = resolveShot({ vantage: 'MACRO', target: [0, 0, 0] });
    const withHugeBounds = resolveShot({ vantage: 'MACRO', target: [0, 0, 0], bounds: { center: [0, 0, 0], radius: 500 } });
    const withTinyBounds = resolveShot({ vantage: 'MACRO', target: [0, 0, 0], bounds: { center: [0, 0, 0], radius: 0.001 } });
    const dist = (s: typeof tight) => Math.hypot(...s.position);
    expect(dist(withHugeBounds)).toBeGreaterThan(dist(tight));
    expect(dist(withTinyBounds)).toBeCloseTo(dist(tight), 5); // a tiny bounds never narrows below the vantage default
  });

  it('framing DETAIL pulls in, CONTEXT pulls back, relative to FILL', () => {
    const fill = resolveShot({ vantage: 'SCIENTIFIC', target: [0, 0, 0], framing: 'FILL' });
    const detail = resolveShot({ vantage: 'SCIENTIFIC', target: [0, 0, 0], framing: 'DETAIL' });
    const context = resolveShot({ vantage: 'SCIENTIFIC', target: [0, 0, 0], framing: 'CONTEXT' });
    const dist = (s: typeof fill) => Math.hypot(...s.position);
    expect(dist(detail)).toBeLessThan(dist(fill));
    expect(dist(context)).toBeGreaterThan(dist(fill));
  });
});

describe('defaultMobilityFor', () => {
  it('gives free-roam vantages FREE and orbit-style vantages ORBIT', () => {
    expect(defaultMobilityFor('SCIENTIST_POV')).toBe('FREE');
    expect(defaultMobilityFor('HUMAN_EYE')).toBe('FREE');
    expect(defaultMobilityFor('MACRO')).toBe('ORBIT');
    expect(defaultMobilityFor('MICRO')).toBe('ORBIT');
    expect(defaultMobilityFor('ORBITAL')).toBe('ORBIT');
    expect(defaultMobilityFor('WIDE')).toBe('STATIC');
    expect(defaultMobilityFor('CINEMATIC')).toBe('FOLLOW');
    expect(defaultMobilityFor('DRIVER')).toBe('FOLLOW');
  });
});

describe('CameraRig.cutTo', () => {
  it('applies the resolved shot to the camera immediately, with no transition', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'WIDE', target: [0, 0, 0] });
    expect(rig.isTransitioning).toBe(false);
    expect(camera.position.z).toBeCloseTo(12, 5);
    expect(camera.fov).toBe(60);
  });

  it('updates currentVantage/currentMobility to reflect the applied shot', () => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'MACRO', target: [1, 1, 1] });
    expect(rig.currentVantage).toBe('MACRO');
    expect(rig.currentMobility).toBe('ORBIT');
  });
});

describe('CameraRig.transitionTo', () => {
  it('does not jump immediately — the camera is between start and end mid-transition', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    const rig = new CameraRig(THREE, camera);
    rig.transitionTo({ vantage: 'WIDE', target: [0, 0, 0] }, 1.0, 'LINEAR');
    expect(rig.isTransitioning).toBe(true);
    rig.update(0.5);
    expect(camera.position.z).toBeGreaterThan(0);
    expect(camera.position.z).toBeLessThan(12);
    expect(rig.isTransitioning).toBe(true);
  });

  it('reaches exactly the target shot once the full duration has elapsed', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.transitionTo({ vantage: 'WIDE', target: [0, 0, 0] }, 1.0, 'LINEAR');
    rig.update(0.6);
    rig.update(0.6); // overshoots the 1.0s duration — must clamp, not overshoot the shot
    expect(rig.isTransitioning).toBe(false);
    expect(camera.position.z).toBeCloseTo(12, 4);
    expect(camera.fov).toBe(60);
  });

  it('CINEMATIC and LINEAR ease reach different midpoints for the same elapsed fraction', () => {
    const linearCam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const linearRig = new CameraRig(THREE, linearCam);
    linearRig.transitionTo({ vantage: 'WIDE', target: [0, 0, 0] }, 1.0, 'LINEAR');
    linearRig.update(0.25);

    const cineCam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const cineRig = new CameraRig(THREE, cineCam);
    cineRig.transitionTo({ vantage: 'WIDE', target: [0, 0, 0] }, 1.0, 'CINEMATIC');
    cineRig.update(0.25);

    // Both start at camera (0,0,0) heading to z=12; smootherstep(0.25) < 0.25 (ease-in), so CINEMATIC lags LINEAR early on.
    expect(cineCam.position.z).toBeLessThan(linearCam.position.z);
  });

  it('a fresh transitionTo interrupts an in-flight one and starts from the camera\'s current position', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.transitionTo({ vantage: 'WIDE', target: [0, 0, 0] }, 1.0, 'LINEAR');
    rig.update(0.5);
    const midway = camera.position.clone();
    rig.transitionTo({ vantage: 'MACRO', target: [0, 0, 0] }, 1.0, 'LINEAR');
    expect(rig.isTransitioning).toBe(true);
    // The new transition's "from" is wherever the camera actually was, not reset to origin.
    rig.update(0);
    expect(camera.position.distanceTo(midway)).toBeLessThan(0.01);
  });
});

describe('CameraRig ORBIT mobility', () => {
  it('advances azimuth automatically and traces a constant-radius circle around the target', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'ORBITAL', target: [0, 0, 0] });
    rig.setOrbitSpeed(1); // 1 rad/s, easy to reason about

    const radius0 = Math.hypot(camera.position.x, camera.position.z);
    rig.update(0.5);
    const radius1 = Math.hypot(camera.position.x, camera.position.z);
    rig.update(0.5);
    const radius2 = Math.hypot(camera.position.x, camera.position.z);

    expect(radius1).toBeCloseTo(radius0, 5);
    expect(radius2).toBeCloseTo(radius0, 5);
    // Position actually changed — it's really orbiting, not stuck.
    expect(camera.position.x).not.toBeCloseTo(0, 2);
  });

  it('orbits around a live-tracked target when setTarget is called every frame', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'ORBITAL', target: [0, 0, 0] });
    rig.setTarget([50, 0, 50]);
    rig.update(0.1);
    // Now orbiting around (50,0,50), not the origin.
    expect(camera.position.x).toBeGreaterThan(40);
    expect(camera.position.z).toBeGreaterThan(40);
  });
});

describe('CameraRig FOLLOW mobility', () => {
  it('eases position toward a moving live target rather than snapping instantly', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'CINEMATIC', target: [0, 0, 0] });
    rig.setFollowDamping(2);
    rig.setTarget([20, 0, 0]);
    rig.update(1 / 60);
    // One small step: closer to the new target's shot than the start, but not there yet.
    expect(camera.position.x).toBeGreaterThan(0);
    expect(camera.position.x).toBeLessThan(20 + 6); // 6 = CINEMATIC's default standoff, generously bounding "not overshot"
  });

  it('converges to the resolved shot after enough frames', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'CINEMATIC', target: [0, 0, 0] });
    rig.setTarget([20, 0, 0]);
    for (let i = 0; i < 300; i++) rig.update(1 / 30);
    expect(camera.position.x).toBeCloseTo(20, 1);
    expect(camera.position.z).toBeCloseTo(6, 1); // CINEMATIC's default standoff on +Z
  });
});

describe('CameraRig STATIC/FREE mobility', () => {
  it('STATIC mobility never moves the camera again after cutTo, even across many update() calls', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'WIDE', target: [3, 3, 3] });
    const placed = camera.position.clone();
    for (let i = 0; i < 60; i++) rig.update(1 / 60);
    expect(camera.position.equals(placed)).toBe(true);
  });

  it('FREE mobility (SCIENTIST_POV) leaves the camera alone after the initial cut, for an external controller to own', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'SCIENTIST_POV', target: [0, 0, 0] });
    camera.position.set(9, 9, 9); // an external first-person controller moves the camera directly
    rig.update(1 / 60);
    expect(camera.position.x).toBe(9); // the rig did not fight the external controller
  });
});

describe('parity: recomputeShotInto (per-frame hot path) matches resolveShot (pure/testable path)', () => {
  it('ORBIT mobility\'s per-frame position matches an equivalent resolveShot call', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const rig = new CameraRig(THREE, camera);
    rig.cutTo({ vantage: 'MACRO', target: [2, 1, -3] });
    rig.setOrbitSpeed(0.7);
    rig.update(1 / 60);

    const expected = resolveShot({ vantage: 'MACRO', target: [2, 1, -3], azimuth: 0.7 / 60 });
    expect(camera.position.x).toBeCloseTo(expected.position[0], 5);
    expect(camera.position.y).toBeCloseTo(expected.position[1], 5);
    expect(camera.position.z).toBeCloseTo(expected.position[2], 5);
  });
});
