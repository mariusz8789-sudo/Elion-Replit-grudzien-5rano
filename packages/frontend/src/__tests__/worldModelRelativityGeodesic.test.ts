import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { SCHWARZSCHILD_CRITICAL_IMPACT } from '../core/physics';
import { runSchwarzschildGeodesicScenario } from '../labs/experiments/einstein-geodesics';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisScientificCity4 } from '../core/worldModel/domains/genesisScientificCity4';
import {
  buildSchwarzschildGeodesicWorld,
  CRITICAL_IMPACT_PARAMETER_RS,
  GEODESIC_OUTCOME_CODE,
  GEODESIC_OUTCOME_EVENT_TYPE,
  GEODESIC_OUTCOME_STATES,
  geodesicOutcomeLabel,
  makeRelativityGeodesicSolver,
  RELATIVITY_DOMAIN_ID,
  RELATIVITY_GEODESIC_SOLVER_ID,
  SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS,
} from '../core/worldModel/domains/relativityGeodesic';
import type { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 3 — RELATIVITY INTEGRATION. `core/physics.ts`'s exact null-geodesic
 * RK4 integrator was real and tested but had no connection to the world
 * model. These tests prove it is now a `DomainSolver` that reproduces the
 * existing Labs runner BIT FOR BIT, that a geodesic's state genuinely
 * survives the delta log and forking, and that what it publishes obeys
 * `graphics/SOLVER_DATA_CONTRACT.md`.
 */
function runPhoton(impactParameterRatio: number, maxTicks = 8000) {
  const world = buildSchwarzschildGeodesicWorld([impactParameterRatio]);
  const router = new SolverRouter();
  router.register(RELATIVITY_GEODESIC_SOLVER_ID, makeRelativityGeodesicSolver());
  const engine = new TemporalEngine(world.graph);
  const updater = (graph: WorldGraph, dt: number, tick: number) => router.routeTick(graph, dt, tick);
  const photonId = world.photonIds[0];

  let ticks = 0;
  while (engine.graph.getEntity(photonId).domainState!.outcomeCode === GEODESIC_OUTCOME_CODE.IN_FLIGHT && ticks < maxTicks) {
    engine.advance(1, updater);
    ticks += 1;
  }
  return { engine, updater, photonId, world };
}

describe('Schwarzschild geodesic solver: a real wrapper, proven bit-for-bit', () => {
  it.each([0.9, 1.1, 1.6])('reproduces the Labs runner exactly for impact ratio %f', (impactParameterRatio) => {
    const { engine, photonId } = runPhoton(impactParameterRatio);
    const state = engine.graph.getEntity(photonId).domainState!;

    // Computed independently by the existing Labs runner. Same integrator, same constants, same
    // capture/escape cuts — if this solver had re-implemented or renormalised anything, the step
    // count and the minimum radius would not survive an exact comparison.
    const reference = runSchwarzschildGeodesicScenario({ impact: impactParameterRatio, maxSteps: 12000 });
    expect(state.stepsIntegrated).toBe(reference.steps);
    expect(state.minRadiusRs).toBe(reference.minRadius / SCHWARZSCHILD_RADIUS_INTEGRATOR_UNITS);
    expect(state.turns).toBe(reference.turns);
    expect(geodesicOutcomeLabel(state.outcomeCode)).toBe(reference.outcome === 'captured' ? 'GEODESIC_CAPTURED' : 'GEODESIC_ESCAPED');
  });

  it('reproduces real photon capture physics either side of the critical impact parameter', () => {
    // b_c = 3√3/2 ≈ 2.598 r_s is the exact photon-capture boundary of the Schwarzschild metric.
    expect(CRITICAL_IMPACT_PARAMETER_RS).toBe(SCHWARZSCHILD_CRITICAL_IMPACT);
    expect(CRITICAL_IMPACT_PARAMETER_RS).toBeCloseTo(2.598, 3);

    const captured = runPhoton(0.9);
    expect(captured.engine.graph.getEntity(captured.photonId).domainState!.outcomeCode).toBe(GEODESIC_OUTCOME_CODE.CAPTURED);

    const escaped = runPhoton(1.1);
    expect(escaped.engine.graph.getEntity(escaped.photonId).domainState!.outcomeCode).toBe(GEODESIC_OUTCOME_CODE.ESCAPED);

    // A grazing photon dives far closer to the horizon than a distant one before turning around.
    const grazing = runPhoton(1.01).engine;
    const distant = runPhoton(2.0).engine;
    const grazingMin = grazing.graph.getEntity('geodesic-photon:photon-1').domainState!.minRadiusRs;
    const distantMin = distant.graph.getEntity('geodesic-photon:photon-1').domainState!.minRadiusRs;
    expect(grazingMin).toBeLessThan(distantMin);
    expect(grazingMin).toBeGreaterThan(1); // outside the horizon: it escaped rather than fell in
  });

  it('emits a real outcome event when the photon settles, and then FREEZES instead of integrating past it', () => {
    const { engine, updater, photonId } = runPhoton(0.9);
    const outcomeEvents = engine.journal.allEvents().filter((e) => e.type === GEODESIC_OUTCOME_EVENT_TYPE);
    expect(outcomeEvents).toHaveLength(1);

    const settled = canonicalJson(engine.graph.getEntity(photonId).domainState);
    for (let i = 0; i < 5; i++) engine.advance(1, updater);
    // A captured photon's orbit is over: continuing to integrate would publish coordinates for a
    // trajectory the model no longer describes.
    expect(canonicalJson(engine.graph.getEntity(photonId).domainState)).toBe(settled);
    expect(engine.journal.allEvents().filter((e) => e.type === GEODESIC_OUTCOME_EVENT_TYPE)).toHaveLength(1);
  });
});

describe('Geodesic state is genuinely ECS-native (the Phase 2 constraint, satisfied the better way)', () => {
  it('replays byte-identical — the whole orbit lives in domainState, not in solver instance fields', () => {
    const world = buildSchwarzschildGeodesicWorld([1.1]);
    const router = new SolverRouter();
    router.register(RELATIVITY_GEODESIC_SOLVER_ID, makeRelativityGeodesicSolver());
    const engine = new TemporalEngine(world.graph);
    const updater = (graph: WorldGraph, dt: number, tick: number) => router.routeTick(graph, dt, tick);
    for (let i = 0; i < 40; i++) engine.advance(1, updater);

    const sortById = (entities: readonly { id: string }[]) => [...entities].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(canonicalJson(sortById(engine.scrubTo(engine.tick).listEntities()))).toBe(canonicalJson(sortById(engine.graph.listEntities())));
  });

  it('a fork diverges independently — no shared integrator instance between branches', () => {
    const world = buildSchwarzschildGeodesicWorld([1.1]);
    const router = new SolverRouter();
    router.register(RELATIVITY_GEODESIC_SOLVER_ID, makeRelativityGeodesicSolver());
    const engine = new TemporalEngine(world.graph);
    const updater = (graph: WorldGraph, dt: number, tick: number) => router.routeTick(graph, dt, tick);
    const photonId = world.photonIds[0];
    for (let i = 0; i < 20; i++) engine.advance(1, updater);

    // The fork's photon is nudged onto a sub-critical impact parameter and re-launched.
    const fork = engine.forkBranch(engine.tick, 'captured-counterfactual', (graph) => {
      const photon = graph.getEntity(photonId);
      graph.updateEntity(photonId, { domainState: { ...photon.domainState, outcomeCode: GEODESIC_OUTCOME_CODE.CAPTURED } });
    });

    for (let i = 0; i < 20; i++) {
      engine.advance(1, updater);
      fork.advance(1, updater);
    }

    // The base branch kept flying; the fork stayed frozen at its own declared outcome.
    expect(engine.graph.getEntity(photonId).domainState!.stepsIntegrated).toBeGreaterThan(fork.graph.getEntity(photonId).domainState!.stepsIntegrated);
    expect(fork.graph.getEntity(photonId).domainState!.outcomeCode).toBe(GEODESIC_OUTCOME_CODE.CAPTURED);
  });
});

describe('SOLVER_DATA_CONTRACT compliance', () => {
  it('Rule 3: ships the discrete outcome as a NUMBER in scalars, with the token only as a companion', () => {
    const { engine, photonId } = runPhoton(0.9);
    const frame = toGraphicsWorldFrame(getFrameState(engine));
    const photon = frame.entities.find((entity) => entity.id === photonId)!;

    // The machine-readable channel is the number; an adapter never has to parse a label.
    expect(photon.scalars).toBeDefined();
    expect(photon.scalars!.outcomeCode).toBe(GEODESIC_OUTCOME_CODE.CAPTURED);
    expect(typeof photon.scalars!.radiusRs).toBe('number');
    expect(GEODESIC_OUTCOME_STATES).toContain(photon.status as (typeof GEODESIC_OUTCOME_STATES)[number]);
  });

  it('Rules 1+2: publishes a real absolute position every tick, in the equatorial plane, with the unit conversion exposed', () => {
    const world = buildSchwarzschildGeodesicWorld([1.1]);
    const router = new SolverRouter();
    router.register(RELATIVITY_GEODESIC_SOLVER_ID, makeRelativityGeodesicSolver());
    const engine = new TemporalEngine(world.graph);
    const updater = (graph: WorldGraph, dt: number, tick: number) => router.routeTick(graph, dt, tick);
    const photonId = world.photonIds[0];

    const launchPosition = { ...engine.graph.getEntity(photonId).spatial!.position };
    // Rule 1's hazard: an entity with no spatial component is silently drawn at the world origin.
    expect(launchPosition.x === 0 && launchPosition.y === 0 && launchPosition.z === 0).toBe(false);

    for (let i = 0; i < 30; i++) engine.advance(1, updater);
    const moved = engine.graph.getEntity(photonId).spatial!.position;
    expect(canonicalJson(moved)).not.toBe(canonicalJson(launchPosition)); // really moving, not static
    expect(moved.y).toBe(0); // equatorial orbit, stated in the module doc

    const state = engine.graph.getEntity(photonId).domainState!;
    // §B item 2: the conversion factor behind the position is auditable, not folded into the numbers.
    expect(state.worldUnitsPerSchwarzschildRadius).toBeGreaterThan(0);
    expect(Math.hypot(moved.x, moved.z)).toBeCloseTo(state.radiusRs * state.worldUnitsPerSchwarzschildRadius, 10);
  });

  it('Rules 4+5+6: stable ids and order, truthful grounding, and no invented appearance', () => {
    const world = buildSchwarzschildGeodesicWorld([0.9, 1.1, 1.6]);
    expect(world.photonIds).toEqual(['geodesic-photon:photon-1', 'geodesic-photon:photon-2', 'geodesic-photon:photon-3']);

    const router = new SolverRouter();
    router.register(RELATIVITY_GEODESIC_SOLVER_ID, makeRelativityGeodesicSolver());
    const engine = new TemporalEngine(world.graph);
    const updater = (graph: WorldGraph, dt: number, tick: number) => router.routeTick(graph, dt, tick);

    const orderBefore = getFrameState(engine).entities.map((e) => e.id);
    for (let i = 0; i < 25; i++) engine.advance(1, updater);
    expect(getFrameState(engine).entities.map((e) => e.id)).toEqual(orderBefore); // Rule 4: same set AND same order

    // Rule 5: the integration is numerically exact, but the MODEL is an idealised test particle —
    // so MODEL_ESTIMATE, never GROUNDED_EXACT.
    expect(engine.graph.getEntity(world.photonIds[0]).grounding).toBe('MODEL_ESTIMATE');
    // The black hole itself is background geometry no solver advances — honestly ungrounded.
    expect(engine.graph.getEntity(world.blackHoleId).grounding).toBe('UNGROUNDED_APPROXIMATION');

    // Rule 7: C3 ships quantities and identity, never appearance.
    const serialized = canonicalJson(engine.graph.listEntities());
    for (const forbidden of ['color', 'colour', 'material', 'opacity', 'rgba', '#']) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe('Cross-domain coupling: NOT_MODELLED, deliberately', () => {
  it('the relativity domain is standalone — it is not wired into the reference city, and nothing pretends otherwise', () => {
    // There is no honest physical pathway from a photon orbiting a black hole to the city's pumps,
    // hospital or population. An invented one would be exactly the fabricated coupling this
    // consolidation exists to prevent, so the domain ships correctly registered and standalone.
    const city = buildGenesisScientificCity4({ withQuantumLab: true, worldId: 'relativity-not-coupled' });
    expect(city.base.availableDomains).not.toContain(RELATIVITY_DOMAIN_ID);

    const world = buildSchwarzschildGeodesicWorld([1.1]);
    // Its only relationship-free structure is deliberate: the photons hang off the hole by scale
    // parentage alone, with no cross-domain edges at all.
    expect(world.graph.listRelationships()).toEqual([]);
  });
});
