import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type GroundingLevel, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * FIRE / THERMAL — a real, published-model heat-release-rate and
 * point-source radiant-heat-transfer solver, closing part of the gap
 * `capability/solverCapability.ts` named for WILDFIRE/INDUSTRIAL_FIRE.
 *
 * This is a smaller first slice than `trafficFlow.ts` on purpose: there is
 * no existing fire geometry to build on (no fuel bed, no compartment, no
 * building thermal model anywhere in Genesis), so this starts from the
 * single, well-published piece that needs no such geometry at all — one
 * fire source's heat release over time, and the radiant heat flux it
 * delivers to a point at a stated distance. Spread across a fuel bed and
 * structural response are explicitly NOT attempted here — see the bottom
 * of this doc comment and `solverCapability.ts`.
 *
 * ## What is real here
 *
 * **1. Heat-release-rate curve — the SFPE/NFPA "t-squared design fire".**
 * Growth is `Q(t) = 1055·(t/t_g)²` kW (Q ∝ t²), where `t_g` is the
 * published characteristic growth time to reach 1055 kW (≈1000 Btu/s) for
 * one of the four standard NFPA 921/SFPE Handbook growth classes — slow
 * (600 s), medium (300 s), fast (150 s), ultrafast (75 s). This is the same
 * design-fire curve used throughout fire protection engineering for
 * sprinkler/detector response and tenability calculations — not invented
 * here.
 *
 * **2. Fuel inventory, and real conservation of energy.** A `FuelPackage`
 * carries a fuel mass and a published heat of combustion (MJ/kg). Total
 * releasable chemical energy is `mass · heatOfCombustion · combustionEfficiency`
 * (the efficiency factor, typically 0.7-0.9, accounts for real incomplete
 * combustion — Drysdale, *An Introduction to Fire Dynamics*). The growth
 * curve is capped at a stated design peak HRR (a real, citable design-fire
 * parameter — e.g. SFPE Handbook furniture-calorimetry design values —
 * this solver does not derive a peak from first principles, see below),
 * then the curve integrates exactly to that total energy across a steady
 * phase and a linear decay phase: this is conservation of energy actually
 * enforced, not a plotted shape. See `buildFireCurve` for the exact
 * closed-form solution, including the honest edge case where the fuel
 * load is too small to ever reach the design peak.
 *
 * **3. Heat transfer — the SFPE point-source radiation model.**
 * `q"(r) = χ_r·Q / (4πr²)` kW/m², the standard far-field approximation
 * for radiant heat flux from a fire treated as a point source (Drysdale;
 * SFPE Engineering Guide for Piloted Ignition). `χ_r` (radiative fraction)
 * is a published, fuel-dependent constant (~0.15-0.6; default 0.3).
 * Published hazard thresholds (`FLUX_THRESHOLD_KW_M2`) classify the result.
 *
 * **4. Combustion-product mass, not transport.** Mass burn rate follows
 * directly from HRR and heat of combustion (`ṁ = Q / (Δh_c·η)`), integrated
 * to cumulative mass burned and capped at the fuel mass. Multiplying by
 * published soot/CO yield factors (kg product / kg fuel burned, fuel- and
 * ventilation-dependent) gives how much smoke and toxic product a fire has
 * PRODUCED. Where that mass GOES — a plume, a smoke layer, a concentration
 * at a location — is a dispersion/transport problem this does not solve
 * (same gap already disclosed for CHEMICAL_RELEASE: no wind field, no
 * plume model anywhere in Genesis). Yields used here are well-ventilated
 * (fuel-controlled) values; a real under-ventilated/post-flashover fire
 * produces dramatically more CO and soot, which this does not capture.
 *
 * ## What is deliberately NOT modelled
 *
 * - **Fire spread.** No fuel bed, no rate-of-spread model (e.g. Rothermel
 *   for wildland fuels), no fire-to-fire or building-to-building ignition.
 *   This solver advances exactly ONE fire source; it never becomes two.
 *   This is why WILDFIRE — whose defining phenomenon IS spread across a
 *   landscape — stays NOT_MODELLED even though this file exists; see
 *   `solverCapability.ts`.
 * - **No compartment fire dynamics.** No two-zone model, no flashover, no
 *   ventilation-limited combustion, no hot/cold gas layers. `Q(t)` here is
 *   the fuel's OWN heat release as if unconfined/well-ventilated — a real
 *   compartment fire can depart sharply from this once ventilation limits
 *   it, and this solver has no way to know that has happened.
 * - **No conduction or convection**, and no compartment gas temperature —
 *   only point-source radiation to a specified target distance.
 * - **No structural response.** No fire-resistance rating, no thermal
 *   penetration into a structural element, no strength-loss-with-temperature
 *   relationship, no collapse — that would need the structural model
 *   Genesis does not have anywhere (the same absence already named for
 *   EARTHQUAKE's fragility gap).
 * - **Peak HRR is a stated design value, not derived.** Deriving it from
 *   first principles needs a burning-rate/pyrolysis model tied to exposed
 *   fuel surface area, which this does not have; the caller supplies a
 *   real, citable design-fire peak (e.g. from SFPE Handbook furniture
 *   calorimetry tables) instead.
 * - **No calibration** against any specific real fire test or incident.
 */
export const FIRE_THERMAL_SOLVER_ID = 'fire-thermal-tsquared-point-source';
export const FIRE_THERMAL_DOMAIN_ID = 'fire-thermal';

// ---------------------------------------------------------------------------
// 1. HEAT-RELEASE-RATE CURVE — NFPA 921 / SFPE Handbook t-squared design fire.
// ---------------------------------------------------------------------------

export type FireGrowthRate = 'SLOW' | 'MEDIUM' | 'FAST' | 'ULTRAFAST';

/** Reference HRR the growth-time classes are defined against — 1055 kW ≈ 1000 Btu/s (NFPA 921 / SFPE Handbook convention). */
export const REFERENCE_HRR_KW = 1055;

/** Published characteristic growth time to reach `REFERENCE_HRR_KW`, seconds — NFPA 921 Table 23.6, SFPE Handbook. */
export const FIRE_GROWTH_TIME_S: Readonly<Record<FireGrowthRate, number>> = Object.freeze({
  SLOW: 600,
  MEDIUM: 300,
  FAST: 150,
  ULTRAFAST: 75,
});

/** Q(t) = 1055*(t/tg)^2 during growth — the published t-squared design-fire relation, before any fuel/peak limit is applied. */
export function tSquaredGrowthKW(elapsedS: number, growthRate: FireGrowthRate): number {
  if (elapsedS <= 0) return 0;
  const tg = FIRE_GROWTH_TIME_S[growthRate];
  return REFERENCE_HRR_KW * (elapsedS / tg) ** 2;
}

export interface FuelPackage {
  readonly label: string;
  /** Combustible mass available to burn, kg. The real fuel inventory that bounds total energy release. */
  readonly fuelMassKg: number;
  /** Net heat of combustion, MJ/kg — a published property of the fuel, not fitted to this scenario. */
  readonly heatOfCombustionMJPerKg: number;
  /** Fraction of chemical energy actually released as heat (Drysdale ~0.7-0.9 typical for flaming combustion). */
  readonly combustionEfficiency: number;
  /** Radiative fraction χ_r of the HRR emitted as thermal radiation (Drysdale/SFPE, ~0.15-0.6 by fuel). */
  readonly radiativeFraction: number;
  /** Soot yield, kg soot / kg fuel burned, well-ventilated flaming combustion (SFPE Handbook / NIST). */
  readonly sootYieldKgPerKg: number;
  /** CO yield, kg CO / kg fuel burned, well-ventilated flaming combustion — NOT a post-flashover/under-ventilated value. */
  readonly coYieldKgPerKg: number;
}

/**
 * Representative fuel packages with literature-typical properties (Drysdale;
 * SFPE Handbook; NIST fire technical notes). These describe fuel CATEGORIES,
 * not a measured item — same disclosure convention as `cellCycle.ts`'s
 * "representative mammalian values, not a measured line".
 */
export const FUEL_PACKAGES: Readonly<Record<string, FuelPackage>> = Object.freeze({
  WOOD_CRIB: Object.freeze({
    label: 'Wood crib',
    fuelMassKg: 50,
    heatOfCombustionMJPerKg: 17.5,
    combustionEfficiency: 0.8,
    radiativeFraction: 0.3,
    sootYieldKgPerKg: 0.015,
    coYieldKgPerKg: 0.005,
  }),
  UPHOLSTERED_FURNITURE: Object.freeze({
    label: 'Upholstered furniture (PU foam/fabric)',
    fuelMassKg: 25,
    heatOfCombustionMJPerKg: 26,
    combustionEfficiency: 0.75,
    radiativeFraction: 0.35,
    sootYieldKgPerKg: 0.1,
    coYieldKgPerKg: 0.02,
  }),
  FLAMMABLE_LIQUID_POOL: Object.freeze({
    label: 'Flammable liquid pool (hydrocarbon)',
    fuelMassKg: 500,
    heatOfCombustionMJPerKg: 44,
    combustionEfficiency: 0.85,
    radiativeFraction: 0.35,
    sootYieldKgPerKg: 0.08,
    coYieldKgPerKg: 0.01,
  }),
});

export interface FireSourceParams {
  readonly growthRate: FireGrowthRate;
  readonly fuel: FuelPackage;
  /** Stated design peak HRR, kW — a real, citable design-fire parameter (e.g. SFPE Handbook furniture calorimetry), not derived here. */
  readonly peakHRRkW: number;
}

export interface FireCurve {
  /** Time to reach the design peak, s (growth-phase end). */
  readonly tGrowthEndS: number;
  /** Time the steady/peak phase ends, s. Equals `tGrowthEndS` when there is no steady phase. */
  readonly tSteadyEndS: number;
  /** Time the fire is fully burned out, s. */
  readonly tBurnoutS: number;
  /** Duration of the linear decay phase, s. */
  readonly tDecayS: number;
  /** Total releasable energy actually enforced, kJ (mass * heat of combustion * efficiency). */
  readonly totalEnergyKJ: number;
  /** True when the fuel load is exhausted DURING growth — the fire decays without ever reaching the stated design peak (an honest edge case, not an error). */
  readonly fuelLimitedBeforePeak: boolean;
}

/**
 * Builds the closed-form three-phase (growth / steady / decay) design-fire
 * curve for one fuel package, enforcing conservation of energy exactly:
 * the integral of the returned curve equals `totalEnergyKJ`.
 *
 * Growth follows the published t-squared relation until either the stated
 * design peak is reached, or the fuel is exhausted first (the honest small
 * fuel-load case — the fire never reaches its design peak at all). When the
 * peak IS reached, the convention used for the otherwise-unconstrained decay
 * length is that decay lasts as long as growth did (a documented,
 * commonly-used design-fire simplification, e.g. SFPE Engineering Guide
 * examples) — shortened automatically if the remaining fuel energy cannot
 * support a decay that long.
 */
export function buildFireCurve(params: FireSourceParams): FireCurve {
  const { growthRate, fuel, peakHRRkW } = params;
  const tg = FIRE_GROWTH_TIME_S[growthRate];
  const totalEnergyKJ = fuel.fuelMassKg * fuel.heatOfCombustionMJPerKg * 1000 * fuel.combustionEfficiency;

  // Time to reach the design peak via Q(t)=1055*(t/tg)^2, and the energy consumed getting there
  // (closed-form integral of the t-squared growth law: E1 = 1055/tg^2 * t1^3/3).
  const tGrowthEndUnconstrained = peakHRRkW > 0 ? tg * Math.sqrt(peakHRRkW / REFERENCE_HRR_KW) : 0;
  const growthEnergyUnconstrainedKJ = (REFERENCE_HRR_KW / (tg * tg)) * (tGrowthEndUnconstrained ** 3) / 3;

  if (growthEnergyUnconstrainedKJ >= totalEnergyKJ || peakHRRkW <= 0) {
    // Fuel-limited before the design peak: growth alone would exceed the available energy.
    // Solve t_burnout directly from the same closed-form integral: E = 1055/tg^2 * t^3/3.
    const tBurnoutS = Math.cbrt((3 * totalEnergyKJ * tg * tg) / REFERENCE_HRR_KW);
    return {
      tGrowthEndS: tBurnoutS,
      tSteadyEndS: tBurnoutS,
      tBurnoutS,
      tDecayS: 0,
      totalEnergyKJ,
      fuelLimitedBeforePeak: true,
    };
  }

  const remainingKJ = totalEnergyKJ - growthEnergyUnconstrainedKJ;
  const candidateDecayS = tGrowthEndUnconstrained; // convention: decay defaults to the same length as growth
  const candidateDecayEnergyKJ = 0.5 * peakHRRkW * candidateDecayS; // triangular (linear decay to zero)

  let tSteadyS: number;
  let tDecayS: number;
  if (candidateDecayEnergyKJ <= remainingKJ) {
    tDecayS = candidateDecayS;
    tSteadyS = (remainingKJ - candidateDecayEnergyKJ) / peakHRRkW;
  } else {
    // Not enough remaining energy to sustain a full-length decay: shorten decay, skip the steady phase.
    tSteadyS = 0;
    tDecayS = (2 * remainingKJ) / peakHRRkW;
  }

  const tSteadyEndS = tGrowthEndUnconstrained + tSteadyS;
  const tBurnoutS = tSteadyEndS + tDecayS;

  return {
    tGrowthEndS: tGrowthEndUnconstrained,
    tSteadyEndS,
    tBurnoutS,
    tDecayS,
    totalEnergyKJ,
    fuelLimitedBeforePeak: false,
  };
}

/** Heat release rate at `elapsedS` since ignition, kW — the real, energy-conserving three-phase curve, zero before ignition and after burnout. */
export function heatReleaseRateKW(elapsedS: number, params: FireSourceParams, curve: FireCurve): number {
  if (elapsedS <= 0 || elapsedS >= curve.tBurnoutS) return 0;
  if (elapsedS < curve.tGrowthEndS) {
    return curve.fuelLimitedBeforePeak
      ? tSquaredGrowthKW(elapsedS, params.growthRate)
      : Math.min(tSquaredGrowthKW(elapsedS, params.growthRate), params.peakHRRkW);
  }
  if (elapsedS < curve.tSteadyEndS) return params.peakHRRkW;
  const peakAtDecayStart = curve.fuelLimitedBeforePeak ? tSquaredGrowthKW(curve.tGrowthEndS, params.growthRate) : params.peakHRRkW;
  const intoDecayS = elapsedS - curve.tSteadyEndS;
  return peakAtDecayStart * Math.max(0, 1 - intoDecayS / curve.tDecayS);
}

/** Cumulative energy released from ignition to `elapsedS`, kJ — the closed-form integral of `heatReleaseRateKW`, matching `curve.totalEnergyKJ` at/after burnout. */
export function cumulativeEnergyReleasedKJ(elapsedS: number, params: FireSourceParams, curve: FireCurve): number {
  const t = Math.max(0, Math.min(elapsedS, curve.tBurnoutS));
  const tg = FIRE_GROWTH_TIME_S[params.growthRate];
  const growthIntegral = (tEnd: number) => (REFERENCE_HRR_KW / (tg * tg)) * (tEnd ** 3) / 3;

  if (t <= curve.tGrowthEndS) return growthIntegral(t);
  const growthPart = curve.fuelLimitedBeforePeak ? growthIntegral(curve.tGrowthEndS) : growthIntegral(Math.min(curve.tGrowthEndS, t));
  if (t <= curve.tSteadyEndS) return growthPart + params.peakHRRkW * (t - curve.tGrowthEndS);
  const steadyPart = params.peakHRRkW * (curve.tSteadyEndS - curve.tGrowthEndS);
  const intoDecayS = Math.min(t - curve.tSteadyEndS, curve.tDecayS);
  const peakAtDecayStart = curve.fuelLimitedBeforePeak ? tSquaredGrowthKW(curve.tGrowthEndS, params.growthRate) : params.peakHRRkW;
  // Energy under a linearly-decaying ramp from peakAtDecayStart to 0 over [0, intoDecayS] of curve.tDecayS.
  const decayPart = curve.tDecayS > 0 ? peakAtDecayStart * intoDecayS * (1 - intoDecayS / (2 * curve.tDecayS)) : 0;
  return growthPart + steadyPart + decayPart;
}

// ---------------------------------------------------------------------------
// 2. HEAT TRANSFER — SFPE point-source radiation model.
// ---------------------------------------------------------------------------

/** Published hazard bands for incident radiant heat flux, kW/m² (Drysdale; SFPE Engineering Guide; API 521 for the equipment-damage threshold). */
export const FLUX_THRESHOLD_KW_M2 = Object.freeze({
  PAIN_ON_BARE_SKIN: 1.4,
  SECOND_DEGREE_BURN_RISK: 4.0,
  PILOTED_IGNITION_OF_WOOD: 10,
  SECONDARY_IGNITION_CRITICAL: 12.5,
  EQUIPMENT_DAMAGE: 37.5,
});

/**
 * Incident radiant heat flux at distance `rM` from a point-source fire of
 * heat release `hrrKW`, kW/m² — `q" = χ_r·Q / (4πr²)` (Drysdale; SFPE
 * Engineering Guide for Piloted Ignition of Solid Materials). Only valid in
 * the far field (`rM` beyond roughly 2-3 flame diameters) — this function
 * does not check that, since it has no flame-size model to check it against.
 */
export function pointSourceRadiantFluxKWm2(hrrKW: number, radiativeFraction: number, rM: number): number {
  if (rM <= 0 || hrrKW <= 0) return hrrKW > 0 ? Number.POSITIVE_INFINITY : 0;
  return (radiativeFraction * hrrKW) / (4 * Math.PI * rM * rM);
}

/** Coarsest hazard band a flux falls into, for display — the flux number itself is what a caller should act on. */
export function classifyRadiantFlux(fluxKWm2: number): 'NONE' | 'PAIN' | 'BURN_RISK' | 'IGNITION_RISK' | 'EQUIPMENT_DAMAGE' {
  if (fluxKWm2 >= FLUX_THRESHOLD_KW_M2.EQUIPMENT_DAMAGE) return 'EQUIPMENT_DAMAGE';
  if (fluxKWm2 >= FLUX_THRESHOLD_KW_M2.SECONDARY_IGNITION_CRITICAL) return 'IGNITION_RISK';
  if (fluxKWm2 >= FLUX_THRESHOLD_KW_M2.SECOND_DEGREE_BURN_RISK) return 'BURN_RISK';
  if (fluxKWm2 >= FLUX_THRESHOLD_KW_M2.PAIN_ON_BARE_SKIN) return 'PAIN';
  return 'NONE';
}

// ---------------------------------------------------------------------------
// 3. COMBUSTION PRODUCT MASS — production only, no transport (see module doc).
// ---------------------------------------------------------------------------

/** Cumulative fuel mass burned by `elapsedS`, kg — from cumulative energy released and the fuel's own heat of combustion, capped at the available fuel mass. */
export function massBurnedKg(elapsedS: number, params: FireSourceParams, curve: FireCurve): number {
  const energyKJ = cumulativeEnergyReleasedKJ(elapsedS, params, curve);
  const massKg = energyKJ / (params.fuel.heatOfCombustionMJPerKg * 1000 * params.fuel.combustionEfficiency);
  return Math.min(massKg, params.fuel.fuelMassKg);
}

export interface CombustionProducts {
  readonly massBurnedKg: number;
  readonly sootProducedKg: number;
  readonly coProducedKg: number;
}

export function combustionProductsAt(elapsedS: number, params: FireSourceParams, curve: FireCurve): CombustionProducts {
  const burned = massBurnedKg(elapsedS, params, curve);
  return {
    massBurnedKg: burned,
    sootProducedKg: burned * params.fuel.sootYieldKgPerKg,
    coProducedKg: burned * params.fuel.coYieldKgPerKg,
  };
}

// ---------------------------------------------------------------------------
// FIRE PHASE — a real, solver-computed discrete state (Rule 3: a number, not a guess).
// ---------------------------------------------------------------------------

export const FIRE_PHASE_CODE = { UNIGNITED: 0, GROWTH: 1, STEADY: 2, DECAY: 3, BURNED_OUT: 4 } as const;
export const FIRE_PHASES = ['FIRE_UNIGNITED', 'FIRE_GROWTH', 'FIRE_STEADY', 'FIRE_DECAY', 'FIRE_BURNED_OUT'] as const;
export type FirePhase = (typeof FIRE_PHASES)[number];

export function firePhaseCode(elapsedS: number, curve: FireCurve): number {
  if (elapsedS <= 0) return FIRE_PHASE_CODE.UNIGNITED;
  if (elapsedS >= curve.tBurnoutS) return FIRE_PHASE_CODE.BURNED_OUT;
  if (elapsedS < curve.tGrowthEndS) return FIRE_PHASE_CODE.GROWTH;
  if (elapsedS < curve.tSteadyEndS) return FIRE_PHASE_CODE.STEADY;
  return FIRE_PHASE_CODE.DECAY;
}

export function firePhaseLabel(code: number): FirePhase {
  return FIRE_PHASES[code] ?? 'FIRE_UNIGNITED';
}

// ---------------------------------------------------------------------------
// ECS BINDING
// ---------------------------------------------------------------------------

export interface FireSourceDomainState extends Record<string, number> {
  elapsedS: number;
  growthRateCode: number;
  fuelMassKg: number;
  fuelRemainingKg: number;
  heatOfCombustionMJPerKg: number;
  combustionEfficiency: number;
  radiativeFraction: number;
  sootYieldKgPerKg: number;
  coYieldKgPerKg: number;
  peakHRRkW: number;
  targetDistanceM: number;
  heatReleaseRateKW: number;
  cumulativeEnergyReleasedKJ: number;
  massBurnedKg: number;
  sootProducedKg: number;
  coProducedKg: number;
  radiantFluxAtTargetKWm2: number;
  phaseCode: number;
  fuelLimitedBeforePeak: number;
}

const FIRE_GROWTH_RATE_CODE: Readonly<Record<FireGrowthRate, number>> = Object.freeze({ SLOW: 0, MEDIUM: 1, FAST: 2, ULTRAFAST: 3 });
const FIRE_GROWTH_RATE_BY_CODE: readonly FireGrowthRate[] = ['SLOW', 'MEDIUM', 'FAST', 'ULTRAFAST'];

function growthRateFromCode(code: number): FireGrowthRate {
  return FIRE_GROWTH_RATE_BY_CODE[code] ?? 'MEDIUM';
}

function paramsFromState(state: Partial<FireSourceDomainState> | undefined, defaults: FireSourceParams): { params: FireSourceParams; targetDistanceM: number } {
  const fuel: FuelPackage = {
    label: defaults.fuel.label,
    fuelMassKg: state?.fuelMassKg ?? defaults.fuel.fuelMassKg,
    heatOfCombustionMJPerKg: state?.heatOfCombustionMJPerKg ?? defaults.fuel.heatOfCombustionMJPerKg,
    combustionEfficiency: state?.combustionEfficiency ?? defaults.fuel.combustionEfficiency,
    radiativeFraction: state?.radiativeFraction ?? defaults.fuel.radiativeFraction,
    sootYieldKgPerKg: state?.sootYieldKgPerKg ?? defaults.fuel.sootYieldKgPerKg,
    coYieldKgPerKg: state?.coYieldKgPerKg ?? defaults.fuel.coYieldKgPerKg,
  };
  const params: FireSourceParams = {
    growthRate: state?.growthRateCode !== undefined ? growthRateFromCode(state.growthRateCode) : defaults.growthRate,
    fuel,
    peakHRRkW: state?.peakHRRkW ?? defaults.peakHRRkW,
  };
  return { params, targetDistanceM: state?.targetDistanceM ?? 5 };
}

let stepCounter = 0;

/**
 * One reusable solver bound to one default fire-source configuration.
 * `dt` is expected in seconds. Each tick advances the entity's own elapsed
 * time since ignition (`domainState.elapsedS`) and re-evaluates the
 * closed-form curve at that time — the curve itself is stateless, so this
 * never accumulates integration error the way a numerically-stepped ODE
 * would.
 */
export function makeFireThermalSolver(defaults: FireSourceParams): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<FireSourceDomainState> | undefined;
    const { params, targetDistanceM } = paramsFromState(state, defaults);
    const elapsedS = Math.max(0, (state?.elapsedS ?? 0) + ctx.dt);

    const curve = buildFireCurve(params);
    const hrrKW = heatReleaseRateKW(elapsedS, params, curve);
    const energyKJ = cumulativeEnergyReleasedKJ(elapsedS, params, curve);
    const products = combustionProductsAt(elapsedS, params, curve);
    const fluxKWm2 = pointSourceRadiantFluxKWm2(hrrKW, params.fuel.radiativeFraction, targetDistanceM);
    const phaseCode = firePhaseCode(elapsedS, curve);

    stepCounter += 1;

    const domainState: FireSourceDomainState = {
      elapsedS,
      growthRateCode: FIRE_GROWTH_RATE_CODE[params.growthRate],
      fuelMassKg: params.fuel.fuelMassKg,
      fuelRemainingKg: Math.max(0, params.fuel.fuelMassKg - products.massBurnedKg),
      heatOfCombustionMJPerKg: params.fuel.heatOfCombustionMJPerKg,
      combustionEfficiency: params.fuel.combustionEfficiency,
      radiativeFraction: params.fuel.radiativeFraction,
      sootYieldKgPerKg: params.fuel.sootYieldKgPerKg,
      coYieldKgPerKg: params.fuel.coYieldKgPerKg,
      peakHRRkW: params.peakHRRkW,
      targetDistanceM,
      heatReleaseRateKW: hrrKW,
      cumulativeEnergyReleasedKJ: energyKJ,
      massBurnedKg: products.massBurnedKg,
      sootProducedKg: products.sootProducedKg,
      coProducedKg: products.coProducedKg,
      radiantFluxAtTargetKWm2: fluxKWm2,
      phaseCode,
      fuelLimitedBeforePeak: curve.fuelLimitedBeforePeak ? 1 : 0,
    };

    const observation: Observation = {
      observationId: `fire-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: t=${elapsedS.toFixed(0)}s, HRR=${hrrKW.toFixed(0)}kW, flux@${targetDistanceM.toFixed(1)}m=${fluxKWm2.toFixed(1)}kW/m² (${firePhaseLabel(phaseCode)})`,
      measurements: [
        { key: 'heatReleaseRateKW', value: hrrKW, unit: 'kW', tick: ctx.tick, entity: entity.ref, provenance: ['domains/fireThermal.ts#heatReleaseRateKW', 'nfpa-921-t-squared-design-fire'] },
        { key: 'cumulativeEnergyReleasedKJ', value: energyKJ, unit: 'kJ', tick: ctx.tick, entity: entity.ref, provenance: ['domains/fireThermal.ts#cumulativeEnergyReleasedKJ'] },
        { key: 'radiantFluxAtTargetKWm2', value: fluxKWm2, unit: 'kW/m2', tick: ctx.tick, entity: entity.ref, provenance: ['domains/fireThermal.ts#pointSourceRadiantFluxKWm2', 'sfpe-point-source-radiation-model'] },
        { key: 'massBurnedKg', value: products.massBurnedKg, unit: 'kg', tick: ctx.tick, entity: entity.ref, provenance: ['domains/fireThermal.ts#massBurnedKg'] },
      ],
      provenance: ['domains/fireThermal.ts', 'nfpa-921-t-squared-design-fire', 'sfpe-point-source-radiation-model', 'energy-conservation'],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `fire-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'fire.thermal.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 't-squared-growth-and-point-source-radiation',
      parameters: { ...domainState },
      provenance: {
        origin: 'model',
        modelId: FIRE_THERMAL_SOLVER_ID,
        notes: 'NFPA 921/SFPE t-squared design-fire HRR curve, energy-conserving fuel-limited peak/decay, and SFPE point-source radiant heat flux. No spread, no compartment dynamics, no structural response, no smoke transport.',
      },
    };

    return {
      patch: {
        domainState,
        statusLabel: `${firePhaseLabel(phaseCode)}: ${hrrKW.toFixed(0)}kW`,
      },
      // Real published t-squared HRR relation + real energy conservation + real point-source
      // radiation formula, but growth class, peak HRR, and fuel properties are literature-typical
      // design values, not measured/calibrated for a specific real fire — the same honest middle
      // ground as chemistryKinetics.ts and hydraulicsPumpPipe.ts's empirical-model outputs.
      grounding: 'MODEL_ESTIMATE' as GroundingLevel,
      observation,
      event,
    };
  };
}

export interface AddFireSourceOptions {
  fireId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: FireSourceParams;
  targetDistanceM?: number;
}

export function addFireSource(graph: WorldGraph, options: AddFireSourceOptions = {}): EntityId {
  const ref = { kind: 'fire-source', id: options.fireId ?? 'fire-1' };
  const params = options.params ?? { growthRate: 'MEDIUM', fuel: FUEL_PACKAGES.UPHOLSTERED_FURNITURE, peakHRRkW: 1500 };
  const targetDistanceM = options.targetDistanceM ?? 5;
  const domainState: FireSourceDomainState = {
    elapsedS: 0,
    growthRateCode: FIRE_GROWTH_RATE_CODE[params.growthRate],
    fuelMassKg: params.fuel.fuelMassKg,
    fuelRemainingKg: params.fuel.fuelMassKg,
    heatOfCombustionMJPerKg: params.fuel.heatOfCombustionMJPerKg,
    combustionEfficiency: params.fuel.combustionEfficiency,
    radiativeFraction: params.fuel.radiativeFraction,
    sootYieldKgPerKg: params.fuel.sootYieldKgPerKg,
    coYieldKgPerKg: params.fuel.coYieldKgPerKg,
    peakHRRkW: params.peakHRRkW,
    targetDistanceM,
    heatReleaseRateKW: 0,
    cumulativeEnergyReleasedKJ: 0,
    massBurnedKg: 0,
    sootProducedKg: 0,
    coProducedKg: 0,
    radiantFluxAtTargetKWm2: 0,
    phaseCode: FIRE_PHASE_CODE.UNIGNITED,
    fuelLimitedBeforePeak: 0,
  };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? params.fuel.label,
    scale: { level: 'MESO_LAB', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState,
    domainBinding: { solverId: FIRE_THERMAL_SOLVER_ID, domainId: FIRE_THERMAL_DOMAIN_ID },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export interface FireWorldOptions {
  siteId?: string;
  params?: FireSourceParams;
  targetDistanceM?: number;
}

export interface FireWorld {
  graph: WorldGraph;
  siteId: EntityId;
  fireSourceId: EntityId;
}

/** Standalone scenario: a site container (MESO_LAB) with one fire source bound to the real t-squared/point-source solver. */
export function buildFireWorld(options: FireWorldOptions = {}): FireWorld {
  const graph = new WorldGraph();
  const siteRef = { kind: 'fire-site', id: options.siteId ?? 'fire-site-1' };
  const site: WorldModelEntity = {
    id: entityId(siteRef),
    ref: siteRef,
    label: 'Fire Site',
    scale: { level: 'MESO_LAB' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    grounding: 'UNGROUNDED_APPROXIMATION', // a container, not something any solver advances directly
    updatedAtTick: 0,
  };
  graph.addEntity(site);
  const fireSourceId = addFireSource(graph, { parentEntityId: site.id, params: options.params, targetDistanceM: options.targetDistanceM });
  return { graph, siteId: site.id, fireSourceId };
}
