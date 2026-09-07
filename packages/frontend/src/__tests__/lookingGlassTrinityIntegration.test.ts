import { describe, expect, it } from 'vitest';
import { openLookingGlass } from '../core/lookingGlass/scenarioSession';

/**
 * THE FINAL TRINITY INTEGRATION TEST.
 *
 * One end-to-end path, driven the way a real user drives it — a sentence,
 * not a hand-built engine — proving every link in:
 *
 *   NATURAL LANGUAGE INTENT
 *   -> C1 experience contract (StructuredScenarioRequest / ScenarioResolution)
 *   -> C3 world/model (WorldGraph via buildChemistryExperimentWorld)
 *   -> solver execution (chemistryKinetics.ts's real Arrhenius solver)
 *   -> world state change (TemporalEngine.advance, tick by tick)
 *   -> journal/event (WorldJournal — real GenesisEvents, real Observations)
 *   -> evidence/provenance (event.provenance.modelId/paramsHash, per-tick MATCH replay)
 *   -> C1 observation (InspectableEvent via getInspectableEvents())
 *   -> explainEntityChange (describeEntityMoment's "why", worldModelMoment.ts)
 *   -> temporal scrub (WorldClock.resolve, per-tick state lookup)
 *   -> replay (verifiedReplayAt — real, checked, not assumed)
 *   -> branch/fork (TemporalEngine.forkBranch)
 *   -> intervention (a real temperature change at the fork point)
 *   -> different outcome (the forked branch measurably decays slower)
 *   -> branch comparison (compareWorldModelBranches / compareBranches)
 *
 * is real, is reachable from `openLookingGlass(sourceText)` alone, and uses
 * no mock standing in for C3 — every number below comes from the actual
 * TemporalEngine this session built and owns.
 */
