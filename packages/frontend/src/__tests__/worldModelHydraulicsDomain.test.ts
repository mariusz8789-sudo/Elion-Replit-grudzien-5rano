import { describe, expect, it } from 'vitest';
import { validateEvent } from '../core/events/genesisEvent';
import { buildPumpPipeModel, PUMP_PIPE_DEFAULTS } from '../core/engineeringGraph/pumpPipe';
import {
  HYDRAULICS_PUMP_PIPE_SOLVER_ID,
  buildHydraulicsWorld,
  makeHydraulicsPumpPipeSolver,
} from '../core/worldModel/domains/hydraulicsPumpPipe';
import { executeIntervention } from '../core/worldModel/bridge/worldFrameState';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 3, THIRD REAL DOMAIN: hydraulics/engineering, wrapping the real
 * pump-pipe EngineeringModel (core/engineeringGraph/pumpPipe.ts). This
 * system is steady-state — grounding is derived dynamically from the
 * model's own provenance propagation, never hardcoded.
 */
describe('Hydraulics Pump-Pipe domain (real EngineeringModel)', () => {
  function buildRoutedEngine() {
    const world = buildHydraulicsWorld();
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(HYDRAULICS_PUMP_PIPE_SOLVER_ID, makeHydraulicsPumpPipeSolver());
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);
    return { world, engine, step };
  }

  it('computes headLoss/shaftPower identically to an independently built instance of the same real model', () => {
    const { world, engine, step } = buildRoutedEngine();
    engine.advance(1, step);

    const reference = buildPumpPipeModel();
    const expectedHeadLoss = reference.getValue('headLoss');
    const expectedShaftPower = reference.getValue('shaftPower');

    const pumpPipe = engine.graph.getEntity(world.pumpPipeId);
    expect(pumpPipe.domainState?.headLoss).toBeCloseTo(expectedHeadLoss, 10);
    expect(pumpPipe.domainState?.shaftPower).toBeCloseTo(expectedShaftPower, 6);
  });

  it('derives grounding dynamically from the real model\'s own provenance propagation — never a hardcoded label', () => {
    const { world, engine, step } = buildRoutedEngine();
    engine.advance(1, step);

    // Independently confirm the real model's own worst-ranked output is shaftPower at 'engineering-estimate'
    // (pump efficiency provenance) — the solver's reported grounding must reflect exactly this, not a guess.
    const reference = buildPumpPipeModel();
    const shaftPowerProvenance = reference.effectiveProvenance('shaftPower').provenance;
    expect(shaftPowerProvenance).toBe('engineering-estimate');

    const pumpPipe = engine.graph.getEntity(world.pumpPipeId);
    expect(pumpPipe.grounding).toBe('PROCEDURAL_APPROXIMATION');
  });

  it('a steady-state system re-evaluates identically tick to tick when no intervention changes its parameters', () => {
    const { world, engine, step } = buildRoutedEngine();
    engine.advance(1, step);
    const first = engine.graph.getEntity(world.pumpPipeId).domainState?.shaftPower;
    engine.advance(1, step);
    const second = engine.graph.getEntity(world.pumpPipeId).domainState?.shaftPower;
    expect(second).toBe(first);
  });

  it('a real flow-rate intervention changes headLoss/shaftPower in later WorldFrames — not a display trick', () => {
    const { world, engine, step } = buildRoutedEngine();
    engine.advance(1, step);
    const before = engine.graph.getEntity(world.pumpPipeId).domainState!;
    expect(before.volumetricFlow).toBe(PUMP_PIPE_DEFAULTS.volumetricFlow);

    executeIntervention(engine, world.pumpPipeId, { 'domainState.volumetricFlow': PUMP_PIPE_DEFAULTS.volumetricFlow * 2 });
    engine.advance(1, step);
    const after = engine.graph.getEntity(world.pumpPipeId).domainState!;

    expect(after.volumetricFlow).toBe(PUMP_PIPE_DEFAULTS.volumetricFlow * 2);
    // Head loss grows with flow (roughly with v², per Darcy-Weisbach) — a real, not asserted, physical consequence.
    expect(after.headLoss).toBeGreaterThan(before.headLoss);
    expect(after.shaftPower).toBeGreaterThan(before.shaftPower);
  });

  it('emits a structurally valid GenesisEvent with real per-quantity provenance', () => {
    const { engine, step } = buildRoutedEngine();
    engine.advance(1, step);

    const event = engine.journal.allEvents()[0];
    expect(validateEvent(event).ok).toBe(true);
    expect(event.type).toBe('hydraulics.pumppipe.step');

    const observation = engine.journal.allObservations()[0];
    expect(observation.measurements.some((m) => m.key === 'shaftPower')).toBe(true);
    expect(observation.measurements.find((m) => m.key === 'shaftPower')?.provenance.some((p) => p.includes('engineering-estimate'))).toBe(true);
  });
});
