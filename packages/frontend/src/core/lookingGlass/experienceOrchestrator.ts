import type { WorldCameraMode } from '../world/cameraPolicy';
import { sampleAnchoredSequence, type AnchoredTemporalSequence } from './anchoredTemporal';
import type { Shot, ShotPlan } from './shotPlan';
import type { ViewpointKind } from './scenarioRequest';

/**
 * LOOKING GLASS — THE EXPERIENCE ORCHESTRATOR.
 *
 * The piece that turns a scenario into something that HAPPENS. Everything
 * upstream is static: the request says what to show, the shot plan says
 * which real moments deserve a cut, the anchored sequence says which states
 * exist. None of them decides what the viewer is looking at one and a half
 * minutes in. That is this module: given a session and a clock, it answers
 * "which shot, which camera, which world time, which observation, and did we
 * just cut" — for any instant, in one pure function.
 *
 * WHERE THE HONESTY LINE SITS, and it is a sharp one:
 *
 *  - WHICH moments are worth showing is NOT decided here. It comes from
 *    `shotPlan`, where every cut cites the real event or observation that
 *    justifies it. This module cannot add a beat, and there is deliberately
 *    no parameter that would let it.
 *  - HOW LONG each shot is held IS decided here, and it is a directorial
 *    choice with no scientific content — the same admission
 *    `cameraSequencer.ts` already makes about camera routes. Holding an
 *    observation for two seconds rather than four changes the edit and
 *    changes nothing about what was measured.
 *
 * So: the science chooses the shot list, the director chooses the pacing,
 * and the two never trade places.
 *
 * Pure arithmetic and no THREE, so the same timeline drives interactive
 * playback, a scrub bar, and an offline capture, and all three agree by
 * construction rather than by three separate implementations agreeing to.
 */

/** Directorial hold times. Not measurements — see the module note above. */
export interface ExperiencePacing {
  readonly establishSeconds?: number;
  readonly markerSeconds?: number;
  readonly resultSeconds?: number;
}

const DEFAULT_PACING: Required<ExperiencePacing> = {
  establishSeconds: 3,
  markerSeconds: 2.6,
  resultSeconds: 3.5,
};

