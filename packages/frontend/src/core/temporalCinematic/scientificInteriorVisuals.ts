import type * as THREE_NS from 'three';
import { entityId, type WorldModelEntity } from '../worldModel/ecs/types';
import { boundsDepth, boundsWidth, type RoomType } from '../worldModel/ecs/geometry';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import type { HighFidelityMaterialPalette } from '../three/graphics/highFidelityMaterialRegistry';
import { createBench, createCabinet, createMonitor } from '../three/graphics/labKit';
import { createScientificGlass } from '../three/graphics/materials';
import { createColumn, createPipe, createPlatform } from '../three/graphics/primitives';
import { InstanceBatch } from '../three/graphics/instancing';
import { enhanceScientificAssetSlotVisual } from './premiumScientificInteriorDetail';

/** V6 — canonical generated-room visuals. No second lab world and no second renderer. */

const SCIENTIFIC_ROOM_PRIORITY: readonly RoomType[] = [
  'IMAGING_SUITE',
  'MICROSCOPY_SUITE',
  'MATERIALS_LAB',
  'LAB_BENCH_ROOM',
  'REACTOR_ROOM',
  'WARD',
  'PUMP_ROOM',
  'MECHANICAL',
  'OFFICE',
  'LOBBY',
];

export interface ScientificInteriorTarget {
  readonly roomId: string;
  readonly roomType: RoomType;
  readonly center: readonly [number, number, number];
  readonly widthM: number;
  readonly depthM: number;
  readonly level: number;
  readonly assetSlotIds: readonly string[];
}

function floorLevelForRoom(graph: WorldGraph, room: WorldModelEntity): number {
  if (room.geometry?.kind !== 'ROOM') return 0;
  const floor = graph.tryGetEntity(entityId(room.geometry.floorRef));
  return floor?.geometry?.kind === 'FLOOR' ? floor.geometry.level : 0;
}

export function findScientificInteriorTarget(graph: WorldGraph, roomType?: RoomType): ScientificInteriorTarget | null {
  const rooms = graph.listEntities().filter((e) => e.geometry?.kind === 'ROOM' && (!roomType || e.geometry.roomType === roomType));
  if (rooms.length === 0) return null;
  rooms.sort((a, b) => {
    const ak = a.geometry?.kind === 'ROOM' ? SCIENTIFIC_ROOM_PRIORITY.indexOf(a.geometry.roomType) : 999;
    const bk = b.geometry?.kind === 'ROOM' ? SCIENTIFIC_ROOM_PRIORITY.indexOf(b.geometry.roomType) : 999;
    const av = ak < 0 ? 998 : ak;
    const bv = bk < 0 ? 998 : bk;
    if (av !== bv) return av - bv;
    return a.id.localeCompare(b.id);
  });
  const room = rooms[0]!;
  if (room.geometry?.kind !== 'ROOM') return null;
  const g = room.geometry;
  const level = floorLevelForRoom(graph, room);
  const y = level * 3.5;
  const slots = graph.listEntities().filter((e) => e.geometry?.kind === 'ASSET_SLOT' && entityId(e.geometry.roomRef) === room.id).map((e) => e.id);
  return {
    roomId: room.id,
    roomType: g.roomType,
    center: [(g.bounds.minX + g.bounds.maxX) / 2, y + 1.25, (g.bounds.minZ + g.bounds.maxZ) / 2],
    widthM: Math.max(2, boundsWidth(g.bounds)),
    depthM: Math.max(2, boundsDepth(g.bounds)),
    level,
    assetSlotIds: slots,
  };
}

function shadow(root: THREE_NS.Object3D): void {
  root.traverse((node) => {
    const m = node as THREE_NS.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
  });
}

