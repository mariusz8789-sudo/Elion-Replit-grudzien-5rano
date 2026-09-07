import { describe, expect, it } from 'vitest';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import {
  buildFireCurve,
  buildFireWorld,
  classifyRadiantFlux,
  combustionProductsAt,
  cumulativeEnergyReleasedKJ,
  FIRE_GROWTH_TIME_S,
  FIRE_PHASE_CODE,
  FIRE_THERMAL_SOLVER_ID,
  firePhaseCode,
  FLUX_THRESHOLD_KW_M2,
  FUEL_PACKAGES,
  heatReleaseRateKW,
  makeFireThermalSolver,
  pointSourceRadiantFluxKWm2,
  REFERENCE_HRR_KW,
  tSquaredGrowthKW,
  type FireSourceParams,
} from '../core/worldModel/domains/fireThermal';

/**
 * FIRE / THERMAL — a real NFPA 921/SFPE t-squared heat-release-rate curve,
 * energy-conserving fuel inventory, and SFPE point-source radiant heat
 * transfer for a single fire source. `solverCapability.ts` named this gap
 * for WILDFIRE/INDUSTRIAL_FIRE; these tests pin down the first honest slice.
 */
describe('t-squared heat-release-rate growth (NFPA 921 / SFPE Handbook)', () => {
  it('reaches exactly the reference HRR at the published characteristic growth time for each class', () => {
    for (const growthRate of ['SLOW', 'MEDIUM', 'FAST', 'ULTRAFAST'] as const) {
      const tg = FIRE_GROWTH_TIME_S[growthRate];
      expect(tSquaredGrowthKW(tg, growthRate)).toBeCloseTo(REFERENCE_HRR_KW, 6);
    }
  });

  it('is zero at ignition and grows monotonically with the square of elapsed time', () => {
    expect(tSquaredGrowthKW(0, 'MEDIUM')).toBe(0);
    const q1 = tSquaredGrowthKW(100, 'MEDIUM');
    const q2 = tSquaredGrowthKW(200, 'MEDIUM');
    expect(q2).toBeCloseTo(q1 * 4, 6); // doubling time -> 4x heat release, the defining t^2 signature
  });

  it('faster growth classes reach a given HRR sooner', () => {
    const target = 500;
    for (const [slower, faster] of [['SLOW', 'MEDIUM'], ['MEDIUM', 'FAST'], ['FAST', 'ULTRAFAST']] as const) {
      const tSlower = FIRE_GROWTH_TIME_S[slower] * Math.sqrt(target / REFERENCE_HRR_KW);
      const tFaster = FIRE_GROWTH_TIME_S[faster] * Math.sqrt(target / REFERENCE_HRR_KW);
      expect(tFaster).toBeLessThan(tSlower);
    }
  });
});

