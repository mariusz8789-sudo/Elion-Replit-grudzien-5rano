import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { cellAreaM2, type TerrainHeightfield } from './floodInundation';
import { defineCrossDomainCoupling, type CrossDomainCoupling } from '../crossDomain/crossDomainCoupling';
import { entityId, type EntityId, type GroundingLevel, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * WILDFIRE SPREAD — a real Rothermel (1972) surface-fire-spread solver over a
 * fuel bed built on the SAME `TerrainHeightfield` `floodInundation.ts` and
 * `fireThermal.ts` already established — no second terrain model.
 *
 * Closes the gap `capability/solverCapability.ts` named for WILDFIRE: spread
 * across a fuel bed, which `fireThermal.ts`'s single, non-spreading source
 * explicitly does not do.
 *
 * ## What is real here
 *
 * **1. The Rothermel (1972) surface fire spread model** — the field-standard
 * equation set behind essentially every US wildfire behaviour tool
 * (BehavePlus, FARSITE, FlamMap): reaction intensity, packing ratio, the
 * moisture- and mineral-damping coefficients, and the wind/slope spread-rate
 * multipliers, computed in the ORIGINAL published unit system (ft, lb, min,
 * BTU — the empirical constants are calibrated in those units; converting
 * them to "equivalent" SI constants is a well-known source of subtle errors,
 * so this module does the physics in US customary units and converts only
 * the final results). A curated subset of Anderson's (1982) 13 standard fuel
 * models supplies real, published fuel parameters (load, surface-area-to-
 * volume ratio, depth, moisture of extinction) — GTR-INT-122, reproduced in
 * every fire-behaviour reference.
 *
 * **2. Real per-edge terrain slope**, from the SAME `TerrainHeightfield` real
 * elevations — not a stated scalar slope, an actual computed rise/run
 * between each pair of adjacent cells the fire could spread across.
 *
 * **3. The elliptical fire-shape model** (Anderson 1983; Alexander 1985,
 * following the Canadian Forest Fire Behavior Prediction System): given a
 * wind-driven head-fire rate of spread and a length-to-breadth ratio (itself
 * a real, published function of wind speed), the spread rate in ANY
 * direction from the ignition point follows the focus-referenced polar
 * equation of an ellipse — not a guess, the exact geometric consequence of
 * the assumed head/back rates.
 *
 * **4. Minimum-travel-time grid propagation** (Finney 2002, "Fire growth
 * using minimum travel time methods," Canadian Journal of Forest Research):
 * a real Dijkstra shortest-path computation over the fuel-bed grid, where
 * each edge's "cost" is the real travel time (distance / directional spread
 * rate) between adjacent cells. This is the actual algorithm several
 * operational raster fire-growth models use, not an invented heuristic.
 *
 * **5. Byram (1959) fireline intensity and flame length** — I = h·w·R, and
 * the widely-cited flame-length correlation L = 0.45·I^0.46 (I in
 * BTU/ft/s, L in ft) — computed from the same reaction intensity/fuel-
 * consumption numbers the spread-rate calculation already produces.
 *
 * ## What is deliberately NOT modelled
 *
 * - **A curated subset of four fuel models**, not the full Anderson 13 —
 *   short grass, timber grass/understory, tall grass, and chaparral. Each is
 *   simplified to ONE dead-fuel size class; Rothermel's real multi-size-class
 *   and live/dead fuel weighting is not implemented.
 * - **No crown fire.** No canopy bulk density, no crown fire initiation
 *   (Van Wagner 1977) or crown fire spread — this is a surface fire model.
 * - **No spotting.** Ember lofting and long-distance spot ignition ahead of
 *   the main fire — a major real driver of wildfire growth rate — is absent.
 * - **No fire-weather coupling.** Wind is ONE stated vector (speed +
 *   direction), fixed for the fire's lifetime; no diurnal cycle, no
 *   fire-induced winds, no time-varying conditions.
 * - **Fuel moisture is a stated input, and stays one — deliberately.**
 *   `buildDroughtToWildfireCoupling` (below) now wires `drought.ts`'s real
 *   water balance into this domain, but it carries a drought INDEX as
 *   fire-danger context and pointedly does not set fuel moisture: dead fuel
 *   moisture is governed by atmospheric equilibrium moisture content (RH and
 *   temperature — Simard 1968/NFDRS, Nelson 2000), which Genesis cannot
 *   evaluate because it has no weather model, and no published universal
 *   coefficient converts soil moisture into it. See that function's doc for
 *   the full reasoning; inventing one would fabricate a dependency.
 * - **Midflame wind speed is taken directly as input.** Real practice derives
 *   it from an open/20-ft wind speed via a canopy-dependent wind adjustment
 *   factor (Albini 1976); this skips that step.
 * - **8-direction grid discretisation** approximates the true continuous
 *   elliptical wavefront (a known, real limitation of raster MTT methods,
 *   not something invented here).
 * - **No suppression, no fuel treatment, no fire breaks.**
 * - **The terrain may be synthetic** — same `TerrainHeightfield.surveyed`
 *   honesty rule as `floodInundation.ts`: `PROCEDURAL_APPROXIMATION` on the
 *   synthetic reference terrain, `MODEL_ESTIMATE` only with real elevations.
 */
export const WILDFIRE_SPREAD_SOLVER_ID = 'wildfire-spread-rothermel-mtt';
export const WILDFIRE_DOMAIN_ID = 'wildfire-spread';

// ---------------------------------------------------------------------------
// Exact unit conversions — named and inspectable, never re-derived "metric
// equivalents" of Rothermel's empirically-calibrated constants.
// ---------------------------------------------------------------------------
const FT_TO_M = 0.3048;
const MIN_TO_S = 60;
const MPH_TO_FT_PER_MIN = 88; // exact: 5280 ft/mi / 60 min/h
const TONS_PER_ACRE_TO_LB_PER_FT2 = 2000 / 43560;
const BTU_TO_KJ = 1.055056;

// ---------------------------------------------------------------------------
// 1. FUEL MODELS — Anderson (1982), USDA GTR-INT-122. A curated subset.
// ---------------------------------------------------------------------------

export interface FuelModel {
  readonly label: string;
  /** Oven-dry fuel loading, tons/acre (as published) — converted to lb/ft² internally. */
  readonly fuelLoadTonsPerAcre: number;
  /** Surface-area-to-volume ratio, ft^-1. */
  readonly savRatioPerFt: number;
  /** Fuel bed depth, ft. */
  readonly bedDepthFt: number;
  /** Dead fuel moisture of extinction, fraction. */
  readonly moistureOfExtinction: number;
}

/** Standard constants Rothermel's model assumes when a fuel model doesn't override them (Rothermel 1972). */
const FUEL_PARTICLE_LOW_HEAT_CONTENT_BTU_PER_LB = 8000;
const FUEL_PARTICLE_DENSITY_LB_PER_FT3 = 32;
const FUEL_PARTICLE_TOTAL_MINERAL_CONTENT = 0.0555;
const FUEL_PARTICLE_EFFECTIVE_MINERAL_CONTENT = 0.01;

/**
 * Four of Anderson's (1982) thirteen standard fire-behaviour fuel models,
 * with their real published load/SAV/depth/moisture-of-extinction values —
 * reproduced in essentially every fire-behaviour reference and the basis of
 * BehavePlus's own fuel model catalogue. Single dead-fuel size class per
 * model (a stated simplification — see module doc).
 */
export const FUEL_MODELS: Readonly<Record<string, FuelModel>> = Object.freeze({
  FM1_SHORT_GRASS: Object.freeze({ label: 'Short grass (FM1)', fuelLoadTonsPerAcre: 0.74, savRatioPerFt: 3500, bedDepthFt: 1.0, moistureOfExtinction: 0.12 }),
  FM2_TIMBER_GRASS_UNDERSTORY: Object.freeze({ label: 'Timber grass and understory (FM2)', fuelLoadTonsPerAcre: 2.00, savRatioPerFt: 3000, bedDepthFt: 1.0, moistureOfExtinction: 0.15 }),
  FM3_TALL_GRASS: Object.freeze({ label: 'Tall grass (FM3)', fuelLoadTonsPerAcre: 3.01, savRatioPerFt: 1500, bedDepthFt: 2.5, moistureOfExtinction: 0.25 }),
  FM4_CHAPARRAL: Object.freeze({ label: 'Chaparral (FM4)', fuelLoadTonsPerAcre: 5.01, savRatioPerFt: 2000, bedDepthFt: 6.0, moistureOfExtinction: 0.20 }),
});

// ---------------------------------------------------------------------------
// 2. ROTHERMEL (1972) SURFACE FIRE SPREAD MODEL — original US customary units.
// ---------------------------------------------------------------------------

export interface RothermelBaseRate {
  /** No-wind, no-slope spread rate, ft/min. */
  readonly r0FtPerMin: number;
  /** Reaction intensity, BTU/ft²/min — the energy release rate feeding Byram's fireline intensity. */
  readonly reactionIntensityBtuFt2Min: number;
  /** Net fuel loading actually consumed, lb/ft² — feeds Byram's fireline intensity. */
  readonly netFuelLoadLbFt2: number;
  readonly packingRatio: number;
  readonly optimumPackingRatio: number;
}

/** Rothermel's no-wind-no-slope reaction intensity and spread rate (R0), exactly as published (1972), for one fuel model at one dead-fuel moisture fraction. */
export function rothermelBaseRate(fuel: FuelModel, moistureFraction: number): RothermelBaseRate {
  const w0 = fuel.fuelLoadTonsPerAcre * TONS_PER_ACRE_TO_LB_PER_FT2;
  const sigma = fuel.savRatioPerFt;
  const rhoB = w0 / fuel.bedDepthFt; // bulk density
  const packingRatio = rhoB / FUEL_PARTICLE_DENSITY_LB_PER_FT3;
  const optimumPackingRatio = 3.348 * sigma ** -0.8189;
  const relativePacking = packingRatio / optimumPackingRatio;

  const A = 133 * sigma ** -0.7913;
  const maxReactionVelocity = sigma ** 1.5 / (495 + 0.0594 * sigma ** 1.5); // 1/min
  const reactionVelocity = maxReactionVelocity * relativePacking ** A * Math.exp(A * (1 - relativePacking));

  const rM = Math.min(moistureFraction / fuel.moistureOfExtinction, 1);
  const moistureDamping = Math.max(0, 1 - 2.59 * rM + 5.11 * rM ** 2 - 3.52 * rM ** 3);
  const mineralDamping = 0.174 * FUEL_PARTICLE_EFFECTIVE_MINERAL_CONTENT ** -0.19;

  const netFuelLoadLbFt2 = w0 * (1 - FUEL_PARTICLE_TOTAL_MINERAL_CONTENT);
  const reactionIntensityBtuFt2Min = reactionVelocity * netFuelLoadLbFt2 * FUEL_PARTICLE_LOW_HEAT_CONTENT_BTU_PER_LB * moistureDamping * mineralDamping;

  const propagatingFluxRatio = Math.exp((0.792 + 0.681 * Math.sqrt(sigma)) * (packingRatio + 0.1)) / (192 + 0.2595 * sigma);
  const effectiveHeatingNumber = Math.exp(-138 / sigma);
  const heatOfPreignitionBtuPerLb = 250 + 1116 * moistureFraction;
  const heatSink = rhoB * effectiveHeatingNumber * heatOfPreignitionBtuPerLb;

  const r0FtPerMin = heatSink > 0 ? (reactionIntensityBtuFt2Min * propagatingFluxRatio) / heatSink : 0;

  return { r0FtPerMin, reactionIntensityBtuFt2Min, netFuelLoadLbFt2, packingRatio, optimumPackingRatio };
}

/** Rothermel's wind coefficient φw, dimensionless — `midflameWindSpeedMph` is taken as-is (see module doc: no wind-adjustment-factor step). */
export function rothermelWindCoefficient(fuel: FuelModel, base: RothermelBaseRate, midflameWindSpeedMph: number): number {
  if (midflameWindSpeedMph <= 0) return 0;
  const sigma = fuel.savRatioPerFt;
  const uFtPerMin = midflameWindSpeedMph * MPH_TO_FT_PER_MIN;
  const C = 7.47 * Math.exp(-0.133 * sigma ** 0.55);
  const B = 0.02526 * sigma ** 0.54;
  const E = 0.715 * Math.exp(-0.000359 * sigma);
  return C * uFtPerMin ** B * (base.packingRatio / base.optimumPackingRatio) ** -E;
}

/** Rothermel's slope coefficient φs, dimensionless. `slopeRatio` is rise/run (tan of the slope angle); Rothermel's model only accelerates spread UPHILL — a negative/downhill ratio contributes zero, the model's own well-known convention. */
export function rothermelSlopeCoefficient(base: RothermelBaseRate, slopeRatio: number): number {
  if (slopeRatio <= 0) return 0;
  return 5.275 * base.packingRatio ** -0.3 * slopeRatio ** 2;
}

// ---------------------------------------------------------------------------
// 3. ELLIPTICAL FIRE SHAPE — Anderson (1983) / Alexander (1985).
// ---------------------------------------------------------------------------

/**
 * Length-to-breadth ratio of the fire's elliptical shape as a function of
 * wind speed — Alexander (1985), following the Canadian Forest Fire Behavior
 * Prediction System. `windSpeedKmh` is a 10 m/open wind speed by convention;
 * this module reuses the same stated wind input for both the Rothermel ROS
 * calculation and this shape formula (a stated simplification — see module
 * doc). LB = 1 (a circle) at zero wind, by construction.
 */
export function lengthToBreadthRatio(windSpeedKmh: number): number {
  const u = Math.max(0, windSpeedKmh);
  return 1 + 8.729 * (1 - Math.exp(-0.030 * u)) ** 2.155;
}

/**
 * Rate of spread at azimuth `angleFromHeadRad` (0 = the head/heading
 * direction, π = directly backing) from a focus-referenced ellipse built
 * from the head rate and the length-to-breadth ratio — the exact geometric
 * consequence of those two numbers (Richards 1990), not an approximation.
 */
export function ellipticalRosAtAngle(headRos: number, lengthToBreadth: number, angleFromHeadRad: number): number {
  if (headRos <= 0) return 0;
  if (lengthToBreadth <= 1) return headRos; // a circle: isotropic, independent of angle
  const backToHeadRatio = headToBackRatio(lengthToBreadth);
  const backRos = headRos / backToHeadRatio;
  const a = (headRos + backRos) / 2; // semi-major axis rate
  const c = a - backRos; // focus offset from ellipse centre
  const b = Math.sqrt(Math.max(0, a * a - c * c)); // semi-minor axis rate
  const denom = a - c * Math.cos(angleFromHeadRad);
  return denom > 0 ? (b * b) / denom : headRos;
}

function headToBackRatio(lengthToBreadth: number): number {
  const eccentricity = Math.sqrt(1 - 1 / (lengthToBreadth * lengthToBreadth));
  return (1 + eccentricity) / (1 - eccentricity);
}

// ---------------------------------------------------------------------------
// 4. BYRAM (1959) FIRELINE INTENSITY AND FLAME LENGTH.
// ---------------------------------------------------------------------------

/** Byram's fireline intensity, I = h*w*R (BTU/ft/s), converted to kW/m via exact unit conversions (never a re-derived "metric Byram constant"). `rosFtPerMin` is the LOCAL rate of spread the fire front is actually advancing at. */
export function byramFirelineIntensityKWm(reactionData: RothermelBaseRate, rosFtPerMin: number): number {
  const rosFtPerS = rosFtPerMin / MIN_TO_S;
  const intensityBtuFtS = FUEL_PARTICLE_LOW_HEAT_CONTENT_BTU_PER_LB * reactionData.netFuelLoadLbFt2 * rosFtPerS;
  return intensityBtuFtS * BTU_TO_KJ / FT_TO_M; // (kJ/s)/m = kW/m
}

/** Byram's flame-length correlation, L=0.45*I^0.46 (I in BTU/ft/s, L in ft) — computed in the original unit system, then converted to metres. */
export function byramFlameLengthM(intensityKWm: number): number {
  if (intensityKWm <= 0) return 0;
  const intensityBtuFtS = (intensityKWm * FT_TO_M) / BTU_TO_KJ;
  const lengthFt = 0.45 * intensityBtuFtS ** 0.46;
  return lengthFt * FT_TO_M;
}

// ---------------------------------------------------------------------------
// FUEL BED — reuses `TerrainHeightfield`'s own grid shape; adds fuel model
// and moisture per cell rather than building a second geometry.
// ---------------------------------------------------------------------------

export interface FuelBed {
  readonly terrain: TerrainHeightfield;
  /** Fuel model key (into `FUEL_MODELS`) per cell, row-major, same indexing as `terrain.elevationsM`. */
  readonly fuelModelKeys: readonly string[];
  /** Dead fuel moisture fraction per cell. */
  readonly fuelMoistureFraction: readonly number[];
}

/** A uniform fuel bed over the given terrain — one fuel model and moisture everywhere, the common case for a scenario without per-cell vegetation survey data. */
export function buildUniformFuelBed(terrain: TerrainHeightfield, fuelModelKey: string, fuelMoistureFraction: number): FuelBed {
  const n = terrain.cols * terrain.rows;
  return {
    terrain,
    fuelModelKeys: new Array(n).fill(fuelModelKey),
    fuelMoistureFraction: new Array(n).fill(fuelMoistureFraction),
  };
}

export interface WindVector {
  readonly speedMph: number;
  /**
   * Direction the wind is driving the fire TOWARD (not the meteorological
   * "from" convention), degrees, measured the same way `edgeAngleRad` below
   * is: 0° = the grid's +row direction, 90° = the grid's +column direction.
   * `TerrainHeightfield`/`CityLayout` never establish a true geographic
   * north, so this is an internally self-consistent bearing over the grid's
   * own row/column axes, not a claim about compass north.
   */
  readonly directionDegrees: number;
}

// 8-connectivity: the standard raster fire-spread neighbourhood (better angular resolution than 4-connectivity).
const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Simple binary min-heap keyed by a numeric priority — no external dependency, adequate for a fuel-bed-sized grid. */
class MinHeap {
  private readonly items: { key: number; value: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(key: number, value: number): void {
    this.items.push({ key, value });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].key <= this.items[i].key) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): { key: number; value: number } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < this.items.length && this.items[left].key < this.items[smallest].key) smallest = left;
        if (right < this.items.length && this.items[right].key < this.items[smallest].key) smallest = right;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

