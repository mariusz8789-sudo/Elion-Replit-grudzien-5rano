import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createKeyLight, createRimLight, createPracticalLight, createBackgroundFill, createHeroLight,
  captureRoomReflectionProbe,
} from '../core/three/graphics/lighting';
import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — lighting-role tests. Pure scene-graph assertions (no renderer, no
 * canvas) — these roles only ever construct THREE.Light subclasses and add them to a Scene.
 */

describe('createKeyLight', () => {
  it('adds both the light and its target to the scene (SpotLight direction needs the target in-graph)', () => {
    const scene = new THREE.Scene();
    const light = createKeyLight(THREE, scene, { target: [0, 1, 0], position: [3, 3, 3] });
    expect(scene.children).toContain(light);
    expect(scene.children).toContain(light.target);
  });

  it('casts a shadow by default, with a bounded map size', () => {
    const scene = new THREE.Scene();
    const light = createKeyLight(THREE, scene, { target: [0, 1, 0], position: [3, 3, 3] });
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize.x).toBe(1024);
  });

  it('respects an explicit shadow-map size (e.g. from quality.recommendedShadowMapSize)', () => {
    const scene = new THREE.Scene();
    const light = createKeyLight(THREE, scene, { target: [0, 1, 0], position: [3, 3, 3], shadowMapSize: 512 });
    expect(light.shadow.mapSize.x).toBe(512);
  });

  it('can opt out of casting a shadow for a secondary/fill key', () => {
    const scene = new THREE.Scene();
    const light = createKeyLight(THREE, scene, { target: [0, 1, 0], position: [3, 3, 3], castShadow: false });
    expect(light.castShadow).toBe(false);
  });
});

describe('createRimLight / createPracticalLight', () => {
  it('rim light never casts a shadow (silhouette accent, not a form light)', () => {
    const scene = new THREE.Scene();
    const light = createRimLight(THREE, scene, { position: [0, 1, -2] });
    expect(light.castShadow).toBe(false);
    expect(scene.children).toContain(light);
  });

  it('practical light never casts a shadow (its fixture geometry is a different layer\'s concern)', () => {
    const scene = new THREE.Scene();
    const light = createPracticalLight(THREE, scene, { position: [1, 2, 1] });
    expect(light.castShadow).toBe(false);
  });
});

describe('createBackgroundFill', () => {
  it('is a weak wash, not the scene\'s main light source', () => {
    const scene = new THREE.Scene();
    const light = createBackgroundFill(THREE, scene);
    expect(light.intensity).toBeLessThan(1);
  });
});

describe('createHeroLight', () => {
  it('produces a KEY (shadow-casting, aimed at target) and RIM pair positioned away from the target', () => {
    const scene = new THREE.Scene();
    const target: THREE.Vector3Tuple = [0, 1.1, -0.2];
    const { key, rim } = createHeroLight(THREE, scene, { target });
    expect(key.castShadow).toBe(true);
    expect([key.target.position.x, key.target.position.y, key.target.position.z]).toEqual(target);
    expect(key.position.distanceTo(new THREE.Vector3(...target))).toBeGreaterThan(1);
    expect(rim.position.distanceTo(new THREE.Vector3(...target))).toBeGreaterThan(0.5);
    // KEY and RIM must not collapse onto the same point, or the rig degenerates into one light.
    expect(key.position.distanceTo(rim.position)).toBeGreaterThan(1);
  });

  it('scales key distance with a larger hero object without extra call-site math', () => {
    const scene = new THREE.Scene();
    const target: THREE.Vector3Tuple = [0, 0, 0];
    const small = createHeroLight(THREE, scene, { target, keyDistance: 2 });
    const large = createHeroLight(THREE, new THREE.Scene(), { target, keyDistance: 20 });
    expect(large.key.position.length()).toBeGreaterThan(small.key.position.length());
  });
});

/**
 * `captureRoomReflectionProbe` needs a real WebGLRenderer for `CubeCamera.update`/
 * `PMREMGenerator` — unavailable in this jsdom-free test environment (see
 * graphicsPostProcessing.test.ts's file doc for the same constraint on `setupGraphicsPipeline`).
 * These tests fake the handful of THREE/renderer entry points the function actually calls, so they
 * verify its own logic — which meshes get hidden and why, tone-mapping save/restore, the
 * finally-block safety net — without needing a real GPU context.
 */
