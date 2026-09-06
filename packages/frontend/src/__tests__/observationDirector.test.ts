import { describe, expect, it } from 'vitest';
import { openLookingGlass } from '../core/lookingGlass/scenarioSession';
import { parseObservationIntent } from '../core/lookingGlass/observationIntent';
import { buildSemanticTimeline, explainEntity, findEntity, findEvent, propertyDeltasOf, resolveObservation } from '../core/lookingGlass/observationDirector';

/**
 * LOOKING GLASS 2.0 — THE OBSERVATION DIRECTOR, AGAINST REAL SESSIONS.
 *
 * Every assertion below resolves an intent against an ACTUAL open session —
 * a real epidemic run, a real Arrhenius decay, a real Darcy-Weisbach
 * steady-state system — never a hand-built fixture standing in for one.
 */

const CHEMISTRY_SENTENCE = 'Show the chemical kinetics decay of a substance at 750K over 12 hours from a scientist';
const HYDRAULICS_SENTENCE = 'Show the hydraulic pump-pipe system over 6 hours from the operator';
const CITY_SENTENCE = 'Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy';

describe('Looking Glass — resolveObservation: entity and time resolution against real worlds', () => {
  it('resolves a real target entity by name, in a real epidemic session', () => {
    const session = openLookingGlass(CITY_SENTENCE);
    const intent = parseObservationIntent('Show me the hospital.');
    const result = resolveObservation(intent, session, 0);
    expect(result.focusEntity).not.toBeNull();
    expect(result.focusEntity!.label.toLowerCase()).toContain('hospital');
    expect(result.status).toBe('RESOLVED');
  });

  it('resolves a real target entity in a real C3-backed chemistry session', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Follow the substance.');
    const result = resolveObservation(intent, session, 2);
    expect(result.focusEntity).not.toBeNull();
    expect(result.focusEntity!.ref.kind).toBe('substance');
  });

  it('honestly reports NOT_MODELLED when the named target does not exist in this run', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Show me the dragon.');
    const result = resolveObservation(intent, session, 2);
    expect(result.focusEntity).toBeNull();
    expect(result.status).toBe('NOT_MODELLED');
    expect(result.reasons.join(' ')).toMatch(/no entity matching "dragon"/);
  });

  it('RELATIVE time moves off the CURRENT tick, resolved through the real WorldClock — never a second clock', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Show me the substance 3 hours later.');
    const result = resolveObservation(intent, session, 2);
    expect(result.time!.granted).toBe(true);
    expect(result.time!.worldTime).toBe(5);
  });

  it('a RELATIVE time request in a unit this world does not use is honestly refused, not silently converted', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE); // this world advances in HOUR ticks
    const intent = parseObservationIntent('Show me the substance 2 days later.');
    const result = resolveObservation(intent, session, 2);
    expect(result.time!.granted).toBe(false);
    expect(result.time!.reason).toMatch(/cannot convert day/);
  });

  it('bare "go back" moves exactly one real tick backward on this world\'s own clock', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    const intent = parseObservationIntent('Go back.');
    const result = resolveObservation(intent, session, 4);
    expect(result.time!.worldTime).toBe(3);
  });

  it('a request for a tick beyond this run\'s real history snaps honestly, never silently, to the nearest real one', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE); // 6 real ticks
    const intent = parseObservationIntent('Show me the pump-pipe system 20 hours later.');
    const result = resolveObservation(intent, session, 0);
    expect(result.time!.snapped).toBe(true);
    expect(result.time!.worldTime).toBeLessThanOrEqual(6);
    expect(result.time!.reason.length).toBeGreaterThan(0);
  });
});

