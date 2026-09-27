import { describe, expect, it } from 'vitest';
import { buildCameraTimeline, selectCameraForEvent } from '../core/virtualLab/cameraPolicy';
import { buildExperimentCapture, detectHighlights } from '../core/virtualLab/experimentCapture';
import { applyCapacityVerdict, buildInitialCapacityHypothesisGraph, CAPACITY_EXCEEDED_NODE_ID, CAPACITY_HOLDS_NODE_ID } from '../core/virtualLab/hypothesisFraming';
import { deriveObservationEventForTransition, deriveObservationEventsFromScenarioRun } from '../core/virtualLab/observationEvent';
import { runLiveExperimentSession, replayLiveExperimentSession } from '../core/virtualLab/liveExperimentSession';
import { runScenario } from '../core/simulation/scenarioEngine';

/**
 * VIRTUAL LAB — real experiment, real state, real camera reaction.
 *
 * No fixture simulation, no mocked scenario run: every test here calls the
 * SAME `runScenario()` the existing Scenario Engine (and the live #/city3d
 * screen) already uses. What changes tick to tick is real epidemic/hospital
 * math already shipped in this codebase; this file only tests the NEW layer
 * (observation events, camera policy, capture, hypothesis framing, replay)
 * built on top of it.
 */
describe('virtualLab — observationEvent: derived purely from real state deltas', () => {
  it('1. the first day always produces exactly one STATE_CHANGE event', () => {
    const run = runScenario('BASELINE', { days: 30, stepsPerDay: 2 });
    const events = deriveObservationEventsFromScenarioRun(run);
    expect(events[0]!.type).toBe('STATE_CHANGE');
    expect(events[0]!.tick).toBe(run.series[0]!.day);
  });

  it('2. no event is produced for two identical consecutive samples', () => {
    const sample = runScenario('BASELINE', { days: 5, stepsPerDay: 1 }).series[0]!;
    expect(deriveObservationEventForTransition(sample, sample)).toBeNull();
  });

  it('3. a status transition produces an event carrying the REAL previous and current status', () => {
    const run = runScenario('BASELINE', { days: 90, stepsPerDay: 4, baseHospital: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });
    const events = deriveObservationEventsFromScenarioRun(run);
    const transition = events.find((e) => e.type === 'ANOMALY' && typeof e.data.previousStatus === 'string');
    expect(transition).toBeDefined();
    expect(transition!.data.status).toBe('CRITICAL');
    expect(transition!.data.previousStatus).not.toBe('CRITICAL');
  });

  it('4. the last event is always EXPERIMENT_COMPLETE and its verdict text matches the real summary', () => {
    const run = runScenario('BASELINE', { days: 60, stepsPerDay: 4 });
    const events = deriveObservationEventsFromScenarioRun(run);
    const last = events[events.length - 1]!;
    expect(last.type).toBe('EXPERIMENT_COMPLETE');
    expect(last.data.firstCriticalDay).toBe(run.summary!.firstCriticalDay);
    expect(last.data.peakBedOccupancy).toBe(run.summary!.peakBedOccupancy);
  });

  it('5. every event id is a pure function of its own content — recomputing from the same run gives identical ids', () => {
    const run = runScenario('ISOLATION', { days: 40, stepsPerDay: 2 });
    const a = deriveObservationEventsFromScenarioRun(run);
    const b = deriveObservationEventsFromScenarioRun(run);
    expect(a.map((e) => e.eventId)).toEqual(b.map((e) => e.eventId));
  });
});

