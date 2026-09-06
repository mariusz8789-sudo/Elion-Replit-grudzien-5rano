import type * as THREE_NS from 'three';
import { InstanceBatch } from './instancing';

/**
 * GENESIS GRAPHICS RUNTIME — Vegetation
 *
 * Reusable, instanced environment-nature primitives (trees, bushes, small rocks/ground clutter) —
 * generalized out of the high-fidelity street slice's own hand-placed tree code, which hard-coded
 * per-tree positions/scales rather than a reusable, seeded scatter a caller could reuse for a
 * different plot of ground. Every field here is TWO draw calls at most (one `InstancedMesh` per
 * geometry — trunk, canopy) regardless of count, via `instancing.ts`'s `InstanceBatch`.
 *
 * Deliberately NOT built here: a full ecosystem/growth simulation, wind-driven vertex animation, or
 * per-species asset variety beyond simple procedural geometry — those are real, valuable follow-up
 * work that would need a measured consumer first (see this engine's own "no theoretical framework
 * without a consumer" rule), not invented speculatively.
 */

/** Cheap deterministic PRNG (mulberry32) — same algorithm already used in `materials.ts` and
 * `atmosphere.ts`; kept as a local copy rather than a shared export because none of the three
 * modules import from each other for anything else, and this one-line generator is cheaper to
 * duplicate than to introduce a fourth module just to share it. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ScatterPoint {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/** Seeded, evenly-random placement within a rectangular footprint centered on `center` — the one
 * placement primitive every field below reuses, so "avoid obvious repetition" (varied position,
 * rotation, scale) is guaranteed structurally rather than left to each field to re-derive. */
function scatter(count: number, width: number, depth: number, center: [number, number], seed: number, scaleRange: [number, number]): ScatterPoint[] {
  const rand = mulberry32(seed);
  const points: ScatterPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: center[0] + (rand() * 2 - 1) * (width / 2),
      z: center[1] + (rand() * 2 - 1) * (depth / 2),
      rotationY: rand() * Math.PI * 2,
      scale: scaleRange[0] + rand() * (scaleRange[1] - scaleRange[0]),
    });
  }
  return points;
}

export interface TreeFieldOptions {
  count: number;
  /** Footprint the trees scatter within, centered on `center`. */
  width: number;
  depth: number;
  center?: [number, number];
  /** Deterministic placement seed — vary this between two fields covering different plots so they
   * don't scatter identically. Default 0x1a2b3c4d. */
  seed?: number;
  /** Per-tree uniform scale range (trunk height ~1.6-2.6m at scale 1). Default `[0.75, 1.35]` — a
   * natural-looking size mix, never a forest of identical clones. */
  scaleRange?: [number, number];
  trunkMaterial: THREE_NS.Material;
  canopyMaterial: THREE_NS.Material;
  /** Whether the trunk/canopy cast shadows. Default false — a dense field of many small shadow
   * casters is rarely worth its budget (see `quality.ts`'s `maxShadowCasterBudget`); enable only for
   * a sparse, hero-adjacent field. */
  castShadow?: boolean;
}

export interface VegetationFieldHandle {
  group: THREE_NS.Group;
  /** How many instances were actually placed — equal to `options.count` unless 0 were requested. */
  count: number;
  dispose(): void;
}

/**
 * A scattered field of simple procedural trees (tapered cylinder trunk + icosahedron canopy) — two
 * `InstancedMesh`es total (trunks, canopies) regardless of `count`. Pass category materials from
 * `materials.ts` (e.g. `BRUSHED_METAL`-adjacent brown for trunk, a green `MeshStandardMaterial` for
 * canopy) or any caller-supplied material.
 */
export function createTreeField(THREE: typeof THREE_NS, options: TreeFieldOptions): VegetationFieldHandle {
  const points = scatter(options.count, options.width, options.depth, options.center ?? [0, 0], options.seed ?? 0x1a2b3c4d, options.scaleRange ?? [0.75, 1.35]);

  const trunkGeometry = new THREE.CylinderGeometry(0.06, 0.09, 1.6, 6);
  const canopyGeometry = new THREE.IcosahedronGeometry(0.85, 1);

  const trunkBatch = new InstanceBatch(THREE, trunkGeometry, options.trunkMaterial);
  const canopyBatch = new InstanceBatch(THREE, canopyGeometry, options.canopyMaterial);

  for (const point of points) {
    const trunkHeight = 1.6 * point.scale;
    trunkBatch.add([point.x, trunkHeight / 2, point.z], [0, point.rotationY, 0], point.scale);
    // Canopy sits atop the trunk, itself slightly randomized in width/height via a non-uniform
    // scale tuple — a pure sphere-on-a-stick reads obviously cloned even with position/rotation
    // variation; a squashed-per-instance canopy breaks that silhouette repetition cheaply.
    const canopyScaleXZ = point.scale * (0.9 + (point.rotationY % 1) * 0.25);
    const canopyScaleY = point.scale * (0.85 + ((point.rotationY * 2) % 1) * 0.3);
    canopyBatch.add(
      [point.x, trunkHeight + 0.55 * point.scale, point.z],
      [0, point.rotationY, 0],
      [canopyScaleXZ, canopyScaleY, canopyScaleXZ],
    );
  }

  const group = new THREE.Group();
  group.name = 'genesis-tree-field';
  const trunkMesh = trunkBatch.build(group as unknown as THREE_NS.Scene, options.castShadow ?? false);
  const canopyMesh = canopyBatch.build(group as unknown as THREE_NS.Scene, options.castShadow ?? false);

  return {
    group,
    count: points.length,
    dispose() {
      trunkMesh?.geometry.dispose();
      canopyMesh?.geometry.dispose();
      // Materials are caller-supplied (and typically shared across many fields/scenes) — matching
      // `materials.ts`'s own convention, this module never disposes a material it didn't create.
    },
  };
}

export interface GroundClutterOptions {
  count: number;
  width: number;
  depth: number;
  center?: [number, number];
  seed?: number;
  scaleRange?: [number, number];
  material: THREE_NS.Material;
  castShadow?: boolean;
}

/**
 * A scattered field of small, low, irregular ground clutter (rocks, low bushes, urban planting) —
 * one `InstancedMesh` of gently-deformed low-poly spheres, half-buried in the ground so the flat
 * cut base never reads as a floating clipped sphere.
 */
export function createGroundClutter(THREE: typeof THREE_NS, options: GroundClutterOptions): VegetationFieldHandle {
  const points = scatter(options.count, options.width, options.depth, options.center ?? [0, 0], options.seed ?? 0x9f1e2d3c, options.scaleRange ?? [0.5, 1.1]);
  const geometry = new THREE.IcosahedronGeometry(0.28, 0);
  const batch = new InstanceBatch(THREE, geometry, options.material);
  for (const point of points) {
    const scaleY = point.scale * 0.7; // squashed vertically — reads as a low bush/rock, not a ball
    batch.add([point.x, 0.1 * point.scale, point.z], [0, point.rotationY, 0], [point.scale, scaleY, point.scale]);
  }
  const group = new THREE.Group();
  group.name = 'genesis-ground-clutter';
  const mesh = batch.build(group as unknown as THREE_NS.Scene, options.castShadow ?? false);
  return {
    group,
    count: points.length,
    dispose() {
      mesh?.geometry.dispose();
    },
  };
}
