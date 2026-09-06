import { describe, expect, it } from 'vitest';
import { validateEvent } from '../core/events/genesisEvent';
import { PUMP_PIPE_DEFAULTS } from '../core/engineeringGraph/pumpPipe';
import { executeIntervention, getFrameState, packTransformBuffer } from '../core/worldModel/bridge/worldFrameState';
import { HYDRAULICS_PUMP_PIPE_SOLVER_ID, buildHydraulicsWorld, makeHydraulicsPumpPipeSolver } from '../core/worldModel/domains/hydraulicsPumpPipe';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * PRIORITY 8 (real consumer): the FULL chain, end to end, on the real
 * hydraulics EngineeringModel (steady-state Darcy-Weisbach/Swamee-Jain pump
 * pipe model — see hydraulicsPumpPipe.ts), not a mock:
 *
 *   initial conditions -> real solver tick -> real state change ->
 *   WorldFrameState/packTransformBuffer change -> journal entry -> replay
 *   (scrubTo) -> branch (forkBranch) -> a genuinely different outcome.
 *
 * `worldModelHydraulicsDomain.test.ts` already covers this domain's
 * individual pieces (matching an independent model instance, dynamic
 * grounding, intervention response, event validity). What's missing there —
 * and what the mission specifically asks Priority 8 to prove — is the
 * pieces chained together in ONE lifecycle through the C1/C2 bridge and
 * through replay/branching, which `worldModelCounterfactual.test.ts` only
 * demonstrates for chemistry.
 */
describe('Real consumer, full lifecycle (Priority 8): hydraulics end to end', () => {
  it('runs initial conditions through solver tick, bridge projection, journal, replay, and a diverging branch', () => {
    // 1. INITIAL CONDITIONS: a real pump-pipe system, untouched, at the shared library default.
    const world = buildHydraulicsWorld();
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(HYDRAULICS_PUMP_PIPE_SOLVER_ID, makeHydraulicsPumpPipeSolver());
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);

    const initial = engine.graph.getEntity(world.pumpPipeId);
    expect(initial.domainState?.volumetricFlow).toBe(PUMP_PIPE_DEFAULTS.volumetricFlow);
    expect(initial.grounding).toBe('MODEL_ESTIMATE'); // declared, not yet solved

    // 2. REAL SOLVER TICK: the actual Darcy-Weisbach/Swamee-Jain model runs, not a stand-in.
    engine.advance(1, step);
    const solved = engine.graph.getEntity(world.pumpPipeId);
    expect(solved.domainState?.headLoss).toBeGreaterThan(0);
    expect(solved.grounding).toBe('PROCEDURAL_APPROXIMATION'); // the model's own worst-ranked output, not hardcoded

    // 3. WORLDFRAMESTATE / PACKTRANSFORMBUFFER: the bridge C2 actually reads projects the same
    // real, just-solved values — no separate "display" copy of the state.
    const frame = getFrameState(engine);
    const framePumpPipe = frame.entities.find((e) => e.id === world.pumpPipeId)!;
    expect(framePumpPipe.scalars.headLoss).toBeCloseTo(solved.domainState!.headLoss, 10);
    expect(framePumpPipe.grounding).toBe('PROCEDURAL_APPROXIMATION');
    const buffer = packTransformBuffer(frame);
    const index = frame.entities.indexOf(framePumpPipe);
    expect(buffer[index * 3]).toBeCloseTo(solved.spatial!.position.x, 5);

    // 4. JOURNAL ENTRY: real evidence with a structurally valid, per-quantity provenance trail.
    const event = engine.journal.allEvents().find((e) => e.timestamp === 1)!;
    expect(validateEvent(event).ok).toBe(true);
    expect(event.parameters.headLoss).toBeCloseTo(solved.domainState!.headLoss, 10);

    // 5. REPLAY: scrubbing back to tick 1 reconstructs the exact solved state, not an approximation of it.
    const replayed = engine.scrubTo(1).getEntity(world.pumpPipeId);
    expect(replayed.domainState?.headLoss).toBe(solved.domainState?.headLoss);
    expect(replayed.domainState?.shaftPower).toBe(solved.domainState?.shaftPower);

    // 6. INTERVENTION + BRANCH: fork at tick 1, then apply a REAL flow-rate intervention only on
    // the fork (doubling flow, a genuine engineering change, not a relabeled clone).
    const fork = engine.forkBranch(1, 'doubled-flow', () => {});
    expect(fork.graph.getEntity(world.pumpPipeId).domainState?.headLoss).toBe(solved.domainState?.headLoss); // identical at the fork point

    executeIntervention(fork, world.pumpPipeId, { 'domainState.volumetricFlow': PUMP_PIPE_DEFAULTS.volumetricFlow * 2 });
    fork.advance(1, step);
    engine.advance(1, step); // root keeps running unperturbed, for comparison

    // 7. A GENUINELY DIFFERENT OUTCOME: re-solved by the SAME real model with different inputs,
    // not asserted directly — head loss grows with flow roughly as v² (Darcy-Weisbach).
    const rootAfter = engine.graph.getEntity(world.pumpPipeId);
    const forkAfter = fork.graph.getEntity(world.pumpPipeId);
    expect(forkAfter.domainState?.volumetricFlow).toBe(PUMP_PIPE_DEFAULTS.volumetricFlow * 2);
    expect(rootAfter.domainState?.volumetricFlow).toBe(PUMP_PIPE_DEFAULTS.volumetricFlow); // root unaffected by the fork's intervention
    expect(forkAfter.domainState?.headLoss).toBeGreaterThan(rootAfter.domainState!.headLoss);
    expect(forkAfter.domainState?.shaftPower).toBeGreaterThan(rootAfter.domainState!.shaftPower);

    // Root's own recorded history is untouched by anything that happened on the fork.
    expect(engine.scrubTo(1).getEntity(world.pumpPipeId).domainState?.headLoss).toBe(solved.domainState?.headLoss);
  });
});
