import type { HumanVisualProfile, LabRealismProfile, VisualMaterialProfile } from './types';

const metal = (materialId: string, baseColorHex: string, roughness: number, microDetailScale = 0.35): VisualMaterialProfile => ({ materialId, baseColorHex, metalness: 0.90, roughness, transmission: 0, indexOfRefraction: 1.5, emissiveIntensity: 0, microDetailScale });
const polymer = (materialId: string, baseColorHex: string, roughness: number): VisualMaterialProfile => ({ materialId, baseColorHex, metalness: 0.05, roughness, transmission: 0.02, indexOfRefraction: 1.45, emissiveIntensity: 0, microDetailScale: 0.45 });

export function createCinematicLabRealismProfile(): LabRealismProfile {
  return {
    renderTier: 'CINEMATIC',
    shadowQuality: 'ULTRA',
    reflectionMode: 'RAY_TRACED',
    volumetrics: true,
    contactShadows: true,
    temporalAA: true,
    depthOfField: true,
    lensDistortion: 0.035,
    chromaticAberration: 0.012,
    filmGrain: 0.015,
    visorCondensation: 0.08,
    visorReflectionStrength: 0.28,
    safeHudInsetPercent: 6,
  };
}

export function createHumanVisualProfile(): HumanVisualProfile {
  return {
    realismTier: 'HIGH_FIDELITY',
    skinMaterial: { materialId: 'human.skin.sss', baseColorHex: '#C98C74', metalness: 0, roughness: 0.42, transmission: 0.16, indexOfRefraction: 1.38, emissiveIntensity: 0, microDetailScale: 0.12 },
    eyeMaterial: { materialId: 'human.eye.cornea', baseColorHex: '#B5C7D8', metalness: 0, roughness: 0.04, transmission: 0.55, indexOfRefraction: 1.376, emissiveIntensity: 0, microDetailScale: 0.05 },
    suitMaterial: polymer('human.suit.hazmat', '#D6D9D7', 0.28),
    gloveMaterial: polymer('human.gloves', '#EBECE9', 0.48),
    requiredAssetSlots: ['human.body.high_fidelity.glb', 'human.hands.skin.glb', 'human.hands.gloves.glb', 'human.face.high_fidelity.glb'],
  };
}

export const REALISTIC_LAB_MATERIALS: readonly VisualMaterialProfile[] = [
  metal('lab.stainless.01', '#B7BEC2', 0.21),
  metal('lab.aluminum.brushed.01', '#969EA4', 0.26),
  metal('lab.titanium.dark.01', '#4E555A', 0.30),
  polymer('lab.polymer.white.01', '#E7E9E8', 0.35),
  polymer('lab.glass.anti_reflective.01', '#BFD7E8', 0.08),
  { materialId: 'lab.screen.01', baseColorHex: '#0C1218', metalness: 0.22, roughness: 0.16, transmission: 0.03, indexOfRefraction: 1.5, emissiveIntensity: 1.8, microDetailScale: 0.2 },
];
