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
  createScienceGlass,
  createEmissiveInstrumentMaterial,
  createScreenMaterial,
  makeReadoutSurface,
  type GenesisMaterialId,
} from '../core/three/graphics/materials';

const STATIC_PALETTE_IDS: readonly Exclude<GenesisMaterialId, 'SCREEN' | 'EMISSIVE_INSTRUMENT'>[] = [
  'SCIENCE_GLASS', 'BRUSHED_METAL', 'POLISHED_METAL', 'TECH_COMPOSITE', 'RUBBER', 'CERAMIC', 'LAB_FLOOR', 'LAB_WALL',
];

describe('createGenesisMaterialPalette', () => {
  it('builds all 8 statically-shareable categories as real three.js materials', () => {
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
    for (const id of ['TECH_COMPOSITE', 'RUBBER', 'CERAMIC', 'LAB_FLOOR', 'LAB_WALL'] as const) {
      const material = palette[id] as THREE.MeshStandardMaterial;
      expect(material.metalness).toBeLessThan(0.35);
    }
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

describe('createScienceGlass — reflective vs. transmissive variants', () => {
  it('defaults to the reflective hero-object look', () => {
    const glass = createScienceGlass(THREE);
    expect(glass.transmission).toBe(0);
    expect(glass.opacity).toBeLessThan(1);
  });

  it('produces a true see-through pane when transmissive:true', () => {
    const glass = createScienceGlass(THREE, { transmissive: true });
    expect(glass.transmission).toBeGreaterThan(0.5);
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
