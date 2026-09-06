import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Canonical Visual State Mapping (discrete states)
 *
 * `stateVisualization.ts` already covers the CONTINUOUS case — "map this 0..1 number to a color"
 * (`severityColor`/`sampleColorScale`) and the fraction/pulse primitives built on it. What it does
 * NOT cover is the DISCRETE case: a named categorical state a C3 entity carries (a pump is
 * `'FAILURE'`, a ward is `'CONTAMINATED'`, a sensor is `'OFFLINE'`) that has no natural position on
 * a 0..1 scale — there is no "0.5 between OFFLINE and ACTIVE." This module is that second half:
 * one canonical vocabulary of discrete states, each with an already-tuned color/emissive
 * presentation, so a new WorldFrame consumer doesn't invent its own ad hoc
 * `state === 'critical' ? 0xff0000 : ...` ladder per scene.
 *
 * SAME BOUNDARY AS `stateVisualization.ts`: this module never computes or decides what state an
 * entity is in — that is C3's job, resolved upstream. It only answers "given this ALREADY-RESOLVED
 * named state, how should it look" — one function call, consistently, reusing
 * `AttentionPulse` (already in `stateVisualization.ts`) for the states that should visibly pulse
 * rather than sit at a flat intensity.
 */

export type CanonicalVisualState =
  | 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE' | 'DAMAGED' | 'ACTIVE' | 'INACTIVE'
  | 'CONTAMINATED' | 'INFECTED' | 'OVERFLOW' | 'FAILURE' | 'UNDER_OBSERVATION';

export interface VisualStatePresentation {
  /** Emissive (and, if `updateBaseColor` is set, base) color for this state. */
  color: THREE_NS.ColorRepresentation;
  /** Baseline emissive intensity — before any pulse boost. */
  emissiveIntensity: number;
  /** Whether this state reads as visually URGENT enough to pulse (see `applyVisualState`'s
   * `pulseIntensity01`) rather than sit at a flat intensity. */
  pulses: boolean;
}

/**
 * The canonical preset table — one tuned entry per state, the single source of truth
 * `resolveVisualStatePresentation`/`applyVisualState` both read from. Colors deliberately echo
 * `stateVisualization.ts`'s own `SEVERITY_COLOR_SCALE` family (green/amber/red) where a state has an
 * obvious severity analog, so a world mixing continuous severity gauges and discrete state badges
 * reads as one coherent visual language, not two competing color systems.
 */
export const VISUAL_STATE_PRESETS: Readonly<Record<CanonicalVisualState, VisualStatePresentation>> = {
  NORMAL: { color: 0x3ddc84, emissiveIntensity: 0.22, pulses: false },
  ACTIVE: { color: 0x3fc7ff, emissiveIntensity: 0.5, pulses: false },
  INACTIVE: { color: 0x3a4258, emissiveIntensity: 0.08, pulses: false },
  UNDER_OBSERVATION: { color: 0x54d9ff, emissiveIntensity: 0.42, pulses: false },
  WARNING: { color: 0xf5c542, emissiveIntensity: 0.55, pulses: false },
  OFFLINE: { color: 0x5a6b7a, emissiveIntensity: 0.04, pulses: false },
  DAMAGED: { color: 0xff8a3d, emissiveIntensity: 0.6, pulses: false },
  CONTAMINATED: { color: 0x9a5fd6, emissiveIntensity: 0.55, pulses: true },
  INFECTED: { color: 0xf05555, emissiveIntensity: 0.6, pulses: true },
  OVERFLOW: { color: 0xff6a4d, emissiveIntensity: 0.68, pulses: true },
  CRITICAL: { color: 0xff4d4f, emissiveIntensity: 0.75, pulses: true },
  FAILURE: { color: 0xff2d2d, emissiveIntensity: 0.85, pulses: true },
};

/** Looks up a state's tuned presentation without applying it to anything — for a caller that wants
 * the raw color/intensity numbers (a legend swatch, a UI badge) rather than a material mutation. */
export function resolveVisualStatePresentation(state: CanonicalVisualState): VisualStatePresentation {
  return VISUAL_STATE_PRESETS[state];
}

export interface ApplyVisualStateOptions {
  /** Also overwrite the material's base `color`, not just `emissive` — same default-false
   * convention as `stateVisualization.ts`'s `applyValueToEmissive` (most state-glow use cases want
   * the surface's own color fixed and only the glow to shift). */
  updateBaseColor?: boolean;
  /**
   * 0..1 pulse phase — feed this from `stateVisualization.ts`'s `AttentionPulse.update(dt)` (for an
   * event-triggered flash) or `graphics/animation.ts`'s `createOscillator` (for a sustained
   * heartbeat). Only states with `pulses: true` respond to it; supplying it for a non-pulsing state
   * is a harmless no-op, so a caller can always pass its pulse driver's current value without
   * checking the state first.
   */
  pulseIntensity01?: number;
}

/**
 * Drives a material's emissive (and optionally base) color and intensity from an ALREADY-RESOLVED
 * discrete state — the generalized version of "this indicator light shows red because the pump
 * failed," for any WorldFrame entity wired up this way. Never computes the state itself.
 */
export function applyVisualState(
  material: { emissive: THREE_NS.Color; color?: THREE_NS.Color; emissiveIntensity?: number },
  THREE: typeof THREE_NS,
  state: CanonicalVisualState,
  options: ApplyVisualStateOptions = {},
): void {
  const preset = VISUAL_STATE_PRESETS[state];
  const color = new THREE.Color(preset.color);
  material.emissive.copy(color);
  if (options.updateBaseColor) material.color?.copy(color);
  const pulseBoost = preset.pulses ? Math.max(0, Math.min(1, options.pulseIntensity01 ?? 0)) * 0.35 : 0;
  material.emissiveIntensity = preset.emissiveIntensity + pulseBoost;
}