describe('Energy-conserving fire curve (growth / steady / decay)', () => {
  const params: FireSourceParams = { growthRate: 'MEDIUM', fuel: FUEL_PACKAGES.UPHOLSTERED_FURNITURE, peakHRRkW: 1500 };

  it('the full-curve integral equals the fuel-bounded total energy, to numerical precision', () => {
    const curve = buildFireCurve(params);
    expect(curve.fuelLimitedBeforePeak).toBe(false);
    const integrated = cumulativeEnergyReleasedKJ(curve.tBurnoutS, params, curve);
    expect(integrated).toBeCloseTo(curve.totalEnergyKJ, 0);
  });

  it('HRR is continuous across phase boundaries: reaches peak, holds it, then decays linearly to zero', () => {
    const curve = buildFireCurve(params);
    expect(heatReleaseRateKW(curve.tGrowthEndS, params, curve)).toBeCloseTo(params.peakHRRkW, 1);
    if (curve.tSteadyEndS > curve.tGrowthEndS) {
      const mid = (curve.tGrowthEndS + curve.tSteadyEndS) / 2;
      expect(heatReleaseRateKW(mid, params, curve)).toBeCloseTo(params.peakHRRkW, 1);
    }
    expect(heatReleaseRateKW(curve.tBurnoutS, params, curve)).toBe(0);
    expect(heatReleaseRateKW(curve.tBurnoutS + 100, params, curve)).toBe(0);
    // Decay is linear: the midpoint of the decay phase sits at half the peak.
    const decayMid = curve.tSteadyEndS + curve.tDecayS / 2;
    expect(heatReleaseRateKW(decayMid, params, curve)).toBeCloseTo(params.peakHRRkW / 2, 0);
  });

  it('a small fuel load burns out during growth, honestly, before ever reaching the stated design peak', () => {
    const smallFuel = { ...FUEL_PACKAGES.WOOD_CRIB, fuelMassKg: 0.5 };
    const smallParams: FireSourceParams = { growthRate: 'FAST', fuel: smallFuel, peakHRRkW: 5000 };
    const curve = buildFireCurve(smallParams);
    expect(curve.fuelLimitedBeforePeak).toBe(true);
    expect(curve.tDecayS).toBe(0);
    // It never gets anywhere near the stated design peak.
    expect(heatReleaseRateKW(curve.tGrowthEndS, smallParams, curve)).toBeLessThan(smallParams.peakHRRkW);
    const integrated = cumulativeEnergyReleasedKJ(curve.tBurnoutS, smallParams, curve);
    expect(integrated).toBeCloseTo(curve.totalEnergyKJ, 0);
  });

  it('a bigger fuel mass burns for longer, all else equal', () => {
    const small = buildFireCurve({ ...params, fuel: { ...params.fuel, fuelMassKg: 10 } });
    const big = buildFireCurve({ ...params, fuel: { ...params.fuel, fuelMassKg: 100 } });
    expect(big.tBurnoutS).toBeGreaterThan(small.tBurnoutS);
  });

  it('fire phase codes step through UNIGNITED -> GROWTH -> STEADY -> DECAY -> BURNED_OUT in order', () => {
    const curve = buildFireCurve(params);
    expect(firePhaseCode(0, curve)).toBe(FIRE_PHASE_CODE.UNIGNITED);
    expect(firePhaseCode(curve.tGrowthEndS / 2, curve)).toBe(FIRE_PHASE_CODE.GROWTH);
    if (curve.tSteadyEndS > curve.tGrowthEndS) {
      expect(firePhaseCode((curve.tGrowthEndS + curve.tSteadyEndS) / 2, curve)).toBe(FIRE_PHASE_CODE.STEADY);
    }
    expect(firePhaseCode(curve.tSteadyEndS + curve.tDecayS / 2, curve)).toBe(FIRE_PHASE_CODE.DECAY);
    expect(firePhaseCode(curve.tBurnoutS + 1, curve)).toBe(FIRE_PHASE_CODE.BURNED_OUT);
  });
});

describe('SFPE point-source radiant heat flux', () => {
  it('follows the inverse-square law: doubling distance quarters the flux', () => {
    const fluxAt5m = pointSourceRadiantFluxKWm2(2000, 0.3, 5);
    const fluxAt10m = pointSourceRadiantFluxKWm2(2000, 0.3, 10);
    expect(fluxAt5m).toBeCloseTo(fluxAt10m * 4, 6);
  });

  it('scales linearly with HRR and with radiative fraction', () => {
    const base = pointSourceRadiantFluxKWm2(1000, 0.3, 8);
    expect(pointSourceRadiantFluxKWm2(2000, 0.3, 8)).toBeCloseTo(base * 2, 6);
    expect(pointSourceRadiantFluxKWm2(1000, 0.6, 8)).toBeCloseTo(base * 2, 6);
  });

  it('classifies flux into the published hazard bands correctly', () => {
    expect(classifyRadiantFlux(0.5)).toBe('NONE');
    expect(classifyRadiantFlux(FLUX_THRESHOLD_KW_M2.PAIN_ON_BARE_SKIN + 0.1)).toBe('PAIN');
    expect(classifyRadiantFlux(FLUX_THRESHOLD_KW_M2.SECOND_DEGREE_BURN_RISK + 0.1)).toBe('BURN_RISK');
    expect(classifyRadiantFlux(FLUX_THRESHOLD_KW_M2.SECONDARY_IGNITION_CRITICAL + 0.1)).toBe('IGNITION_RISK');
    expect(classifyRadiantFlux(FLUX_THRESHOLD_KW_M2.EQUIPMENT_DAMAGE + 0.1)).toBe('EQUIPMENT_DAMAGE');
  });
});

