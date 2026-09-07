import { describe, expect, it } from 'vitest';
import {
  compareBranches,
  describeWorldMoment,
  explainEntityChange,
  getFrameState,
  getWorldClock,
  toWorldInteractionHandler,
} from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisCityWorld, makeGenesisCityRouter, makeGenesisCityUpdater } from '../core/worldModel/domains/genesisCityWorld';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 3, THE CRITICAL INTEGRATION TEST (section 11/14):
 *
 *   USER INTENT -> C1 -> C3 -> REAL SOLVER -> STATE CHANGE -> WORLD JOURNAL
 *   -> WORLD FRAME -> C2 -> C1 OBSERVATION -> SCRUB -> REPLAY -> FORK
 *   -> INTERVENTION -> DIFFERENT SOLVER OUTCOME -> COMPARE
 *
 * "C1" here is the existing `WorldInteractionHandler` contract
 * (core/world/worldContracts.ts) plus the observer queries in
 * bridge/worldFrameState.ts — this test does not build C1's own intent
 * parser (that stays C1's job); it drives C3 exactly the way C1 already
 * can, which is the point: the contract is real and sufficient.
 */
describe('The Trinity integration test: intent through C3 to a comparable, real, divergent outcome', () => {
  it('runs the full chain end to end on the multi-domain city world', () => {
    // USER INTENT: "show me what happens to this city over the next few hours" — resolved (by C1, not this test)
    // into: initialize this world, run its real solvers forward.
    const world = buildGenesisCityWorld({ chemistry: { initialTemperatureK: 800 } });
    const registry = new TemporalBranchRegistry();
    const engine = new TemporalEngine(world.graph, { label: 'observed-run', registry });
    const router = makeGenesisCityRouter(world.epidemicParams);
    const updater = makeGenesisCityUpdater(router);
    const c1Handler = toWorldInteractionHandler(engine, { worldId: 'genesis-city', domainId: 'multi-domain' });

    // C3 -> REAL SOLVER -> STATE CHANGE -> WORLD JOURNAL, several hours.
    for (let hour = 0; hour < 6; hour++) engine.advance(3600, updater);
    expect(engine.journal.allEvents().length).toBeGreaterThan(0);

    // WORLD FRAME -> C2: a generic frame, no domain-specific reads.
    const frame = getFrameState(engine);
    expect(frame.entities.length).toBeGreaterThan(0);
    expect(frame.branchId).toBe(engine.branchId);

    // C1 OBSERVATION: "what is happening / why" via the SAME contract C1 already has.
    const inspectResult = c1Handler({ interactionId: 'i1', entity: { kind: 'substance', id: 'substance-1' }, action: 'INSPECT' });
    expect(inspectResult.accepted).toBe(true);
    const moment = describeWorldMoment(engine, world.substanceId);
    expect(moment.latestEvent?.type).toBe('chemistry.kinetics.step');
    const trace = explainEntityChange(engine, world.substanceId);
    expect(trace?.event.id).toBe(moment.latestEvent?.id);
    const clock = getWorldClock(engine);
    expect(clock.tick).toBe(6);

    // SCRUB / REPLAY: past state is real recorded state, not re-invented.
    const past = getFrameState(engine, 3);
    const pastSubstance = past.entities.find((e) => e.id === world.substanceId)!;
    const headSubstance = frame.entities.find((e) => e.id === world.substanceId)!;
    expect(headSubstance.scalars.concentrationFraction).toBeLessThan(pastSubstance.scalars.concentrationFraction);
    for (let tick = 0; tick <= 6; tick++) expect(engine.scrubTo(tick).getEntity(world.substanceId)).toBeDefined();

    // FORK + INTERVENTION: a counterfactual world sharing history up to now, diverging via a real
    // temperature-parameter intervention applied at the fork point.
    const cooled = engine.forkBranch(6, 'cooled-substance', (g) => {
      const current = g.getEntity(world.substanceId);
      g.updateEntity(world.substanceId, { physics: { ...current.physics!, temperatureK: 700 } });
    });

    // The SAME intervention is also reachable through the C1 contract (CHANGE_PARAMETER) on the live world —
    // exercised here on the original branch to prove both entry points are real, not just the direct graph API.
    const interventionResult = c1Handler({
      interactionId: 'i2',
      entity: { kind: 'substance', id: 'substance-1' },
      action: 'CHANGE_PARAMETER',
      parameters: { 'physics.pressurePa': 101325 },
    });
    expect(interventionResult.accepted).toBe(true);

    // DIFFERENT SOLVER OUTCOME: continue both branches; the cooled fork must genuinely diverge.
    for (let hour = 0; hour < 6; hour++) {
      engine.advance(3600, updater);
      cooled.advance(3600, updater);
    }

    const engineFinal = engine.graph.getEntity(world.substanceId).chemical!.concentrationFraction!;
    const cooledFinal = cooled.graph.getEntity(world.substanceId).chemical!.concentrationFraction!;
    expect(cooledFinal).toBeGreaterThan(engineFinal); // cooler branch decayed slower — a real physical consequence

    // COMPARE: the branch tree and the diff are both real, queryable state.
    const comparison = compareBranches(registry, engine.branchId, cooled.branchId, 12);
    const diff = comparison.entityDiffs.find((d) => d.id === world.substanceId)!;
    expect(diff.equal).toBe(false);

    // Other domains on the SAME two branches were untouched by this chemistry-only intervention.
    const populationDiff = comparison.entityDiffs.find((d) => d.id === world.populationId)!;
    expect(populationDiff.equal).toBe(true);
    const pumpPipeDiff = comparison.entityDiffs.find((d) => d.id === world.pumpPipeId)!;
    expect(pumpPipeDiff.equal).toBe(true);

    // Scientific integrity held throughout: every real result on both worlds still discloses its grounding.
    expect(diff.worldA!.grounding).toBe('MODEL_ESTIMATE');
    expect(diff.worldB!.grounding).toBe('MODEL_ESTIMATE');
  });
});