/** Local-space room shell; WorldFrameRenderer places the root at the canonical room centre. */
export function createScientificRoomShell(
  THREE: typeof THREE_NS,
  room: WorldModelEntity,
  palette: HighFidelityMaterialPalette,
): THREE_NS.Group {
  const root = new THREE.Group();
  root.name = 'genesis-scientific-room-shell';
  if (room.geometry?.kind !== 'ROOM') return root;
  const width = Math.max(1.5, boundsWidth(room.geometry.bounds));
  const depth = Math.max(1.5, boundsDepth(room.geometry.bounds));
  const wallHeight = 3.3;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, depth), palette.floor);
  floor.position.y = -1.25 + 0.04;
  floor.receiveShadow = true;
  root.add(floor);

  // Three walls only: the open camera side avoids looking through a closed box while retaining depth.
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, 0.08), palette.wall);
  back.position.set(0, -1.25 + wallHeight / 2, -depth / 2);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallHeight, depth), palette.wall);
  left.position.set(-width / 2, -1.25 + wallHeight / 2, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallHeight, depth), palette.wall);
  right.position.set(width / 2, -1.25 + wallHeight / 2, 0);
  root.add(back, left, right);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, depth), palette.wall);
  ceiling.position.y = -1.25 + wallHeight;
  root.add(ceiling);
  for (let z = -depth / 2 + 1; z < depth / 2; z += 2) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.1), palette.dark);
    beam.position.set(0, -1.25 + wallHeight - 0.12, z); root.add(beam);
  }

  // Ceiling light strips are emissive geometry; the shared room/environment supplies actual light.
  for (const x of [-width * 0.24, width * 0.24]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.8, width * 0.28), 0.035, 0.12), palette.blueGlow);
    strip.position.set(x, -1.25 + wallHeight - 0.08, -depth * 0.12);
    root.add(strip);
  }
  root.userData.visualOnlyContext = false;
  shadow(root);
  return root;
}

function createScanner(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-imaging-scanner';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.22, 24, 72), p.medical);
  ring.position.set(0, 0.95, -0.25); ring.rotation.y = Math.PI / 2; g.add(ring);
  const bore = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.025, 10, 72), p.blueGlow);
  bore.position.copy(ring.position); bore.rotation.copy(ring.rotation); g.add(bore);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.62), p.white);
  bed.position.set(0.55, 0.48, -0.25); g.add(bed);
  g.add(createColumn(THREE, p.stainless, { position: [1.45, 0, -0.25], height: 0.42, radius: 0.12 }));
  shadow(g); return g;
}

function createMicroscope(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-microscope';
  g.add(createBench(THREE, { position: [0, 0, 0], width: 2.0, depth: 0.8, height: 0.86, topMaterial: p.white, legMaterial: p.stainless }));
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.18), p.medical); stand.position.set(-0.35, 1.12, -0.12); g.add(stand);
  const stage = createPlatform(THREE, p.stainless, { position: [-0.35, 0.95, 0.02], thickness: 0.035, shape: 'box', width: 0.42, depth: 0.34 }); g.add(stage);
  for (const dx of [-0.05, 0.05]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 12), p.dark);
    tube.position.set(-0.35 + dx, 1.48, 0.03); tube.rotation.x = -0.5; g.add(tube);
  }
  g.add(createMonitor(THREE, { position: [0.55, 0.86, -0.16], width: 0.65, height: 0.42, standHeight: 0.15, frameMaterial: p.stainless, screenMaterial: p.blueGlow }));
  shadow(g); return g;
}

function createReactor(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-reactor';
  const glass = createScientificGlass(THREE, { color: 0xbfe4ff, transmissive: false, thicknessMeters: 0.02 });
  const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.6, 36, 1, true), glass); vessel.position.y = 1.0; g.add(vessel);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.12, 36), p.stainless); cap.position.y = 1.84; g.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 36), p.stainless); base.position.y = 0.16; g.add(base);
  for (const side of [-1, 1] as const) g.add(createPipe(THREE, p.chrome, { from: [side * 0.48, 1.25, 0], to: [side * 0.85, 1.25, 0], radius: 0.045 }));
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.72, 32), p.blueGlow); fluid.position.y = 0.76; g.add(fluid);
  shadow(g); return g;
}

function createHospitalBed(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-hospital-bed';
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.16, 0.88), p.stainless); frame.position.y = 0.48; g.add(frame);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.78), p.white); pad.position.y = 0.62; g.add(pad);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.88), p.medical); head.position.set(-1.0, 0.72, 0); g.add(head);
  for (const x of [-0.82, 0.82]) for (const z of [-0.33, 0.33]) g.add(createColumn(THREE, p.dark, { position: [x, 0, z], height: 0.42, radius: 0.035 }));
  shadow(g); return g;
}

function createPumpStation(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-pump-station';
  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.9), p.stainless); housing.position.y = 0.55; g.add(housing);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 24), p.dark); motor.rotation.z = Math.PI / 2; motor.position.set(0, 0.8, 0); g.add(motor);
  g.add(createPipe(THREE, p.chrome, { from: [-1.1, 0.55, 0], to: [-0.55, 0.55, 0], radius: 0.11 }));
  g.add(createPipe(THREE, p.chrome, { from: [0.55, 0.55, 0], to: [1.1, 0.55, 0], radius: 0.11 }));
  const status = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), p.blueGlow); status.position.set(0.38, 1.12, 0.42); g.add(status);
  shadow(g); return g;
}