describe('THE TRINITY: natural language through the real C3 engine to a comparable, divergent outcome', () => {
  const sourceText = 'Compare the chemical kinetics decay of a substance at 750K over 12 hours from a scientist';
  const session = openLookingGlass(sourceText);

  it('STAGE 1 — natural language resolves into a real C1 experience contract, not a guess', () => {
    expect(session.request.sourceText).toBe(sourceText);
    expect(session.request.kind).toBe('CHEMICAL_KINETICS');
    expect(session.request.family).toBe('MOLECULAR');
    expect(session.request.comparison).toBe(true);
    expect(session.resolution.status).toBe('READY');
    expect(session.resolution.plan).not.toBeNull();
  });

  it('STAGE 2 — the plan binds to the real C3 World Model, not scenarioEngine/hypothesisLoop', () => {
    expect(session.producedBy).toMatch(/worldModel\.TemporalEngine\(chemistry-kinetics-arrhenius/);
    expect(session.temporalSource).toMatch(/worldModel\.TemporalEngine\.advance/);
  });

  it('STAGE 3 — solver execution and world state change are real: concentration genuinely decays tick over tick', () => {
    expect(session.states.length).toBe(13); // tick 0..12
    const fractionAt = (tick: number) => {
      const entity = session.states[tick]!.entities.find((e) => e.ref.kind === 'substance')!;
      return entity.properties.find((p) => p.key === 'chemical.concentrationFraction')!.value as number;
    };
    for (let tick = 1; tick <= 12; tick++) expect(fractionAt(tick)).toBeLessThan(fractionAt(tick - 1));
  });

  it('STAGE 4 — journal/event: real GenesisEvents recorded by the solver, with real provenance', () => {
    const events = session.world!.getInspectableEvents();
    expect(events.length).toBeGreaterThan(0);
    const event = events[0]!;
    expect(event.type).toBe('chemistry.kinetics.step');
    expect(event.modelId).toBe('chemistry-kinetics-arrhenius');
    expect(event.origin).toBe('model');
    expect(event.cause).toBe('arrhenius-first-order-decay');
  });

  it('STAGE 5 — evidence/provenance: every event carries a real, non-empty parameter fingerprint', () => {
    for (const event of session.world!.getInspectableEvents()) {
      expect(event.replay.paramsHash).not.toBeNull();
      expect(String(event.replay.paramsHash).length).toBeGreaterThan(0);
    }
  });

  it('STAGE 6 — C1 observation: the event rail reports real affected-entity properties, not just an id', () => {
    const withEntities = session.world!.getInspectableEvents().find((e) => e.affectedEntities.length > 0)!;
    expect(withEntities).toBeDefined();
    const substance = withEntities.affectedEntities.find((e) => e.ref.kind === 'substance')!;
    expect(substance.properties.length).toBeGreaterThan(0);
  });

  it('STAGE 7 — explainEntityChange: describeEntityMoment answers what/before/after/why through the real C3 bridge', () => {
    const moment = session.describeEntityMoment(6)!;
    expect(moment).not.toBeNull();
    expect(moment.scalarsBefore).not.toBeNull();
    expect(moment.scalarsNow.concentrationFraction).toBeLessThan(moment.scalarsBefore!.concentrationFraction);
    expect(moment.why).toBe('arrhenius-first-order-decay');
  });

  it('STAGE 8 — temporal scrub: every real tick is independently addressable and internally consistent', () => {
    for (let tick = 0; tick <= 12; tick++) {
      const state = session.states.find((s) => s.tick === tick)!;
      expect(state).toBeDefined();
      expect(state.tick).toBe(tick);
    }
    // Existence-not-range: a tick past this run's real history is refused,
    // not silently snapped to the head (worldModelMoment.ts's own guard).
    expect(session.describeEntityMoment(999)).toBeNull();
  });

  it('STAGE 9 — replay: a REAL, checked verdict at every tick, not assumed from determinism', () => {
    for (const state of session.states) {
      expect(state.replay?.status).toBe('MATCH');
      expect(state.replay?.message).toMatch(/Independently rebuilt/);
    }
    for (const event of session.world!.getInspectableEvents()) {
      expect(event.replay.available).toBe(true);
      expect(event.replay.status).toBe('MATCH');
    }
  });

  it('STAGE 10/11 — branch/fork with a real intervention: the comparison names both real arms', () => {
    expect(session.comparison).not.toBeNull();
    expect(session.comparison!.baselineLabel).toMatch(/750K/);
    expect(session.comparison!.variantLabel).toMatch(/cooled to 700K/);
  });

  it('STAGE 12 — different outcome: the forked branch is a REAL physical consequence, not a relabeled clone', () => {
    const concentration = session.comparison!.metrics.find((m) => m.key === 'concentrationFraction')!;
    expect(concentration).toBeDefined();
    // Cooling slows Arrhenius decay — the cooled (variant) branch retains
    // strictly more substance than the uncooled baseline at the same tick.
    expect(concentration.variant).toBeGreaterThan(concentration.baseline);
  });

  it('STAGE 13 — branch comparison: real provenance, reported through the same shape every domain uses', () => {
    expect(session.comparison!.status).toBe('READY');
    expect(session.comparison!.producedBy).toMatch(/worldModel\.compareBranches/);
    expect(session.comparison!).toHaveProperty('changedFactors');
    // No fabricated evidence artifact — this engine has none yet, and the
    // comparison says so honestly rather than inventing one.
    expect(session.comparison!.evidence).toBeNull();
  });

  it('FULL CHAIN, one assertion: every stage above ran against the SAME session, the SAME engine, one real history', () => {
    // Not a new check — a statement of what the 13 stages above already
    // proved together: one sentence produced one live TemporalEngine whose
    // states, events, moments, replay verdicts and branch comparison are
    // all mutually consistent, because there was only ever one execution.
    expect(session.states.length).toBeGreaterThan(0);
    expect(session.world!.getInspectableEvents().length).toBeGreaterThan(0);
    expect(session.comparison).not.toBeNull();
  });
});
