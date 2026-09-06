import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * GENESIS GRAPHICS RUNTIME — pipeline order/config tests.
 *
 * These tests never touch WebGL: every postprocessing class is a fake spy
 * recording what `setupGraphicsPipeline` does with it, and `../quality`'s
 * `detectRenderTier` is mocked so each tier can be exercised deterministically
 * without depending on `window`/`navigator` heuristics. `./lighting` is
 * mocked out too — its own environment/IBL logic needs a real WebGLRenderer
 * (PMREMGenerator) and is out of scope here; this file only verifies the
 * EffectComposer wiring: pass order, tier gating, renderer flags, and the
 * DOF enable/disable/focus-retune API.
 */

vi.mock('../core/three/graphics/lighting', () => ({
  applyStudioEnvironment: vi.fn(),
  loadHdriEnvironment: vi.fn(async () => {}),
  applyAmbientIBL: vi.fn(),
}));

vi.mock('../core/three/quality', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/three/quality')>();
  return { ...actual, detectRenderTier: vi.fn(() => 'high') };
});

import { setupGraphicsPipeline, resolveBokehUniforms, type DepthOfFieldSettings } from '../core/three/graphics/postProcessing';
import { detectRenderTier } from '../core/three/quality';
import type { PostProcessingModules } from '../core/three/types';

type PassLabel = 'RenderPass' | 'GTAOPass' | 'UnrealBloomPass' | 'BokehPass' | 'OutputPass';

function fakeThree() {
  class Vector2 { constructor(public x: number, public y: number) {} }
  return {
    PCFSoftShadowMap: 'PCFSoft',
    ACESFilmicToneMapping: 'ACESFilmic',
    SRGBColorSpace: 'SRGB',
    Vector2,
  } as unknown as typeof import('three');
}

function fakeModules() {
  const addedPasses: PassLabel[] = [];
  const gtaoInstances: Array<{ updateGtaoMaterial: ReturnType<typeof vi.fn>; blendIntensity: number; dispose: ReturnType<typeof vi.fn> }> = [];
  const bokehInstances: Array<{ ctorArgs: unknown[]; uniforms: { focus: { value: number }; aperture: { value: number }; maxblur: { value: number } } }> = [];
  const composerCalls = { render: vi.fn(), setSize: vi.fn(), dispose: vi.fn(), addPass: vi.fn() };

  class EffectComposer {
    addPass = composerCalls.addPass;
    render = composerCalls.render;
    setSize = composerCalls.setSize;
    dispose = composerCalls.dispose;
  }
  class RenderPass { constructor(public scene: unknown, public camera: unknown) { addedPasses.push('RenderPass'); } }
  class GTAOPass {
    updateGtaoMaterial = vi.fn();
    blendIntensity = 1;
    dispose = vi.fn();
    constructor(public scene: unknown, public camera: unknown, public width: number, public height: number) {
      addedPasses.push('GTAOPass');
      gtaoInstances.push(this);
    }
  }
  class UnrealBloomPass { constructor(public resolution: unknown, public strength: number, public radius: number, public threshold: number) { addedPasses.push('UnrealBloomPass'); } }
  class BokehPass {
    uniforms = { focus: { value: 0 }, aperture: { value: 0 }, maxblur: { value: 0 } };
    constructor(public scene: unknown, public camera: unknown, params: { focus: number; aperture: number; maxblur: number }) {
      addedPasses.push('BokehPass');
      this.uniforms.focus.value = params.focus;
      this.uniforms.aperture.value = params.aperture;
      this.uniforms.maxblur.value = params.maxblur;
      bokehInstances.push({ ctorArgs: [scene, camera, params], uniforms: this.uniforms });
    }
  }
  class OutputPass { constructor() { addedPasses.push('OutputPass'); } }

  const modules = { EffectComposer, RenderPass, GTAOPass, UnrealBloomPass, BokehPass, OutputPass } as unknown as PostProcessingModules;
  return { modules, addedPasses, gtaoInstances, bokehInstances, composerCalls };
}

