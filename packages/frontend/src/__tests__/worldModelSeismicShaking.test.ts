import { describe, expect, it } from 'vitest';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { withCrossDomainCouplings } from '../core/worldModel/crossDomain/crossDomainCoupling';
import {
  applySeismicRupture,
  buildSeismicShakingWorld,
  EARTHQUAKE_DAMAGE_REQUIRED_DATA,
  makeSeismicSourceSolver,
  makeStructuralSiteSolver,
  SEISMIC_SOURCE_SOLVER_ID,
  SEISMIC_SOURCE_STATE_CODE,
  SEISMIC_STATES,
  SHAKING_SEVERITY_CODE,
  shakingSeverityLabel,
  siteShakingG,
  STRUCTURAL_DAMAGE_STATE_CODE,
  STRUCTURAL_SITE_SOLVER_ID,
} from '../core/worldModel/domains/seismicShaking';
import {
  hypocentralDistanceKm,
  syntheticPeakGroundAcceleration,
  vulnerabilityMultiplier,
} from '../core/hazard/earthquake/earthquakeModel';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 6 — SEISMIC GROUND SHAKING.
 *
 * The claim: `core/hazard/`'s existing vertical slice is now integrated into
 * the world model WITHOUT gaining any accuracy it did not have, and with its
 * NOT_MODELLED damage disclosure carried through to the C2 boundary rather
 * than dropped on the way.
 */
function buildWorld() {
  const world = buildSeismicShakingWorld({ magnitude: 6.5, depthKm: 10 });
  const router = new SolverRouter();
  router.register(SEISMIC_SOURCE_SOLVER_ID, makeSeismicSourceSolver());
  router.register(STRUCTURAL_SITE_SOLVER_ID, makeStructuralSiteSolver());
  const engine = new TemporalEngine(world.graph);
  const updater = withCrossDomainCouplings((g, dt, tick) => router.routeTick(g, dt, tick), [world.coupling]);
  return { world, engine, updater };
}

describe('The hazard module is reused, not reimplemented', () => {
  it('site shaking is exactly the hazard module\'s own pipeline, call for call', () => {
    const source = { magnitude: 6.5, depthKm: 10, epicenterXKm: 0, epicenterYKm: 0, sourceStateCode: 1 };
    const site = { siteXKm: 15, siteYKm: -10, vulnerabilityClassCode: 1 };
    const expected = syntheticPeakGroundAcceleration(6.5, hypocentralDistanceKm({ x: 0, y: 0 }, 10, { x: 15, y: -10 })) * vulnerabilityMultiplier('MEDIUM');
    expect(siteShakingG(source, site)).toBe(expected); // exact, not close: no re-derivation happened
  });

  it('attenuates with distance and rises with vulnerability, as the underlying model does', () => {
    const source = { magnitude: 6.5, depthKm: 10, epicenterXKm: 0, epicenterYKm: 0, sourceStateCode: 1 };
    const near = siteShakingG(source, { siteXKm: 2, siteYKm: 1, vulnerabilityClassCode: 1 });
    const far = siteShakingG(source, { siteXKm: 60, siteYKm: 40, vulnerabilityClassCode: 1 });
    expect(near).toBeGreaterThan(far);
    const fragile = siteShakingG(source, { siteXKm: 2, siteYKm: 1, vulnerabilityClassCode: 2 });
    expect(fragile).toBeGreaterThan(near);
  });
});

describe('Genesis does not predict earthquakes', () => {
  it('a source stays quiescent forever on its own — ticking never ruptures it', () => {
    const { world, engine, updater } = buildWorld();
    for (let i = 0; i < 20; i++) engine.advance(1, updater);
    expect(engine.graph.getEntity(world.sourceId).domainState?.sourceStateCode).toBe(SEISMIC_SOURCE_STATE_CODE.QUIESCENT);
    for (const siteId of world.siteIds) expect(engine.graph.getEntity(siteId).domainState?.peakGroundAccelerationG).toBe(0);
  });

  it('a rupture is an intervention, and it shakes every related structure by distance', () => {
    const { world, engine, updater } = buildWorld();
    engine.advance(1, updater);
    applySeismicRupture(engine, world.sourceId);
    engine.advance(1, updater);

    const [near, mid, far] = world.siteIds.map((id) => engine.graph.getEntity(id).domainState!.peakGroundAccelerationG);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(engine.graph.getEntity(world.sourceId).statusLabel).toBe('SEISMIC_RUPTURED');
  });
});

