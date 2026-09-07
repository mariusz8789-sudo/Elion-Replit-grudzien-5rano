import type * as THREE_NS from 'three';
import { createColumn, createPlatform, createPipe } from './primitives';

/**
 * GENESIS GRAPHICS RUNTIME — Electrical / Industrial Infrastructure Kit
 *
 * Ground-level electrical/mechanical infrastructure, distinct from what already exists: `streetKit.
 * ts`'s `createUtilityBox` is a small curbside junction box; `buildingKit.ts`'s
 * `createRooftopEquipment` is roof-mounted HVAC; `waterInfrastructure.ts` is fluid systems. This kit
 * covers the ground-level electrical/mechanical scale those don't: a floor-standing switchgear/
 * electrical cabinet, a run of conduit/cable tray with periodic mounting brackets, and a ground-
 * mounted HVAC condenser unit (an AC compressor with a fan grille, the ground-level counterpart to
 * the rooftop condensers `createRooftopEquipment` already places).
 *
 * NO ELECTRICAL STATE OF ANY KIND is modeled or guessed here — no voltage, no load, no on/off, no
 * fault condition. This is explicitly groundwork for whenever C3 publishes a real generator/
 * electrical-grid entity (see `graphics/waterInfrastructureBridge.ts`'s own doc for the identical
 * "seam, not science" boundary this engine already established for water infrastructure): these
 * functions supply GEOMETRY ONLY, generic enough that a real future WorldFrame entity's status could
 * drive a status-light material the same way `waterInfrastructure.ts`'s pump already does, without
 * this file inventing what that status IS today. A caller that wants a discrete-state indicator on
 * any of these should apply `visualState.ts` to a caller-supplied material exactly as
 * `waterInfrastructure.ts`'s `createPump` does — not something this kit hardcodes.
 *
 * Every function returns a plain `THREE.Group`, geometry-and-placement only, matching every other
 * kit in this engine (`primitives.ts`/`labKit.ts`/`streetKit.ts`/`signageKit.ts`).
 */

export interface ElectricalCabinetOptions {
  /** Where the cabinet stands (base, at the ground). */
  position: THREE_NS.Vector3Tuple;
  headingRadians?: number;
  width?: number;
  depth?: number;
  height?: number;
  bodyMaterial: THREE_NS.Material;
  doorMaterial?: THREE_NS.Material;
  /** A hazard stripe band near the base — real switchgear cabinets are almost always marked this
   * way. Omit for a plain, unmarked cabinet. */
  hazardStripeMaterial?: THREE_NS.Material;
}

/** A floor-standing electrical/switchgear cabinet: a box body on a low plinth, an inset door seam,
 * a small ventilation louvre, and an optional hazard stripe — reads as "there is real electrical
 * infrastructure here" without any invented electrical state. */
export function createElectricalCabinet(THREE: typeof THREE_NS, options: ElectricalCabinetOptions): THREE_NS.Group {
  const width = options.width ?? 0.16;
  const depth = options.depth ?? 0.12;
  const height = options.height ?? 0.42;
  const plinthHeight = 0.03;
  const group = new THREE.Group();
  group.name = 'genesis-electrical-cabinet';
  group.rotation.y = options.headingRadians ?? 0;
  group.position.set(...options.position);

  group.add(createPlatform(THREE, options.bodyMaterial, {
    position: [0, plinthHeight / 2, 0], thickness: plinthHeight, shape: 'box', width: width * 1.08, depth: depth * 1.08,
  }));
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), options.bodyMaterial);
  body.position.y = plinthHeight + height / 2;
  group.add(body);

  const doorInset = 0.01;
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(width - doorInset * 2, height - doorInset * 2),
    options.doorMaterial ?? options.bodyMaterial,
  );
  door.position.set(0, plinthHeight + height / 2, depth / 2 + 0.002);
  group.add(door);

  const louvreMaterial = options.doorMaterial ?? options.bodyMaterial;
  for (let i = 0; i < 3; i++) {
    const louvre = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.006, 0.01), louvreMaterial);
    louvre.position.set(0, plinthHeight + height * 0.86 - i * 0.02, depth / 2 + 0.006);
    group.add(louvre);
  }

  if (options.hazardStripeMaterial) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.005, 0.03, depth + 0.005), options.hazardStripeMaterial);
    stripe.position.y = plinthHeight + 0.04;
    group.add(stripe);
  }

  return group;
}

