import type * as THREE_NS from 'three';

/**
 * Pure Three.js geometry kit for the fixed Genesis Laboratory (delivered package, verbatim — this
 * file's own import-free, self-contained geometry construction needed no correction; only
 * `canonicalLaboratory.ts`'s data-layer import had drifted from the current repository).
 *
 * This file owns ONLY geometry construction. It does not own the scene,
 * renderer, WorldGraph, command bus, navigation or evidence. The caller
 * attaches the returned group to the existing Genesis laboratory scene.
 */

export interface CanonicalRoomGeometry {
  readonly id: string;
  readonly label: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly doors: readonly CanonicalDoorGeometry[];
}

export interface CanonicalDoorGeometry {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly rotationY: number;
}

export interface CanonicalLaboratoryGeometryOptions {
  readonly floorMaterial: THREE_NS.Material;
  readonly wallMaterial: THREE_NS.Material;
  readonly ceilingMaterial: THREE_NS.Material;
  readonly frameMaterial: THREE_NS.Material;
  readonly glassMaterial?: THREE_NS.Material;
  readonly doorMaterial?: THREE_NS.Material;
  readonly accentMaterial?: THREE_NS.Material;
  readonly roomLabelMaterial?: THREE_NS.Material;
}

const ROOMS: readonly CanonicalRoomGeometry[] = [
  { id: 'main-hall', label: 'MAIN HALL / CONTROL', minX: -4.2, maxX: 4.2, minZ: -4.2, maxZ: 4.2, doors: [
    { id: 'door:main-human', x: -5.0, z: 0, width: 1.6, height: 2.3, rotationY: Math.PI / 2 },
    { id: 'door:main-micro', x: -1.7, z: -4.6, width: 1.6, height: 2.3, rotationY: 0 },
    { id: 'door:main-histo', x: 1.7, z: -4.6, width: 1.6, height: 2.3, rotationY: 0 },
    { id: 'door:main-imaging', x: 5.0, z: 0, width: 1.6, height: 2.3, rotationY: Math.PI / 2 },
    { id: 'door:main-wet', x: -1.7, z: 4.6, width: 1.6, height: 2.3, rotationY: 0 },
    { id: 'door:main-experimental', x: 1.7, z: 4.6, width: 1.6, height: 2.3, rotationY: 0 },
  ]},
  { id: 'human-study', label: 'HUMAN STUDY', minX: -10, maxX: -5.8, minZ: -3.6, maxZ: 3.6, doors: [
    { id: 'door:main-human', x: -5.0, z: 0, width: 1.6, height: 2.3, rotationY: Math.PI / 2 },
  ]},
  { id: 'microscopy', label: 'MICROSCOPY', minX: -4, maxX: -0.2, minZ: -9, maxZ: -5.8, doors: [
    { id: 'door:main-micro', x: -1.7, z: -4.6, width: 1.6, height: 2.3, rotationY: 0 },
  ]},
  { id: 'histology', label: 'HISTOLOGY', minX: 0.2, maxX: 4, minZ: -9, maxZ: -5.8, doors: [
    { id: 'door:main-histo', x: 1.7, z: -4.6, width: 1.6, height: 2.3, rotationY: 0 },
    { id: 'door:histology-biomedical-bay', x: 2.1, z: -9.8, width: 1.6, height: 2.3, rotationY: 0 },
  ]},
  { id: 'imaging', label: 'IMAGING', minX: 5.8, maxX: 10, minZ: -3.6, maxZ: 3.6, doors: [
    { id: 'door:main-imaging', x: 5.0, z: 0, width: 1.6, height: 2.3, rotationY: Math.PI / 2 },
  ]},
  { id: 'wet-lab', label: 'WET LAB / SAMPLES', minX: -4, maxX: -0.2, minZ: 5.8, maxZ: 9, doors: [
    { id: 'door:main-wet', x: -1.7, z: 4.6, width: 1.6, height: 2.3, rotationY: 0 },
  ]},
  { id: 'experimental', label: 'EXPERIMENTAL / MODEL', minX: 0.2, maxX: 4, minZ: 5.8, maxZ: 9, doors: [
    { id: 'door:main-experimental', x: 1.7, z: 4.6, width: 1.6, height: 2.3, rotationY: 0 },
  ]},
  // FIX ON INTEGRATION: this room list is a deliberately import-free duplicate of
  // `canonicalLaboratory.ts`'s `GENESIS_LAB_ROOMS`/`GENESIS_LAB_DOORS` (see this file's header) — the
  // navigation/collision model and the rendered geometry are two independent sources of truth, kept in
  // sync by hand. Every room bound and door here must match that file exactly, or the walls rendered
  // here drift from what the agent actually collides with.
  { id: 'biomedical-bay', label: 'BIOMEDICAL INTERVENTION BAY', minX: -2.7, maxX: 6.9, minZ: -20.6, maxZ: -10.6, doors: [
    { id: 'door:histology-biomedical-bay', x: 2.1, z: -9.8, width: 1.6, height: 2.3, rotationY: 0 },
  ]},
];

