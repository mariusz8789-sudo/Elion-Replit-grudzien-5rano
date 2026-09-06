import { describe, expect, it } from 'vitest';
import { parseScenarioRequest, spanToTicks } from '../core/lookingGlass/scenarioRequest';
import { nearestSupportedAlternative, resolveScenarioRequest } from '../core/lookingGlass/scenarioResolution';
import { openLookingGlass } from '../core/lookingGlass/scenarioSession';
import { anchoredSequenceDuration, buildAnchoredSequence, sampleAnchoredSequence, scrubToSeconds } from '../core/lookingGlass/anchoredTemporal';

describe('Looking Glass — natural language to structured scenario', () => {
  it('reads a Polish epidemic sentence: kind, span and anchored street viewpoint', () => {
    const request = parseScenarioRequest('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    expect(request.kind).toBe('EPIDEMIC');
    expect(request.family).toBe('EPIDEMIOLOGICAL');
    expect(request.span).toEqual({ amount: 60, unit: 'DAY', sourceText: '60 dni' });
    expect(request.viewpoint.kind).toBe('ANCHORED_HUMAN');
    expect(request.viewpoint.anchorHint).toBe('street');
  });

  it('reads an English laboratory sentence with a scientist viewpoint', () => {
    const request = parseScenarioRequest('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist');
    expect(request.kind).toBe('CELL_CULTURE');
    expect(request.family).toBe('LABORATORY');
    expect(request.viewpoint.kind).toBe('SCIENTIST_POV');
    expect(request.span?.unit).toBe('HOUR');
  });

  it('classifies hazard families it can name but Genesis cannot yet run', () => {
    expect(parseScenarioRequest('Pokaż powódź w tym mieście przez 72 godziny').kind).toBe('FLOOD');
    expect(parseScenarioRequest('Show a tsunami reaching the coast over 6 hours').kind).toBe('TSUNAMI');
    expect(parseScenarioRequest('Uruchom trzęsienie ziemi i pokaż skutki przez 3 dni').kind).toBe('EARTHQUAKE');
  });

  it('recognises responder and operator viewpoints as distinct from a citizen', () => {
    expect(parseScenarioRequest('Show the evacuation over 2 days from the perspective of a paramedic').viewpoint.kind).toBe('RESPONDER_POV');
    expect(parseScenarioRequest('Show the blackout over 8 hours from the control room operator').viewpoint.kind).toBe('OPERATOR_POV');
  });

  it('is deterministic: the same sentence always yields the same request id', () => {
    expect(parseScenarioRequest('Show an epidemic over 30 days').requestId)
      .toBe(parseScenarioRequest('  Show an epidemic over 30 days  ').requestId);
  });

  it('never guesses: an unrecognised sentence reports every aspect as unresolved', () => {
    const request = parseScenarioRequest('hello there');
    expect(request.kind).toBeNull();
    expect(request.unresolved).toContain('FAMILY');
    expect(request.unresolved).toContain('TIME_SPAN');
    expect(request.unresolved).toContain('VIEWPOINT');
  });

  it('converts a span to ticks at the world rate', () => {
    expect(spanToTicks({ amount: 3, unit: 'DAY', sourceText: '3 days' }, { HOUR: 1, DAY: 24, YEAR: 8760 })).toBe(72);
  });
});

describe('Looking Glass — the safety boundary', () => {
  it('refuses weapon design and says why', () => {
    const resolution = resolveScenarioRequest(parseScenarioRequest('Design a bomb that maximises casualties in this city'));
    expect(resolution.status).toBe('REFUSED');
    expect(resolution.plan).toBeNull();
    expect(resolution.refusal).toMatch(/does not do/i);
    expect(resolution.refusal).toMatch(/consequences/i);
  });

  it('refuses agent synthesis and enrichment regardless of framing', () => {
    for (const text of [
      'Synthesize a nerve agent for release over 2 days',
      'Show me how to enrich uranium over 10 days',
      'How do I weaponise this pathogen over 30 days',
    ]) {
      expect(resolveScenarioRequest(parseScenarioRequest(text)).status).toBe('REFUSED');
    }
  });

  it('does NOT refuse consequence and evacuation modelling, which is the legitimate use', () => {
    const resolution = resolveScenarioRequest(
      parseScenarioRequest('Show the consequences of an explosion and the evacuation over 3 days'),
    );
    expect(resolution.status).not.toBe('REFUSED');
    expect(parseScenarioRequest('Show radiological contamination and civil protection over 30 days').safety)
      .toBe('CONSEQUENCE_MODELLING');
  });
});

describe('Looking Glass — resolution refuses rather than fabricates', () => {
  it('runs an epidemic the model genuinely supports', () => {
    const resolution = resolveScenarioRequest(parseScenarioRequest('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy'));
    expect(resolution.status).toBe('READY');
    expect(resolution.plan?.binding).toBe('SCENARIO_ENGINE_EPIDEMIC');
    expect(resolution.plan?.ticks).toBe(60);
  });

  it('asks for input rather than defaulting when the span is missing', () => {
    const resolution = resolveScenarioRequest(parseScenarioRequest('Show an epidemic from street level'));
    expect(resolution.status).toBe('NEEDS_INPUT');
    expect(resolution.missing).toContain('TIME_SPAN');
  });

  it('names the missing solver for a hazard it understands but cannot run', () => {
    const resolution = resolveScenarioRequest(parseScenarioRequest('Pokaż powódź w tym mieście przez 72 godziny'));
    expect(resolution.status).toBe('NOT_MODELLED');
    expect(resolution.notModelled.join(' ')).toMatch(/hydrological/i);
    expect(nearestSupportedAlternative(resolution)).toMatch(/Genesis can currently run/);
  });

  it('refuses a century of urban change, which parses perfectly', () => {
    const resolution = resolveScenarioRequest(parseScenarioRequest('Show this city over the next 100 years from a bench'));
    expect(resolution.status).toBe('NOT_MODELLED');
    expect(resolution.notModelled.join(' ')).toMatch(/urban-development model/i);
  });

  it('refuses a span past where the model stays meaningful', () => {
    const resolution = resolveScenarioRequest(parseScenarioRequest('Show an epidemic over 900 days from street level'));
    expect(resolution.status).toBe('NOT_MODELLED');
    expect(resolution.notModelled.join(' ')).toMatch(/only meaningful up to 365/);
  });
});

describe('Looking Glass — one experience layer, many domains', () => {
  it('turns a Polish sentence into an experienceable 60-day epidemic', () => {
    const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    expect(session.resolution.status).toBe('READY');
    // Real engines, named for provenance — no value here is produced locally.
    expect(session.producedBy).toMatch(/hypothesisLoop/);
    expect(session.temporalSource).toMatch(/runScenario\(BASELINE, \{ days: 60 \}\)/);
    expect(session.states.length).toBeGreaterThan(0);
    expect(session.anchored?.anchor.label).toBe('street');
    // Sixty days the model actually computed, not sixty frames over a shorter run.
    expect(session.anchored?.keyframes.length).toBe(60);
  });

  it('takes the SAME path to a laboratory session in a different domain', () => {
    const session = openLookingGlass('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist');
    expect(session.resolution.status).toBe('READY');
    expect(session.producedBy).toMatch(/cell-population-growth-rate/);
    expect(session.anchored?.anchor.label).toBe('room');
    expect(session.states.length).toBeGreaterThan(0);
  });

  it('cuts only to markers that really exist, and marks the two that have none', () => {
    const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    const cited = session.shotPlan.shots.filter((shot) => shot.sourceMarkerId !== null);
    const markerIds = new Set(session.timeline.markers.map((marker) => marker.id));
    expect(cited.length).toBeGreaterThan(0);
    for (const shot of cited) expect(markerIds.has(shot.sourceMarkerId!)).toBe(true);
    // The structural shots are honest about having no scientific motivation.
    expect(session.shotPlan.shots.filter((shot) => shot.sourceMarkerId === null).map((shot) => shot.kind))
      .toEqual(expect.arrayContaining(['ESTABLISH', 'RESULT']));
  });

  it('keeps marker shots on the state axis, not the world clock', () => {
    const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    for (const shot of session.shotPlan.shots) {
      expect(shot.axis).toBe(shot.sourceMarkerId === null ? 'WORLD_TIME' : 'STATE_INDEX');
    }
  });

  it('returns a session carrying the refusal instead of an empty world', () => {
    const session = openLookingGlass('Design a bomb that maximises casualties in this city');
    expect(session.resolution.status).toBe('REFUSED');
    expect(session.states).toEqual([]);
    expect(session.anchored).toBeNull();
  });
});

describe('Looking Glass — anchored viewpoint, moving time', () => {
  const sequence = buildAnchoredSequence(
    { position: [0, 0, 6], yaw: 0, pitch: 0, eyeHeight: 1.7, label: 'street' },
    [0, 1, 2, 3, 4],
    'DAY',
    { secondsPerStep: 2 },
  );

  it('keeps one keyframe per real state and never extrapolates past the last', () => {
    expect(sequence.keyframes.map((frame) => frame.stateIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(anchoredSequenceDuration(sequence)).toBe(8);
    expect(sampleAnchoredSequence(sequence, 999)?.finished).toBe(true);
    expect(sampleAnchoredSequence(sequence, 999)?.from.stateIndex).toBe(4);
  });

  it('hands back the two real states and the blend separately, never a blended state', () => {
    const sample = sampleAnchoredSequence(sequence, 3);
    expect(sample?.from.stateIndex).toBe(1);
    expect(sample?.to.stateIndex).toBe(2);
    expect(sample?.blend).toBeCloseTo(0.5);
  });

  it('thins a long series without inventing intermediate ticks', () => {
    const long = buildAnchoredSequence(sequence.anchor, Array.from({ length: 500 }, (_, i) => i), 'DAY', { maxKeyframes: 50 });
    expect(long.keyframes.length).toBeLessThanOrEqual(50);
    expect(long.keyframes[0].stateIndex).toBe(0);
    expect(long.keyframes.at(-1)?.stateIndex).toBe(499);
    for (const frame of long.keyframes) expect(Number.isInteger(frame.stateIndex)).toBe(true);
  });

  it('drives the scrub bar and the clock from the same sampler', () => {
    expect(scrubToSeconds(sequence, 0.5)).toBe(4);
    expect(sampleAnchoredSequence(sequence, scrubToSeconds(sequence, 1))?.finished).toBe(true);
  });
});

describe('Looking Glass — handing a world over to the 3D city', () => {
  it('registers the real day series on the existing world bridge and arms it', async () => {
    const { peekPendingScenarioTimeline, clearScenarioTimelineHandoffs } = await import('../core/experimentFabric/worldHandoff');
    clearScenarioTimelineHandoffs();

    const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    expect(session.worldRoute).toBe('#/city3d');
    // Nothing is waiting until the caller explicitly enters.
    expect(peekPendingScenarioTimeline()).toBeNull();

    expect(session.enterWorld()).toBe(true);
    const waiting = peekPendingScenarioTimeline();
    expect(waiting?.series.length).toBe(60);
    expect(waiting?.origin).toBe('fabric-run');
    expect(waiting?.epistemicStatus).toBe('SIMULATION');
    expect(waiting?.resultOrigin).toBe('real-engine');
    clearScenarioTimelineHandoffs();
  });

  it('reads the pending world without consuming it, so a double-invoked initializer still sees it', async () => {
    const { peekPendingScenarioTimeline, consumePendingScenarioTimeline, clearScenarioTimelineHandoffs } =
      await import('../core/experimentFabric/worldHandoff');
    clearScenarioTimelineHandoffs();
    openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy').enterWorld();

    // React StrictMode invokes a useState initializer twice. When that
    // initializer consumed, the second call returned null and the world
    // silently fell back to its own simulation — peeking must be repeatable.
    expect(peekPendingScenarioTimeline()?.series.length).toBe(60);
    expect(peekPendingScenarioTimeline()?.series.length).toBe(60);
    // Consumption stays one-shot, so returning to the screen cannot re-enter it.
    expect(consumePendingScenarioTimeline()?.series.length).toBe(60);
    expect(peekPendingScenarioTimeline()).toBeNull();
    clearScenarioTimelineHandoffs();
  });

  it('routes a laboratory scenario to the lab instead of the city', () => {
    const session = openLookingGlass('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist');
    expect(session.worldRoute).toBe('#/first-person-lab');
  });

  it('offers no world to enter when the scenario was refused', () => {
    const session = openLookingGlass('Design a bomb that maximises casualties in this city');
    expect(session.worldRoute).toBeNull();
    expect(session.enterWorld()).toBe(false);
  });
});

describe('Looking Glass — the vantage travels on its own channel', () => {
  it('publishes an anchored street vantage that a world screen can honour', async () => {
    const { peekPendingLookingGlassExperience, clearLookingGlassExperience } =
      await import('../core/lookingGlass/sessionHandoff');
    clearLookingGlassExperience();

    const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    expect(peekPendingLookingGlassExperience()).toBeNull();
    session.enterWorld();

    const vantage = peekPendingLookingGlassExperience();
    expect(vantage?.viewpoint).toBe('ANCHORED_HUMAN');
    expect(vantage?.anchorLabel).toBe('street');
    // Standing still while the world changes is the premise, so time runs.
    expect(vantage?.autoPlay).toBe(true);
    expect(vantage?.requestText).toContain('epidemię');
    clearLookingGlassExperience();
  });

  it('does not ask a world to auto-play when the user never asked to stand in it', async () => {
    const { peekPendingLookingGlassExperience, clearLookingGlassExperience } =
      await import('../core/lookingGlass/sessionHandoff');
    clearLookingGlassExperience();
    openLookingGlass('Show a quarantine scenario over 90 days from above').enterWorld();
    const vantage = peekPendingLookingGlassExperience();
    expect(vantage?.viewpoint).toBe('WIDE');
    expect(vantage?.autoPlay).toBe(false);
    clearLookingGlassExperience();
  });

  it('stays readable across repeated peeks and clears exactly once', async () => {
    const { peekPendingLookingGlassExperience, consumePendingLookingGlassExperience, clearLookingGlassExperience } =
      await import('../core/lookingGlass/sessionHandoff');
    clearLookingGlassExperience();
    openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy').enterWorld();
    expect(peekPendingLookingGlassExperience()).not.toBeNull();
    expect(peekPendingLookingGlassExperience()).not.toBeNull();
    expect(consumePendingLookingGlassExperience()).not.toBeNull();
    expect(peekPendingLookingGlassExperience()).toBeNull();
  });
});