/** Procedural instrument geometry, not a spectroscopy solver or a measured spectrum. */
function createSpectrometer(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-spectrometer';
  g.add(createBench(THREE, { position: [0, 0, 0], width: 1.6, depth: 0.8, height: 0.86, topMaterial: p.white, legMaterial: p.stainless }));
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.48), p.medical);
  housing.position.set(-0.12, 1.08, 0.02); g.add(housing);
  const chamberGlass = createScientificGlass(THREE, { color: 0xaedcff, transmissive: false, thicknessMeters: 0.012 });
  const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 28, 1, true), chamberGlass);
  chamber.position.set(0.47, 1.05, 0.02); g.add(chamber);
  const sample = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.035, 20), p.chrome);
  sample.position.set(0.47, 0.94, 0.02); g.add(sample);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 12), p.blueGlow);
  beam.rotation.z = Math.PI / 2; beam.position.set(0.18, 1.06, 0.02); g.add(beam);
  g.add(createPlatform(THREE, p.stainless, { position: [0.47, 0.9, 0.02], thickness: 0.04, shape: 'box', width: 0.34, depth: 0.3 }));
  const display = createInstrumentScreen(THREE, p, 0.48, 0.31);
  display.position.set(-0.36, 1.37, 0.18); display.rotation.x = -0.14; g.add(display);
  const opticalRail = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.045, 0.12), p.dark);
  opticalRail.position.set(0.08, 0.91, 0.02); g.add(opticalRail);
  addRepeatedParts(
    THREE, g, 'genesis-spectrometer-sample-carousel',
    new THREE.CylinderGeometry(0.023, 0.023, 0.085, 12), p.stainless,
    Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return { position: [0.47 + Math.cos(angle) * 0.095, 0.99, 0.02 + Math.sin(angle) * 0.095] as THREE_NS.Vector3Tuple };
    }),
  );
  addRepeatedParts(
    THREE, g, 'genesis-spectrometer-vent-bank',
    new THREE.BoxGeometry(0.18, 0.016, 0.012), p.dark,
    Array.from({ length: 6 }, (_, index) => ({ position: [-0.12, 1.0 + index * 0.045, 0.268] as THREE_NS.Vector3Tuple })),
    false,
  );
  addServiceConduits(THREE, g, p, -0.66, 0.66, 0.84, -0.31);
  addStatusLamps(THREE, g, p, [-0.34, 0.94, 0.25], 4);
  g.userData.instrumentState = 'UNBOUND';
  g.userData.visualProfile = 'MATERIALS_SPECTROMETER_CINEMATIC';
  shadow(g); return g;
}

function addStatusLamps(
  THREE: typeof THREE_NS,
  root: THREE_NS.Object3D,
  p: HighFidelityMaterialPalette,
  origin: readonly [number, number, number],
  count: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), p.blueGlow);
    lamp.position.set(origin[0] + i * 0.052, origin[1], origin[2]);
    root.add(lamp);
  }
}

interface RepeatedPart {
  readonly position: THREE_NS.Vector3Tuple;
  readonly rotation?: THREE_NS.Vector3Tuple;
  readonly scale?: THREE_NS.Vector3Tuple | number;
}

/** One draw call for repeated equipment detail. Geometry is slot-owned; material stays palette-owned. */
function addRepeatedParts(
  THREE: typeof THREE_NS,
  root: THREE_NS.Object3D,
  name: string,
  geometry: THREE_NS.BufferGeometry,
  material: THREE_NS.Material,
  parts: readonly RepeatedPart[],
  castShadow = true,
): THREE_NS.InstancedMesh | null {
  const batch = new InstanceBatch(THREE, geometry, material);
  for (const part of parts) batch.add(part.position, part.rotation, part.scale);
  const mesh = batch.build(root as THREE_NS.Scene, castShadow);
  if (mesh) {
    mesh.name = name;
    mesh.receiveShadow = true;
  }
  return mesh;
}

