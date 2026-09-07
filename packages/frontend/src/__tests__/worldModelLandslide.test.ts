import { describe, expect, it } from 'vitest';
import type { TerrainHeightfield } from '../core/worldModel/domains/floodInundation';
import {
  addLandslide,
  buildLandslideWorld,
  buildSlopeStabilityField,
  DEFAULT_SOIL_PARAMS,
  infiniteSlopeFactorOfSafety,
  LANDSLIDE_SOLVER_ID,
  LANDSLIDE_STABILITY_CODE,
  LANDSLIDE_STABILITY_STATES,
  landslideStabilityCode,
  landslideStabilityLabel,
  makeLandslideSolver,
  runoutAreaM2,
  simulateLandslideRunout,
  slidingBlockVelocitySquaredDelta,
  steepestDescentSlopeRad,
  traceRunoutPath,
  type SoilParams,
} from '../core/worldModel/domains/landslide';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';

/**
 * LANDSLIDE — infinite-slope factor of safety plus a sliding-block Coulomb
 * runout, on the SAME `TerrainHeightfield` `floodInundation.ts` and
 * `wildfireSpread.ts` already use. `solverCapability.ts` named this gap as
 * "slope stability and runout"; these tests pin down the real physics, the
 * real termination guarantees, and the honest edge cases.
 */

/** A uniform planar slope: elevation falls by `dropPerCellM` with each column index. */
function planarSlope(cols = 20, rows = 5, cellSizeM = 10, dropPerCellM = 5): TerrainHeightfield {
  const elevationsM = new Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) elevationsM[y * cols + x] = (cols - x) * dropPerCellM;
  return { cols, rows, cellSizeM, elevationsM, surveyed: false, provenance: 'test fixture: uniform planar slope' };
}

/** A steep slope that runs out onto a flat plain at column `breakAtCol` — the classic runout geometry. */
function slopeOntoPlain(cols = 30, rows = 5, cellSizeM = 10, dropPerCellM = 8, breakAtCol = 10): TerrainHeightfield {
  const elevationsM = new Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      elevationsM[y * cols + x] = x < breakAtCol ? (breakAtCol - x) * dropPerCellM : 0;
    }
  }
  return { cols, rows, cellSizeM, elevationsM, surveyed: false, provenance: 'test fixture: steep slope onto a flat plain' };
}

function flatTerrain(cols = 10, rows = 10, cellSizeM = 10): TerrainHeightfield {
  return { cols, rows, cellSizeM, elevationsM: new Array(cols * rows).fill(0), surveyed: false, provenance: 'test fixture: flat' };
}

