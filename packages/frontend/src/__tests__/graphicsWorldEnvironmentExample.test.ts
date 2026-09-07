import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';

/** Same minimal canvas/document stub as graphicsWorldFrameExample.test.ts — this example pulls in
 * `createGenesisMaterialPalette` (materials.ts) and `createWaterSurface`/`createTreeField`, all of
 * which touch `document.createElement('canvas')` for procedural detail textures. */
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

import { buildExampleEnvironmentWorld } from '../core/three/graphics/examples/worldEnvironmentExample';

describe('buildExampleEnvironmentWorld — full environment composition proof', () => {
  it('adds a sky dome, water surface, tree field, and ground clutter to the scene', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    const handles = buildExampleEnvironmentWorld(THREE, scene, camera);
    expect(scene.children).toContain(handles.environment.skyDome);
    expect(scene.children).toContain(handles.water.mesh);
    expect(scene.children).toContain(handles.trees.group);
    expect(scene.children).toContain(handles.groundClutter.group);
    expect(scene.fog).not.toBeNull();
  });

  it('the sun light placed matches the environment-computed SunState (no duplicated lighting decision)', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    const handles = buildExampleEnvironmentWorld(THREE, scene, camera);
    const sun = scene.children.find((c) => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    expect(sun).toBeDefined();
    expect(sun.color.getHex()).toBe(new THREE.Color(handles.environment.sunState!.color).getHex());
  });

  it('update(dt) animates the water without throwing', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    const handles = buildExampleEnvironmentWorld(THREE, scene, camera);
    const before = handles.water.material.normalMap!.offset.clone();
    handles.update(1);
    expect(handles.water.material.normalMap!.offset.equals(before)).toBe(false);
  });

  it('the interaction layer resolves a raycast on the sensor entity back to its WorldFrame id', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    camera.position.set(0, 0.6, 5);
    camera.lookAt(0, 0.6, 0);
    camera.updateMatrixWorld(true);
    const handles = buildExampleEnvironmentWorld(THREE, scene, camera);
    handles.renderer.sync(handles.buildFrameAt(0));
    // Outside a real render loop nothing calls updateMatrixWorld() automatically (WebGLRenderer.
    // render() normally does this before every frame) — do it explicitly so the raycast below sees
    // the sensor mesh's REAL world position, not a stale identity transform.
    scene.updateMatrixWorld(true);

    handles.interaction.pointerDown(50, 50);
    handles.interaction.pointerUp(50, 50, 100, 100); // dead-center of a 100x100 viewport -> hits the sensor sphere
    expect(handles.interaction.selected).toBe('sensor');
  });

  it('dispose() removes everything this example added, cleanly', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    const handles = buildExampleEnvironmentWorld(THREE, scene, camera);
    handles.renderer.sync(handles.buildFrameAt(0));
    expect(scene.children.length).toBeGreaterThan(0);
    handles.dispose();
    // Only the sun light (created via createSunLight, owned by the caller in a real integration,
    // not this example's own dispose) and its target remain — everything this module itself
    // added (sky, water, vegetation, WorldFrame entities) is gone.
    expect(scene.children).not.toContain(handles.water.mesh);
    expect(scene.children).not.toContain(handles.trees.group);
    expect(scene.children).not.toContain(handles.groundClutter.group);
  });
});
