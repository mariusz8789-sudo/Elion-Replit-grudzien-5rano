import { describe, expect, it } from 'vitest';
import { openLookingGlass } from '../core/lookingGlass/scenarioSession';
import { classifyEvent } from '../core/lookingGlass/eventInspection';
import { scalarDeltasOf } from '../core/lookingGlass/worldModelMoment';

/**
 * LOOKING GLASS x C3 — THE FIRST DOMAIN BACKED BY THE REAL WORLD MODEL.
 *
 * Every earlier Looking Glass domain (epidemic, laboratory) is driven by
 * `scenarioEngine.ts`/`hypothesisLoop.ts`. Chemistry is the first to run on
 * `core/worldModel/*` — a live `TemporalEngine` advancing a real Arrhenius
 * kinetics solver — proving `openLookingGlass` genuinely reads three
 * different engines through one contract, not two.
 */

const KINETICS_SENTENCE = 'Show the chemical kinetics decay of a substance at 750K over 12 hours from a scientist';
const COMPARE_SENTENCE = 'Compare the chemical kinetics decay of a substance over 12 hours from a scientist';

describe('Looking Glass — chemistry kinetics resolves through the real C3 engine', () => {
  it('parses and resolves to READY with the WORLD_MODEL_CHEMISTRY binding', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    expect(session.request.kind).toBe('CHEMICAL_KINETICS');
    expect(session.request.family).toBe('MOLECULAR');
    expect(session.resolution.status).toBe('READY');
    expect(session.producedBy).toMatch(/worldModel\.TemporalEngine/);
  });

  it('does NOT get misrouted onto CHEMICAL_REACTION\'s RDKit vocabulary', () => {
    // The two kinds must never collide on keyword detection — different
    // engines answer different questions and must not be interchangeable.
    const kinetics = openLookingGlass(KINETICS_SENTENCE);
    const reaction = openLookingGlass('Show a chemical reaction with a catalyst and a compound');
    expect(kinetics.request.kind).toBe('CHEMICAL_KINETICS');
    expect(reaction.request.kind).toBe('CHEMICAL_REACTION');
  });

  it('produces real, monotonically decaying states — not a curve drawn for the camera', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    expect(session.states.length).toBe(13); // tick 0 through 12
    const fractions = session.states.map((state) => {
      const entity = state.entities.find((e) => e.ref.kind === 'substance')!;
      return entity.properties.find((p) => p.key === 'chemical.concentrationFraction')!.value as number;
    });
    expect(fractions[0]).toBe(1);
    for (let i = 1; i < fractions.length; i++) expect(fractions[i]).toBeLessThan(fractions[i - 1]);
    // Real Arrhenius decay at 750K over 12h with the demo kinetics — visibly
    // decayed, not annihilated and not imperceptible.
    expect(fractions.at(-1)!).toBeLessThan(0.99);
    expect(fractions.at(-1)!).toBeGreaterThan(0);
  });

  it('every state honestly discloses MODEL_ESTIMATE grounding, never GROUNDED_EXACT', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    for (const state of session.states) {
      const entity = state.entities.find((e) => e.ref.kind === 'substance')!;
      expect(entity.properties.find((p) => p.key === 'grounding')!.value).toBe('MODEL_ESTIMATE');
    }
  });

  it('has no 3D world route yet — Looking Glass does not fabricate a renderer C2 has not built', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    expect(session.worldRoute).toBeNull();
    expect(session.enterWorld()).toBe(false);
  });

  it('classifies its real events through the SAME domain-agnostic suffix rule as every other domain', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    const events = session.world!.getInspectableEvents();
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) expect(classifyEvent(event.type)).toBe(event.semanticKind);
    // "chemistry.kinetics.step" ends in a STATE_CHANGE-suffixed word family via 'change'-like endings? It doesn't —
    // verify it lands somewhere real rather than asserting a guessed bucket.
    expect(events.every((event) => event.semanticKind !== undefined)).toBe(true);
  });

  it('honestly reports replay as unavailable — this engine has no replay-verification pipeline wired yet', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    const events = session.world!.getInspectableEvents();
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.replay.available).toBe(false);
      expect(event.replay.reason).toMatch(/no replay verdict/);
    }
  });
});