function addServiceConduits(
  THREE: typeof THREE_NS,
  root: THREE_NS.Object3D,
  p: HighFidelityMaterialPalette,
  fromX: number,
  toX: number,
  y: number,
  z: number,
): THREE_NS.Group {
  const bundle = new THREE.Group();
  bundle.name = 'genesis-instrument-service-conduits';
  for (const offset of [-0.045, 0, 0.045]) {
    bundle.add(createPipe(THREE, offset === 0 ? p.chrome : p.dark, {
      from: [fromX, y + offset * 0.35, z + offset],
      to: [toX, y + offset * 0.35, z + offset],
      radius: offset === 0 ? 0.014 : 0.011,
    }));
  }
  root.add(bundle);
  return bundle;
}

function createInstrumentScreen(
  THREE: typeof THREE_NS,
  p: HighFidelityMaterialPalette,
  width: number,
  height: number,
): THREE_NS.Group {
  const display = new THREE.Group();
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.045), p.dark);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.88, height * 0.78), p.blueGlow);
  glass.position.z = 0.024;
  display.add(bezel, glass);
  for (let row = 0; row < 3; row += 1) {
    const trace = new THREE.Mesh(new THREE.BoxGeometry(width * (0.42 + row * 0.13), 0.008, 0.004), p.white);
    trace.position.set(-width * 0.12, height * (0.2 - row * 0.18), 0.03);
    display.add(trace);
  }
  return display;
}

function createThermalStage(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-thermal-stage';
  g.add(createBench(THREE, { position: [0, 0, 0], width: 1.4, depth: 0.8, height: 0.86, topMaterial: p.white, legMaterial: p.stainless }));
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 28), p.medical);
  stage.position.set(0, 0.93, 0); g.add(stage);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 32), p.chrome);
  coil.rotation.x = Math.PI / 2; coil.position.set(0, 0.99, 0); g.add(coil);
  for (let ring = 1; ring <= 3; ring += 1) {
    const heatRing = new THREE.Mesh(new THREE.TorusGeometry(0.11 + ring * 0.025, 0.006, 6, 28), p.blueGlow);
    heatRing.rotation.x = Math.PI / 2; heatRing.position.set(0, 1.046 + ring * 0.004, 0); g.add(heatRing);
  }
  const controller = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.23), p.dark);
  controller.position.set(-0.45, 0.98, 0); g.add(controller);
  const shieldMaterial = createScientificGlass(THREE, { color: 0x9ed8ef, transmissive: false, thicknessMeters: 0.01 });
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.34, 32, 1, true), shieldMaterial);
  shield.position.set(0, 1.09, 0); g.add(shield);
  addRepeatedParts(
    THREE, g, 'genesis-thermal-sample-holders',
    new THREE.CylinderGeometry(0.027, 0.027, 0.065, 12), p.stainless,
    Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return { position: [Math.cos(angle) * 0.145, 1.085, Math.sin(angle) * 0.145] as THREE_NS.Vector3Tuple };
    }),
  );
  const rearRail = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.055, 0.08), p.dark);
  rearRail.position.set(0, 0.91, -0.31); g.add(rearRail);
  addServiceConduits(THREE, g, p, -0.48, 0.48, 0.88, -0.35);
  addStatusLamps(THREE, g, p, [-0.5, 1.06, 0.12], 3);
  g.userData.instrumentState = 'UNBOUND';
  g.userData.visualProfile = 'THERMAL_STAGE_CINEMATIC';
  shadow(g); return g;
}

