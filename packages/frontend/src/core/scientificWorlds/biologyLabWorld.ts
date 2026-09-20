import type { Obstacle, RoomBounds, Vec2 } from '../three/firstPersonController';
import { GENESIS_LAB_EQUIPMENT, GENESIS_LAB_STATIONS } from './humanLab/labStations';
import { createGenesisBiologyLabScene, type GenesisBiologyLabScene } from './humanLab/labEnvironment';
import type { LabStation as BiologyPackStation, EquipmentItem } from './humanLab/types';
import type { CommandCatalog } from './worldCommand';
import type { BiologyStationKind, LabStation } from './labWorld';
import { BIOLOGY_COMMAND_RESOLVER } from './biologyCommandResolver';
import { MIRROR_TWIN_COMMAND_RESOLVER } from './mirrorTwinCommandResolver';
import { createCanonicalLaboratory, getLabRoom, getStationPlacement } from './canonicalLaboratory';
import { createCanonicalRegenerativeBayStation, appendRegenerativeBayStation, regenerativeBayEquipmentItems } from './humanLab/regenerativeMedicineBayIntegration';

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
  /** A multi-experiment station (the same pattern the Biomedical Bay uses): several canonical experiment ids at ONE physical station, never a second station. */
  readonly experimentIds?: readonly string[];
  readonly experimentAliases?: readonly { readonly experimentId: string; readonly keywords: readonly string[] }[];
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
  // Canonical Laboratory audit: compute/safety face flush against main-hall's WEST and NORTH walls
  // respectively (MAIN_HALL_CONSOLE_OVERRIDE below) — the opposite walls from the original V3 pack's
  // single-room layout their `facing` was tuned for. Left at the pack's original facing, the operator
  // standoff point (`position + standoff` in the facing direction) walked straight through that wall,
  // out of main-hall entirely — invisible in the old borderless single room, caught only once real
  // walls existed (see biologyLabWorldCanonicalIntegration.test.ts's per-station AgentController
  // reachability suite). Fixed by facing each console INTO the room instead of into its own wall.
  'station:compute': { kind: 'compute', facing: Math.PI / 2, standoff: 1.3, consoleHeight: 1.0, footprint: [1.0, 3.4], label: 'Ściana obliczeniowa', experimentId: 'central-dogma',
    keywords: ['compute', 'obliczeni', 'sciana obliczeniowa', 'serwer', 'rack', 'komputer', 'replay wall', 'dna', 'rna', 'sekwencj', 'transkrypcj', 'translacj', 'central dogma', 'dogmat', 'kodon', 'codon', 'atp', 'bialk', 'peptyd'] },
  'station:evidence': { kind: 'evidence', facing: -Math.PI / 2, standoff: 1.3, consoleHeight: 1.0, footprint: [0.8, 3.4], label: 'Ściana dowodów — EvidenceLedger',
    keywords: ['evidence', 'dowod', 'dowody', 'ledger', 'sciana dowodow', 'provenance', 'pochodzenie'] },
  'station:safety': { kind: 'safety', facing: 0, standoff: 1.2, consoleHeight: 1.0, footprint: [1.8, 0.9], label: 'Konsola bezpieczeństwa i dostępu',
    keywords: ['safety', 'bezpieczen', 'dostep', 'ppe', 'sluza', 'airlock', 'kombinezon'] },
  // Wet Lab: host-added physical stations — the V3 pack never defined a wet-lab program, so these
  // three have no pack equivalent (no positionMeters). Real geometry, real position, real facing,
  // real navigation. Genesis Chemistry v0.2.1's knowledge adapter (`chemistryRunners.ts`, composed
  // into `createCanonicalHumanBiologyExperimentRunner`) is now the real ExperimentSession provider
  // for each: no fabricated dataset, no second engine — the same base data installed under
  // `packages/core/src/chemistry` (see CLAUDE_APPLY.md's v0.1/v0.2.1 packages). Facing points each
  // console into the room, away from its own wall.
  'station:wet-sample-prep': { kind: 'sample-preparation', facing: Math.PI / 2, standoff: 1.0, consoleHeight: 0.9, footprint: [1.0, 1.6], label: 'Stanowisko przygotowania próbek', experimentId: 'chemistry-sample-identification',
    keywords: ['przygotowanie probek', 'przygotowania probek', 'stanowisko przygotowania', 'sample preparation', 'preparation bench'] },
  'station:wet-lab-bench': { kind: 'wet-lab-bench', facing: Math.PI, standoff: 1.0, consoleHeight: 0.88, footprint: [1.8, 1.0], label: 'Stół laboratoryjny (wet lab)', experimentId: 'chemistry-reaction-balance',
    keywords: ['stol laboratoryjny', 'lawa laboratoryjna', 'wet lab bench', 'stanowisko mokre', 'mokre stanowisko'] },
  // D-138: the analytical bench is the natural home for the two D-137 chemistry additions
  // (molecular docking, pharmacokinetics) alongside its existing elemental analysis — one physical
  // station, three canonical experiment ids, the SAME multi-experiment pattern the Biomedical Bay
  // already established (`experimentIds`/`experimentAliases`). Elemental analysis stays the default
  // (`experimentId`) when no alias matches, so existing behavior is unchanged.
  'station:wet-analytical': { kind: 'analytical-bench', facing: -Math.PI / 2, standoff: 1.0, consoleHeight: 0.86, footprint: [1.0, 1.6], label: 'Stanowisko analityczne', experimentId: 'chemistry-elemental-analysis',
    experimentIds: ['chemistry-elemental-analysis', 'chemistry-molecular-docking', 'chemistry-pharmacokinetics', 'chemistry-pka-lookup'],
    experimentAliases: [
      { experimentId: 'chemistry-molecular-docking', keywords: ['dokowanie', 'zadokuj', 'dokuj ligand', 'molecular docking', 'dock the ligand', 'run docking'] },
      { experimentId: 'chemistry-pharmacokinetics', keywords: ['farmakokinetyk', 'kinetyka leku', 'pharmacokinetics', 'pk profile', 'pk model'] },
      { experimentId: 'chemistry-pka-lookup', keywords: ['pka', 'stala dysocjacji', 'pka lookup', 'sprawdz pka', 'acid dissociation'] },
    ],
    keywords: ['stanowisko analityczne', 'stol analityczny', 'analytical bench', 'wet lab analysis'] },
};