export interface WildfireSpreadResult {
  /** Arrival time, seconds since ignition, per cell (row-major) — `Infinity` for a cell never reached. */
  readonly arrivalTimeS: Float64Array;
  /** Wind-driven head-fire rate of spread, m/s — the fastest rate anywhere in the fuel bed, for the given fuel/moisture/wind. */
  readonly headRosMS: number;
  readonly headFirelineIntensityKWm: number;
  readonly headFlameLengthM: number;
}

/**
 * Minimum-travel-time fire growth (Finney 2002): Dijkstra over the fuel-bed
 * grid, where each edge's cost is the real travel time between adjacent
 * cells — distance divided by the directional rate of spread, which
 * combines the wind-driven elliptical shape (Anderson 1983/Alexander 1985)
 * with the REAL local terrain slope for that specific edge (Rothermel's own
 * additive wind+slope convention, applied per edge — see module doc for why
 * this is a disclosed simplification when wind and slope are not aligned).
 */
export function simulateWildfireSpread(fuelBed: FuelBed, wind: WindVector, ignitionCellIndices: readonly number[]): WildfireSpreadResult {
  const { terrain, fuelModelKeys, fuelMoistureFraction } = fuelBed;
  const { cols, rows, elevationsM, cellSizeM } = terrain;
  const n = cols * rows;
  const arrivalTimeS = new Float64Array(n).fill(Number.POSITIVE_INFINITY);

  // Precompute each cell's Rothermel base rate and wind-driven head rate once — fuel/moisture/wind
  // are fixed for the fire's lifetime (see module doc), so this is a one-shot cost, not a per-edge one.
  const baseByCell: (RothermelBaseRate | undefined)[] = new Array(n);
  const windHeadRosFtPerMinByCell = new Float64Array(n);
  let maxHeadRosFtPerMin = 0;
  let maxHeadRosBase: RothermelBaseRate | undefined;
  const windDirRad = degToRad(wind.directionDegrees);
  const lb = lengthToBreadthRatio(wind.speedMph * 1.60934); // mph -> km/h, exact conversion

  for (let i = 0; i < n; i++) {
    const fuel = FUEL_MODELS[fuelModelKeys[i]];
    if (!fuel) continue;
    const base = rothermelBaseRate(fuel, fuelMoistureFraction[i]);
    const phiWind = rothermelWindCoefficient(fuel, base, wind.speedMph);
    const headRos = base.r0FtPerMin * (1 + phiWind);
    baseByCell[i] = base;
    windHeadRosFtPerMinByCell[i] = headRos;
    if (headRos > maxHeadRosFtPerMin) {
      maxHeadRosFtPerMin = headRos;
      maxHeadRosBase = base;
    }
  }

  const heap = new MinHeap();
  for (const idx of ignitionCellIndices) {
    if (idx >= 0 && idx < n) {
      arrivalTimeS[idx] = 0;
      heap.push(0, idx);
    }
  }

  const visited = new Uint8Array(n);
  while (heap.size > 0) {
    const { key: time, value: index } = heap.pop()!;
    if (visited[index]) continue;
    visited[index] = 1;
    if (time > arrivalTimeS[index]) continue;

    const base = baseByCell[index];
    if (!base) continue; // unburnable cell (no fuel model assigned)
    const x = index % cols;
    const y = (index - x) / cols;
    const elevA = elevationsM[index];
    const windHeadRos = windHeadRosFtPerMinByCell[index];

    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const neighborIndex = ny * cols + nx;
      if (visited[neighborIndex]) continue;
      if (!baseByCell[neighborIndex]) continue; // no fuel at the target cell itself: it cannot ignite, regardless of what is burning next to it

      const distanceM = Math.hypot(dx, dy) * cellSizeM;
      const edgeAngleRad = Math.atan2(dx, dy); // grid bearing: dy=north component, dx=east component
      const angleFromHead = edgeAngleRad - windDirRad;
      const windComponentFtPerMin = ellipticalRosAtAngle(windHeadRos, lb, angleFromHead);
      const phiWindEffective = base.r0FtPerMin > 0 ? windComponentFtPerMin / base.r0FtPerMin - 1 : 0;

      const slopeRatio = Math.max(0, (elevationsM[neighborIndex] - elevA) / distanceM);
      const phiSlope = rothermelSlopeCoefficient(base, slopeRatio);

      const rEdgeFtPerMin = base.r0FtPerMin * Math.max(0, 1 + phiWindEffective + phiSlope);
      const rEdgeMS = (rEdgeFtPerMin * FT_TO_M) / MIN_TO_S;
      if (rEdgeMS <= 0) continue; // this edge cannot burn (e.g. no fuel/no base rate)

      const candidateTimeS = time + distanceM / rEdgeMS;
      if (candidateTimeS < arrivalTimeS[neighborIndex]) {
        arrivalTimeS[neighborIndex] = candidateTimeS;
        heap.push(candidateTimeS, neighborIndex);
      }
    }
  }

  const headRosMS = (maxHeadRosFtPerMin * FT_TO_M) / MIN_TO_S;
  const headFirelineIntensityKWm = maxHeadRosBase ? byramFirelineIntensityKWm(maxHeadRosBase, maxHeadRosFtPerMin) : 0;
  const headFlameLengthM = byramFlameLengthM(headFirelineIntensityKWm);

  return { arrivalTimeS, headRosMS, headFirelineIntensityKWm, headFlameLengthM };
}

