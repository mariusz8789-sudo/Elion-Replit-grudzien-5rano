import { describe, expect, it } from 'vitest';
import { buildTemporalSequence } from '../core/lookingGlass/urbanTransformation/temporalSequenceBuilder';

describe('buildTemporalSequence — minimum supported range 1900-2026, arbitrary years within it', () => {
  it('a single explicit year resolves to one-year list', () => {
    const r = buildTemporalSequence({ year: 1923 });
    expect(r).toEqual({ ok: true, years: [1923] });
  });

  it('an explicit year list is deduplicated and sorted', () => {
    const r = buildTemporalSequence({ years: [2000, 1900, 1950, 1900] });
    expect(r).toEqual({ ok: true, years: [1900, 1950, 2000] });
  });

  it('a start/end range with no interval expands to exactly the two endpoints', () => {
    const r = buildTemporalSequence({ startYear: 1900, endYear: 2026 });
    expect(r).toEqual({ ok: true, years: [1900, 2026] });
  });

  it('a start/end range with an interval expands every step and always includes the final year', () => {
    const r = buildTemporalSequence({ startYear: 1900, endYear: 2026, intervalYears: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.years[0]).toBe(1900);
      expect(r.years.at(-1)).toBe(2026);
      expect(r.years).toContain(1990);
      expect(r.years).toContain(2020);
    }
  });

  it.each([1900, 1901, 1910, 1923, 1935, 1945, 1950, 1968, 1975, 1989, 2000, 2010, 2011, 2015, 2020, 2026, 1907, 1918, 1931, 1942, 1963, 1978, 2007, 2019, 2025])(
    'accepts arbitrary in-range year %i',
    (year) => {
      const r = buildTemporalSequence({ year });
      expect(r).toEqual({ ok: true, years: [year] });
    },
  );

  it('rejects a year before 1900 as INVALID_TEMPORAL_RANGE', () => {
    const r = buildTemporalSequence({ year: 1850 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID_TEMPORAL_RANGE');
  });

  it('rejects a year after 2026 as INVALID_TEMPORAL_RANGE', () => {
    const r = buildTemporalSequence({ year: 2100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID_TEMPORAL_RANGE');
  });

  it('rejects an inverted range explicitly', () => {
    const r = buildTemporalSequence({ startYear: 2026, endYear: 1900 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID_TEMPORAL_RANGE');
  });

  it('reports NEEDS_INPUT when no temporal field was resolved at all', () => {
    const r = buildTemporalSequence({});
    expect(r).toEqual({ ok: false, reason: 'NEEDS_INPUT', detail: expect.any(String) });
  });
});