function fakeRenderer() {
  return {
    shadowMap: { enabled: false, type: null as unknown },
    toneMapping: null as unknown,
    toneMappingExposure: 1,
    outputColorSpace: null as unknown,
  } as unknown as import('three').WebGLRenderer;
}

const baseOpts = {
  scene: {} as import('three').Scene,
  camera: {} as import('three').PerspectiveCamera,
  width: 800,
  height: 600,
};

// Every test defaults to the 'high' tier unless it explicitly overrides — without this, a tier
// mocked to 'low'/'medium' in one describe block would otherwise leak into later, unrelated tests.
beforeEach(() => {
  vi.mocked(detectRenderTier).mockReturnValue('high');
});

describe('setupGraphicsPipeline — renderer configuration', () => {
  it('sets shadow map, tone mapping and color space exactly once, with no accidental exposure regression', () => {
    const { modules } = fakeModules();
    const renderer = fakeRenderer();
    setupGraphicsPipeline(fakeThree(), modules, renderer, baseOpts);

    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe('PCFSoft');
    expect(renderer.toneMapping).toBe('ACESFilmic');
    expect(renderer.outputColorSpace).toBe('SRGB');
    // Default exposure preserved when the caller doesn't override it — regression guard for the
    // "ciemniejsze tło + jaśniejsze źródła" tuning the lab relies on.
    expect(renderer.toneMappingExposure).toBe(1.05);
  });

  it('honors an explicit toneMappingExposure override', () => {
    const { modules } = fakeModules();
    const renderer = fakeRenderer();
    setupGraphicsPipeline(fakeThree(), modules, renderer, { ...baseOpts, toneMappingExposure: 1.3 });
    expect(renderer.toneMappingExposure).toBe(1.3);
  });
});

describe('setupGraphicsPipeline — canonical pass order', () => {
  it('always renders RenderPass first and OutputPass last, with tone mapping/color-space work living only in OutputPass territory', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);

    expect(addedPasses[0]).toBe('RenderPass');
    expect(addedPasses[addedPasses.length - 1]).toBe('OutputPass');
    // AO must run before bloom: it darkens occluded creases in the same linear-HDR buffer bloom
    // then blooms from — running it after bloom would occlude already-bloomed light, not the
    // scene's actual geometry.
    expect(addedPasses.indexOf('GTAOPass')).toBeLessThan(addedPasses.indexOf('UnrealBloomPass'));
    // Only one OutputPass — the single point where tone mapping + color-space conversion happen;
    // duplicating this pass (or re-adding RenderPass) would double-apply both.
    expect(addedPasses.filter((p) => p === 'OutputPass')).toHaveLength(1);
    expect(addedPasses.filter((p) => p === 'RenderPass')).toHaveLength(1);
  });

  it('places DOF after bloom when enabled, so bokeh blurs already-bloomed highlights', () => {
    const { modules, addedPasses } = fakeModules();
    const depthOfField: DepthOfFieldSettings = { enabled: true, focusDistance: 2.5 };
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, depthOfField });

    expect(addedPasses).toEqual(['RenderPass', 'GTAOPass', 'UnrealBloomPass', 'BokehPass', 'OutputPass']);
  });
});