describe('Infinite-slope factor of safety', () => {
  it('flat ground is trivially stable — no driving shear stress, no NaN', () => {
    const fs = infiniteSlopeFactorOfSafety(0, DEFAULT_SOIL_PARAMS);
    expect(Number.isFinite(fs)).toBe(true);
    expect(fs).toBeGreaterThan(1.5);
  });

  it('factor of safety falls monotonically as the slope steepens', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const degrees of [5, 15, 25, 35, 45, 60]) {
      const fs = infiniteSlopeFactorOfSafety((degrees * Math.PI) / 180, DEFAULT_SOIL_PARAMS);
      expect(fs).toBeLessThan(previous);
      previous = fs;
    }
  });

  it('a cohesionless soil fails exactly when the slope angle passes the friction angle — the model\'s defining property', () => {
    const cohesionless: SoilParams = { ...DEFAULT_SOIL_PARAMS, cohesionKPa: 0, frictionAngleDegrees: 30, groundwaterRatio: 0 };
    const justBelow = infiniteSlopeFactorOfSafety((29.5 * Math.PI) / 180, cohesionless);
    const atAngle = infiniteSlopeFactorOfSafety((30 * Math.PI) / 180, cohesionless);
    const justAbove = infiniteSlopeFactorOfSafety((30.5 * Math.PI) / 180, cohesionless);
    expect(justBelow).toBeGreaterThan(1);
    expect(atAngle).toBeCloseTo(1, 6); // FS = tan(phi)/tan(beta) exactly, for c'=0 and dry conditions
    expect(justAbove).toBeLessThan(1);
  });

  it('cohesion adds real strength: the same slope is safer with cohesive soil', () => {
    const slopeRad = (32 * Math.PI) / 180;
    const cohesionless = infiniteSlopeFactorOfSafety(slopeRad, { ...DEFAULT_SOIL_PARAMS, cohesionKPa: 0 });
    const cohesive = infiniteSlopeFactorOfSafety(slopeRad, { ...DEFAULT_SOIL_PARAMS, cohesionKPa: 10 });
    expect(cohesive).toBeGreaterThan(cohesionless);
  });

  it('saturation reduces the factor of safety through real pore pressure, never increases it', () => {
    const slopeRad = (30 * Math.PI) / 180;
    const dry = infiniteSlopeFactorOfSafety(slopeRad, { ...DEFAULT_SOIL_PARAMS, groundwaterRatio: 0 });
    const half = infiniteSlopeFactorOfSafety(slopeRad, { ...DEFAULT_SOIL_PARAMS, groundwaterRatio: 0.5 });
    const saturated = infiniteSlopeFactorOfSafety(slopeRad, { ...DEFAULT_SOIL_PARAMS, groundwaterRatio: 1 });
    expect(half).toBeLessThan(dry);
    expect(saturated).toBeLessThan(half);
  });

  it('stability bands are a total function over the allowlist', () => {
    expect(landslideStabilityCode(2)).toBe(LANDSLIDE_STABILITY_CODE.STABLE);
    expect(landslideStabilityCode(1.2)).toBe(LANDSLIDE_STABILITY_CODE.MARGINAL);
    expect(landslideStabilityCode(0.8)).toBe(LANDSLIDE_STABILITY_CODE.UNSTABLE);
    for (const nonsense of [-1, 99, Number.NaN]) expect(LANDSLIDE_STABILITY_STATES).toContain(landslideStabilityLabel(landslideStabilityCode(nonsense)));
  });
});

describe('Slope angle comes from the real terrain (D8 steepest descent)', () => {
  it('recovers the true angle of a uniform planar slope', () => {
    const terrain = planarSlope(20, 5, 10, 5); // 5 m drop per 10 m cell => 26.57 degrees
    const expectedRad = Math.atan(5 / 10);
    const index = 2 * 20 + 10;
    expect(steepestDescentSlopeRad(terrain, index)).toBeCloseTo(expectedRad, 6);
  });

  it('is zero on flat ground — no downhill neighbour exists', () => {
    expect(steepestDescentSlopeRad(flatTerrain(), 5 * 10 + 5)).toBe(0);
  });

  it('a steep slope produces unstable cells; flat ground produces none', () => {
    const steep = buildSlopeStabilityField(planarSlope(20, 5, 10, 12), DEFAULT_SOIL_PARAMS);
    const flat = buildSlopeStabilityField(flatTerrain(), DEFAULT_SOIL_PARAMS);
    expect(steep.unstableCellIndices.length).toBeGreaterThan(0);
    expect(flat.unstableCellIndices.length).toBe(0);
  });
});

