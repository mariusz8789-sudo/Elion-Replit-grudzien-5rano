import { describe, expect, it } from 'vitest';
import {
  describeWorldMoment,
  explainEntityChange,
  getFrameState,
  getWorldClock,
  type WorldFrameEntity,
} from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisCityWorld, makeGenesisCityRouter, makeGenesisCityUpdater } from '../core/worldModel/domains/genesisCityWorld';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 3, SECTION 7/8: C2 must render every domain through the SAME
 * generic fields, and C1 must be able to ask its standard questions of
 * ANY entity, regardless of which real solver produced its state. This
 * test writes one "renderer" and one "observer" that never branch on
 * domain, and runs them against chemistry, epidemiology, and hydraulics
 * entities alike.
 */

/** Stand-in for C2: builds a generic scene description. Deliberately reads ONLY domain-agnostic WorldFrameEntity fields. */
function renderGenericScene(entities: readonly WorldFrameEntity[]) {
  return entities.map((e) => ({
    id: e.id,
    parentId: e.parentId,
    position: e.transform.position,
    colorHint: e.grounding, // a real renderer would map grounding -> a visual cue, never branch on domainId
    label: e.statusLabel ?? e.label,
    magnitudeSample: Object.values(e.scalars)[0],
  }));
}

describe('C2 renders every domain through the same generic contract', () => {
  it('never needs to know chemistry/epidemiology/hydraulics to build a scene from the multi-domain city', () => {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);
    const router = makeGenesisCityRouter(world.epidemicParams);
    const updater = makeGenesisCityUpdater(router);
    engine.advance(3600, updater);

    const frame = getFrameState(engine);
    const scene = renderGenericScene(frame.entities);

    expect(scene).toHaveLength(frame.entities.length);
    const substanceRow = scene.find((r) => r.id === world.substanceId)!;
    const populationRow = scene.find((r) => r.id === world.populationId)!;
    const pumpPipeRow = scene.find((r) => r.id === world.pumpPipeId)!;
    // The renderer produced a row for each — it needed no per-domain branch to do so.
    expect(substanceRow.parentId).toBe(world.labId);
    expect(populationRow.parentId).toBe(world.hospitalId);
    expect(pumpPipeRow.parentId).toBe(world.waterSystemId);
    expect(typeof substanceRow.label).toBe('string');
    expect(typeof populationRow.label).toBe('string');
    expect(typeof pumpPipeRow.label).toBe('string');
  });
});

describe('C1 asks the same observer questions of any domain', () => {
  it('describeWorldMoment / explainEntityChange / getWorldClock answer for an epidemiology entity exactly as for chemistry', () => {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);
    const router = makeGenesisCityRouter(world.epidemicParams);
    const updater = makeGenesisCityUpdater(router);
    engine.advance(3600, updater);

    const moment = describeWorldMoment(engine, world.populationId);
    expect(moment.latestEvent?.type).toBe('epidemiology.seir.step');
    expect(moment.grounding).toBe('MODEL_ESTIMATE');

    const trace = explainEntityChange(engine, world.populationId);
    expect(trace?.event.type).toBe('epidemiology.seir.step');

    const clock = getWorldClock(engine);
    expect(clock.tick).toBe(1);
    expect(clock.branchId).toBe(engine.branchId);
    expect(clock.canReplay).toBe(true);
  });

  it('answers the same way for a hydraulics entity', () => {
    const world = buildGenesisCityWorld();
    const engine = new TemporalEngine(world.graph);
    const router = makeGenesisCityRouter(world.epidemicParams);
    const updater = makeGenesisCityUpdater(router);
    engine.advance(3600, updater);

    const moment = describeWorldMoment(engine, world.pumpPipeId);
    expect(moment.latestEvent?.type).toBe('hydraulics.pumppipe.step');
    expect(moment.solverId).toBe('hydraulics-pump-pipe-engineering-model');

    const trace = explainEntityChange(engine, world.pumpPipeId);
    expect(trace?.event.affectedEntities.map((e) => e.id)).toContain('pump-pipe-1');
  });
});
