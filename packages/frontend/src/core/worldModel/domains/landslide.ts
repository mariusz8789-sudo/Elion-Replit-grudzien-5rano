import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { cellAreaM2, type TerrainHeightfield } from './floodInundation';
import { entityId, type EntityId, type GroundingLevel, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * LANDSLIDE — slope stability and runout on the SAME `TerrainHeightfield`
 * `floodInundation.ts` and `wildfireSpread.ts` already established. A fourth
 * real domain on that one terrain, not a fourth terrain model.
 *
 * Closes the gap `capability/solverCapability.ts` named for LANDSLIDE:
 * "slope stability and runout".
 *
 * ## What is real here
 *
 * **1. Infinite-slope stability analysis** (the standard method in every
 * geotechnical engineering reference — Skempton & DeLory 1957; reproduced in
 * Craig's *Soil Mechanics*, Das's *Principles of Geotechnical Engineering*):
 * for a slope of angle β with a shallow planar failure surface at depth z,
 * factor of safety
 *
 *   FS = [c' + (γ·z − m·γw·z)·cos²β·tanφ'] / (γ·z·sinβ·cosβ)
 *
 * where c' is effective cohesion, φ' effective friction angle, γ soil unit
 * weight, γw water unit weight, and m the fraction of the soil column that
 * is saturated (m=0 dry ... m=1 fully saturated, real pore-pressure
 * reduction of the effective normal stress — the standard extension of the
 * dry formula found in the same references). β itself is computed from the
 * REAL terrain: the steepest downhill gradient to any of a cell's 8
 * neighbours (the same D8 convention geomorphology/hydrology tools use for
 * flow direction).
 *
 * **2. Runout — a physically-derived sliding-block energy balance, not an
 * empirical curve-fit.** A rigid block on an incline, gravity accelerating
 * it and Coulomb friction decelerating it, gives (Newton's second law,
 * work-energy theorem) an EXACT discretised update per step of horizontal
 * distance Δx and elevation drop Δz:
 *
 *   Δ(v²) = 2g·(Δz − μ·Δx),   μ = tan(runout friction angle)
 *
 * (the cosθ/sinθ terms cancel exactly against the incline geometry — see
 * `slidingBlockVelocitySquaredDelta`'s doc for the two-line derivation).
 * This is the same physics behind the classic "angle of reach"/Fahrböschung
 * runout method (Heim 1932): on a UNIFORM slope this reduces exactly to "the
 * block travels until the average slope angle falls to the friction angle,"
 * which is Fahrböschung's defining rule — this module's version is the
 * general, terrain-following case of that same idea, not a different one.
 * Every cell with FS<1 is traced downhill (D8 steepest descent); where the
 * ground flattens out — the depositional zone, which is exactly where the
 * runout question matters most — the mass carries its momentum onward in
 * its current direction of travel, decelerating under friction, and stops
 * where its kinetic energy is exhausted (v²≤0) or it leaves the modelled
 * area. It can run a short way up an adverse counter-slope, which the same
 * formula handles with no special case (Δz<0 just decelerates it faster).
 *
 * ## A disclosed judgment call: why this does NOT reuse `wildfireSpread.ts`'s
 * Dijkstra/minimum-travel-time propagation
 *
 * It was considered. `wildfireSpread.ts`'s Dijkstra relies on every edge
 * cost being non-negative (a real correctness requirement of Dijkstra's
 * algorithm) — true for fire travel TIME. Runout's per-edge energy change
 * `Δz − μ·Δx` can be NEGATIVE (a shallow segment where friction exceeds the
 * gravity component), which would silently break Dijkstra's guarantee if
 * reused here. So this uses per-source deterministic steepest-descent path
 * tracing instead (each unstable cell simulated independently) — a
 * different, standard method (D8 flow routing, O'Callaghan & Mark 1984),
 * genuinely appropriate to this physics rather than reused for its own sake.
 *
 * ## What is deliberately NOT modelled
 *
 * - **Geotechnical parameters are stated inputs, not measured.** Cohesion,
 *   friction angle, unit weight, failure-plane depth and saturation are
 *   literature-typical values — like `wildfireSpread.ts`'s fuel moisture or
 *   `fireThermal.ts`'s peak HRR, not a site investigation or borehole log.
 * - **No debris-flow rheology and no mass deformation.** The runout mass is
 *   a rigid POINT under Coulomb friction: it does not deform, spread, split,
 *   or change shape, and there is no Voellmy (velocity-squared turbulent
 *   drag) or Bingham (viscoplastic yield-stress) rheology — the two standard
 *   families of real debris-flow models. There is no erosion or entrainment
 *   of material along the path, no bulking, no deposition profile, and no
 *   debris-fan width. What this traces is a runout CENTRELINE with a
 *   velocity along it, never a flow extent or an impact-pressure field, and
 *   it must not be read as one.
 * - **Static-only triggering.** FS is evaluated once from stated conditions;
 *   there is no time-dependent trigger (rainfall infiltration raising pore
 *   pressure over time, seismic loading) — `drought.ts`'s real soil moisture
 *   or a future seismic coupling could plausibly feed the saturation ratio
 *   `m` one day; that coupling is not implemented here.
 * - **Peak vs. residual friction is a real, disclosed distinction.** The
 *   slope-stability friction angle (holds the slope together) and the
 *   runout friction angle (resists the already-failed mass sliding) are
 *   separate stated parameters — real soils have a lower residual than peak
 *   friction angle once shearing starts, but neither is measured here.
 * - **D8 steepest descent**, not a more robust plane-fit (Horn 1981) slope
 *   estimate — the same simplification `wildfireSpread.ts` and standard D8
 *   flow-routing tools make.
 * - **The terrain may be synthetic** — the same `TerrainHeightfield.surveyed`
 *   honesty rule as `floodInundation.ts`/`wildfireSpread.ts`:
 *   `PROCEDURAL_APPROXIMATION` on the synthetic reference terrain,
 *   `MODEL_ESTIMATE` only with real survey elevations.
 */
export const LANDSLIDE_SOLVER_ID = 'landslide-infinite-slope-sliding-block';
export const LANDSLIDE_DOMAIN_ID = 'landslide';

const GRAVITY_M_S2 = 9.81;
const WATER_UNIT_WEIGHT_KN_M3 = 9.81; // rho_water * g / 1000, rho_water = 1000 kg/m^3

// ---------------------------------------------------------------------------
// 1. INFINITE-SLOPE STABILITY.
// ---------------------------------------------------------------------------

export interface SoilParams {
  /** Effective cohesion, kPa. */
  readonly cohesionKPa: number;
  /** Effective friction angle at failure, degrees. */
  readonly frictionAngleDegrees: number;
  /** Total soil unit weight, kN/m³. */
  readonly unitWeightKNm3: number;
  /** Depth to the potential shallow failure plane, m. */
  readonly failurePlaneDepthM: number;
  /** Fraction of the soil column that is saturated, 0 (dry) to 1 (fully saturated) — pore pressure reduces effective normal stress. */
  readonly groundwaterRatio: number;
  /** Residual friction angle used for the ALREADY-FAILED mass sliding downhill, degrees — real soils mobilise a lower residual than peak/failure friction angle once shearing starts. */
  readonly runoutFrictionAngleDegrees: number;
}

/**
 * Literature-typical values for a shallow colluvial soil (Craig's *Soil
 * Mechanics*; Das's *Principles of Geotechnical Engineering*) — a plausible
 * baseline, exactly like `rainfallRunoff.ts`'s `RAINFALL_CATCHMENT_DEFAULTS`,
 * not a survey of any real slope.
 */
export const DEFAULT_SOIL_PARAMS: SoilParams = {
  cohesionKPa: 5,
  frictionAngleDegrees: 30,
  unitWeightKNm3: 19,
  failurePlaneDepthM: 1.5,
  groundwaterRatio: 0,
  runoutFrictionAngleDegrees: 20,
};

/** A safety cap on FS for near-flat ground (denominator near zero) — a numerical guard, not a physical claim; flat ground is simply "very stable". */
const FS_SAFETY_CAP = 100;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * The infinite-slope factor of safety at slope angle `slopeAngleRad` for the
 * given soil — dry when `groundwaterRatio` is 0, the standard pore-pressure-
 * reduced form otherwise. FS>1 means the slope resists sliding; FS<1 means
 * the driving shear stress exceeds the resisting strength.
 */
export function infiniteSlopeFactorOfSafety(slopeAngleRad: number, soil: SoilParams): number {
  if (slopeAngleRad <= 0) return FS_SAFETY_CAP;
  const phi = degToRad(soil.frictionAngleDegrees);
  const z = soil.failurePlaneDepthM;
  const gamma = soil.unitWeightKNm3;
  const m = Math.max(0, Math.min(1, soil.groundwaterRatio));

  const normalStressKPa = gamma * z * Math.cos(slopeAngleRad) ** 2;
  const porePressureReliefKPa = m * WATER_UNIT_WEIGHT_KN_M3 * z * Math.cos(slopeAngleRad) ** 2;
  const resistingKPa = soil.cohesionKPa + (normalStressKPa - porePressureReliefKPa) * Math.tan(phi);
  const drivingKPa = gamma * z * Math.sin(slopeAngleRad) * Math.cos(slopeAngleRad);

  if (drivingKPa <= 0) return FS_SAFETY_CAP;
  return Math.min(FS_SAFETY_CAP, resistingKPa / drivingKPa);
}

/** Rule 3: the discrete state is a NUMBER. FS=1.5/1.0 are commonly used geotechnical design/reference thresholds (they vary by code and jurisdiction) — conventional bands, not a physical law, same disclosure style as `floodInundation.ts`'s depth bands. */
export const LANDSLIDE_STABILITY_CODE = { STABLE: 0, MARGINAL: 1, UNSTABLE: 2 } as const;
export const LANDSLIDE_STABILITY_STATES = ['LANDSLIDE_STABLE', 'LANDSLIDE_MARGINAL', 'LANDSLIDE_UNSTABLE'] as const;
export type LandslideStabilityState = (typeof LANDSLIDE_STABILITY_STATES)[number];

const MARGINAL_FS_THRESHOLD = 1.5;
const UNSTABLE_FS_THRESHOLD = 1.0;

export function landslideStabilityCode(factorOfSafety: number): number {
  if (!Number.isFinite(factorOfSafety) || factorOfSafety >= MARGINAL_FS_THRESHOLD) return LANDSLIDE_STABILITY_CODE.STABLE;
  if (factorOfSafety >= UNSTABLE_FS_THRESHOLD) return LANDSLIDE_STABILITY_CODE.MARGINAL;
  return LANDSLIDE_STABILITY_CODE.UNSTABLE;
}

export function landslideStabilityLabel(code: number): LandslideStabilityState {
  switch (code) {
    case LANDSLIDE_STABILITY_CODE.MARGINAL: return 'LANDSLIDE_MARGINAL';
    case LANDSLIDE_STABILITY_CODE.UNSTABLE: return 'LANDSLIDE_UNSTABLE';
    default: return 'LANDSLIDE_STABLE';
  }
}

// 8-connectivity: the same D8 neighbourhood convention used for flow direction in geomorphology/hydrology tools.
const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** D8 steepest-descent slope: the largest downhill gradient (rise/run, as an angle) to any of a cell's 8 neighbours. 0 at a local pit or the grid boundary — no downhill direction exists. */
export function steepestDescentSlopeRad(terrain: TerrainHeightfield, index: number): number {
  const { cols, rows, elevationsM, cellSizeM } = terrain;
  const x = index % cols;
  const y = (index - x) / cols;
  const elevA = elevationsM[index];
  let maxSlope = 0;
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
    const neighborIndex = ny * cols + nx;
    const distanceM = Math.hypot(dx, dy) * cellSizeM;
    const drop = elevA - elevationsM[neighborIndex];
    if (drop <= 0) continue;
    const slope = Math.atan(drop / distanceM);
    if (slope > maxSlope) maxSlope = slope;
  }
  return maxSlope;
}

/** The steepest-descent NEIGHBOUR index, or -1 at a local pit/grid boundary. */
function steepestDescentNeighbor(terrain: TerrainHeightfield, index: number): number {
  const { cols, rows, elevationsM, cellSizeM } = terrain;
  const x = index % cols;
  const y = (index - x) / cols;
  const elevA = elevationsM[index];
  let best = -1;
  let bestSlope = 0;
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
    const neighborIndex = ny * cols + nx;
    const distanceM = Math.hypot(dx, dy) * cellSizeM;
    const drop = elevA - elevationsM[neighborIndex];
    if (drop <= 0) continue;
    const slope = drop / distanceM;
    if (slope > bestSlope) {
      bestSlope = slope;
      best = neighborIndex;
    }
  }
  return best;
}

export interface SlopeStabilityField {
  readonly factorOfSafety: Float64Array;
  readonly stabilityCode: Uint8Array;
  readonly unstableCellIndices: readonly number[];
}

/** Factor of safety and stability code for every cell, from the REAL terrain's own D8 steepest-descent slope. */
export function buildSlopeStabilityField(terrain: TerrainHeightfield, soil: SoilParams): SlopeStabilityField {
  const n = terrain.cols * terrain.rows;
  const factorOfSafety = new Float64Array(n);
  const stabilityCode = new Uint8Array(n);
  const unstableCellIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const slopeRad = steepestDescentSlopeRad(terrain, i);
    const fs = infiniteSlopeFactorOfSafety(slopeRad, soil);
    factorOfSafety[i] = fs;
    const code = landslideStabilityCode(fs);
    stabilityCode[i] = code;
    if (code === LANDSLIDE_STABILITY_CODE.UNSTABLE) unstableCellIndices.push(i);
  }
  return { factorOfSafety, stabilityCode, unstableCellIndices };
}

