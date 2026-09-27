import type * as THREE_NS from 'three';
import type { RenderTier } from './quality';
import { disposeSceneResources } from './graphics/lifecycle';
import { markPremiumPresentation, premiumVisualBudget, seededUnit, visualSeed } from './graphics/premiumVisualPolicy';

export interface PremiumLabBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface PremiumLabStationLike {
  readonly kind: string;
  readonly position: { readonly x: number; readonly z: number };
  readonly facing: number;
}

export interface PremiumLabDetailOptions {
  readonly world: 'physics' | 'biology';
  readonly room: PremiumLabBounds;
  readonly ceilingY: number;
  readonly stations: readonly PremiumLabStationLike[];
  readonly tier: RenderTier;
}

export interface PremiumLabDetailHandle {
  readonly root: THREE_NS.Group;
  readonly summary: {
    readonly world: PremiumLabDetailOptions['world'];
    readonly serviceRailCount: number;
    readonly ventCount: number;
    readonly keyCount: number;
    readonly stationCount: number;
  };
  update(elapsedSeconds: number): void;
  dispose(): void;
}

const KEYBOARD_STATION_KINDS = new Set([
  'synthesizer',
  'collider',
  'epidemiology',
  'neuro',
  'microscopy',
  'histology',
  'compute',
  'evidence',
  'safety',
]);

