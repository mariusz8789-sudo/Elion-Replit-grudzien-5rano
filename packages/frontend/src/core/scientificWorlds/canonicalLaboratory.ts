import type { Obstacle, RoomBounds, Vec2 } from '../three/firstPersonController';

/**
 * GENESIS CANONICAL LABORATORY (delivered package, adapted) — a fixed, deterministic 7-room, 6-door
 * building for the human biology lab. Pure data: no renderer, no WorldGraph, no command bus, no agent
 * system, no Evidence Ledger. `createCanonicalLaboratoryGeometry` (`../three/canonicalLaboratoryGeometry.ts`)
 * turns this into real geometry; the existing `AgentLabScene3D`/`biologyLabKit.ts` remain the only
 * scene owner. `biologyLabWorld.ts` is this module's CONSUMER (it reads `getStationPlacement` to
 * position its stations and `wallObstacles` to extend navigation) — so this module deliberately owns
 * no dependency back on `biologyLabWorld.ts`, or the two would import each other in a cycle. The nine
 * station ids below are the SAME ids `biologyLabWorld.ts`'s `HOST` map and the V3 pack define; this
 * file names them as plain strings rather than importing the station catalog, which is what keeps the
 * dependency one-directional without inventing a second station registry (the ids still have to match
 * exactly, and `canonicalLaboratory.test.ts` pins every one of them against the real catalog).
 *
 * FIX ON INTEGRATION: the delivered package imported `LAB_STATIONS`/`labStation`/`LAB_WORLD_ID` from
 * `labWorld.ts` — the PHYSICS lab (`st-synthesizer`, `st-collider`, `st-epidemiology`, `st-window`).
 * Every station id this module actually references (`station:human-study`, `station:microscopy`, …)
 * is a BIOLOGY station, defined in `biologyLabWorld.ts`. As delivered, the import mismatch meant
 * `stationPlacements` resolved to an empty array at runtime (the placement loop iterated the wrong
 * four physics stations, none of which appear in `STATION_POSITIONS`) — every one of the package's
 * own tests asserting a real placement would have failed. Fixed here by naming the correct, existing
 * biology station ids directly (see the note above on why not importing the catalog itself); no
 * second station catalog is created.
 */
const KNOWN_BIOLOGY_STATION_IDS: readonly string[] = [
  'station:human-study', 'station:neuro', 'station:microscopy', 'station:histology',
  'station:imaging', 'station:orpheus', 'station:compute', 'station:evidence', 'station:safety',
  // Wet Lab: host-added physical stations (no V3 pack equivalent — the pack never defined a wet-lab
  // program). Physical-only for now: real geometry, position, facing and navigation, no experimentId,
  // since there is no chemistry dataset yet to run a real experiment against (see biologyLabWorld.ts's
  // HOST entries for these three).
  'station:wet-sample-prep', 'station:wet-lab-bench', 'station:wet-analytical',
];
export type GenesisLabRoomId =
  | 'main-hall'
  | 'human-study'
  | 'microscopy'
  | 'histology'
  | 'imaging'
  | 'wet-lab'
  | 'experimental'
  | 'biomedical-bay';

export interface GenesisLabRoom {
  readonly id: GenesisLabRoomId;
  readonly label: string;
  readonly bounds: RoomBounds;
  readonly center: Vec2;
  readonly doors: readonly string[];
  readonly stationIds: readonly string[];
  readonly purpose: string;
}

export interface GenesisLabDoor {
  readonly id: string;
  readonly from: GenesisLabRoomId;
  readonly to: GenesisLabRoomId;
  readonly center: Vec2;
  readonly width: number;
  readonly height: number;
  readonly traversable: true;
}

export interface GenesisLabStationPlacement {
  readonly stationId: string;
  readonly roomId: GenesisLabRoomId;
  readonly position: Vec2;
}