// ---------------------------------------------------------------------------
// 2. RUNOUT — sliding-block energy balance, traced by D8 steepest descent.
// ---------------------------------------------------------------------------

/**
 * The exact per-step kinetic-energy-per-unit-mass change for a rigid block
 * sliding a horizontal distance `planarDistanceM` while dropping `dropM` in
 * elevation, resisted by Coulomb friction with coefficient `frictionCoeff`
 * (=tan of the runout friction angle).
 *
 * Derivation (two lines): gravity does work g·dropM regardless of path shape
 * (exact — work done by a uniform field depends only on the height change).
 * Friction does work μ·g·cosθ·ds, where ds is the incline distance and
 * cosθ = planarDistanceM/ds BY DEFINITION of the incline angle θ — so
 * μ·g·cosθ·ds = μ·g·planarDistanceM exactly, independent of ds. The two ds
 * dependences cancel, leaving a formula in only the quantities the terrain
 * grid actually gives directly: horizontal distance and elevation drop.
 */
export function slidingBlockVelocitySquaredDelta(dropM: number, planarDistanceM: number, frictionCoeff: number): number {
  return 2 * GRAVITY_M_S2 * (dropM - frictionCoeff * planarDistanceM);
}

export interface RunoutStep {
  readonly cellIndex: number;
  readonly distanceFromSourceM: number;
  readonly velocityMS: number;
}

