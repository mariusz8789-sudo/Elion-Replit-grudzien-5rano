import { describe, expect, it } from 'vitest';
import {
  buildDroughtWorld,
  DROUGHT_SEVERITY_CODE,
  DROUGHT_SEVERITY_STATES,
  DROUGHT_SOLVER_ID,
  droughtSeverityCode,
  droughtSeverityLabel,
  makeDroughtWaterBalanceSolver,
  soilMoistureFractionOfCapacity,
  stepWaterBalance,
  WATER_BALANCE_DEFAULTS,
  type WaterBalanceParams,
} from '../core/worldModel/domains/drought';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';

/**
 * DROUGHT — a real Thornthwaite-Mather (1955) soil-moisture water balance,
 * extending the same hydrology `rainfallRunoff.ts` already models.
 * `solverCapability.ts` named this gap as "water balance and drought index";
 * these tests pin down the real accounting and the honestly-scoped index.
 */
describe('Thornthwaite-Mather water balance: exact bucket accounting', () => {
  it('conserves water exactly: P = AET + delta-storage + Runoff', () => {
    const params: WaterBalanceParams = { precipitationMmPerDay: 10, potentialEvapotranspirationMmPerDay: 3, fieldCapacityMm: 100, soilMoistureMm: 50 };
    const dtDays = 2;
    const step = stepWaterBalance(params, dtDays);
    const precipMm = params.precipitationMmPerDay * dtDays;
    const deltaStorageMm = step.soilMoistureMm - params.soilMoistureMm;
    const aetMm = step.actualEvapotranspirationMmPerDay * dtDays;
    expect(precipMm).toBeCloseTo(aetMm + deltaStorageMm + step.runoffMm, 6);
  });

  it('when demand exceeds supply, AET is capped at what is actually available — never the full potential rate', () => {
    const params: WaterBalanceParams = { precipitationMmPerDay: 0, potentialEvapotranspirationMmPerDay: 10, fieldCapacityMm: 100, soilMoistureMm: 2 };
    const step = stepWaterBalance(params, 1);
    expect(step.actualEvapotranspirationMmPerDay).toBeCloseTo(2, 6); // only the 2mm that existed
    expect(step.soilMoistureMm).toBe(0); // drained, never negative
    expect(step.deficitMm).toBeCloseTo(8, 6); // 10 potential - 2 actual
  });

  it('when supply exceeds demand and field capacity, the excess becomes runoff, never overfilling storage', () => {
    const params: WaterBalanceParams = { precipitationMmPerDay: 50, potentialEvapotranspirationMmPerDay: 2, fieldCapacityMm: 100, soilMoistureMm: 90 };
    const step = stepWaterBalance(params, 1);
    expect(step.soilMoistureMm).toBeCloseTo(100, 6); // capped at field capacity
    expect(step.actualEvapotranspirationMmPerDay).toBeCloseTo(2, 6); // full potential rate was met
    expect(step.runoffMm).toBeCloseTo(90 + 50 - 2 - 100, 6); // whatever didn't fit
    expect(step.deficitMm).toBeCloseTo(0, 6);
  });

  it('zero dt is a no-op — no water appears or disappears', () => {
    const params: WaterBalanceParams = { precipitationMmPerDay: 100, potentialEvapotranspirationMmPerDay: 100, fieldCapacityMm: 100, soilMoistureMm: 50 };
    const step = stepWaterBalance(params, 0);
    expect(step.soilMoistureMm).toBe(50);
    expect(step.runoffMm).toBe(0);
    expect(step.deficitMm).toBe(0);
  });

  it('a sustained dry spell with no rain steadily depletes soil moisture toward zero', () => {
    let params: WaterBalanceParams = { ...WATER_BALANCE_DEFAULTS, precipitationMmPerDay: 0 };
    let last = params.soilMoistureMm;
    for (let day = 0; day < 60; day++) {
      const step = stepWaterBalance(params, 1);
      expect(step.soilMoistureMm).toBeLessThanOrEqual(last);
      last = step.soilMoistureMm;
      params = { ...params, soilMoistureMm: step.soilMoistureMm };
    }
    expect(last).toBe(0); // fully depleted well before 60 days at 4mm/day PET from a 150mm capacity
  });
});

