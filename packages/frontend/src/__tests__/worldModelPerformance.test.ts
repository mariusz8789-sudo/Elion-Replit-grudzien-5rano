import { describe, expect, it } from 'vitest';
import { getFrameState, projectToWorldState } from '../core/worldModel/bridge/worldFrameState';
import {
  CHEMISTRY_KINETICS_SOLVER_ID,
  buildChemistryExperimentWorld,
  makeChemistryKineticsSolver,
} from '../core/worldModel/domains/chemistryKinetics';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 2, PERFORMANCE (#13): measured on THIS run/machine, not fabricated.
 * No specific throughput is promised — only a generous sanity ceiling to
 * catch an accidental infinite loop or pathological blowup.
 */
describe('Performance (measured, not fabricated)', () => {
  it('reports real, measured timings for solver ticks, frame-state generation, serialization, and history growth', () => {
    const world = buildChemistryExperimentWorld({ initialTemperatureK: 800 });
    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    const step: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);

    const TICKS = 500;
    const tickStart = performance.now();
    for (let i = 0; i < TICKS; i++) engine.advance(3600, step);
    const tickMs = performance.now() - tickStart;

    const frameStart = performance.now();
    const frame = getFrameState(engine);
    const frameMs = performance.now() - frameStart;

    const serializeStart = performance.now();
    const serialized = JSON.stringify(frame);
    const serializeMs = performance.now() - serializeStart;

    const worldState = projectToWorldState(engine.graph, 'perf', 'perf', engine.tick, engine.journal.upToTick(engine.tick));

    console.warn(
      `[C3 perf — measured this run, not a general claim] ${TICKS} solver ticks: ${tickMs.toFixed(2)}ms total ` +
        `(${(tickMs / TICKS).toFixed(4)}ms/tick avg); frame-state generation: ${frameMs.toFixed(3)}ms; ` +
        `JSON serialization (${serialized.length} bytes): ${serializeMs.toFixed(3)}ms; ` +
        `temporal history: ${engine.historyLength} frames, ${engine.journal.allEvents().length} events, ` +
        `${engine.journal.allObservations().length} observations recorded.`,
    );

    expect(engine.historyLength).toBe(TICKS);
    expect(worldState.fingerprint).toBeTruthy();
    expect(tickMs).toBeGreaterThan(0);
    expect(frameMs).toBeGreaterThanOrEqual(0);
    expect(serializeMs).toBeGreaterThanOrEqual(0);
    // Sanity ceiling only — not a performance target.
    expect(tickMs).toBeLessThan(30_000);
  });
});