/**
 * Why a runout path ended — the difference matters and must never be hidden:
 * a 200 m path that STOPPED is a real runout distance, while a 200 m path
 * that LEFT_MODELLED_AREA still moving is a lower bound truncated by the
 * grid, and a consumer that cannot tell them apart will under-report the
 * hazard. Same disclosure principle as `floodInundation.ts`'s
 * `unrepresentedVolumeM3`.
 */
export type RunoutTermination = 'STOPPED' | 'LEFT_MODELLED_AREA' | 'BLOCKED';

export interface RunoutPath {
  readonly steps: readonly RunoutStep[];
  readonly termination: RunoutTermination;
}

/**
 * Traces one landslide's runout path from `sourceIndex`.
 *
 * The mass follows D8 steepest descent while a downhill neighbour exists.
 * When it reaches flat ground or a pit — which is exactly where a real
 * runout's DEPOSITIONAL zone is, and where the hazard question actually
 * lives — it does NOT stop dead: a mass with kinetic energy carries its
 * momentum in its current direction of travel, decelerating under friction
 * (`Δ(v²) = 2g(0 − μ·Δx) < 0`), and may even run a short way up an adverse
 * counter-slope (`Δz < 0` simply decelerates it faster). It stops where its
 * energy is exhausted. That is precisely the energy-line/Fahrböschung
 * behaviour this model is built on: the line continues past the slope break
 * until it intersects the ground.
 *
 * Termination is guaranteed three ways: kinetic energy strictly decreases
 * on every non-descending step, no cell is ever revisited (an explicit
 * visited set — descent steps strictly lower the elevation, and momentum
 * steps travel in a straight line), and the step count is bounded by the
 * cell count.
 */
