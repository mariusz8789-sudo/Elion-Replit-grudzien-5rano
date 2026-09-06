import type * as THREE_NS from 'three';
import { surfaceNormalFactory } from './materials';

/**
 * GENESIS GRAPHICS RUNTIME — Water
 *
 * A reusable water REPRESENTATION for any scientific-world scene that needs a river, lake,
 * reservoir, pool, or laboratory water/coolant container — rendering only. `graphics/water.ts` has
 * no model of actual water state (level, flow rate, temperature): C3 remains authoritative for
 * that, same boundary `stateVisualization.ts` already draws for every other scalar. A caller that
 * has a real fill fraction from C3 drives this module's surface the same way any other gauge is
 * driven — see `applyFractionToScale` in `stateVisualization.ts`, reused here, not reimplemented.
 *
 * Technique: `MeshPhysicalMaterial` transmission (real refraction, the same three.js feature
 * `createScientificGlass` already uses) + one scrolling normal map (reusing `materials.ts`'s shared
 * `surfaceNormalFactory` generator — composition, not a second bump-map generator) for a cheap,
 * real-time-safe ripple. This is NOT a simulated fluid surface (no wave equation, no interactive
 * ripples from objects) — a moving, visually-plausible surface, not a physics system; C2 renders,
 * it does not simulate.
 */

export interface WaterSurfaceOptions {
  width: number;
  depth: number;
  /** Base tint. Default a natural teal-blue. */
  color?: THREE_NS.ColorRepresentation;
  /** Surface micro-roughness — lower reads as calmer/glassier water. Default 0.06. */
  roughness?: number;
  /** `true` (default) for real see-through refraction (a river, a lab vessel) via `transmission`.
   * `false` for a fully opaque reflective surface (a murky reservoir, a scene budget that can't
   * afford transmission's extra cost) — same reflective-vs-transmissive trade-off convention as
   * `createScientificGlass`. */
  transmissive?: boolean;
  /** Feeds `MeshPhysicalMaterial.thickness` (transmission's refraction depth) — the one "depth
   * coloration" proxy this module offers: a thicker body of water tints its transmitted light more
   * strongly, the same real optical effect that makes a swimming pool's deep end read bluer than
   * its shallow end, without simulating an actual depth field. Default 0.6 (a modest pond/tank). */
  thicknessMeters?: number;
  /** UV-units-per-second the ripple normal map scrolls, as `[u, v]`. Default `[0.02, 0.015]` — a
   * slow, calm drift. Set both to 0 for still water (a lab container, a reflecting pool). */
  flowSpeed?: [number, number];
  /** How many times the ripple normal map tiles across the surface. Default scales with size
   * (`width`/`depth` each divided by 2) so a large lake and a small tank both get plausible-scale
   * ripples instead of one fixed tile count stretching or over-tiling. */
  normalRepeat?: [number, number];
  segments?: number;
}

export interface WaterSurfaceHandle {
  mesh: THREE_NS.Mesh;
  material: THREE_NS.MeshPhysicalMaterial;
  /** Scrolls the ripple normal map by `flowSpeed * dt`. A no-op call is harmless (still water) —
   * always safe to call every frame regardless of `flowSpeed`. */
  update(dt: number): void;
  dispose(): void;
}

/**
 * A horizontal water plane (rivers/lakes/reservoirs/pools/lab containers) — geometry is a flat
 * `PlaneGeometry` rotated to lie in XZ. This module only owns the SURFACE material/geometry; it has
 * no opinion on the container it sits in or the current fill level, since that depends on geometry
 * (a container's floor-to-rim range) this module was never given. A caller with a real fill
 * fraction from C3 (a reservoir level, a lab vessel's fluid fraction) sets `mesh.position.y` and
 * `mesh.visible` itself from that fraction and its own known container bounds — the same pattern
 * `stateVisualization.ts`'s `applyFractionToScale` already generalizes for a vertical gauge, just
 * applied to this mesh's position rather than its scale (scaling a flat water PLANE doesn't change
 * how "full" it visually reads the way scaling a solid fill column does).
 */
export function createWaterSurface(THREE: typeof THREE_NS, options: WaterSurfaceOptions): WaterSurfaceHandle {
  if (!(options.width > 0) || !(options.depth > 0)) {
    throw new Error(`createWaterSurface: width/depth must be > 0 (got ${options.width}x${options.depth})`);
  }
  const repeat = options.normalRepeat ?? [Math.max(1, options.width / 2), Math.max(1, options.depth / 2)];
  const normalMap = surfaceNormalFactory(THREE)(repeat[0], repeat[1]);
  const transmissive = options.transmissive ?? true;

  const material = new THREE.MeshPhysicalMaterial({
    color: options.color ?? 0x1c4f63,
    roughness: options.roughness ?? 0.06,
    metalness: 0,
    transmission: transmissive ? 0.8 : 0,
    transparent: transmissive,
    opacity: transmissive ? 1 : 0.94,
    thickness: options.thicknessMeters ?? 0.6,
    ior: 1.33, // real water refractive index
    normalMap,
    normalScale: new THREE.Vector2(0.28, 0.28),
    envMapIntensity: 1.35,
  });

  const geometry = new THREE.PlaneGeometry(options.width, options.depth, options.segments ?? 1, options.segments ?? 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'genesis-water-surface';

  const flowSpeed = options.flowSpeed ?? [0.02, 0.015];

  return {
    mesh,
    material,
    update(dt: number) {
      if (flowSpeed[0] === 0 && flowSpeed[1] === 0) return;
      normalMap.offset.x = (normalMap.offset.x + flowSpeed[0] * dt) % 1;
      normalMap.offset.y = (normalMap.offset.y + flowSpeed[1] * dt) % 1;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      normalMap.dispose();
    },
  };
}

/**
 * Cheaply darkens and smooths an EXISTING opaque material to read as rain-soaked/wet — for ground,
 * roads, or facades a scene wants to respond to a weather state (see `atmosphere.ts`'s rain hook)
 * without swapping to a whole second material. Mutates `material` in place; pass a `.clone()` if
 * the un-wet version must survive elsewhere. `wetness` 0 leaves the material untouched; 1 is a
 * fully soaked, near-mirror-sheen surface. Idempotent only if called from the material's ORIGINAL
 * dry values — call `captureDryLook` once and re-apply from that baseline if `wetness` needs to
 * animate up and down (e.g., rain starting and stopping).
 */
export interface DryMaterialLook {
  color: number;
  roughness: number;
}

/** Snapshots a material's current color/roughness — the baseline `applyWetLook` blends away from,
 * so repeated calls with a changing `wetness` (rain intensifying, then clearing) stay correct
 * instead of compounding darkness/roughness reduction on each call. */
export function captureDryLook(material: { color: THREE_NS.Color; roughness: number }): DryMaterialLook {
  return { color: material.color.getHex(), roughness: material.roughness };
}

export function applyWetLook(
  THREE: typeof THREE_NS,
  material: { color: THREE_NS.Color; roughness: number },
  dry: DryMaterialLook,
  wetness: number,
): void {
  const clamped = Math.max(0, Math.min(1, wetness));
  material.color.copy(new THREE.Color(dry.color)).multiplyScalar(1 - clamped * 0.35);
  material.roughness = dry.roughness * (1 - clamped * 0.75);
}
