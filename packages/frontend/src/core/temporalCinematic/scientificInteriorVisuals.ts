import type * as THREE_NS from 'three';
import { entityId, type WorldModelEntity } from '../worldModel/ecs/types';
import { boundsDepth, boundsWidth, type RoomType } from '../worldModel/ecs/geometry';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import type { HighFidelityMaterialPalette } from '../three/graphics/highFidelityMaterialRegistry';
import { createBench, createCabinet, createMonitor } from '../three/graphics/labKit';
import { createScientificGlass } from '../three/graphics/materials';
import { createColumn, createPipe, createPlatform } from '../three/graphics/primitives';

/** V6 — canonical generated-room visuals. No second lab world and no second renderer. */

const SCIENTIFIC_ROOM_PRIORITY: readonly RoomType[] = [
  'IMAGING_SUITE',
  'MICROSCOPY_SUITE',
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

export function findScientificInteriorTarget(graph: WorldGraph): ScientificInteriorTarget | null {
  const rooms = graph.listEntities().filter((e) => e.geometry?.kind === 'ROOM');
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
  switch (slot.geometry.slotType) {
    case 'IMAGING_SCANNER': return createScanner(THREE, palette);
    case 'MICROSCOPE_STATION': return createMicroscope(THREE, palette);
    case 'REACTOR_VESSEL': return createReactor(THREE, palette);
    case 'HOSPITAL_BED': return createHospitalBed(THREE, palette);
    case 'PUMP_STATION': return createPumpStation(THREE, palette);
    case 'LAB_BENCH_STATION': return createLabBenchStation(THREE, palette);
    default:
      empty.userData.notModeledAssetSlot = slot.geometry.slotType;
      return empty;
  }
}