describe('Sliding-block energy balance', () => {
  it('gains energy when the drop exceeds friction\'s demand, loses it when friction wins', () => {
    const mu = Math.tan((20 * Math.PI) / 180);
    // A step dropping 8 m over 10 m horizontally: tan(slope)=0.8 > mu=0.36, so it accelerates.
    expect(slidingBlockVelocitySquaredDelta(8, 10, mu)).toBeGreaterThan(0);
    // A step dropping 1 m over 10 m: tan(slope)=0.1 < mu, so friction dominates and it decelerates.
    expect(slidingBlockVelocitySquaredDelta(1, 10, mu)).toBeLessThan(0);
  });

  it('is exactly neutral when the slope equals the friction angle — the angle-of-reach condition', () => {
    const frictionAngleDeg = 25;
    const mu = Math.tan((frictionAngleDeg * Math.PI) / 180);
    const planarDistanceM = 10;
    const dropAtFrictionAngle = planarDistanceM * mu; // a slope exactly at the friction angle
    expect(slidingBlockVelocitySquaredDelta(dropAtFrictionAngle, planarDistanceM, mu)).toBeCloseTo(0, 9);
  });

  it('matches the closed-form free-slide velocity on a frictionless drop (v^2 = 2*g*h)', () => {
    expect(slidingBlockVelocitySquaredDelta(10, 25, 0)).toBeCloseTo(2 * 9.81 * 10, 6);
  });
});

describe('Runout path tracing', () => {
  it('accelerates down a steep slope and reaches a real, finite velocity', () => {
    const terrain = planarSlope(20, 5, 10, 8); // ~38.7 degrees, steeper than the 20 degree runout friction angle
    const { steps } = traceRunoutPath(terrain, DEFAULT_SOIL_PARAMS, 2 * 20 + 2);
    expect(steps.length).toBeGreaterThan(1);
    const finalStep = steps[steps.length - 1];
    expect(finalStep.velocityMS).toBeGreaterThan(0);
    expect(Number.isFinite(finalStep.velocityMS)).toBe(true);
    // Velocity is non-decreasing while the slope stays steeper than the friction angle.
    for (let i = 2; i < steps.length; i++) expect(steps[i].velocityMS).toBeGreaterThanOrEqual(steps[i - 1].velocityMS - 1e-9);
  });

  it('EDGE CASE: on a slope shallower than the runout friction angle, the mass never moves at all', () => {
    // 1 m drop per 10 m cell = 5.7 degrees, far below the 20 degree runout friction angle.
    const terrain = planarSlope(20, 5, 10, 1);
    const { steps, termination } = traceRunoutPath(terrain, DEFAULT_SOIL_PARAMS, 2 * 20 + 2);
    // It takes one step, arrives with zero velocity, and stops: friction consumed all the gravity energy.
    expect(steps[steps.length - 1].velocityMS).toBe(0);
    expect(steps.length).toBe(2);
    expect(termination).toBe('STOPPED');
  });

  it('EDGE CASE: a mass running out onto flat ground carries its momentum, decelerates, and stops inside the area', () => {
    // A long enough plain that the mass genuinely comes to rest within the modelled grid.
    const terrain = slopeOntoPlain(80, 5, 10, 12, 10);
    const { steps, termination } = traceRunoutPath(terrain, DEFAULT_SOIL_PARAMS, 2 * 80 + 1);
    const finalStep = steps[steps.length - 1];
    expect(termination).toBe('STOPPED');
    expect(finalStep.velocityMS).toBe(0); // it really stopped, rather than coasting off the grid
    expect(Number.isFinite(finalStep.distanceFromSourceM)).toBe(true);
    // The whole point: it kept going PAST the slope break rather than stopping dead there.
    const slopeBreakDistanceM = 9 * 10;
    expect(finalStep.distanceFromSourceM).toBeGreaterThan(slopeBreakDistanceM);
    const peakVelocity = Math.max(...steps.map((s) => s.velocityMS));
    expect(peakVelocity).toBeGreaterThan(0); // it accelerated on the slope first
  });

  it('HONESTY: a mass that leaves the grid still moving is reported as truncated, never as a real stop', () => {
    // Same slope, plain too short to absorb the kinetic energy: the grid runs out before the physics does.
    const terrain = slopeOntoPlain(30, 5, 10, 12, 10);
    const { steps, termination } = traceRunoutPath(terrain, DEFAULT_SOIL_PARAMS, 2 * 30 + 1);
    expect(termination).toBe('LEFT_MODELLED_AREA');
    expect(steps[steps.length - 1].velocityMS).toBeGreaterThan(0); // still moving when the model lost sight of it
  });

  it('TERMINATION: every step moves strictly downhill, so no cell is ever revisited and the path is bounded', () => {
    const terrain = planarSlope(20, 5, 10, 8);
    const { steps } = traceRunoutPath(terrain, DEFAULT_SOIL_PARAMS, 2 * 20 + 1);
    const seen = new Set<number>();
    let previousElevation = Number.POSITIVE_INFINITY;
    for (const step of steps) {
      expect(seen.has(step.cellIndex)).toBe(false);
      seen.add(step.cellIndex);
      const elevation = terrain.elevationsM[step.cellIndex];
      expect(elevation).toBeLessThan(previousElevation);
      previousElevation = elevation;
    }
    expect(steps.length).toBeLessThanOrEqual(terrain.cols * terrain.rows);
  });

  it('TERMINATION: a source on flat ground has nowhere to go and yields a single-cell path', () => {
    const { steps, termination } = traceRunoutPath(flatTerrain(), DEFAULT_SOIL_PARAMS, 5 * 10 + 5);
    expect(steps.length).toBe(1);
    expect(steps[0].velocityMS).toBe(0);
    expect(termination).toBe('STOPPED');
  });

  it('REPRODUCIBILITY: the same terrain and soil always produce a byte-identical path', () => {
    const terrain = planarSlope(20, 5, 10, 8);
    const a = traceRunoutPath(terrain, DEFAULT_SOIL_PARAMS, 2 * 20 + 3);
    const b = traceRunoutPath(terrain, DEFAULT_SOIL_PARAMS, 2 * 20 + 3);
    expect(a).toEqual(b);
  });

  it('a lower runout friction angle carries the mass further — the physics, not a tuning knob', () => {
    const terrain = slopeOntoPlain(40, 5, 10, 12, 10);
    const highFriction = traceRunoutPath(terrain, { ...DEFAULT_SOIL_PARAMS, runoutFrictionAngleDegrees: 30 }, 2 * 40 + 1);
    const lowFriction = traceRunoutPath(terrain, { ...DEFAULT_SOIL_PARAMS, runoutFrictionAngleDegrees: 10 }, 2 * 40 + 1);
    const reach = (p: { steps: readonly { distanceFromSourceM: number }[] }) => p.steps[p.steps.length - 1].distanceFromSourceM;
    expect(reach(lowFriction)).toBeGreaterThan(reach(highFriction));
  });
});

