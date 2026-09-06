import { describe, expect, it } from 'vitest';
import { spawnEntity } from '../core/worldModel/ecs/entityFactory';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, newtonianKinematicsSolver } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import { getFrameState, packTransformBuffer } from '../core/worldModel/bridge/worldFrameState';

/**
 * PRIORITY 9 (performance), LARGE ENTITY COUNT: `worldModelPerformance.test.ts`
 * and `worldModelLevel3Performance.test.ts` already measure real timings, but
 * both run against the small (2-7 entity) demo worlds — they say nothing
 * about how tick/frame-extraction/branch/replay cost scales with entity
 * COUNT, which is the specific gap the mission calls out ("large entity
 * counts where practical").
 *
 * Uses the real, cheap `newtonianKinematicsSolver` (GROUNDED_EXACT — see
 * worldModelSolvers.test.ts) so every one of these entities is genuinely
 * solved every tick, not a static fixture; that keeps the measurement about
 * this world model's own bookkeeping (ECS storage, cloning, delta diff/
 * apply, frame projection), not about the cost of a single solver.
 *
 * HONESTY: numbers below are measured on THIS run, on THIS (shared, CPU-only,
 * containerized) machine — single-sample, JIT/GC-variance included, not a
 * benchmark suite and not a performance target. No GPU/rendering claim is
 * made anywhere in this file; there is no GPU attached to this environment.
 */
describe('Performance at scale (Priority 9): large entity count', () => {
  const ENTITY_COUNT = 2000;
  const TICKS = 20;

  function buildLargeGraph(): { graph: WorldGraph; ids: string[] } {
    const graph = new WorldGraph();
    const ids: string[] = [];
    for (let i = 0; i < ENTITY_COUNT; i++) {
      const id = spawnEntity(graph, {
        ref: { kind: 'particle', id: `p${i}` },
        label: `particle-${i}`,
        scaleLevel: 'MICRO_MOLECULAR',
        spatial: { position: { x: i, y: 0, z: 0 } },
        physics: { massKg: 1, velocityMS: { x: 1, y: 0, z: 0 } },
        domainBinding: { solverId: NEWTONIAN_KINEMATICS_SOLVER_ID, domainId: 'kinematics' },
        grounding: 'GROUNDED_EXACT',
      });
      ids.push(id);
    }
    return { graph, ids };
  }

  it('reports real, measured tick/frame/branch/replay/spatial-query cost for a few-thousand-entity world', () => {
    const { graph, ids } = buildLargeGraph();
    const engine = new TemporalEngine(graph);
    const router = new SolverRouter();
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);

    const tickStart = performance.now();
    for (let i = 0; i < TICKS; i++) engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));
    const tickMs = performance.now() - tickStart;

    // Every entity really was solved every tick — not a sampled subset.
    expect(engine.graph.getEntity(ids[ids.length - 1]).spatial?.position.x).toBeCloseTo(ENTITY_COUNT - 1 + TICKS, 6);

    const frameStart = performance.now();
    const frame = getFrameState(engine);
    const frameMs = performance.now() - frameStart;
    expect(frame.entities).toHaveLength(ENTITY_COUNT);

    const packStart = performance.now();
    const buffer = packTransformBuffer(frame);
    const packMs = performance.now() - packStart;
    expect(buffer.length).toBe(ENTITY_COUNT * 3);

    const forkStart = performance.now();
    const fork = engine.forkBranch(Math.floor(TICKS / 2), 'perf-fork', () => {});
    const forkMs = performance.now() - forkStart;
    expect(fork.graph.listEntities()).toHaveLength(ENTITY_COUNT);

    const scrubStart = performance.now();
    engine.scrubTo(Math.floor(TICKS / 2));
    const scrubMs = performance.now() - scrubStart;

    // `WorldGraph.querySpatialContext` is now backed by Spatial Index 1.0 (ecs/spatialIndex.ts)
    // rather than a linear scan — measure it honestly at this scale rather than assuming it is free.
    const spatialStart = performance.now();
    const nearby = engine.graph.querySpatialContext({ x: ENTITY_COUNT / 2, y: 0, z: 0 }, 5);
    const spatialMs = performance.now() - spatialStart;
    expect(nearby.length).toBeGreaterThan(0);

    const heapMB = process.memoryUsage().heapUsed / (1024 * 1024);

    console.warn(
      `[C3 scale perf — measured this run/machine, single sample, not a benchmark] ${ENTITY_COUNT} entities, ` +
        `1 real solver/tick:\n` +
        `  ${TICKS} ticks: ${tickMs.toFixed(2)}ms total (${(tickMs / TICKS).toFixed(4)}ms/tick, ${((tickMs / TICKS / ENTITY_COUNT) * 1000).toFixed(4)}µs/entity/tick)\n` +
        `  getFrameState (${frame.entities.length} entities): ${frameMs.toFixed(3)}ms\n` +
        `  packTransformBuffer: ${packMs.toFixed(3)}ms\n` +
        `  forkBranch (clone ${ENTITY_COUNT} entities): ${forkMs.toFixed(3)}ms\n` +
        `  scrubTo (replay ${Math.floor(TICKS / 2)} ticks): ${scrubMs.toFixed(3)}ms\n` +
        `  querySpatialContext (Spatial Index 1.0): ${spatialMs.toFixed(3)}ms\n` +
        `  Node heap sample: ${heapMB.toFixed(2)}MB (GC-dependent, indicative only)\n` +
        `  GPU / rendering throughput: NOT VERIFIED ON HARDWARE (no GPU attached to this environment; out of C3's scope regardless)`,
    );

    expect(tickMs).toBeGreaterThan(0);
    expect(frameMs).toBeGreaterThanOrEqual(0);
    expect(forkMs).toBeGreaterThanOrEqual(0);
    expect(scrubMs).toBeGreaterThanOrEqual(0);
    // Generous sanity ceilings only — catch a pathological blowup (e.g. an accidental O(n^2)
    // somewhere), never asserted as a performance target.
    expect(tickMs).toBeLessThan(20_000);
    expect(forkMs).toBeLessThan(5_000);
    expect(scrubMs).toBeLessThan(5_000);
  });
});
