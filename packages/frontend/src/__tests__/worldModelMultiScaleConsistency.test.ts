import { describe, expect, it } from 'vitest';
import { getFrameState, zoomInto } from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisCityWorld, makeGenesisCityRouter, makeGenesisCityUpdater } from '../core/worldModel/domains/genesisCityWorld';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PRIORITY 3 (multi-scale world): `zoomInto`, `WorldFrameEntity.parentId`,
 * and `WorldGraph`'s own parent/child hierarchy must always agree — the
 * mission's "the same world must be navigable across scales without
 * creating a second world," proven across a real multi-domain hierarchy
 * (city -> hospital -> population, city -> lab -> substance, city ->
 * water-system -> pump-pipe), through ticks, replay, and branching.
 *
 * `worldModelScaleBoundary.test.ts` already covers the honest-boundary
 * contract (zoomInto reporting `supported: false` rather than fabricating a
 * deeper scale) and the single-domain zoomInto/replay-timestamp basics; this
 * file covers cross-representation CONSISTENCY, which is a distinct claim.
 */
describe('Multi-scale consistency (Priority 3): zoomInto, WorldFrameEntity.parentId, and WorldGraph hierarchy agree', () => {
  it('every WorldFrameEntity.parentId matches WorldGraph.listChildren for its parent, at the live head', () => {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);

    const frame = getFrameState(engine);
    for (const frameEntity of frame.entities) {
      if (frameEntity.parentId === undefined) continue;
      const siblingIds = engine.graph.listChildren(frameEntity.parentId).map((e) => e.id);
      expect(siblingIds).toContain(frameEntity.id);
    }
  });

  it('zoomInto returns exactly the entities WorldFrameEntity.parentId also points to, for a real populated scale', () => {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);

    const zoom = zoomInto(engine, world.cityId, 'MESO_LAB');
    expect(zoom.supported).toBe(true);
    const zoomIds = zoom.children.map((c) => c.id).sort();

    const frame = getFrameState(engine);
    const frameChildIds = frame.entities.filter((e) => e.parentId === world.cityId && e.scaleLevel === 'MESO_LAB').map((e) => e.id).sort();

    expect(zoomIds).toEqual(frameChildIds);
    expect(zoomIds).toEqual([world.hospitalId, world.labId, world.waterSystemId].sort());
  });

  it('parent/child hierarchy stays consistent after ticks: solver-driven state changes never alter WorldFrameEntity.parentId or zoomInto membership', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(router);

    const before = zoomInto(engine, world.hospitalId, 'MESO_LAB').children.map((c) => c.id);
    for (let i = 0; i < 5; i++) engine.advance(3600, updater);
    const after = zoomInto(engine, world.hospitalId, 'MESO_LAB').children.map((c) => c.id);

    expect(after).toEqual(before);
    expect(getFrameState(engine).entities.find((e) => e.id === world.populationId)?.parentId).toBe(world.hospitalId);
  });

  it('replay (scrubTo via a timestamped getFrameState/zoomInto) reports the SAME hierarchy as the live head — one world, not a second one at each timestamp', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(router);
    for (let i = 0; i < 4; i++) engine.advance(3600, updater);

    const liveZoom = zoomInto(engine, world.cityId, 'MESO_LAB').children.map((c) => c.id).sort();
    const replayedZoom = zoomInto(engine, world.cityId, 'MESO_LAB', 2).children.map((c) => c.id).sort();
    expect(replayedZoom).toEqual(liveZoom); // topology is set at construction, not a per-tick delta — same set at every tick

    const replayedFrame = getFrameState(engine, 2);
    expect(replayedFrame.entities.find((e) => e.id === world.substanceId)?.parentId).toBe(world.labId);
  });

  it('a forked branch reports the identical hierarchy at the fork tick as its parent — multi-scale navigation is not duplicated per branch', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const root = new TemporalEngine(world.graph, { label: 'root' });
    const updater = makeGenesisCityUpdater(router);
    for (let i = 0; i < 3; i++) root.advance(3600, updater);

    const fork = root.forkBranch(3, 'counterfactual', () => {});

    const rootZoom = zoomInto(root, world.cityId, 'MESO_LAB').children.map((c) => c.id).sort();
    const forkZoom = zoomInto(fork, world.cityId, 'MESO_LAB').children.map((c) => c.id).sort();
    expect(forkZoom).toEqual(rootZoom);

    const forkFrame = getFrameState(fork);
    for (const e of forkFrame.entities) {
      if (e.parentId === undefined) continue;
      expect(fork.graph.listChildren(e.parentId).map((c) => c.id)).toContain(e.id);
    }
  });
});