/** Burned area at `elapsedS` since ignition, m² — a level-set query on the precomputed arrival-time field, not a re-simulation. */
export function burnedAreaM2At(result: WildfireSpreadResult, terrain: TerrainHeightfield, elapsedS: number): number {
  let burnedCells = 0;
  for (let i = 0; i < result.arrivalTimeS.length; i++) if (result.arrivalTimeS[i] <= elapsedS) burnedCells++;
  return burnedCells * cellAreaM2(terrain);
}

// ---------------------------------------------------------------------------
// ECS BINDING
// ---------------------------------------------------------------------------

export interface WildfireDomainState extends Record<string, number> {
  elapsedS: number;
  windSpeedMph: number;
  windDirectionDegrees: number;
  headRosMS: number;
  headFirelineIntensityKWm: number;
  headFlameLengthM: number;
  burnedAreaM2: number;
  burnedCells: number;
  totalCells: number;
  terrainSurveyed: number;
  /**
   * KBDI-equivalent drought index written by `buildDroughtToWildfireCoupling`
   * from `drought.ts`'s real water balance. This is fire-danger CONTEXT that
   * travels with the fire; it deliberately does NOT feed the spread
   * calculation — see that coupling's doc for exactly why.
   */
  droughtIndexKBDI: number;
}

