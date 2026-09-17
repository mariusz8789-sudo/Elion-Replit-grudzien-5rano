import { describe, expect, it } from 'vitest';
import { validateEvent } from '../core/events/genesisEvent';
import { canonicalJson } from '../core/events/hash';
import { compileSpecification, generateSpecifiedWorld } from '../core/worldModel/specification/compiler';
import { validateSpecification } from '../core/worldModel/specification/validation';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import { NEWTONIAN_KINEMATICS_SOLVER_ID, SolverRouter, newtonianKinematicsSolver } from '../core/worldModel/solvers/solverRouter';
import { CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver } from '../core/worldModel/domains/chemistryKinetics';
import { EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver } from '../core/worldModel/domains/epidemicSEIR';
import { HYDRAULICS_PUMP_PIPE_SOLVER_ID, makeHydraulicsPumpPipeSolver } from '../core/worldModel/domains/hydraulicsPumpPipe';
import { DEFAULT_EPIDEMIC } from '../core/epidemic/sir';

/**
 * GENERATIVE SCIENTIFIC WORLD MODEL 2.0 — specification/validation/compiler
 * pipeline tests (mission section 22.A-J subset; the full end-to-end and
 * cross-domain/branch/replay coverage lives in dedicated files alongside
 * this one).
 */
function fullSpec(seed = 1): WorldSpecification {
  return {
    worldId: 'spec-city-1',
    seed,
    worldType: ['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY'],
    scale: 'MACRO_CITY',
    geography: { districtCount: 2, buildingsPerDistrict: 2 },
    population: { count: 50_000 },
    scientificDomains: [
      { domain: 'chemistry', required: true, chemistryOptions: { initialTemperatureK: 800 } },
      { domain: 'hydraulics', required: true },
      { domain: 'epidemiology', required: true },
    ],
    initialConditions: [{ target: { kind: 'substance', id: 's1' }, path: 'physics.temperatureK', value: 750 }],
    interventions: [{ atTick: 2, label: 'cool substance', target: { kind: 'substance', id: 's1' }, parameters: { 'physics.temperatureK': 400 } }],
  };
}

