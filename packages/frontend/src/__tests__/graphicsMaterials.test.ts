import { describe, expect, it, vi, beforeAll } from 'vitest';
import * as THREE from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — canonical material palette tests.
 *
 * This project's vitest suite runs in a plain Node environment (no jsdom) —
 * every other test here is pure logic. `graphics/materials.ts`'s procedural
 * textures are the one piece of real rendering code that touches
 * `document.createElement('canvas')`, so this file installs the smallest
 * possible fake `document`/canvas-2d-context (enough for the exact drawing
 * calls those generators make, nothing more) rather than pulling in jsdom
 * as a project-wide dependency for one module.
 */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillText: () => {},
    clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => fakeContext as CanvasRenderingContext2D,
  };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : {}),
  };
});

import {
  createGenesisMaterialPalette,
  createScientificGlass,
  createDoubleWalledGlass,
  createPBRMaterial,
  createEmissiveInstrumentMaterial,
  createScreenMaterial,
  makeReadoutSurface,
  makeBuildingFacadeSurface,
  type GenesisMaterialId,
} from '../core/three/graphics/materials';

const STATIC_PALETTE_IDS: readonly Exclude<GenesisMaterialId, 'SCREEN' | 'EMISSIVE_INSTRUMENT'>[] = [
  'SCIENCE_GLASS', 'BRUSHED_METAL', 'POLISHED_METAL', 'TECH_COMPOSITE', 'RUBBER', 'CERAMIC', 'PAINTED_METAL', 'LAB_FLOOR', 'LAB_WALL',
  'CONCRETE', 'ASPHALT', 'BRICK', 'GROUND', 'BUILDING_FACADE',
];

describe('createGenesisMaterialPalette', () => {
  it('builds all 14 statically-shareable categories as real three.js materials', () => {
    const palette = createGenesisMaterialPalette(THREE);
    for (const id of STATIC_PALETTE_IDS) {
      expect(palette[id]).toBeInstanceOf(THREE.Material);
    }
  });

  it('never passes an undefined constructor param (three.js Material.setValues warns on that)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createGenesisMaterialPalette(THREE);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('gives metals coherent, distinct metalness/roughness — brushed vs. polished must actually differ', () => {
    const palette = createGenesisMaterialPalette(THREE);
    const brushed = palette.BRUSHED_METAL as THREE.MeshStandardMaterial;
    const polished = palette.POLISHED_METAL as THREE.MeshStandardMaterial;
    expect(brushed.metalness).toBeGreaterThan(0.5);
    expect(polished.metalness).toBe(1);
    expect(polished.roughness).toBeLessThan(brushed.roughness);
    expect(brushed.roughnessMap).toBeInstanceOf(THREE.Texture);
  });

  it('keeps non-metals at (near-)zero metalness', () => {
    const palette = createGenesisMaterialPalette(THREE);
    for (const id of ['TECH_COMPOSITE', 'RUBBER', 'CERAMIC', 'PAINTED_METAL', 'LAB_FLOOR', 'LAB_WALL', 'CONCRETE', 'ASPHALT', 'BRICK', 'GROUND', 'BUILDING_FACADE'] as const) {
      const material = palette[id] as THREE.MeshStandardMaterial;
      expect(material.metalness).toBeLessThan(0.35);
    }
  });

  it('exterior/urban categories (CONCRETE/ASPHALT/BRICK/GROUND) are plausible paved/terrain surfaces — high roughness, matte', () => {
    const palette = createGenesisMaterialPalette(THREE);
    for (const id of ['CONCRETE', 'ASPHALT', 'BRICK', 'GROUND'] as const) {
      const material = palette[id] as THREE.MeshStandardMaterial;
      expect(material.roughness).toBeGreaterThan(0.7);
    }
  });

  it('supports a color override on the new exterior categories, same as the existing ones', () => {
    const custom = createPBRMaterial(THREE, 'ASPHALT', { color: 0x112233 }) as THREE.MeshStandardMaterial;
    expect(custom.color.getHex()).toBe(0x112233);
  });

  it('SCIENCE_GLASS is reflective-not-transmissive by default (opacity+clearcoat, transmission 0)', () => {
    const palette = createGenesisMaterialPalette(THREE);
    const glass = palette.SCIENCE_GLASS as THREE.MeshPhysicalMaterial;
    expect(glass.transmission).toBe(0);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeLessThan(1);
    expect(glass.clearcoat).toBeGreaterThan(0);
  });

  it('LAB_FLOOR carries a distinct roughness-detail texture from BRUSHED_METAL (different surfaces, not a shared map)', () => {
    const palette = createGenesisMaterialPalette(THREE);
    const floor = palette.LAB_FLOOR as THREE.MeshStandardMaterial;
    const metal = palette.BRUSHED_METAL as THREE.MeshStandardMaterial;
    expect(floor.roughnessMap).toBeInstanceOf(THREE.Texture);
    expect(floor.roughnessMap).not.toBe(metal.roughnessMap);
  });
});

