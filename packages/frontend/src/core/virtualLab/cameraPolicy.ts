import type { CityCameraPreset } from '../three/epidemicCity3D';
import type { ObservationEvent } from './observationEvent';

/**
 * CAMERA POLICY — a deterministic function from (event, previous camera) to
 * the next camera. Reuses the EXACT `CityCameraPreset` type the live 3D view
 * already switches between (`'city' | 'district' | 'street' | 'agent'`) —
 * this policy does not invent new camera identities, it decides WHEN to cut
 * to which of the ones that already exist and already track real world
 * state.
 *
 * DETERMINISM IS THE POINT: the same event sequence always produces the same
 * camera sequence. No RNG, no wall-clock, no hidden state beyond the single
 * `previousPreset` the caller already tracks. This is what makes a
 * replayed experiment's CINEMATIC sequence reproducible, not just its
 * underlying numbers — see `liveExperimentSession.ts`'s replay check.
 *
 * This is intentionally a plain decision table, not an "AI director" or an
 * LLM call — `ScienceDirector`-style intelligence can later replace this
 * function's BODY without changing its signature or the rest of the
 * pipeline that depends on it.
 */
export const CAMERA_POLICY_VERSION = '1.0.0';

export interface CameraDecision {
  preset: CityCameraPreset;
  reason: string;
  /** True when this decision actually differs from the previous preset — a cut happened. */
  isCut: boolean;
}

/**
 * CRITICAL/ANOMALY events pull the camera in close (street-level, the most
 * "in the room" view this rig has); a genuine threshold crossing pulls back
 * to district scale so the viewer can see the system, not just one street;
 * the experiment's conclusion pulls all the way out to the establishing
 * city shot for a final verdict frame; anything low-importance is not worth
 * a cut and keeps whatever camera was already showing.
 */
export function selectCameraForEvent(event: ObservationEvent, previousPreset: CityCameraPreset): CameraDecision {
  const preset = ((): CityCameraPreset => {
    switch (event.type) {
      case 'ANOMALY':
        return 'street';
      case 'THRESHOLD_CROSSED':
      case 'PREDICTION_DIVERGENCE':
        return event.importance === 'CRITICAL' || event.importance === 'HIGH' ? 'street' : 'district';
      case 'EXPERIMENT_COMPLETE':
        return 'city';
      case 'PREDICTION_MATCH':
        return 'district';
      case 'STATE_CHANGE':
      default:
        return event.importance === 'LOW' ? previousPreset : 'district';
    }
  })();

  return {
    preset,
    reason: `${event.type} (${event.importance}) at day ${event.tick}: ${event.statement}`,
    isCut: preset !== previousPreset,
  };
}

export interface CameraTimelineEntry {
  tick: number;
  preset: CityCameraPreset;
  triggeredByEventId: string;
  isCut: boolean;
  reason: string;
}

/**
 * Runs the policy over a full, already-derived event sequence. Starts from
 * `'city'` — the same default `City3DWebGLScreen.tsx` already opens on —
 * so a live session's first frame matches what a user already sees before
 * Live Science Mode is switched on.
 */
export function buildCameraTimeline(events: readonly ObservationEvent[], initialPreset: CityCameraPreset = 'city'): readonly CameraTimelineEntry[] {
  const timeline: CameraTimelineEntry[] = [];
  let current = initialPreset;
  for (const event of events) {
    const decision = selectCameraForEvent(event, current);
    timeline.push({ tick: event.tick, preset: decision.preset, triggeredByEventId: event.eventId, isCut: decision.isCut, reason: decision.reason });
    current = decision.preset;
  }
  return timeline;
}
