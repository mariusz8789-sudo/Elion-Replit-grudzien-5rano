import type * as THREE_NS from 'three';
import { createPBRMaterial } from './materials';

/** Shared high-fidelity material palette. One scene owns one palette; entity visuals borrow it. */
export interface HighFidelityMaterialPalette {
  white: THREE_NS.Material;
  dark: THREE_NS.Material;
  stainless: THREE_NS.Material;
  chrome: THREE_NS.Material;
  glass: THREE_NS.Material;
  medical: THREE_NS.Material;
  floor: THREE_NS.Material;
  wall: THREE_NS.Material;
  concrete: THREE_NS.Material;
  asphalt: THREE_NS.Material;
  wetAsphalt: THREE_NS.Material;
  brick: THREE_NS.Material;
  ground: THREE_NS.Material;
  foliage: THREE_NS.Material;
  skin: THREE_NS.Material;
  fabric: THREE_NS.Material;
  blueGlow: THREE_NS.Material;
  redGlow: THREE_NS.Material;
}

export function createHighFidelityMaterialPalette(THREE: typeof THREE_NS): HighFidelityMaterialPalette {
  return {
    white: createPBRMaterial(THREE, 'CERAMIC', { color: 0xe8edf4 }),
    dark: createPBRMaterial(THREE, 'TECH_COMPOSITE', { color: 0x111722 }),
    stainless: createPBRMaterial(THREE, 'BRUSHED_METAL', { color: 0xa6b2c1 }),
    chrome: createPBRMaterial(THREE, 'POLISHED_METAL', { color: 0xd9e5f2 }),
    glass: createPBRMaterial(THREE, 'SCIENCE_GLASS', { color: 0xbfe4ff }),
    medical: createPBRMaterial(THREE, 'PAINTED_METAL', { color: 0xd7dde5 }),
    floor: createPBRMaterial(THREE, 'LAB_FLOOR', { color: 0x303746 }),
    wall: createPBRMaterial(THREE, 'LAB_WALL', { color: 0x5c6578 }),
    concrete: createPBRMaterial(THREE, 'CONCRETE', { color: 0x707985 }),
    asphalt: createPBRMaterial(THREE, 'ASPHALT', { color: 0x22262d }),
    wetAsphalt: createPBRMaterial(THREE, 'ASPHALT', { color: 0x12161c }),
    brick: createPBRMaterial(THREE, 'BRICK', { color: 0x8d5a48 }),
    ground: createPBRMaterial(THREE, 'GROUND', { color: 0x5b624f }),
    foliage: createPBRMaterial(THREE, 'GROUND', { color: 0x395b39 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc68f72, roughness: 0.65, metalness: 0.0 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x3c4a5e, roughness: 0.92, metalness: 0.0 }),
    blueGlow: new THREE.MeshStandardMaterial({ color: 0x0a1520, emissive: 0x4ab7ff, emissiveIntensity: 2.2, roughness: 0.38, metalness: 0.15 }),
    redGlow: new THREE.MeshStandardMaterial({ color: 0x180a0d, emissive: 0xff5c71, emissiveIntensity: 2.0, roughness: 0.4, metalness: 0.1 }),
  };
}

export function allHighFidelityMaterials(palette: HighFidelityMaterialPalette): readonly THREE_NS.Material[] {
  return Object.values(palette);
}