/** Wet Lab station ids with no V3 pack equivalent — position comes solely from `getStationPlacement` (registered in `canonicalLaboratory.ts`), since there is no pack `positionMeters` to fall back to. */
const WET_LAB_STATION_IDS: readonly string[] = ['station:wet-sample-prep', 'station:wet-lab-bench', 'station:wet-analytical'];

function toHostOnlyStation(stationId: string): LabStation {
  const h = HOST[stationId];
  if (!h) throw new Error(`BIOLOGY_STATION_WITHOUT_HOST_SPEC:${stationId}`);
  const placement = getStationPlacement(stationId);
  if (!placement) throw new Error(`BIOLOGY_STATION_WITHOUT_CANONICAL_PLACEMENT:${stationId}`);
  const [w, d] = h.footprint;
  const pos = placement.position;
  return {
    id: stationId, kind: h.kind, label: h.label, keywords: h.keywords,
    ...(h.experimentId ? { experimentId: h.experimentId } : {}),
    ...(h.experimentIds ? { experimentIds: h.experimentIds } : {}),
    ...(h.experimentAliases ? { experimentAliases: h.experimentAliases } : {}),
    position: pos, facing: h.facing, standoff: h.standoff, consoleHeight: h.consoleHeight,
    footprint: fp(pos.x, pos.z, w, d),
  };
}

/**
 * The Canonical Laboratory (`canonicalLaboratory.ts`) — seven real rooms, six doors, deterministic
 * station placements and wall obstacles with a real gap at every door, so the existing grid-A*
 * (`navigationPlanner.ts`) routes the agent room-to-room "for free". `footprintOf` hands it this
 * module's own, more accurate `HOST` footprints instead of its generic fallback.
 */