describe('Whole-field runout', () => {
  it('traces one path per unstable cell and reports a real affected area, reach, and peak velocity', () => {
    const terrain = slopeOntoPlain(30, 5, 10, 12, 10);
    const stability = buildSlopeStabilityField(terrain, DEFAULT_SOIL_PARAMS);
    const runout = simulateLandslideRunout(terrain, DEFAULT_SOIL_PARAMS, stability);

    expect(runout.pathsTraced).toBe(stability.unstableCellIndices.length);
    expect(runout.pathsTraced).toBeGreaterThan(0);
    expect(runout.maxVelocityAnywhereMS).toBeGreaterThan(0);
    expect(runout.longestRunoutDistanceM).toBeGreaterThan(0);

    expect(runout.pathsLeavingModelledArea).toBeGreaterThanOrEqual(0);
    const area = runoutAreaM2(runout, terrain, stability);
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThanOrEqual(terrain.cols * terrain.rows * terrain.cellSizeM * terrain.cellSizeM);
  });

  it('a stable (flat) terrain produces no sources, no runout, and no affected area', () => {
    const terrain = flatTerrain();
    const stability = buildSlopeStabilityField(terrain, DEFAULT_SOIL_PARAMS);
    const runout = simulateLandslideRunout(terrain, DEFAULT_SOIL_PARAMS, stability);
    expect(runout.pathsTraced).toBe(0);
    expect(runout.maxVelocityAnywhereMS).toBe(0);
    expect(runoutAreaM2(runout, terrain, stability)).toBe(0);
  });

  it('saturating the soil creates more unstable sources than dry conditions on the same terrain', () => {
    // ~38.7 degrees: this slope holds when dry and fails when saturated — pore pressure alone
    // moves it across the FS=1 line, which is the real mechanism behind rain-triggered landslides.
    const terrain = planarSlope(20, 5, 10, 8);
    const dry = buildSlopeStabilityField(terrain, { ...DEFAULT_SOIL_PARAMS, groundwaterRatio: 0 });
    const wet = buildSlopeStabilityField(terrain, { ...DEFAULT_SOIL_PARAMS, groundwaterRatio: 1 });
    expect(dry.unstableCellIndices.length).toBe(0);
    expect(wet.unstableCellIndices.length).toBeGreaterThan(0);
  });
});

