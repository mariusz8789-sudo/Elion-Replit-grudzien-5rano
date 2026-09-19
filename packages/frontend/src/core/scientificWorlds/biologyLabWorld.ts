import type { Obstacle, RoomBounds, Vec2 } from '../three/firstPersonController';
import { GENESIS_LAB_EQUIPMENT, GENESIS_LAB_STATIONS } from './humanLab/labStations';
import { createGenesisBiologyLabScene, type GenesisBiologyLabScene } from './humanLab/labEnvironment';
import type { LabStation as BiologyPackStation } from './humanLab/types';
import type { CommandCatalog } from './worldCommand';
import type { BiologyStationKind, LabStation } from './labWorld';

/**
 * SCIENTIFIC WORLDS — THE HUMAN BIOLOGY LABORATORY (pure data).
 *
 * The V3 execution pack describes the lab as renderer-agnostic contracts:
 * `createGenesisBiologyLabScene()` (20 × 4.2 × 20 m, nine stations with
 * stable `station:*` ids, equipment with asset slots, light nodes, a
 * realism profile). This module is the ONLY bridge from that description to
 * the canonical stack — the same `LabStation` shape the command parser, the
 * A* planner, the character controller and AgentLabScene3D already consume.
 * Station ids and positions are the pack's, verbatim; what is added here is
 * what the pack leaves to the host: which way each console faces, where the
 * operator stands, the floor footprint, the words a command may use, and
 * which canonical experiment the station runs.
 */

export const BIOLOGY_SCENE: GenesisBiologyLabScene = createGenesisBiologyLabScene();
export const BIOLOGY_WORLD_ID = BIOLOGY_SCENE.sceneId;
export const BIOLOGY_CEILING_M = BIOLOGY_SCENE.dimensionsMeters.y;

const HALF_X = BIOLOGY_SCENE.dimensionsMeters.x / 2;
const HALF_Z = BIOLOGY_SCENE.dimensionsMeters.z / 2;
export const BIOLOGY_ROOM: RoomBounds = { minX: -HALF_X, maxX: HALF_X, minZ: -HALF_Z, maxZ: HALF_Z };

/** Spawn at the south (entry) end, west of the safety console, looking toward the twin chamber (the ORPHEUS bay stays to the right of the frame). */
export const BIOLOGY_SPAWN: { readonly position: Vec2; readonly facing: number } = { position: { x: -2.6, z: 8.8 }, facing: Math.atan2(2.6, -8.8) };

const fp = (x: number, z: number, w: number, d: number): Obstacle => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

interface HostSpec {
  readonly kind: BiologyStationKind;
  readonly facing: number;
  readonly standoff: number;
  readonly consoleHeight: number;
  /** Footprint in metres: width along world X, depth along world Z. */
  readonly footprint: readonly [w: number, d: number];
  readonly keywords: readonly string[];
  readonly experimentId?: string;
  readonly label: string;
}