const CANONICAL_LAB = createCanonicalLaboratory((stationId) => HOST[stationId]?.footprint ?? null);

const CANONICAL_HALF_X = CANONICAL_LAB.dimensionsMeters.x / 2;
const CANONICAL_HALF_Z = CANONICAL_LAB.dimensionsMeters.z / 2;
export const BIOLOGY_ROOM: RoomBounds = { minX: -CANONICAL_HALF_X, maxX: CANONICAL_HALF_X, minZ: -CANONICAL_HALF_Z, maxZ: CANONICAL_HALF_Z };

/** Spawn point of the canonical building: main hall, south side, facing north toward the twin chamber. */
export const BIOLOGY_SPAWN: { readonly position: Vec2; readonly facing: number } = { position: CANONICAL_LAB.spawn.position, facing: CANONICAL_LAB.spawn.facing };

/**
 * `canonicalLaboratory.ts`'s own `STATION_POSITIONS` clusters the three main-hall consoles
 * (evidence/compute/safety) around `{0, 0.9}` — a placement it never had to reconcile with a
 * physical Human Digital Twin chamber, because in its model the twin lives inside `human-study`.
 * This scene's twin chamber is a separate, pre-existing D-134 fixture hardcoded at main-hall's
 * center `(0,0)` (see `TWIN_CHAMBER` below) that deliberately never moves, so the package's own
 * cluster would overlap it. These three overrides keep each console inside main-hall, clear of the
 * twin chamber and of every door gap, by flushing the two long "wall" consoles (evidence, compute —
 * each already 3.4 m deep, sized for a 20 m room) against the one free wall segment on their own
 * side that exactly matches their depth, and centering the safety console in the one free segment
 * of the north wall between the microscopy and histology door gaps.
 */
const MAIN_HALL_CONSOLE_OVERRIDE: Readonly<Record<string, Vec2>> = {
  'station:evidence': { x: 3.8, z: -2.5 },
  'station:compute': { x: -3.7, z: 2.5 },
  'station:safety': { x: 0, z: -3.3 },
};

function stationPosition(stationId: string, fallback: Vec2): Vec2 {
  const override = MAIN_HALL_CONSOLE_OVERRIDE[stationId];
  if (override) return override;
  return getStationPlacement(stationId)?.position ?? fallback;
}

function toLabStation(s: BiologyPackStation): LabStation {
  const h = HOST[s.stationId];
  if (!h) throw new Error(`BIOLOGY_STATION_WITHOUT_HOST_SPEC:${s.stationId}`);
  const [w, d] = h.footprint;
  const pos = stationPosition(s.stationId, { x: s.positionMeters.x, z: s.positionMeters.z });
  return {
    id: s.stationId, kind: h.kind, label: h.label, keywords: h.keywords,
    ...(h.experimentId ? { experimentId: h.experimentId } : {}),
    ...(h.experimentIds ? { experimentIds: h.experimentIds } : {}),
    ...(h.experimentAliases ? { experimentAliases: h.experimentAliases } : {}),
    position: pos, facing: h.facing, standoff: h.standoff, consoleHeight: h.consoleHeight,
    footprint: fp(pos.x, pos.z, w, d),
  };
}

/** The nine pack stations (ids verbatim, placed inside the Canonical Laboratory's rooms) plus the three host-added Wet Lab stations. */
const BIOLOGY_STATIONS_BASE: readonly LabStation[] = [...GENESIS_LAB_STATIONS.map(toLabStation), ...WET_LAB_STATION_IDS.map(toHostOnlyStation)];

