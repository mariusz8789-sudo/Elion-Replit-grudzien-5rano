import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';

/** Same minimal canvas/document stub `graphicsAtmosphere.test.ts` uses — `createFireVfx` generates
 * its flame/smoke gradient textures via canvas, same as `createLightShaft`. */
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

import { createFireVfx } from '../core/three/graphics/fireVfx';

describe('createFireVfx', () => {
  it('rejects a non-positive flameHeightM rather than building a degenerate effect', () => {
    expect(() => createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 0, intensity: 0.5 })).toThrow();
    expect(() => createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: -2, intensity: 0.5 })).toThrow();
  });

  it('positions the group at the real origin and builds the requested particle counts', () => {
    const fx = createFireVfx(THREE, {
      origin: [3, 0, -5], flameHeightM: 4, intensity: 0.6, flameParticleCount: 12, smokeParticleCount: 6,
    });
    expect(fx.group.position.toArray()).toEqual([3, 0, -5]);
    const sprites = fx.group.children.filter((c) => c instanceof THREE.Sprite);
    expect(sprites.length).toBe(12 + 6);
  });

  it('clamps particle counts to a sane minimum instead of building zero particles for a tiny request', () => {
    const fx = createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 1, intensity: 0.1, flameParticleCount: 0, smokeParticleCount: 0 });
    const sprites = fx.group.children.filter((c) => c instanceof THREE.Sprite);
    expect(sprites.length).toBeGreaterThan(0);
  });

  it('update(dt) actually moves flame particles toward the real flameHeightM, never past it', () => {
    const fx = createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 10, intensity: 1, flameParticleCount: 20, smokeParticleCount: 1, seed: 1 });
    const flameSprites = fx.group.children.slice(0, 20) as THREE.Sprite[];
    for (let i = 0; i < 40; i++) fx.update(0.05);
    for (const sprite of flameSprites) {
      expect(sprite.position.y).toBeGreaterThanOrEqual(0);
      expect(sprite.position.y).toBeLessThanOrEqual(10 + 1e-6);
    }
  });

  it('a taller real flameHeightM produces a taller effect (flame particles reach higher)', () => {
    const short = createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 1, intensity: 1, flameParticleCount: 30, smokeParticleCount: 1, seed: 9 });
    const tall = createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 20, intensity: 1, flameParticleCount: 30, smokeParticleCount: 1, seed: 9 });
    for (let i = 0; i < 60; i++) { short.update(0.03); tall.update(0.03); }
    const maxY = (fx: ReturnType<typeof createFireVfx>) =>
      Math.max(...(fx.group.children.slice(0, 30) as THREE.Sprite[]).map((s) => s.position.y));
    expect(maxY(tall)).toBeGreaterThan(maxY(short));
  });

  it('setIntensity(0) fades toward dim rather than snapping opacity to exactly the same as full intensity', () => {
    const fx = createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 5, intensity: 1, flameParticleCount: 10, smokeParticleCount: 1, seed: 3 });
    for (let i = 0; i < 20; i++) fx.update(0.05);
    const brightOpacities = (fx.group.children.slice(0, 10) as THREE.Sprite[]).map((s) => (s.material as THREE.SpriteMaterial).opacity);
    fx.setIntensity(0);
    for (let i = 0; i < 20; i++) fx.update(0.05);
    const dimOpacities = (fx.group.children.slice(0, 10) as THREE.Sprite[]).map((s) => (s.material as THREE.SpriteMaterial).opacity);
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    expect(sum(dimOpacities)).toBeLessThan(sum(brightOpacities));
  });

  it('is deterministic for a given seed', () => {
    const a = createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 3, intensity: 0.5, seed: 77 });
    const b = createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 3, intensity: 0.5, seed: 77 });
    for (let i = 0; i < 10; i++) { a.update(0.1); b.update(0.1); }
    const posA = (a.group.children as THREE.Sprite[]).map((s) => s.position.toArray());
    const posB = (b.group.children as THREE.Sprite[]).map((s) => s.position.toArray());
    expect(posA).toEqual(posB);
  });

  it('dispose() frees every particle material without throwing', () => {
    const fx = createFireVfx(THREE, { origin: [0, 0, 0], flameHeightM: 2, intensity: 0.4 });
    expect(() => fx.dispose()).not.toThrow();
  });
});
