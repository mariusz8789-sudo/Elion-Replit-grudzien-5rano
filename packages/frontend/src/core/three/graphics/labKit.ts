import type * as THREE_NS from 'three';
import { createColumn, createPlatform } from './primitives';

/**
 * GENESIS GRAPHICS RUNTIME — Laboratory Furniture Kit
 *
 * Reusable interior furniture primitives — a bench, a cabinet, a shelf unit, a monitor — composed
 * from `primitives.ts`'s existing structural pieces (`createColumn`/`createPlatform`) rather than
 * each hand-deriving its own `BoxGeometry`/`CylinderGeometry` args. The flagship lab scene
 * (`labScene3D.ts`) still hand-builds its own hero furniture with bespoke per-object detail (worn
 * surfaces, hazard stripes, cable runs) — that stays as-is, deliberately not retrofitted here (real
 * regression risk for a hand-tuned, already-shipped scene, for no measured benefit). This kit is
 * for any NEW interior scene that needs ordinary lab/industrial furniture without re-deriving
 * `labScene3D.ts`'s bespoke geometry from scratch.
 *
 * Every function returns a plain `THREE.Group` — geometry-and-placement only, exactly
 * `primitives.ts`'s own convention: no material opinion beyond what's passed in, no scene
 * management. `position` is always where the object visually STANDS (its base), never an arbitrary
 * geometry origin, matching `createColumn`/`createPlatform`'s own convention.
 */

export interface BenchOptions {
  /** Where the bench stands (base, at the floor). */
  position: THREE_NS.Vector3Tuple;
  width: number;
  depth: number;
  /** Height of the top surface above the floor. */
  height: number;
  topThickness?: number;
  topMaterial: THREE_NS.Material;
  /** Default: same as `topMaterial`. */
  legMaterial?: THREE_NS.Material;
  legRadius?: number;
}

/** A workbench/table: one flat top platform on four legs (columns). */
export function createBench(THREE: typeof THREE_NS, options: BenchOptions): THREE_NS.Group {
  const topThickness = options.topThickness ?? 0.04;
  const legRadius = options.legRadius ?? 0.03;
  const legHeight = options.height - topThickness;
  const legMaterial = options.legMaterial ?? options.topMaterial;
  const [px, py, pz] = options.position;

  const group = new THREE.Group();
  group.name = 'genesis-lab-bench';

  const inset = 0.08;
  const legX = options.width / 2 - inset;
  const legZ = options.depth / 2 - inset;
  for (const dx of [-legX, legX]) {
    for (const dz of [-legZ, legZ]) {
      group.add(createColumn(THREE, legMaterial, { position: [px + dx, py, pz + dz], height: legHeight, radius: legRadius }));
    }
  }

  const top = createPlatform(THREE, options.topMaterial, {
    position: [px, py + legHeight + topThickness / 2, pz],
    thickness: topThickness, shape: 'box', width: options.width, depth: options.depth,
  });
  group.add(top);
  return group;
}

export interface CabinetOptions {
  /** Where the cabinet stands (base, at the floor). */
  position: THREE_NS.Vector3Tuple;
  width: number;
  depth: number;
  height: number;
  bodyMaterial: THREE_NS.Material;
  /** Default: same as `bodyMaterial`. */
  doorMaterial?: THREE_NS.Material;
  handleMaterial?: THREE_NS.Material;
}

/** A storage cabinet: a box body with a slightly-inset door panel and a small handle — reads as a
 * real cabinet rather than a bare box, without per-scene bespoke geometry. */
export function createCabinet(THREE: typeof THREE_NS, options: CabinetOptions): THREE_NS.Group {
  const [px, py, pz] = options.position;
  const group = new THREE.Group();
  group.name = 'genesis-lab-cabinet';

  const body = new THREE.Mesh(new THREE.BoxGeometry(options.width, options.height, options.depth), options.bodyMaterial);
  body.position.set(px, py + options.height / 2, pz);
  group.add(body);

  const doorInset = 0.04;
  const doorWidth = options.width - doorInset * 2;
  const doorHeight = options.height - doorInset * 2;
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(doorWidth, doorHeight),
    options.doorMaterial ?? options.bodyMaterial,
  );
  door.position.set(px, py + options.height / 2, pz + options.depth / 2 + 0.002);
  group.add(door);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, options.height * 0.16, 8),
    options.handleMaterial ?? options.bodyMaterial,
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.set(px + doorWidth / 2 - 0.03, py + options.height / 2, pz + options.depth / 2 + 0.015);
  group.add(handle);

  return group;
}