export interface GenesisCanonicalLaboratory {
  readonly id: 'world:genesis-canonical-laboratory';
  readonly version: 1;
  readonly dimensionsMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly rooms: readonly GenesisLabRoom[];
  readonly doors: readonly GenesisLabDoor[];
  readonly stationPlacements: readonly GenesisLabStationPlacement[];
  /** Station footprints, kept out of the walkable surface — the same convention `LabStation.footprint` already uses. */
  readonly staticObstacles: readonly Obstacle[];
  /** Wall segments with a gap left open at every door, so the existing grid-A* planner
   * (`navigationPlanner.ts`'s `planPath`) routes an agent or the first-person controller through the
   * actual opening by itself — no second pathfinder, no room-to-room waypoint stitching needed. */
  readonly wallObstacles: readonly Obstacle[];
  readonly spawn: { readonly position: Vec2; readonly facing: number; readonly roomId: GenesisLabRoomId };
}

const room = (
  id: GenesisLabRoomId,
  label: string,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  purpose: string,
  stationIds: readonly string[],
  doors: readonly string[],
): GenesisLabRoom => ({
  id,
  label,
  bounds: { minX, maxX, minZ, maxZ },
  center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
  doors,
  stationIds,
  purpose,
});

const DOORS: readonly GenesisLabDoor[] = [
  { id: 'door:main-human', from: 'main-hall', to: 'human-study', center: { x: -5.0, z: 0 }, width: 1.6, height: 2.3, traversable: true },
  { id: 'door:main-micro', from: 'main-hall', to: 'microscopy', center: { x: -1.7, z: -4.6 }, width: 1.6, height: 2.3, traversable: true },
  { id: 'door:main-histo', from: 'main-hall', to: 'histology', center: { x: 1.7, z: -4.6 }, width: 1.6, height: 2.3, traversable: true },
  { id: 'door:main-imaging', from: 'main-hall', to: 'imaging', center: { x: 5.0, z: 0 }, width: 1.6, height: 2.3, traversable: true },
  { id: 'door:main-wet', from: 'main-hall', to: 'wet-lab', center: { x: -1.7, z: 4.6 }, width: 1.6, height: 2.3, traversable: true },
  { id: 'door:main-experimental', from: 'main-hall', to: 'experimental', center: { x: 1.7, z: 4.6 }, width: 1.6, height: 2.3, traversable: true },
  // 8th room, added for the Biomedical Intervention Bay at its true, unscaled 1:1 footprint (see the
  // `biomedical-bay` room comment below). Reached off `histology`'s FAR (south) wall, not any of the
  // four other candidates actually tried and verified unreachable with the real `planPath` the live
  // `AgentController` uses (`regenerativeMedicineBayIntegration.ts`'s `navEntryPoint`/`navRoom`
  // check — a static "is it geometrically clear" check missed all three of these):
  // - `experimental`: orpheus (3.0 m wide, footprint x 0.9-3.9) very nearly spans the room's entire
  //   3.8 m width — no door on any of its walls can route an agent past it.
  // - `wet-lab`, south wall: wet-lab-bench (1.8 m, x -3.0..-1.2) sits flush against it in the same
  //   3.8 m room; no 1.6 m door fits there clear of it.
  // - `wet-lab`, west wall: geometrically clear of every station where the door itself would sit, but
  //   wet-sample-prep (x -4.0..-3.0, z 6.0-7.6) blocks the ONLY corridor along that same wall an agent
  //   would have to walk down to reach it from the room's own (north) entrance — confirmed unreachable
  //   by `planPath`, not just "tight".
  // `histology`'s own station is narrower relative to its room (1.3 m of 3.8 m, vs. orpheus's 3.0 m or
  // microscopy's 2.8 m) and, at z -8.3..-5.7, leaves the entire room width open south of it (room
  // depth is -9.0..-5.8) — real, verified clearance on both sides, not a knife's edge.
  // FIX ON INTEGRATION (round 2): the first placement of this door used a 0.2 m gap between
  // histology's south wall and the new room's own north wall — modeled on an EARLIER, now-superseded
  // comment about a tight structural gap elsewhere, not on how a door here actually has to work. Every
  // other door in this building sits in a 1.6 m gap between the two rooms it connects (matching its
  // own 1.6 m width, e.g. `door:main-experimental`'s 1.6 m gap between main-hall's maxZ 4.2 and
  // experimental's minZ 5.8) — with each room's own 0.16 m wall centered on its boundary, a 0.2 m gap
  // leaves only ~0.04 m of open floor between the two walls, far short of the ~0.7 m the agent's own
  // collision radius needs to pass through at all (confirmed unreachable by the real `planPath`
  // check). Moved to the same 1.6 m gap pattern (room's near wall at -10.6, door centered at -9.8).
  { id: 'door:histology-biomedical-bay', from: 'histology', to: 'biomedical-bay', center: { x: 2.1, z: -9.8 }, width: 1.6, height: 2.3, traversable: true },
];

