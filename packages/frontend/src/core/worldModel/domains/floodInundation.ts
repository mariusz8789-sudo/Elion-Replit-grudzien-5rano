import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { defineCrossDomainCoupling, type CrossDomainCoupling } from '../crossDomain/crossDomainCoupling';
import { entityId, type EntityId, type GroundingLevel, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * PHASE 8.2 — FLOOD INUNDATION (depth and extent).
 *
 * Closes the gap `capability/solverCapability.ts` named for FLOOD: "Inundation
 * itself is NOT modelled: no terrain, no depth, no flood extent, no
 * hydrograph." Three of those four are now modelled. The fourth is not, and
 * still says so.
 *
 * ## What is real here
 *
 * **1. Volume balance.** dV/dt = Q_in − Q_out, integrated per tick, clamped at
 * zero. Q_in is Phase 5's real rational-method runoff; Q_out is the drainage
 * the pump-pipe system actually removes. Both are numbers the world already
 * computes — this adds conservation of volume between them, which is a real
 * physical constraint, not a tuning knob.
 *
 * **2. Volume-conserving, connectivity-constrained planar fill.** Given a
 * water volume and a terrain, `waterLevelForVolume` finds the single level L
 * at which the water exactly holds that volume, counting only cells
 * hydraulically CONNECTED to the low point through cells already below L.
 * This is the "bathtub" method used in real rapid flood screening, with the
 * connectivity constraint that addresses its best-known criticism (unconnected
 * hollows being wrongly reported as flooded). V(L) is monotone in L, which is
 * what makes the bisection below exact rather than heuristic.
 *
 * **3. The coupling that makes it matter.** When the pump trips, drainage
 * stops. Water then accumulates instead of being removed, and depth and extent
 * grow because of the volume balance — not because anything scripts them to.
 *
 * ## What is NOT modelled, and is not pretended to be
 *
 * - **No hydrograph, no routing, no flow dynamics.** A planar fill answers
 *   "if this much water came to rest on this terrain, how deep and how far
 *   would it reach". It does NOT answer how the flood front travels, how long
 *   it takes to arrive, or what velocity it has. Nothing here is a shallow-water
 *   or 2D hydrodynamic solver, and a depth from this must never be read as one.
 * - **One water level, so multi-basin spill is only DISCLOSED, not modelled.**
 *   When water reaches a saddle between two depressions, no single level holds
 *   the volume: `unrepresentedVolumeM3` reports what could not be placed rather
 *   than overstating depth by pushing the level past the jump.
 * - **No infiltration, and no drainage beyond the pump.** Soil storage,
 *   evaporation and any drainage path other than the modelled pump are absent,
 *   so a real catchment would shed water this model retains.
 * - **No building or obstacle interaction.** Water fills terrain cells; it does
 *   not flow around, into, or against structures.
 * - **The terrain may be synthetic — and that decides the grounding.** A
 *   `TerrainHeightfield` carries `surveyed`. With real survey/DEM elevations the
 *   solver reports `MODEL_ESTIMATE`; with the synthetic reference terrain it
 *   reports `PROCEDURAL_APPROXIMATION`, because a correct algorithm run over an
 *   invented ground yields a number that demonstrates the method rather than
 *   describing any real place. That rule is enforced in code (`groundingFor`),
 *   not left to a caller's discretion, and it upgrades by itself the day real
 *   elevations are loaded.
 */
export const FLOOD_INUNDATION_SOLVER_ID = 'flood-inundation-planar-fill';
export const FLOOD_DOMAIN_ID = 'flood-hydrology';

export const FLOOD_DRAINAGE_LOST_EVENT_TYPE = 'flood.drainage.lost';

/** Rule 3: the discrete state is a NUMBER. Thresholds are depths, and they are pedestrian-safety bands, not hydrology. */
export const FLOOD_STATE_CODE = { DRY: 0, PONDING: 1, FLOODED: 2, SEVERE: 3 } as const;

export const FLOOD_STATES = ['FLOOD_DRY', 'FLOOD_PONDING', 'FLOOD_FLOODED', 'FLOOD_SEVERE'] as const;
export type FloodState = (typeof FLOOD_STATES)[number];

/**
 * Depth bands, in metres. These classify a computed depth for display; they
 * never enter the computation. 0.1 m is the "wet feet, no hazard" line, 0.3 m
 * is roughly where a person begins to be destabilised in moving water and where
 * most vehicles stall — conventional civil-protection guidance, not a result
 * this model derives.
 */
const PONDING_DEPTH_M = 0.02;
const FLOODED_DEPTH_M = 0.1;
const SEVERE_DEPTH_M = 0.3;

export function floodStateCode(maxDepthM: number): number {
  if (!Number.isFinite(maxDepthM) || maxDepthM < PONDING_DEPTH_M) return FLOOD_STATE_CODE.DRY;
  if (maxDepthM < FLOODED_DEPTH_M) return FLOOD_STATE_CODE.PONDING;
  if (maxDepthM < SEVERE_DEPTH_M) return FLOOD_STATE_CODE.FLOODED;
  return FLOOD_STATE_CODE.SEVERE;
}

/** Total function: an out-of-range code still lands inside the allowlist. */
export function floodStateLabel(code: number): FloodState {
  switch (code) {
    case FLOOD_STATE_CODE.PONDING: return 'FLOOD_PONDING';
    case FLOOD_STATE_CODE.FLOODED: return 'FLOOD_FLOODED';
    case FLOOD_STATE_CODE.SEVERE: return 'FLOOD_SEVERE';
    default: return 'FLOOD_DRY';
  }
}

/**
 * A regular grid of ground elevations. Deliberately a plain data structure with
 * no solver attached, so real DEM/survey data can be dropped in unchanged.
 *
 * `surveyed` is the honesty flag the grounding rule reads: `true` only when the
 * elevations came from real measured data. Nothing in this module ever sets it
 * to `true` on its own.
 */
export interface TerrainHeightfield {
  readonly cols: number;
  readonly rows: number;
  /** Ground sample spacing, metres. Cell area is this squared. */
  readonly cellSizeM: number;
  /** Row-major, length `cols * rows`, metres above the terrain's own datum. */
  readonly elevationsM: readonly number[];
  readonly surveyed: boolean;
  /** Where the elevations came from — a citation when surveyed, a description of the construction when not. */
  readonly provenance: string;
}

export function cellAreaM2(terrain: TerrainHeightfield): number {
  return terrain.cellSizeM * terrain.cellSizeM;
}

/**
 * A deterministic synthetic terrain for the reference city: a shallow bowl with
 * small-scale roughness, so ponding has somewhere to happen.
 *
 * IT IS NOT A REAL PLACE, and `surveyed` is false, which is exactly what forces
 * every result computed on it down to `PROCEDURAL_APPROXIMATION`. It exists so
 * the inundation code has a terrain to run on and be tested against, not to
 * describe anywhere.
 *
 * Roughness uses a hash of the cell index rather than a stateful RNG, so the
 * same seed gives the same terrain regardless of traversal order or how many
 * terrains were built before it.
 */
export function buildSyntheticTerrain(options: { cols?: number; rows?: number; cellSizeM?: number; seed?: number; reliefM?: number } = {}): TerrainHeightfield {
  const cols = options.cols ?? 45;
  const rows = options.rows ?? 45;
  const cellSizeM = options.cellSizeM ?? 2;
  const seed = options.seed ?? 1;
  const reliefM = options.reliefM ?? 3;

  const elevationsM: number[] = new Array(cols * rows);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const maxR = Math.hypot(cx, cy);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = Math.hypot(x - cx, y - cy) / maxR; // 0 at the centre, 1 at the corners
      const bowl = reliefM * r * r;
      elevationsM[y * cols + x] = bowl + 0.15 * reliefM * hashUnit(seed, x, y);
    }
  }
  return {
    cols,
    rows,
    cellSizeM,
    elevationsM,
    surveyed: false,
    provenance: `synthetic bowl terrain (seed ${seed}, relief ${reliefM} m) — NOT a real place, NOT survey data`,
  };
}

