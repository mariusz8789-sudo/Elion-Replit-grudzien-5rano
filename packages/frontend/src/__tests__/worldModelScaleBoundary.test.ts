import { describe, expect, it } from 'vitest';
import { zoomInto } from '../core/worldModel/bridge/worldFrameState';
import { buildChemistryExperimentWorld } from '../core/worldModel/domains/chemistryKinetics';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 2, MULTI-SCALE FIRST REAL PROOF (#8): LAB -> SUBSTANCE (MOLECULAR)
 * within one connected world, and an honest report of the boundary where
 * Genesis has no executable solver for a deeper scale (NANO_ATOMIC) — never
 * a fabricated atomic-level representation.
 */
describe('Multi-scale zoom: one connected world, honest boundary reporting', () => {
  it('zooming from lab to the real MICRO_MOLECULAR substance succeeds within the same world identity', () => {
    const world = buildChemistryExperimentWorld();
    const engine = new TemporalEngine(world.graph);

    const result = zoomInto(engine, world.labId, 'MICRO_MOLECULAR');
    expect(result.supported).toBe(true);
    expect(result.children.map((c) => c.id)).toEqual([world.substanceId]);
    // Same graph instance — not a second, unrelated simulation.
    expect(engine.graph.getEntity(world.substanceId)).toBe(result.children[0]);
  });

  it('zooming deeper than any executable solver explicitly reports the boundary instead of fabricating atomic behaviour', () => {
    const world = buildChemistryExperimentWorld();
    const engine = new TemporalEngine(world.graph);

    const result = zoomInto(engine, world.substanceId, 'NANO_ATOMIC');
    expect(result.supported).toBe(false);
    expect(result.children).toEqual([]);
    expect(result.reason).toMatch(/no executable solver/i);
  });

  it('the boundary report is available at any scrubbed timestamp, not just the live head', () => {
    const world = buildChemistryExperimentWorld();
    const engine = new TemporalEngine(world.graph);
    engine.advance(1, () => {});

    const result = zoomInto(engine, world.substanceId, 'NANO_ATOMIC', 0);
    expect(result.supported).toBe(false);
  });
});
