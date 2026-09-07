import type * as THREE_NS from 'three';
import { createColumn, createPlatform, createPipe } from './primitives';
import { applyVisualState, type CanonicalVisualState } from './visualState';

/**
 * GENESIS GRAPHICS RUNTIME — Water/Fluid Infrastructure Kit
 *
 * Reusable pump/valve/tank geometry, composed from `primitives.ts`, with a status indicator driven
 * through the SAME `visualState.ts` vocabulary every other discrete-state indicator in this engine
 * uses — `CanonicalVisualState`'s `NORMAL`/`WARNING`/`OFFLINE`/`FAILURE` states map directly onto
 * this mission's own NORMAL/WARNING/FAILED/OFFLINE pump vocabulary (`FAILED` reads as `FAILURE`).
 *
 * CRITICAL BOUNDARY (see this engine's own "no fake C3 entities" rule): `createPump`/`createValve`
 * default their indicator to `'NORMAL'` and never invent pressure/flow/failure data — a caller
 * wiring this to a REAL C3 pump feed calls `.setState(...)` with a state resolved from that real
 * feed (or from a WorldFrame entity's `status`). Used with no real feed at all (as decorative
 * physical apparatus — e.g. lab plumbing that isn't itself a monitored C3 entity), the indicator
 * simply stays at its default `NORMAL` "installed and idle" reading — never a fabricated
 * WARNING/FAILURE the caller didn't actually observe. That distinction (decorative apparatus vs. a
 * live state indicator) is the caller's to make, not this module's.
 */

const WATER_STATE_TO_VISUAL: Readonly<Record<'NORMAL' | 'WARNING' | 'FAILED' | 'OFFLINE', CanonicalVisualState>> = {
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  FAILED: 'FAILURE',
  OFFLINE: 'OFFLINE',
};

export type WaterInfrastructureState = keyof typeof WATER_STATE_TO_VISUAL;

export interface PumpOptions {
  /** Where the pump housing stands (base, at the floor/ground). */
  position: THREE_NS.Vector3Tuple;
  headingRadians?: number;
  housingMaterial: THREE_NS.Material;
  pipeMaterial?: THREE_NS.Material;
  state?: WaterInfrastructureState;
}

export interface WaterComponentHandle {
  group: THREE_NS.Group;
  state: WaterInfrastructureState;
  /** Drives the status light from an already-resolved state — never computes one itself. */
  setState(state: WaterInfrastructureState): void;
  dispose(): void;
}

/** A pump station: a box housing on a plinth, a short inlet/outlet pipe stub on each side, and a
 * status light driven by `visualState.ts`. */
export function createPump(THREE: typeof THREE_NS, options: PumpOptions): WaterComponentHandle {
  const group = new THREE.Group();
  group.name = 'genesis-water-pump';
  group.rotation.y = options.headingRadians ?? 0;
  group.position.set(...options.position);

  const plinthHeight = 0.03;
  const housingHeight = 0.14;
  const housingWidth = 0.12;
  const housingDepth = 0.09;

  group.add(createPlatform(THREE, options.housingMaterial, {
    position: [0, plinthHeight / 2, 0], thickness: plinthHeight, shape: 'box', width: housingWidth * 1.1, depth: housingDepth * 1.1,
  }));
  const housing = new THREE.Mesh(new THREE.BoxGeometry(housingWidth, housingHeight, housingDepth), options.housingMaterial);
  housing.position.y = plinthHeight + housingHeight / 2;
  housing.castShadow = true;
  group.add(housing);

  const pipeMaterial = options.pipeMaterial ?? options.housingMaterial;
  const pipeY = plinthHeight + housingHeight * 0.6;
  const inlet = createPipe(THREE, pipeMaterial, {
    from: [-housingWidth / 2 - 0.06, pipeY, 0], to: [-housingWidth / 2, pipeY, 0], radius: 0.014,
  });
  const outlet = createPipe(THREE, pipeMaterial, {
    from: [housingWidth / 2, pipeY, 0], to: [housingWidth / 2 + 0.06, pipeY, 0], radius: 0.014,
  });
  group.add(inlet, outlet);

  const lightMaterial = new THREE.MeshStandardMaterial({ emissive: 0x3ddc84, emissiveIntensity: 0.22, color: 0x1a1a1a, roughness: 0.4 });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), lightMaterial);
  light.position.set(0, plinthHeight + housingHeight + 0.014, housingDepth / 2 - 0.01);
  group.add(light);

  let state: WaterInfrastructureState = options.state ?? 'NORMAL';
  function applyState(next: WaterInfrastructureState): void {
    state = next;
    applyVisualState(lightMaterial, THREE, WATER_STATE_TO_VISUAL[next]);
  }
  applyState(state);

  group.userData.visualOnlyInfrastructure = true;

  return {
    group,
    get state() { return state; },
    setState: applyState,
    dispose() {
      housing.geometry.dispose();
      inlet.geometry.dispose();
      outlet.geometry.dispose();
      light.geometry.dispose();
      lightMaterial.dispose();
    },
  };
}

