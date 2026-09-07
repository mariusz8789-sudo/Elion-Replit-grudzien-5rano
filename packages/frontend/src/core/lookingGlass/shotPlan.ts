import { fnv1a } from '../events/hash';
import { cameraModeForEventType, type WorldCameraMode } from '../world/cameraPolicy';
import type { WorldCaptureTimeline } from '../world/worldCapture';
import type { ScenarioRunPlan } from './scenarioResolution';

/**
 * LOOKING GLASS — CINEMATIC SHOT PLAN.
 *
 * Turns a run that already happened into an ordered sequence of shots.
 *
 * THE RULE THAT SHAPES THIS WHOLE MODULE: a shot may only exist because
 * something real happened. Every shot carries `sourceMarkerId`, the id of
 * the actual observation or event in `WorldCaptureTimeline` that justifies
 * cutting there, and the two shots that have no marker (the establishing
 * shot and the closing wide) are marked as such rather than being dressed up
 * as discoveries. There is deliberately no way to add a shot for pacing.
 *
 * This keeps the boundary that `cameraSequencer.ts` already draws: the ROUTE
 * a camera takes is a directorial choice and is honest about being one; what
 * the camera POINTS AT is real state. A plan that invented a dramatic beat
 * at second 12 because the montage felt slow would be fabricating scientific
 * narrative, which is the one thing the Looking Glass must never do.
 *
 * It is also pure data. It renders nothing, owns no camera, and imports no
 * THREE — so it is fully testable, and the same plan can drive an
 * interactive playback or a future frame-by-frame capture without either of
 * them re-deriving the edit.
 */

export type ShotKind =
  /** Opening wide of the world before anything has happened. No marker. */
  | 'ESTABLISH'
  /** Cut motivated by a real canonical event. */
  | 'EVENT'
  /** Cut motivated by a real recorded observation. */
  | 'OBSERVATION'
  /** A held viewpoint while time advances — the anchored-human pass. */
  | 'TEMPORAL'
  /** Closing shot on the final state. No marker. */
  | 'RESULT';

/**
 * Which clock a shot's `fromTick`/`toTick` are measured on.
 *
 * These are genuinely two different axes and conflating them would misread
 * the science. A domain adapter indexes its `WorldState`s by EXPERIMENT RUN
 * — state 3 is the third hypothesis run, not the third day — while the
 * world's own progression is measured in days or hours. A cut to
 * "observation 3" that silently rendered at day 3 of a 60-day epidemic
 * would be showing the viewer a time that observation never happened at.
 */
export type ShotAxis =
  /** Ticks are the world's own time (days, hours). */
  | 'WORLD_TIME'
  /** Ticks index the adapter's state series (one per experiment run). */
  | 'STATE_INDEX';

export interface Shot {
  readonly index: number;
  readonly kind: ShotKind;
  readonly axis: ShotAxis;
  readonly cameraMode: WorldCameraMode;
  readonly fromTick: number;
  readonly toTick: number;
  /** Why this shot exists, in terms a viewer can check against the timeline. */
  readonly reason: string;
  /** The observation/event id that motivated the cut, or null for the two
   * structural shots that legitimately have none. */
  readonly sourceMarkerId: string | null;
}

export interface ShotPlan {
  readonly planId: string;
  readonly runId: string;
  readonly worldId: string;
  readonly shots: readonly Shot[];
  /** How many markers in the timeline the plan actually cut to, against how
   * many existed — so a caller can tell a thorough edit from a sparse one
   * without re-reading the timeline. */
  readonly markersUsed: number;
  readonly markersAvailable: number;
}

export interface ShotPlanOptions {
  /** Upper bound on event/observation shots, so a 300-event run does not
   * become a 300-cut montage. The most significant markers survive; see
   * `rankMarkers`. Default 6. */
  readonly maxEventShots?: number;
  /** Ticks a held shot covers when the marker is a single instant. Default 8. */
  readonly holdTicks?: number;
}

/**
 * Ranks which markers deserve a cut when there are more than the plan can
 * hold. The ordering is structural, not dramatic: events that the existing
 * camera policy already has an opinion about come first (those are the ones
 * Genesis considers presentation-worthy), then observations, then the rest —
 * and ties break by tick so the result is deterministic.
 */
