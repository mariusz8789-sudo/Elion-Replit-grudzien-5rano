import type { TemporalUnit } from './scenarioRequest';

/**
 * LOOKING GLASS — ANCHORED VIEWPOINT, MOVING TIME.
 *
 * The Looking Glass capability that a chart cannot substitute for: the
 * viewer stays in one physical place — sitting on a bench, standing at a
 * console — and the world advances through its real states around them.
 * Sixty days of an epidemic pass at street level; a culture fills a vessel
 * while the scientist stands still. The camera not moving is the entire
 * point, which is why the anchor is modelled here as data rather than left
 * to whatever the camera controller happens to do.
 *
 * WHERE THE HONESTY LINE SITS, precisely:
 *
 *  - The KEYFRAMES are real. Each one names a tick and the index of an
 *    actual state in the run's series. This module never generates a state,
 *    interpolates a scientific value, or extrapolates past the last one it
 *    was given. If the series has 60 entries, the sequence has at most 60
 *    keyframes and stops.
 *  - The BLEND between two keyframes is presentation, and is marked as such
 *    (`blend` is returned separately from the two real state indices, never
 *    folded into a single "current value"). A renderer may cross-fade the
 *    two real states it is handed. It may not be told that the midpoint IS
 *    a state, because no model produced it. This is the same boundary
 *    `cameraSequencer.ts` draws for camera routes.
 *
 * Pure arithmetic, no THREE, no state of its own — so the same sequence can
 * drive interactive playback, a scrub bar, or an offline capture, and all
 * three agree by construction.
 */

export type Vec3 = readonly [number, number, number];

/** Where the viewer is, and stays. */
export interface TemporalAnchor {
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly eyeHeight: number;
  /** How to describe this spot to the user ("bench", "console"). */
  readonly label: string;
}

export interface TemporalKeyframe {
  readonly tick: number;
  /** Index into the caller's real state series. Never synthesised. */
  readonly stateIndex: number;
  /** Time label in the world's own units ("Day 12", "Hour 6"). */
  readonly label: string;
}

export interface AnchoredTemporalSequence {
  readonly anchor: TemporalAnchor;
  readonly keyframes: readonly TemporalKeyframe[];
  readonly unit: TemporalUnit;
  /** Real-time seconds one keyframe-to-keyframe step takes during playback. */
  readonly secondsPerStep: number;
}

const UNIT_LABEL: Readonly<Record<TemporalUnit, string>> = { HOUR: 'Hour', DAY: 'Day', YEAR: 'Year' };

/**
 * Builds the sequence from a run's real states.
 *
 * `stateTicks` is the tick of each state in the series, in order — the
 * caller passes what the run actually produced, and gets back a sequence
 * that cannot outrun it. `maxKeyframes` thins a long series by taking an
 * evenly spaced subset (the first and last are always kept, so the sequence
 * always starts at the beginning and ends at the true final state); it never
 * invents intermediate ticks.
 */
export function buildAnchoredSequence(
  anchor: TemporalAnchor,
  stateTicks: readonly number[],
  unit: TemporalUnit,
  options: { readonly maxKeyframes?: number; readonly secondsPerStep?: number } = {},
): AnchoredTemporalSequence {
  const maxKeyframes = Math.max(2, options.maxKeyframes ?? 60);
  const secondsPerStep = options.secondsPerStep ?? 1;

  const keyframes: TemporalKeyframe[] = [];
  if (stateTicks.length === 0) {
    return { anchor, keyframes, unit, secondsPerStep };
  }
  if (stateTicks.length <= maxKeyframes) {
    for (let index = 0; index < stateTicks.length; index++) {
      keyframes.push({ tick: stateTicks[index], stateIndex: index, label: `${UNIT_LABEL[unit]} ${stateTicks[index]}` });
    }
  } else {
    const last = stateTicks.length - 1;
    const seen = new Set<number>();
    for (let step = 0; step < maxKeyframes; step++) {
      const index = Math.round((step / (maxKeyframes - 1)) * last);
      if (seen.has(index)) continue;
      seen.add(index);
      keyframes.push({ tick: stateTicks[index], stateIndex: index, label: `${UNIT_LABEL[unit]} ${stateTicks[index]}` });
    }
  }
  return { anchor, keyframes, unit, secondsPerStep };
}

/**
 * What the renderer should show at a moment in playback.
 *
 * Returns the two REAL states either side and how far between them the
 * playhead sits, deliberately kept as three separate fields. A renderer that
 * only knows how to show one state can use `from` and ignore `blend`
 * entirely and still be correct — it will simply step rather than dissolve.
 */
export interface AnchoredSample {
  readonly from: TemporalKeyframe;
  readonly to: TemporalKeyframe;
  /** 0..1 position between `from` and `to`. Presentation only. */
  readonly blend: number;
  /** True once the playhead has reached the final real state. */
  readonly finished: boolean;
}

export function sampleAnchoredSequence(sequence: AnchoredTemporalSequence, elapsedSeconds: number): AnchoredSample | null {
  const { keyframes, secondsPerStep } = sequence;
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) {
    return { from: keyframes[0], to: keyframes[0], blend: 0, finished: true };
  }
  const total = (keyframes.length - 1) * secondsPerStep;
  if (elapsedSeconds >= total) {
    const last = keyframes[keyframes.length - 1];
    return { from: last, to: last, blend: 0, finished: true };
  }
  const clamped = Math.max(0, elapsedSeconds);
  const position = clamped / secondsPerStep;
  const index = Math.min(keyframes.length - 2, Math.floor(position));
  return { from: keyframes[index], to: keyframes[index + 1], blend: position - index, finished: false };
}

/** Playback length in real seconds. Zero for a sequence with nothing to play. */
export function anchoredSequenceDuration(sequence: AnchoredTemporalSequence): number {
  return Math.max(0, (sequence.keyframes.length - 1) * sequence.secondsPerStep);
}

/**
 * Maps a scrub position (0..1 across the whole sequence) to elapsed seconds,
 * so a timeline control and the clock drive the exact same sampler.
 */
export function scrubToSeconds(sequence: AnchoredTemporalSequence, fraction: number): number {
  return Math.max(0, Math.min(1, fraction)) * anchoredSequenceDuration(sequence);
}