describe('Soil moisture fraction and drought severity classification', () => {
  it('fraction is bounded [0,1] and degrades gracefully for a non-positive field capacity', () => {
    expect(soilMoistureFractionOfCapacity(50, 100)).toBeCloseTo(0.5, 6);
    expect(soilMoistureFractionOfCapacity(150, 100)).toBe(1); // clamped, never above full
    expect(soilMoistureFractionOfCapacity(50, 0)).toBe(0);
    expect(soilMoistureFractionOfCapacity(50, -10)).toBe(0);
  });

  it('severity codes step through the bands in the right direction as moisture falls', () => {
    expect(droughtSeverityCode(0.9)).toBe(DROUGHT_SEVERITY_CODE.NORMAL);
    expect(droughtSeverityCode(0.5)).toBe(DROUGHT_SEVERITY_CODE.ABNORMALLY_DRY);
    expect(droughtSeverityCode(0.3)).toBe(DROUGHT_SEVERITY_CODE.MODERATE_DROUGHT);
    expect(droughtSeverityCode(0.1)).toBe(DROUGHT_SEVERITY_CODE.SEVERE_DROUGHT);
    expect(droughtSeverityCode(0.01)).toBe(DROUGHT_SEVERITY_CODE.EXTREME_DROUGHT);
  });

  it('is a total function: every code and every out-of-range input still lands inside the allowlist', () => {
    for (const nonsense of [-1, 99, Number.NaN]) expect(DROUGHT_SEVERITY_STATES).toContain(droughtSeverityLabel(nonsense));
    expect(droughtSeverityCode(Number.NaN)).toBe(DROUGHT_SEVERITY_CODE.NORMAL);
  });
});

describe('WorldGraph binding', () => {
  it('binds one drought-catchment entity to the real solver and advances soil moisture each tick', () => {
    const world = buildDroughtWorld({ params: { precipitationMmPerDay: 0 } });
    const router = new SolverRouter();
    router.register(DROUGHT_SOLVER_ID, makeDroughtWaterBalanceSolver());

    const oneDaySeconds = 86400;
    const report = router.routeTick(world.graph, oneDaySeconds, 1);
    expect(report.ungrounded).not.toContain(world.catchmentId);
    expect(report.updated).toContain(world.catchmentId);

    const entity = world.graph.getEntity(world.catchmentId);
    expect(entity.grounding).toBe('MODEL_ESTIMATE');
    // No rain, one day of ET at the default rate: soil moisture drops by ~4mm from the full 150mm.
    expect(entity.domainState?.soilMoistureMm).toBeLessThan(150);
    expect(entity.domainState?.soilMoistureMm).toBeGreaterThan(140);
    expect(report.observations.length).toBe(1);
    expect(report.events[0].type).toBe('environment.drought.step');
  });

  it('a long dry spell drives the catchment through the drought severity bands, and rain recovers it', () => {
    const world = buildDroughtWorld({ params: { precipitationMmPerDay: 0 } });
    const router = new SolverRouter();
    router.register(DROUGHT_SOLVER_ID, makeDroughtWaterBalanceSolver());
    const oneDaySeconds = 86400;

    for (let day = 0; day < 45; day++) router.routeTick(world.graph, oneDaySeconds, day + 1);
    const dried = world.graph.getEntity(world.catchmentId).domainState!;
    expect(dried.severityCode).toBeGreaterThan(DROUGHT_SEVERITY_CODE.NORMAL);
    expect(dried.cumulativeMoistureDeficitMm).toBeGreaterThan(0);

    // Heavy, sustained rain more than replaces the deficit.
    world.graph.updateEntity(world.catchmentId, { domainState: { ...world.graph.getEntity(world.catchmentId).domainState, precipitationMmPerDay: 50 } });
    for (let day = 45; day < 50; day++) router.routeTick(world.graph, oneDaySeconds, day + 1);
    const recovered = world.graph.getEntity(world.catchmentId).domainState!;
    expect(recovered.severityCode).toBe(DROUGHT_SEVERITY_CODE.NORMAL);
    expect(recovered.soilMoistureMm).toBeCloseTo(recovered.fieldCapacityMm as number, 1);
    // Full recharge resolves the tracked deficit — the same "event" convention drought monitoring uses.
    expect(recovered.cumulativeMoistureDeficitMm).toBe(0);
  });
});
