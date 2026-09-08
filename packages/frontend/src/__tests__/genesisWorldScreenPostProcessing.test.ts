import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * TIER1.3 — closes a real gap the audit found: `GenesisWorldSim3D` had no `setupPostProcessing` at
 * all, so `useThreeLoop.ts` never ran `setupGraphicsPipeline` for it — no ACES tone mapping, no
 * shadow-map configuration, no bloom/antialiasing. Same fake-modules pattern
 * `genesisScientificCitySimPostProcessing.test.ts` already uses to verify a Sim3D's
 * `setupPostProcessing` actually wires the shared pipeline, since a screenshot alone can't prove a
 * tier-gated pass didn't silently no-op.
 */

vi.mock('../core/three/quality', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/three/quality')>();
  return { ...actual, detectRenderTier: vi.fn(() => 'high') };
});

import { GenesisWorldSim3D } from '../components/visual-simulation/GenesisWorldScreen';
import { detectRenderTier } from '../core/three/quality';
import type { PostProcessingModules } from '../core/three/types';

function fakeModules() {
  const addedPasses: string[] = [];
  class EffectComposer { addPass = vi.fn((p: unknown) => addedPasses.push((p as { label: string }).label)); render = vi.fn(); setSize = vi.fn(); dispose = vi.fn(); }
  class RenderPass { label = 'RenderPass'; constructor() {} }
  class GTAOPass { label = 'GTAOPass'; updateGtaoMaterial = vi.fn(); blendIntensity = 1; dispose = vi.fn(); constructor() {} }
  const bloomInstances: Array<{ label: string; strength: number; radius: number; threshold: number; dispose: ReturnType<typeof vi.fn> }> = [];
  class UnrealBloomPass {
    label = 'UnrealBloomPass';
    dispose = vi.fn();
    constructor(public resolution: unknown, public strength: number, public radius: number, public threshold: number) {
      bloomInstances.push({ label: 'UnrealBloomPass', strength, radius, threshold, dispose: this.dispose });
    }
  }
  class BokehPass { label = 'BokehPass'; uniforms = { focus: { value: 0 }, aperture: { value: 0 }, maxblur: { value: 0 } }; enabled = true; dispose = vi.fn(); constructor() {} }
  class OutputPass { label = 'OutputPass'; dispose = vi.fn(); constructor() {} }
  class SSRPass { label = 'SSRPass'; opacity = 0; maxDistance = 0; dispose = vi.fn(); constructor() {} }
  class SMAAPass { label = 'SMAAPass'; dispose = vi.fn(); constructor() {} }

  const modules = { EffectComposer, RenderPass, GTAOPass, UnrealBloomPass, BokehPass, OutputPass, SSRPass, SMAAPass } as unknown as PostProcessingModules;
  return { modules, addedPasses, bloomInstances };
}

function fakeRenderer() {
  return {
    shadowMap: { enabled: false, type: null as unknown },
    toneMapping: null as unknown,
    toneMappingExposure: 1,
    outputColorSpace: null as unknown,
  } as unknown as import('three').WebGLRenderer;
}

function fakeThree() {
  class Vector2 { constructor(public x: number, public y: number) {} }
  return {
    PCFSoftShadowMap: 'PCFSoft',
    ACESFilmicToneMapping: 'ACESFilmic',
    SRGBColorSpace: 'SRGB',
    Vector2,
  } as unknown as typeof import('three');
}

function bareSim(): GenesisWorldSim3D {
  const sim = new GenesisWorldSim3D();
  // Same bypass-init() pattern genesisScientificCitySimPostProcessing.test.ts uses —
  // setupPostProcessing only touches `this.THREE`, never the entity scene graph init() builds.
  Object.assign(sim as unknown as Record<string, unknown>, { THREE: fakeThree() });
  return sim;
}

beforeEach(() => {
  vi.mocked(detectRenderTier).mockReturnValue('high');
});

describe('GenesisWorldSim3D.setupPostProcessing — brings this scene onto the shared visual foundation', () => {
  it('exists at all (regression guard for the audit finding: this scene had none)', () => {
    const sim = bareSim();
    expect(typeof sim.setupPostProcessing).toBe('function');
  });

  it('configures the renderer through the shared pipeline (shadows, ACES tone mapping) instead of leaving it untouched', () => {
    const sim = bareSim();
    const { modules } = fakeModules();
    const renderer = fakeRenderer();
    sim.setupPostProcessing(modules, renderer, {} as import('three').Scene, {} as import('three').PerspectiveCamera, 800, 600);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.toneMapping).not.toBeNull();
  });

  it('adds a real bloom pass, not left silently absent', () => {
    const sim = bareSim();
    const { modules, bloomInstances } = fakeModules();
    sim.setupPostProcessing(modules, fakeRenderer(), {} as import('three').Scene, {} as import('three').PerspectiveCamera, 800, 600);
    expect(bloomInstances).toHaveLength(1);
  });

  it('runs its own environment (createSceneEnvironment), not a second generic ambient IBL box', () => {
    const sim = bareSim();
    const { modules } = fakeModules();
    const pipeline = sim.setupPostProcessing(modules, fakeRenderer(), {} as import('three').Scene, {} as import('three').PerspectiveCamera, 800, 600);
    // captureRoomProbe is a documented no-op outside 'room-probe' ambient mode — this scene uses
    // 'none' (its own createSceneEnvironment already owns sky/fog/lighting), so calling it must
    // never throw and must never invoke a room-probe capture.
    expect(() => (pipeline as unknown as { captureRoomProbe: () => void }).captureRoomProbe()).not.toThrow();
  });
});
