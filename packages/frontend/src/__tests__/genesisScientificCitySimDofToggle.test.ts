import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';

/**
 * C2 FULL VISUAL TAKEOVER — closes a real bug the audit found: `genesisScientificCitySim.ts` built
 * its Bokeh (DOF) pass unconditionally enabled, and only re-toggled it on a LATER profile change —
 * meaning the entire wide establishing shot (which `cinematicCamera.ts`'s own profile table says
 * should be sharp end-to-end) rendered blurred relative to a single hero-distance focus plane. This
 * test proves DOF starts OFF at the wide establishing profile and turns ON only once the camera has
 * actually arrived at the hero standoff — a screenshot alone can't distinguish "blurred because DOF
 * is on" from "sharp because the composer just hasn't rendered yet," so this asserts the pass's own
 * `enabled` flag directly, the same style `genesisScientificCitySimPostProcessing.test.ts` uses for SSR.
 */

vi.mock('../core/three/quality', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/three/quality')>();
  return { ...actual, detectRenderTier: vi.fn(() => 'high') };
});

import * as THREE from 'three';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';
import { detectRenderTier } from '../core/three/quality';
import type { PostProcessingModules } from '../core/three/types';

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

beforeEach(() => {
  vi.mocked(detectRenderTier).mockReturnValue('high');
});

function fakeModules() {
  const bokehInstances: Array<{ enabled: boolean; uniforms: { focus: { value: number } }; dispose: ReturnType<typeof vi.fn> }> = [];
  class EffectComposer { addPass = vi.fn(); render = vi.fn(); setSize = vi.fn(); dispose = vi.fn(); }
  class RenderPass { constructor() {} }
  class GTAOPass { updateGtaoMaterial = vi.fn(); blendIntensity = 1; dispose = vi.fn(); constructor() {} }
  class UnrealBloomPass { dispose = vi.fn(); constructor() {} }
  class SSRPass { opacity = 0; maxDistance = 0; dispose = vi.fn(); constructor() {} }
  class BokehPass {
    uniforms = { focus: { value: 0 }, aperture: { value: 0 }, maxblur: { value: 0 } };
    enabled = true;
    dispose = vi.fn();
    constructor(_scene: unknown, _camera: unknown, params: { focus: number }) {
      this.uniforms.focus.value = params.focus;
      bokehInstances.push(this);
    }
  }
  class OutputPass { dispose = vi.fn(); constructor() {} }
  const modules = { EffectComposer, RenderPass, GTAOPass, UnrealBloomPass, BokehPass, OutputPass, SSRPass } as unknown as PostProcessingModules;
  return { modules, bokehInstances };
}

function fakeRenderer() {
  return {
    shadowMap: { enabled: false, type: null as unknown },
    toneMapping: null as unknown,
    toneMappingExposure: 1,
    outputColorSpace: null as unknown,
  } as unknown as import('three').WebGLRenderer;
}

describe('GenesisScientificCitySim — DOF matches the live cinematic profile, not unconditionally on', () => {
  it('builds the DOF pass DISABLED when setupPostProcessing runs at the wide establishing profile (init()s own default)', () => {
    const sim = new GenesisScientificCitySim();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 500);
    sim.init(THREE, scene, camera, 1280, 800);
    expect((sim as unknown as { appliedCinematicProfile: string }).appliedCinematicProfile).toBe('WIDE_ESTABLISHING');

    const { modules, bokehInstances } = fakeModules();
    sim.setupPostProcessing(modules, fakeRenderer(), scene, camera, 1280, 800);
    expect(bokehInstances).toHaveLength(1);
    expect(bokehInstances[0]!.enabled).toBe(false);
  });

  it('turns DOF ON once the camera actually arrives at the hero standoff, via the SAME profile-change path that swaps the lens', () => {
    const sim = new GenesisScientificCitySim();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 500);
    sim.init(THREE, scene, camera, 1280, 800);

    const { modules, bokehInstances } = fakeModules();
    sim.setupPostProcessing(modules, fakeRenderer(), scene, camera, 1280, 800);
    expect(bokehInstances[0]!.enabled).toBe(false);

    const target = sim.getOrbitTarget()!;
    const standoff = sim.getOrbitFocusDistance()!;
    const direction = new THREE.Vector3(1, 0.72, 1).normalize();
    camera.position.copy(target).addScaledVector(direction, standoff);
    camera.lookAt(target);

    sim.syncScene(scene, camera);
    expect(camera.fov).toBeCloseTo(40, 5); // confirms the SAME profile change this test cares about actually fired
    expect(bokehInstances[0]!.enabled).toBe(true);
  });

  it('stays OFF while still far from the target (mid push-in, still the wide establishing shot)', () => {
    const sim = new GenesisScientificCitySim();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 500);
    sim.init(THREE, scene, camera, 1280, 800);

    const { modules, bokehInstances } = fakeModules();
    sim.setupPostProcessing(modules, fakeRenderer(), scene, camera, 1280, 800);

    const target = sim.getOrbitTarget()!;
    const standoff = sim.getOrbitFocusDistance()!;
    const direction = new THREE.Vector3(1, 0.72, 1).normalize();
    camera.position.copy(target).addScaledVector(direction, standoff * 3);
    camera.lookAt(target);

    sim.syncScene(scene, camera);
    expect(camera.fov).toBeCloseTo(68, 5);
    expect(bokehInstances[0]!.enabled).toBe(false);
  });
});
