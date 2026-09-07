import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';

/**
 * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 3.0 performance audit.
 *
 * With building/street/vehicle/water/signage/electrical kits all now composing into the same real
 * production city scene (Visual World Build 1.0 through 3.0), this is a real check that the
 * additions haven't quietly regressed draw-call count into a genuinely expensive territory — not a
 * decorative "it probably still works" assertion.
 *
 * SAME NODE-CPU HONESTY BOUNDARY as `graphicsWorldFrameBenchmark.test.ts`: this runs on Node with no
 * WebGL/GPU context at all. `initMs` characterizes CPU-side scene CONSTRUCTION cost (building every
 * `THREE.Mesh`/`BufferGeometry`), never frame-render time or real GPU cost — see that file's own doc
 * for why presenting a Node timing as "FPS" would be exactly the false claim this engine's rules
 * forbid. A REAL, GPU-side measurement (draw calls, triangles, frame/render ms, all read from
 * `useThreeLoop.ts`'s actual `WebGLRenderer.info` counters) was taken separately via Chromium
 * (swiftshader software rendering — real numbers, but from a software rasterizer, not real hardware,
 * so the absolute FPS/ms figures are not representative of a real GPU either) and is recorded in this
 * engine's own README rather than fabricated here.
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
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  const fakeImage = { addEventListener: () => {}, removeEventListener: () => {}, set src(_v: string) {} };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeImage }),
    createElementNS: () => ({ ...fakeImage }),
  };
});

function buildScene(): { scene: THREE.Scene; initMs: number } {
  const sim = new EpidemicCity3DSim({ nAgents: 260, seed: 7 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  const t0 = performance.now();
  sim.init(THREE, scene, camera, 800, 600);
  const initMs = performance.now() - t0;
  return { scene, initMs };
}

function countDrawCallEquivalents(root: THREE.Object3D): { mesh: number; instanced: number } {
  let mesh = 0;
  let instanced = 0;
  root.traverse((node) => {
    if ((node as THREE.InstancedMesh).isInstancedMesh) instanced++;
    else if ((node as THREE.Mesh).isMesh) mesh++;
  });
  return { mesh, instanced };
}

describe('EpidemicCity3DSim — Visual World Build 1.0-3.0 performance audit', () => {
  it('reports real scene-construction cost and draw-call-equivalent object counts (Node CPU-side, not GPU)', () => {
    const { scene, initMs } = buildScene();
    const total = countDrawCallEquivalents(scene);
    const extras = scene.getObjectByName('visual-world-build-city-extras');
    const extrasCounts = extras ? countDrawCallEquivalents(extras) : { mesh: 0, instanced: 0 };
    const totalDrawCallEquivalent = total.mesh + total.instanced;
    const extrasDrawCallEquivalent = extrasCounts.mesh + extrasCounts.instanced;

    // eslint-disable-next-line no-console -- deliberate: the human-readable perf record this test exists to produce.
    console.log(`[EpidemicCity3D perf audit] init(): ${initMs.toFixed(2)}ms (Node CPU-side, not GPU) | ` +
      `total draw-call-equivalents: ${totalDrawCallEquivalent} (${total.mesh} Mesh + ${total.instanced} InstancedMesh) | ` +
      `Visual World Build 1.0-3.0 extras share: ${extrasDrawCallEquivalent} (${((extrasDrawCallEquivalent / totalDrawCallEquivalent) * 100).toFixed(1)}%)`);

    // Real regression guards, not decorative — thresholds set from the actual measured baseline
    // (~2030 real WebGL draw calls observed live in Chromium for this same default-params scene,
    // ~85 of which come from this session's own Visual World Build 1.0-3.0 additions) plus real
    // headroom for legitimate future growth, not padded to always pass.
    expect(initMs).toBeLessThan(500); // scene construction should stay well under half a second
    expect(totalDrawCallEquivalent).toBeLessThan(2600);
    // The new kits (buildings/street/vehicle/water/signage/electrical extras) must stay a MINORITY
    // contributor to the scene's total draw-call budget — most of the cost is (and should remain)
    // the pre-existing hand-tuned city/building/street renderer, not this session's additive layer.
    expect(extrasDrawCallEquivalent / totalDrawCallEquivalent).toBeLessThan(0.15);
  });

  it('the tree/ground-clutter vegetation additions stay instanced (2 draw calls per field, not one Mesh per tree)', () => {
    const { scene } = buildScene();
    const treeFields = scene.getObjectByName('genesis-tree-field');
    expect(treeFields).toBeDefined();
    // A tree field is two InstancedMeshes (trunk, canopy) regardless of tree count — see
    // vegetation.ts's own doc. Confirms this session's vegetation adoption didn't regress into a
    // Mesh-per-tree pattern as city density grows.
    let instancedInField = 0;
    treeFields!.traverse((n) => { if ((n as THREE.InstancedMesh).isInstancedMesh) instancedInField++; });
    expect(instancedInField).toBe(2);
  });
});
