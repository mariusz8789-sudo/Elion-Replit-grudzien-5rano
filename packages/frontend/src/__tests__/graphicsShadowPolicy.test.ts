import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyShadowPolicy, SHADOW_SIZE_TIERS } from '../core/three/graphics/shadowPolicy';

function boxMesh(size: number, material: THREE.Material = new THREE.MeshStandardMaterial()): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
}

describe('applyShadowPolicy — size heuristic', () => {
  it('large ("structural/machinery") meshes cast and receive shadows', () => {
    const scene = new THREE.Scene();
    const bench = boxMesh(1.2);
    scene.add(bench);
    applyShadowPolicy(THREE, scene);
    expect(bench.castShadow).toBe(true);
    expect(bench.receiveShadow).toBe(true);
  });

  it('tiny ("detail") meshes cast no shadow by default', () => {
    const scene = new THREE.Scene();
    const bolt = boxMesh(0.02);
    scene.add(bolt);
    applyShadowPolicy(THREE, scene);
    expect(bolt.castShadow).toBe(false);
    expect(bolt.receiveShadow).toBe(false);
  });

  it('meshes comfortably under the DETAIL_MAX_EXTENT threshold don\'t cast', () => {
    const scene = new THREE.Scene();
    const underBoundary = boxMesh(SHADOW_SIZE_TIERS.DETAIL_MAX_EXTENT * 0.5);
    scene.add(underBoundary);
    applyShadowPolicy(THREE, scene);
    expect(underBoundary.castShadow).toBe(false);
  });
});

describe('applyShadowPolicy — transparency rule', () => {
  it('never lets a transparent mesh cast a shadow, even if large', () => {
    const scene = new THREE.Scene();
    const glass = boxMesh(1.5, new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.3 }));
    scene.add(glass);
    applyShadowPolicy(THREE, scene);
    expect(glass.castShadow).toBe(false);
    // Transparent surfaces still receive — a shadow falling ON glass is fine, it just shouldn't cast one.
    expect(glass.receiveShadow).toBe(true);
  });

  it('forceCast never overrides the transparency rule', () => {
    const scene = new THREE.Scene();
    const glass = boxMesh(0.05, new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.3 }));
    scene.add(glass);
    applyShadowPolicy(THREE, scene, { forceCast: [glass] });
    expect(glass.castShadow).toBe(false);
  });
});

describe('applyShadowPolicy — forceCast (important machinery)', () => {
  it('makes a small but important part cast a shadow despite being under the size threshold', () => {
    const scene = new THREE.Scene();
    const sensorHead = boxMesh(0.05);
    scene.add(sensorHead);
    applyShadowPolicy(THREE, scene, { forceCast: [sensorHead] });
    expect(sensorHead.castShadow).toBe(true);
  });

  it('accepts a predicate for larger/dynamic sets, matched by userData', () => {
    const scene = new THREE.Scene();
    const valve = boxMesh(0.05);
    valve.userData.importantMachinery = true;
    const bolt = boxMesh(0.05);
    scene.add(valve, bolt);
    applyShadowPolicy(THREE, scene, { forceCast: (mesh) => mesh.userData.importantMachinery === true });
    expect(valve.castShadow).toBe(true);
    expect(bolt.castShadow).toBe(false);
  });
});

describe('applyShadowPolicy — exclude escape hatch', () => {
  it('leaves excluded meshes exactly as the caller already set them', () => {
    const scene = new THREE.Scene();
    const bespoke = boxMesh(1.2);
    bespoke.castShadow = false;
    bespoke.receiveShadow = false;
    scene.add(bespoke);
    applyShadowPolicy(THREE, scene, { exclude: [bespoke] });
    expect(bespoke.castShadow).toBe(false);
    expect(bespoke.receiveShadow).toBe(false);
  });
});

describe('applyShadowPolicy — custom thresholds', () => {
  it('a caller can loosen minCastExtent to make more mid-size parts cast', () => {
    const scene = new THREE.Scene();
    const midSize = boxMesh(0.1);
    scene.add(midSize);
    applyShadowPolicy(THREE, scene, { minCastExtent: 0.05 });
    expect(midSize.castShadow).toBe(true);
  });
});
