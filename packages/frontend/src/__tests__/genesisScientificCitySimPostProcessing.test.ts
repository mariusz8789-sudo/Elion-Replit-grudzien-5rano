import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * WOW SPRINT — verifies `GenesisScientificCitySim.setupPostProcessing` actually turns SSR on for
 * the flagship flood scene, the same fake-modules/mocked-tier pattern `graphicsPostProcessing.test.ts`
 * already uses for `setupGraphicsPipeline` itself. This is the ONE thing a screenshot can't prove
 * reliably (the headless-Chromium test environment's `hardwareConcurrency` can land `detectRenderTier()`
 * on `'medium'`, silently no-opping the pass without an assertion ever failing) — see the WOW SPRINT
 * comment at the `reflections:` call site in `genesisScientificCitySim.ts`.
 */

vi.mock('../core/three/graphics/lighting', () => ({
  applyStudioEnvironment: vi.fn(),
  loadHdriEnvironment: vi.fn(async () => {}),
  applyAmbientIBL: vi.fn(),
  captureRoomEnvironment: vi.fn(),
}));

vi.mock('../core/three/quality', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/three/quality')>();
  return { ...actual, detectRenderTier: vi.fn(() => 'high') };
});

import * as THREE from 'three';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';
import { detectRenderTier } from '../core/three/quality';
import type { PostProcessingModules } from '../core/three/types';

type PassLabel = 'RenderPass' | 'GTAOPass' | 'SSRPass' | 'UnrealBloomPass' | 'BokehPass' | 'OutputPass';

function fakeModules() {
  const addedPasses: PassLabel[] = [];
  const ssrInstances: Array<{ opacity: number; maxDistance: number; params: unknown }> = [];
  const composerCalls = { render: vi.fn(), setSize: vi.fn(), dispose: vi.fn(), addPass: vi.fn() };

  class EffectComposer {
    addPass = composerCalls.addPass;
    render = composerCalls.render;
    setSize = composerCalls.setSize;
    dispose = composerCalls.dispose;
  }
  class RenderPass { constructor() { addedPasses.push('RenderPass'); } }
  class GTAOPass {
    updateGtaoMaterial = vi.fn();
    blendIntensity = 1;
    dispose = vi.fn();
    constructor() { addedPasses.push('GTAOPass'); }
  }
  class UnrealBloomPass {
    dispose = vi.fn();
    constructor() { addedPasses.push('UnrealBloomPass'); }
  }
  class BokehPass {
    uniforms = { focus: { value: 0 }, aperture: { value: 0 }, maxblur: { value: 0 } };
    enabled = true;
    dispose = vi.fn();
    constructor(_scene: unknown, _camera: unknown, params: { focus: number; aperture: number; maxblur: number }) {
      addedPasses.push('BokehPass');
      this.uniforms.focus.value = params.focus;
    }
  }
  class OutputPass {
    dispose = vi.fn();
    constructor() { addedPasses.push('OutputPass'); }
  }
  class SSRPass {
    opacity = 0;
    maxDistance = 0;
    dispose = vi.fn();
    constructor(public params: unknown) {
      addedPasses.push('SSRPass');
      ssrInstances.push(this);
    }
  }

  const modules = { EffectComposer, RenderPass, GTAOPass, UnrealBloomPass, BokehPass, OutputPass, SSRPass } as unknown as PostProcessingModules;
  return { modules, addedPasses, ssrInstances };
}

function fakeRenderer() {
  return {
    shadowMap: { enabled: false, type: null as unknown },
    toneMapping: null as unknown,
    toneMappingExposure: 1,
    outputColorSpace: null as unknown,
  } as unknown as import('three').WebGLRenderer;
}

/** Same bypass-`init()` pattern `genesisScientificCitySim.test.ts` already uses — `setupPostProcessing`
 * only touches `this.THREE`/`this.focusPuller` (optional), never the textured scene graph `init()` builds. */
function initializedSim(): GenesisScientificCitySim {
  const sim = new GenesisScientificCitySim();
  Object.assign(sim as unknown as Record<string, unknown>, { THREE });
  return sim;
}

beforeEach(() => {
  vi.mocked(detectRenderTier).mockReturnValue('high');
});

describe('GenesisScientificCitySim.setupPostProcessing — flagship flood scene reflections', () => {
  it('turns on SSR (not left at the library default of off)', () => {
    const sim = initializedSim();
    const { modules, addedPasses, ssrInstances } = fakeModules();
    sim.setupPostProcessing(modules, fakeRenderer(), {} as import('three').Scene, {} as import('three').PerspectiveCamera, 800, 600);
    expect(addedPasses).toContain('SSRPass');
    expect(ssrInstances).toHaveLength(1);
  });

  it('uses a real, in-range strength/maxDistance — not the settings-shape default tuned for a room-scale facility', () => {
    const sim = initializedSim();
    const { modules, ssrInstances } = fakeModules();
    sim.setupPostProcessing(modules, fakeRenderer(), {} as import('three').Scene, {} as import('three').PerspectiveCamera, 800, 600);
    const ssr = ssrInstances[0]!;
    expect(ssr.opacity).toBeGreaterThan(0);
    expect(ssr.opacity).toBeLessThanOrEqual(1);
    // Room-scale default (6) would be far too short a ray march for this city's ~150-unit road grid.
    expect(ssr.maxDistance).toBeGreaterThan(6);
  });

  it('still respects the tier gate — no SSR at a tier below what this scene requests', () => {
    vi.mocked(detectRenderTier).mockReturnValue('medium');
    const sim = initializedSim();
    const { modules, addedPasses } = fakeModules();
    sim.setupPostProcessing(modules, fakeRenderer(), {} as import('three').Scene, {} as import('three').PerspectiveCamera, 800, 600);
    expect(addedPasses).not.toContain('SSRPass');
  });

  it('keeps every other pass in its established order alongside the new SSR pass', () => {
    const sim = initializedSim();
    const { modules, addedPasses } = fakeModules();
    sim.setupPostProcessing(modules, fakeRenderer(), {} as import('three').Scene, {} as import('three').PerspectiveCamera, 800, 600);
    expect(addedPasses).toEqual(['RenderPass', 'GTAOPass', 'SSRPass', 'UnrealBloomPass', 'BokehPass', 'OutputPass']);
  });
});
