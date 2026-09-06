import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { LabScene3D } from '../core/three/labScene3D';

/**
 * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 1.0 quality gate: proves `graphics/labKit.ts` and
 * `graphics/waterInfrastructure.ts` are ACTUALLY INSTANTIATED by the real production lab scene's
 * `init()`, not just proven in their own isolated example files. Same canvas/document stub
 * convention as `epidemicCity3DExtras.test.ts`/`graphicsWorldEnvironmentExample.test.ts` — `init()`
 * builds a plain THREE object graph (no real `WebGLRenderer`), so this runs fine in Node once
 * `document` (procedural canvas textures) is stubbed.
 */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {}, fill: () => {},
    roundRect: (() => {}) as unknown as CanvasRenderingContext2D['roundRect'],
    measureText: () => ({ width: 40 }) as TextMetrics,
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas: { width: number; height: number; getContext: () => CanvasRenderingContext2D } = {
    width: 256, height: 256, getContext: () => fakeContext as CanvasRenderingContext2D,
  };
  (fakeContext as unknown as { canvas: typeof fakeCanvas }).canvas = fakeCanvas;
  const fakeImage = { addEventListener: () => {}, removeEventListener: () => {}, set src(_v: string) {} };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeImage }),
    createElementNS: () => ({ ...fakeImage }),
  };
});

function buildInitializedScene(): { sim: LabScene3D; scene: THREE.Scene } {
  const sim = new LabScene3D();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  sim.init(THREE, scene, camera);
  return { sim, scene };
}

function namesOf(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((node) => { if (node.name) names.push(node.name); });
  return names;
}

describe('LabScene3D — Visual World Build 1.0 kits are real in the production scene', () => {
  it('the real lab scene builds the labKit furniture cluster (bench/cabinet/shelf/monitor)', () => {
    const { scene } = buildInitializedScene();
    const names = namesOf(scene);
    expect(names).toContain('genesis-lab-bench');
    expect(names).toContain('genesis-lab-cabinet');
    expect(names).toContain('genesis-lab-shelf-unit');
    expect(names).toContain('genesis-lab-monitor');
  });

  it('the real lab scene builds the water-infrastructure cluster (pump/valve/pipe run)', () => {
    const { scene } = buildInitializedScene();
    const names = namesOf(scene);
    expect(names).toContain('genesis-water-pump');
    expect(names).toContain('genesis-water-valve');
    expect(names).toContain('genesis-water-pipe-network');
  });

  it('the pump defaults to NORMAL — never fabricates a WARNING/FAILED state with no real feed', () => {
    const { scene } = buildInitializedScene();
    let pumpLight: THREE.Mesh | null = null;
    const pump = scene.getObjectByName('genesis-water-pump')!;
    pump.traverse((node) => {
      if (node instanceof THREE.Mesh && node.geometry instanceof THREE.SphereGeometry) pumpLight = node;
    });
    expect(pumpLight).not.toBeNull();
    const material = (pumpLight as unknown as THREE.Mesh).material as THREE.MeshStandardMaterial;
    // NORMAL preset emissiveIntensity from visualState.ts (0.22, no pulse boost).
    expect(material.emissiveIntensity).toBeCloseTo(0.22, 5);
  });

  it('dispose() releases the new furniture/infrastructure geometry along with the rest of the scene', () => {
    const { sim, scene } = buildInitializedScene();
    const bench = scene.getObjectByName('genesis-lab-bench')!;
    let firstMesh: THREE.Mesh | null = null;
    bench.traverse((node) => { if (!firstMesh && node instanceof THREE.Mesh) firstMesh = node; });
    expect(firstMesh).not.toBeNull();
    const geometry = (firstMesh as unknown as THREE.Mesh).geometry;
    const realDispose = geometry.dispose.bind(geometry);
    let disposed = false;
    geometry.dispose = () => { disposed = true; realDispose(); };
    expect(() => sim.dispose?.()).not.toThrow();
    expect(disposed).toBe(true);
  });
});
