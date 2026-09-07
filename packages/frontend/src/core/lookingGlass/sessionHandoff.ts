import type { ScenarioKind, ViewpointKind } from './scenarioRequest';
import type { ExperienceTimeline } from './experienceOrchestrator';
import type { ScenarioWorld } from './scenarioWorld';
import type { ScenarioComparisonView } from './scenarioComparison';

/**
 * LOOKING GLASS — HANDING THE *EXPERIENCE* TO A WORLD SCREEN.
 *
 * Deliberately separate from `experimentFabric/worldHandoff`, and the split
 * is a real one rather than tidiness: that module carries the SCIENTIFIC RUN
 * — the day series, the fingerprint, the provenance a world must not
 * misrepresent. This one carries how the user asked to EXPERIENCE it: where
 * they wanted to stand, whether time should run by itself, and the sentence
 * that started it. A world can honour one without the other, and neither
 * should be able to corrupt the other by sharing a channel.
 *
 * Nothing here is scientific state. A screen that ignores this handoff still
 * shows a correct world; it just shows it from its own default vantage.
 */
export interface LookingGlassExperienceHandoff {
  /** The sentence the user actually typed, shown so the world can be traced back. */
  readonly requestText: string;
  readonly requestId: string;
  readonly kind: ScenarioKind;
  readonly viewpoint: ViewpointKind;
  /** Where the user asked to stand ("street", "bench"), or null. */
  readonly anchorLabel: string | null;
  /** An anchored viewpoint implies time should pass on its own — that is the
   * whole premise of standing still while the world changes. */
  readonly autoPlay: boolean;
  /** Real seconds per world step during playback. */
  readonly secondsPerStep: number;
  /**
   * The pre-registered problem this session actually ran, when the world is
   * a laboratory. Without it the lab starts its own default problem and
   * shows a different experiment than the sentence asked for — the request
   * said bioreactor culture, the bench answered about intervention timing.
   */
  readonly problemId: string | null;
  /**
   * The cinematic sequence and the world it directs. Passed as live objects
   * rather than serialised, the same ephemeral pointer handoff the existing
   * world bridge uses for a simulation instance: they are read once by the
   * screen that opens next and never persisted.
   */
  readonly experience: ExperienceTimeline | null;
  readonly world: ScenarioWorld | null;
  /**
   * A REAL comparison, only when one was actually computed for this
   * session (see `scenarioComparison.ts`). Carried here so a world screen
   * can show it without re-deriving it — never recomputed by a screen.
   */
  readonly comparison: ScenarioComparisonView | null;
}

let pending: LookingGlassExperienceHandoff | null = null;

export function setPendingLookingGlassExperience(handoff: LookingGlassExperienceHandoff): void {
  pending = handoff;
}

/** Pure read — safe in a React state initializer, which StrictMode invokes twice. */
export function peekPendingLookingGlassExperience(): LookingGlassExperienceHandoff | null {
  return pending;
}

/** One-shot: returning to the screen later must not re-apply the vantage. */
export function consumePendingLookingGlassExperience(): LookingGlassExperienceHandoff | null {
  const current = pending;
  pending = null;
  return current;
}

export function clearLookingGlassExperience(): void {
  pending = null;
}