describe('Combustion product mass (production, not transport)', () => {
  const params: FireSourceParams = { growthRate: 'MEDIUM', fuel: FUEL_PACKAGES.FLAMMABLE_LIQUID_POOL, peakHRRkW: 8000 };

  it('mass burned never exceeds the fuel mass, and reaches it at burnout', () => {
    const curve = buildFireCurve(params);
    const atBurnout = combustionProductsAt(curve.tBurnoutS, params, curve);
    expect(atBurnout.massBurnedKg).toBeCloseTo(params.fuel.fuelMassKg, 0);
    expect(combustionProductsAt(curve.tBurnoutS + 1000, params, curve).massBurnedKg).toBeLessThanOrEqual(params.fuel.fuelMassKg + 1e-6);
  });

  it('soot and CO scale with mass burned via the fuel\'s own published yield factors', () => {
    const curve = buildFireCurve(params);
    const mid = curve.tGrowthEndS / 2;
    const products = combustionProductsAt(mid, params, curve);
    expect(products.sootProducedKg).toBeCloseTo(products.massBurnedKg * params.fuel.sootYieldKgPerKg, 6);
    expect(products.coProducedKg).toBeCloseTo(products.massBurnedKg * params.fuel.coYieldKgPerKg, 6);
  });
});

describe('WorldGraph binding', () => {
  it('binds one fire-source entity to the real solver and advances elapsed time / HRR / flux each tick', () => {
    const params: FireSourceParams = { growthRate: 'FAST', fuel: FUEL_PACKAGES.UPHOLSTERED_FURNITURE, peakHRRkW: 1000 };
    const world = buildFireWorld({ params, targetDistanceM: 4 });
    const router = new SolverRouter();
    router.register(FIRE_THERMAL_SOLVER_ID, makeFireThermalSolver(params));

    const report = router.routeTick(world.graph, 60, 1);
    expect(report.ungrounded).not.toContain(world.fireSourceId);
    expect(report.updated).toContain(world.fireSourceId);

    const entity = world.graph.getEntity(world.fireSourceId);
    expect(entity.grounding).toBe('MODEL_ESTIMATE');
    expect(entity.domainState?.elapsedS).toBeCloseTo(60, 6);
    expect(entity.domainState?.heatReleaseRateKW).toBeGreaterThan(0);
    expect(entity.domainState?.radiantFluxAtTargetKWm2).toBeGreaterThan(0);
    expect(report.observations.length).toBe(1);
    expect(report.events[0].type).toBe('fire.thermal.step');

    // A second tick advances elapsed time further and keeps everything finite.
    router.routeTick(world.graph, 60, 2);
    const after = world.graph.getEntity(world.fireSourceId);
    expect(after.domainState?.elapsedS).toBeCloseTo(120, 6);
    expect(Number.isFinite(after.domainState?.heatReleaseRateKW)).toBe(true);
  });

  it('a fire eventually burns out and reports zero HRR without going negative or NaN', () => {
    const smallFuel = { ...FUEL_PACKAGES.WOOD_CRIB, fuelMassKg: 2 };
    const params: FireSourceParams = { growthRate: 'ULTRAFAST', fuel: smallFuel, peakHRRkW: 500 };
    const world = buildFireWorld({ params });
    const router = new SolverRouter();
    router.register(FIRE_THERMAL_SOLVER_ID, makeFireThermalSolver(params));

    for (let tick = 0; tick < 50; tick++) router.routeTick(world.graph, 30, tick + 1);

    const entity = world.graph.getEntity(world.fireSourceId);
    expect(entity.domainState?.heatReleaseRateKW).toBe(0);
    expect(entity.domainState?.phaseCode).toBe(FIRE_PHASE_CODE.BURNED_OUT);
    expect(entity.domainState?.fuelRemainingKg).toBeGreaterThanOrEqual(0);
  });
});
