import { describe, expect, it } from 'vitest';
import { getFrameState, packTransformBuffer } from '../core/worldModel/bridge/worldFrameState';
import type { WorldBlueprint } from '../core/worldModel/generation/worldBlueprint';
import { generateWorld } from '../core/worldModel/generation/worldGenerator';
import { getDescendants, getNearby, getStateAtScale } from '../core/worldModel/queries/worldQueries';
import { NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, newtonianKinematicsSolver } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * WORLD GENERATION 1.0 — PERFORMANCE AT 1K / 5K / 10K ENTITIES (mission
 * section 14). Measures generation, tick, journal growth, replay, branch,
 * world queries, and WorldFrame projection cost for a world genuinely
 * GENERATED from a `WorldBlueprint` (not hand-assembled), all entities
 * bound to and genuinely solved by the real `newtonianKinematicsSolver`
 * (GROUNDED_EXACT) every tick.
 *
 * HONESTY: single-sample, this run/machine (shared, CPU-only, containerized),
 * JIT/GC variance included — not a benchmark suite, no performance target,
 * no GPU/rendering claim anywhere in this file.
 */
function makeBlueprint(count: number, seed: number): WorldBlueprint {
  return {
    worldId: `perf-world-${count}`,
    seed,
    root: {
      ref: { kind: 'city', id: 'perf-city' },
      label: 'Perf City',
      scaleLevel: 'MACRO_CITY',
      spatial: { position: { x: 0, y: 0, z: 0 } },
      generateChildren: {
        count,
        refKind: 'unit',
        refIdPrefix: 'u',
        label: 'Unit',
        scaleLevel: 'MICRO_MOLECULAR',
        domainBinding: { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'kinematics' },
        physics: { massKg: 1, velocityMS: { x: 1, y: 0, z: 0 } },
        grounding: 'GROUNDED_EXACT',
        positionJitter: { base: { x: 0, y: 0, z: 0 }, radius: count },
      },
    },
  };
}

describe('World Generation 1.0 performance at scale (Priority 14)', () => {
  it.each([1000, 5000, 10000])('measures generation/tick/journal/replay/branch/queries/WorldFrame cost for %i generated entities', (count) => {
    const TICKS = 5;

    const genStart = performance.now();
    const generated = generateWorld(makeBlueprint(count, 1));
    const genMs = performance.now() - genStart;
    expect(generated.entityIds.length).toBe(count + 1); // + the city root

    const engine = new TemporalEngine(generated.graph);
    const router = new SolverRouter();
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);

    const tickStart = performance.now();
    for (let i = 0; i < TICKS; i++) engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));
    const tickMs = performance.now() - tickStart;
    expect(engine.historyLength).toBe(TICKS);

    const journalCount = engine.journal.allEvents().length; // this solver records no events/observations itself — journal growth here is 0 by design (see newtonianKinematicsSolver), an honest measurement, not a gap.

    const frameStart = performance.now();
    const frame = getFrameState(engine);
    const frameMs = performance.now() - frameStart;
    const packStart = performance.now();
    const buffer = packTransformBuffer(frame);
    const packMs = performance.now() - packStart;
    expect(buffer.length).toBe(frame.entities.length * 3);

    const branchStart = performance.now();
    const fork = engine.forkBranch(Math.floor(TICKS / 2), 'perf-fork', () => {});
    const branchMs = performance.now() - branchStart;
    expect(fork.graph.listEntities().length).toBe(count + 1);

    const replayStart = performance.now();
    engine.scrubTo(Math.floor(TICKS / 2));
    const replayMs = performance.now() - replayStart;

    const queryStart = performance.now();
    const descendants = getDescendants(engine, 'city:perf-city');
    const byScale = getStateAtScale(engine, 'MICRO_MOLECULAR');
    const nearby = getNearby(engine, { x: 0, y: 0, z: 0 }, count / 4);
    const queryMs = performance.now() - queryStart;
    expect(descendants.length).toBe(count);
    expect(byScale.length).toBe(count);
    expect(nearby.length).toBeGreaterThan(0);

    console.warn(
      `[C3 World Generation 1.0 perf — measured this run/machine, single sample, not a benchmark] ${count} generated entities:\n` +
        `  generateWorld: ${genMs.toFixed(3)}ms\n` +
        `  ${TICKS} real solver ticks: ${tickMs.toFixed(2)}ms total (${(tickMs / TICKS).toFixed(4)}ms/tick, ${((tickMs / TICKS / count) * 1000).toFixed(4)}µs/entity/tick)\n` +
        `  journal after ${TICKS} ticks: ${journalCount} events (this solver records none by design)\n` +
        `  getFrameState: ${frameMs.toFixed(3)}ms; packTransformBuffer: ${packMs.toFixed(3)}ms\n` +
        `  forkBranch (clone ${count} entities): ${branchMs.toFixed(3)}ms\n` +
        `  scrubTo (replay ${Math.floor(TICKS / 2)} ticks): ${replayMs.toFixed(3)}ms\n` +
        `  world queries (getDescendants + getStateAtScale + getNearby): ${queryMs.toFixed(3)}ms\n` +
        `  GPU / rendering throughput: NOT VERIFIED ON HARDWARE (no GPU attached to this environment; out of C3's scope regardless)`,
    );

    // Generous sanity ceilings only — catch a pathological blowup, never asserted as a target.
    expect(genMs).toBeLessThan(20_000);
    expect(tickMs).toBeLessThan(20_000);
    expect(branchMs).toBeLessThan(10_000);
    expect(replayMs).toBeLessThan(10_000);
    expect(queryMs).toBeLessThan(10_000);
  });
});
