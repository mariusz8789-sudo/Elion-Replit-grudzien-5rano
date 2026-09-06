import type { WorldCameraMode } from '../world/cameraPolicy';
import { frameAt, type ExperienceFrame, type ExperienceTimeline } from './experienceOrchestrator';
import type { EvidenceRef, ScenarioWorld } from './scenarioWorld';
import type { ShotKind } from './shotPlan';
import { PERSPECTIVES, perspectiveRequest, type PerspectiveRequest } from './perspective';
import type { ViewpointKind } from './scenarioRequest';

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
   * The full payload the Graphics Engine camera rig consumes: vantage,
   * target and world extent, with no scientific semantics. Emitted now so a
   * screen passes it straight through the moment the rig exists, instead of
   * each world keeping its own intent-to-preset table forever.
   */
  readonly cameraRequest: PerspectiveRequest;

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

  /**
   * The clock's own reason for `worldTime` — WHY this tick and not the one
   * asked for, in words a screen can show. Previously computed by
   * `WorldClock.resolve`/`resolveForeign` and then discarded here; now
   * carried through so "why did the world just freeze" or "why did it jump
   * to a different day than expected" has a real answer instead of a
   * screen guessing from `worldTimeSource` alone.
   */
  readonly worldTimeReason: string;
  /** True when the requested tick did not exist and the clock snapped to the nearest real one — a genuine gap in the run, not a rendering choice. */
  readonly worldTimeSnapped: boolean;
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
  return directionForFrame(frame, world, timeline.viewpoint);
}

export function directionForFrame(
  frame: ExperienceFrame,
  world: ScenarioWorld,
  viewpoint: ViewpointKind = 'OBSERVER',
): WorldDirection {
  const range = world.getTemporalRange();
  const bounds = world.getBounds();
  const centre: readonly [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1] + (PERSPECTIVES[viewpoint].eyeHeight ?? (bounds.max[1] - bounds.min[1]) * 0.4),
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  // A shot that cuts to a different vantage than the viewer's own (the
  // establishing wide, the closing wide) requests that vantage, not theirs.
  const shotViewpoint: ViewpointKind = frame.cameraMode === 'WIDE' ? 'WIDE'
    : frame.cameraMode === 'MACRO' ? 'MACRO'
    : frame.cameraMode === 'CINEMATIC' ? 'OBSERVER'
    : viewpoint;
  const cameraRequest = perspectiveRequest(shotViewpoint, centre, bounds);
  const evidence = frame.activeMarkerIds
    .map((id) => world.getEvidence(id))
    .filter((entry): entry is EvidenceRef => entry !== null);

  let worldTime: number | null;
  let worldTimeSource: WorldTimeSource;
  let worldTimeReason: string;
  let worldTimeSnapped: boolean;

  if (frame.shot.sourceMarkerId === null) {
    // Structural shot: its ticks are the plan's own span, which IS the
    // viewer's clock. The clock decides what may be shown — a run with gaps
    // snaps to a real tick rather than landing on a state nobody computed.
    const resolved = world.clock.resolve({
      source: 'SEQUENCE',
      tick: frame.worldTick,
      current: range.from,
    });
    worldTime = resolved.granted ? resolved.worldTime : null;
    worldTimeSource = frame.shot.kind === 'TEMPORAL' ? 'VIEWER_CLOCK' : 'SHOT_SPAN';
    worldTimeReason = resolved.reason;
    worldTimeSnapped = resolved.snapped;
  } else {
    const marker = [...world.getEvents(frame.worldTick, frame.worldTick)]
      .find((event) => event.id === frame.shot.sourceMarkerId);
    const resolved = marker
      ? world.clock.resolveForeign({
        source: 'EVENT_JUMP', tick: marker.time.tick, current: range.from, onViewerClock: marker.time.onViewerClock,
      })
      : null;
    if (resolved?.granted) {
      worldTime = resolved.worldTime;
      worldTimeSource = 'VIEWER_CLOCK';
      worldTimeReason = resolved.reason;
      worldTimeSnapped = resolved.snapped;
    } else {
      // Either an observation (indexed by state, not by day) or an event from
      // a run of a different length. Both would produce a fabricated date.
      worldTime = null;
      worldTimeSource = 'FOREIGN_RUN';
      worldTimeReason = resolved?.reason
        ?? `no event with id "${frame.shot.sourceMarkerId}" exists on this run's clock at this tick`;
      worldTimeSnapped = false;
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
    cameraRequest,
    worldTime,
    worldTimeSource,
    worldTimeReason,
    worldTimeSnapped,
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
 * STAND-IN, TO BE DELETED. Maps a camera intent onto the four presets a
 * city-style world happens to expose.
 *
 * This is camera realization, which belongs to the Graphics Engine, not
 * here — the product layer should say "a person standing on the street" and
 * the engine should decide where that camera physically goes. It survives
 * only because the engine's camera rig does not exist yet, and it is
 * deliberately the whole of the duplication rather than a scattering of it:
 * one function, one call site, driven by `WorldDirection.cameraRequest`'s
 * intent, so removing it is a single deletion once the rig lands.
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
