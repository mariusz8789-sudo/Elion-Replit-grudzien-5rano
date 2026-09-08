import type { ObjectiveReducer, ObjectiveReduction } from '../../experimentFabric/objectiveReducer';
import { collectScalars } from '../bridge/worldFrameState';
import type { TemporalEngine } from '../temporal/temporalEngine';

/**
 * OBJECTIVE REDUCER — the WorldGraph EXECUTION of a declared measurement.
 *
 * The scanning half of `experimentFabric/objectiveReducer.ts` (read that file
 * first: it carries the contract and the reason this split exists). This one
 * only knows how to walk one `TemporalEngine`'s own history and collapse it to
 * a single number.
 *
 * ONE ARM AT A TIME, NEVER TWO. This module never compares branches.
 * `compareBranches` stays exactly what it is — a two-branch, one-tick entity
 * differ — because "what else changed in the world" is genuinely a snapshot
 * question, and it is used elsewhere (`verifyControlledDifference`) at ticks
 * that are not the horizon. Making it trajectory-aware would break those uses
 * to solve a problem that does not live there.
 */

/** One scrub, one scalar — the same primitive both single-tick readers already use. */
function sampleAt(engine: TemporalEngine, entityId: string, metric: string, tick: number): number | null {
  const entity = engine.scrubTo(tick).tryGetEntity(entityId);
  if (!entity) return null;
  const value = collectScalars(entity)[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reduces one arm's own trajectory to the single number a criterion is judged on.
 *
 * `fromTick`..`toTick` inclusive. Callers pass the decision tick and the
 * horizon, so the scan covers exactly the interval the intervention could have
 * acted over — never the world's whole history, which would fold in ticks from
 * before the arms diverged.
 */
export function reduceObjectiveTrajectory(
  engine: TemporalEngine,
  entityId: string,
  metric: string,
  reducer: ObjectiveReducer,
  fromTick: number,
  toTick: number,
): ObjectiveReduction {
  const kind = reducer.kind;

  // AT_HORIZON short-circuits to a single read on purpose: the historical path
  // must stay exactly as cheap and exactly as exact as it was.
  if (kind === 'AT_HORIZON') {
    const value = sampleAt(engine, entityId, metric, toTick);
    return {
      reducerKind: kind,
      value,
      samplesRead: value === null ? 0 : 1,
      ticksScanned: 1,
      reason: value === null ? `No finite value for "${metric}" on ${entityId} at tick ${toTick}.` : null,
    };
  }

  if (toTick < fromTick) {
    return {
      reducerKind: kind,
      value: null,
      samplesRead: 0,
      ticksScanned: 0,
      reason: `Empty tick range (${fromTick}..${toTick}): there is nothing to reduce.`,
    };
  }

  let samplesRead = 0;
  let ticksScanned = 0;
  let best: number | null = null;
  let bestTick: number | null = null;
  let sum = 0;
  let crossingTick: number | null = null;
  let previous: number | null = null;

  for (let tick = fromTick; tick <= toTick; tick++) {
    ticksScanned += 1;
    const value = sampleAt(engine, entityId, metric, tick);
    if (value === null) continue;
    samplesRead += 1;

    if (best === null || value > best) {
      best = value;
      bestTick = tick;
    }
    sum += value;

    if (kind === 'FIRST_CROSSING' && crossingTick === null) {
      const crossed = reducer.direction === 'above' ? value >= reducer.threshold : value <= reducer.threshold;
      // A series that STARTS on the far side of the threshold never crossed it
      // inside this window: it was already there before the scan began, and
      // reporting `fromTick` would credit the intervention with a transition
      // that did not happen here.
      if (crossed && previous !== null) crossingTick = tick;
    }
    previous = value;
  }

  if (samplesRead === 0) {
    return {
      reducerKind: kind,
      value: null,
      samplesRead: 0,
      ticksScanned,
      reason: `No finite value for "${metric}" on ${entityId} at any of the ${ticksScanned} tick(s) scanned (${fromTick}..${toTick}).`,
    };
  }

  switch (kind) {
    case 'MAX':
      return { reducerKind: kind, value: best, samplesRead, ticksScanned, reason: null };
    case 'ARGMAX':
      return { reducerKind: kind, value: bestTick, samplesRead, ticksScanned, reason: null };
    case 'SUM':
      return { reducerKind: kind, value: sum, samplesRead, ticksScanned, reason: null };
    case 'FIRST_CROSSING':
      return {
        reducerKind: kind,
        value: crossingTick,
        samplesRead,
        ticksScanned,
        reason:
          crossingTick === null
            ? `"${metric}" never crossed ${reducer.threshold} from ${reducer.direction === 'above' ? 'below' : 'above'} within ticks ${fromTick}..${toTick}.`
            : null,
      };
  }
}
