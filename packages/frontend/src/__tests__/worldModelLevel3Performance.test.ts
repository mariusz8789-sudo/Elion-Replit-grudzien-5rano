import { describe, expect, it } from 'vitest';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisCityWorld, makeGenesisCityRouter, makeGenesisCityUpdater } from '../core/worldModel/domains/genesisCityWorld';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 3, PERFORMANCE (section 10): measured on THIS run/machine for the
 * multi-domain (three real solvers per tick) world. No throughput is
 * promised — only real numbers and a generous sanity ceiling. This test
 * environment has no GPU/rendering pipeline attached, so anything
 * GPU-dependent is explicitly marked NOT VERIFIED ON HARDWARE rather than
 * fabricated.
 */
describe('Level 3 performance (measured, multi-domain world)', () => {
  it('reports real, measured timings for a multi-domain tick, WorldFrame generation, fork, and journal growth', () => {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);
    const router = makeGenesisCityRouter(world.epidemicParams);
    const updater = makeGenesisCityUpdater(router);

    const TICKS = 200;
    const tickStart = performance.now();
    for (let i = 0; i < TICKS; i++) engine.advance(3600, updater);
    const tickMs = performance.now() - tickStart;

    const frameStart = performance.now();
    const frame = getFrameState(engine);
    const frameMs = performance.now() - frameStart;

    const forkStart = performance.now();
    const fork = engine.forkBranch(Math.floor(TICKS / 2), 'perf-fork', () => {});
    const forkMs = performance.now() - forkStart;

    const scrubStart = performance.now();
    engine.scrubTo(Math.floor(TICKS / 2));
    const scrubMs = performance.now() - scrubStart;

    const heapBeforeMB = process.memoryUsage().heapUsed / (1024 * 1024);
    const events = engine.journal.allEvents();
    const observations = engine.journal.allObservations();
    const heapAfterMB = process.memoryUsage().heapUsed / (1024 * 1024);

    console.warn(
      `[C3 Level 3 perf — measured this run/machine, not a general claim]\n` +
        `  multi-domain (3 real solvers) tick: ${TICKS} ticks in ${tickMs.toFixed(2)}ms (${(tickMs / TICKS).toFixed(4)}ms/tick avg)\n` +
        `  WorldFrame generation (${frame.entities.length} entities): ${frameMs.toFixed(3)}ms\n` +
        `  forkBranch: ${forkMs.toFixed(3)}ms; scrubTo: ${scrubMs.toFixed(3)}ms\n` +
        `  journal: ${events.length} events, ${observations.length} observations, ` +
        `heap sample ${heapBeforeMB.toFixed(2)}MB -> ${heapAfterMB.toFixed(2)}MB (Node heap, GC-dependent, indicative only)\n` +
        `  GPU / rendering throughput: NOT VERIFIED ON HARDWARE (this environment has no attached GPU/renderer)`,
    );

    expect(engine.historyLength).toBe(TICKS);
    // 3 real steps/tick x TICKS, all recorded — nothing silently skipped.
    expect(events.length).toBe(TICKS * 3);
    expect(fork.historyLength).toBe(0); // a fresh fork starts its own, empty history
    expect(tickMs).toBeGreaterThan(0);
    expect(frameMs).toBeGreaterThanOrEqual(0);
    expect(forkMs).toBeGreaterThanOrEqual(0);
    // Sanity ceiling only — not a performance target.
    expect(tickMs).toBeLessThan(60_000);
  });
});
