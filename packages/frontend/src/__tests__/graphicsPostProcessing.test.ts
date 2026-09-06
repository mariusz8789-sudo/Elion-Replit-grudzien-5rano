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
  captureRoomEnvironment: vi.fn(),
}));

vi.mock('../core/three/quality', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/three/quality')>();
  return { ...actual, detectRenderTier: vi.fn(() => 'high') };
});

import { setupGraphicsPipeline, resolveBokehUniforms, configureDOF, type DepthOfFieldSettings } from '../core/three/graphics/postProcessing';
import { applyAmbientIBL, applyStudioEnvironment, captureRoomEnvironment } from '../core/three/graphics/lighting';
import { detectRenderTier } from '../core/three/quality';
import type { PostProcessingModules } from '../core/three/types';

type PassLabel = 'RenderPass' | 'GTAOPass' | 'SSRPass' | 'UnrealBloomPass' | 'BokehPass' | 'OutputPass';

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
  const bokehInstances: Array<{ ctorArgs: unknown[]; uniforms: { focus: { value: number }; aperture: { value: number }; maxblur: { value: number } }; instance: { enabled: boolean; dispose: ReturnType<typeof vi.fn> } }> = [];
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
  const bloomInstances: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
  class UnrealBloomPass {
    dispose = vi.fn();
    constructor(public resolution: unknown, public strength: number, public radius: number, public threshold: number) {
      addedPasses.push('UnrealBloomPass');
      bloomInstances.push(this);
    }
  }
  class BokehPass {
    uniforms = { focus: { value: 0 }, aperture: { value: 0 }, maxblur: { value: 0 } };
    enabled = true;
    dispose = vi.fn();
    constructor(public scene: unknown, public camera: unknown, params: { focus: number; aperture: number; maxblur: number }) {
      addedPasses.push('BokehPass');
      this.uniforms.focus.value = params.focus;
      this.uniforms.aperture.value = params.aperture;
      this.uniforms.maxblur.value = params.maxblur;
      bokehInstances.push({ ctorArgs: [scene, camera, params], uniforms: this.uniforms, instance: this });
    }
  }
  const outputPassInstances: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
  class OutputPass {
    dispose = vi.fn();
    constructor() {
      addedPasses.push('OutputPass');
      outputPassInstances.push(this);
    }
  }
  const ssrInstances: Array<{ opacity: number; maxDistance: number; dispose: ReturnType<typeof vi.fn> }> = [];
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
  return { modules, addedPasses, gtaoInstances, bokehInstances, bloomInstances, outputPassInstances, ssrInstances, composerCalls };
}

function fakeRenderer() {
  return {
    shadowMap: { enabled: false, type: null as unknown },
    toneMapping: null as unknown,
    toneMappingExposure: 1,
    outputColorSpace: null as unknown,
    info: {
      render: { calls: 3, triangles: 500, points: 0, lines: 0, frame: 1 },
      memory: { geometries: 2, textures: 1 },
      programs: [null, null],
    },
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

  it('setDepthOfFieldEnabled is a safe no-op when DOF was never enabled', () => {
    const { modules } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);
    expect(() => pipeline.setDepthOfFieldEnabled(true)).not.toThrow();
  });

  it('getFrameCounters reads through to the renderer.info counters (see diagnostics.ts)', () => {
    const { modules } = fakeModules();
    const renderer = fakeRenderer();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, renderer, baseOpts);
    const counters = pipeline.getFrameCounters();
    expect(counters).toEqual({ drawCalls: 3, triangles: 500, points: 0, lines: 0, geometries: 2, textures: 1, programs: 2 });
  });

  it('setDepthOfFieldEnabled toggles the BokehPass without rebuilding the composer', () => {
    const { modules, bokehInstances } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts,
      depthOfField: { enabled: true, focusDistance: 3 },
    });
    expect(bokehInstances[0]!.instance.enabled).toBe(true);
    pipeline.setDepthOfFieldEnabled(false);
    expect(bokehInstances[0]!.instance.enabled).toBe(false);
    pipeline.setDepthOfFieldEnabled(true);
    expect(bokehInstances[0]!.instance.enabled).toBe(true);
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

  it('also disposes SSR when it was enabled', () => {
    const { modules, ssrInstances } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts, qualityTier: 'cinematic', reflections: { enabled: true },
    });
    pipeline.dispose?.();
    expect(ssrInstances[0]!.dispose).toHaveBeenCalledOnce();
  });

  // Resource-lifecycle audit finding: EffectComposer.dispose() only frees its own two ping-pong
  // render targets and copy pass — it does not iterate its passes and dispose each one (see
  // three.js's own EffectComposer source). Every pass owning GPU resources must be disposed
  // explicitly by the pipeline's own dispose(), or it leaks on every scene teardown/remount:
  // UnrealBloomPass alone owns 11 WebGLRenderTargets, BokehPass owns a depth render target plus
  // two materials, OutputPass owns one material.
  it('disposes bloom, DOF (BokehPass) and OutputPass — not just GTAO and the composer', () => {
    vi.mocked(detectRenderTier).mockReturnValue('high');
    const { modules, bloomInstances, bokehInstances, outputPassInstances } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts, depthOfField: { enabled: true, focusDistance: 3 },
    });
    pipeline.dispose?.();
    expect(bloomInstances[0]!.dispose).toHaveBeenCalledOnce();
    expect(bokehInstances[0]!.instance.dispose).toHaveBeenCalledOnce();
    expect(outputPassInstances[0]!.dispose).toHaveBeenCalledOnce();
  });
});

