import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { configureCinematicCamera, recommendedDofForProfile, FocusPuller } from '../core/three/graphics/cinematicCamera';

describe('configureCinematicCamera', () => {
  it('applies a profile\'s FOV/near/far and updates the projection matrix', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 2000);
    const before = camera.projectionMatrix.clone();
    configureCinematicCamera(camera, 'HERO_CLOSE_UP');
    expect(camera.fov).toBe(40);
    expect(camera.projectionMatrix.equals(before)).toBe(false);
  });

  it('gives distinct lenses to distinct profiles (a macro shot is tighter than an establishing wide)', () => {
    const camera = new THREE.PerspectiveCamera();
    configureCinematicCamera(camera, 'WIDE_ESTABLISHING');
    const wideFov = camera.fov;
    configureCinematicCamera(camera, 'MACRO_DETAIL');
    const macroFov = camera.fov;
    expect(macroFov).toBeLessThan(wideFov);
  });
});

describe('recommendedDofForProfile', () => {
  it('sharp-everywhere profiles (WIDE_ESTABLISHING, SCIENTIST_POV) never enable DOF', () => {
    expect(recommendedDofForProfile('WIDE_ESTABLISHING', 5).enabled).toBe(false);
    expect(recommendedDofForProfile('SCIENTIST_POV', 5).enabled).toBe(false);
  });

  it('close-up profiles enable DOF at the given focus distance', () => {
    const dof = recommendedDofForProfile('HERO_CLOSE_UP', 3.2);
    expect(dof.enabled).toBe(true);
    expect(dof.focusDistance).toBe(3.2);
  });

  it('MACRO_DETAIL recommends stronger blur than HERO_CLOSE_UP', () => {
    const macro = recommendedDofForProfile('MACRO_DETAIL', 1);
    const hero = recommendedDofForProfile('HERO_CLOSE_UP', 1);
    expect(macro.blurStrength!).toBeGreaterThan(hero.blurStrength!);
  });

  it('a disabled-DOF profile still returns a safe, usable settings object', () => {
    const dof = recommendedDofForProfile('SCIENTIST_POV', 5);
    expect(dof.focusDistance).toBe(5);
  });
});

describe('FocusPuller', () => {
  it('starts settled at its initial distance', () => {
    const puller = new FocusPuller(2);
    expect(puller.value).toBe(2);
    expect(puller.isSettled).toBe(true);
  });

  it('eases toward a new target over time rather than snapping', () => {
    const puller = new FocusPuller(2);
    puller.pullTo(10);
    expect(puller.isSettled).toBe(false);
    const afterOneStep = puller.update(0.1);
    expect(afterOneStep).toBeGreaterThan(2);
    expect(afterOneStep).toBeLessThan(10);
  });

  it('converges to the target after enough time', () => {
    const puller = new FocusPuller(0);
    puller.pullTo(5);
    for (let i = 0; i < 200; i++) puller.update(1 / 30);
    expect(puller.value).toBeCloseTo(5, 2);
    expect(puller.isSettled).toBe(true);
  });

  it('snapTo jumps immediately with no transition', () => {
    const puller = new FocusPuller(0);
    puller.snapTo(7);
    expect(puller.value).toBe(7);
    expect(puller.isSettled).toBe(true);
  });

  it('never overshoots or goes negative for a sane forward pull', () => {
    const puller = new FocusPuller(1);
    puller.pullTo(4);
    for (let i = 0; i < 50; i++) {
      const value = puller.update(0.05);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(4);
    }
  });
});