describe('virtualLab — cameraPolicy: deterministic, event-driven, never hard-coded to a scenario', () => {
  it('6. an ANOMALY always cuts to street level regardless of current camera', () => {
    const event = deriveObservationEventForTransition(
      { day: 1, susceptible: 0, exposed: 0, infectious: 0, recovered: 0, deceased: 0, isolated: 0, hospitalized: 0, hospital: { day: 1, requiredCare: 0, occupiedBeds: 0, occupiedIcu: 0, unmetCare: 0, bedOccupancy: 0, icuOccupancy: 0, status: 'NORMAL' } },
      { day: 2, susceptible: 0, exposed: 0, infectious: 0, recovered: 0, deceased: 0, isolated: 0, hospitalized: 0, hospital: { day: 2, requiredCare: 0, occupiedBeds: 0, occupiedIcu: 0, unmetCare: 1, bedOccupancy: 1, icuOccupancy: 1, status: 'CRITICAL' } },
    )!;
    expect(selectCameraForEvent(event, 'city').preset).toBe('street');
    expect(selectCameraForEvent(event, 'agent').preset).toBe('street');
  });

  it('7. a LOW-importance STATE_CHANGE never forces a cut — the camera holds', () => {
    const event = deriveObservationEventForTransition(null, { day: 1, susceptible: 0, exposed: 0, infectious: 0, recovered: 0, deceased: 0, isolated: 0, hospitalized: 0, hospital: { day: 1, requiredCare: 0, occupiedBeds: 0, occupiedIcu: 0, unmetCare: 0, bedOccupancy: 0, icuOccupancy: 0, status: 'NORMAL' } })!;
    const decision = selectCameraForEvent(event, 'agent');
    expect(decision.preset).toBe('agent');
    expect(decision.isCut).toBe(false);
  });

  it('8. EXPERIMENT_COMPLETE always pulls back to the wide city shot for the final verdict frame', () => {
    const run = runScenario('BASELINE', { days: 30, stepsPerDay: 2 });
    const events = deriveObservationEventsFromScenarioRun(run);
    const last = events[events.length - 1]!;
    expect(selectCameraForEvent(last, 'street').preset).toBe('city');
  });

  it('9. the camera timeline is a pure function of the event sequence — same events, same cuts, every time', () => {
    const run = runScenario('BASELINE', { days: 90, stepsPerDay: 4, baseHospital: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });
    const events = deriveObservationEventsFromScenarioRun(run);
    const a = buildCameraTimeline(events);
    const b = buildCameraTimeline(events);
    expect(a).toEqual(b);
    expect(a.length).toBe(events.length);
  });
});

describe('virtualLab — hypothesisFraming: reuses epistemicEngine.ts unchanged, resolves from the REAL run', () => {
  it('10. both hypotheses start UNRESOLVED before any run', () => {
    const graph = buildInitialCapacityHypothesisGraph('test scenario');
    expect(graph.nodes.every((n) => n.status === 'UNRESOLVED')).toBe(true);
  });

  it('11. a run that never reaches CRITICAL SUPPORTS "holds" and FALSIFIES "exceeded"', () => {
    const run = runScenario('BASELINE', { days: 20, stepsPerDay: 2 });
    expect(run.summary!.firstCriticalDay).toBeNull(); // sanity: this run genuinely does not blow the (default, generous) hospital
    const graph = buildInitialCapacityHypothesisGraph('sanity');
    const { graph: finalGraph, verdict } = applyCapacityVerdict(graph, run);
    expect(verdict).toBe('HOLDS');
    expect(finalGraph.nodes.find((n) => n.nodeId === CAPACITY_HOLDS_NODE_ID)!.status).toBe('SUPPORTED');
    expect(finalGraph.nodes.find((n) => n.nodeId === CAPACITY_EXCEEDED_NODE_ID)!.status).toBe('FALSIFIED');
  });

  it('12. a run that DOES exceed capacity flips the verdict — the resolution is not hard-coded to one outcome', () => {
    const run = runScenario('BASELINE', { days: 90, stepsPerDay: 4, baseHospital: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });
    expect(run.summary!.firstCriticalDay).not.toBeNull(); // sanity: this run genuinely does blow the tiny hospital
    const graph = buildInitialCapacityHypothesisGraph('sanity');
    const { graph: finalGraph, verdict } = applyCapacityVerdict(graph, run);
    expect(verdict).toBe('EXCEEDED');
    expect(finalGraph.nodes.find((n) => n.nodeId === CAPACITY_EXCEEDED_NODE_ID)!.status).toBe('SUPPORTED');
    expect(finalGraph.nodes.find((n) => n.nodeId === CAPACITY_HOLDS_NODE_ID)!.status).toBe('FALSIFIED');
  });

  it('13. the resolution reason quotes the real day/percentage from the run, never a placeholder', () => {
    const run = runScenario('BASELINE', { days: 90, stepsPerDay: 4, baseHospital: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });
    const { changes } = applyCapacityVerdict(buildInitialCapacityHypothesisGraph('sanity'), run);
    const supportedChange = changes.find((c) => c.newStatus === 'SUPPORTED')!;
    expect(supportedChange.reason).toContain(String(run.summary!.firstCriticalDay));
  });
});