export function traceRunoutPath(terrain: TerrainHeightfield, soil: SoilParams, sourceIndex: number): RunoutPath {
  const frictionCoeff = Math.tan(degToRad(soil.runoutFrictionAngleDegrees));
  const steps: RunoutStep[] = [{ cellIndex: sourceIndex, distanceFromSourceM: 0, velocityMS: 0 }];
  const maxSteps = terrain.cols * terrain.rows;
  const { cols, rows } = terrain;
  const visited = new Set<number>([sourceIndex]);

  let currentIndex = sourceIndex;
  let velocitySquared = 0;
  let distanceFromSourceM = 0;
  let directionX = 0;
  let directionY = 0;
  let termination: RunoutTermination = 'STOPPED';

  for (let step = 0; step < maxSteps; step++) {
    const ax = currentIndex % cols;
    const ay = (currentIndex - ax) / cols;

    let nextIndex = steepestDescentNeighbor(terrain, currentIndex);
    if (nextIndex < 0) {
      // No downhill neighbour. A mass still carrying kinetic energy keeps going in its current
      // direction of travel across the flat/adverse ground; a mass at rest simply stops here.
      if (velocitySquared <= 0 || (directionX === 0 && directionY === 0)) {
        termination = 'STOPPED';
        break;
      }
      const nx = ax + directionX;
      const ny = ay + directionY;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
        termination = 'LEFT_MODELLED_AREA'; // still moving: this path's length is a LOWER BOUND
        break;
      }
      nextIndex = ny * cols + nx;
    }
    if (visited.has(nextIndex)) {
      termination = velocitySquared > 0 ? 'BLOCKED' : 'STOPPED';
      break;
    }

    const bx = nextIndex % cols;
    const by = (nextIndex - bx) / cols;
    directionX = bx - ax;
    directionY = by - ay;
    const planarDistanceM = Math.hypot(directionX, directionY) * terrain.cellSizeM;
    const dropM = terrain.elevationsM[currentIndex] - terrain.elevationsM[nextIndex];

    velocitySquared = Math.max(0, velocitySquared + slidingBlockVelocitySquaredDelta(dropM, planarDistanceM, frictionCoeff));
    distanceFromSourceM += planarDistanceM;
    currentIndex = nextIndex;
    visited.add(currentIndex);
    steps.push({ cellIndex: currentIndex, distanceFromSourceM, velocityMS: Math.sqrt(velocitySquared) });

    if (velocitySquared <= 0) {
      termination = 'STOPPED'; // the mass has come to rest inside the modelled area
      break;
    }
  }
  return { steps, termination };
}