function buildInstanced(
  THREE: typeof THREE_NS,
  name: string,
  geometry: THREE_NS.BufferGeometry,
  material: THREE_NS.Material,
  transforms: readonly { position: THREE_NS.Vector3Tuple; rotation?: THREE_NS.Vector3Tuple; scale?: THREE_NS.Vector3Tuple }[],
): THREE_NS.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  mesh.name = name;
  const dummy = new THREE.Object3D();
  transforms.forEach((entry, index) => {
    dummy.position.set(...entry.position);
    dummy.rotation.set(...(entry.rotation ?? [0, 0, 0]));
    dummy.scale.set(...(entry.scale ?? [1, 1, 1]));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Adds high-density architectural/instrument micro-detail to the EXISTING AgentLabScene3D.
 * It deliberately does not create a room, station, renderer or simulation object of its own.
 */
export function createPremiumLabDetail(THREE: typeof THREE_NS, options: PremiumLabDetailOptions): PremiumLabDetailHandle {
  const root = new THREE.Group();
  root.name = `premium-lab-detail:${options.world}`;
  markPremiumPresentation(root, {
    domain: `LAB_${options.world.toUpperCase()}`,
    epistemic: options.world === 'biology' ? 'MODEL' : 'PRESENTATION',
    visualAnalogy: 'ARCHITECTURAL_AND_INSTRUMENT_DRESSING_NOT_NEW_LAB_STATE',
  });

  const budget = premiumVisualBudget(options.tier);
  const width = options.room.maxX - options.room.minX;
  const depth = options.room.maxZ - options.room.minZ;
  const centerX = (options.room.minX + options.room.maxX) * 0.5;
  const centerZ = (options.room.minZ + options.room.maxZ) * 0.5;
  const seed = visualSeed(`${options.world}:${width.toFixed(2)}:${depth.toFixed(2)}:${options.stations.length}`);
  const rand = seededUnit(seed);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: options.world === 'biology' ? 0x435765 : 0x3a3f44,
    metalness: 0.78,
    roughness: options.world === 'biology' ? 0.24 : 0.36,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x111820, metalness: 0.5, roughness: 0.5 });
  const accentColor = options.world === 'biology' ? 0x69d7f0 : 0xf0b35c;

  // Overhead service rails: one shared geometry/material and one draw call.
  const railTransforms: { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[] = [];
  const railCount = options.tier === 'low' ? 2 : options.tier === 'medium' ? 3 : 4;
  for (let i = 0; i < railCount; i += 1) {
    const t = (i + 1) / (railCount + 1);
    railTransforms.push({
      position: [options.room.minX + width * t, options.ceilingY - 0.23, centerZ],
      scale: [1, 1, Math.max(0.5, depth - 1.0)],
    });
  }
  const rails = buildInstanced(THREE, 'premium-lab-overhead-service-rails', new THREE.BoxGeometry(0.055, 0.07, 1), railMaterial, railTransforms);
  root.add(rails);

  // Vent grilles around the ceiling perimeter. Repeated parts stay batched.
  const ventTarget = Math.min(budget.detailInstances, Math.max(10, Math.round((width + depth) * 1.4)));
  const ventTransforms: { position: THREE_NS.Vector3Tuple; rotation?: THREE_NS.Vector3Tuple }[] = [];
  for (let i = 0; i < ventTarget; i += 1) {
    const horizontal = i % 2 === 0;
    const side = i % 4 < 2 ? -1 : 1;
    const u = (i + 0.5) / ventTarget;
    ventTransforms.push(horizontal
      ? { position: [options.room.minX + width * u, options.ceilingY - 0.18, side < 0 ? options.room.minZ + 0.14 : options.room.maxZ - 0.14] }
      : { position: [side < 0 ? options.room.minX + 0.14 : options.room.maxX - 0.14, options.ceilingY - 0.18, options.room.minZ + depth * u], rotation: [0, Math.PI / 2, 0] });
  }
  const vents = buildInstanced(THREE, 'premium-lab-ceiling-vent-bank', new THREE.BoxGeometry(0.32, 0.018, 0.055), darkMaterial, ventTransforms);
  root.add(vents);

  // One keyboard/key batch across all stations. It visually upgrades workstations without inventing device state.
  const keysPerStation = options.tier === 'low' ? 12 : 24;
  const keyTransforms: { position: THREE_NS.Vector3Tuple; rotation: THREE_NS.Vector3Tuple }[] = [];
  for (const station of options.stations) {
    // Keep console detail off observation windows, imaging gantries and the
    // human-study platform where a keyboard would visibly float in space.
    if (!KEYBOARD_STATION_KINDS.has(station.kind)) continue;
    const forwardX = Math.sin(station.facing);
    const forwardZ = Math.cos(station.facing);
    const rightX = Math.cos(station.facing);
    const rightZ = -Math.sin(station.facing);
    for (let key = 0; key < keysPerStation; key += 1) {
      const columns = keysPerStation === 12 ? 6 : 8;
      const row = Math.floor(key / columns);
      const column = key % columns;
      const across = (column - (columns - 1) / 2) * 0.038;
      const along = 0.26 + row * 0.04;
      keyTransforms.push({
        position: [
          station.position.x + forwardX * along + rightX * across,
          0.93,
          station.position.z + forwardZ * along + rightZ * across,
        ],
        rotation: [0, station.facing, 0],
      });
    }
  }
  if (keyTransforms.length > 0) {
    root.add(buildInstanced(THREE, 'premium-lab-station-key-array', new THREE.BoxGeometry(0.028, 0.009, 0.025), darkMaterial, keyTransforms));
  }

  // Floor/service cable bundles as one LineSegments object; deterministic and cheap.
  const cablePositions: number[] = [];
  options.stations.forEach((station, index) => {
    const wallX = Math.abs(station.position.x - options.room.minX) < Math.abs(station.position.x - options.room.maxX)
      ? options.room.minX + 0.18
      : options.room.maxX - 0.18;
    const y = 0.055 + (index % 3) * 0.014;
    cablePositions.push(station.position.x, y, station.position.z, wallX, y, station.position.z);
    cablePositions.push(wallX, y, station.position.z, wallX, y, options.room.minZ + 0.22 + (index % 2) * (depth - 0.44));
  });
  if (cablePositions.length > 0) {
    const cableGeometry = new THREE.BufferGeometry();
    cableGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cablePositions, 3));
    const cables = new THREE.LineSegments(cableGeometry, new THREE.LineBasicMaterial({ color: options.world === 'biology' ? 0x476777 : 0x3b3028, transparent: true, opacity: 0.68 }));
    cables.name = 'premium-lab-service-cable-bundles';
    root.add(cables);
  }

  // Dense but bounded sample/service trays. Placement is decorative and explicitly not experiment state.
  const trayCount = Math.min(options.stations.length * 2, Math.max(4, Math.round(budget.detailInstances / 10)));
  const trayTransforms: { position: THREE_NS.Vector3Tuple; rotation: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[] = [];
  for (let i = 0; i < trayCount; i += 1) {
    const station = options.stations[i % Math.max(1, options.stations.length)];
    if (!station) break;
    const angle = station.facing;
    const rightX = Math.cos(angle); const rightZ = -Math.sin(angle);
    const side = i % 2 ? 1 : -1;
    trayTransforms.push({
      position: [station.position.x + rightX * (0.46 * side), 0.96 + (i % 3) * 0.02, station.position.z + rightZ * (0.46 * side)],
      rotation: [0, angle, 0],
      scale: [0.75 + rand() * 0.22, 1, 0.75 + rand() * 0.18],
    });
  }
  if (trayTransforms.length > 0) root.add(buildInstanced(THREE, 'premium-lab-sample-service-trays', new THREE.BoxGeometry(0.28, 0.025, 0.18), railMaterial, trayTransforms));

  // One cheap LED cloud. Its pulse is presentation only and does not encode instrument status.
  const ledCount = Math.max(8, Math.min(budget.atmospherePoints / 10, options.stations.length * 5));
  const ledPositions = new Float32Array(ledCount * 3);
  for (let i = 0; i < ledCount; i += 1) {
    const station = options.stations[i % Math.max(1, options.stations.length)];
    if (!station) break;
    ledPositions[i * 3] = station.position.x + (rand() - 0.5) * 0.75;
    ledPositions[i * 3 + 1] = 0.98 + rand() * 0.68;
    ledPositions[i * 3 + 2] = station.position.z + (rand() - 0.5) * 0.58;
  }
  const ledGeometry = new THREE.BufferGeometry();
  ledGeometry.setAttribute('position', new THREE.BufferAttribute(ledPositions, 3));
  const ledMaterial = new THREE.PointsMaterial({ color: accentColor, size: 0.018, transparent: true, opacity: 0.62, depthWrite: false, sizeAttenuation: true });
  const leds = new THREE.Points(ledGeometry, ledMaterial);
  leds.name = 'premium-lab-passive-status-glints';
  leds.userData.visualAnalogy = 'PASSIVE_LIGHTING_DETAIL_NOT_INSTRUMENT_STATUS';
  root.add(leds);

  // A service spine sells scale/depth and gives the room a stronger silhouette.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, width - 1.2), 0.08, 0.08), railMaterial);
  spine.name = 'premium-lab-ceiling-service-spine';
  spine.position.set(centerX, options.ceilingY - 0.38, options.room.minZ + 0.5);
  root.add(spine);

  root.traverse((object) => {
    object.userData.premiumVisualPass ??= root.userData.premiumVisualPass;
    object.userData.presentationOnly ??= true;
    object.userData.visualOnlyContext ??= true;
    object.userData.directObservation ??= false;
    object.userData.scientificStateMutation ??= false;
  });

  let disposed = false;
  return {
    root,
    summary: {
      world: options.world,
      serviceRailCount: railTransforms.length,
      ventCount: ventTransforms.length,
      keyCount: keyTransforms.length,
      stationCount: options.stations.length,
    },
    update(elapsedSeconds: number) {
      if (disposed) return;
      ledMaterial.opacity = 0.52 + 0.12 * (0.5 + 0.5 * Math.sin(elapsedSeconds * 1.4));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeSceneResources(root);
    },
  };
}