/**
 * Biomedical Intervention Bay integration: registers the SINGLE physical station the supplied
 * package describes, at its TRUE, unscaled 1:1 footprint (7.73 x 5.95 m — see
 * `regenerativeMedicineBay.ts`'s `REGENERATIVE_BAY_VISUAL_SCALE` comment), using its own
 * deterministic placement search against the dedicated `biomedical-bay` room's bounds (see
 * `canonicalLaboratory.ts`'s room-list comment for why this needed its own room rather than fitting
 * inside `experimental`). No hard-coded coordinates, no second station registry: this is the exact
 * same `LabStation` shape and the exact same `BIOLOGY_STATIONS` array every other station is in. This
 * room has no other station in it, so there is no obstacle to route around.
 *
 * FIX ON INTEGRATION: a placement that only checks the bay's own footprint against the room can still
 * pick an approach point no agent can actually walk to (a station this wide can, in a tight room, seal
 * off its own far side from the door with no corridor around it — see this file's git history for the
 * case that first caught it). `navEntryPoint`/`navRoom`/`navObstacles` hand the search the SAME
 * `BIOLOGY_ROOM`/`BIOLOGY_SPAWN`/walls the real `AgentController` navigates with (everything except
 * the bay itself, which does not exist yet), so the winning candidate is proven reachable by the exact
 * planner that will actually walk it there, not just geometrically unobstructed where it stands.
 */
const BIOMEDICAL_BAY_ROOM = getLabRoom('biomedical-bay');
const REGENERATIVE_BAY_STATION = createCanonicalRegenerativeBayStation({
  room: BIOMEDICAL_BAY_ROOM.bounds,
  obstacles: [],
  navEntryPoint: BIOLOGY_SPAWN.position,
  navRoom: BIOLOGY_ROOM,
  navObstacles: [...BIOLOGY_STATIONS_BASE.map((s) => s.footprint), ...CANONICAL_LAB.wallObstacles],
});

export const BIOLOGY_STATIONS: readonly LabStation[] = appendRegenerativeBayStation(BIOLOGY_STATIONS_BASE, REGENERATIVE_BAY_STATION);

/** `GENESIS_LAB_EQUIPMENT` (the V3 pack's own registry) plus the bay's six equipment contracts,
 * converted to the same shape. `labEnvironment.ts`'s own scene builder still reads the pack's
 * registry alone (it cross-references `GENESIS_LAB_STATIONS`, the pack's 9 stations, which the bay
 * is deliberately not part of) — this combined list is what `equipmentAt` below hands out, the one
 * function every other caller already uses, so nothing needs a second lookup path. */
const BIOLOGY_EQUIPMENT: readonly EquipmentItem[] = [...GENESIS_LAB_EQUIPMENT, ...regenerativeBayEquipmentItems()];

/** The central Human Digital Twin chamber (platform + glass cylinder) sits in main-hall and never moves — protects D-134's camera/organ-picking math, which is anchored to this fixed position. */
export const TWIN_CHAMBER: { readonly position: Vec2; readonly radius: number; readonly height: number } = { position: { x: 0, z: 0 }, radius: 1.15, height: 3.1 };

export const BIOLOGY_OBSTACLES: readonly Obstacle[] = [
  ...BIOLOGY_STATIONS.map((s) => s.footprint),
  fp(TWIN_CHAMBER.position.x, TWIN_CHAMBER.position.z, TWIN_CHAMBER.radius * 2 + 0.5, TWIN_CHAMBER.radius * 2 + 0.5),
  ...CANONICAL_LAB.wallObstacles,
];

export const BIOLOGY_CATALOG: CommandCatalog = {
  worldId: BIOLOGY_WORLD_ID,
  stations: BIOLOGY_STATIONS,
  allowedIntents: ['NAVIGATE', 'INTERACT', 'RUN_EXPERIMENT', 'ASK', 'SCENARIO', 'INSPECT'],
  // Mirror Twin checked first: its match ("mirror"/"lustro"/"blizniak") is narrow and specific, so it
  // must never be shadowed by the biology resolver's broader organ/mode keyword matching.
  resolvers: [MIRROR_TWIN_COMMAND_RESOLVER, BIOLOGY_COMMAND_RESOLVER],
};

export function biologyStation(id: string): LabStation | null { return BIOLOGY_STATIONS.find((s) => s.id === id) ?? null; }

/** Equipment the pack places at a station (asset slots are contracts — see biologyLabKit for what each slot is bound to). */
export function equipmentAt(stationId: string) { return BIOLOGY_EQUIPMENT.filter((e) => e.stationId === stationId); }
