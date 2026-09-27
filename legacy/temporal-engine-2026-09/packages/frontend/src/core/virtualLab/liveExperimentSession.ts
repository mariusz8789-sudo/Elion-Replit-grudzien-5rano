import { canonicalJson, fnv1a } from '../events/hash';
import { replayScenario, runScenario, SCENARIOS, type ScenarioId, type ScenarioReplayStatus, type ScenarioRun, type ScenarioRunOptions } from '../simulation/scenarioEngine';
import type { CityCameraPreset } from '../three/epidemicCity3D';
import { buildCameraTimeline, type CameraTimelineEntry } from './cameraPolicy';
import { buildExperimentCapture, type ExperimentCaptureTimeline } from './experimentCapture';
import { applyCapacityVerdict, buildInitialCapacityHypothesisGraph, CAPACITY_EXCEEDED_NODE_ID, CAPACITY_HOLDS_NODE_ID } from './hypothesisFraming';
import { deriveObservationEventsFromScenarioRun, type ObservationEvent } from './observationEvent';
import type { EpistemicChange, EpistemicGraph } from '../discovery/epistemicEngine';

/**
 * LIVE EXPERIMENT SESSION — the one orchestrator this vertical slice adds.
 *
 * It calls exactly four things this codebase already had, in this order,
 * and adds nothing of its own to the SCIENCE:
 *   runScenario()                    (existing Scenario Engine — unchanged)
 *   buildInitialCapacityHypothesisGraph() / applyCapacityVerdict()  (new, but
 *     built entirely on the existing, unchanged epistemicEngine.ts)
 *   deriveObservationEventsFromScenarioRun()   (new — this file's own module)
 *   buildCameraTimeline() / buildExperimentCapture()  (new — this file's own modules)
 *
 * SIMULATION = SOURCE OF TRUTH: everything the session reports is read from
 * `ScenarioRun` (real, already-computed) or the hypothesis graph derived
 * from it. No field here is independently invented for presentation.
 */
export const LIVE_EXPERIMENT_SESSION_VERSION = '1.0.0';

export interface LiveExperimentSessionResult {
  scenarioId: ScenarioId;
  question: string;
  run: ScenarioRun;
  initialGraph: EpistemicGraph;
  finalGraph: EpistemicGraph;
  changes: readonly EpistemicChange[];
  verdict: 'HOLDS' | 'EXCEEDED';
  events: readonly ObservationEvent[];
  cameraTimeline: readonly CameraTimelineEntry[];
  capture: ExperimentCaptureTimeline;
  sessionFingerprint: string;
}

const QUESTION = 'Will hospital capacity hold for the full run, or will it be exceeded?';

export function runLiveExperimentSession(scenarioId: ScenarioId, options: ScenarioRunOptions = {}): LiveExperimentSessionResult {
  const run = runScenario(scenarioId, options);
  const scenarioLabel = SCENARIOS[scenarioId].label;

  const initialGraph = buildInitialCapacityHypothesisGraph(scenarioLabel);
  const { graph: finalGraph, changes, verdict } = applyCapacityVerdict(initialGraph, run);

  const events = deriveObservationEventsFromScenarioRun(run);
  const cameraTimeline = buildCameraTimeline(events);
  const capture = buildExperimentCapture({
    scenarioId,
    scenarioLabel,
    question: QUESTION,
    hypotheses: [
      finalGraph.nodes.find((n) => n.nodeId === CAPACITY_HOLDS_NODE_ID)!.statement,
      finalGraph.nodes.find((n) => n.nodeId === CAPACITY_EXCEEDED_NODE_ID)!.statement,
    ],
    verdict,
    events,
    cameraTimeline,
  });

  const sessionFingerprint = fnv1a(canonicalJson({
    v: LIVE_EXPERIMENT_SESSION_VERSION,
    resultFingerprint: run.resultFingerprint,
    eventIds: events.map((e) => e.eventId),
    cameraPresets: cameraTimeline.map((c) => c.preset),
    verdict,
  }));

  return { scenarioId, question: QUESTION, run, initialGraph, finalGraph, changes, verdict, events, cameraTimeline, capture, sessionFingerprint };
}

export interface LiveExperimentSessionReplay {
  status: ScenarioReplayStatus;
  /** Beyond the underlying simulation's own MATCH/DRIFT: did the CINEMATIC sequence (events + camera cuts) also reproduce exactly? */
  cinematicMatch: boolean;
  message: string;
}

/**
 * Reruns the session from the saved run's own recorded inputs (via the
 * existing `replayScenario`) and checks that the resulting camera/event
 * sequence — not just the epidemic numbers — reproduces exactly. A
 * "cinematic replay" that does not match what actually happened would be
 * exactly the dishonesty this mission forbids.
 */
export function replayLiveExperimentSession(saved: LiveExperimentSessionResult): LiveExperimentSessionReplay {
  const replay = replayScenario(saved.run);
  if (replay.status !== 'MATCH') {
    return { status: replay.status, cinematicMatch: false, message: replay.message };
  }

  const replayedEvents = deriveObservationEventsFromScenarioRun(saved.run);
  const replayedCameraTimeline = buildCameraTimeline(replayedEvents);
  const cinematicMatch = fnv1a(canonicalJson(replayedCameraTimeline.map((c) => c.preset))) === fnv1a(canonicalJson(saved.cameraTimeline.map((c) => c.preset)))
    && fnv1a(canonicalJson(replayedEvents.map((e) => e.eventId))) === fnv1a(canonicalJson(saved.events.map((e) => e.eventId)));

  return {
    status: 'MATCH',
    cinematicMatch,
    message: cinematicMatch
      ? 'Simulation replayed bit-for-bit AND the same observation events and camera cuts were reproduced.'
      : 'Simulation replayed bit-for-bit but the derived observation events or camera sequence differ — the presentation layer is not deterministic given the same run.',
  };
}

export function describeCameraPresetLabel(preset: CityCameraPreset): string {
  switch (preset) {
    case 'city': return 'Wide city establishing shot';
    case 'district': return 'District overview';
    case 'street': return 'Street-level close observation';
    case 'agent': return 'Agent tracking shot';
  }
}
