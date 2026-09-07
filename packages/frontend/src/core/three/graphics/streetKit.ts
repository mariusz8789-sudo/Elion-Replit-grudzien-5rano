import type * as THREE_NS from 'three';
import { createColumn, createPlatform } from './primitives';

/**
 * GENESIS GRAPHICS RUNTIME — Street Furniture Kit
 *
 * Reusable street-level furniture — bench, litter bin, fire hydrant, planter, bollard barrier,
 * utility box — composed from `primitives.ts`'s existing column/platform pieces, the same
 * convention `labKit.ts` already uses for interior furniture. Scaled for the same street-level
 * world units `epidemicCity3D.ts`/`highFidelitySlice3D.ts` already use (a bench seat sits ~0.1m off
 * the ground, a hydrant stands ~0.16m tall) — these are meant to scatter along the SAME sidewalks
 * those scenes already build, not a second street system.
 *
 * Every function returns a plain `THREE.Group`, geometry-and-placement only, no material opinion
 * beyond what's passed in, no scene management — matching `labKit.ts`/`primitives.ts` exactly.
 */

export interface StreetBenchOptions {
  /** Where the bench stands (base, at the ground). */
  position: THREE_NS.Vector3Tuple;
  headingRadians?: number;
  seatMaterial: THREE_NS.Material;
  legMaterial?: THREE_NS.Material;
}

/** A two-seat outdoor bench: a plank seat + backrest on four short legs. */
export function createStreetBench(THREE: typeof THREE_NS, options: StreetBenchOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-street-bench';
  group.rotation.y = options.headingRadians ?? 0;
  group.position.set(...options.position);
  const legMaterial = options.legMaterial ?? options.seatMaterial;
  const legHeight = 0.10;
  const width = 0.36;
  const depth = 0.10;
  for (const dx of [-width / 2 + 0.02, width / 2 - 0.02]) {
    group.add(createColumn(THREE, legMaterial, { position: [dx, 0, -depth / 2 + 0.01], height: legHeight, radius: 0.008 }));
    group.add(createColumn(THREE, legMaterial, { position: [dx, 0, depth / 2 - 0.01], height: legHeight, radius: 0.008 }));
  }
  const seat = createPlatform(THREE, options.seatMaterial, { position: [0, legHeight + 0.008, 0], thickness: 0.016, shape: 'box', width, depth });
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.11, 0.014), options.seatMaterial);
  back.position.set(0, legHeight + 0.008 + 0.055, -depth / 2 + 0.007);
  back.rotation.x = -0.18;
  group.add(seat, back);
  return group;
}

export interface TrashBinOptions {
  position: THREE_NS.Vector3Tuple;
  material: THREE_NS.Material;
}

/** A cylindrical litter bin with a slightly wider lid rim. */
export function createTrashBin(THREE: typeof THREE_NS, options: TrashBinOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-street-trash-bin';
  group.position.set(...options.position);
  const bodyHeight = 0.14;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, bodyHeight, 12), options.material);
  body.position.y = bodyHeight / 2;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12), options.material);
  lid.position.y = bodyHeight + 0.006;
  group.add(body, lid);
  return group;
}

export interface HydrantOptions {
  position: THREE_NS.Vector3Tuple;
  material: THREE_NS.Material;
}

/** A fire hydrant — a squat body with two side nozzles and a domed cap. Small but a real,
 * recognizable silhouette rather than an unlabeled cylinder. */
export function createHydrant(THREE: typeof THREE_NS, options: HydrantOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-street-hydrant';
  group.position.set(...options.position);
  const bodyHeight = 0.14;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, bodyHeight, 10), options.material);
  body.position.y = bodyHeight / 2;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), options.material);
  cap.position.y = bodyHeight;
  group.add(body, cap);
  for (const side of [-1, 1] as const) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), options.material);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(side * 0.045, bodyHeight * 0.62, 0);
    group.add(nozzle);
  }
  return group;
}

export interface PlanterOptions {
  position: THREE_NS.Vector3Tuple;
  material: THREE_NS.Material;
  /** Optional plant canopy material — a small green sphere sitting in the planter. Omit for an
   * empty planter box. */
  foliageMaterial?: THREE_NS.Material;
}

/** A raised square planter box, optionally topped with a small foliage clump. */
export function createPlanter(THREE: typeof THREE_NS, options: PlanterOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-street-planter';
  group.position.set(...options.position);
  const height = 0.10;
  const box = createPlatform(THREE, options.material, { position: [0, height / 2, 0], thickness: height, shape: 'box', width: 0.16, depth: 0.16 });
  group.add(box);
  if (options.foliageMaterial) {
    const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), options.foliageMaterial);
    foliage.position.y = height + 0.05;
    group.add(foliage);
  }
  return group;
}

export interface BollardBarrierOptions {
  /** Start point of the barrier run, at the ground. */
  from: THREE_NS.Vector3Tuple;
  to: THREE_NS.Vector3Tuple;
  /** How many bollard posts along the run (evenly spaced, endpoints included). Default 3. */
  postCount?: number;
  material: THREE_NS.Material;
}

/** A run of low bollard posts between two points — a pedestrian barrier / restricted-access edge,
 * not a solid wall (matches the proven low-poly-but-legible convention every other kit here uses). */
export function createBollardBarrier(THREE: typeof THREE_NS, options: BollardBarrierOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-street-bollard-barrier';
  const postCount = Math.max(2, Math.round(options.postCount ?? 3));
  const [fx, fy, fz] = options.from;
  const [tx, ty, tz] = options.to;
  for (let i = 0; i < postCount; i++) {
    const t = i / (postCount - 1);
    group.add(createColumn(THREE, options.material, {
      position: [fx + (tx - fx) * t, fy + (ty - fy) * t, fz + (tz - fz) * t],
      height: 0.09, radius: 0.012,
    }));
  }
  return group;
}

export interface UtilityBoxOptions {
  position: THREE_NS.Vector3Tuple;
  headingRadians?: number;
  material: THREE_NS.Material;
}

/** A curbside utility/junction box — a squat panelled cabinet, the kind of small infrastructure
 * detail that reads as "a real serviced street" rather than an empty sidewalk. */
export function createUtilityBox(THREE: typeof THREE_NS, options: UtilityBoxOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-street-utility-box';
  group.rotation.y = options.headingRadians ?? 0;
  group.position.set(...options.position);
  const height = 0.09;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, height, 0.05), options.material);
  body.position.y = height / 2;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.045, height * 0.7), options.material);
  panel.position.set(0, height / 2, 0.026);
  group.add(body, panel);
  return group;
}
