import type { Obstacle, RoomBounds, Vec2 } from '../three/firstPersonController';
import type { CommandCatalog, StationDescriptor } from './worldCommand';

/**
 * SCIENTIFIC WORLDS — THE LABORATORY WORLD DEFINITION (pure data).
 *
 * One typed description shared by the command parser (what the stations are
 * called), the navigation planner (where they stand and what blocks the
 * floor), the character controller (where to stand and which way to face)
 * and the 3D scene (what to build). The scene builds FROM this; it never
 * defines a station of its own.
 */

/** Stations of the human-biology lab (V3 pack): the ids are the pack's own `station:*` ids, unchanged. */
export type BiologyStationKind = 'human-study' | 'neuro' | 'microscopy' | 'histology' | 'imaging' | 'orpheus' | 'compute' | 'evidence' | 'safety';
export type StationKind = 'synthesizer' | 'titration' | 'collider' | 'epidemiology' | 'window' | 'airlock' | BiologyStationKind;

export interface LabStation extends StationDescriptor {
  readonly kind: StationKind;
  /** Where the station stands on the floor. */
  readonly position: Vec2;
  /** Direction the console FRONT points (radians around Y, 0 = +Z): the operator stands `standoff` metres that way and looks back at it. */
  readonly facing: number;
  /** How far in front of the station the operator stands. */
  readonly standoff: number;
  /** Console top height above the floor — where the reaching hand goes. */
  readonly consoleHeight: number;
  /** Footprint on the floor, kept out of the walkable surface. */
  readonly footprint: Obstacle;
}

export const LAB_WORLD_ID = 'genesis-lab-agent';

export const LAB_ROOM: RoomBounds = { minX: -7, maxX: 7, minZ: -6, maxZ: 6 };

/** Agent spawn: inside the airlock end of the room, facing the stations. */
export const LAB_SPAWN: { readonly position: Vec2; readonly facing: number } = { position: { x: 0, z: 4.6 }, facing: Math.PI };

const fp = (x: number, z: number, w: number, d: number): Obstacle => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

export const LAB_STATIONS: readonly LabStation[] = [
  {
    id: 'st-synthesizer', kind: 'synthesizer', label: 'Syntezator kryształów', experimentId: 'crystal-synthesis',
    keywords: ['syntezator', 'syntezatora', 'syntezatorze', 'synteza', 'syntezie', 'kryształ', 'krysztal', 'crystal', 'synthesizer', 'lattice', 'sieć krystaliczna'],
    position: { x: -4.2, z: -3.2 }, facing: 0, standoff: 1.3, consoleHeight: 0.95, footprint: fp(-4.2, -3.2, 2.4, 1.2),
  },
  {
    id: 'st-titration', kind: 'titration', label: 'Stanowisko miareczkowania', experimentId: 'chemistry-titration',
    keywords: ['stanowisko miareczkowania', 'miareczkowanie', 'miareczkowania', 'miareczkuj', 'titracja', 'titracji', 'titration', 'kwas-zasada', 'kwas zasada', 'biureta', 'burette'],
    position: { x: 4.25, z: 2.55 }, facing: Math.PI, standoff: 1.25, consoleHeight: 0.98, footprint: fp(4.25, 2.55, 2.4, 1.2),
  },
  {
    id: 'st-collider', kind: 'collider', label: 'Konsola zderzacza', experimentId: 'collision-batch',
    keywords: ['zderzacz', 'zderzacza', 'zderzenie', 'collider', 'collision', 'konsola zderzacza', 'akcelerator', 'accelerator', 'czarna dziura', 'horyzont'],
    position: { x: 0, z: -4.4 }, facing: 0, standoff: 1.25, consoleHeight: 0.95, footprint: fp(0, -4.4, 2.6, 1.0),
  },
  {
    id: 'st-epidemiology', kind: 'epidemiology', label: 'Pulpit epidemiologiczny', experimentId: 'seir-epidemic',
    keywords: ['epidemi', 'epidemiolog', 'seir', 'zakażeń', 'zakazen', 'pandemi', 'szpital', 'hospital', 'epidemic', 'outbreak'],
    position: { x: 4.2, z: -3.2 }, facing: 0, standoff: 1.3, consoleHeight: 0.95, footprint: fp(4.2, -3.2, 2.4, 1.2),
  },
  {
    id: 'st-window', kind: 'window', label: 'Okno obserwacyjne', experimentId: 'spacetime-photon',
    keywords: ['okno', 'okna', 'szyba', 'window', 'glass', 'obserwacyjne', 'observation', 'foton', 'photon', 'czasoprzestrze', 'spacetime', 'shapiro', 'ugięcie', 'ugiecie', 'światł', 'swiatl', 'light'],
    position: { x: 6.6, z: 1.5 }, facing: -Math.PI / 2, standoff: 1.2, consoleHeight: 1.1, footprint: fp(6.6, 1.5, 0.4, 3.2),
  },
];

/** Central instrument island the agent must walk around. */
export const LAB_OBSTACLES: readonly Obstacle[] = [
  ...LAB_STATIONS.map((s) => s.footprint),
  // Glass Human Digital Twin chamber at the centre of the main laboratory.
  fp(0, 0.4, 2.2, 2.2),
  fp(-5.6, 3.6, 1.6, 1.0),
  fp(5.4, 3.8, 1.8, 1.0),
];

export const LAB_CATALOG: CommandCatalog = {
  worldId: LAB_WORLD_ID,
  stations: LAB_STATIONS,
  allowedIntents: ['NAVIGATE', 'INTERACT', 'RUN_EXPERIMENT', 'ASK', 'SCENARIO', 'INSPECT'],
};

export function labStation(id: string): LabStation | null {
  return LAB_STATIONS.find((s) => s.id === id) ?? null;
}