describe('Structural damage is NOT_MODELLED, and says so on the record', () => {
  it('every exposed structure publishes the not-modelled code, before and after a rupture', () => {
    const { world, engine, updater } = buildWorld();
    engine.advance(1, updater);
    for (const siteId of world.siteIds) {
      expect(engine.graph.getEntity(siteId).domainState?.structuralDamageStateCode).toBe(STRUCTURAL_DAMAGE_STATE_CODE.NOT_MODELLED);
    }
    applySeismicRupture(engine, world.sourceId);
    engine.advance(1, updater);
    for (const siteId of world.siteIds) {
      const state = engine.graph.getEntity(siteId).domainState!;
      expect(state.peakGroundAccelerationG).toBeGreaterThan(0); // it really was shaken
      expect(state.structuralDamageStateCode).toBe(STRUCTURAL_DAMAGE_STATE_CODE.NOT_MODELLED); // and damage still is not claimed
    }
  });

  it('the damage enum has exactly one member — there is no honest second value to report', () => {
    expect(Object.keys(STRUCTURAL_DAMAGE_STATE_CODE)).toEqual(['NOT_MODELLED']);
  });

  it('the named data gaps travel with the domain rather than being summarised away', () => {
    const requirements = EARTHQUAKE_DAMAGE_REQUIRED_DATA.map((r) => r.requirement);
    expect(requirements).toContain('calibrated-fragility-or-vulnerability-curves');
    expect(requirements).toContain('building-inventory-with-structural-typology');
    expect(requirements).toContain('domain-expert-review');
  });
});

describe('Grounding tells the truth about a non-calibrated model', () => {
  it('shaking is UNGROUNDED_APPROXIMATION, never MODEL_ESTIMATE', () => {
    const { world, engine, updater } = buildWorld();
    applySeismicRupture(engine, world.sourceId);
    engine.advance(1, updater);
    expect(engine.graph.getEntity(world.sourceId).grounding).toBe('UNGROUNDED_APPROXIMATION');
    for (const siteId of world.siteIds) expect(engine.graph.getEntity(siteId).grounding).toBe('UNGROUNDED_APPROXIMATION');
    expect(world.coupling.grounding).toBe('UNGROUNDED_APPROXIMATION');
  });

  it('Rule 3 at the C2 boundary: severity and damage arrive as NUMBERS, prose alongside', () => {
    const { world, engine, updater } = buildWorld();
    applySeismicRupture(engine, world.sourceId);
    engine.advance(1, updater);

    const frame = toGraphicsWorldFrame(getFrameState(engine));
    const near = frame.entities.find((entity) => entity.id === world.siteIds[0])!;
    expect(typeof near.scalars!.shakingSeverityCode).toBe('number');
    expect(near.scalars!.structuralDamageStateCode).toBe(STRUCTURAL_DAMAGE_STATE_CODE.NOT_MODELLED);
    expect(SEISMIC_STATES).toContain(near.status as (typeof SEISMIC_STATES)[number]);
    expect(near.grounding).toBe('NOT_MODELED'); // C2's own honest tier for an ungrounded entity
  });

  it('severity codes map onto the allowlist and never outside it', () => {
    expect(shakingSeverityLabel(SHAKING_SEVERITY_CODE.SEVERE)).toBe('SHAKING_SEVERE');
    for (const nonsense of [-1, 99, Number.NaN]) expect(SEISMIC_STATES).toContain(shakingSeverityLabel(nonsense));
  });
});

describe('Replay', () => {
  it('scrubTo reconstructs the shaken world exactly', () => {
    const { world, engine, updater } = buildWorld();
    engine.advance(1, updater);
    applySeismicRupture(engine, world.sourceId);
    for (let i = 0; i < 3; i++) engine.advance(1, updater);

    for (const id of [world.sourceId, ...world.siteIds]) {
      expect(engine.scrubTo(engine.tick).getEntity(id).domainState).toEqual(engine.graph.getEntity(id).domainState);
    }
    // Tick 0 predates the rupture: the world really was quiet then.
    expect(engine.scrubTo(0).getEntity(world.siteIds[0]).domainState?.peakGroundAccelerationG).toBe(0);
  });
});