export const GENESIS_LAB_DOORS = DOORS;

export const GENESIS_LAB_ROOMS: readonly GenesisLabRoom[] = [
  room('main-hall', 'MAIN HALL / CONTROL', -4.2, 4.2, -4.2, 4.2,
    'Central circulation, command, evidence and experiment control.',
    ['station:evidence', 'station:compute', 'station:safety'], DOORS.filter(d => d.from === 'main-hall').map(d => d.id)),
  room('human-study', 'HUMAN STUDY', -10.0, -5.8, -3.6, 3.6,
    'Human Biology / Digital Twin study area.',
    ['station:human-study', 'station:neuro'], ['door:main-human']),
  room('microscopy', 'MICROSCOPY', -4.0, -0.2, -9.0, -5.8,
    'Microscopy, specimen observation and preparation.',
    ['station:microscopy'], ['door:main-micro']),
  room('histology', 'HISTOLOGY', 0.2, 4.0, -9.0, -5.8,
    'Histology and tissue preparation.',
    ['station:histology'], ['door:main-histo', 'door:histology-biomedical-bay']),
  room('imaging', 'IMAGING', 5.8, 10.0, -3.6, 3.6,
    'Imaging and scan workstation.',
    ['station:imaging'], ['door:main-imaging']),
  room('wet-lab', 'WET LAB / SAMPLES', -4.0, -0.2, 5.8, 9.0,
    'Sample handling, storage and biosafety.',
    ['station:wet-sample-prep', 'station:wet-lab-bench', 'station:wet-analytical'], ['door:main-wet']),
  // FIX ON INTEGRATION (Biomedical Intervention Bay, superseded approach — kept as a record): this
  // room was originally enlarged in four rounds (east to 7.0, south to 14.6) and the bay's own visual
  // scale reduced (`REGENERATIVE_BAY_VISUAL_SCALE`) to make its true, measured 7.73 x 5.95 m footprint
  // (see `regenerativeMedicineBay.ts`'s footprintW/footprintD comment) fit here alongside orpheus. On
  // review, that approach was explicitly rejected: the Bay must be a real, physical station at its
  // true 1:1 scale, not a scaled-down model, and this room must stay at its original footprint. See
  // the `biomedical-bay` room below for where the Bay actually lives now. Reverted to its original
  // -0.1..5.6 -> 0.2..4.0 / 5.8..9.0 bounds and single station.
  room('experimental', 'EXPERIMENTAL / MODEL', 0.2, 4.0, 5.8, 9.0,
    'Experimental/model equipment and the Orpheus workflow.',
    ['station:orpheus'], ['door:main-experimental']),
  // 8th room: the Biomedical Intervention Bay at its true, unscaled 1:1 footprint (7.73 x 5.95 m,
  // measured directly from the delivered package's own geometry — see
  // `regenerativeMedicineBay.ts`'s footprintW/footprintD comment; its own DECLARED 5.8x7.2 does not
  // match what the geometry file actually builds). No existing room or gap in the original 7-room
  // building can hold that scale without cutting into a protected neighbor (imaging) or gutting
  // main-hall's circulation role — see the `experimental` room's superseded-approach comment above and
  // this session's earlier full room/gap search. A dedicated new room, south of histology (reached off
  // its own far wall, `door:histology-biomedical-bay` — see the door comment for the other three
  // connections tried and empirically rejected) into open exterior volume nothing else occupies, holds
  // the Bay with real clearance on every side and a real corridor to its own operator approach point —
  // sized and placement-validated the same way as every other station (deterministic search + a real
  // `planPath` reachability check, not just "does it geometrically fit where it stands" — see
  // `regenerativeMedicineBayIntegration.ts`).
  room('biomedical-bay', 'BIOMEDICAL INTERVENTION BAY', -2.7, 6.9, -20.6, -10.6,
    'Regenerative medicine / biomedical intervention research station, at true scale.',
    ['station:regenerative-medicine'], ['door:histology-biomedical-bay']),
];