/** A canonical room workstation. The idle screen does not imply a running compute provider. */
function createComputeStation(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-compute-station';
  g.add(createBench(THREE, { position: [0, 0, 0], width: 2.05, depth: 0.82, height: 0.78, topMaterial: p.dark, legMaterial: p.stainless }));
  for (const x of [-0.48, 0.18]) {
    const screen = createInstrumentScreen(THREE, p, 0.62, 0.38);
    screen.position.set(x, 1.12, -0.2); screen.rotation.x = -0.06; g.add(screen);
  }
  for (const x of [0.68, 0.91]) {
    const rack = createCabinet(THREE, { position: [x, 0, -0.08], width: 0.2, depth: 0.58, height: 0.72, bodyMaterial: p.dark, handleMaterial: p.stainless });
    g.add(rack);
  }
  const rackUnits: RepeatedPart[] = [];
  const rackLeds: RepeatedPart[] = [];
  for (const x of [0.68, 0.91]) {
    for (let unit = 0; unit < 6; unit += 1) {
      const y = 0.18 + unit * 0.085;
      rackUnits.push({ position: [x, y, 0.218] });
      rackLeds.push({ position: [x - 0.047, y, 0.232] }, { position: [x + 0.047, y, 0.232] });
    }
  }
  addRepeatedParts(THREE, g, 'genesis-compute-rack-units', new THREE.BoxGeometry(0.16, 0.055, 0.025), p.stainless, rackUnits);
  addRepeatedParts(THREE, g, 'genesis-compute-rack-led-bank', new THREE.SphereGeometry(0.012, 8, 6), p.blueGlow, rackLeds, false);
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.025, 0.16), p.medical);
  keyboard.position.set(-0.18, 0.8, 0.18); g.add(keyboard);
  const keys: RepeatedPart[] = [];
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 10; column += 1) {
    keys.push({ position: [-0.374 + column * 0.043, 0.817, 0.132 + row * 0.031] });
  }
  addRepeatedParts(THREE, g, 'genesis-compute-key-array', new THREE.BoxGeometry(0.032, 0.008, 0.021), p.dark, keys, false);
  const consoleGlow = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.018, 0.035), p.blueGlow);
  consoleGlow.position.set(-0.16, 0.78, -0.37); g.add(consoleGlow);
  const gantryPosts = addRepeatedParts(
    THREE, g, 'genesis-compute-monitor-gantry-posts',
    new THREE.BoxGeometry(0.045, 0.72, 0.055), p.stainless,
    [{ position: [-0.84, 1.14, -0.34] }, { position: [0.53, 1.14, -0.34] }],
  );
  gantryPosts?.layers.enable(0);
  const gantryBeam = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.055, 0.06), p.stainless);
  gantryBeam.position.set(-0.155, 1.5, -0.34); g.add(gantryBeam);
  const cableTray = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.055, 0.11), p.dark);
  cableTray.position.set(-0.12, 0.52, -0.34); g.add(cableTray);
  addServiceConduits(THREE, g, p, -0.82, 0.94, 0.48, -0.3);
  g.userData.computeBinding = 'UNBOUND';
  g.userData.visualProfile = 'SCIENTIFIC_COMPUTE_CONSOLE_CINEMATIC';
  shadow(g); return g;
}

function createLabBenchStation(THREE: typeof THREE_NS, p: HighFidelityMaterialPalette): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'genesis-interior-lab-bench';
  g.add(createBench(THREE, { position: [0, 0, 0], width: 2.6, depth: 0.9, height: 0.88, topMaterial: p.white, legMaterial: p.stainless }));
  g.add(createCabinet(THREE, { position: [1.45, 0, -0.1], width: 0.55, depth: 0.48, height: 1.75, bodyMaterial: p.medical, handleMaterial: p.chrome }));
  g.add(createMonitor(THREE, { position: [-0.62, 0.88, -0.18], width: 0.72, height: 0.44, standHeight: 0.14, frameMaterial: p.stainless, screenMaterial: p.blueGlow }));
  for (let i = -1; i <= 1; i += 1) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.22, 16), p.glass); tube.position.set(i * 0.24, 1.02, 0.08); g.add(tube);
  }
  shadow(g); return g;
}

/** Slot type is generated by canonical World Generation; this only decides how that declared slot looks. */
export function createScientificAssetSlotVisual(
  THREE: typeof THREE_NS,
  slot: WorldModelEntity,
  palette: HighFidelityMaterialPalette,
): THREE_NS.Group {
  const empty = new THREE.Group(); empty.name = 'genesis-empty-asset-slot';
  if (slot.geometry?.kind !== 'ASSET_SLOT') return empty;
  let visual: THREE_NS.Group;
  switch (slot.geometry.slotType) {
    case 'IMAGING_SCANNER': visual = createScanner(THREE, palette); break;
    case 'MICROSCOPE_STATION': visual = createMicroscope(THREE, palette); break;
    case 'REACTOR_VESSEL': visual = createReactor(THREE, palette); break;
    case 'HOSPITAL_BED': visual = createHospitalBed(THREE, palette); break;
    case 'PUMP_STATION': visual = createPumpStation(THREE, palette); break;
    case 'LAB_BENCH_STATION': visual = createLabBenchStation(THREE, palette); break;
    case 'SPECTROMETER_STATION': visual = createSpectrometer(THREE, palette); break;
    case 'THERMAL_STAGE_STATION': visual = createThermalStage(THREE, palette); break;
    case 'COMPUTE_STATION': visual = createComputeStation(THREE, palette); break;
    default:
      empty.userData.notModeledAssetSlot = slot.geometry.slotType;
      return empty;
  }
  return enhanceScientificAssetSlotVisual(THREE, visual, slot.geometry.slotType, palette);
}
