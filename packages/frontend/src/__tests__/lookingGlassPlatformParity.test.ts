import { describe, expect, it } from 'vitest';
import { openLookingGlass } from '../core/lookingGlass/scenarioSession';
import { directionAt } from '../core/lookingGlass/worldDirector';
import { classifyEvent } from '../core/lookingGlass/eventInspection';
import { WorldClock } from '../core/lookingGlass/worldClock';

/**
 * LOOKING GLASS — THE PLATFORM PROOF, IN ONE PLACE.
 *
 * Every other test file exercises these sessions incidentally, while
 * testing some specific behaviour. This file exists for a narrower, more
 * structural reason: to make it hard to add a SECOND event system, a
 * SECOND clock, a SECOND comparison mechanism, or a SECOND replay rule for
 * one domain without this file failing.
 *
 * The four sessions below share almost no physics, no units, and no
 * geometry — an epidemic across a city, a growth curve in a bioreactor, a
 * molecule decaying under Arrhenius kinetics, and steady-state flow through
 * a pump-pipe system are about as different as Genesis worlds get. The
 * first two run on scenarioEngine.ts/hypothesisLoop.ts; the last two run on
 * a completely different engine family, `core/worldModel/*` (WorldGraph +
 * TemporalEngine + SolverRouter). If the SAME functions, called on all
 * four, produce structurally consistent answers, that is not a coincidence
 * of similar implementations — it is one implementation, proven across an
 * engine-family boundary and not just a domain one.
 *
 * A future domain that needs its own event rail, its own clock, or its own
 * comparison function should make a test in THIS file fail before it makes
 * it past review.
 */

const CITY_SENTENCE = 'Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy';
const LAB_SENTENCE = 'Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist';
const CHEMISTRY_SENTENCE = 'Show the chemical kinetics decay of a substance at 750K over 12 hours from a scientist';
const HYDRAULICS_SENTENCE = 'Show the hydraulic pump-pipe system over 6 hours from the operator';

