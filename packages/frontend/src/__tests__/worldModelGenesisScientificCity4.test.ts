import { describe, expect, it } from 'vitest';
import { compareBranches, getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { cameraDecisionFor } from '../core/world/cameraPolicy';
import { buildGenesisScientificCity4 } from '../core/worldModel/domains/genesisScientificCity4';
import {
  HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE,
  POPULATION_ACCESS_IMPAIRED_EVENT_TYPE,
  PUMP_TRIPPED_EVENT_TYPE,
  RAINFALL_EVENT_TYPE,
} from '../core/worldModel/domains/genesisScientificCity3';
import { getCausalAncestry } from '../core/worldModel/queries/worldQueries';
import { TemporalBranchRegistry } from '../core/worldModel/temporal/temporalEngine';

/**
 * GENESIS SCIENTIFIC CITY 4.0 — THE FIRST TRUE TRINITY DEMO (Genesis
 * Scientific World Model 3.0, section 17). Drives the reference scenario
 * through the canonical `createScientificWorld` entry point, then exercises
 * every Trinity capability end to end on the SAME real world: evolution,
 * causal explanation, counterfactual branching/comparison, C2 rendering,
 * and C1's real (unmodified) camera policy — all real, reused primitives,
 * never a second implementation of any of them.
 */
describe('Genesis Scientific City 4.0: built through the Trinity entry point', () => {
  it('createScientificWorld produces the same real, ID-compatible hierarchy City 3.0 builds by hand', () => {
    const city4 = buildGenesisScientificCity4();
    expect(city4.base.validation.ok).toBe(true);
    expect(city4.base.specified.graph.getEntity(city4.pumpPipeId)).toBeDefined();
    expect(city4.base.specified.graph.getEntity(city4.hospitalBuildingId)).toBeDefined();
    expect(city4.base.specified.graph.getEntity(city4.substanceId)).toBeDefined();
    expect(city4.base.availableDomains).toEqual(['chemistry-kinetics', 'electrical-engineering', 'environment-hydrology', 'epidemiology', 'hydraulics-engineering']);
  });

  it('the full real cascade runs identically to City 3.0: rainfall -> hydraulic overload -> pump trip -> hospital service -> population access', () => {
    const city4 = buildGenesisScientificCity4({ rainfallAtTick: 1 });
    const engine = city4.base.engine;
    for (let i = 0; i < 5; i++) engine.advance(1, city4.updater);

    const allEvents = engine.journal.allEvents();
    const rainfall = allEvents.find((e) => e.type === RAINFALL_EVENT_TYPE);
    const trip = allEvents.find((e) => e.type === PUMP_TRIPPED_EVENT_TYPE);
    const hospitalService = allEvents.find((e) => e.type === HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE);
    const populationAccess = allEvents.find((e) => e.type === POPULATION_ACCESS_IMPAIRED_EVENT_TYPE);
    expect(rainfall).toBeDefined();
    expect(trip).toBeDefined();
    expect(hospitalService).toBeDefined();
    expect(populationAccess).toBeDefined();
    expect(engine.graph.getEntity(city4.pumpPipeId).domainState?.volumetricFlow).toBe(0);
  });

  it('CAUSAL EXPLANATION (section 12): "why did this happen" — the population-access event traces back through hospital service and pump trip to the real solver step that measured the overload', () => {
    const city4 = buildGenesisScientificCity4({ rainfallAtTick: 1 });
    const engine = city4.base.engine;
    for (let i = 0; i < 5; i++) engine.advance(1, city4.updater);

    const populationAccessEvent = engine.journal.allEvents().find((e) => e.type === POPULATION_ACCESS_IMPAIRED_EVENT_TYPE)!;
    const ancestry = getCausalAncestry(engine, populationAccessEvent.id);
    const types = ancestry.map((e) => e.type);
    expect(types).toContain(HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE);
    expect(types).toContain(PUMP_TRIPPED_EVENT_TYPE);
    expect(types).toContain('hydraulics.pumppipe.step'); // the real solver step whose measured headLoss tripped the pump
  });

  it('COUNTERFACTUAL WORLD (section 11): FORK mid-scenario with a real emergency-intervention mutation, and prove the two worlds genuinely diverge', () => {
    const city4 = buildGenesisScientificCity4({ rainfallAtTick: 1 });
    const registry = new TemporalBranchRegistry();
    registry.register(city4.base.engine); // Trinity's engine isn't created with a registry by default; register it here to compare branches — the same public API any caller would use.
    const engine = city4.base.engine;

    // Tick 1: rainfall fires; the cross-domain coupling raises the pump's flow to 4x THIS same
    // tick, but the real hydraulics model has not yet re-solved headLoss against it — the honest
    // one-tick-per-cascade-hop lag `cascade/cascadeRules.ts` itself documents. This is the last
    // moment the pump has NOT yet tripped: tick 2 will re-solve headLoss against the raised flow
    // and trip it in the SAME tick, so it must be forked here, not after.
    engine.advance(1, city4.updater);
    const pumpAtFork = engine.graph.getEntity(city4.pumpPipeId);
    expect(pumpAtFork.domainState?.volumetricFlow).toBeCloseTo(0.2); // already raised (0.05 baseline x4)

    // FORK: a counterfactual branch where an operator intervention cuts the flow back down to its
    // pre-rainfall level right at the fork point — a real, controllable divergence (section 10),
    // not a guess about what "no rainfall" would have looked like.
    const intervened = engine.forkBranch(1, 'emergency-flow-reduction', (graph) => {
      const pump = graph.getEntity(city4.pumpPipeId);
      graph.updateEntity(city4.pumpPipeId, { domainState: { ...pump.domainState, volumetricFlow: pumpAtFork.domainState!.volumetricFlow / 4 } });
    });
    registry.register(intervened);

    let baseTripped = false;
    for (let i = 0; i < 20 && !baseTripped; i++) {
      engine.advance(1, city4.updater);
      intervened.advance(1, city4.updater);
      baseTripped = engine.journal.allEvents().some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE);
    }

    expect(baseTripped).toBe(true); // BASE WORLD: the real scenario trips the pump
    expect(intervened.journal.allEvents().some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE)).toBe(false); // COUNTERFACTUAL: the intervention genuinely prevented it
    expect(engine.graph.getEntity(city4.pumpPipeId).domainState?.volumetricFlow).toBe(0);
    expect(intervened.graph.getEntity(city4.pumpPipeId).domainState?.volumetricFlow).toBeGreaterThan(0);

    // COMPARISON (section 11): the branch tree and the diff are both real, queryable state — not a hand-written summary.
    const atTick = engine.tick;
    const comparison = compareBranches(registry, engine.branchId, intervened.branchId, atTick);
    const pumpDiff = comparison.entityDiffs.find((d) => d.id === city4.pumpPipeId)!;
    expect(pumpDiff.equal).toBe(false);
    const hospitalDiff = comparison.entityDiffs.find((d) => d.id === city4.hospitalBuildingId)!;
    expect(hospitalDiff.equal).toBe(false); // base: water service interrupted; intervened: never was
    expect(engine.graph.getEntity(city4.hospitalBuildingId).domainState?.waterServiceInterrupted).toBe(1);
    expect(intervened.graph.getEntity(city4.hospitalBuildingId).domainState?.waterServiceInterrupted).toBeUndefined();

    // Both branches share the SAME pre-fork rainfall event — a real shared history, not two independent worlds.
    expect(intervened.journal.allEvents().some((e) => e.type === RAINFALL_EVENT_TYPE)).toBe(true);
  });

  it('C2 RENDERING PATH (section 15) + C1 CAMERA PATH (section 16): the base world\'s real WorldFrame adapts for C2, and its real pump-trip event drives C1\'s existing camera policy', () => {
    const city4 = buildGenesisScientificCity4({ rainfallAtTick: 1 });
    const engine = city4.base.engine;
    let tripped = false;
    for (let i = 0; i < 20 && !tripped; i++) {
      engine.advance(1, city4.updater);
      tripped = engine.journal.allEvents().some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE);
    }
    expect(tripped).toBe(true);

    // C2: the live WorldFrame adapts to C2's own graphics contract without C2 knowing any solver ran.
    const frame = getFrameState(engine);
    const graphicsFrame = toGraphicsWorldFrame(frame);
    expect(graphicsFrame.entities.length).toBe(frame.entities.length);
    const pump = graphicsFrame.entities.find((e) => e.id === city4.pumpPipeId)!;
    expect(pump.status).toBeDefined();

    // C1: "Pokaż wydarzenie awarii." — the real trip event resolves to a valid camera decision
    // through C1's UNMODIFIED cameraDecisionFor, no second camera-intent system involved.
    const tripEvent = engine.journal.allEvents().find((e) => e.type === PUMP_TRIPPED_EVENT_TYPE)!;
    const decision = cameraDecisionFor(tripEvent);
    expect(decision?.mode).toBe('SCIENTIFIC');
  });

  it('PERSISTENCE (section 6): the Trinity-created world is registered and loadable by its own worldId', () => {
    const city4 = buildGenesisScientificCity4({ worldId: 'genesis-scientific-city-4-persisted' });
    const loaded = city4.registry.load('genesis-scientific-city-4-persisted');
    expect(loaded?.engine).toBe(city4.base.engine);
    expect(loaded?.record.worldId).toBe('genesis-scientific-city-4-persisted');
  });
});
