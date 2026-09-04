import { canonicalJson, fnv1a } from '../events/hash';
import type { CameraTimelineEntry } from './cameraPolicy';
import type { ObservationEvent } from './observationEvent';

/**
 * EXPERIMENT CAPTURE — the recording a later social-clip generator would
 * need, WITHOUT building that generator now. This module only assembles
 * real data already produced upstream (the camera timeline, the observation
 * events, the hypothesis verdict) into one addressable structure and flags
 * which real moments are worth a highlight — it never invents footage, a
 * score, or a "viral" label. A highlight here is a pointer into real,
 * already-derived facts (an event id + a camera at a tick), nothing else.
 */
export const EXPERIMENT_CAPTURE_VERSION = '1.0.0';

export type HighlightTag = 'HOOK' | 'SETUP' | 'TENSION' | 'SURPRISE' | 'RESULT';

export interface Highlight {
  tag: HighlightTag;
  tick: number;
  eventId: string;
  cameraPreset: string;
  /** The real scientific meaning of this moment, taken verbatim from the event that earned it. */
  scientificMeaning: string;
}

export interface ExperimentCaptureTimeline {
  captureId: string;
  scenarioId: string;
  scenarioLabel: string;
  question: string;
  hypotheses: readonly string[];
  verdict: 'HOLDS' | 'EXCEEDED';
  events: readonly ObservationEvent[];
  cameraTimeline: readonly CameraTimelineEntry[];
  highlights: readonly Highlight[];
}

/**
 * Tags real moments a clip generator could cut around. Rules are event-type
 * driven, not scenario-specific: the FIRST event is always the HOOK/SETUP
 * (the audience needs to be told what's being watched before anything
 * happens), the first real threshold crossing is TENSION (things are
 * changing), any ANOMALY is a SURPRISE (an unmet-care or CRITICAL moment is
 * genuinely the most dramatic real fact this domain can produce), and
 * EXPERIMENT_COMPLETE is always the RESULT beat.
 */
export function detectHighlights(events: readonly ObservationEvent[], cameraTimeline: readonly CameraTimelineEntry[]): readonly Highlight[] {
  const cameraByEventId = new Map(cameraTimeline.map((entry) => [entry.triggeredByEventId, entry]));
  const highlights: Highlight[] = [];
  let sawTension = false;

  events.forEach((event, index) => {
    const camera = cameraByEventId.get(event.eventId);
    const cameraPreset = camera?.preset ?? 'city';

    if (index === 0) {
      highlights.push({ tag: 'HOOK', tick: event.tick, eventId: event.eventId, cameraPreset, scientificMeaning: event.statement });
      return;
    }
    if (event.type === 'ANOMALY') {
      highlights.push({ tag: 'SURPRISE', tick: event.tick, eventId: event.eventId, cameraPreset, scientificMeaning: event.statement });
      return;
    }
    if (!sawTension && event.type === 'THRESHOLD_CROSSED') {
      sawTension = true;
      highlights.push({ tag: 'TENSION', tick: event.tick, eventId: event.eventId, cameraPreset, scientificMeaning: event.statement });
      return;
    }
    if (event.type === 'EXPERIMENT_COMPLETE') {
      highlights.push({ tag: 'RESULT', tick: event.tick, eventId: event.eventId, cameraPreset, scientificMeaning: event.statement });
    }
  });

  return highlights;
}

export function buildExperimentCapture(input: {
  scenarioId: string;
  scenarioLabel: string;
  question: string;
  hypotheses: readonly string[];
  verdict: 'HOLDS' | 'EXCEEDED';
  events: readonly ObservationEvent[];
  cameraTimeline: readonly CameraTimelineEntry[];
}): ExperimentCaptureTimeline {
  const highlights = detectHighlights(input.events, input.cameraTimeline);
  const captureId = fnv1a(canonicalJson({
    v: EXPERIMENT_CAPTURE_VERSION,
    scenarioId: input.scenarioId,
    eventIds: input.events.map((e) => e.eventId),
    cameraPresets: input.cameraTimeline.map((c) => `${c.tick}:${c.preset}`),
    verdict: input.verdict,
  }));
  return { captureId, ...input, highlights };
}