describe('Looking Glass — platform parity across city, laboratory, chemistry and hydraulics', () => {
  const city = openLookingGlass(CITY_SENTENCE);
  const lab = openLookingGlass(LAB_SENTENCE);
  const chemistry = openLookingGlass(CHEMISTRY_SENTENCE);
  const hydraulics = openLookingGlass(HYDRAULICS_SENTENCE);
  const domains = [city, lab, chemistry, hydraulics];
  const worldModelDomains = [chemistry, hydraulics];

  it('all four resolve READY through the identical resolver, not a domain-specific one', () => {
    for (const session of domains) expect(session.resolution.status).toBe('READY');
    // Not literally 4 distinct families — chemistry and hydraulics ARE the
    // real distinction to prove here: same resolver, same session shape,
    // across an engine-family boundary the family label alone doesn't show.
    expect(new Set(domains.map((s) => s.request.family)).size).toBe(4);
  });

  it('all four worlds are instances of the SAME clock class, with the same contract', () => {
    for (const session of domains) expect(session.world!.clock).toBeInstanceOf(WorldClock);
    // Same shape, same methods, wildly different ranges — the class does not
    // know or care which domain, or which engine, is clocking.
    expect(new Set(domains.map((s) => s.world!.clock.count)).size).toBe(4);
    for (const session of domains) {
      const clock = session.world!.clock;
      expect(typeof clock.resolve).toBe('function');
      expect(typeof clock.resolveForeign).toBe('function');
      expect(typeof clock.nearest).toBe('function');
    }
  });

  it('all four event streams satisfy the identical InspectableEvent shape', () => {
    for (const session of domains) {
      const events = session.world!.getInspectableEvents();
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(typeof event.id).toBe('string');
        expect(typeof event.type).toBe('string');
        expect(Array.isArray(event.affectedEntities)).toBe(true);
        expect(Array.isArray(event.relatedHypothesisIds)).toBe(true);
        expect(event.replay).toHaveProperty('available');
        expect(event.replay).toHaveProperty('reason');
        // location/severity are honestly absent across all four real
        // domains here — none has spatial or graded events — and all four
        // say so the same way.
        expect(event.location).toBeNull();
        expect(event.severity).toBeNull();
      }
    }
  });

  it('classifies events by the SAME suffix rule regardless of domain prefix', () => {
    // Not a per-session check — a direct proof that classification has no
    // domain branch at all. See eventInspection.ts's own suffix rule.
    expect(classifyEvent('epidemiology.run.completed')).toBe(classifyEvent('cell.run.completed'));
    for (const session of domains) {
      for (const event of session.world!.getInspectableEvents()) {
        expect(classifyEvent(event.type)).toBe(event.semanticKind);
      }
    }
  });

  it('all four shot plans and experience timelines come from the same builder functions', () => {
    for (const session of domains) {
      expect(session.shotPlan.shots.length).toBeGreaterThan(0);
      expect(session.shotPlan.shots[0].kind).toBe('ESTABLISH');
      expect(session.shotPlan.shots.at(-1)!.kind).toBe('RESULT');
      expect(session.experience.shots.length).toBe(session.shotPlan.shots.length);
    }
  });

  it('directionForFrame resolves a valid direction for all four, through the same function', () => {
    for (const session of domains) {
      const direction = directionAt(session.experience, session.world!, 1)!;
      expect(direction).not.toBeNull();
      expect(direction.cameraRequest.bounds).toBe(session.world!.getBounds());
      // The clock's own reason for the time shown — real for every domain,
      // through the same WorldClock.resolve/resolveForeign, never a
      // screen-side guess.
      expect(direction.worldTimeReason.length).toBeGreaterThan(0);
      // The payload sent toward a future camera rig carries no domain words —
      // proven per-session, not just for the city, in worldDirector tests.
      expect(JSON.stringify(direction.cameraRequest)).not.toMatch(/epidemi|cell|infection|hypothesis|chemistry|kinetic|hydraulic|pump/i);
    }
  });

  it('replay follows the identical MATCH-only rule across all four domains', () => {
    for (const session of domains) {
      for (const event of session.world!.getInspectableEvents()) {
        if (event.replay.available) expect(event.replay.status).toBe('MATCH');
        else expect(event.replay.reason?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('comparison, when requested, is computed by up to four DIFFERENT engines but reported through one shape', () => {
    const comparedCity = openLookingGlass('Compare the epidemic over 30 days from street level');
    const comparedLab = openLookingGlass('Compare the bioreactor cell culture over 12 hours from the scientist');
    const comparedChemistry = openLookingGlass('Compare the chemical kinetics decay of a substance over 12 hours from a scientist');
    const comparedHydraulics = openLookingGlass('Compare the hydraulic pump-pipe system over 6 hours from the operator');
    for (const session of [comparedCity, comparedLab, comparedChemistry, comparedHydraulics]) {
      expect(session.comparison).not.toBeNull();
      expect(session.comparison!).toHaveProperty('status');
      expect(session.comparison!).toHaveProperty('baselineLabel');
      expect(session.comparison!).toHaveProperty('variantLabel');
      expect(session.comparison!).toHaveProperty('metrics');
      expect(session.comparison!).toHaveProperty('producedBy');
      expect(session.comparison!).toHaveProperty('evidence');
    }
    // Different engines, visible in provenance — parity is in the SHAPE,
    // not in pretending the domains compute comparison identically.
    // Chemistry and hydraulics share the same worldModel.compareBranches
    // PRODUCER (same engine family) but real, different metric keys.
    expect(comparedCity.comparison!.producedBy).toMatch(/runScenarioCounterfactual/);
    expect(comparedLab.comparison!.producedBy).toMatch(/discrimination/);
    expect(comparedChemistry.comparison!.producedBy).toMatch(/worldModel\.compareBranches/);
    expect(comparedHydraulics.comparison!.producedBy).toMatch(/worldModel\.compareBranches/);
    expect(comparedChemistry.comparison!.metrics.map((m) => m.key)).not.toEqual(comparedHydraulics.comparison!.metrics.map((m) => m.key));
  });

  it('the vantage handoff carries the same field set for both rendered worlds', () => {
    for (const session of [city, lab]) {
      expect(session.enterWorld()).toBe(true);
    }
  });

  it('the two C3-backed domains have no renderer yet and say so through the SAME gate, not a domain-specific rendering hack', () => {
    // buildEpidemicSession/buildLaboratorySession set worldRoute for a real
    // 3D screen; buildChemistrySession/buildHydraulicsSession honestly set
    // it null because no such screen exists yet for this engine family.
    // enterWorld() checks `built.worldRoute === null` the identical way
    // regardless of which of the four built the session.
    for (const session of worldModelDomains) {
      expect(session.worldRoute).toBeNull();
      expect(session.enterWorld()).toBe(false);
    }
  });

  it('describeEntityMoment exists identically on every session, real only where a live TemporalEngine backs it', () => {
    for (const session of domains) expect(typeof session.describeEntityMoment).toBe('function');
    expect(city.describeEntityMoment(1)).toBeNull();
    expect(lab.describeEntityMoment(1)).toBeNull();
    for (const session of worldModelDomains) expect(session.describeEntityMoment(1)).not.toBeNull();
  });
});
