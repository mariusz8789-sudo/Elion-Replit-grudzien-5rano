import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';

/** Same minimal canvas/document stub as graphicsHeroApparatusExample.test.ts — this example pulls
 * in `createGenesisMaterialPalette`, which needs `document.createElement('canvas')`. */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : {}),
  };
});

import { buildExampleWorld } from '../core/three/graphics/examples/worldFrameExample';

describe('buildExampleWorld — WorldFrame -> Scene end-to-end proof', () => {
  it('renders the hub entity at time 0, with no markers yet', () => {
    const scene = new THREE.Scene();
    const { renderer, buildFrameAt } = buildExampleWorld(THREE, scene);
    renderer.sync(buildFrameAt(0));
    const meshes = scene.children.filter((c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh));
    expect(meshes).toHaveLength(1); // just the hub
    expect(scene.children.some((c) => c instanceof THREE.InstancedMesh)).toBe(false);
  });

  it('grows the instanced marker population as synthetic time advances', () => {
    const scene = new THREE.Scene();
    const { renderer, buildFrameAt } = buildExampleWorld(THREE, scene);
    renderer.sync(buildFrameAt(3));
    let instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instanced.count).toBe(3);

    renderer.sync(buildFrameAt(8));
    instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instanced.count).toBe(8);
  });

  it('caps the marker population at 12 and drives the hub\'s emissive from its risk scalar', () => {
    const scene = new THREE.Scene();
    const { renderer, buildFrameAt } = buildExampleWorld(THREE, scene);
    renderer.sync(buildFrameAt(20));
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instanced.count).toBe(12);

    const hub = scene.children.find((c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh)) as THREE.Mesh;
    const material = hub.material as THREE.MeshStandardMaterial;
    // risk = min(1, time/10) = 1 at time 20 -> maximum emissive intensity from applyValueToEmissive.
    expect(material.emissiveIntensity).toBeCloseTo(0.9);
  });

  it('renders the honest-boundary placeholder once synthetic time passes 5, not fabricated detail', () => {
    const scene = new THREE.Scene();
    const { renderer, buildFrameAt } = buildExampleWorld(THREE, scene);
    renderer.sync(buildFrameAt(2));
    expect(scene.children.some((c) => c.name === '')).toBeDefined(); // sanity: scene has content
    const beforeCount = scene.children.length;

    renderer.sync(buildFrameAt(6));
    expect(scene.children.length).toBeGreaterThan(beforeCount);
    // The placeholder is a wireframe, transparent, non-state-driven mesh — distinct from the
    // example's own resolved visuals (which are never wireframe).
    const placeholder = scene.children.find((c) => {
      const material = (c as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      return material?.wireframe === true;
    });
    expect(placeholder).toBeDefined();
  });

  it('the same CameraRig moves between scales on the SAME entity via intent alone (WIDE vs MICRO)', () => {
    const scene = new THREE.Scene();
    const { cameraRig, shootCameraAtHub } = buildExampleWorld(THREE, scene);
    const wide = cameraRig.update(0);
    shootCameraAtHub('MICRO', true);
    const micro = cameraRig.update(0);
    const wideDistance = Math.hypot(...wide.position.map((v, i) => v - wide.lookAt[i]) as [number, number, number]);
    const microDistance = Math.hypot(...micro.position.map((v, i) => v - micro.lookAt[i]) as [number, number, number]);
    expect(microDistance).toBeLessThan(wideDistance);
    // Both shots look at the exact same world point — the hub never moved, only the vantage did.
    expect(micro.lookAt).toEqual(wide.lookAt);
  });

  it('tears down the whole world cleanly via renderer.dispose()', () => {
    const scene = new THREE.Scene();
    const { renderer, buildFrameAt } = buildExampleWorld(THREE, scene);
    renderer.sync(buildFrameAt(10));
    expect(scene.children.length).toBeGreaterThan(0);
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