export interface RunoutField {
  /** For every cell: the fastest velocity any traced runout path passed through it at, m/s. 0 for a cell no path reached. */
  readonly maxVelocityMS: Float64Array;
  readonly pathsTraced: number;
  readonly longestRunoutDistanceM: number;
  readonly maxVelocityAnywhereMS: number;
  /**
   * How many paths left the modelled area still moving. Any path counted
   * here makes `longestRunoutDistanceM` a LOWER BOUND rather than an answer:
   * the terrain grid ran out before the physics did. Reported rather than
   * silently truncated.
   */
  readonly pathsLeavingModelledArea: number;
}

/** Traces a runout path from EVERY unstable cell and aggregates the result — the maximum velocity any path reached at each cell, over all sources. */
export function simulateLandslideRunout(terrain: TerrainHeightfield, soil: SoilParams, stability: SlopeStabilityField): RunoutField {
  const n = terrain.cols * terrain.rows;
  const maxVelocityMS = new Float64Array(n);
  let longestRunoutDistanceM = 0;
  let maxVelocityAnywhereMS = 0;
  let pathsLeavingModelledArea = 0;

  for (const sourceIndex of stability.unstableCellIndices) {
    const path = traceRunoutPath(terrain, soil, sourceIndex);
    const last = path.steps[path.steps.length - 1];
    if (last.distanceFromSourceM > longestRunoutDistanceM) longestRunoutDistanceM = last.distanceFromSourceM;
    if (path.termination === 'LEFT_MODELLED_AREA') pathsLeavingModelledArea += 1;
    for (const step of path.steps) {
      if (step.velocityMS > maxVelocityMS[step.cellIndex]) maxVelocityMS[step.cellIndex] = step.velocityMS;
      if (step.velocityMS > maxVelocityAnywhereMS) maxVelocityAnywhereMS = step.velocityMS;
    }
  }

  return { maxVelocityMS, pathsTraced: stability.unstableCellIndices.length, longestRunoutDistanceM, maxVelocityAnywhereMS, pathsLeavingModelledArea };
}