export interface ScheduledShot {
  readonly shot: Shot;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface ExperienceTimeline {
  readonly requestId: string;
  readonly viewpoint: ViewpointKind;
  readonly shots: readonly ScheduledShot[];
  readonly durationSeconds: number;
  /** Present only for an embodied viewpoint; drives the TEMPORAL shot. */
  readonly anchored: AnchoredTemporalSequence | null;
}

export interface ExperienceFrame {
  readonly elapsedSeconds: number;
  /** 0..1 across the whole sequence. */
  readonly progress: number;
  readonly shotIndex: number;
  readonly shot: Shot;
  readonly cameraMode: WorldCameraMode;
  /**
   * The world's own time to display (day, hour). Meaningful for shots on the
   * WORLD_TIME axis; for a marker shot it is the tick that marker carries,
   * which is a state index — read `stateIndex` there instead.
   */
  readonly worldTick: number;
  /** Index into the session's real state series, for marker shots only. */
  readonly stateIndex: number | null;
  /** Presentation-only cross-fade between two real states. Never a state. */
  readonly blend: number;
  /** Real observation/event ids this moment is showing. Never synthesised. */
  readonly activeMarkerIds: readonly string[];
  /** True on the first frame of a shot, so a renderer can hard-cut. */
  readonly isCut: boolean;
  readonly finished: boolean;
}

/**
 * Lays the shot plan out on a real-time clock.
 *
 * The TEMPORAL shot — the held human vantage — takes exactly as long as the
 * anchored sequence really is, because shortening it would mean skipping
 * states the model computed, and lengthening it would mean holding on states
 * that do not exist.
 */
export function buildExperienceTimeline(
  plan: ShotPlan,
  viewpoint: ViewpointKind,
  anchored: AnchoredTemporalSequence | null,
  pacing: ExperiencePacing = {},
): ExperienceTimeline {
  const held = { ...DEFAULT_PACING, ...pacing };
  const shots: ScheduledShot[] = [];
  let cursor = 0;

  for (const shot of plan.shots) {
    let seconds: number;
    if (shot.kind === 'TEMPORAL' && anchored) {
      seconds = Math.max(0, (anchored.keyframes.length - 1) * anchored.secondsPerStep);
    } else if (shot.kind === 'ESTABLISH') {
      seconds = held.establishSeconds;
    } else if (shot.kind === 'RESULT') {
      seconds = held.resultSeconds;
    } else {
      seconds = held.markerSeconds;
    }
    // A zero-length shot would be unreachable by any clock, so it is dropped
    // rather than silently occupying an instant no frame can land on.
    if (seconds <= 0) continue;
    shots.push({ shot, startSeconds: cursor, endSeconds: cursor + seconds });
    cursor += seconds;
  }

  return { requestId: plan.planId, viewpoint, shots, durationSeconds: cursor, anchored };
}

/**
 * What the viewer sees at `seconds`. Pure: the same timeline and the same
 * instant always produce the same frame, which is what lets a scrub bar, the
 * running clock and a capture pass agree.
 */
export function frameAt(timeline: ExperienceTimeline, seconds: number): ExperienceFrame | null {
  if (timeline.shots.length === 0) return null;
  const clamped = Math.max(0, Math.min(seconds, timeline.durationSeconds));
  const finished = clamped >= timeline.durationSeconds;

  let index = timeline.shots.findIndex((scheduled) => clamped < scheduled.endSeconds);
  if (index === -1) index = timeline.shots.length - 1;
  const scheduled = timeline.shots[index];
  const shot = scheduled.shot;
  const shotLength = scheduled.endSeconds - scheduled.startSeconds;
  const withinShot = Math.max(0, clamped - scheduled.startSeconds);
  const shotProgress = shotLength > 0 ? Math.min(1, withinShot / shotLength) : 1;

  let worldTick = shot.fromTick;
  let stateIndex: number | null = null;
  let blend = 0;

  if (shot.kind === 'TEMPORAL' && timeline.anchored) {
    // The held vantage plays the real state series; the sampler owns which
    // two states are current and never blends them into a third.
    const sample = sampleAnchoredSequence(timeline.anchored, withinShot);
    if (sample) {
      worldTick = sample.from.tick;
      stateIndex = sample.from.stateIndex;
      blend = sample.blend;
    }
  } else if (shot.axis === 'WORLD_TIME') {
    worldTick = shot.fromTick + (shot.toTick - shot.fromTick) * shotProgress;
  } else {
    // A STATE_INDEX marker's tick IS the index of the state it belongs to.
    // A WORLD_TIME marker (a canonical event carries a real timestamp) has no
    // state index at all, and inventing one would point the renderer at a
    // state the run never produced.
    worldTick = shot.fromTick;
    stateIndex = shot.axis === 'STATE_INDEX' ? shot.fromTick : null;
  }

  return {
    elapsedSeconds: clamped,
    progress: timeline.durationSeconds > 0 ? clamped / timeline.durationSeconds : 1,
    shotIndex: index,
    shot,
    cameraMode: shot.cameraMode,
    worldTick,
    stateIndex,
    blend,
    activeMarkerIds: shot.sourceMarkerId ? [shot.sourceMarkerId] : [],
    isCut: withinShot === 0,
    finished,
  };
}

export type PlaybackStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'FINISHED';

/**
 * A clock over the timeline: play, pause, scrub, speed, replay.
 *
 * Deliberately thin, and deliberately NOT a React hook or a renderer: it
 * holds an elapsed number and defers every question about what that means to
 * `frameAt`. Speed multiplies the rate at which the clock advances and
 * nothing else — it cannot skip a state, because the frame is still resolved
 * from the same pure function over the same real series.
 */
export class ExperiencePlayer {
  private elapsed = 0;
  private status: PlaybackStatus = 'IDLE';
  private speed = 1;

  constructor(private readonly timeline: ExperienceTimeline) {}

  play(): void {
    this.status = this.elapsed >= this.timeline.durationSeconds ? 'PLAYING' : 'PLAYING';
    if (this.elapsed >= this.timeline.durationSeconds) this.elapsed = 0;
  }

  pause(): void {
    if (this.status === 'PLAYING') this.status = 'PAUSED';
  }

  toggle(): void {
    if (this.status === 'PLAYING') this.pause();
    else this.play();
  }

  /** Restarts from the top — the "replay" of the same real sequence. */
  replay(): void {
    this.elapsed = 0;
    this.status = 'PLAYING';
  }

  /** 0..1 across the sequence. Scrubbing pauses, matching every video control. */
  seek(fraction: number): void {
    this.elapsed = Math.max(0, Math.min(1, fraction)) * this.timeline.durationSeconds;
    if (this.status === 'PLAYING') this.status = 'PAUSED';
  }

  setSpeed(multiplier: number): void {
    this.speed = Math.max(0.1, Math.min(16, multiplier));
  }

  get playbackSpeed(): number { return this.speed; }
  get playbackStatus(): PlaybackStatus { return this.status; }
  get elapsedSeconds(): number { return this.elapsed; }
  get durationSeconds(): number { return this.timeline.durationSeconds; }

  /** Advances the clock by real elapsed time and returns the resulting frame. */
  advance(deltaSeconds: number): ExperienceFrame | null {
    if (this.status === 'PLAYING') {
      this.elapsed += Math.max(0, deltaSeconds) * this.speed;
      if (this.elapsed >= this.timeline.durationSeconds) {
        this.elapsed = this.timeline.durationSeconds;
        this.status = 'FINISHED';
      }
    }
    return frameAt(this.timeline, this.elapsed);
  }

  get currentFrame(): ExperienceFrame | null {
    return frameAt(this.timeline, this.elapsed);
  }
}