describe('setupGraphicsPipeline — quality-tier gating', () => {
  it('includes AO and bloom, and allows DOF, at the "high" tier', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, depthOfField: { enabled: true, focusDistance: 3 } });
    expect(addedPasses).toContain('GTAOPass');
    expect(addedPasses).toContain('UnrealBloomPass');
    expect(addedPasses).toContain('BokehPass');
  });

  it('drops AO and DOF, but keeps bloom, at the "medium" tier', () => {
    vi.mocked(detectRenderTier).mockReturnValue('medium');
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, depthOfField: { enabled: true, focusDistance: 3 } });
    expect(addedPasses).not.toContain('GTAOPass');
    expect(addedPasses).not.toContain('BokehPass');
    expect(addedPasses).toContain('UnrealBloomPass');
  });

  it('drops AO, bloom and DOF at the "low" tier — only RenderPass and OutputPass remain', () => {
    vi.mocked(detectRenderTier).mockReturnValue('low');
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, depthOfField: { enabled: true, focusDistance: 3 } });
    expect(addedPasses).toEqual(['RenderPass', 'OutputPass']);
  });

  it('lets a caller loosen DOF down to "medium" via minTier without affecting AO', () => {
    vi.mocked(detectRenderTier).mockReturnValue('medium');
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts,
      depthOfField: { enabled: true, focusDistance: 3, minTier: 'medium' },
    });
    expect(addedPasses).toContain('BokehPass');
    expect(addedPasses).not.toContain('GTAOPass');
  });
});

describe('setupGraphicsPipeline — DOF default-off regression guard', () => {
  it('adds no BokehPass when depthOfField is omitted entirely', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);
    expect(addedPasses).not.toContain('BokehPass');
  });

  it('adds no BokehPass when depthOfField.enabled is false', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, depthOfField: { enabled: false, focusDistance: 3 } });
    expect(addedPasses).not.toContain('BokehPass');
  });

  it('setFocusDistance is a safe no-op when DOF was never enabled', () => {
    const { modules } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);
    expect(() => pipeline.setFocusDistance(5)).not.toThrow();
  });
});

describe('setupGraphicsPipeline — DOF uniform resolution', () => {
  it('constructs BokehPass with resolveBokehUniforms output', () => {
    const { modules, bokehInstances } = fakeModules();
    const depthOfField: DepthOfFieldSettings = { enabled: true, focusDistance: 4.2, blurStrength: 0.7 };
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, depthOfField });

    const expected = resolveBokehUniforms(depthOfField);
    expect(bokehInstances).toHaveLength(1);
    expect(bokehInstances[0]!.uniforms.focus.value).toBeCloseTo(expected.focus);
    expect(bokehInstances[0]!.uniforms.aperture.value).toBeCloseTo(expected.aperture);
    expect(bokehInstances[0]!.uniforms.maxblur.value).toBeCloseTo(expected.maxblur);
  });

  it('retunes focus at runtime via GraphicsPipeline.setFocusDistance', () => {
    const { modules, bokehInstances } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts,
      depthOfField: { enabled: true, focusDistance: 2 },
    });
    pipeline.setFocusDistance(9);
    expect(bokehInstances[0]!.uniforms.focus.value).toBe(9);
  });

  it('blurStrength 0 and 1 stay within BokehPass\'s subtle-to-strong design range', () => {
    const subtle = resolveBokehUniforms({ focusDistance: 1, blurStrength: 0 });
    const strong = resolveBokehUniforms({ focusDistance: 1, blurStrength: 1 });
    expect(subtle.aperture).toBeLessThan(strong.aperture);
    expect(subtle.maxblur).toBeLessThan(strong.maxblur);
  });

  it('explicit aperture/maxBlur override the blurStrength mapping', () => {
    const resolved = resolveBokehUniforms({ focusDistance: 1, blurStrength: 1, aperture: 0.001, maxBlur: 0.001 });
    expect(resolved.aperture).toBe(0.001);
    expect(resolved.maxblur).toBe(0.001);
  });
});

describe('setupGraphicsPipeline — dispose', () => {
  it('disposes both the GTAO pass and the composer', () => {
    vi.mocked(detectRenderTier).mockReturnValue('high');
    const { modules, gtaoInstances, composerCalls } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);
    pipeline.dispose?.();
    expect(gtaoInstances[0]!.dispose).toHaveBeenCalledOnce();
    expect(composerCalls.dispose).toHaveBeenCalledOnce();
  });
});