const stationRoom = new Map<string, GenesisLabRoomId>();
for (const r of GENESIS_LAB_ROOMS) for (const id of r.stationIds) stationRoom.set(id, r.id);

/**
 * Existing biology station ids remain unchanged; only their physical placement moves into the
 * canonical building. `station:safety` has no dedicated room of its own in this layout (the pack's
 * safety/PPE console reads naturally as part of the shared main-hall control bank alongside evidence
 * and compute — the delivered package placed it there too, at `{0, 0.9}` within main-hall bounds).
 */
const STATION_POSITIONS: Readonly<Record<string, Vec2>> = {
  'station:human-study': { x: -7.8, z: 0.0 },
  'station:neuro': { x: -7.8, z: 2.0 },
  'station:microscopy': { x: -2.4, z: -7.0 },
  'station:histology': { x: 2.4, z: -7.0 },
  'station:imaging': { x: 7.8, z: 0.0 },
  // Canonical Laboratory audit: the delivered package's own z=7.0 left only 1.2 m of clearance to the
  // room's north wall/door (z=5.8) — less than the station's own 1.5 m operator standoff, so the agent's
  // stop point fell outside the experimental room entirely (through the wall), caught by
  // biologyLabWorldCanonicalIntegration.test.ts's per-station AgentController reachability suite.
  // Moved 0.6 m south (deeper into the room, still inside its own footprint margins) for real clearance.
  //
  // (A second, further move to 8.2 m was made and then reverted while this room briefly also hosted
  // the Biomedical Intervention Bay behind orpheus — see the `experimental` room's superseded-approach
  // comment in the room list above. The Bay now lives in its own dedicated room, so orpheus is back at
  // its original 7.6, its own footprint/facing/standoff/experiment id/door all unchanged throughout.)
  'station:orpheus': { x: 2.4, z: 7.6 },
  'station:evidence': { x: 0.0, z: 0.9 },
  'station:compute': { x: 2.1, z: 0.9 },
  'station:safety': { x: -2.1, z: 0.9 },
  // Wet Lab (3.8 m x 3.2 m; door gap on the north wall at x -2.5..-0.9): spread along the west/south
  // walls, clear of both the doorway and each other.
  'station:wet-sample-prep': { x: -3.5, z: 6.8 },
  'station:wet-lab-bench': { x: -2.1, z: 8.5 },
  'station:wet-analytical': { x: -0.7, z: 6.8 },
};

const stationPlacements: GenesisLabStationPlacement[] = [];
for (const stationId of KNOWN_BIOLOGY_STATION_IDS) {
  const position = STATION_POSITIONS[stationId];
  const roomId = stationRoom.get(stationId) ?? (stationId === 'station:safety' ? 'main-hall' : undefined);
  if (position && roomId) stationPlacements.push({ stationId, roomId, position });
}

