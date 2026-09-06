import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — State-Driven Visualization
 *
 * The one recurring pattern almost every Genesis world needs from its rendering layer: turning an
 * already-computed, REAL value — an occupancy fraction, an infection Rt, a hazard severity score,
 * a sensor reading — into a visual property (a color, an emissive glow, a fill height) on a mesh
 * or light. This module NEVER computes the value and NEVER decides what it means — that is the
 * scientific/simulation engine's job, upstream of this layer. It only answers "given this number,
 * how should it look," consistently, so a new world doesn't re-derive its own ad hoc color ramp
 * and lerp math from scratch.
 *
 * This is additive infrastructure for NEW work, not a retrofit: it does not touch or replace any
 * existing scene's own status-color logic (e.g. the flagship lab's hospital-status vessel glow,
 * which encodes epistemic-status semantics that belong to the World/Discovery-Loop layer, not
 * this one). Use it when building a NEW state-driven visual and you'd otherwise be reinventing
 * this exact color-ramp/scale/pulse math.
 */

export interface ColorScaleStop {
  at: number;
  color: THREE_NS.ColorRepresentation;
}

/**
 * Linearly interpolates a color from a list of stops at `t`. Stops are sorted by `at` internally,
 * so callers don't need to pre-sort. Clamps below the first stop and above the last — a value
 * outside the expected range reads as the nearest extreme instead of extrapolating into an
 * undefined color.
 */
export function sampleColorScale(THREE: typeof THREE_NS, stops: readonly ColorScaleStop[], t: number): THREE_NS.Color {
  if (stops.length === 0) throw new Error('sampleColorScale: stops must not be empty');
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (t <= first.at) return new THREE.Color(first.color);
  if (t >= last.at) return new THREE.Color(last.color);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t >= a.at && t <= b.at) {
      const span = b.at - a.at;
      const localT = span === 0 ? 0 : (t - a.at) / span;
      return new THREE.Color(a.color).lerp(new THREE.Color(b.color), localT);
    }
  }
  return new THREE.Color(last.color);
}

/**
 * A generic NORMAL -> WARNING -> CRITICAL ramp over 0..1 (green through amber to red) — a
 * reasonable default for "how concerning is this value," not a mandate. Pass a different `stops`
 * array to `sampleColorScale`/`severityColor` for a world with its own visual language (a
 * temperature gradient, a blue-to-red diverging scale, a brand-specific palette).
 */
export const SEVERITY_COLOR_SCALE: readonly ColorScaleStop[] = [
  { at: 0, color: 0x3ddc84 },
  { at: 0.5, color: 0xf5c542 },
  { at: 1, color: 0xff4d4f },
];

/** `sampleColorScale` pre-clamped to [0,1] against `SEVERITY_COLOR_SCALE` (or a caller-supplied
 * scale) — the common case of "map this normalized value to a severity color" in one call. */
export function severityColor(THREE: typeof THREE_NS, t: number, scale: readonly ColorScaleStop[] = SEVERITY_COLOR_SCALE): THREE_NS.Color {
  return sampleColorScale(THREE, scale, Math.max(0, Math.min(1, t)));
}

export interface ValueDrivenEmissiveOptions {
  /** Default `SEVERITY_COLOR_SCALE`. */
  scale?: readonly ColorScaleStop[];
  /** Also overwrite the material's base `color`, not just `emissive`. Default false — most
   * emissive-glow use cases (a status light, a vessel glow) want the surface's own color to stay
   * fixed and only the glow to shift with the value. */
  updateBaseColor?: boolean;
  /** When set, also derives `emissiveIntensity` by lerping between these bounds as the value
   * rises — a status that's more severe glows brighter, not just a different hue. Omit to leave
   * `emissiveIntensity` untouched. */
  minIntensity?: number;
  maxIntensity?: number;
}

