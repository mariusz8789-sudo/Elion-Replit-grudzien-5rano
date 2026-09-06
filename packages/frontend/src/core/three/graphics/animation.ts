/**
 * GENESIS GRAPHICS RUNTIME — Animation
 *
 * A small, generic foundation for continuous, non-skeletal visual motion — machinery spinning, a
 * water surface's gentle bob, vegetation sway, a sensor's attention pulse's rotational counterpart.
 * Generalizes the `object.rotation.y += dt * speed`-shaped pattern already hand-written in several
 * places (the flagship lab's `agitatorGroup`/`hologramRing`, both driven by a REAL scientific rate,
 * never a decorative constant) into one reusable, allocation-free driver, so a future caller with
 * the same shape doesn't re-derive it.
 *
 * Deliberately NOT built here: skeletal/rig animation, IK, blend trees, or anything resembling a
 * full animation-system rewrite of `characterRig.ts`'s existing walk-cycle math — that module
 * already owns humanoid locomotion and this file has no reason to duplicate or replace it. This is
 * the "everything else that just needs to oscillate or spin continuously" primitive.
 */

export interface Oscillator {
  /** Advances by `dt` seconds and returns the current value in `[min, max]` (default `[-1, 1]`) —
   * a sine wave by default, read directly wherever a caller needs a smoothly-varying number (an
   * emissive pulse, a bob offset, a sway angle). */
  update(dt: number): number;
  /** Resets phase to 0 — restarts the cycle without re-constructing the oscillator (matches
   * `stateVisualization.ts`'s `AttentionPulse.trigger()` convention for "restart this timer"). */
  reset(): void;
}

export interface OscillatorOptions {
  /** Seconds per full cycle. Must be > 0. */
  period: number;
  /** Output range. Default `[-1, 1]`. */
  range?: [number, number];
  /** Phase offset in cycles (0..1) — lets several oscillators sharing a period stay out of sync
   * (e.g. several bobbing buoys that shouldn't all crest at once). Default 0. */
  phaseOffset?: number;
}

/** A continuously-running sine driver — the building block `createRotator`'s sway variant and any
 * future "gently oscillate this value" need reuse instead of hand-writing `Math.sin(t * freq)`. */
export function createOscillator(options: OscillatorOptions): Oscillator {
  if (!(options.period > 0)) throw new Error(`createOscillator: period must be > 0 (got ${options.period})`);
  const [min, max] = options.range ?? [-1, 1];
  let elapsed = (options.phaseOffset ?? 0) * options.period;
  return {
    update(dt: number): number {
      elapsed += dt;
      const phase = (elapsed / options.period) * Math.PI * 2;
      const normalized = (Math.sin(phase) + 1) / 2; // 0..1
      return min + normalized * (max - min);
    },
    reset() {
      elapsed = 0;
    },
  };
}

export type RotationAxis = 'x' | 'y' | 'z';

export interface Rotator {
  /** Advances `object`'s rotation on the configured axis by `speedRadPerSec * dt`. Call once per
   * frame; safe to call with `dt = 0` (a no-op). */
  update(dt: number, object: { rotation: Record<RotationAxis, number> }): void;
}

/**
 * A continuous single-axis rotation driver — machinery spinning, a hologram ring turning, a fan
 * blade. `speedRadPerSec` may be negative for the opposite direction, and can be a plain number OR
 * a `() => number` thunk when the rate should track a live, real value (matching the flagship lab's
 * own "spin speed is a function of real vessel occupancy, never a decorative constant" pattern) —
 * this driver never invents the rate itself.
 */
export function createRotator(axis: RotationAxis, speedRadPerSec: number | (() => number)): Rotator {
  return {
    update(dt: number, object: { rotation: Record<RotationAxis, number> }) {
      const speed = typeof speedRadPerSec === 'function' ? speedRadPerSec() : speedRadPerSec;
      object.rotation[axis] += speed * dt;
    },
  };
}

export interface SwayOptions {
  /** Peak deflection in radians. */
  amplitudeRad: number;
  /** Seconds per full sway cycle. */
  period: number;
  axis?: RotationAxis;
  phaseOffset?: number;
}

/**
 * A gentle back-and-forth rotational sway (vegetation in a breeze, a hanging fixture, a buoy) — a
 * thin, named composition of `createOscillator` over a rotation axis, so a caller reaching for
 * "sway" doesn't have to first realize it's an oscillator applied to rotation.
 */
export function createSway(options: SwayOptions): { update(dt: number, object: { rotation: Record<RotationAxis, number> }): void } {
  const oscillator = createOscillator({
    period: options.period,
    range: [-options.amplitudeRad, options.amplitudeRad],
    phaseOffset: options.phaseOffset,
  });
  const axis = options.axis ?? 'z';
  return {
    update(dt: number, object: { rotation: Record<RotationAxis, number> }) {
      object.rotation[axis] = oscillator.update(dt);
    },
  };
}
