import type { WorldCameraMode } from '../world/cameraPolicy';
import { frameAt, type ExperienceFrame, type ExperienceTimeline } from './experienceOrchestrator';
import type { EvidenceRef, ScenarioWorld } from './scenarioWorld';
import type { ShotKind } from './shotPlan';

/**
 * LOOKING GLASS — DIRECTING THE ACTUAL WORLD.
 *
 * The missing wire. The orchestrator says what the viewer should be looking
 * at; a world screen knows how to move a camera and set a day. Neither knew
 * about the other, so a cinematic sequence played in a panel while the 3D
 * world sat on whatever day it happened to be on. This translates one into
 * the other, and it is deliberately renderer-agnostic — it emits an
 * INTENTION, and a screen maps that intention onto its own controls.
 *
 * THE RULE THAT SHAPES THIS FILE: never move the world to a time that did
 * not happen on the viewer's clock.
 *
 * That is not a hypothetical scruple. A pre-registered loop runs its own
 * scenarios at their own lengths, so an observation can legitimately belong
 * to day 72 of a run while the viewer is scrubbing a 60-day series. Jumping
 * the city to "day 72" there would render a day that series never had, and
 * it would look completely convincing. So a direction carries the world time
 * ONLY when the marker sits on the viewer's own clock; otherwise it says so,
 * holds the previous day, and lets the camera and the evidence panel carry
 * the cut. The viewer still sees the observation — they are simply not told
 * a false date for it.
 */

export type WorldTimeSource =
  /** The tick is on the viewer's series; a screen may move its timeline. */
  | 'VIEWER_CLOCK'
  /** The marker belongs to a different run. Hold the current time. */
  | 'FOREIGN_RUN'
  /** Structural shot with no marker; time is whatever the shot spans. */
  | 'SHOT_SPAN';

export interface WorldDirection {
  readonly elapsedSeconds: number;
  readonly progress: number;
  readonly shotKind: ShotKind;
  readonly reason: string;
  /** True on the first frame of a shot, so a screen can hard-cut. */
  readonly isCut: boolean;
  readonly finished: boolean;

  /** Camera intent in the existing vocabulary. The screen maps it to its own presets. */
  readonly cameraIntent: WorldCameraMode;

  /**
   * The world time to display, or null when it must not be moved. A screen
   * MUST treat null as "hold what you have" rather than as zero.
   */
  readonly worldTime: number | null;
  readonly worldTimeSource: WorldTimeSource;

  /** Real state index, where one genuinely exists. */
  readonly stateIndex: number | null;
  /** Markers this moment is showing. Always real ids. */
  readonly markerIds: readonly string[];
  /** Provenance for those markers, resolved through the scenario contract. */
  readonly evidence: readonly EvidenceRef[];
}

/**
 * Resolves one instant into an instruction a world screen can execute.
 * Pure, so a screen, a scrub bar and a capture pass all agree.
 */
export function directionAt(
  timeline: ExperienceTimeline,
  world: ScenarioWorld,
  seconds: number,
): WorldDirection | null {
  const frame = frameAt(timeline, seconds);
  if (!frame) return null;
  return directionForFrame(frame, world);
}

export function directionForFrame(frame: ExperienceFrame, world: ScenarioWorld): WorldDirection {
  const range = world.getTemporalRange();
  const evidence = frame.activeMarkerIds
    .map((id) => world.getEvidence(id))
    .filter((entry): entry is EvidenceRef => entry !== null);

  let worldTime: number | null;
  let worldTimeSource: WorldTimeSource;

  if (frame.shot.sourceMarkerId === null) {
    // Structural shot: its ticks are the plan's own span, which IS the
    // viewer's clock, so it may drive the timeline — clamped to what exists.
    worldTime = Math.max(range.from, Math.min(range.to, frame.worldTick));
    worldTimeSource = frame.shot.kind === 'TEMPORAL' ? 'VIEWER_CLOCK' : 'SHOT_SPAN';
  } else {
    const marker = [...world.getEvents(frame.worldTick, frame.worldTick)]
      .find((event) => event.id === frame.shot.sourceMarkerId);
    if (marker?.time.onViewerClock) {
      worldTime = marker.time.tick;
      worldTimeSource = 'VIEWER_CLOCK';
    } else {
      // Either an observation (indexed by state, not by day) or an event from
      // a run of a different length. Both would produce a fabricated date.
      worldTime = null;
      worldTimeSource = 'FOREIGN_RUN';
    }
  }

  return {
    elapsedSeconds: frame.elapsedSeconds,
    progress: frame.progress,
    shotKind: frame.shot.kind,
    reason: frame.shot.reason,
    isCut: frame.isCut,
    finished: frame.finished,
    cameraIntent: frame.cameraMode,
    worldTime,
    worldTimeSource,
    stateIndex: frame.stateIndex,
    markerIds: frame.activeMarkerIds,
    evidence,
  };
}

/**
 * The camera presets a city-style world offers. Kept as a named contract so
 * the mapping below is a single, testable decision rather than a switch
 * buried in a component.
 */
export type CityStylePreset = 'city' | 'district' | 'street' | 'agent';

/**
 * Camera INTENT to a city-style world's presets. Generic by construction —
 * it reads the intent, never the domain, so a second world with the same
 * four vantages reuses it and a world with different ones writes its own
 * mapping without touching the director.
 */
export function cityPresetFor(intent: WorldCameraMode): CityStylePreset {
  switch (intent) {
    case 'HUMAN_EYE': return 'street';
    case 'MACRO': return 'agent';
    case 'SCIENTIFIC': return 'district';
    case 'WIDE':
    case 'CINEMATIC':
    default: return 'city';
  }
}
