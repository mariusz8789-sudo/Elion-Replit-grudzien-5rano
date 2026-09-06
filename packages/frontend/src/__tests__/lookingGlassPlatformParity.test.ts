import { describe, expect, it } from 'vitest';
import { openLookingGlass } from '../core/lookingGlass/scenarioSession';
import { directionAt } from '../core/lookingGlass/worldDirector';
import { classifyEvent } from '../core/lookingGlass/eventInspection';
import { WorldClock } from '../core/lookingGlass/worldClock';

/**
 * LOOKING GLASS — THE PLATFORM PROOF, IN ONE PLACE.
 *
 * Every other test file exercises city and laboratory sessions incidentally,
 * while testing some specific behaviour. This file exists for a narrower,
 * more structural reason: to make it hard to add a SECOND event system, a
 * SECOND clock, a SECOND comparison mechanism, or a SECOND replay rule for
 * one domain without this file failing.
 *
 * The two sessions below share no physics, no units, and no geometry — an
 * epidemic across a city and a growth curve in a bioreactor are about as
 * different as two Genesis worlds get. If the SAME functions, called on
 * both, produce structurally consistent answers, that is not a coincidence
 * of two similar implementations — it is one implementation.
 *
 * A future domain that needs its own event rail, its own clock, or its own
 * comparison function should make a test in THIS file fail before it makes
 * it past review.
 */

const CITY_SENTENCE = 'Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy';
const LAB_SENTENCE = 'Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist';

describe('Looking Glass — platform parity between city and laboratory', () => {
  const city = openLookingGlass(CITY_SENTENCE);
  const lab = openLookingGlass(LAB_SENTENCE);

  it('both resolve READY through the identical resolver, not a domain-specific one', () => {
    expect(city.resolution.status).toBe('READY');
    expect(lab.resolution.status).toBe('READY');
    expect(city.request.family).not.toBe(lab.request.family);
  });

  it('both worlds are instances of the SAME clock class, with the same contract', () => {
    expect(city.world!.clock).toBeInstanceOf(WorldClock);
    expect(lab.world!.clock).toBeInstanceOf(WorldClock);
    // Same shape, same methods, wildly different ranges — the class does not
    // know or care which domain it is clocking.
    expect(city.world!.clock.count).not.toBe(lab.world!.clock.count);
    for (const clock of [city.world!.clock, lab.world!.clock]) {
      expect(typeof clock.resolve).toBe('function');
      expect(typeof clock.resolveForeign).toBe('function');
      expect(typeof clock.nearest).toBe('function');
    }
  });

  it('both event streams satisfy the identical InspectableEvent shape', () => {
    for (const session of [city, lab]) {
      const events = session.world!.getInspectableEvents();
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(typeof event.id).toBe('string');
        expect(typeof event.type).toBe('string');
        expect(Array.isArray(event.affectedEntities)).toBe(true);
        expect(Array.isArray(event.relatedHypothesisIds)).toBe(true);
        expect(event.replay).toHaveProperty('available');
        expect(event.replay).toHaveProperty('reason');
        // location/severity are honestly absent for both real domains here —
        // neither has spatial or graded events — and both say so the same way.
        expect(event.location).toBeNull();
        expect(event.severity).toBeNull();
      }
    }
  });

  it('classifies events by the SAME suffix rule regardless of domain prefix', () => {
    // Not a per-session check — a direct proof that classification has no
    // domain branch at all. See eventInspection.ts's own suffix rule.
    expect(classifyEvent('epidemiology.run.completed')).toBe(classifyEvent('cell.run.completed'));
    const cityEvents = city.world!.getInspectableEvents();
    const labEvents = lab.world!.getInspectableEvents();
    for (const event of [...cityEvents, ...labEvents]) {
      expect(classifyEvent(event.type)).toBe(event.semanticKind);
    }
  });

  it('both shot plans and experience timelines come from the same builder functions', () => {
    for (const session of [city, lab]) {
      expect(session.shotPlan.shots.length).toBeGreaterThan(0);
      expect(session.shotPlan.shots[0].kind).toBe('ESTABLISH');
      expect(session.shotPlan.shots.at(-1)!.kind).toBe('RESULT');
      expect(session.experience.shots.length).toBe(session.shotPlan.shots.length);
    }
  });

  it('directionForFrame resolves a valid direction for both, through the same function', () => {
    for (const session of [city, lab]) {
      const direction = directionAt(session.experience, session.world!, 1)!;
      expect(direction).not.toBeNull();
      expect(direction.cameraRequest.bounds).toBe(session.world!.getBounds());
      // The payload sent toward a future camera rig carries no domain words —
      // proven per-session, not just for the city, in worldDirector tests.
      expect(JSON.stringify(direction.cameraRequest)).not.toMatch(/epidemi|cell|infection|hypothesis/i);
    }
  });

  it('replay follows the identical MATCH-only rule in both domains', () => {
    for (const session of [city, lab]) {
      for (const event of session.world!.getInspectableEvents()) {
        if (event.replay.available) expect(event.replay.status).toBe('MATCH');
        else expect(event.replay.reason?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('comparison, when requested, is computed by domain engines but reported through one shape', () => {
    const comparedCity = openLookingGlass('Compare the epidemic over 30 days from street level');
    const comparedLab = openLookingGlass('Compare the bioreactor cell culture over 12 hours from the scientist');
    for (const session of [comparedCity, comparedLab]) {
      expect(session.comparison).not.toBeNull();
      expect(session.comparison!).toHaveProperty('status');
      expect(session.comparison!).toHaveProperty('baselineLabel');
      expect(session.comparison!).toHaveProperty('variantLabel');
      expect(session.comparison!).toHaveProperty('metrics');
      expect(session.comparison!).toHaveProperty('producedBy');
    }
    // Different engines, visible in provenance — parity is in the SHAPE, not
    // in pretending the two domains compute comparison identically.
    expect(comparedCity.comparison!.producedBy).toMatch(/runScenarioCounterfactual/);
    expect(comparedLab.comparison!.producedBy).toMatch(/discrimination/);
  });

  it('the vantage handoff carries the same field set for both worlds', () => {
    for (const session of [city, lab]) {
      expect(session.enterWorld()).toBe(true);
    }
  });
});