describe('WorldSpecification validation (22.A/B)', () => {
  it('accepts a well-formed specification', () => {
    expect(validateSpecification(fullSpec()).ok).toBe(true);
  });

  it('rejects an unknown template, unknown domain, and out-of-range values', () => {
    const spec = fullSpec();
    const bad: WorldSpecification = {
      ...spec,
      worldType: ['CITY', 'NOT_A_TEMPLATE' as never],
      population: { count: -5 },
      scientificDomains: [{ domain: 'astrology' as never, required: true }],
    };
    const result = validateSpecification(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path.startsWith('worldType'))).toBe(true);
    expect(result.errors.some((e) => e.path === 'population.count')).toBe(true);
    expect(result.errors.some((e) => e.path.startsWith('scientificDomains'))).toBe(true);
  });

  it('warns, but does not fail, a non-required unknown domain under PERMISSIVE grounding', () => {
    const spec = fullSpec();
    const result = validateSpecification({ ...spec, groundingExpectations: 'PERMISSIVE', scientificDomains: [{ domain: 'astrology' as never, required: false }] });
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('fails a non-required unknown domain under STRICT grounding', () => {
    const spec = fullSpec();
    const result = validateSpecification({ ...spec, groundingExpectations: 'STRICT', scientificDomains: [{ domain: 'astrology' as never, required: false }] });
    expect(result.ok).toBe(false);
  });
});

describe('compileSpecification (22.C)', () => {
  it('throws a descriptive error for an invalid specification rather than compiling it', () => {
    const spec = fullSpec();
    expect(() => compileSpecification({ ...spec, worldType: [] })).toThrow(/failed validation/);
  });

  it('is deterministic: the same specification compiles to a canonically identical blueprint every time', () => {
    const a = compileSpecification(fullSpec(7));
    const b = compileSpecification(fullSpec(7));
    expect(canonicalJson(a.blueprint)).toBe(canonicalJson(b.blueprint));
  });

  it('a different seed changes only declared procedural jitter, never the science', () => {
    const a = compileSpecification(fullSpec(1));
    const b = compileSpecification(fullSpec(2));
    expect(canonicalJson(a.blueprint)).not.toBe(canonicalJson(b.blueprint));
    // Same requested structure either way.
    expect(a.blueprint.root.children?.length).toBe(b.blueprint.root.children?.length);
  });

  /**
   * PROVENANCE COMPLETENESS — checked, not assumed: WHICH templates were
   * requested and at WHAT level of detail must survive into the compiled
   * blueprint as STRUCTURED data, not only inside the free-text
   * `provenanceNote` (which a caller-supplied note can silently omit —
   * see `WorldBlueprint.templateIds`'s own doc).
   */
  it('carries worldType and levelOfDetail into the blueprint as structured fields, independent of provenanceNote', () => {
    const withoutLevelOfDetail = compileSpecification(fullSpec());
    expect(withoutLevelOfDetail.blueprint.templateIds).toEqual(['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY']);
    expect(withoutLevelOfDetail.blueprint.levelOfDetail).toBeUndefined(); // fullSpec() never requested one — honestly absent, not defaulted

    const withLevelOfDetail = compileSpecification({ ...fullSpec(), levelOfDetail: 'HIGH', provenanceNote: 'a caller note that never mentions any template' });
    expect(withLevelOfDetail.blueprint.levelOfDetail).toBe('HIGH');
    // Structured templateIds survives even when the caller's own free-text note says nothing about templates.
    expect(withLevelOfDetail.blueprint.templateIds).toEqual(['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY']);
  });
});

describe('generateSpecifiedWorld (22.D-J): composed templates produce one coherent, real world', () => {
  it('composes CITY + LABORATORY + WATER_SYSTEM + EPIDEMIOLOGY into one graph with no id collisions', () => {
    const world = generateSpecifiedWorld(fullSpec());
    const ids = world.graph.listEntities().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids possible: WorldGraph.addEntity would have thrown otherwise anyway

    expect(world.graph.getEntity('building:hospital-building')).toBeTruthy();
    expect(world.graph.getEntity('building:chemistry-lab-building')).toBeTruthy();
    expect(world.graph.getEntity('building:water-system-building')).toBeTruthy();
    expect(world.graph.getEntity('lab:lab1').scale.parentEntityId).toBe('building:chemistry-lab-building');
    expect(world.graph.getEntity('substance:s1').scale.parentEntityId).toBe('lab:lab1');
    expect(world.graph.getEntity('population:city-1').scale.parentEntityId).toBe('building:hospital-building');
    expect(world.graph.getEntity('pump-pipe-system:pump-pipe-1').scale.parentEntityId).toBe('building:water-system-building');
  });

  /**
   * PROVENANCE COMPLETENESS, end to end: the ACTUAL `world.generation.completed`
   * event recorded into a real world's journal — the record an auditor
   * replaying this world later would actually see — carries which templates
   * were requested and at what level of detail, not just seed/entityCount.
   */
  it('the recorded generation event carries templateIds and levelOfDetail as real, queryable parameters', () => {
    const world = generateSpecifiedWorld({ ...fullSpec(), levelOfDetail: 'LOW' });
    const params = world.generated.generationEvent.parameters as Record<string, unknown>;
    expect(params.templateIds).toEqual(['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY']);
    expect(params.levelOfDetail).toBe('LOW');
    // Still a valid, well-formed GenesisEvent — the addition changes what is
    // recorded, never the contract every OTHER consumer of this event relies on.
    expect(validateEvent(world.generated.generationEvent).ok).toBe(true);
  });

  it('applies requested initial conditions once, at generation time, via the real dotted-path patcher', () => {
    const world = generateSpecifiedWorld(fullSpec());
    expect(world.graph.getEntity('substance:s1').physics?.temperatureK).toBe(750); // the initial condition overrode chemistryOptions' 800K
    // Sibling chemical fields must survive the patch untouched.
    expect(world.graph.getEntity('substance:s1').chemical?.concentrationFraction).toBe(1);
  });

  it('binds every requested real solver to its generated entity, and each genuinely advances on tick', () => {
    const world = generateSpecifiedWorld(fullSpec());
    const engine = new TemporalEngine(world.graph);
    engine.journal.recordEvent(world.generated.generationEvent);
    expect(validateEvent(world.generated.generationEvent).ok).toBe(true);

    const router = new SolverRouter();
    router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
    router.register(HYDRAULICS_PUMP_PIPE_SOLVER_ID, makeHydraulicsPumpPipeSolver());
    router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver({ ...DEFAULT_EPIDEMIC, population: 50_000 })); // matches EPIDEMIOLOGY_TEMPLATE's own params computation
    router.register(NEWTONIAN_KINEMATICS_SOLVER_ID, newtonianKinematicsSolver);

    engine.advance(3600, (g, dt, tick) => router.routeTick(g, dt, tick, { [EPIDEMIC_SEIR_SOLVER_ID]: dt / 86400 }));

    expect(engine.graph.getEntity('substance:s1').grounding).not.toBe('UNGROUNDED_APPROXIMATION');
    expect(engine.graph.getEntity('pump-pipe-system:pump-pipe-1').domainState?.headLoss).toBeGreaterThan(0);
    expect(engine.graph.getEntity('population:city-1').domainState?.I).toBeGreaterThan(0);
  });

  it('applies a declared blueprint-level intervention only at its declared tick', () => {
    const world = generateSpecifiedWorld(fullSpec());
    expect(world.compiled.blueprint.interventions).toHaveLength(1);
    expect(world.compiled.blueprint.interventions?.[0].atTick).toBe(2);
  });

  it('a scientific-domain request the compiler cannot satisfy fails validation rather than silently generating', () => {
    const spec = fullSpec();
    expect(() =>
      compileSpecification({ ...spec, scientificDomains: [{ domain: 'nuclear-fusion' as never, required: true }] }),
    ).toThrow(/failed validation/);
  });
});