/**
 * Drives a material's emissive color (and optionally base color/emissiveIntensity) from a real
 * 0..1 value via a color scale — the generalized version of "this vessel glows the color of its
 * current status," for any NEW material a world wires up this way.
 */
export function applyValueToEmissive(
  material: { emissive: THREE_NS.Color; color?: THREE_NS.Color; emissiveIntensity?: number },
  THREE: typeof THREE_NS,
  value: number,
  options: ValueDrivenEmissiveOptions = {},
): void {
  const clamped = Math.max(0, Math.min(1, value));
  const color = sampleColorScale(THREE, options.scale ?? SEVERITY_COLOR_SCALE, clamped);
  material.emissive.copy(color);
  if (options.updateBaseColor) material.color?.copy(color);
  if (options.minIntensity !== undefined || options.maxIntensity !== undefined) {
    const min = options.minIntensity ?? 0;
    const max = options.maxIntensity ?? 1;
    material.emissiveIntensity = min + clamped * (max - min);
  }
}

export interface FractionScaleOptions {
  /** Which axis (or all three) to scale. Default `'y'` — a vertical fill/growth gauge, the most
   * common shape (a fluid level, a bar chart column). */
  axis?: 'x' | 'y' | 'z' | 'xyz';
  /** Scale value at fraction 0. Default 0 (fully collapsed). Raise this to keep a gauge visible
   * (never fully hidden) even at zero. */
  min?: number;
  /** Scale value at fraction 1. Default 1 (full/unscaled). */
  max?: number;
}

/**
 * Scales an object along one or more axes proportionally to a real 0..1 fraction — a fluid fill
 * level, a growth/depletion gauge, a loading indicator. Generalizes the "vessel fill height =
 * bed-occupancy fraction" pattern for any NEW gauge-shaped object. Fraction is clamped to [0,1]
 * before mapping into `[min, max]`.
 */
export function applyFractionToScale(
  object: { scale: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void } },
  fraction: number,
  options: FractionScaleOptions = {},
): void {
  const clamped = Math.max(0, Math.min(1, fraction));
  const min = options.min ?? 0;
  const max = options.max ?? 1;
  const scaleValue = min + clamped * (max - min);
  const axis = options.axis ?? 'y';
  const x = axis === 'x' || axis === 'xyz' ? scaleValue : object.scale.x;
  const y = axis === 'y' || axis === 'xyz' ? scaleValue : object.scale.y;
  const z = axis === 'z' || axis === 'xyz' ? scaleValue : object.scale.z;
  object.scale.set(x, y, z);
}

/**
 * ATTENTION PULSE — a short, decaying 0..1 intensity spike for event-driven visual emphasis (a
 * new hotspot appearing, a transmission event firing, an anomaly detected). The caller multiplies
 * the returned intensity into whatever visual property should flash (`emissiveIntensity`,
 * opacity, a light's `intensity`) — this class holds no rendering state itself, just the timing
 * curve, so it works identically for a `Mesh`, a `Light`, or a 2D overlay.
 */
export class AttentionPulse {
  private elapsed: number;

  constructor(private readonly durationSeconds = 1.2) {
    this.elapsed = durationSeconds;
  }

  /** Restarts the pulse from full intensity. Safe to call while already pulsing — it just resets
   * the clock, so a rapid burst of events reads as one sustained flash instead of an odd restart
   * artifact. */
  trigger(): void {
    this.elapsed = 0;
  }

  /** Advances the pulse by `dt` seconds and returns the current 0..1 intensity (1 = just
   * triggered, 0 = fully decayed or never triggered). Uses a simple ease-out decay — sharp
   * attack, gradual fade, matching how a UI/HUD "flash" typically reads. */
  update(dt: number): number {
    this.elapsed += Math.max(0, dt);
    if (this.elapsed >= this.durationSeconds) return 0;
    const t = this.elapsed / this.durationSeconds;
    return 1 - t * t;
  }

  get isActive(): boolean {
    return this.elapsed < this.durationSeconds;
  }
}