/** Deterministic per-cell value in [0,1). mulberry32-style mixing of a 2D index. */
function hashUnit(seed: number, x: number, y: number): number {
  let a = (seed * 0x9e3779b1 + x * 0x85ebca6b + y * 0xc2b2ae35) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface InundationResult {
  /** Absolute water surface elevation, metres on the terrain's datum. */
  readonly waterLevelM: number;
  readonly maxDepthM: number;
  readonly meanDepthM: number;
  readonly floodedAreaM2: number;
  readonly floodedCells: number;
  /** Volume the returned level actually holds. */
  readonly heldVolumeM3: number;
  /**
   * Requested volume this single water level could NOT place, m³.
   *
   * Normally 0. It becomes positive when the water reaches a saddle and would
   * spill into a SEPARATE depression: the connected region then jumps in size
   * discontinuously, so no single level holds exactly the requested volume.
   * That is the real, well-known limitation of single-level (bathtub) fill —
   * physically the two basins would equalise at different levels, which needs a
   * multi-basin or dynamic model this is not.
   *
   * Rather than pick the level just ABOVE the jump (which would overstate depth
   * and extent — measured 3.6x on the reference terrain at small volumes), the
   * fill takes the level just BELOW it and reports the remainder here. Depth is
   * therefore never overstated, and the shortfall is visible instead of hidden.
   */
  readonly unrepresentedVolumeM3: number;
}

const DRY: InundationResult = { waterLevelM: 0, maxDepthM: 0, meanDepthM: 0, floodedAreaM2: 0, floodedCells: 0, heldVolumeM3: 0, unrepresentedVolumeM3: 0 };

/**
 * Volume held at water level `levelM`, counting only cells connected to the
 * terrain's lowest cell through cells that are themselves below `levelM`.
 *
 * The connectivity walk is what separates this from a naive bathtub: a hollow
 * that is below the water level but separated from the flooded region by higher
 * ground stays dry, because no water can reach it.
 */
function floodedRegionAt(terrain: TerrainHeightfield, levelM: number, seedIndex: number): { volumeM3: number; cells: number; maxDepthM: number } {
  const { cols, rows, elevationsM } = terrain;
  if (elevationsM[seedIndex] >= levelM) return { volumeM3: 0, cells: 0, maxDepthM: 0 };

  const area = cellAreaM2(terrain);
  const visited = new Uint8Array(cols * rows);
  const stack: number[] = [seedIndex];
  visited[seedIndex] = 1;
  let volumeM3 = 0;
  let cells = 0;
  let maxDepthM = 0;

  while (stack.length > 0) {
    const index = stack.pop()!;
    const depth = levelM - elevationsM[index];
    volumeM3 += depth * area;
    cells += 1;
    if (depth > maxDepthM) maxDepthM = depth;

    const x = index % cols;
    const y = (index - x) / cols;
    // 4-connectivity: water crosses cell edges, not corners. 8-connectivity would let a flood
    // leak diagonally through a one-cell-wide ridge, which is a known artefact, not a feature.
    if (x > 0) pushIfWet(index - 1);
    if (x < cols - 1) pushIfWet(index + 1);
    if (y > 0) pushIfWet(index - cols);
    if (y < rows - 1) pushIfWet(index + cols);
  }
  return { volumeM3, cells, maxDepthM };

  function pushIfWet(neighbour: number): void {
    if (visited[neighbour] === 1) return;
    if (elevationsM[neighbour] >= levelM) return;
    visited[neighbour] = 1;
    stack.push(neighbour);
  }
}

/**
 * The level that holds exactly `volumeM3`, by bisection.
 *
 * Bisection is exact rather than approximate here because the held volume is
 * monotone non-decreasing in the level: raising the level both deepens every
 * already-wet cell and can only add cells to the connected region, never remove
 * them. 60 halvings take the bracket well below micrometre precision on any
 * realistic terrain range.
 */
export function waterLevelForVolume(terrain: TerrainHeightfield, volumeM3: number): InundationResult {
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) return DRY;
  const { elevationsM } = terrain;
  if (elevationsM.length === 0) return DRY;

  let seedIndex = 0;
  for (let i = 1; i < elevationsM.length; i++) if (elevationsM[i] < elevationsM[seedIndex]) seedIndex = i;

  const minZ = elevationsM[seedIndex];
  let maxZ = minZ;
  for (let i = 0; i < elevationsM.length; i++) if (elevationsM[i] > maxZ) maxZ = elevationsM[i];

  // Upper bracket: the level that would submerge the whole grid, plus the head needed to hold the
  // remaining volume if it still does not fit. Guarantees the bisection brackets the answer.
  const totalArea = elevationsM.length * cellAreaM2(terrain);
  let hi = maxZ + volumeM3 / totalArea + 1;
  let lo = minZ;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (floodedRegionAt(terrain, mid, seedIndex).volumeM3 < volumeM3) lo = mid;
    else hi = mid;
  }

  // `lo` is the highest level whose held volume is still below the request. Taking it rather than
  // the midpoint is what makes the result conservative across a saddle: see `unrepresentedVolumeM3`.
  const levelM = lo;
  const region = floodedRegionAt(terrain, levelM, seedIndex);
  if (region.cells === 0) return { ...DRY, unrepresentedVolumeM3: volumeM3 };
  const floodedAreaM2 = region.cells * cellAreaM2(terrain);
  return {
    waterLevelM: levelM,
    maxDepthM: region.maxDepthM,
    meanDepthM: region.volumeM3 / floodedAreaM2,
    floodedAreaM2,
    floodedCells: region.cells,
    heldVolumeM3: region.volumeM3,
    unrepresentedVolumeM3: Math.max(0, volumeM3 - region.volumeM3),
  };
}

