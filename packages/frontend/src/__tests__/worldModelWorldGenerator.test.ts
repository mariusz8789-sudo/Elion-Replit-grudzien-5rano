import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { validateEvent } from '../core/events/genesisEvent';
import type { WorldModelEntity } from '../core/worldModel/ecs/types';
import { CHEMISTRY_KINETICS_SOLVER_ID, DEMO_ACTIVATION_ENERGY_KJ, DEMO_PRE_EXPONENTIAL_LOG10, makeChemistryKineticsSolver } from '../core/worldModel/domains/chemistryKinetics';
import { applyDueInterventions, generateWorld } from '../core/worldModel/generation/worldGenerator';
import type { WorldBlueprint } from '../core/worldModel/generation/worldBlueprint';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import type { WorldGraph } from '../core/worldModel/ecs/worldGraph';

/**
 * WORLD GENERATION 1.0: `WorldBlueprint` -> `generateWorld` determinism,
 * hierarchy/relationship correctness across the new PLANET/REGION/
 * MACRO_CITY/BUILDING/ROOM/MESO_LAB/MICRO_MOLECULAR scale chain, and real
 * solver-binding correctness on a generated entity (Priority 13.A-F).
 */
function makeBlueprint(seed: number): WorldBlueprint {
  return {
    worldId: 'gen-test-world',
    seed,
    provenanceNote: 'Test fixture — not a real planet.',
    root: {
      ref: { kind: 'planet', id: 'earth' },
      label: 'Earth',
      scaleLevel: 'PLANET',
      spatial: { position: { x: 0, y: 0, z: 0 } },
      children: [
        {
          ref: { kind: 'region', id: 'r1' },
          label: 'Region One',
          scaleLevel: 'REGION',
          children: [
            {
              ref: { kind: 'city', id: 'c1' },
              label: 'City One',
              scaleLevel: 'MACRO_CITY',
              children: [
                {
                  ref: { kind: 'building', id: 'hospital' },
                  label: 'Hospital Building',
                  scaleLevel: 'BUILDING',
                  generateChildren: {
                    count: 5,
                    refKind: 'room',
                    refIdPrefix: 'room-',
                    label: 'Room',
                    scaleLevel: 'ROOM',
                    positionJitter: { base: { x: 10, y: 0, z: 0 }, radius: 3 },
                  },
                },
                {
                  ref: { kind: 'lab', id: 'lab1' },
                  label: 'Lab',
                  scaleLevel: 'MESO_LAB',
                  children: [
                    {
                      ref: { kind: 'substance', id: 's1' },
                      label: 'Substance',
                      scaleLevel: 'MICRO_MOLECULAR',
                      physics: { massKg: 1, temperatureK: 800 },
                      chemical: { concentrationFraction: 1, formula: 'X', activationEnergyKJ: DEMO_ACTIVATION_ENERGY_KJ, preExponentialLog10: DEMO_PRE_EXPONENTIAL_LOG10 },
                      domainBinding: { solverId: CHEMISTRY_KINETICS_SOLVER_ID, domainId: 'chemistry' },
                      grounding: 'MODEL_ESTIMATE',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    relationships: [{ from: { kind: 'lab', id: 'lab1' }, to: { kind: 'building', id: 'hospital' }, kind: 'nearBy' }],
    interventions: [{ atTick: 2, label: 'cool the substance', target: { kind: 'substance', id: 's1' }, parameters: { 'physics.temperatureK': 700 } }],
  };
}

function canonicalEntities(graph: { listEntities(): readonly WorldModelEntity[] }): string {
  return canonicalJson([...graph.listEntities()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

describe('WorldGenerator (blueprint -> deterministic WorldGraph)', () => {
  it('the same blueprint (same seed) generates a canonically identical world every time', () => {
    const a = generateWorld(makeBlueprint(42));
    const b = generateWorld(makeBlueprint(42));
    expect(canonicalEntities(a.graph)).toBe(canonicalEntities(b.graph));
    expect(a.entityIds).toEqual(b.entityIds);
  });

  it('a different seed produces a structurally identical but numerically different valid world (jittered room positions)', () => {
    const a = generateWorld(makeBlueprint(1));
    const b = generateWorld(makeBlueprint(2));
    expect(a.entityIds).toEqual(b.entityIds); // same identities, same structure
    expect(canonicalEntities(a.graph)).not.toBe(canonicalEntities(b.graph)); // but not byte-identical
    const roomA = a.graph.getEntity('room:room-0');
    const roomB = b.graph.getEntity('room:room-0');
    expect(roomA.spatial!.position).not.toEqual(roomB.spatial!.position);
  });

  it('builds the full PLANET -> REGION -> MACRO_CITY -> BUILDING -> ROOM and MESO_LAB -> MICRO_MOLECULAR hierarchy correctly', () => {
    const { graph } = generateWorld(makeBlueprint(7));
    expect(graph.getEntity('region:r1').scale.parentEntityId).toBe('planet:earth');
    expect(graph.getEntity('city:c1').scale.parentEntityId).toBe('region:r1');
    expect(graph.getEntity('building:hospital').scale.parentEntityId).toBe('city:c1');
    expect(graph.getEntity('lab:lab1').scale.parentEntityId).toBe('city:c1');
    expect(graph.getEntity('substance:s1').scale.parentEntityId).toBe('lab:lab1');
    expect(graph.listChildren('building:hospital')).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(graph.getEntity(`room:room-${i}`).scale.level).toBe('ROOM');
      expect(graph.getEntity(`room:room-${i}`).scale.parentEntityId).toBe('building:hospital');
    }
  });

  it('resolves declared blueprint relationships by ref into real WorldGraph relationships', () => {
    const { graph } = generateWorld(makeBlueprint(7));
    expect(graph.listRelationships()).toEqual([{ from: 'lab:lab1', to: 'building:hospital', kind: 'nearBy' }]);
  });

  it('emits a structurally valid world.generation.completed event carrying the blueprint\'s own seed/worldId', () => {
    const { generationEvent } = generateWorld(makeBlueprint(99));
    expect(validateEvent(generationEvent).ok).toBe(true);
    expect(generationEvent.type).toBe('world.generation.completed');
    expect(generationEvent.parameters.worldId).toBe('gen-test-world');
    expect(generationEvent.parameters.seed).toBe(99);
    expect(generationEvent.provenance?.seed).toBe(99);
  });

  it('a generated entity with a real domainBinding is genuinely solved by the existing SolverRouter — not a static fixture', () => {
    const generated = generateWorld(makeBlueprint(7));
    const engine = new TemporalEngine(generated.graph);
    engine.journal.recordEvent(generated.generationEvent);
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());

    engine.advance(3600, (g, dt, tick) => router.routeTick(g, dt, tick));
    const substance = engine.graph.getEntity('substance:s1');
    expect(substance.chemical?.concentrationFraction).toBeLessThan(1);
    expect(substance.chemical?.concentrationFraction).toBeGreaterThan(0);
    expect(substance.grounding).toBe('MODEL_ESTIMATE');

    // The generation event itself is real, recorded evidence alongside the solver's own.
    expect(engine.journal.allEvents().find((e) => e.type === 'world.generation.completed')).toBeTruthy();
  });

  it('applyDueInterventions applies a blueprint-declared intervention only at its declared tick, via the existing executeIntervention bridge', () => {
    const generated = generateWorld(makeBlueprint(7));
    const blueprint = makeBlueprint(7);
    const engine = new TemporalEngine(generated.graph);
    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    const step = (g: WorldGraph, dt: number, tick: number) => router.routeTick(g, dt, tick);

    expect(applyDueInterventions(engine, blueprint)).toBe(0); // nothing due at tick 0
    engine.advance(3600, step);
    expect(applyDueInterventions(engine, blueprint)).toBe(0); // not due yet at tick 1
    expect(engine.graph.getEntity('substance:s1').physics?.temperatureK).toBe(800);

    engine.advance(3600, step);
    expect(applyDueInterventions(engine, blueprint)).toBe(1); // due exactly at tick 2
    expect(engine.graph.getEntity('substance:s1').physics?.temperatureK).toBe(700);
  });
});