function rect(x: number, z: number, width: number, depth: number): Obstacle {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

type Edge = 'minX' | 'maxX' | 'minZ' | 'maxZ';

/**
 * FIX ON INTEGRATION: the delivered package (both this file and `canonicalLaboratoryGeometry.ts`,
 * which shares the identical bug) matched a door to a wall edge by near-exact coordinate equality
 * (`Math.abs(d.center.z - fixed) < 0.05`). Every door in this layout sits at the MIDPOINT of the
 * gap between two rooms' own bounds — e.g. `door:main-human` at x=-5.0 is the midpoint of main-hall's
 * west edge (x=-4.2) and human-study's east edge (x=-5.8), not flush against either — so that exact
 * match never fires for ANY of the six doors, on EITHER side. As delivered, every room wall would
 * therefore render/block fully solid, with the door's frame/glass floating, disconnected, in the
 * empty gap between two sealed rooms: not one of the six connections would actually be walkable.
 * Fixed by assigning each door to the room edge CLOSEST to it (not requiring exact alignment) and
 * cutting the gap there — matching what "a door connects two adjacent rooms across a shared corridor"
 * actually requires.
 */
function closestEdge(bounds: RoomBounds, door: GenesisLabDoor): Edge {
  const distances: readonly [Edge, number][] = [
    ['minX', Math.abs(door.center.x - bounds.minX)],
    ['maxX', Math.abs(door.center.x - bounds.maxX)],
    ['minZ', Math.abs(door.center.z - bounds.minZ)],
    ['maxZ', Math.abs(door.center.z - bounds.maxZ)],
  ];
  return distances.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
}

/** One wall segment per straight run between door gaps on a room edge — produces navigation
 * `Obstacle` rectangles; `canonicalLaboratoryGeometry.ts` produces the matching visual meshes from
 * the same closest-edge assignment, so the wall and the walkable surface can never drift apart. */
function wallSegmentsForEdge(axis: 'x' | 'z', fixed: number, start: number, end: number, doors: readonly GenesisLabDoor[], thickness = 0.16): Obstacle[] {
  const relevant = [...doors].sort((a, b) => (axis === 'x' ? a.center.x - b.center.x : a.center.z - b.center.z));
  const segments: Obstacle[] = [];
  let cursor = start;
  for (const door of relevant) {
    const center = axis === 'x' ? door.center.x : door.center.z;
    const a = center - door.width / 2;
    const b = center + door.width / 2;
    if (a > cursor) segments.push(axis === 'x' ? rect((cursor + a) / 2, fixed, a - cursor, thickness) : rect(fixed, (cursor + a) / 2, thickness, a - cursor));
    cursor = Math.max(cursor, b);
  }
  if (cursor < end) segments.push(axis === 'x' ? rect((cursor + end) / 2, fixed, end - cursor, thickness) : rect(fixed, (cursor + end) / 2, thickness, end - cursor));
  return segments;
}

function buildWallObstacles(rooms: readonly GenesisLabRoom[]): readonly Obstacle[] {
  const out: Obstacle[] = [];
  for (const r of rooms) {
    const doors = DOORS.filter((d) => r.doors.includes(d.id));
    const byEdge: Record<Edge, GenesisLabDoor[]> = { minX: [], maxX: [], minZ: [], maxZ: [] };
    for (const d of doors) byEdge[closestEdge(r.bounds, d)].push(d);
    const { minX, maxX, minZ, maxZ } = r.bounds;
    out.push(...wallSegmentsForEdge('x', minZ, minX, maxX, byEdge.minZ));
    out.push(...wallSegmentsForEdge('x', maxZ, minX, maxX, byEdge.maxZ));
    out.push(...wallSegmentsForEdge('z', minX, minZ, maxZ, byEdge.minX));
    out.push(...wallSegmentsForEdge('z', maxX, minZ, maxZ, byEdge.maxX));
  }
  return out;
}

/** `footprintOf`, if given, returns a real `[width, depth]` in metres for a station id (the caller's
 * own, more accurate footprint data — see `biologyLabWorld.ts`'s `HOST` map); the default keeps this
 * module fully self-contained (see the header note on why it does not import the station catalog). */
export function createCanonicalLaboratory(footprintOf?: (stationId: string) => readonly [number, number] | null): GenesisCanonicalLaboratory {
  const obstacles: Obstacle[] = stationPlacements.map(({ stationId, position }) => {
    const [w, d] = footprintOf?.(stationId) ?? [1.2, 0.8];
    return rect(position.x, position.z, Math.max(0.9, w), Math.max(0.7, d));
  });

  return {
    id: 'world:genesis-canonical-laboratory',
    version: 1,
    // z grown from 18.8 to cover the new `biomedical-bay` room's north (minZ -20.6) bound, + margin —
    // see that room's comment above (its X extent, -2.7..6.9, already fits inside the existing 20.8 m
    // symmetric X clamp). Purely additive: this only widens the symmetric outer nav clamp
    // (`BIOLOGY_ROOM` in biologyLabWorld.ts), it does not move, resize or touch any other room, door
    // or station.
    dimensionsMeters: { x: 20.8, y: 4.2, z: 41.6 },
    rooms: GENESIS_LAB_ROOMS,
    doors: DOORS,
    stationPlacements,
    staticObstacles: obstacles,
    wallObstacles: buildWallObstacles(GENESIS_LAB_ROOMS),
    spawn: { position: { x: 0, z: 3.0 }, facing: Math.PI, roomId: 'main-hall' },
  };
}

export function getLabRoom(roomId: GenesisLabRoomId): GenesisLabRoom {
  const found = GENESIS_LAB_ROOMS.find(r => r.id === roomId);
  if (!found) throw new Error(`Unknown Genesis Lab room: ${roomId}`);
  return found;
}

export function getRoomForStation(stationId: string): GenesisLabRoomId | null {
  return stationRoom.get(stationId) ?? (stationId === 'station:safety' ? 'main-hall' : null);
}

export function getStationPlacement(stationId: string): GenesisLabStationPlacement | null {
  return stationPlacements.find(p => p.stationId === stationId) ?? null;
}

export function getLabDoor(id: string): GenesisLabDoor | null {
  return DOORS.find(d => d.id === id) ?? null;
}

export function getConnectedRooms(roomId: GenesisLabRoomId): readonly GenesisLabRoomId[] {
  const out: GenesisLabRoomId[] = [];
  for (const door of DOORS) {
    if (door.from === roomId) out.push(door.to);
    else if (door.to === roomId) out.push(door.from);
  }
  return out;
}

export function getRoomAtPosition(position: Vec2): GenesisLabRoomId | null {
  for (const r of GENESIS_LAB_ROOMS) {
    const b = r.bounds;
    if (position.x >= b.minX && position.x <= b.maxX && position.z >= b.minZ && position.z <= b.maxZ) return r.id;
  }
  return null;
}

export function assertCanonicalLaboratoryIntegrity(lab = createCanonicalLaboratory()): void {
  const roomIds = new Set(lab.rooms.map(r => r.id));
  if (roomIds.size !== lab.rooms.length) throw new Error('Duplicate lab room id');
  const doorIds = new Set(lab.doors.map(d => d.id));
  if (doorIds.size !== lab.doors.length) throw new Error('Duplicate lab door id');

  for (const door of lab.doors) {
    if (!roomIds.has(door.from) || !roomIds.has(door.to)) throw new Error(`Door ${door.id} references unknown room`);
    if (door.from === door.to) throw new Error(`Door ${door.id} connects a room to itself`);
    if (door.width <= 0 || door.height <= 0) throw new Error(`Invalid dimensions for ${door.id}`);
  }

  for (const placement of lab.stationPlacements) {
    if (!roomIds.has(placement.roomId)) throw new Error(`Station ${placement.stationId} references unknown room`);
    if (!KNOWN_BIOLOGY_STATION_IDS.includes(placement.stationId)) throw new Error(`Unknown station ${placement.stationId}`);
  }
}