export interface FloodplainParams {
  /** Standing water volume, m³ — the state this domain actually integrates. */
  waterVolumeM3: number;
  /** Stormwater arriving, m³/s. Written by the rainfall coupling from Phase 5's real runoff. */
  inflowM3S: number;
  /** Water removed by drainage, m³/s. Written by the pump coupling; zero once the pump trips. */
  drainageM3S: number;
  /** 1 when the terrain is real surveyed/DEM data. Decides the grounding — see `groundingFor`. */
  terrainSurveyed: number;
}

export const FLOODPLAIN_DEFAULTS: FloodplainParams = {
  waterVolumeM3: 0,
  inflowM3S: 0,
  drainageM3S: 0,
  terrainSurveyed: 0,
};

/**
 * The honesty rule, in code rather than in a caller's discretion: a correct
 * algorithm over an invented ground demonstrates the method, it does not
 * describe a place.
 */
export function groundingFor(terrainSurveyed: number): GroundingLevel {
  return terrainSurveyed === 1 ? 'MODEL_ESTIMATE' : 'PROCEDURAL_APPROXIMATION';
}

let stepCounter = 0;

/**
 * One solver per floodplain entity, bound to one terrain. Synchronous and
 * allocation-light: the fill is recomputed only when the stored volume actually
 * changed, since a still floodplain has a still surface.
 */