export interface ValveOptions {
  position: THREE_NS.Vector3Tuple;
  material: THREE_NS.Material;
}

/** A hand-wheel valve on a pipe: a short cylinder body with a flat spoked wheel — the visually
 * recognizable "there is a valve here" landmark on any pipe run. */
export function createValve(THREE: typeof THREE_NS, options: ValveOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-water-valve';
  group.position.set(...options.position);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), options.material);
  body.rotation.z = Math.PI / 2;
  group.add(body);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 12), options.material);
  wheel.rotation.y = Math.PI / 2;
  wheel.position.y = 0.03;
  group.add(wheel);
  return group;
}

export interface StorageTankOptions {
  /** Where the tank stands (base, at the ground). */
  position: THREE_NS.Vector3Tuple;
  radius: number;
  height: number;
  bodyMaterial: THREE_NS.Material;
  legMaterial?: THREE_NS.Material;
  /** Raises the tank on support legs (a common elevated reservoir look). Default true. */
  elevated?: boolean;
}

/** A cylindrical storage tank/reservoir, optionally elevated on four support legs. */
export function createStorageTank(THREE: typeof THREE_NS, options: StorageTankOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-water-storage-tank';
  const [px, py, pz] = options.position;
  const elevated = options.elevated ?? true;
  const legHeight = elevated ? options.height * 0.5 : 0;
  const legMaterial = options.legMaterial ?? options.bodyMaterial;

  if (elevated) {
    const legRadius = options.radius * 0.06;
    const legInset = options.radius * 0.72;
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      group.add(createColumn(THREE, legMaterial, {
        position: [px + Math.cos(angle) * legInset, py, pz + Math.sin(angle) * legInset], height: legHeight, radius: legRadius,
      }));
    }
  }

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(options.radius, options.radius, options.height, 20), options.bodyMaterial);
  tank.position.set(px, py + legHeight + options.height / 2, pz);
  tank.castShadow = true;
  group.add(tank);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(options.radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), options.bodyMaterial);
  cap.position.set(px, py + legHeight + options.height, pz);
  group.add(cap);

  return group;
}

export interface PipeNetworkOptions {
  /** Ordered waypoints the pipe run passes through, connected as consecutive straight segments. */
  waypoints: THREE_NS.Vector3Tuple[];
  radius: number;
  material: THREE_NS.Material;
}

/** Connects a sequence of waypoints into a multi-segment pipe run — thin wrapper over
 * `primitives.ts`'s `createPipe` for the common "pump to tank to building" case, so callers don't
 * hand-loop consecutive pairs themselves. Throws if fewer than 2 waypoints are given. */
export function createPipeNetwork(THREE: typeof THREE_NS, options: PipeNetworkOptions): THREE_NS.Group {
  if (options.waypoints.length < 2) throw new Error('createPipeNetwork: at least 2 waypoints are required');
  const group = new THREE.Group();
  group.name = 'genesis-water-pipe-network';
  for (let i = 0; i < options.waypoints.length - 1; i++) {
    group.add(createPipe(THREE, options.material, { from: options.waypoints[i]!, to: options.waypoints[i + 1]!, radius: options.radius }));
  }
  return group;
}
