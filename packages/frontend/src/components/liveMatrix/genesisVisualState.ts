import type { ActivityLevel, QualityLevel } from './matrixEngine';
import type { MatrixConfigInput } from './matrixController';

/**
 * GENESIS → VISUAL STATE ADAPTER — the contract, deliberately NOT the wiring.
 *
 * The dependency direction this file exists to enforce:
 *
 *     Genesis  →  VisualStateAdapter  →  LiveMatrixBackground  →  Canvas
 *
 * and never the reverse. Nothing under `liveMatrix/` imports Genesis; a
 * boundary test scans the whole directory and fails if that ever stops being
 * true. So this module does not read Science Memory, does not know what a
 * hypothesis is, and cannot be made to depend on one — it only declares the
 * small vocabulary a future caller will translate INTO.
 *
 * ## Why a separate vocabulary rather than passing Genesis state straight in
 *
 * `ActivityLevel` is a rendering instruction, not a scientific claim. If the
 * background took a `SavedExperiment` or a `HypothesisAssessment` directly, a
 * visual tier would quietly become a second epistemic vocabulary — and the
 * moment someone reads "ATTENTION" as "Genesis found something alarming", a
 * CSS decision has started making scientific statements. The seam is the
 * point: Genesis decides what is true, the adapter decides what that should
 * look like, and the two can be changed independently.
 *
 * ## What the adapter is allowed to mean
 *
 * `activity` is a coarse statement about how much WORK is in flight, nothing
 * more. It carries no verdict, no confidence, no epistemic status. The mapping
 * below is the honest, complete list of what each tier may signify.
 */

export type GenesisActivity =
  /** Nothing running, nothing outstanding. */
  | 'IDLE'
  /** Normal interactive use. */
  | 'ACTIVE'
  /** An investigation is open — a question exists that Genesis has not closed. */
  | 'RESEARCH'
  /** Real execution in flight right now (a loop, a solver, a backend run). */
  | 'RUNNING'
  /**
   * Something is waiting on a human. Deliberately NOT "a scientific problem" —
   * an unresolved conflict and a blocked capability both land here, and the
   * background must never be read as a verdict about either.
   */
  | 'ATTENTION';

export interface GenesisVisualState {
  readonly activity: GenesisActivity;
  /**
   * 0..1 emphasis, independent of tier. Callers may map it from anything
   * defensible (how many items are open, how long something has been
   * running); the renderer only ever reads it as glow strength.
   */
  readonly intensity?: number;
  /** Host-side performance decision, never a scientific one. */
  readonly quality?: QualityLevel;
  /** Stable per-context seed keeps the field visually identical across mounts. */
  readonly seed?: number;
  /** Accessibility override; when omitted the component honours the OS setting. */
  readonly reducedMotion?: boolean;
}

const ACTIVITY_TIER: Record<GenesisActivity, ActivityLevel> = {
  IDLE: 0, ACTIVE: 1, RESEARCH: 2, RUNNING: 3, ATTENTION: 4,
};

/**
 * The whole adapter: a pure, total function from the visual vocabulary to the
 * component's props. Total on purpose — an unrecognised activity falls back to
 * ACTIVE rather than throwing, because a background that crashes the app it is
 * decorating would be a far worse failure than a slightly wrong tier.
 */
export function toMatrixConfig(state: GenesisVisualState): MatrixConfigInput {
  return {
    activity: ACTIVITY_TIER[state.activity] ?? ACTIVITY_TIER.ACTIVE,
    intensity: state.intensity,
    quality: state.quality,
    seed: state.seed,
    reducedMotion: state.reducedMotion,
  };
}
