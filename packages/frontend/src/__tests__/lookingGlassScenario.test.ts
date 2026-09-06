import { describe, expect, it } from 'vitest';
import { parseScenarioRequest, spanToTicks } from '../core/lookingGlass/scenarioRequest';
import { nearestSupportedAlternative, resolveScenarioRequest } from '../core/lookingGlass/scenarioResolution';
import { openLookingGlass } from '../core/lookingGlass/scenarioSession';
import { anchoredSequenceDuration, buildAnchoredSequence, sampleAnchoredSequence, scrubToSeconds } from '../core/lookingGlass/anchoredTemporal';
import { ExperiencePlayer, frameAt } from '../core/lookingGlass/experienceOrchestrator';
import { cityPresetFor, directionAt } from '../core/lookingGlass/worldDirector';
import { causalChainOf, classifyEvent } from '../core/lookingGlass/eventInspection';
import { closeInspection, initialExperienceState, inspect, replay as replayMode, timeIsFrozen } from '../core/lookingGlass/experienceMode';

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

  it('puts each shot on the clock its marker is actually measured against', () => {
    const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    for (const shot of session.shotPlan.shots) {
      // An observation is recorded against the state it belongs to; a
      // canonical event carries a real timestamp in the world's own clock.
      // Reading an event's day-72 timestamp as "state 72" addressed a state
      // that never existed, so the axis is per marker, not per shot kind.
      const expected = shot.kind === 'OBSERVATION' ? 'STATE_INDEX' : 'WORLD_TIME';
      expect(shot.axis).toBe(expected);
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

describe('Looking Glass — the world answers the question that was asked', () => {
  it('hands the laboratory the problem this session actually ran, not a default', async () => {
    const { peekPendingLookingGlassExperience, clearLookingGlassExperience } =
      await import('../core/lookingGlass/sessionHandoff');
    clearLookingGlassExperience();
    openLookingGlass('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist').enterWorld();
    // Without this the bench starts its own default problem and answers about
    // intervention timing while the sentence asked about a cell culture.
    expect(peekPendingLookingGlassExperience()?.problemId).toBe('problem:cell-population-growth-rate-fastest-to-capacity');
    clearLookingGlassExperience();
  });

  it('hands an epidemic session its own epidemiological problem instead', async () => {
    const { peekPendingLookingGlassExperience, clearLookingGlassExperience } =
      await import('../core/lookingGlass/sessionHandoff');
    clearLookingGlassExperience();
    openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy').enterWorld();
    expect(peekPendingLookingGlassExperience()?.problemId).toMatch(/lowest-modeled-deaths/);
    clearLookingGlassExperience();
  });
});

describe('Looking Glass — the Experience Orchestrator', () => {
  const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');

  it('lays the shot plan on a real clock, holding the anchored pass for its true length', () => {
    const timeline = session.experience;
    expect(timeline.shots.length).toBe(session.shotPlan.shots.length);
    expect(timeline.durationSeconds).toBeGreaterThan(60);
    const temporal = timeline.shots.find((scheduled) => scheduled.shot.kind === 'TEMPORAL');
    // Shortening it would skip states the model computed; lengthening it
    // would hold on states that do not exist.
    expect(temporal!.endSeconds - temporal!.startSeconds)
      .toBeCloseTo((session.anchored!.keyframes.length - 1) * session.anchored!.secondsPerStep);
  });

  it('is pure: the same instant always resolves to the same frame', () => {
    const a = frameAt(session.experience, 31.5);
    const b = frameAt(session.experience, 31.5);
    expect(a).toEqual(b);
  });

  it('never runs off either end of the sequence', () => {
    expect(frameAt(session.experience, -50)?.elapsedSeconds).toBe(0);
    const past = frameAt(session.experience, 99999);
    expect(past?.finished).toBe(true);
    expect(past?.elapsedSeconds).toBe(session.experience.durationSeconds);
  });

  it('resolves a state index only where one really exists', () => {
    for (const scheduled of session.experience.shots) {
      const frame = frameAt(session.experience, scheduled.startSeconds + 0.1)!;
      if (frame.stateIndex !== null) {
        // A rendered state index must address a state the run produced.
        expect(frame.stateIndex).toBeLessThan(session.states.length);
        expect(frame.stateIndex).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives a world-time marker no state index rather than inventing one', () => {
    const eventShot = session.experience.shots.find((s) => s.shot.kind === 'EVENT');
    if (!eventShot) return;
    const frame = frameAt(session.experience, eventShot.startSeconds + 0.1)!;
    expect(frame.shot.axis).toBe('WORLD_TIME');
    expect(frame.stateIndex).toBeNull();
  });

  it('never holds a marker shot on a tick range that runs backwards', () => {
    for (const shot of session.shotPlan.shots) expect(shot.toTick).toBeGreaterThanOrEqual(shot.fromTick);
  });

  it('cites only real markers, and flags the cut on a shot boundary', () => {
    const markerIds = new Set(session.timeline.markers.map((m) => m.id));
    for (const scheduled of session.experience.shots) {
      const frame = frameAt(session.experience, scheduled.startSeconds)!;
      expect(frame.isCut).toBe(true);
      for (const id of frame.activeMarkerIds) expect(markerIds.has(id)).toBe(true);
    }
  });

  it('plays, pauses, scrubs, changes speed and replays over the same real sequence', () => {
    const player = new ExperiencePlayer(session.experience);
    expect(player.playbackStatus).toBe('IDLE');
    player.play();
    player.advance(10);
    expect(player.elapsedSeconds).toBeCloseTo(10);

    player.setSpeed(4);
    player.advance(10);
    expect(player.elapsedSeconds).toBeCloseTo(50);

    player.pause();
    player.advance(10);
    expect(player.elapsedSeconds).toBeCloseTo(50);

    // Scrubbing pauses, as every video control does.
    player.play();
    player.seek(0.5);
    expect(player.playbackStatus).toBe('PAUSED');
    expect(player.elapsedSeconds).toBeCloseTo(session.experience.durationSeconds / 2);

    player.setSpeed(1);
    player.play();
    player.advance(99999);
    expect(player.playbackStatus).toBe('FINISHED');
    expect(player.currentFrame?.finished).toBe(true);

    player.replay();
    expect(player.playbackStatus).toBe('PLAYING');
    expect(player.elapsedSeconds).toBe(0);
  });

  it('clamps speed to a sane range instead of letting a caller skip the run', () => {
    const player = new ExperiencePlayer(session.experience);
    player.setSpeed(1000);
    expect(player.playbackSpeed).toBe(16);
    player.setSpeed(0);
    expect(player.playbackSpeed).toBe(0.1);
  });

  it('produces no timeline for a refused scenario', () => {
    const refused = openLookingGlass('Design a bomb that maximises casualties in this city');
    expect(refused.experience.shots).toEqual([]);
    expect(frameAt(refused.experience, 1)).toBeNull();
  });
});

describe('Looking Glass — the universal scenario contract', () => {
  it('exposes one domain-independent view of an epidemic world', () => {
    const world = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy').world!;
    const range = world.getTemporalRange();
    expect(range.unit).toBe('DAY');
    expect(range.stepCount).toBe(60);
    expect(range.to).toBeGreaterThan(range.from);
    expect(world.getAvailablePerspectives().some((p) => p.kind === 'ANCHORED_HUMAN' && p.available)).toBe(true);
    // A vantage the world has nowhere to stand in must say why, not go blank.
    const unavailable = world.getAvailablePerspectives().filter((p) => !p.available);
    for (const option of unavailable) expect(option.reason).toBeTruthy();
  });

  it('answers the same six questions for a laboratory world, through the same contract', () => {
    const world = openLookingGlass('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist').world!;
    expect(world.getTemporalRange().unit).toBe('HOUR');
    expect(world.getAvailablePerspectives().some((p) => p.kind === 'SCIENTIST_POV' && p.available)).toBe(true);
    // The molecular/lab world has no street for a citizen to stand on.
    expect(world.getAvailablePerspectives().find((p) => p.kind === 'ANCHORED_HUMAN')?.available).toBe(false);
    expect(world.getBounds().max[1]).toBeGreaterThan(0);
  });

  it('returns real states only, never an interpolated one', () => {
    const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    const world = session.world!;
    for (const state of session.states) expect(world.getStateAt(state.tick)).toBe(state);
    expect(world.getStateAt(99999)).toBeNull();
  });

  it('resolves evidence for every marker the shot plan cites', () => {
    const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
    const cited = session.shotPlan.shots.filter((shot) => shot.sourceMarkerId !== null);
    expect(cited.length).toBeGreaterThan(0);
    for (const shot of cited) {
      const evidence = session.world!.getEvidence(shot.sourceMarkerId!);
      expect(evidence).not.toBeNull();
      expect(evidence!.statement.length).toBeGreaterThan(0);
    }
  });
});

describe('Looking Glass — directing the actual world', () => {
  const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');

  it('drives real world days during the held human pass', () => {
    const range = session.world!.getTemporalRange();
    const temporal = session.experience.shots.find((s) => s.shot.kind === 'TEMPORAL')!;
    const direction = directionAt(session.experience, session.world!, temporal.startSeconds + 20)!;
    expect(direction.worldTimeSource).toBe('VIEWER_CLOCK');
    expect(direction.worldTime).not.toBeNull();
    expect(direction.worldTime!).toBeGreaterThanOrEqual(range.from);
    expect(direction.worldTime!).toBeLessThanOrEqual(range.to);
  });

  it('NEVER emits a world time outside the series the viewer is scrubbing', () => {
    // The integrity rule this whole layer exists to protect: a rendered day
    // must be a day the run actually had.
    const range = session.world!.getTemporalRange();
    for (let seconds = 0; seconds <= session.experience.durationSeconds; seconds += 0.5) {
      const direction = directionAt(session.experience, session.world!, seconds)!;
      if (direction.worldTime === null) continue;
      expect(direction.worldTime).toBeGreaterThanOrEqual(range.from);
      expect(direction.worldTime).toBeLessThanOrEqual(range.to);
    }
  });

  it('holds the clock rather than inventing a date for a marker from another run', () => {
    const marker = session.experience.shots.find((s) => s.shot.sourceMarkerId !== null)!;
    const direction = directionAt(session.experience, session.world!, marker.startSeconds + 0.1)!;
    expect(direction.worldTime).toBeNull();
    expect(direction.worldTimeSource).toBe('FOREIGN_RUN');
    // The cut still carries its provenance — the viewer sees the observation,
    // they are simply not told a false date for it.
    expect(direction.evidence.length).toBeGreaterThan(0);
  });

  it('maps camera intent onto a city world without knowing the domain', () => {
    expect(cityPresetFor('HUMAN_EYE')).toBe('street');
    expect(cityPresetFor('WIDE')).toBe('city');
    expect(cityPresetFor('MACRO')).toBe('agent');
    expect(cityPresetFor('SCIENTIFIC')).toBe('district');
    expect(cityPresetFor('CINEMATIC')).toBe('city');
  });

  it('puts the viewer at street level for the anchored pass and wide for the close', () => {
    const temporal = session.experience.shots.find((s) => s.shot.kind === 'TEMPORAL')!;
    const result = session.experience.shots.find((s) => s.shot.kind === 'RESULT')!;
    expect(cityPresetFor(directionAt(session.experience, session.world!, temporal.startSeconds + 1)!.cameraIntent)).toBe('street');
    expect(cityPresetFor(directionAt(session.experience, session.world!, result.startSeconds + 0.1)!.cameraIntent)).toBe('city');
  });

  it('directs a laboratory world through the very same functions', () => {
    const lab = openLookingGlass('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist');
    const direction = directionAt(lab.experience, lab.world!, 1)!;
    expect(direction.cameraIntent).toBeTruthy();
    expect(direction.shotKind).toBe('ESTABLISH');
  });

  it('has nothing to direct when the scenario was refused', () => {
    const refused = openLookingGlass('Design a bomb that maximises casualties in this city');
    expect(refused.world).toBeNull();
    expect(refused.experience.shots).toEqual([]);
  });
});

describe('Looking Glass — events you can interrogate', () => {
  const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');

  it('reads the full event, not the flattened marker', () => {
    const events = session.world!.getInspectableEvents();
    expect(events.length).toBeGreaterThan(0);
    const event = events[0];
    expect(event.type).toBeTruthy();
    expect(event.modelId).toBeTruthy();
    expect(event.origin).toBe('model');
    expect(event.affectedEntities.length).toBeGreaterThan(0);
    expect(event.evidence).not.toBeNull();
  });

  it('reports absent fields as null rather than inventing plausible ones', () => {
    // The epidemiological run-completed event genuinely has no coordinates.
    // A confident "Street sector A" would survive a demo, which is exactly
    // what makes inventing one dangerous.
    for (const event of session.world!.getInspectableEvents()) {
      expect(event.location).toBeNull();
      expect(event.severity).toBeNull();
    }
  });

  it('classifies events from the dotted suffix, never the domain prefix', () => {
    // Same suffix, different domains, identical classification — this is the
    // "no if-epidemic-then" rule expressed as a test.
    expect(classifyEvent('infection.transmission')).toBe(classifyEvent('reaction.transmission'));
    expect(classifyEvent('epidemiology.run.completed')).toBe('TRANSITION');
    expect(classifyEvent('anything.observation.threshold-crossed')).toBe('THRESHOLD_CROSSING');
    expect(classifyEvent('flood.levee.failure')).toBe('FAILURE');
    expect(classifyEvent('lab.sample.anomaly')).toBe('ANOMALY');
    expect(classifyEvent('cell.population.simulated')).toBe('STATE_CHANGE');
    // An unknown suffix stays honestly unclassified instead of guessing.
    expect(classifyEvent('some.brand.new.thing')).toBe('UNCLASSIFIED');
  });

  it('offers replay only on a verified MATCH, and explains a refusal', () => {
    for (const event of session.world!.getInspectableEvents()) {
      if (event.replay.available) {
        expect(event.replay.status).toBe('MATCH');
        expect(event.replay.seed).not.toBeNull();
      } else {
        expect(event.replay.reason).toBeTruthy();
      }
    }
  });

  it('withholds replay where the run carries no verdict', () => {
    const lab = openLookingGlass('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist');
    for (const event of lab.world!.getInspectableEvents()) {
      if (!event.replay.available) expect(event.replay.reason).toMatch(/verdict|reproducible/i);
    }
  });

  it('reports the recorded causal chain without inferring links', () => {
    const events = session.world!.getInspectableEvents();
    const chain = causalChainOf(events[events.length - 1].id, events);
    expect(chain.length).toBeGreaterThan(1);
    // Each link is the recorded parent of the one before it.
    for (let i = 1; i < chain.length; i++) expect(chain[i - 1].parentEventId).toBe(chain[i].id);
    // An unknown id yields nothing rather than a fabricated chain.
    expect(causalChainOf('does-not-exist', events)).toEqual([]);
  });

  it('marks an event from a different run as off the viewer clock', () => {
    const offClock = session.world!.getInspectableEvents().filter((e) => !e.time.onViewerClock);
    expect(offClock.length).toBeGreaterThan(0);
  });
});

describe('Looking Glass — experience modes and world continuity', () => {
  const session = openLookingGlass('Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
  const events = session.world!.getInspectableEvents();

  it('opens in the mode the vantage implies', () => {
    expect(initialExperienceState(0, true).mode).toBe('WATCH');
    expect(initialExperienceState(0, false).mode).toBe('EXPLORE');
  });

  it('freezes time while an event is held open', () => {
    const watching = initialExperienceState(12, true);
    const inspecting = inspect(watching, events[0], 42);
    expect(inspecting.mode).toBe('INSPECT');
    expect(timeIsFrozen(inspecting)).toBe(true);
    expect(timeIsFrozen(watching)).toBe(false);
  });

  it('keeps the viewer where they were for an event on a foreign run', () => {
    const watching = initialExperienceState(12, true);
    const foreign = events.find((e) => !e.time.onViewerClock)!;
    // Jumping to that event's own tick would show a day this series never had.
    expect(inspect(watching, foreign, 42).worldTime).toBe(12);
  });

  it('resumes the sequence where it was interrupted rather than restarting', () => {
    const inspecting = inspect(initialExperienceState(12, true), events[0], 42);
    const resumed = closeInspection(inspecting);
    expect(resumed.mode).toBe('WATCH');
    expect(resumed.resumeSeconds).toBe(42);
    expect(resumed.worldTime).toBe(12);
    expect(resumed.selectedEvent).toBeNull();
  });

  it('returns to exploration when the inspection did not come from a sequence', () => {
    const inspecting = inspect(initialExperienceState(5, false), events[0], null);
    expect(closeInspection(inspecting).mode).toBe('EXPLORE');
  });

  it('refuses to enter replay for an event that was never verified', () => {
    const lab = openLookingGlass('Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist');
    const unverified = lab.world!.getInspectableEvents().find((e) => !e.replay.available);
    if (!unverified) return;
    const held = inspect(initialExperienceState(0, false), unverified, null);
    // The availability check lives on the event; the mode machine will not
    // override it.
    expect(replayMode(held).mode).toBe('INSPECT');
  });

  it('enters replay for a verified event', () => {
    const verified = events.find((e) => e.replay.available);
    if (!verified) return;
    const held = inspect(initialExperienceState(0, true), verified, 10);
    expect(replayMode(held).mode).toBe('REPLAY');
    expect(timeIsFrozen(replayMode(held))).toBe(true);
  });
});