function wall(
  THREE: typeof THREE_NS,
  material: THREE_NS.Material,
  x: number, z: number, width: number, height: number, depth: number,
): THREE_NS.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

type Edge = 'minX' | 'maxX' | 'minZ' | 'maxZ';

/**
 * FIX ON INTEGRATION: every door in this layout sits at the MIDPOINT of the gap between two rooms'
 * own bounds, not flush against either room's actual wall coordinate — matching a door to a wall by
 * near-exact coordinate equality (the package's original `Math.abs(d.z - fixed) < 0.05`) never fires
 * for any of the six doors, on either side, so every wall rendered fully solid with the door frame
 * floating, disconnected, in the empty gap. Fixed by assigning each door to whichever of the room's
 * four edges is geometrically closest to it (`canonicalLaboratory.ts`'s navigation obstacles use the
 * identical assignment, so the visual wall and the walkable surface can never drift apart).
 */
function closestEdge(room: CanonicalRoomGeometry, door: CanonicalDoorGeometry): Edge {
  const distances: readonly [Edge, number][] = [
    ['minX', Math.abs(door.x - room.minX)],
    ['maxX', Math.abs(door.x - room.maxX)],
    ['minZ', Math.abs(door.z - room.minZ)],
    ['maxZ', Math.abs(door.z - room.maxZ)],
  ];
  return distances.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
}

function addWallWithDoors(
  THREE: typeof THREE_NS,
  group: THREE_NS.Group,
  material: THREE_NS.Material,
  axis: 'x' | 'z',
  fixed: number,
  start: number,
  end: number,
  height: number,
  doors: readonly CanonicalDoorGeometry[],
): void {
  const relevant = [...doors].sort((a, b) => (axis === 'x' ? a.x - b.x : a.z - b.z));

  let cursor = start;
  for (const door of relevant) {
    const center = axis === 'x' ? door.x : door.z;
    const a = center - door.width / 2;
    const b = center + door.width / 2;
    if (a > cursor) {
      const length = a - cursor;
      group.add(axis === 'x'
        ? wall(THREE, material, (cursor + a) / 2, fixed, length, height, 0.16)
        : wall(THREE, material, fixed, (cursor + a) / 2, 0.16, height, length));
    }
    // Door frame and header. The opening itself is intentionally empty.
    const frame = new THREE.Group();
    frame.position.set(door.x, 0, door.z);
    frame.rotation.y = door.rotationY;
    const sideGeo = new THREE.BoxGeometry(0.08, door.height, 0.12);
    const headerGeo = new THREE.BoxGeometry(door.width + 0.16, 0.08, 0.12);
    const left = new THREE.Mesh(sideGeo, material); left.position.set(-door.width / 2, door.height / 2, 0);
    const right = new THREE.Mesh(sideGeo, material); right.position.set(door.width / 2, door.height / 2, 0);
    const header = new THREE.Mesh(headerGeo, material); header.position.set(0, door.height, 0);
    frame.add(left, right, header);
    group.add(frame);
    cursor = b;
  }
  if (cursor < end) {
    const length = end - cursor;
    group.add(axis === 'x'
      ? wall(THREE, material, (cursor + end) / 2, fixed, length, height, 0.16)
      : wall(THREE, material, fixed, (cursor + end) / 2, 0.16, height, length));
  }
}