describe('Looking Glass — resolveObservation: BEFORE/AFTER a real event', () => {
  it('resolves BEFORE_EVENT against a real event matched by its own literal type, not a fabricated one', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    // "kinetics" is a literal substring of the real event type
    // ("chemistry.kinetics.step") — a genuine literal match, not the
    // semantic-word fallback.
    const intent = parseObservationIntent('Go back before the kinetics.');
    const result = resolveObservation(intent, session, 10);
    expect(result.time!.granted).toBe(true);
  });

  it('an event name matching nothing real, and no semantic word either, is refused with the fully-generic honest reason', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Go back before the xyzzy.');
    const result = resolveObservation(intent, session, 10);
    expect(result.time!.granted).toBe(false);
    expect(result.time!.reason).toMatch(/no event matching "xyzzy"/);
  });

  it('an event name that happens to contain a real semantic-kind word resolves via that mapping, honestly — "pump failure" is read as asking for a FAILURE event', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Go back before the pump failure.');
    const result = resolveObservation(intent, session, 10);
    expect(result.time!.granted).toBe(false);
    expect(result.time!.reason).toMatch(/no FAILURE-classified event/);
  });

  it('"the incident"/"the failure" resolve via the domain-agnostic semantic mapping, honestly finding none in a domain with no FAILURE events', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    const intent = parseObservationIntent('Show me the pump-pipe system after the incident.');
    const result = resolveObservation(intent, session, 0);
    expect(result.time!.granted).toBe(false);
    expect(result.time!.reason).toMatch(/no FAILURE-classified event/);
  });
});

describe('Looking Glass — cause/effect explorer: real WHAT/WHERE/WHEN/BY-HOW-MUCH/WHY/CAUSE/CONSEQUENCE/EVIDENCE/GROUNDING', () => {
  it('"why did this change happen" produces a real explanation for chemistry, with a genuine numeric delta', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Follow the substance. Why did this change happen?');
    const result = resolveObservation(intent, session, 5);
    expect(result.explanation).not.toBeNull();
    const concentration = result.explanation!.byHowMuch.find((d) => d.key === 'chemical.concentrationFraction');
    expect(concentration).toBeDefined();
    expect(concentration!.absoluteDelta).toBeLessThan(0); // decaying
    expect(result.explanation!.cause).toBe('arrhenius-first-order-decay');
    expect(result.explanation!.grounding).toBe('MODEL_ESTIMATE');
  });

  it('explainEntity reports byHowMuch as EMPTY, honestly, for a steady-state hydraulics tick with no prior change', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    const state = session.world!.getStateAt(4)!;
    const entity = findEntity(state, 'pump-pipe')!;
    const explanation = explainEntity(session, entity, 4);
    expect(explanation.byHowMuch).toEqual([]);
  });

  it('CAUSE_EFFECT mode triggers an explanation even without an explicit "why" question', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Follow the substance in cause and effect view.');
    expect(intent.mode).toBe('CAUSE_EFFECT');
    const result = resolveObservation(intent, session, 5);
    expect(result.explanation).not.toBeNull();
  });

  it('consequence is null, honestly, when no later event touches the entity yet', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const state = session.world!.getStateAt(12)!; // the final tick
    const entity = findEntity(state, 'substance')!;
    const explanation = explainEntity(session, entity, 12);
    expect(explanation.consequence).toBeNull();
  });

  it('propertyDeltasOf reports [] for a null "before" — the domain-agnostic diff never fabricates a baseline', () => {
    expect(propertyDeltasOf(null, { ref: { kind: 'x', id: '1' }, label: 'X', properties: [{ key: 'a', value: 1 }] })).toEqual([]);
  });
});

describe('Looking Glass — what-if observation: real branch infrastructure, no second one', () => {
  it('"compare" on a session opened WITHOUT comparison lazily computes the SAME real fork via requestComparison', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE); // no "compare" in the original sentence
    expect(session.comparison).toBeNull();
    const intent = parseObservationIntent('Compare with the intervention branch.');
    const result = resolveObservation(intent, session, 6);
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.status).toBe('READY');
    expect(result.comparison!.producedBy).toMatch(/worldModel\.compareBranches/);
  });

  it('the same lazy what-if path works identically on hydraulics — the SAME mechanism, a different real domain', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    expect(session.comparison).toBeNull();
    const intent = parseObservationIntent('Compare with the intervention branch.');
    const result = resolveObservation(intent, session, 3);
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.status).toBe('READY');
  });

  it('epidemic\'s what-if reuses the SAME real counterfactual engine as an eager compare request', () => {
    const session = openLookingGlass('Pokaż epidemię przez 30 dni z perspektywy człowieka na ulicy');
    expect(session.comparison).toBeNull();
    const intent = parseObservationIntent('Compare with the intervention branch.');
    const result = resolveObservation(intent, session, 5);
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.producedBy).toMatch(/runScenarioCounterfactual/);
  });

  it('"return to baseline" never triggers a comparison — it is a distinct intent', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Return to baseline.');
    const result = resolveObservation(intent, session, 6);
    expect(result.comparison).toBeNull();
    expect(result.reasons).not.toContain('this domain has no comparison available for this run');
  });
});