describe('setupGraphicsPipeline — qualityTier override', () => {
  it('forces cinematic quality regardless of detectRenderTier, enabling AO/bloom/DOF', () => {
    vi.mocked(detectRenderTier).mockReturnValue('low'); // device looks weak...
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts, qualityTier: 'cinematic', depthOfField: { enabled: true, focusDistance: 3 },
    });
    // ...but an explicit capture request still gets full quality.
    expect(addedPasses).toContain('GTAOPass');
    expect(addedPasses).toContain('UnrealBloomPass');
    expect(addedPasses).toContain('BokehPass');
  });

  it('omitting qualityTier falls back to detectRenderTier as before', () => {
    vi.mocked(detectRenderTier).mockReturnValue('low');
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);
    expect(addedPasses).toEqual(['RenderPass', 'OutputPass']);
  });
});

describe('setupGraphicsPipeline — screen-space reflections (opt-in, off by default)', () => {
  it('never adds SSRPass when reflections is omitted, even at cinematic tier', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, qualityTier: 'cinematic' });
    expect(addedPasses).not.toContain('SSRPass');
  });

  it('never adds SSRPass when reflections.enabled is false', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts, qualityTier: 'cinematic', reflections: { enabled: false },
    });
    expect(addedPasses).not.toContain('SSRPass');
  });

  it('adds SSRPass when explicitly enabled at cinematic tier', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts, qualityTier: 'cinematic', reflections: { enabled: true },
    });
    expect(addedPasses).toContain('SSRPass');
  });

  it('defaults to the cinematic-tier gate — enabling it at "high" alone is not enough', () => {
    vi.mocked(detectRenderTier).mockReturnValue('high');
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, reflections: { enabled: true } });
    expect(addedPasses).not.toContain('SSRPass');
  });

  it('a caller can loosen the gate via minTier after profiling their own scene', () => {
    vi.mocked(detectRenderTier).mockReturnValue('high');
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts, reflections: { enabled: true, minTier: 'high' },
    });
    expect(addedPasses).toContain('SSRPass');
  });

  it('maps strength/maxDistance onto the pass, clamping strength to [0,1]', () => {
    const { modules, ssrInstances } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts, qualityTier: 'cinematic', reflections: { enabled: true, strength: 1.5, maxDistance: 12 },
    });
    expect(ssrInstances[0]!.opacity).toBe(1);
    expect(ssrInstances[0]!.maxDistance).toBe(12);
  });

  it('is placed after AO and before bloom in the pass order', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, qualityTier: 'cinematic', reflections: { enabled: true } });
    expect(addedPasses).toEqual(['RenderPass', 'GTAOPass', 'SSRPass', 'UnrealBloomPass', 'OutputPass']);
  });
});

