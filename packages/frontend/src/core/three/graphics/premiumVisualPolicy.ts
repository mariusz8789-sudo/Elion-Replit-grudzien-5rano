import type * as THREE_NS from 'three';
import type { RenderTier } from '../quality';

/**
 * GENESIS PREMIUM VISUAL PASS — shared presentation policy.
 *
 * This module is intentionally tiny and domain-blind. It does not own a renderer, a scene,
 * simulation state, evidence, provenance or a second quality system. It only translates the
 * EXISTING RenderTier into bounded presentation budgets and provides deterministic helpers used by
 * the premium-detail layers. Every premium layer is presentation-only and must remain removable
 * without changing canonical WorldGraph / experiment / evidence state.
 */

export const PREMIUM_VISUAL_PASS_ID = 'GENESIS_PREMIUM_VISUAL_PASS_V1' as const;

export interface PremiumVisualBudget {
  readonly tier: RenderTier;
  /** Repeated small props (rocks, vents, keys, flora). */
  readonly detailInstances: number;
  /** Cheap point/line particles. */
  readonly atmospherePoints: number;
  /** Number of small animated accents allowed in a layer. */
  readonly animatedAccents: number;
  /** Geometry segmentation cap for hero-only procedural forms. */
  readonly heroSegments: number;
}

export function premiumVisualBudget(tier: RenderTier): PremiumVisualBudget {
  switch (tier) {
    case 'low':
      return { tier, detailInstances: 28, atmospherePoints: 180, animatedAccents: 2, heroSegments: 20 };
    case 'medium':
      return { tier, detailInstances: 48, atmospherePoints: 420, animatedAccents: 4, heroSegments: 28 };
    case 'high':
      return { tier, detailInstances: 78, atmospherePoints: 760, animatedAccents: 6, heroSegments: 36 };
    case 'cinematic':
      return { tier, detailInstances: 108, atmospherePoints: 1200, animatedAccents: 8, heroSegments: 48 };
  }
}

/** Same deterministic PRNG convention already used by materials.ts / atmosphere.ts. */
export function seededUnit(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit seed from a string; visual placement must never depend on Math.random(). */
export function visualSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface PremiumPresentationMetadata {
  readonly domain: string;
  readonly epistemic?: string;
  readonly sourceEntityIds?: readonly string[];
  readonly visualAnalogy?: string;
  readonly fictionInspired?: boolean;
}

/**
 * Marks a premium detail root with the same honesty contract used throughout Genesis visuals.
 * This is metadata only; it never upgrades or modifies scientific evidence.
 */
export function markPremiumPresentation(root: THREE_NS.Object3D, metadata: PremiumPresentationMetadata): void {
  root.userData.premiumVisualPass = PREMIUM_VISUAL_PASS_ID;
  root.userData.presentationOnly = true;
  root.userData.visualOnlyContext = true;
  root.userData.directObservation = false;
  root.userData.scientificStateMutation = false;
  root.userData.domain = metadata.domain;
  if (metadata.epistemic) root.userData.epistemic = metadata.epistemic;
  if (metadata.sourceEntityIds) root.userData.sourceEntityIds = [...metadata.sourceEntityIds];
  if (metadata.visualAnalogy) root.userData.visualAnalogy = metadata.visualAnalogy;
  if (metadata.fictionInspired !== undefined) root.userData.fictionInspired = metadata.fictionInspired;
}

/** Deterministic point on a unit sphere using a golden-angle sequence. */
export function fibonacciSpherePoint(THREE: typeof THREE_NS, index: number, count: number): THREE_NS.Vector3 {
  const safeCount = Math.max(1, count);
  const y = 1 - ((index + 0.5) / safeCount) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * 2.399963229728653;
  return new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
}