describe('Looking Glass — the camera request is EXACTLY the existing PerspectiveRequest, no second contract', () => {
  it('carries no scientific semantics, exactly like every other PerspectiveRequest in this codebase', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const intent = parseObservationIntent('Follow the substance as a scientist.');
    const result = resolveObservation(intent, session, 3);
    expect(result.cameraRequest).not.toBeNull();
    expect(result.cameraRequest!.kind).toBe('SCIENTIST_POV');
    expect(JSON.stringify(result.cameraRequest)).not.toMatch(/concentration|arrhenius|chemistry/i);
  });

  it('mode maps to a real, existing ViewpointKind — never a new camera vocabulary', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    const engineerIntent = parseObservationIntent('Show me this as an engineer.');
    const citizenIntent = parseObservationIntent('Show me this as a citizen.');
    expect(resolveObservation(engineerIntent, session, 1).cameraRequest!.kind).toBe('OPERATOR_POV');
    expect(resolveObservation(citizenIntent, session, 1).cameraRequest!.kind).toBe('ANCHORED_HUMAN');
  });
});

describe('Looking Glass — findEvent: the domain-agnostic incident vocabulary', () => {
  it('maps a generic semantic word onto the EXISTING EventSemanticKind classification, honestly finding none when this run has none of that kind', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const events = session.world!.getInspectableEvents();
    // Every real event in this run is UNCLASSIFIED (its "...step" suffix
    // matches no SUFFIX_SEMANTICS rule in eventInspection.ts) — "change" is
    // a real STATE_CHANGE-mapping word, and the honest answer is that no
    // such event exists here, not a coincidental match to an unrelated one.
    const match = findEvent(events, 'the change');
    expect(match.event).toBeNull();
    expect(match.reason).toMatch(/no STATE_CHANGE-classified event/);
    for (const event of events) expect(event.semanticKind).toBe('UNCLASSIFIED');
  });

  it('returns an honest, specific reason when nothing matches at all', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const events = session.world!.getInspectableEvents();
    const match = findEvent(events, 'xyzzy');
    expect(match.event).toBeNull();
    expect(match.reason).toMatch(/no event matching "xyzzy"/);
  });
});

describe('Looking Glass — buildSemanticTimeline: real events, real order, no invented chronology', () => {
  it('is ordered identically to getInspectableEvents — no second ordering rule', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const timeline = buildSemanticTimeline(session);
    const events = session.world!.getInspectableEvents();
    expect(timeline.map((entry) => entry.event.id)).toEqual(events.map((event) => event.id));
  });

  it('each entry\'s state change is a REAL diff against the nearest earlier real state', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const timeline = buildSemanticTimeline(session);
    const midEntry = timeline[5]!;
    const concentration = midEntry.stateChange.find((d) => d.key === 'chemical.concentrationFraction');
    expect(concentration).toBeDefined();
    expect(concentration!.absoluteDelta).toBeLessThan(0);
  });

  it('consequence links point FORWARD only, to a real later event on the same entity', () => {
    const session = openLookingGlass(CHEMISTRY_SENTENCE);
    const timeline = buildSemanticTimeline(session);
    const first = timeline[0]!;
    if (first.consequenceEventId) {
      const consequence = timeline.find((entry) => entry.event.id === first.consequenceEventId)!;
      expect(consequence.event.time.tick).toBeGreaterThan(first.event.time.tick);
    }
    const last = timeline.at(-1)!;
    expect(last.consequenceEventId).toBeNull();
  });

  it('is empty, honestly, for a session that never resolved to a real world', () => {
    const refused = openLookingGlass('Design a bomb that maximises casualties in this city');
    expect(buildSemanticTimeline(refused)).toEqual([]);
  });
});
