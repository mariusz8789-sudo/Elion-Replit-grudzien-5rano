import type { TemporalSceneRequest } from './contracts';
import { SUPPORTED_YEAR_RANGE } from './contracts';

export type SequenceBuildOutcome =
  | { readonly ok: true; readonly years: readonly number[] }
  | { readonly ok: false; readonly reason: 'NEEDS_INPUT' | 'INVALID_TEMPORAL_RANGE'; readonly detail: string };

/**
 * Expands `TemporalSceneRequest.time` into the ordered, deduplicated list of
 * years to resolve. Every year is validated against `SUPPORTED_YEAR_RANGE`
 * before anything downstream touches it — an out-of-range year is refused
 * here, not discovered three stages later as a missing archetype.
 */
export function buildTemporalSequence(time: TemporalSceneRequest['time']): SequenceBuildOutcome {
  let years: number[];

  if (time.years && time.years.length > 0) {
    years = [...time.years];
  } else if (time.startYear !== undefined && time.endYear !== undefined) {
    const interval = time.intervalYears && time.intervalYears > 0 ? time.intervalYears : (time.endYear - time.startYear);
    if (time.startYear > time.endYear) {
      return { ok: false, reason: 'INVALID_TEMPORAL_RANGE', detail: `startYear ${time.startYear} is after endYear ${time.endYear}` };
    }
    years = [];
    for (let y = time.startYear; y < time.endYear; y += interval) years.push(y);
    years.push(time.endYear);
  } else if (time.year !== undefined) {
    years = [time.year];
  } else {
    return { ok: false, reason: 'NEEDS_INPUT', detail: 'no year, year range, or year list was resolved from the request' };
  }

  years = [...new Set(years)].sort((a, b) => a - b);

  const outOfRange = years.filter((y) => y < SUPPORTED_YEAR_RANGE.min || y > SUPPORTED_YEAR_RANGE.max);
  if (outOfRange.length > 0) {
    return {
      ok: false, reason: 'INVALID_TEMPORAL_RANGE',
      detail: `year(s) ${outOfRange.join(', ')} outside the supported range ${SUPPORTED_YEAR_RANGE.min}-${SUPPORTED_YEAR_RANGE.max}`,
    };
  }
  return { ok: true, years };
}