/** Runout-affected area, m² — cells any traced path actually reached (velocity recorded, including the stopped/zero-velocity endpoint cell itself, since the mass did arrive there). */
export function runoutAreaM2(runout: RunoutField, terrain: TerrainHeightfield, stability: SlopeStabilityField): number {
  const reached = new Uint8Array(runout.maxVelocityMS.length);
  for (const sourceIndex of stability.unstableCellIndices) reached[sourceIndex] = 1;
  let count = 0;
  for (let i = 0; i < runout.maxVelocityMS.length; i++) {
    if (reached[i] || runout.maxVelocityMS[i] > 0) count++;
  }
  return count * cellAreaM2(terrain);
}

// ---------------------------------------------------------------------------
// ECS BINDING
// ---------------------------------------------------------------------------

export interface LandslideDomainState extends Record<string, number> {
  unstableCellCount: number;
  totalCells: number;
  maxVelocityAnywhereMS: number;
  longestRunoutDistanceM: number;
  runoutAreaM2: number;
  /** Paths that left the grid still moving — while this is >0, `longestRunoutDistanceM` is a lower bound, not an answer. */
  pathsLeavingModelledArea: number;
  minFactorOfSafety: number;
  stabilityCode: number;
  terrainSurveyed: number;
}

/** The honesty rule, matching `floodInundation.ts::groundingFor` / `wildfireSpread.ts::groundingForWildfire`: a correct algorithm over invented ground demonstrates the method, it does not describe a place. */
export function groundingForLandslide(terrainSurveyed: number): GroundingLevel {
  return terrainSurveyed === 1 ? 'MODEL_ESTIMATE' : 'PROCEDURAL_APPROXIMATION';
}