describe('Looking Glass — describeEntityMoment: before/after/why through the real C3 bridge', () => {
  it('is null for domains with no live TemporalEngine (epidemic, laboratory)', () => {
    const epidemic = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    const lab = openLookingGlass('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist');
    expect(epidemic.describeEntityMoment(1)).toBeNull();
    expect(lab.describeEntityMoment(1)).toBeNull();
  });

  it('is null at a tick this branch never reached', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    expect(session.describeEntityMoment(999)).toBeNull();
  });

  it('reports scalarsBefore as null at tick 0 — there is no moment before the run started', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    const moment = session.describeEntityMoment(0)!;
    expect(moment).not.toBeNull();
    expect(moment.scalarsBefore).toBeNull();
  });

  it('reports a real before/after pair whose numbers match the state series exactly', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    const moment = session.describeEntityMoment(3)!;
    expect(moment).not.toBeNull();
    expect(moment.scalarsBefore).not.toBeNull();

    const stateAt = (tick: number) => {
      const state = session.states.find((s) => s.tick === tick)!;
      const entity = state.entities.find((e) => e.ref.kind === 'substance')!;
      return entity.properties.find((p) => p.key === 'chemical.concentrationFraction')!.value as number;
    };
    expect(moment.scalarsNow.concentrationFraction).toBeCloseTo(stateAt(3), 10);
    expect(moment.scalarsBefore!.concentrationFraction).toBeCloseTo(stateAt(2), 10);
    expect(moment.scalarsNow.concentrationFraction).toBeLessThan(moment.scalarsBefore!.concentrationFraction);
  });

  it('carries a real cause from explainEntityChange, never an invented narrative', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    const moment = session.describeEntityMoment(2)!;
    expect(moment.why).toBe('arrhenius-first-order-decay');
    expect(moment.latestEventType).toBe('chemistry.kinetics.step');
  });

  it('scalarDeltasOf reports only keys that actually changed, with real before/after values', () => {
    const session = openLookingGlass(KINETICS_SENTENCE);
    const moment = session.describeEntityMoment(3)!;
    const deltas = scalarDeltasOf(moment);
    const concentration = deltas.find((d) => d.key === 'concentrationFraction')!;
    expect(concentration).toBeDefined();
    expect(concentration.absoluteDelta).toBeLessThan(0); // decaying, so after < before
    expect(concentration.after).toBe(moment.scalarsNow.concentrationFraction);
    expect(concentration.before).toBe(moment.scalarsBefore!.concentrationFraction);
  });
});

describe('Looking Glass — branch comparison through the real C3 bridge', () => {
  it('produces a real, divergent comparison only when comparison was requested', () => {
    const notCompared = openLookingGlass(KINETICS_SENTENCE);
    expect(notCompared.request.comparison).toBe(false);
    expect(notCompared.comparison).toBeNull();

    const compared = openLookingGlass(COMPARE_SENTENCE);
    expect(compared.request.comparison).toBe(true);
    expect(compared.comparison).not.toBeNull();
    expect(compared.comparison!.status).toBe('READY');
    expect(compared.comparison!.producedBy).toMatch(/worldModel\.compareBranches/);
  });

  it('the cooled branch genuinely decayed slower — a real physical consequence, not a relabeled clone', () => {
    const compared = openLookingGlass(COMPARE_SENTENCE);
    const concentration = compared.comparison!.metrics.find((m) => m.key === 'concentrationFraction')!;
    expect(concentration).toBeDefined();
    // baseline = uncooled branch, variant = cooled branch: cooled retains MORE substance.
    expect(concentration.variant).toBeGreaterThan(concentration.baseline);
  });

  it('carries no fabricated evidence — this engine has no saved counterfactual artifact behind it', () => {
    const compared = openLookingGlass(COMPARE_SENTENCE);
    expect(compared.comparison!.evidence).toBeNull();
  });

  it('never commits to Scientific Memory — honestly unsupported for this engine, not silently dropped', () => {
    const compared = openLookingGlass(COMPARE_SENTENCE);
    expect(compared.commitComparisonToMemory()).toBeNull();
  });
});