describe('virtualLab — experimentCapture: highlights point at real events only', () => {
  it('14. the first highlight is always HOOK and the last is RESULT', () => {
    const run = runScenario('BASELINE', { days: 60, stepsPerDay: 4 });
    const events = deriveObservationEventsFromScenarioRun(run);
    const cameraTimeline = buildCameraTimeline(events);
    const highlights = detectHighlights(events, cameraTimeline);
    expect(highlights[0]!.tag).toBe('HOOK');
    expect(highlights[highlights.length - 1]!.tag).toBe('RESULT');
  });

  it('15. every SURPRISE highlight corresponds to a real ANOMALY event, never invented', () => {
    const run = runScenario('BASELINE', { days: 90, stepsPerDay: 4, baseHospital: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });
    const events = deriveObservationEventsFromScenarioRun(run);
    const cameraTimeline = buildCameraTimeline(events);
    const highlights = detectHighlights(events, cameraTimeline);
    const eventsById = new Map(events.map((e) => [e.eventId, e]));
    for (const h of highlights.filter((h) => h.tag === 'SURPRISE')) {
      expect(eventsById.get(h.eventId)!.type).toBe('ANOMALY');
    }
  });

  it('16. the capture fingerprint changes when the underlying run changes', () => {
    const runA = runScenario('BASELINE', { days: 30, stepsPerDay: 2 });
    const runB = runScenario('ISOLATION', { days: 30, stepsPerDay: 2 });
    const eventsA = deriveObservationEventsFromScenarioRun(runA);
    const eventsB = deriveObservationEventsFromScenarioRun(runB);
    const captureA = buildExperimentCapture({ scenarioId: 'BASELINE', scenarioLabel: 'a', question: 'q', hypotheses: [], verdict: 'HOLDS', events: eventsA, cameraTimeline: buildCameraTimeline(eventsA) });
    const captureB = buildExperimentCapture({ scenarioId: 'ISOLATION', scenarioLabel: 'b', question: 'q', hypotheses: [], verdict: 'HOLDS', events: eventsB, cameraTimeline: buildCameraTimeline(eventsB) });
    expect(captureA.captureId).not.toBe(captureB.captureId);
  });
});

describe('virtualLab — liveExperimentSession: the real end-to-end orchestrator + replay', () => {
  it('17. the full session runs against the real Scenario Engine and produces a coherent, non-empty result', () => {
    const result = runLiveExperimentSession('BASELINE', { days: 60, stepsPerDay: 4 });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.cameraTimeline.length).toBe(result.events.length);
    expect(result.capture.highlights.length).toBeGreaterThan(0);
    expect(['HOLDS', 'EXCEEDED']).toContain(result.verdict);
  });

  it('18. MOST IMPORTANT TEST — real experiment -> real state change -> observation event -> multi-camera response -> live result -> replay MATCH', () => {
    const result = runLiveExperimentSession('BASELINE', { days: 90, stepsPerDay: 4, baseHospital: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });

    // Real state change produced real observation events.
    expect(result.events.length).toBeGreaterThan(2);
    // Multi-camera response: more than one distinct preset was actually used.
    const distinctPresets = new Set(result.cameraTimeline.map((c) => c.preset));
    expect(distinctPresets.size).toBeGreaterThan(1);
    // Live result: the epistemic graph was genuinely resolved, not left UNRESOLVED.
    expect(result.finalGraph.nodes.every((n) => n.status === 'SUPPORTED' || n.status === 'FALSIFIED')).toBe(true);
    expect(result.verdict).toBe('EXCEEDED');

    // Replay: rerunning from the SAME saved inputs reproduces the same simulation
    // AND the same cinematic sequence — not a "cinematic replay" divorced from what happened.
    const replay = replayLiveExperimentSession(result);
    expect(replay.status).toBe('MATCH');
    expect(replay.cinematicMatch).toBe(true);
  });

  it('19. a DIFFERENT scenario produces a genuinely different session fingerprint (no hard-coded output)', () => {
    const a = runLiveExperimentSession('BASELINE', { days: 30, stepsPerDay: 2 });
    const b = runLiveExperimentSession('ISOLATION', { days: 30, stepsPerDay: 2 });
    expect(a.sessionFingerprint).not.toBe(b.sessionFingerprint);
  });

  it('20. no fake result: the verdict text always cites the real peak occupancy from the run\'s own summary', () => {
    const result = runLiveExperimentSession('BASELINE', { days: 60, stepsPerDay: 4 });
    const completeEvent = result.events[result.events.length - 1]!;
    expect(completeEvent.statement).toContain(`${(result.run.summary!.peakBedOccupancy * 100).toFixed(0)}%`);
  });
});