describe('createScientificGlass — reflective vs. transmissive variants', () => {
  it('defaults to the reflective hero-object look', () => {
    const glass = createScientificGlass(THREE);
    expect(glass.transmission).toBe(0);
    expect(glass.opacity).toBeLessThan(1);
  });

  it('produces a true see-through pane when transmissive:true', () => {
    const glass = createScientificGlass(THREE, { transmissive: true });
    expect(glass.transmission).toBeGreaterThan(0.5);
  });

  it('thicker reflective glass reads denser (higher opacity) but never fully opaque', () => {
    const thin = createScientificGlass(THREE, { thicknessMeters: 0.005 });
    const thick = createScientificGlass(THREE, { thicknessMeters: 0.05 });
    expect(thick.opacity).toBeGreaterThan(thin.opacity);
    expect(thick.opacity).toBeLessThan(1);
  });

  it('respects explicit roughness/ior overrides instead of the variant defaults', () => {
    const glass = createScientificGlass(THREE, { roughness: 0.2, ior: 1.33 });
    expect(glass.roughness).toBe(0.2);
    expect(glass.ior).toBe(1.33);
  });

  it('color override applies to both variants', () => {
    const reflective = createScientificGlass(THREE, { color: 0xff0000 });
    const transmissive = createScientificGlass(THREE, { color: 0x00ff00, transmissive: true });
    expect(reflective.color.getHex()).toBe(0xff0000);
    expect(transmissive.color.getHex()).toBe(0x00ff00);
  });
});

describe('createDoubleWalledGlass', () => {
  it('returns two distinct MeshPhysicalMaterial instances, not the same object twice', () => {
    const { outer, inner } = createDoubleWalledGlass(THREE);
    expect(outer).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(inner).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(outer).not.toBe(inner);
  });

  it('inner wall is denser/rougher than the outer at default contrast', () => {
    const { outer, inner } = createDoubleWalledGlass(THREE);
    expect(inner.roughness).toBeGreaterThan(outer.roughness);
    expect(inner.opacity).toBeGreaterThanOrEqual(outer.opacity);
  });

  it('jacketContrast: 0 makes the two shells effectively identical in roughness/opacity', () => {
    const { outer, inner } = createDoubleWalledGlass(THREE, { jacketContrast: 0 });
    expect(inner.roughness).toBeCloseTo(outer.roughness, 5);
    expect(inner.opacity).toBeCloseTo(outer.opacity, 5);
  });

  it('higher jacketContrast produces a more pronounced difference', () => {
    const subtle = createDoubleWalledGlass(THREE, { jacketContrast: 0.2 });
    const strong = createDoubleWalledGlass(THREE, { jacketContrast: 0.9 });
    const subtleDelta = subtle.inner.roughness - subtle.outer.roughness;
    const strongDelta = strong.inner.roughness - strong.outer.roughness;
    expect(strongDelta).toBeGreaterThan(subtleDelta);
  });

  it('works for the transmissive (true see-through) variant too', () => {
    const { outer, inner } = createDoubleWalledGlass(THREE, { transmissive: true });
    expect(outer.transmission).toBeGreaterThan(0.5);
    expect(inner.transmission).toBeGreaterThan(0.5);
  });
});