function addRoomShell(
  THREE: typeof THREE_NS,
  group: THREE_NS.Group,
  room: CanonicalRoomGeometry,
  opts: CanonicalLaboratoryGeometryOptions,
): void {
  const width = room.maxX - room.minX;
  const depth = room.maxZ - room.minZ;
  const cx = (room.minX + room.maxX) / 2;
  const cz = (room.minZ + room.maxZ) / 2;
  const h = 4.2;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth), opts.floorMaterial);
  floor.position.set(cx, -0.06, cz);
  floor.receiveShadow = true;
  floor.name = `lab:room:${room.id}:floor`;
  group.add(floor);

  const byEdge: Record<Edge, CanonicalDoorGeometry[]> = { minX: [], maxX: [], minZ: [], maxZ: [] };
  for (const d of room.doors) byEdge[closestEdge(room, d)].push(d);
  addWallWithDoors(THREE, group, opts.wallMaterial, 'x', room.minZ, room.minX, room.maxX, h, byEdge.minZ);
  addWallWithDoors(THREE, group, opts.wallMaterial, 'x', room.maxZ, room.minX, room.maxX, h, byEdge.maxZ);
  addWallWithDoors(THREE, group, opts.wallMaterial, 'z', room.minX, room.minZ, room.maxZ, h, byEdge.minX);
  addWallWithDoors(THREE, group, opts.wallMaterial, 'z', room.maxX, room.minZ, room.maxZ, h, byEdge.maxX);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width, 0.10, depth), opts.ceilingMaterial);
  ceiling.position.set(cx, h, cz);
  ceiling.name = `lab:room:${room.id}:ceiling`;
  group.add(ceiling);

  const labelMaterial = opts.roomLabelMaterial ?? opts.accentMaterial ?? opts.frameMaterial;
  const label = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.8, width * 0.72), 0.08, 0.32), labelMaterial);
  label.position.set(cx, 3.0, room.minZ + 0.10);
  label.name = `lab:room:${room.id}:label`;
  group.add(label);

  // Simple ceiling luminaire. It is geometry only; the existing Genesis light
  // system remains responsible for actual lighting.
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.6, width * 0.65), 0.04, 0.16), opts.accentMaterial ?? opts.frameMaterial);
  lightBar.position.set(cx, h - 0.12, cz);
  lightBar.name = `lab:room:${room.id}:light`;
  group.add(lightBar);
}

export function createCanonicalLaboratoryGeometry(
  THREE: typeof THREE_NS,
  opts: CanonicalLaboratoryGeometryOptions,
): { group: THREE_NS.Group; rooms: readonly CanonicalRoomGeometry[] } {
  const group = new THREE.Group();
  group.name = 'genesis:canonical-laboratory';

  for (const room of ROOMS) addRoomShell(THREE, group, room, opts);

  // Door glazing is deliberately minimal: a clean scientific facility look
  // without turning the doors into fake interactive portals.
  const glass = opts.glassMaterial;
  if (glass) {
    for (const door of ROOMS.flatMap(r => r.doors)) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(door.width, door.height, 0.035), glass);
      panel.position.set(door.x, door.height / 2, door.z);
      panel.rotation.y = door.rotationY;
      panel.name = `lab:${door.id}:glass`;
      group.add(panel);
    }
  }

  return { group, rooms: ROOMS };
}