export function makeFloodInundationSolver(terrain: TerrainHeightfield): DomainSolver {
  let cachedVolume = Number.NaN;
  let cached: InundationResult = DRY;

  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<FloodplainParams> | undefined;
    const params: FloodplainParams = { ...FLOODPLAIN_DEFAULTS, ...state };

    // Conservation of volume. Water cannot go negative: drainage can empty the
    // floodplain, it cannot pump out water that is not there.
    const netM3 = (params.inflowM3S - params.drainageM3S) * ctx.dt;
    const waterVolumeM3 = Math.max(0, params.waterVolumeM3 + netM3);

    if (waterVolumeM3 !== cachedVolume) {
      cached = waterLevelForVolume(terrain, waterVolumeM3);
      cachedVolume = waterVolumeM3;
    }
    const inundation = cached;
    const stateCode = floodStateCode(inundation.maxDepthM);
    stepCounter += 1;

    const observation: Observation = {
      observationId: `flood-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: V=${waterVolumeM3.toFixed(1)}m³, max depth=${inundation.maxDepthM.toFixed(3)}m over ${inundation.floodedAreaM2.toFixed(0)}m² (${floodStateLabel(stateCode)})`,
      measurements: [
        { key: 'waterVolumeM3', value: waterVolumeM3, tick: ctx.tick, entity: entity.ref, provenance: ['domains/floodInundation.ts#volume-balance'] },
        { key: 'maxDepthM', value: inundation.maxDepthM, tick: ctx.tick, entity: entity.ref, provenance: ['domains/floodInundation.ts#waterLevelForVolume', `terrain:${terrain.provenance}`] },
        { key: 'floodedAreaM2', value: inundation.floodedAreaM2, tick: ctx.tick, entity: entity.ref, provenance: ['domains/floodInundation.ts#waterLevelForVolume'] },
      ],
      provenance: ['domains/floodInundation.ts', 'connectivity-constrained-planar-fill', terrain.surveyed ? 'terrain:surveyed' : 'terrain:synthetic'],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `flood-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'flood.inundation.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'volume-balance-and-planar-fill',
      parameters: { ...params, waterVolumeM3, maxDepthM: inundation.maxDepthM, floodedAreaM2: inundation.floodedAreaM2, stateCode },
      provenance: {
        origin: 'model',
        modelId: FLOOD_INUNDATION_SOLVER_ID,
        notes: 'dV/dt = Qin - Qout, then a volume-conserving connectivity-constrained planar fill. No hydrograph, no routing, no flow velocity, no infiltration.',
      },
    };

    return {
      patch: {
        domainState: {
          ...params,
          waterVolumeM3,
          waterLevelM: inundation.waterLevelM,
          maxDepthM: inundation.maxDepthM,
          meanDepthM: inundation.meanDepthM,
          floodedAreaM2: inundation.floodedAreaM2,
          floodedCells: inundation.floodedCells,
          unrepresentedVolumeM3: inundation.unrepresentedVolumeM3,
          stateCode,
        },
        statusLabel: floodStateLabel(stateCode),
      },
      grounding: groundingFor(params.terrainSurveyed),
      observation,
      event,
    };
  };
}

export interface AddFloodplainOptions {
  floodplainId?: string;
  label?: string;
  parentEntityId?: EntityId;
  terrain: TerrainHeightfield;
  params?: Partial<FloodplainParams>;
}

export function addFloodplain(graph: WorldGraph, options: AddFloodplainOptions): EntityId {
  const ref = { kind: 'floodplain', id: options.floodplainId ?? 'floodplain-1' };
  const terrain = options.terrain;
  const params: FloodplainParams = {
    ...FLOODPLAIN_DEFAULTS,
    ...options.params,
    // Never a caller's claim: it is whatever the terrain itself says it is.
    terrainSurveyed: terrain.surveyed ? 1 : 0,
  };
  const inundation = waterLevelForVolume(terrain, params.waterVolumeM3);
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Floodplain',
    scale: { level: 'MACRO_CITY', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: {
      ...params,
      waterLevelM: inundation.waterLevelM,
      maxDepthM: inundation.maxDepthM,
      meanDepthM: inundation.meanDepthM,
      floodedAreaM2: inundation.floodedAreaM2,
      floodedCells: inundation.floodedCells,
      unrepresentedVolumeM3: inundation.unrepresentedVolumeM3,
      stateCode: floodStateCode(inundation.maxDepthM),
      // Rule 2: the grid's own geometry travels with the result, so a consumer can tell a
      // 2 m grid's "flooded area" from a 20 m grid's without guessing.
      terrainCellSizeM: terrain.cellSizeM,
      terrainCols: terrain.cols,
      terrainRows: terrain.rows,
    },
    domainBinding: { solverId: FLOOD_INUNDATION_SOLVER_ID, domainId: FLOOD_DOMAIN_ID },
    statusLabel: floodStateLabel(floodStateCode(inundation.maxDepthM)),
    grounding: groundingFor(params.terrainSurveyed),
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

/**
 * Pump trip -> drainage lost. The one coupling that makes inundation a
 * consequence rather than a display: with the pump gone, `drainageM3S` goes to
 * zero, the volume balance stops being cancelled out, and depth grows because
 * of arithmetic that was already running.
 */
export function buildDrainageLossCoupling(pumpTrippedEventType: string): CrossDomainCoupling {
  return defineCrossDomainCoupling({
    id: 'pump-trip-to-drainage-loss',
    sourceDomain: 'hydraulics',
    targetDomain: FLOOD_DOMAIN_ID,
    triggerEventType: pumpTrippedEventType,
    relationshipKind: 'drains',
    direction: 'from',
    condition: 'The pump-pipe system that drains this floodplain tripped',
    effect: 'Drainage removal falls to zero; the floodplain keeps receiving runoff, so standing volume and depth grow',
    // A real consequence of a real trip, but the depth it produces is only as
    // grounded as the terrain underneath it — see the module doc.
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (floodplain) => {
      const current: FloodplainParams = { ...FLOODPLAIN_DEFAULTS, ...(floodplain.domainState as Partial<FloodplainParams> | undefined) };
      if (current.drainageM3S === 0) return undefined; // already lost — do not re-fire
      return {
        patch: { domainState: { ...floodplain.domainState, drainageM3S: 0 } },
        eventType: FLOOD_DRAINAGE_LOST_EVENT_TYPE,
        cause: 'upstream-pump-trip',
      };
    },
  });
}
