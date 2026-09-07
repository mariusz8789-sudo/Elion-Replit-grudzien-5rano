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

export interface StreetLightOptions {
  /** Base of the pole, at ground level. */
  position: THREE_NS.Vector3Tuple;
  /** Total pole height in world units. Explicit rather than fixed, because this kit's other pieces
   * are sized for `epidemicCity3D.ts`'s `CITY_WORLD_SCALE` (~0.018) while other scenes work in far
   * larger units — a light that only looked right at one scale would be useless to the other. */
  height: number;
  poleMaterial: THREE_NS.Material;
  /** The lamp head. Give it an emissive material for a night scene. */
  lampMaterial: THREE_NS.Material;
  /** Horizontal reach of the arm holding the lamp. Default 22% of `height`. */
  armLength?: number;
  /** Which way the arm points, radians around Y. Default 0. */
  headingRadians?: number;
}

/**
 * A street light: pole + horizontal arm + a lamp head.
 *
 * HONEST SCOPE — this is EMISSIVE GEOMETRY, not a light source. It does not add a `PointLight` and
 * does not illuminate anything around it: N real point lights is exactly the per-light shading cost
 * this engine's `shadowPolicy.ts`/`PERFORMANCE.md` budget exists to avoid, and a street full of them
 * would tank the frame. The lamp head reads as "lit" because its material is emissive (and blooms,
 * where the pipeline's bloom pass is enabled) — the surrounding ground is lit by the scene's real
 * sun/ambient rig, not by this object. A caller that genuinely needs one hero light casting real
 * illumination should add a single `lighting.ts` light itself and say so.
 */
export function createStreetLight(THREE: typeof THREE_NS, options: StreetLightOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-street-light';
  group.position.set(...options.position);
  group.rotation.y = options.headingRadians ?? 0;

  const height = options.height;
  const armLength = options.armLength ?? height * 0.22;
  const poleRadius = height * 0.012;

  group.add(createColumn(THREE, options.poleMaterial, { position: [0, 0, 0], height, radius: poleRadius }));

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(poleRadius * 0.7, poleRadius * 0.7, armLength, 6), options.poleMaterial);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(armLength / 2, height, 0);
  group.add(arm);

  const lamp = new THREE.Mesh(new THREE.BoxGeometry(height * 0.055, height * 0.022, height * 0.035), options.lampMaterial);
  lamp.position.set(armLength, height - height * 0.014, 0);
  group.add(lamp);

  return group;
}

export interface SidewalkOptions {
  /** Centreline start/end of the pavement run, at ground level. */
  from: THREE_NS.Vector3Tuple;
  to: THREE_NS.Vector3Tuple;
  /** Pavement width across the run. */
  width: number;
  /** Kerb height above the carriageway. Default 2% of `width`, min 0.02. */
  kerbHeight?: number;
  surfaceMaterial: THREE_NS.Material;
  /** Kerb face material — omit to use `surfaceMaterial`. */
  kerbMaterial?: THREE_NS.Material;
}

/**
 * A raised pavement slab with a kerb face along one edge — the single cheapest thing that makes a
 * road read as a street rather than a grey stripe, because it gives the carriageway an actual edge
 * and a height difference to catch light.
 *
 * COST: 2 meshes per run (slab + kerb), independent of length. Sized entirely from the arguments, so
 * it works at both world scales this kit serves.
 */
export function createSidewalk(THREE: typeof THREE_NS, options: SidewalkOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-sidewalk';

  const [x1, , z1] = options.from;
  const [x2, , z2] = options.to;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const kerbHeight = options.kerbHeight ?? Math.max(0.02, options.width * 0.02);

  group.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  group.rotation.y = Math.atan2(dx, dz);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(options.width, kerbHeight, length), options.surfaceMaterial);
  slab.position.y = kerbHeight / 2;
  slab.receiveShadow = true;
  group.add(slab);

  // The kerb face: a thin upstand on the carriageway side, slightly proud of the slab so it reads as
  // a separate edge under raking light rather than a painted line.
  const kerb = new THREE.Mesh(
    new THREE.BoxGeometry(kerbHeight * 0.6, kerbHeight * 1.25, length),
    options.kerbMaterial ?? options.surfaceMaterial,
  );
  kerb.position.set(-options.width / 2 + kerbHeight * 0.3, kerbHeight * 0.62, 0);
  kerb.receiveShadow = true;
  group.add(kerb);

  return group;
}

export interface RoadMarkingsOptions {
  from: THREE_NS.Vector3Tuple;
  to: THREE_NS.Vector3Tuple;
  /** Length of one painted dash. */
  dashLength: number;
  /** Unpainted gap between dashes. */
  gapLength: number;
  /** Width of the painted line. */
  width: number;
  material: THREE_NS.Material;
  /** Height above the carriageway, to avoid z-fighting. Default 0.02. */
  height?: number;
}

/**
 * A dashed centreline, batched into ONE `InstancedMesh` regardless of how many dashes it contains —
 * the same instancing discipline `vegetation.ts` and `buildingKit.createFacadeBuilding` follow, and
 * the reason a marked-up street costs 1 draw call rather than one per dash.
 *
 * Returns an empty group when the run is shorter than a single dash, rather than emitting a
 * degenerate instance.
 */
export function createRoadMarkings(THREE: typeof THREE_NS, options: RoadMarkingsOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-road-markings';

  const [x1, , z1] = options.from;
  const [x2, , z2] = options.to;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const stride = options.dashLength + options.gapLength;
  const count = Math.floor(length / stride);
  if (count < 1) return group;

  const height = options.height ?? 0.02;
  const geometry = new THREE.PlaneGeometry(options.width, options.dashLength);
  const mesh = new THREE.InstancedMesh(geometry, options.material, count);
  const dummy = new THREE.Object3D();

  // The run's own placement and heading live on the GROUP (same as `createSidewalk`), and each dash
  // is laid out in that local frame along +Z. Composing the heading into each instance's Euler angles
  // instead does NOT work: after the -90° X rotation that lays a plane flat, a further Z rotation is
  // no longer a world-space yaw, so dashes come out at wrong angles on any run that is not axis
  // aligned — a real defect this was written to avoid.
  group.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  group.rotation.y = Math.atan2(dx, dz);

  for (let i = 0; i < count; i++) {
    // Centre each dash within its own stride, then centre the whole run on the segment.
    dummy.position.set(0, height, (i + 0.5) * stride - length / 2);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}