/**
 * One solver bound to one precomputed slope-stability + runout result — like
 * `wildfireSpread.ts`, this is a one-shot computation (soil parameters and
 * terrain are fixed for the scenario's lifetime), and each tick reports the
 * same real, already-computed hazard field rather than re-deriving it.
 * There is no time dimension in a static factor-of-safety analysis to
 * "advance" — this differs from `wildfireSpread.ts`'s arrival-time level-set
 * query, which genuinely does have one (fire takes time to travel; here the
 * runout path's own physics has already resolved its full extent).
 */
export function makeLandslideSolver(terrain: TerrainHeightfield, soil: SoilParams): DomainSolver {
  const stability = buildSlopeStabilityField(terrain, soil);
  const runout = simulateLandslideRunout(terrain, soil, stability);
  const totalCells = terrain.cols * terrain.rows;
  const terrainSurveyed = terrain.surveyed ? 1 : 0;
  let minFactorOfSafety = Number.POSITIVE_INFINITY;
  for (let i = 0; i < stability.factorOfSafety.length; i++) if (stability.factorOfSafety[i] < minFactorOfSafety) minFactorOfSafety = stability.factorOfSafety[i];
  const worstStabilityCode = stability.unstableCellIndices.length > 0 ? LANDSLIDE_STABILITY_CODE.UNSTABLE : landslideStabilityCode(minFactorOfSafety);
  const area = runoutAreaM2(runout, terrain, stability);

  return (entity, ctx): SolverResult => {

    const domainState: LandslideDomainState = {
      unstableCellCount: stability.unstableCellIndices.length,
      totalCells,
      maxVelocityAnywhereMS: runout.maxVelocityAnywhereMS,
      longestRunoutDistanceM: runout.longestRunoutDistanceM,
      runoutAreaM2: area,
      pathsLeavingModelledArea: runout.pathsLeavingModelledArea,
      minFactorOfSafety,
      stabilityCode: worstStabilityCode,
      terrainSurveyed,
    };

    const observation: Observation = {
      observationId: `landslide-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: ${stability.unstableCellIndices.length}/${totalCells} cells unstable (min FS=${minFactorOfSafety.toFixed(2)}), runout reaches ${runout.longestRunoutDistanceM.toFixed(0)}m${runout.pathsLeavingModelledArea > 0 ? '+ (truncated by the grid)' : ''} at up to ${runout.maxVelocityAnywhereMS.toFixed(1)}m/s over ${area.toFixed(0)}m² (${landslideStabilityLabel(worstStabilityCode)})`,
      measurements: [
        { key: 'minFactorOfSafety', value: minFactorOfSafety, tick: ctx.tick, entity: entity.ref, provenance: ['domains/landslide.ts#infiniteSlopeFactorOfSafety', 'skempton-delory-1957-infinite-slope'] },
        { key: 'unstableCellCount', value: stability.unstableCellIndices.length, tick: ctx.tick, entity: entity.ref, provenance: ['domains/landslide.ts#buildSlopeStabilityField'] },
        { key: 'maxVelocityAnywhereMS', value: runout.maxVelocityAnywhereMS, unit: 'm/s', tick: ctx.tick, entity: entity.ref, provenance: ['domains/landslide.ts#slidingBlockVelocitySquaredDelta', 'sliding-block-energy-balance'] },
        { key: 'runoutAreaM2', value: area, unit: 'm2', tick: ctx.tick, entity: entity.ref, provenance: ['domains/landslide.ts#simulateLandslideRunout'] },
      ],
      provenance: ['domains/landslide.ts', 'skempton-delory-1957-infinite-slope', 'sliding-block-energy-balance', 'd8-steepest-descent', terrain.surveyed ? 'terrain:surveyed' : 'terrain:synthetic'],
    };

    const eventParameters = { ...domainState };
    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('landslide-evt', entity.id, ctx.tick, eventParameters),
      type: 'landslide.stability.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'infinite-slope-stability-and-sliding-block-runout',
      parameters: eventParameters,
      provenance: {
        origin: 'model',
        modelId: LANDSLIDE_SOLVER_ID,
        notes: 'Infinite-slope factor of safety (Skempton & DeLory 1957) from real D8 terrain slope, plus a sliding-block Coulomb-friction energy balance traced by D8 steepest descent from every unstable cell. No debris-flow rheology, no entrainment, no time-dependent triggering.',
      },
    };

    return {
      patch: { domainState, statusLabel: landslideStabilityLabel(worstStabilityCode) },
      grounding: groundingForLandslide(terrainSurveyed),
      observation,
      event,
    };
  };
}