/** The honesty rule, matching `floodInundation.ts::groundingFor` exactly: a correct algorithm over invented ground demonstrates the method, it does not describe a place. */
export function groundingForWildfire(terrainSurveyed: number): GroundingLevel {
  return terrainSurveyed === 1 ? 'MODEL_ESTIMATE' : 'PROCEDURAL_APPROXIMATION';
}

let stepCounter = 0;

/**
 * One solver bound to one precomputed `WildfireSpreadResult` — the MTT
 * Dijkstra runs ONCE (fuel, moisture and wind are fixed for the fire's
 * lifetime, see module doc), and each tick is a cheap level-set query
 * against `ctx.tick`-accumulated elapsed time, exactly mirroring
 * `floodInundation.ts`'s cache-on-input-change pattern.
 */
export function makeWildfireSpreadSolver(fuelBed: FuelBed, wind: WindVector, ignitionCellIndices: readonly number[]): DomainSolver {
  const result = simulateWildfireSpread(fuelBed, wind, ignitionCellIndices);
  const totalCells = fuelBed.terrain.cols * fuelBed.terrain.rows;

  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<WildfireDomainState> | undefined;
    const elapsedS = (state?.elapsedS ?? 0) + ctx.dt;
    // Written by the drought coupling, not by this solver — carry it through rather than wiping it.
    const droughtIndexKBDI = state?.droughtIndexKBDI ?? 0;
    const burnedAreaM2 = burnedAreaM2At(result, fuelBed.terrain, elapsedS);
    let burnedCells = 0;
    for (let i = 0; i < result.arrivalTimeS.length; i++) if (result.arrivalTimeS[i] <= elapsedS) burnedCells++;

    stepCounter += 1;

    const observation: Observation = {
      observationId: `wildfire-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: t=${elapsedS.toFixed(0)}s, burned=${burnedAreaM2.toFixed(0)}m² (${burnedCells}/${totalCells} cells), head ROS=${result.headRosMS.toFixed(3)}m/s, flame length=${result.headFlameLengthM.toFixed(1)}m`,
      measurements: [
        { key: 'burnedAreaM2', value: burnedAreaM2, unit: 'm2', tick: ctx.tick, entity: entity.ref, provenance: ['domains/wildfireSpread.ts#simulateWildfireSpread', 'finney-2002-minimum-travel-time'] },
        { key: 'headRosMS', value: result.headRosMS, unit: 'm/s', tick: ctx.tick, entity: entity.ref, provenance: ['domains/wildfireSpread.ts#rothermelBaseRate', 'rothermel-1972'] },
        { key: 'headFirelineIntensityKWm', value: result.headFirelineIntensityKWm, unit: 'kW/m', tick: ctx.tick, entity: entity.ref, provenance: ['domains/wildfireSpread.ts#byramFirelineIntensityKWm', 'byram-1959'] },
        { key: 'headFlameLengthM', value: result.headFlameLengthM, unit: 'm', tick: ctx.tick, entity: entity.ref, provenance: ['domains/wildfireSpread.ts#byramFlameLengthM'] },
      ],
      provenance: ['domains/wildfireSpread.ts', 'rothermel-1972', 'anderson-1983-elliptical-shape', 'finney-2002-mtt', 'byram-1959', fuelBed.terrain.surveyed ? 'terrain:surveyed' : 'terrain:synthetic'],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `wildfire-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'wildfire.spread.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'minimum-travel-time-level-set-query',
      parameters: { elapsedS, burnedAreaM2, burnedCells, headRosMS: result.headRosMS, headFirelineIntensityKWm: result.headFirelineIntensityKWm },
      provenance: {
        origin: 'model',
        modelId: WILDFIRE_SPREAD_SOLVER_ID,
        notes: 'Rothermel (1972) surface fire spread + Anderson/Alexander elliptical shape + Finney (2002) minimum-travel-time Dijkstra, precomputed once over the fuel bed; each tick queries the precomputed arrival-time field. No crown fire, no spotting, no fire-weather coupling, no suppression.',
      },
    };

    const terrainSurveyed = fuelBed.terrain.surveyed ? 1 : 0;
    return {
      patch: {
        domainState: {
          elapsedS,
          windSpeedMph: wind.speedMph,
          windDirectionDegrees: wind.directionDegrees,
          headRosMS: result.headRosMS,
          headFirelineIntensityKWm: result.headFirelineIntensityKWm,
          headFlameLengthM: result.headFlameLengthM,
          burnedAreaM2,
          burnedCells,
          totalCells,
          terrainSurveyed,
          droughtIndexKBDI,
        },
        statusLabel: `${burnedCells}/${totalCells} cells burned`,
      },
      grounding: groundingForWildfire(terrainSurveyed),
      observation,
      event,
    };
  };
}

export interface AddWildfireOptions {
  wildfireId?: string;
  label?: string;
  parentEntityId?: EntityId;
}

export function addWildfire(graph: WorldGraph, fuelBed: FuelBed, wind: WindVector, ignitionCellIndices: readonly number[], options: AddWildfireOptions = {}): EntityId {
  const ref = { kind: 'wildfire', id: options.wildfireId ?? 'wildfire-1' };
  const terrainSurveyed = fuelBed.terrain.surveyed ? 1 : 0;
  const totalCells = fuelBed.terrain.cols * fuelBed.terrain.rows;
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Wildfire',
    scale: { level: 'MACRO_CITY', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: {
      elapsedS: 0,
      windSpeedMph: wind.speedMph,
      windDirectionDegrees: wind.directionDegrees,
      headRosMS: 0,
      headFirelineIntensityKWm: 0,
      headFlameLengthM: 0,
      burnedAreaM2: ignitionCellIndices.length * cellAreaM2(fuelBed.terrain),
      burnedCells: ignitionCellIndices.length,
      totalCells,
      terrainSurveyed,
      droughtIndexKBDI: 0,
    },
    domainBinding: { solverId: WILDFIRE_SPREAD_SOLVER_ID, domainId: WILDFIRE_DOMAIN_ID },
    statusLabel: `${ignitionCellIndices.length}/${totalCells} cells burned`,
    grounding: groundingForWildfire(terrainSurveyed),
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export interface WildfireWorldOptions {
  fuelBed: FuelBed;
  wind: WindVector;
  ignitionCellIndices: readonly number[];
  siteId?: string;
}

export interface WildfireWorld {
  graph: WorldGraph;
  siteId: EntityId;
  wildfireId: EntityId;
}

/** Standalone scenario: a site container (MACRO_CITY) with one wildfire bound to the real Rothermel/MTT solver. */
export function buildWildfireWorld(options: WildfireWorldOptions): WildfireWorld {
  const graph = new WorldGraph();
  const siteRef = { kind: 'wildfire-site', id: options.siteId ?? 'wildfire-site-1' };
  const site: WorldModelEntity = {
    id: entityId(siteRef),
    ref: siteRef,
    label: 'Wildfire Site',
    scale: { level: 'MACRO_CITY' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    grounding: 'UNGROUNDED_APPROXIMATION', // a container, not something any solver advances directly
    updatedAtTick: 0,
  };
  graph.addEntity(site);
  const wildfireId = addWildfire(graph, options.fuelBed, options.wind, options.ignitionCellIndices, { parentEntityId: site.id });
  return { graph, siteId: site.id, wildfireId };
}

// ---------------------------------------------------------------------------
// CROSS-DOMAIN COUPLING: drought -> wildfire.
// ---------------------------------------------------------------------------

export const WILDFIRE_DROUGHT_CONTEXT_EVENT_TYPE = 'wildfire.drought.context';

/**
 * DROUGHT -> WILDFIRE, wired through the SAME `CrossDomainCoupling`
 * mechanism as `floodInundation.ts`'s `buildDrainageLossCoupling` and
 * `genesisScientificCity3.ts`'s rainfall->floodplain link. No second
 * mechanism.
 *
 * ## What this coupling really carries, and why only that
 *
 * It carries `drought.ts`'s KBDI-EQUIVALENT drought index onto the wildfire
 * entity as fire-danger context. That number is real and exactly derived:
 * the Keetch-Byram Drought Index is DEFINED as cumulative soil/duff moisture
 * deficiency in hundredths of an inch (0-800), which is the same physical
 * quantity `drought.ts`'s Thornthwaite-Mather water balance computes, so the
 * conversion is a unit conversion — no fitted coefficient. (Caveat, carried
 * everywhere it goes: Keetch & Byram derive their deficit with their own
 * drying equation, so this is KBDI-EQUIVALENT, not KBDI.)
 *
 * ## What this coupling deliberately does NOT do: set fuel moisture
 *
 * The obvious wish is "drought dries the vegetation, so fire spreads
 * faster" — wire soil moisture into `fuelMoistureFraction` and watch the
 * Rothermel rate climb. That link is NOT made here, because a literature
 * check does not support it:
 *
 * 1. **Dead fuel moisture is not a function of soil moisture.** It is
 *    governed by equilibrium with ATMOSPHERIC moisture — the equilibrium
 *    moisture content relationships behind the US National Fire Danger
 *    Rating System (Simard 1968) and Nelson (2000) — whose inputs are
 *    relative humidity and temperature. Dead fuel is detached from the soil
 *    water system, and there is no soil-moisture term in those equations.
 *    Genesis has no weather model (`rainfallRunoff.ts` says so itself), so
 *    it cannot evaluate them.
 * 2. **Live fuel moisture IS soil-water-driven, but has no universal
 *    coefficient.** Operational estimates are species- and site-specific
 *    regressions, or direct field sampling. There is no single published
 *    constant to apply.
 * 3. **KBDI is used operationally to adjust drought fuel loading**, but
 *    those adjustments are specific to particular fire-danger systems and
 *    would have to be guessed to implement here.
 *
 * Inventing a coefficient to make the two domains appear connected would
 * produce a fire that spreads faster for a reason no reference supports —
 * a fabricated dependency, which is worse than a disclosed gap. So the
 * index is carried and made visible; fuel moisture stays a stated input,
 * and `solverCapability.ts` says exactly this rather than claiming the gap
 * is closed.
 */
export function buildDroughtToWildfireCoupling(droughtStepEventType: string): CrossDomainCoupling {
  return defineCrossDomainCoupling({
    id: 'drought-to-wildfire-danger-context',
    sourceDomain: 'environment-hydrology',
    targetDomain: WILDFIRE_DOMAIN_ID,
    triggerEventType: droughtStepEventType,
    relationshipKind: 'dries',
    direction: 'from',
    condition: 'The drought water balance this fuel bed sits in reports a new soil-moisture deficit',
    effect: 'The KBDI-equivalent drought index is carried onto the wildfire as fire-danger context. It deliberately does NOT change fuel moisture or rate of spread: no published relationship converts soil moisture into dead fuel moisture (that is atmospheric-EMC-driven), so the link stops where the evidence stops',
    // The value is a real solver's real numeric output, exactly unit-converted — but the coupling
    // asserts no physical mechanism onto the fire, so it claims no more than MODEL_ESTIMATE.
    grounding: 'MODEL_ESTIMATE',
    deriveEffect: (wildfire, triggerEvent) => {
      const kbdi = triggerEvent.parameters.kbdiEquivalent;
      if (typeof kbdi !== 'number' || !Number.isFinite(kbdi)) return undefined;
      if (wildfire.domainState?.droughtIndexKBDI === kbdi) return undefined; // unchanged: do not re-fire
      return {
        patch: { domainState: { ...wildfire.domainState, droughtIndexKBDI: kbdi } },
        eventType: WILDFIRE_DROUGHT_CONTEXT_EVENT_TYPE,
        cause: 'drought-water-balance-deficit',
      };
    },
  });
}