export interface ConduitRunOptions {
  /** Ordered waypoints the conduit run passes through — the SAME "caller supplies real endpoints"
   * convention `waterInfrastructure.ts`'s `createPipeNetwork` uses. */
  waypoints: readonly THREE_NS.Vector3Tuple[];
  radius?: number;
  material: THREE_NS.Material;
  /** Adds a small mounting bracket at each interior waypoint (never at the two open ends) — the
   * detail that reads as "clipped to a wall/structure" rather than a conduit floating in space.
   * Omit for a run with no real mounting surface behind it. */
  bracketMaterial?: THREE_NS.Material;
  bracketDrop?: number;
}

/** A run of conduit/cable tray between real waypoints, with an optional mounting bracket at each
 * interior joint — thin wrapper over `primitives.ts`'s `createPipe`, matching
 * `waterInfrastructure.ts`'s `createPipeNetwork` convention exactly (this is the electrical
 * equivalent of that same pattern, kept as a separate function since a caller reasoning about
 * conduit runs shouldn't have to import a water-domain module to get one). */
export function createConduitRun(THREE: typeof THREE_NS, options: ConduitRunOptions): THREE_NS.Group {
  if (options.waypoints.length < 2) throw new Error('createConduitRun: at least 2 waypoints are required');
  const radius = options.radius ?? 0.012;
  const group = new THREE.Group();
  group.name = 'genesis-conduit-run';
  for (let i = 0; i < options.waypoints.length - 1; i++) {
    group.add(createPipe(THREE, options.material, { from: options.waypoints[i]!, to: options.waypoints[i + 1]!, radius }));
  }
  if (options.bracketMaterial) {
    const bracketDrop = options.bracketDrop ?? radius * 3;
    for (let i = 1; i < options.waypoints.length - 1; i++) {
      const [x, y, z] = options.waypoints[i]!;
      group.add(createColumn(THREE, options.bracketMaterial, { position: [x, y - bracketDrop, z], height: bracketDrop, radius: radius * 0.5 }));
    }
  }
  return group;
}

export interface CondenserUnitOptions {
  /** Where the unit stands (base, at the ground). */
  position: THREE_NS.Vector3Tuple;
  headingRadians?: number;
  width?: number;
  depth?: number;
  height?: number;
  bodyMaterial: THREE_NS.Material;
  fanMaterial?: THREE_NS.Material;
}

/** A ground-mounted HVAC condenser unit: a box body on short feet, a circular fan grille on top —
 * the ground-level counterpart to `buildingKit.ts`'s roof-mounted `createRooftopEquipment` boxes,
 * for a building whose service equipment sits at grade (a service yard, an alley) instead of the
 * roof. */
export function createCondenserUnit(THREE: typeof THREE_NS, options: CondenserUnitOptions): THREE_NS.Group {
  const width = options.width ?? 0.14;
  const depth = options.depth ?? 0.14;
  const height = options.height ?? 0.16;
  const footHeight = 0.02;
  const group = new THREE.Group();
  group.name = 'genesis-condenser-unit';
  group.rotation.y = options.headingRadians ?? 0;
  group.position.set(...options.position);

  const footRadius = 0.008;
  const footInsetX = width / 2 - footRadius * 1.5;
  const footInsetZ = depth / 2 - footRadius * 1.5;
  for (const dx of [-footInsetX, footInsetX]) {
    for (const dz of [-footInsetZ, footInsetZ]) {
      group.add(createColumn(THREE, options.bodyMaterial, { position: [dx, 0, dz], height: footHeight, radius: footRadius }));
    }
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), options.bodyMaterial);
  body.position.y = footHeight + height / 2;
  group.add(body);

  const fanGeometry = new THREE.CylinderGeometry(Math.min(width, depth) * 0.42, Math.min(width, depth) * 0.42, 0.012, 20);
  const fan = new THREE.Mesh(fanGeometry, options.fanMaterial ?? options.bodyMaterial);
  fan.position.y = footHeight + height + 0.006;
  group.add(fan);

  return group;
}
