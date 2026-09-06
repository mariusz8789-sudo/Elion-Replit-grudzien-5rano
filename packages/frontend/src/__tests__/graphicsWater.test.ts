import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';

/** Same minimal canvas/document stub as graphicsMaterials.test.ts — `createWaterSurface` pulls in
 * `materials.ts`'s `surfaceNormalFactory` for its ripple normal map. */
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

import { createWaterSurface, captureDryLook, applyWetLook } from '../core/three/graphics/water';

describe('createWaterSurface', () => {
  it('rejects non-positive dimensions', () => {
    expect(() => createWaterSurface(THREE, { width: 0, depth: 5 })).toThrow();
    expect(() => createWaterSurface(THREE, { width: 5, depth: -1 })).toThrow();
  });

  it('builds a horizontal plane (rotated into XZ) with a transmissive physical material by default', () => {
    const water = createWaterSurface(THREE, { width: 4, depth: 6 });
    expect(water.mesh.geometry.type).toBe('PlaneGeometry');
    expect(water.material.transmission).toBeGreaterThan(0);
    expect(water.material.transparent).toBe(true);
    water.dispose();
  });

  it('transmissive: false produces an opaque reflective surface instead', () => {
    const water = createWaterSurface(THREE, { width: 4, depth: 4, transmissive: false });
    expect(water.material.transmission).toBe(0);
    expect(water.material.transparent).toBe(false);
    water.dispose();
  });

  it('update(dt) scrolls the ripple normal map offset over time', () => {
    const water = createWaterSurface(THREE, { width: 4, depth: 4, flowSpeed: [0.1, 0.05] });
    const before = water.material.normalMap!.offset.clone();
    water.update(1);
    expect(water.material.normalMap!.offset.x).not.toBe(before.x);
    expect(water.material.normalMap!.offset.y).not.toBe(before.y);
    water.dispose();
  });

  it('update(dt) is a harmless no-op for still water (flowSpeed [0,0])', () => {
    const water = createWaterSurface(THREE, { width: 4, depth: 4, flowSpeed: [0, 0] });
    const before = water.material.normalMap!.offset.clone();
    water.update(5);
    expect(water.material.normalMap!.offset.x).toBe(before.x);
    expect(water.material.normalMap!.offset.y).toBe(before.y);
    water.dispose();
  });

  it('a thicker body of water tints more strongly (thickness feeds the transmission material directly)', () => {
    const shallow = createWaterSurface(THREE, { width: 4, depth: 4, thicknessMeters: 0.1 });
    const deep = createWaterSurface(THREE, { width: 4, depth: 4, thicknessMeters: 3 });
    expect(deep.material.thickness).toBeGreaterThan(shallow.material.thickness);
    shallow.dispose();
    deep.dispose();
  });

  it('dispose() frees geometry, material, and the ripple texture without throwing', () => {
    const water = createWaterSurface(THREE, { width: 4, depth: 4 });
    expect(() => water.dispose()).not.toThrow();
  });
});

describe('captureDryLook / applyWetLook', () => {
  it('wetness 0 leaves the material unchanged from its dry baseline', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.8 });
    const dry = captureDryLook(material);
    applyWetLook(THREE, material, dry, 0);
    expect(material.color.getHex()).toBe(new THREE.Color(0x887766).getHex());
    expect(material.roughness).toBeCloseTo(0.8);
  });

  it('wetness 1 darkens and smooths the material relative to dry', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.8 });
    const dry = captureDryLook(material);
    applyWetLook(THREE, material, dry, 1);
    expect(material.roughness).toBeLessThan(dry.roughness);
    const wetLuma = material.color.getHSL({ h: 0, s: 0, l: 0 }).l;
    const dryLuma = new THREE.Color(dry.color).getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(wetLuma).toBeLessThan(dryLuma);
  });

  it('re-applying from the same dry baseline as wetness changes does not compound (rain intensifying then clearing)', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.8 });
    const dry = captureDryLook(material);
    applyWetLook(THREE, material, dry, 1);
    applyWetLook(THREE, material, dry, 0.3);
    applyWetLook(THREE, material, dry, 1);
    const afterFirstFullWet = material.roughness;
    applyWetLook(THREE, material, dry, 1); // re-apply the SAME wetness again
    expect(material.roughness).toBeCloseTo(afterFirstFullWet); // stable, not compounding
  });
});
