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

/**
 * CALIBRATION — the real-state → visual-tier table, deliberately expressed
 * over PLAIN SIGNALS rather than Genesis objects, so this file's own
 * boundary rule ("nothing under liveMatrix/ imports Genesis" —
 * `liveMatrixBoundary.test.tsx`) still holds. Whoever wires this in derives
 * these booleans/counts from the real store (`listExperiments().length`, a
 * campaign's `status === 'running'`, an open research-chain/conflict check)
 * — this module only ever decides what the RESULT of that should look like.
 *
 * Named here explicitly because the honest answer to "what should Home /
 * a real Research Campaign run / an empty Science Memory look like" is not
 * obvious from the five-value `GenesisActivity` union alone, and guessing it
 * per call-site is exactly how one screen ends up ATTENTION-red for a reason
 * nobody can explain.
 */
export interface GenesisActivitySignals {
  /**
   * A real backend run is executing RIGHT NOW — a Research Campaign
   * generation in progress (`Campaign.status === 'running'`), a discovery
   * loop mid-round, a compute job awaiting its result. This is the ONE
   * signal that should make the background visibly the busiest it gets:
   * real work, happening this second, is the truest "alive" a decorative
   * layer can honestly claim.
   */
  readonly runInProgress: boolean;
  /**
   * Something needs a HUMAN decision now — a blocked capability, an
   * unresolved conflict Genesis is holding both sides of. Deliberately not
   * "this looks scientifically interesting": see `GenesisActivity.ATTENTION`
   * own doc — this tier must never be read as a verdict.
   */
  readonly needsAttention: boolean;
  /**
   * An investigation is open — a declared question with no closing verdict
   * yet — but nothing is executing against it AT THIS INSTANT. Calmer than
   * RUNNING (real execution in flight) and more present than plain ACTIVE
   * (nothing in particular declared open).
   */
  readonly hasOpenInvestigation: boolean;
  /** `listExperiments().length` (or equivalent) — how many records Science Memory currently holds. */
  readonly savedExperimentCount: number;
}

/**
 * Derives a calibrated `GenesisVisualState` from real, checkable signals.
 * Priority order, highest first, mirrors this codebase's own established
 * "an explicit ranking, never a blended score" discipline
 * (`crossDomainSynthesis.ts::OPEN_ITEM_PRIORITY` is the same pattern one
 * layer up): a run in progress or something needing attention always wins
 * over a merely-open investigation, which always wins over an idle/active
 * split read off whether Science Memory holds anything at all.
 *
 * The Home-screen / empty-Memory case is deliberately the CALMEST tier
 * (`IDLE`, `intensity: 0`) rather than a default "medium hum": the same
 * honesty `MatrixDataStream.tsx`'s own `systemTokens()` already states in
 * prose ("a quiet system looks quiet" — `STATE::EMPTY`) applies here. A
 * background that always looks moderately busy regardless of whether
 * anything is actually happening is the exact failure this function exists
 * to rule out.
 */
export function deriveGenesisVisualState(signals: GenesisActivitySignals): GenesisVisualState {
  if (signals.needsAttention) return { activity: 'ATTENTION', intensity: 0.65 };
  if (signals.runInProgress) return { activity: 'RUNNING', intensity: 1 };
  if (signals.hasOpenInvestigation) return { activity: 'RESEARCH', intensity: 0.5 };
  if (signals.savedExperimentCount === 0) return { activity: 'IDLE', intensity: 0 };
  return { activity: 'ACTIVE', intensity: 0.25 };
}