describe('captureRoomReflectionProbe', () => {
  function fakeMesh(overrides: Partial<{ isMesh: boolean; visible: boolean; material: unknown }> = {}) {
    return { isMesh: true, visible: true, material: { transparent: false, opacity: 1, transmission: 0 }, ...overrides } as unknown as THREE_NS.Mesh;
  }

  function fakeScene(children: THREE_NS.Mesh[]) {
    return {
      traverse: (cb: (o: THREE_NS.Object3D) => void) => children.forEach((c) => cb(c)),
      environment: null,
    } as unknown as THREE_NS.Scene;
  }

  function fakeRenderer() {
    return { toneMapping: 'ACESFilmic', toneMappingExposure: 1.1 } as unknown as THREE_NS.WebGLRenderer;
  }

  function fakeThreeNS(onCubeCameraUpdate?: () => void, cubeCameraInstances: Array<{ layers: { set: ReturnType<typeof vi.fn> } }> = []) {
    class CubeCamera {
      layers = { set: vi.fn() };
      position = { set: vi.fn() };
      update = vi.fn(() => onCubeCameraUpdate?.());
      constructor(public near: number, public far: number, public target: unknown) {
        cubeCameraInstances.push(this);
      }
    }
    class WebGLCubeRenderTarget {
      texture = {};
      dispose = vi.fn();
      constructor(public resolution: number, public opts: unknown) {}
    }
    class PMREMGenerator {
      dispose = vi.fn();
      fromCubemap = vi.fn(() => ({ texture: 'captured-env' }));
      constructor(public renderer: unknown) {}
    }
    return { CubeCamera, WebGLCubeRenderTarget, PMREMGenerator, HalfFloatType: 'half-float', NoToneMapping: 'none' } as unknown as typeof THREE_NS;
  }

  it('hides transmissive meshes for the capture and restores visibility after', () => {
    const glass = fakeMesh({ material: { transparent: false, opacity: 1, transmission: 0.9 } });
    let visibleDuringCapture: boolean | undefined;
    const THREE_FAKE = fakeThreeNS(() => { visibleDuringCapture = glass.visible; });
    const scene = fakeScene([glass]);
    captureRoomReflectionProbe(THREE_FAKE, fakeRenderer(), scene, { position: [0, 1, 0] });
    expect(visibleDuringCapture).toBe(false);
    expect(glass.visible).toBe(true);
  });

  it('hides near-transparent (opacity < 0.4) meshes too, not just transmissive ones', () => {
    const faintGlass = fakeMesh({ material: { transparent: true, opacity: 0.2, transmission: 0 } });
    let visibleDuringCapture: boolean | undefined;
    const THREE_FAKE = fakeThreeNS(() => { visibleDuringCapture = faintGlass.visible; });
    captureRoomReflectionProbe(THREE_FAKE, fakeRenderer(), fakeScene([faintGlass]), { position: [0, 1, 0] });
    expect(visibleDuringCapture).toBe(false);
  });

  it('leaves ordinary opaque meshes visible throughout', () => {
    const opaque = fakeMesh();
    let visibleDuringCapture: boolean | undefined;
    const THREE_FAKE = fakeThreeNS(() => { visibleDuringCapture = opaque.visible; });
    captureRoomReflectionProbe(THREE_FAKE, fakeRenderer(), fakeScene([opaque]), { position: [0, 1, 0] });
    expect(visibleDuringCapture).toBe(true);
    expect(opaque.visible).toBe(true);
  });

  it('honors a caller-supplied exclude predicate on top of the automatic detection', () => {
    const hud = fakeMesh();
    let visibleDuringCapture: boolean | undefined;
    const THREE_FAKE = fakeThreeNS(() => { visibleDuringCapture = hud.visible; });
    captureRoomReflectionProbe(THREE_FAKE, fakeRenderer(), fakeScene([hud]), {
      position: [0, 1, 0],
      exclude: (mesh) => mesh === hud,
    });
    expect(visibleDuringCapture).toBe(false);
    expect(hud.visible).toBe(true);
  });

  it('captures in linear light (NoToneMapping) and restores the previous tone mapping/exposure after', () => {
    const renderer = fakeRenderer();
    let toneMappingDuringCapture: unknown;
    const THREE_FAKE = fakeThreeNS(() => { toneMappingDuringCapture = renderer.toneMapping; });
    captureRoomReflectionProbe(THREE_FAKE, renderer, fakeScene([]), { position: [0, 1, 0] });
    expect(toneMappingDuringCapture).toBe('none');
    expect(renderer.toneMapping).toBe('ACESFilmic');
    expect(renderer.toneMappingExposure).toBe(1.1);
  });

  it('sets scene.environment from the captured cubemap, with the default/overridden intensity', () => {
    const THREE_FAKE = fakeThreeNS();
    const scene = fakeScene([]);
    captureRoomReflectionProbe(THREE_FAKE, fakeRenderer(), scene, { position: [0, 1, 0] });
    expect(scene.environment).toBe('captured-env');
    expect(scene.environmentIntensity).toBe(1.85);

    const scene2 = fakeScene([]);
    captureRoomReflectionProbe(fakeThreeNS(), fakeRenderer(), scene2, { position: [0, 1, 0], environmentIntensity: 1.2 });
    expect(scene2.environmentIntensity).toBe(1.2);
  });

  it('restricts the probe to render layer 0, excluding first-person view-model geometry by convention', () => {
    const cubeCameraInstances: Array<{ layers: { set: ReturnType<typeof vi.fn> } }> = [];
    const THREE_FAKE = fakeThreeNS(undefined, cubeCameraInstances);
    captureRoomReflectionProbe(THREE_FAKE, fakeRenderer(), fakeScene([]), { position: [0, 1, 0] });
    expect(cubeCameraInstances).toHaveLength(1);
    expect(cubeCameraInstances[0]!.layers.set).toHaveBeenCalledWith(0);
  });

  it('still restores tone mapping and mesh visibility if the capture throws (finally-block safety net)', () => {
    const glass = fakeMesh({ material: { transparent: false, opacity: 1, transmission: 0.9 } });
    const renderer = fakeRenderer();
    const THREE_FAKE = fakeThreeNS(() => { throw new Error('capture failed'); });
    expect(() => captureRoomReflectionProbe(THREE_FAKE, renderer, fakeScene([glass]), { position: [0, 1, 0] })).not.toThrow();
    expect(glass.visible).toBe(true);
    expect(renderer.toneMapping).toBe('ACESFilmic');
  });
});
