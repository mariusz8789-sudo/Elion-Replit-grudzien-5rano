import type * as THREE_NS from 'three';
import { applyVisualState, type CanonicalVisualState } from './visualState';

/**
 * GENESIS GRAPHICS RUNTIME — Vehicle Kit
 *
 * Reusable low-poly vehicle bodies (car/van/bus/truck/ambulance) for city/street scenes —
 * body + glass + wheels + a light-bar/headlight indicator, deterministic per-vehicle variation
 * (dimension jitter + hue), and a small discrete state vocabulary driven through the same
 * `visualState.ts` this engine already uses for every other discrete-state indicator.
 *
 * EXPLICITLY NOT a physics/traffic engine: `VehicleState` is a caller-supplied label (PARKED,
 * MOVING, STOPPED, EMERGENCY, OFFLINE) that only changes how the vehicle's own lights read — no
 * wheel rotation physics, no path-following, no collision. A caller that wants a vehicle to move
 * along a road repositions the returned `group` itself (or drives it with `graphics/animation.ts`),
 * exactly the same "kit owns geometry, caller owns motion" boundary `vegetation.ts`/`labKit.ts`
 * already use.
 *
 * Every vehicle here is DECORATIVE city population, the same status as `epidemicCity3D.ts`'s own
 * `createContextBuilding`/street furniture — it never claims to be a WorldFrame/C3 entity. A
 * vehicle standing in for a REAL C3-tracked asset (e.g. a specific ambulance run C3 is actually
 * modeling) must come from a WorldFrame entity instead, per this engine's own "WorldFrame is
 * source of truth" rule — this kit only supplies the geometry either use case needs.
 */

export type VehicleKind = 'car' | 'van' | 'bus' | 'truck' | 'ambulance';
export type VehicleState = 'PARKED' | 'MOVING' | 'STOPPED' | 'EMERGENCY' | 'OFFLINE';

/** How each `VehicleState` reads on the light-bar/headlight indicator — reusing the same canonical
 * vocabulary every other discrete-state indicator in this engine uses, rather than a bespoke
 * red/green ladder invented just for vehicles. */
const VEHICLE_STATE_TO_VISUAL: Readonly<Record<VehicleState, CanonicalVisualState>> = {
  PARKED: 'INACTIVE',
  MOVING: 'ACTIVE',
  STOPPED: 'NORMAL',
  EMERGENCY: 'CRITICAL',
  OFFLINE: 'OFFLINE',
};

interface VehicleDimensions {
  length: number;
  width: number;
  height: number;
  cabinHeight: number;
  wheelRadius: number;
}

const VEHICLE_DIMENSIONS: Readonly<Record<VehicleKind, VehicleDimensions>> = {
  car: { length: 0.42, width: 0.18, height: 0.14, cabinHeight: 0.10, wheelRadius: 0.042 },
  van: { length: 0.50, width: 0.19, height: 0.20, cabinHeight: 0.17, wheelRadius: 0.048 },
  ambulance: { length: 0.54, width: 0.20, height: 0.22, cabinHeight: 0.19, wheelRadius: 0.05 },
  truck: { length: 0.62, width: 0.21, height: 0.24, cabinHeight: 0.18, wheelRadius: 0.055 },
  bus: { length: 0.92, width: 0.23, height: 0.27, cabinHeight: 0.22, wheelRadius: 0.058 },
};

/** Same mulberry32 deterministic PRNG duplicated in `vegetation.ts`/`materials.ts` — kept as a
 * local copy per this engine's own established convention (see `vegetation.ts`'s doc) rather than
 * introducing a shared module just for a one-line generator. */
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

export interface VehicleOptions {
  kind: VehicleKind;
  /** Where the vehicle stands (base, at the road surface), NOT the geometry center. */
  position: THREE_NS.Vector3Tuple;
  /** Heading around Y, radians. 0 = facing +Z. Default 0. */
  headingRadians?: number;
  state?: VehicleState;
  bodyMaterial: THREE_NS.Material;
  glassMaterial?: THREE_NS.Material;
  wheelMaterial?: THREE_NS.Material;
  /** Deterministic seed for per-vehicle size/hue jitter — vary this per placement (e.g. from the
   * road position) so a row of parked cars never reads as identical clones. Default 0. */
  seed?: number;
}

export interface VehicleHandle {
  group: THREE_NS.Group;
  kind: VehicleKind;
  state: VehicleState;
  /** Re-applies a new state's light-bar presentation without rebuilding the vehicle. */
  setState(state: VehicleState): void;
  dispose(): void;
}

