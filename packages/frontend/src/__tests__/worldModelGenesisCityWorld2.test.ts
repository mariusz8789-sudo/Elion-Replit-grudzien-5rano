import { describe, expect, it } from 'vitest';
import { validateEvent } from '../core/events/genesisEvent';
import { executeIntervention, getFrameState } from '../core/worldModel/bridge/worldFrameState';
import {
  buildGenesisCityWorld2,
  OUTBREAK_EVENT_TYPE,
  WATER_SERVICE_INTERRUPTED_EVENT_TYPE,
} from '../core/worldModel/domains/genesisCityWorld2';
import { getCausalDependencies, getDescendants, getRelated, getStateAtScale, getWorldRegion } from '../core/worldModel/queries/worldQueries';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * GENESIS CITY WORLD 2.0 — the canonical World Generation 1.0 reference
 * world. Proves the generated multi-scale structure is real (not a static
 * fixture), that the three pre-existing real solvers still run correctly on
 * generated entities, and that the new generic event-rule / cascade-rule
 * mechanisms produce real, traceable consequences — never fabricated for
 * display (Priority 13.L/M/N).
 */
describe('Genesis City World 2.0 (generated, multi-domain, multi-scale reference world)', () => {
  it('generates the full declared hierarchy: city -> districts/buildings/roads, and building -> real leaf entities', () => {
    const world = buildGenesisCityWorld2();
    expect(world.districtIds).toHaveLength(3);
    expect(world.roadIds).toHaveLength(4);
    for (const districtId of world.districtIds) expect(world.graph.getEntity(districtId).scale.parentEntityId).toBe(world.cityId);
    for (const roadId of world.roadIds) expect(world.graph.getEntity(roadId).scale.parentEntityId).toBe(world.cityId);

    expect(world.graph.getEntity(world.populationId).scale.parentEntityId).toBe(world.hospitalBuildingId);
    expect(world.graph.getEntity(world.labId).scale.parentEntityId).toBe(world.labBuildingId);
    expect(world.graph.getEntity(world.substanceId).scale.parentEntityId).toBe(world.labId);
    expect(world.graph.getEntity(world.pumpPipeId).scale.parentEntityId).toBe(world.waterSystemBuildingId);

    // Generic structure is honestly ungrounded — no fabricated science at scales nothing solves.
    for (const districtId of world.districtIds) expect(world.graph.getEntity(districtId).grounding).toBe('UNGROUNDED_APPROXIMATION');
    expect(world.graph.getEntity(world.environmentId).grounding).toBe('UNGROUNDED_APPROXIMATION');
  });

  it('the declared pump-pipe -> hospital-building relationship resolves correctly', () => {
    const world = buildGenesisCityWorld2();
    expect(world.graph.listRelationships()).toEqual([{ from: world.pumpPipeId, to: world.hospitalBuildingId, kind: 'feedsInto' }]);
  });

  it('same seed generates a canonically identical world; a different seed only changes declared jitter (district positions)', () => {
    const a = buildGenesisCityWorld2({ seed: 5 });
    const b = buildGenesisCityWorld2({ seed: 5 });
    const c = buildGenesisCityWorld2({ seed: 6 });
    expect(a.graph.getEntity(a.districtIds[0]).spatial).toEqual(b.graph.getEntity(b.districtIds[0]).spatial);
    expect(a.graph.getEntity(a.districtIds[0]).spatial).not.toEqual(c.graph.getEntity(c.districtIds[0]).spatial);
    // Real science is never affected by the generation seed.
    expect(a.epidemicParams).toEqual(c.epidemicParams);
  });

  it('all three real solvers genuinely advance their generated leaf entities over real ticks', () => {
    const world = buildGenesisCityWorld2();
    const engine = new TemporalEngine(world.graph);
    engine.journal.recordEvent(world.generated.generationEvent);

    for (let i = 0; i < 3; i++) engine.advance(3600, world.updater);

    const substance = engine.graph.getEntity(world.substanceId);
    expect(substance.grounding).not.toBe('UNGROUNDED_APPROXIMATION');
    const population = engine.graph.getEntity(world.populationId);
    expect(population.domainState?.I).toBeGreaterThan(0);
    const pumpPipe = engine.graph.getEntity(world.pumpPipeId);
    expect(pumpPipe.domainState?.headLoss).toBeGreaterThan(0);
  });

  it('the generic outbreak threshold-crossing event rule fires exactly once, from real SEIR compartment state', () => {
    const world = buildGenesisCityWorld2({ outbreakThreshold: 200 });
    const engine = new TemporalEngine(world.graph);

    for (let day = 0; day < 40; day++) engine.advance(3600 * 24, world.updater);

    const outbreakEvents = engine.journal.allEvents().filter((e) => e.type === OUTBREAK_EVENT_TYPE);
    expect(outbreakEvents).toHaveLength(1);
    expect(validateEvent(outbreakEvents[0]).ok).toBe(true);
    expect(outbreakEvents[0].parameters.newValue).toBeGreaterThanOrEqual(200);
    expect(outbreakEvents[0].provenance?.origin).toBe('consequence-rule');
  });

  it('the cascade rule flags the hospital building only after the real hydraulics solver reports zero flow — a genuine consequence, not fabricated', () => {
    const world = buildGenesisCityWorld2();
    const engine = new TemporalEngine(world.graph);

    engine.advance(3600, world.updater);
    expect(engine.graph.getEntity(world.hospitalBuildingId).domainState?.waterServiceInterrupted).toBeUndefined();
    expect(engine.journal.allEvents().some((e) => e.type === WATER_SERVICE_INTERRUPTED_EVENT_TYPE)).toBe(false);

    executeIntervention(engine, world.pumpPipeId, { 'domainState.volumetricFlow': 0 });
    engine.advance(3600, world.updater);

    const hospital = engine.graph.getEntity(world.hospitalBuildingId);
    expect(hospital.domainState?.waterServiceInterrupted).toBe(1);
    expect(hospital.statusLabel).toMatch(/interrupted/i);
    const interruptionEvents = engine.journal.allEvents().filter((e) => e.type === WATER_SERVICE_INTERRUPTED_EVENT_TYPE);
    expect(interruptionEvents).toHaveLength(1);
    expect(interruptionEvents[0].parameters.triggerEntity).toBe(world.pumpPipeId);

    // Stays flagged, but the cascade does not re-fire an identical event every subsequent tick.
    engine.advance(3600, world.updater);
    expect(engine.journal.allEvents().filter((e) => e.type === WATER_SERVICE_INTERRUPTED_EVENT_TYPE)).toHaveLength(1);
  });

  it('WorldFrame bridge stays fully compatible with the generated world', () => {
    const world = buildGenesisCityWorld2();
    const engine = new TemporalEngine(world.graph);
    engine.advance(3600, world.updater);

    const frame = getFrameState(engine);
    expect(frame.entities.length).toBeGreaterThan(10);
    const populationFrame = frame.entities.find((e) => e.id === world.populationId)!;
    expect(populationFrame.parentId).toBe(world.hospitalBuildingId);
    expect(typeof populationFrame.scalars.I).toBe('number');
  });

  it('the query layer answers real questions about the generated world', () => {
    const world = buildGenesisCityWorld2();
    const engine = new TemporalEngine(world.graph);

    const region = getWorldRegion(engine, world.waterSystemBuildingId);
    expect(region.entities.map((e) => e.id)).toEqual(expect.arrayContaining([world.waterSystemBuildingId, world.pumpPipeId]));

    const descendants = getDescendants(engine, world.cityId);
    expect(descendants.map((e) => e.id)).toEqual(expect.arrayContaining([...world.districtIds, ...world.roadIds, world.hospitalBuildingId, world.populationId, world.pumpPipeId]));

    const related = getRelated(engine, world.pumpPipeId, 'feedsInto');
    expect(related).toEqual([{ relationshipKind: 'feedsInto', direction: 'outgoing', entity: engine.graph.getEntity(world.hospitalBuildingId) }]);

    const deps = getCausalDependencies(engine, world.hospitalBuildingId);
    expect(deps.dependents.map((r) => r.id)).toContain('pump-pipe-1');

    const buildings = getStateAtScale(engine, 'BUILDING');
    expect(buildings.map((e) => e.id)).toEqual(expect.arrayContaining([world.hospitalBuildingId, world.labBuildingId, world.waterSystemBuildingId, world.environmentId]));
  });
});
