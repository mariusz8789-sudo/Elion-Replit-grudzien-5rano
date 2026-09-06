import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createKeyLight, createRimLight, createPracticalLight, createBackgroundFill, createHeroLight,
} from '../core/three/graphics/lighting';

/**
 * GENESIS GRAPHICS RUNTIME — lighting-role tests. Pure scene-graph assertions (no renderer, no
 * canvas) — these roles only ever construct THREE.Light subclasses and add them to a Scene.
 */

describe('createKeyLight', () => {
  it('adds both the light and its target to the scene (SpotLight direction needs the target in-graph)', () => {
    const scene = new THREE.Scene();
    const light = createKeyLight(THREE, scene, { target: [0, 1, 0], position: [3, 3, 3] });
    expect(scene.children).toContain(light);
    expect(scene.children).toContain(light.target);
  });

  it('casts a shadow by default, with a bounded map size', () => {
    const scene = new THREE.Scene();
    const light = createKeyLight(THREE, scene, { target: [0, 1, 0], position: [3, 3, 3] });
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize.x).toBe(1024);
  });

  it('respects an explicit shadow-map size (e.g. from quality.recommendedShadowMapSize)', () => {
    const scene = new THREE.Scene();
    const light = createKeyLight(THREE, scene, { target: [0, 1, 0], position: [3, 3, 3], shadowMapSize: 512 });
    expect(light.shadow.mapSize.x).toBe(512);
  });

  it('can opt out of casting a shadow for a secondary/fill key', () => {
    const scene = new THREE.Scene();
    const light = createKeyLight(THREE, scene, { target: [0, 1, 0], position: [3, 3, 3], castShadow: false });
    expect(light.castShadow).toBe(false);
  });
});

describe('createRimLight / createPracticalLight', () => {
  it('rim light never casts a shadow (silhouette accent, not a form light)', () => {
    const scene = new THREE.Scene();
    const light = createRimLight(THREE, scene, { position: [0, 1, -2] });
    expect(light.castShadow).toBe(false);
    expect(scene.children).toContain(light);
  });

  it('practical light never casts a shadow (its fixture geometry is a different layer\'s concern)', () => {
    const scene = new THREE.Scene();
    const light = createPracticalLight(THREE, scene, { position: [1, 2, 1] });
    expect(light.castShadow).toBe(false);
  });
});

describe('createBackgroundFill', () => {
  it('is a weak wash, not the scene\'s main light source', () => {
    const scene = new THREE.Scene();
    const light = createBackgroundFill(THREE, scene);
    expect(light.intensity).toBeLessThan(1);
  });
});

describe('createHeroLight', () => {
  it('produces a KEY (shadow-casting, aimed at target) and RIM pair positioned away from the target', () => {
    const scene = new THREE.Scene();
    const target: THREE.Vector3Tuple = [0, 1.1, -0.2];
    const { key, rim } = createHeroLight(THREE, scene, { target });
    expect(key.castShadow).toBe(true);
    expect([key.target.position.x, key.target.position.y, key.target.position.z]).toEqual(target);
    expect(key.position.distanceTo(new THREE.Vector3(...target))).toBeGreaterThan(1);
    expect(rim.position.distanceTo(new THREE.Vector3(...target))).toBeGreaterThan(0.5);
    // KEY and RIM must not collapse onto the same point, or the rig degenerates into one light.
    expect(key.position.distanceTo(rim.position)).toBeGreaterThan(1);
  });

  it('scales key distance with a larger hero object without extra call-site math', () => {
    const scene = new THREE.Scene();
    const target: THREE.Vector3Tuple = [0, 0, 0];
    const small = createHeroLight(THREE, scene, { target, keyDistance: 2 });
    const large = createHeroLight(THREE, new THREE.Scene(), { target, keyDistance: 20 });
    expect(large.key.position.length()).toBeGreaterThan(small.key.position.length());
  });
});