export interface ShelfUnitOptions {
  /** Where the unit stands (base, at the floor). */
  position: THREE_NS.Vector3Tuple;
  width: number;
  depth: number;
  height: number;
  /** How many shelf platforms, evenly spaced from floor to `height` inclusive. Default 4. */
  shelfCount?: number;
  material: THREE_NS.Material;
  shelfThickness?: number;
  /** Default: same as `material`. */
  frameMaterial?: THREE_NS.Material;
}

/** A shelving unit: N evenly-spaced platforms on two corner-post supports. */
export function createShelfUnit(THREE: typeof THREE_NS, options: ShelfUnitOptions): THREE_NS.Group {
  if (!(options.height > 0)) throw new Error(`createShelfUnit: height must be > 0 (got ${options.height})`);
  const shelfCount = Math.max(2, Math.round(options.shelfCount ?? 4));
  const shelfThickness = options.shelfThickness ?? 0.025;
  const [px, py, pz] = options.position;
  const group = new THREE.Group();
  group.name = 'genesis-lab-shelf-unit';

  const postRadius = 0.02;
  const postX = options.width / 2 - postRadius;
  const postZ = options.depth / 2 - postRadius;
  const frameMaterial = options.frameMaterial ?? options.material;
  for (const dx of [-postX, postX]) {
    for (const dz of [-postZ, postZ]) {
      group.add(createColumn(THREE, frameMaterial, { position: [px + dx, py, pz + dz], height: options.height, radius: postRadius }));
    }
  }

  for (let i = 0; i < shelfCount; i++) {
    const t = shelfCount === 1 ? 1 : i / (shelfCount - 1);
    const shelfY = py + t * (options.height - shelfThickness) + shelfThickness / 2;
    group.add(createPlatform(THREE, options.material, {
      position: [px, shelfY, pz], thickness: shelfThickness, shape: 'box', width: options.width, depth: options.depth,
    }));
  }

  return group;
}

export interface MonitorOptions {
  /** Where the monitor's stand base sits (at the floor/bench top). */
  position: THREE_NS.Vector3Tuple;
  width: number;
  height: number;
  standHeight?: number;
  frameMaterial: THREE_NS.Material;
  /** A `createScreenMaterial`-built material (live readout) or any other emissive/plain material.
   * Defaults to a dark, faintly emissive standby-screen look if omitted. */
  screenMaterial?: THREE_NS.Material;
}

/** A monitor/display on a stand — a thin frame box with an inset screen plane, on a column stand.
 * Pass `materials.ts`'s `createScreenMaterial(THREE, texture)` for a live readout, or omit
 * `screenMaterial` for a plausible standby-screen default. */
export function createMonitor(THREE: typeof THREE_NS, options: MonitorOptions): THREE_NS.Group {
  const standHeight = options.standHeight ?? 0.35;
  const frameDepth = 0.03;
  const [px, py, pz] = options.position;
  const group = new THREE.Group();
  group.name = 'genesis-lab-monitor';

  group.add(createColumn(THREE, options.frameMaterial, { position: [px, py, pz], height: standHeight, radius: 0.015 }));

  const screenCenterY = py + standHeight + options.height / 2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(options.width, options.height, frameDepth), options.frameMaterial);
  frame.position.set(px, screenCenterY, pz);
  group.add(frame);

  const screenMaterial = options.screenMaterial ?? new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0x11304a, emissiveIntensity: 0.3, roughness: 0.35 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(options.width * 0.92, options.height * 0.88), screenMaterial);
  screen.position.set(px, screenCenterY, pz + frameDepth / 2 + 0.002);
  group.add(screen);

  return group;
}