export interface AddLandslideOptions {
  landslideId?: string;
  label?: string;
  parentEntityId?: EntityId;
}

export function addLandslide(graph: WorldGraph, terrain: TerrainHeightfield, soil: SoilParams, options: AddLandslideOptions = {}): EntityId {
  const ref = { kind: 'landslide', id: options.landslideId ?? 'landslide-1' };
  const stability = buildSlopeStabilityField(terrain, soil);
  const runout = simulateLandslideRunout(terrain, soil, stability);
  const terrainSurveyed = terrain.surveyed ? 1 : 0;
  let minFactorOfSafety = Number.POSITIVE_INFINITY;
  for (let i = 0; i < stability.factorOfSafety.length; i++) if (stability.factorOfSafety[i] < minFactorOfSafety) minFactorOfSafety = stability.factorOfSafety[i];
  const worstStabilityCode = stability.unstableCellIndices.length > 0 ? LANDSLIDE_STABILITY_CODE.UNSTABLE : landslideStabilityCode(minFactorOfSafety);
  const domainState: LandslideDomainState = {
    unstableCellCount: stability.unstableCellIndices.length,
    totalCells: terrain.cols * terrain.rows,
    maxVelocityAnywhereMS: runout.maxVelocityAnywhereMS,
    longestRunoutDistanceM: runout.longestRunoutDistanceM,
    runoutAreaM2: runoutAreaM2(runout, terrain, stability),
    pathsLeavingModelledArea: runout.pathsLeavingModelledArea,
    minFactorOfSafety,
    stabilityCode: worstStabilityCode,
    terrainSurveyed,
  };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Landslide Hazard',
    scale: { level: 'MACRO_CITY', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState,
    domainBinding: { solverId: LANDSLIDE_SOLVER_ID, domainId: LANDSLIDE_DOMAIN_ID },
    statusLabel: landslideStabilityLabel(worstStabilityCode),
    grounding: groundingForLandslide(terrainSurveyed),
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export interface LandslideWorldOptions {
  terrain: TerrainHeightfield;
  soil?: SoilParams;
  siteId?: string;
}

export interface LandslideWorld {
  graph: WorldGraph;
  siteId: EntityId;
  landslideId: EntityId;
}

/** Standalone scenario: a site container (MACRO_CITY) with one landslide-hazard entity bound to the real infinite-slope/sliding-block solver. */
export function buildLandslideWorld(options: LandslideWorldOptions): LandslideWorld {
  const graph = new WorldGraph();
  const siteRef = { kind: 'landslide-site', id: options.siteId ?? 'landslide-site-1' };
  const site: WorldModelEntity = {
    id: entityId(siteRef),
    ref: siteRef,
    label: 'Landslide Site',
    scale: { level: 'MACRO_CITY' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    grounding: 'UNGROUNDED_APPROXIMATION', // a container, not something any solver advances directly
    updatedAtTick: 0,
  };
  graph.addEntity(site);
  const landslideId = addLandslide(graph, options.terrain, options.soil ?? DEFAULT_SOIL_PARAMS, { parentEntityId: site.id });
  return { graph, siteId: site.id, landslideId };
}
