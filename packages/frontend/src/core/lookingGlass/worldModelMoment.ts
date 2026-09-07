import type { GroundingLevel } from '../worldModel/ecs/types';
import type { TemporalEngine } from '../worldModel/temporal/temporalEngine';
import { collectScalars, describeWorldMoment, explainEntityChange } from '../worldModel/bridge/worldFrameState';

/**
 * LOOKING GLASS — BEFORE / AFTER / WHY, FOR A LIVE C3 WORLD.
 *
 * `describeWorldMoment` answers "what is true of this entity right now (or
 * at a past tick)". `explainEntityChange` answers "which real event most
 * recently touched it, and what did that event's own causal trace say".
 * Neither answers "what changed since the tick before" — that comparison
 * is Looking Glass's to make, and this module makes it by calling
 * `describeWorldMoment` TWICE (now, and one tick earlier) rather than
 * inventing a third C3 query. It computes no science: every number here is
 * read verbatim off two real, already-computed `WorldModelEntity` snapshots.
 *
 * `atTick` addresses this branch's OWN clock, exactly like `WorldClock`
 * elsewhere in Looking Glass — never a foreign run's tick.
 */
export interface WorldModelMoment {
  readonly tick: number;
  readonly branchId: string;
  readonly entityLabel: string;
  readonly grounding: GroundingLevel;
  readonly statusLabel: string | null;
  /** Flat scalar map at `tick` — the same numbers a rendered frame would show. */
  readonly scalarsNow: Readonly<Record<string, number>>;
  /** The same entity one tick earlier, or null at tick 0 — there is no "before" the run started. */
  readonly scalarsBefore: Readonly<Record<string, number>> | null;
  /** The real event type that most recently touched this entity, per the journal — never guessed from the numbers alone. */
  readonly latestEventType: string | null;
  /** The event's own recorded cause, when it has one. Absence is reported as null, not papered over. */
  readonly why: string | null;
  readonly canReplay: boolean;
}

/**
 * Builds the before/after/why view for one entity at `atTick`. Returns null
 * when the entity does not exist on this branch at that tick, or when
 * `atTick` is a tick this branch has not actually reached yet.
 *
 * The second guard exists because `TemporalEngine.scrubTo` does not itself
 * distinguish "the current head" from "a tick nobody has computed yet" — it
 * replays every recorded delta and silently returns wherever that leaves the
 * graph, the same way asking for tick 999 of a 12-tick run answers with tick
 * 12's state. That is the EXISTENCE-NOT-RANGE rule `WorldClock` already
 * enforces everywhere else in Looking Glass (see worldClock.ts) — a request
 * outside the branch's real history must be refused, not silently snapped
 * to the nearest thing available.
 */
export function describeMoment(engine: TemporalEngine, entityId: string, atTick: number): WorldModelMoment | null {
  if (atTick < 0 || atTick > engine.tick) return null;

  let now;
  try {
    now = describeWorldMoment(engine, entityId, atTick);
  } catch {
    return null;
  }

  const before = atTick > 0
    ? (() => {
      try {
        return describeWorldMoment(engine, entityId, atTick - 1);
      } catch {
        return null;
      }
    })()
    : null;

  const trace = explainEntityChange(engine, entityId, atTick);

  return {
    tick: now.tick,
    branchId: now.branchId,
    entityLabel: now.entity.label,
    grounding: now.grounding,
    statusLabel: now.entity.statusLabel ?? null,
    scalarsNow: collectScalars(now.entity),
    scalarsBefore: before ? collectScalars(before.entity) : null,
    latestEventType: now.latestEvent?.type ?? null,
    why: trace?.event.cause ?? null,
    canReplay: now.canReplay,
  };
}

/** Every scalar key that differs between `before` and `now`, with both values — never a fabricated delta for a key only one side has. */
export interface ScalarDelta {
  readonly key: string;
  readonly before: number;
  readonly after: number;
  readonly absoluteDelta: number;
}

export function scalarDeltasOf(moment: WorldModelMoment): readonly ScalarDelta[] {
  if (moment.scalarsBefore === null) return [];
  const deltas: ScalarDelta[] = [];
  for (const key of Object.keys(moment.scalarsNow)) {
    const before = moment.scalarsBefore[key];
    const after = moment.scalarsNow[key];
    if (before === undefined || before === after) continue;
    deltas.push({ key, before, after, absoluteDelta: after - before });
  }
  return deltas;
}