describe('setupGraphicsPipeline — ambient environment modes', () => {
  beforeEach(() => {
    vi.mocked(applyAmbientIBL).mockClear();
    vi.mocked(applyStudioEnvironment).mockClear();
    vi.mocked(captureRoomEnvironment).mockClear();
  });

  it('defaults to studio+hdri (applyAmbientIBL) when ambient is omitted', () => {
    const { modules } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);
    expect(applyAmbientIBL).toHaveBeenCalledOnce();
    expect(applyStudioEnvironment).not.toHaveBeenCalled();
  });

  it('room-probe mode applies only the studio-box fallback, never the HDRI role, up front', () => {
    const { modules } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts,
      ambient: { mode: 'room-probe', probe: { position: [0, 1, 0] } },
    });
    expect(applyStudioEnvironment).toHaveBeenCalledOnce();
    expect(applyAmbientIBL).not.toHaveBeenCalled();
  });

  it('room-probe mode captures the probe on the first captureRoomProbe() call, and never again', () => {
    const { modules } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts,
      ambient: { mode: 'room-probe', probe: { position: [1, 2, 3] } },
    });
    pipeline.captureRoomProbe();
    pipeline.captureRoomProbe();
    expect(captureRoomEnvironment).toHaveBeenCalledOnce();
  });

  it('captureRoomProbe is a safe no-op outside room-probe mode', () => {
    const { modules } = fakeModules();
    const pipeline = setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);
    expect(() => pipeline.captureRoomProbe()).not.toThrow();
    expect(captureRoomEnvironment).not.toHaveBeenCalled();
  });

  it('none mode skips the AMBIENT/IBL role entirely, for a scene managing its own atmosphere', () => {
    const { modules } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, ambient: { mode: 'none' } });
    expect(applyAmbientIBL).not.toHaveBeenCalled();
    expect(applyStudioEnvironment).not.toHaveBeenCalled();
  });
});

describe('setupGraphicsPipeline — ambientOcclusion tuning', () => {
  it('uses the high-tier default gate and default radius/blendIntensity when omitted', () => {
    const { modules, gtaoInstances } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), baseOpts);
    expect(gtaoInstances[0]!.updateGtaoMaterial).toHaveBeenCalledWith(expect.objectContaining({ radius: 0.42 }));
    expect(gtaoInstances[0]!.blendIntensity).toBe(0.85);
  });

  it('honors an explicit radius/blendIntensity override', () => {
    const { modules, gtaoInstances } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), {
      ...baseOpts, ambientOcclusion: { radius: 1.1, blendIntensity: 0.5 },
    });
    expect(gtaoInstances[0]!.updateGtaoMaterial).toHaveBeenCalledWith(expect.objectContaining({ radius: 1.1 }));
    expect(gtaoInstances[0]!.blendIntensity).toBe(0.5);
  });

  it('enabled: false skips AO regardless of tier', () => {
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, ambientOcclusion: { enabled: false } });
    expect(addedPasses).not.toContain('GTAOPass');
  });

  it('a per-scene minTier can loosen AO onto a lower tier than the global default', () => {
    vi.mocked(detectRenderTier).mockReturnValue('medium');
    const { modules, addedPasses } = fakeModules();
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, ambientOcclusion: { minTier: 'medium' } });
    expect(addedPasses).toContain('GTAOPass');
  });
});

describe('configureDOF', () => {
  it('builds an enabled DepthOfFieldSettings by default', () => {
    const settings = configureDOF({ focusDistance: 4 });
    expect(settings.enabled).toBe(true);
    expect(settings.focusDistance).toBe(4);
  });

  it('respects an explicit enabled:false', () => {
    const settings = configureDOF({ focusDistance: 4, enabled: false });
    expect(settings.enabled).toBe(false);
  });

  it('throws on a non-positive focus distance rather than silently producing broken DOF', () => {
    expect(() => configureDOF({ focusDistance: 0 })).toThrow();
    expect(() => configureDOF({ focusDistance: -1 })).toThrow();
  });

  it('passes through blurStrength/aperture/maxBlur/minTier unchanged', () => {
    const settings = configureDOF({ focusDistance: 2, blurStrength: 0.6, minTier: 'medium' });
    expect(settings.blurStrength).toBe(0.6);
    expect(settings.minTier).toBe('medium');
  });

  it('produced settings work directly as setupGraphicsPipeline input', () => {
    const { modules, addedPasses } = fakeModules();
    const depthOfField = configureDOF({ focusDistance: 3 });
    setupGraphicsPipeline(fakeThree(), modules, fakeRenderer(), { ...baseOpts, depthOfField });
    expect(addedPasses).toContain('BokehPass');
  });
});