describe('createPBRMaterial', () => {
  it('builds a valid material for every static category', () => {
    for (const id of STATIC_PALETTE_IDS) {
      const material = createPBRMaterial(THREE, id);
      expect(material).toBeInstanceOf(THREE.Material);
    }
  });

  it('never warns about an undefined constructor param, for any category', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const id of STATIC_PALETTE_IDS) createPBRMaterial(THREE, id);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('matches createGenesisMaterialPalette\'s default tuning for the same category (single source of truth)', () => {
    const palette = createGenesisMaterialPalette(THREE);
    const single = createPBRMaterial(THREE, 'POLISHED_METAL') as THREE.MeshStandardMaterial;
    const fromPalette = palette.POLISHED_METAL as THREE.MeshStandardMaterial;
    expect(single.metalness).toBe(fromPalette.metalness);
    expect(single.roughness).toBe(fromPalette.roughness);
    expect(single.color.getHex()).toBe(fromPalette.color.getHex());
  });

  it('applies a color override without touching other categories\' defaults', () => {
    const painted = createPBRMaterial(THREE, 'PAINTED_METAL', { color: 0x112233 }) as THREE.MeshPhysicalMaterial;
    expect(painted.color.getHex()).toBe(0x112233);
    expect(painted.metalness).toBeGreaterThan(0); // still reads as "metal under paint," not plastic
    expect(painted.metalness).toBeLessThan(0.35);
  });

  it('PAINTED_METAL sits between TECH_COMPOSITE and BRUSHED_METAL in metalness (paint dulls, doesn\'t hide, the substrate)', () => {
    const composite = createPBRMaterial(THREE, 'TECH_COMPOSITE') as THREE.MeshStandardMaterial;
    const painted = createPBRMaterial(THREE, 'PAINTED_METAL') as THREE.MeshPhysicalMaterial;
    const brushed = createPBRMaterial(THREE, 'BRUSHED_METAL') as THREE.MeshStandardMaterial;
    expect(painted.metalness).toBeGreaterThan(composite.metalness);
    expect(painted.metalness).toBeLessThan(brushed.metalness);
  });
});

describe('createEmissiveInstrumentMaterial', () => {
  it('is dark-based so the emissive color reads as the only light source, not a lit colored plastic', () => {
    const led = createEmissiveInstrumentMaterial(THREE, { color: 0xffb545 });
    expect(led.color.getHex()).toBeLessThan(0x202020);
    expect(led.emissive.getHex()).toBe(0xffb545);
    expect(led.emissiveIntensity).toBeGreaterThan(0);
  });

  it('two instruments with different colors do not share state', () => {
    const amber = createEmissiveInstrumentMaterial(THREE, { color: 0xffb545 });
    const cyan = createEmissiveInstrumentMaterial(THREE, { color: 0x5ad1ff, intensity: 1.1 });
    expect(amber.emissive.getHex()).not.toBe(cyan.emissive.getHex());
    expect(amber.emissiveIntensity).not.toBe(cyan.emissiveIntensity);
  });
});

describe('createScreenMaterial', () => {
  it('wires the same texture into both map and emissiveMap so content reads as self-lit', () => {
    const { texture } = makeReadoutSurface(THREE);
    const screen = createScreenMaterial(THREE, texture);
    expect(screen.map).toBe(texture);
    expect(screen.emissiveMap).toBe(texture);
  });
});

describe('makeBuildingFacadeSurface / BUILDING_FACADE', () => {
  it('returns a distinct albedo and emissive texture (windows glow independently of the wall)', () => {
    const facade = makeBuildingFacadeSurface(THREE, { baseColor: 0x8b8f96, seed: 71 });
    expect(facade.map).toBeInstanceOf(THREE.Texture);
    expect(facade.emissiveMap).toBeInstanceOf(THREE.Texture);
    expect(facade.map).not.toBe(facade.emissiveMap);
  });

  it('BUILDING_FACADE is real (near-)dielectric paint, not metal, and carries a non-black emissive so lit windows actually glow', () => {
    const facade = createPBRMaterial(THREE, 'BUILDING_FACADE') as THREE.MeshStandardMaterial;
    expect(facade.metalness).toBeLessThan(0.35);
    expect(facade.map).toBeInstanceOf(THREE.Texture);
    expect(facade.emissiveMap).toBeInstanceOf(THREE.Texture);
    expect(facade.emissive.getHex()).toBeGreaterThan(0); // 0xffffff — lets emissiveMap supply the real color
    expect(facade.emissiveIntensity).toBeGreaterThan(0);
  });

  it('supports the same color-override convention as CONCRETE/ASPHALT/BRICK/GROUND', () => {
    const custom = createPBRMaterial(THREE, 'BUILDING_FACADE', { color: 0x112233 }) as THREE.MeshStandardMaterial;
    expect(custom.color.getHex()).toBe(0x112233);
  });
});