/** A body/glass/wheels vehicle with a state-driven light indicator. `glassMaterial`/`wheelMaterial`
 * default to plain dark-tinted standards when omitted — pass `materials.ts` categories
 * (`BRUSHED_METAL` for wheels, a dark glass standard) for the shared-palette look. */
export function createVehicle(THREE: typeof THREE_NS, options: VehicleOptions): VehicleHandle {
  const dims = VEHICLE_DIMENSIONS[options.kind];
  const rand = mulberry32((options.seed ?? 0) * 2654435761 + 1);
  const jitter = 0.92 + rand() * 0.16; // +/-8% size jitter — a row of the same kind never clones exactly
  const length = dims.length * jitter;
  const width = dims.width * jitter;
  const height = dims.height * jitter;
  const cabinHeight = dims.cabinHeight * jitter;
  const wheelRadius = dims.wheelRadius;

  const group = new THREE.Group();
  group.name = `genesis-vehicle-${options.kind}`;
  group.rotation.y = options.headingRadians ?? 0;
  group.position.set(...options.position);

  const bodyMaterial = options.bodyMaterial;
  const glassMaterial = options.glassMaterial ?? new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.22, metalness: 0.35 });
  const wheelMaterial = options.wheelMaterial ?? new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.75, metalness: 0.1 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), bodyMaterial);
  chassis.position.y = wheelRadius + height / 2;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  const cabinLength = options.kind === 'bus' || options.kind === 'truck' ? length * 0.62 : length * 0.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, cabinHeight, cabinLength), glassMaterial);
  cabin.position.set(0, wheelRadius + height + cabinHeight / 2, -length * 0.06);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, width * 0.12, 12);
  const axleX = width / 2 - width * 0.02;
  const axleZ = length / 2 - wheelRadius * 1.3;
  for (const dx of [-axleX, axleX]) {
    for (const dz of [-axleZ, axleZ]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(dx, wheelRadius, dz);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  // Mirror proxies — small boxes, not modeled mirrors, matching this kit's "reads correctly from a
  // street-level glance, not a close-up prop" scope.
  const mirrorMaterial = bodyMaterial;
  for (const side of [-1, 1] as const) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.03), mirrorMaterial);
    mirror.position.set(side * (width / 2 + 0.01), wheelRadius + height + cabinHeight * 0.7, length * 0.18);
    group.add(mirror);
  }

  // Headlight/taillight pair doubles as the ambulance light-bar indicator — one material, driven by
  // `applyVisualState` below, so EMERGENCY reads as a real (if simplified) flashing bar without a
  // second, bespoke ambulance-only lighting path.
  const lightMaterial = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 0.2, color: 0x222222, roughness: 0.4 });
  const lightGeometry = options.kind === 'ambulance'
    ? new THREE.BoxGeometry(width * 0.7, 0.02, 0.05)
    : new THREE.BoxGeometry(0.03, 0.02, 0.02);
  if (options.kind === 'ambulance') {
    const bar = new THREE.Mesh(lightGeometry, lightMaterial);
    bar.position.set(0, wheelRadius + height + cabinHeight + 0.02, -length * 0.06);
    group.add(bar);
  } else {
    for (const side of [-1, 1] as const) {
      const headlight = new THREE.Mesh(lightGeometry, lightMaterial);
      headlight.position.set(side * width * 0.32, wheelRadius + height * 0.55, length / 2 + 0.005);
      group.add(headlight);
    }
  }

  if (options.kind === 'ambulance') {
    const crossMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.03, 0.005), crossMaterial);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(width * 0.16, 0.09, 0.005), crossMaterial);
    crossH.position.set(0, wheelRadius + height * 0.6, length / 2 + 0.003);
    crossV.position.copy(crossH.position);
    group.add(crossH, crossV);
  }

  let state: VehicleState = options.state ?? 'PARKED';
  function applyState(next: VehicleState): void {
    state = next;
    applyVisualState(lightMaterial, THREE, VEHICLE_STATE_TO_VISUAL[next], { updateBaseColor: false });
  }
  applyState(state);

  group.userData.visualOnlyVehicle = true;
  group.userData.vehicleKind = options.kind;

  return {
    group,
    kind: options.kind,
    get state() { return state; },
    setState: applyState,
    dispose() {
      chassis.geometry.dispose();
      cabin.geometry.dispose();
      wheelGeometry.dispose();
      lightGeometry.dispose();
      // bodyMaterial/glassMaterial-when-caller-supplied are caller-owned — matching every other kit
      // in this engine, only materials THIS function created (the defaults, plus light/cross) are
      // disposed here.
      if (!options.glassMaterial) glassMaterial.dispose();
      if (!options.wheelMaterial) wheelMaterial.dispose();
      lightMaterial.dispose();
    },
  };
}