describe('WorldGraph binding', () => {
  it('binds one landslide entity to the real solver and reports the real hazard field', () => {
    const terrain = slopeOntoPlain(30, 5, 10, 12, 10);
    const world = buildLandslideWorld({ terrain });
    const router = new SolverRouter();
    router.register(LANDSLIDE_SOLVER_ID, makeLandslideSolver(terrain, DEFAULT_SOIL_PARAMS));

    const report = router.routeTick(world.graph, 1, 1);
    expect(report.ungrounded).not.toContain(world.landslideId);
    expect(report.updated).toContain(world.landslideId);

    const entity = world.graph.getEntity(world.landslideId);
    expect(entity.grounding).toBe('PROCEDURAL_APPROXIMATION'); // synthetic test terrain
    expect(entity.domainState?.unstableCellCount).toBeGreaterThan(0);
    expect(entity.domainState?.minFactorOfSafety).toBeLessThan(1);
    expect(entity.domainState?.maxVelocityAnywhereMS).toBeGreaterThan(0);
    expect(entity.domainState?.stabilityCode).toBe(LANDSLIDE_STABILITY_CODE.UNSTABLE);
    expect(LANDSLIDE_STABILITY_STATES).toContain(entity.statusLabel as (typeof LANDSLIDE_STABILITY_STATES)[number]);
    expect(report.observations.length).toBe(1);
    expect(report.events[0].type).toBe('landslide.stability.step');
  });

  it('a flat site reports a stable slope with no runout, rather than silently nothing', () => {
    const terrain = flatTerrain();
    const graph = new WorldGraph();
    const landslideId = addLandslide(graph, terrain, DEFAULT_SOIL_PARAMS);
    const router = new SolverRouter();
    router.register(LANDSLIDE_SOLVER_ID, makeLandslideSolver(terrain, DEFAULT_SOIL_PARAMS));
    router.routeTick(graph, 1, 1);

    const state = graph.getEntity(landslideId).domainState!;
    expect(state.unstableCellCount).toBe(0);
    expect(state.stabilityCode).toBe(LANDSLIDE_STABILITY_CODE.STABLE);
    expect(state.runoutAreaM2).toBe(0);
  });

  it('REPRODUCIBILITY: two solvers over the same terrain and soil report identical state', () => {
    const terrain = slopeOntoPlain(25, 5, 10, 12, 8);
    const graphA = new WorldGraph();
    const graphB = new WorldGraph();
    const idA = addLandslide(graphA, terrain, DEFAULT_SOIL_PARAMS);
    const idB = addLandslide(graphB, terrain, DEFAULT_SOIL_PARAMS);
    const routerA = new SolverRouter();
    const routerB = new SolverRouter();
    routerA.register(LANDSLIDE_SOLVER_ID, makeLandslideSolver(terrain, DEFAULT_SOIL_PARAMS));
    routerB.register(LANDSLIDE_SOLVER_ID, makeLandslideSolver(terrain, DEFAULT_SOIL_PARAMS));
    routerA.routeTick(graphA, 1, 1);
    routerB.routeTick(graphB, 1, 1);
    expect(graphA.getEntity(idA).domainState).toEqual(graphB.getEntity(idB).domainState);
  });
});