function rankMarkers(timeline: WorldCaptureTimeline): readonly { tick: number; id: string; kind: ShotKind; mode: WorldCameraMode; label: string }[] {
  const ranked: { tick: number; id: string; kind: ShotKind; mode: WorldCameraMode; label: string; weight: number }[] = [];

  for (const event of timeline.events) {
    const mode = cameraModeForEventType(event.type);
    ranked.push({
      tick: event.tick,
      id: event.eventId,
      kind: 'EVENT',
      // An event the policy has no opinion about still gets a shot if there
      // is room, but it observes rather than dramatises it.
      mode: mode ?? 'OBSERVER' as WorldCameraMode,
      label: event.type,
      weight: mode ? 0 : 2,
    });
  }
  for (const observation of timeline.observations) {
    ranked.push({
      tick: observation.tick,
      id: observation.observationId,
      kind: 'OBSERVATION',
      mode: 'SCIENTIFIC',
      label: observation.statement,
      weight: 1,
    });
  }

  // Distinct content first. Several experiment runs legitimately produce the
  // identical observation statement, and six cuts to the same sentence reads
  // as padding even though every one of them is real. Repeats are kept, but
  // ranked below anything the viewer has not already been shown, so a short
  // plan spends its cuts on different things.
  const seenLabels = new Set<string>();
  return ranked
    .sort((a, b) => a.weight - b.weight || a.tick - b.tick || a.id.localeCompare(b.id))
    .map((entry) => {
      const repeated = seenLabels.has(entry.label);
      seenLabels.add(entry.label);
      return { ...entry, weight: entry.weight + (repeated ? 10 : 0) };
    })
    .sort((a, b) => a.weight - b.weight || a.tick - b.tick || a.id.localeCompare(b.id))
    .map(({ weight: _weight, ...rest }) => rest);
}

/**
 * Builds the plan. `plan` supplies the viewpoint the user asked for, which
 * decides whether the body of the sequence is a held human anchor or a
 * conventional cut-driven edit.
 */
export function buildShotPlan(
  timeline: WorldCaptureTimeline,
  plan: ScenarioRunPlan,
  options: ShotPlanOptions = {},
): ShotPlan {
  const maxEventShots = options.maxEventShots ?? 6;
  const holdTicks = options.holdTicks ?? 8;
  const ticks = Math.max(1, plan.ticks);
  const shots: Shot[] = [];

  shots.push({
    index: 0,
    kind: 'ESTABLISH',
    axis: 'WORLD_TIME',
    cameraMode: 'WIDE',
    fromTick: 0,
    toTick: Math.min(holdTicks, ticks),
    reason: `Establishing view of ${timeline.worldId} before the run advances`,
    sourceMarkerId: null,
  });

  const anchored = plan.viewpoint.kind === 'ANCHORED_HUMAN' || plan.viewpoint.kind === 'SCIENTIST_POV';
  if (anchored) {
    // The distinctive Looking Glass shot: one viewpoint, held, while the
    // whole span passes through it. It is a single shot by construction —
    // cutting away would destroy the effect it exists to produce.
    const where = plan.viewpoint.anchorHint ? ` from the ${plan.viewpoint.anchorHint}` : '';
    shots.push({
      index: shots.length,
      kind: 'TEMPORAL',
      axis: 'WORLD_TIME',
      cameraMode: plan.viewpoint.cameraMode,
      fromTick: 0,
      toTick: ticks,
      reason: `Held ${plan.viewpoint.kind} viewpoint${where} across the full ${ticks}-tick span`,
      sourceMarkerId: null,
    });
  }

  const ranked = rankMarkers(timeline);
  const chosen = ranked.slice(0, maxEventShots).sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
  for (const marker of chosen) {
    shots.push({
      index: shots.length,
      kind: marker.kind,
      // Markers come from the adapter's state series, so they are on the
      // state axis — see `ShotAxis`.
      axis: 'STATE_INDEX',
      // An anchored sequence keeps the viewer's eye line even on a cut —
      // the whole premise is that they do not move.
      cameraMode: anchored ? plan.viewpoint.cameraMode : marker.mode,
      fromTick: marker.tick,
      toTick: Math.min(marker.tick + holdTicks, ticks),
      reason: marker.kind === 'EVENT' ? `Event ${marker.label}` : `Observation: ${marker.label}`,
      sourceMarkerId: marker.id,
    });
  }

  shots.push({
    index: shots.length,
    kind: 'RESULT',
    axis: 'WORLD_TIME',
    cameraMode: plan.comparison ? 'SCIENTIFIC' : 'WIDE',
    fromTick: ticks,
    toTick: ticks,
    reason: plan.comparison ? 'Closing on the comparison of the two runs' : 'Closing on the final state of the run',
    sourceMarkerId: null,
  });

  const planId = `sp-${fnv1a(`${timeline.runId}|${plan.kind}|${ticks}|${plan.viewpoint.kind}|${shots.length}`)}`;
  return {
    planId,
    runId: timeline.runId,
    worldId: timeline.worldId,
    shots,
    markersUsed: chosen.length,
    markersAvailable: ranked.length,
  };
}

/** Total span the plan covers in WORLD TIME. State-axis shots are excluded
 * deliberately: their ticks are run indices and adding them would produce a
 * duration in no unit at all. */
export function shotPlanDuration(plan: ShotPlan): number {
  return plan.shots.reduce((max, shot) => (shot.axis === 'WORLD_TIME' ? Math.max(max, shot.toTick) : max), 0);
}
