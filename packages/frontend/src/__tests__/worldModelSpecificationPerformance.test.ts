import { describe, expect, it } from 'vitest';
import { getFrameState, packTransformBuffer } from '../core/worldModel/bridge/worldFrameState';
import { compileSpecification, generateSpecifiedWorld } from '../core/worldModel/specification/compiler';
import { validateSpecification } from '../core/worldModel/specification/validation';
import { validateWorldInvariants } from '../core/worldModel/specification/worldInvariants';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';
import { withEventRules, thresholdCrossingRule } from '../core/worldModel/events/worldEventRules';
import { getDescendants, getStateAtScale } from '../core/worldModel/queries/worldQueries';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * GENERATIVE SCIENTIFIC WORLD MODEL 2.0 — PERFORMANCE AT 1K/5K/10K/25K/50K
 * (mission section 21). Measures the cost of the NEW specification layer
 * itself (validation, compilation, generation, world-invariant checking)
 * plus tick/query/event-processing/branch/replay/WorldFrame-projection cost
 * for a specification-generated world at increasing scale — distinct from
 * (and additional to) the raw generator-level benchmarks already recorded
 * in worldModelWorldGenerationPerformance.test.ts.
 *
 * HONESTY: single-sample, this run/machine, JIT/GC variance included — not
 * a benchmark suite, no performance target, no GPU/rendering claim.
 */
function makeCitySpec(buildingCount: number, seed: number): WorldSpecification {
  const districtCount = 10;
  return {
    worldId: `perf-spec-city-${buildingCount}`,
    seed,
    worldType: ['CITY'],
    geography: { districtCount, buildingsPerDistrict: Math.ceil(buildingCount / districtCount) },
  };
}

describe('Specification pipeline performance at scale (Priority 21)', () => {
  it.each([1000, 5000, 10000, 25000, 50000])('measures validation/compilation/generation/tick/query/event/branch/replay/WorldFrame cost for ~%i entities', (buildingCount) => {
    const spec = makeCitySpec(buildingCount, 1);
    const TICKS = 3;

    const validateStart = performance.now();
    const validation = validateSpecification(spec);
    const validateMs = performance.now() - validateStart;
    expect(validation.ok).toBe(true);

    const compileStart = performance.now();
    const compiled = compileSpecification(spec);
    const compileMs = performance.now() - compileStart;
    expect(compiled.blueprint.worldId).toBe(spec.worldId);

    const generateStart = performance.now();
    const world = generateSpecifiedWorld(spec);
    const generateMs = performance.now() - generateStart;
    expect(world.graph.listEntities().length).toBeGreaterThanOrEqual(buildingCount);

    const invariantStart = performance.now();
    const invariants = validateWorldInvariants(world.graph);
    const invariantMs = performance.now() - invariantStart;
    expect(invariants.ok).toBe(true);

    const engine = new TemporalEngine(world.graph);
    const router = new SolverRouter(); // no real solver bound to generic CITY structure — measures generic per-entity tick bookkeeping, not solver compute (already covered elsewhere)
    const rule = thresholdCrossingRule({ eventType: 'perf.test.moved', read: (e) => e.spatial?.position.x, threshold: 1e9, direction: 'rising' });
    const updater = withEventRules((g, dt, tick) => router.routeTick(g, dt, tick), [rule]);

    const tickStart = performance.now();
    for (let i = 0; i < TICKS; i++) engine.advance(1, updater);
    const tickMs = performance.now() - tickStart;
    expect(engine.historyLength).toBe(TICKS);

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
    expect(fork.graph.listEntities().length).toBe(world.graph.listEntities().length);

    const replayStart = performance.now();
    engine.scrubTo(Math.floor(TICKS / 2));
    const replayMs = performance.now() - replayStart;

    const queryStart = performance.now();
    const cityDescendants = getDescendants(engine, `city:${spec.worldId}`);
    const buildings = getStateAtScale(engine, 'BUILDING');
    const queryMs = performance.now() - queryStart;
    expect(cityDescendants.length).toBeGreaterThan(0);
    expect(buildings.length).toBeGreaterThan(0);

    console.warn(
      `[C3 Specification pipeline perf — measured this run/machine, single sample, not a benchmark] ~${buildingCount} entities:\n` +
        `  validateSpecification: ${validateMs.toFixed(3)}ms\n` +
        `  compileSpecification: ${compileMs.toFixed(3)}ms\n` +
        `  generateSpecifiedWorld (compile+generate+postGenerate+invariants): ${generateMs.toFixed(2)}ms\n` +
        `  validateWorldInvariants (standalone re-check): ${invariantMs.toFixed(3)}ms\n` +
        `  ${TICKS} ticks (generic bookkeeping + event-rule scan, no real solver): ${tickMs.toFixed(2)}ms total (${(tickMs / TICKS).toFixed(4)}ms/tick)\n` +
        `  getFrameState: ${frameMs.toFixed(3)}ms; packTransformBuffer: ${packMs.toFixed(3)}ms\n` +
        `  forkBranch: ${branchMs.toFixed(3)}ms; scrubTo replay: ${replayMs.toFixed(3)}ms\n` +
        `  world queries (getDescendants + getStateAtScale): ${queryMs.toFixed(3)}ms\n` +
        `  GPU / rendering throughput: NOT VERIFIED ON HARDWARE (no GPU attached to this environment; out of C3's scope regardless)`,
    );

    // Generous sanity ceilings only — catch a pathological blowup, never asserted as a target.
    expect(compileMs).toBeLessThan(20_000);
    expect(generateMs).toBeLessThan(30_000);
    expect(tickMs).toBeLessThan(20_000);
    expect(branchMs).toBeLessThan(10_000);
    expect(replayMs).toBeLessThan(10_000);
  });
});