/** Host-side facts per pack station id. `facing` = direction the console front points (0 = +Z, π/2 = +X). */
const HOST: Readonly<Record<string, HostSpec>> = {
  'station:human-study': { kind: 'human-study', facing: Math.PI / 2, standoff: 1.4, consoleHeight: 0.95, footprint: [1.2, 2.6], label: 'Stół anatomiczny — cyfrowy bliźniak', experimentId: 'physiology-state',
    keywords: ['wirtualnego czlowieka', 'wirtualny czlowiek', 'czlowieka', 'czlowiek', 'digital twin', 'human digital twin', 'twin', 'blizniak', 'anatomi', 'stol anatomiczny', 'human study', 'cialo', 'fizjologi', 'physiology'] },
  'station:neuro': { kind: 'neuro', facing: 0, standoff: 1.3, consoleHeight: 0.95, footprint: [2.6, 1.3], label: 'Konsola Neuro Lab', experimentId: 'neuro-signals',
    keywords: ['neuro', 'neurolab', 'neuro lab', 'konsola neuro', 'sygnaly nerwowe', 'neural signals', 'neuroscience'] },
  'station:microscopy': { kind: 'microscopy', facing: 0, standoff: 1.3, consoleHeight: 0.95, footprint: [2.8, 1.4], label: 'Hyperscope — mikroskopia', experimentId: 'hyperscope-capture',
    keywords: ['hyperscope', 'mikroskop', 'microscope', 'mikroskopi', 'microscopy', 'powieksz', 'zoom'] },
  'station:histology': { kind: 'histology', facing: -Math.PI / 2, standoff: 1.3, consoleHeight: 0.92, footprint: [1.3, 2.6], label: 'Stanowisko histologiczne', experimentId: 'histology-slide',
    keywords: ['histolog', 'preparat', 'slajd', 'slide', 'komorka', 'komorki', 'komorke', 'cell', 'tkank', 'tissue'] },
  'station:imaging': { kind: 'imaging', facing: Math.PI / 2, standoff: 1.5, consoleHeight: 0.95, footprint: [2.2, 3.2], label: 'Centrum obrazowania', experimentId: 'imaging-frame',
    keywords: ['obrazowani', 'imaging', 'tomograf', 'mri', 'rtg', 'x-ray', 'xray', 'usg', 'ultrasound', 'skan ct', 'ct scan'] },
  'station:orpheus': { kind: 'orpheus', facing: Math.PI, standoff: 1.5, consoleHeight: 0.95, footprint: [3.0, 2.4], label: 'ORPHEUS — analizator multimodalny', experimentId: 'orpheus-scan',
    keywords: ['orpheus', 'analizator', 'probk', 'probka', 'probke', 'sample', 'specimen', 'zbadaj'] },
  'station:compute': { kind: 'compute', facing: -Math.PI / 2, standoff: 1.3, consoleHeight: 1.0, footprint: [1.0, 3.4], label: 'Ściana obliczeniowa',
    keywords: ['compute', 'obliczeni', 'sciana obliczeniowa', 'serwer', 'rack', 'komputer', 'replay wall'] },
  'station:evidence': { kind: 'evidence', facing: -Math.PI / 2, standoff: 1.3, consoleHeight: 1.0, footprint: [0.8, 3.4], label: 'Ściana dowodów — EvidenceLedger',
    keywords: ['evidence', 'dowod', 'dowody', 'ledger', 'sciana dowodow', 'provenance', 'pochodzenie'] },
  'station:safety': { kind: 'safety', facing: Math.PI, standoff: 1.2, consoleHeight: 1.0, footprint: [1.8, 0.9], label: 'Konsola bezpieczeństwa i dostępu',
    keywords: ['safety', 'bezpieczen', 'dostep', 'ppe', 'sluza', 'airlock', 'kombinezon'] },
};

function toLabStation(s: BiologyPackStation): LabStation {
  const h = HOST[s.stationId];
  if (!h) throw new Error(`BIOLOGY_STATION_WITHOUT_HOST_SPEC:${s.stationId}`);
  const [w, d] = h.footprint;
  return {
    id: s.stationId, kind: h.kind, label: h.label, keywords: h.keywords,
    ...(h.experimentId ? { experimentId: h.experimentId } : {}),
    position: { x: s.positionMeters.x, z: s.positionMeters.z }, facing: h.facing, standoff: h.standoff, consoleHeight: h.consoleHeight,
    footprint: fp(s.positionMeters.x, s.positionMeters.z, w, d),
  };
}

/** The nine pack stations, ids and positions verbatim, as canonical LabStations. */
export const BIOLOGY_STATIONS: readonly LabStation[] = GENESIS_LAB_STATIONS.map(toLabStation);

/** The central Human Digital Twin chamber (platform + glass cylinder) is the island the agent walks around. */
export const TWIN_CHAMBER: { readonly position: Vec2; readonly radius: number; readonly height: number } = { position: { x: 0, z: 0 }, radius: 1.15, height: 3.1 };

export const BIOLOGY_OBSTACLES: readonly Obstacle[] = [
  ...BIOLOGY_STATIONS.map((s) => s.footprint),
  fp(TWIN_CHAMBER.position.x, TWIN_CHAMBER.position.z, TWIN_CHAMBER.radius * 2 + 0.5, TWIN_CHAMBER.radius * 2 + 0.5),
];

export const BIOLOGY_CATALOG: CommandCatalog = {
  worldId: BIOLOGY_WORLD_ID,
  stations: BIOLOGY_STATIONS,
  allowedIntents: ['NAVIGATE', 'INTERACT', 'RUN_EXPERIMENT', 'ASK', 'SCENARIO', 'INSPECT'],
};

export function biologyStation(id: string): LabStation | null { return BIOLOGY_STATIONS.find((s) => s.id === id) ?? null; }

/** Equipment the pack places at a station (asset slots are contracts — see biologyLabKit for what each slot is bound to). */
export function equipmentAt(stationId: string) { return GENESIS_LAB_EQUIPMENT.filter((e) => e.stationId === stationId); }
