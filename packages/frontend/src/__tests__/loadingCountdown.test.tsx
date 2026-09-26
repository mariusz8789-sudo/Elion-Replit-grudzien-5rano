import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { countdownSeconds, estimateDuration, recordDuration, ringProgress, RING_SEGMENTS } from '../core/product/durationEstimate';
import { LoadingStatus } from '../components/LoadingStatus';

describe('loading countdown only from a measured duration', () => {
  it('has no estimate until the operation was measured, then returns the last measurement', () => {
    expect(estimateDuration('test:never-run')).toBeNull();
    recordDuration('test:op', 4200);
    expect(estimateDuration('test:op')).toBe(4200);
    recordDuration('test:op', -1);
    recordDuration('test:op', Number.NaN);
    expect(estimateDuration('test:op')).toBe(4200);
  });

  it('counts whole seconds down and stops at zero', () => {
    expect(countdownSeconds(4200, 0)).toBe(5);
    expect(countdownSeconds(4200, 1300)).toBe(3);
    expect(countdownSeconds(4200, 9000)).toBe(0);
  });

  it('renders a countdown only when an estimate exists', () => {
    const counted = renderToStaticMarkup(<LoadingStatus label="Ładowanie laboratorium" estimateMs={3000} testId="s" />);
    expect(counted).toContain('szacowany czas: ok. 3 s');
    expect(counted).toContain('data-remaining-s="3"');
    // The countdown must never be readable as progress: it is labelled as an estimate of TIME.
    expect(counted).toContain('data-indicator="TIME_ESTIMATE"');
    expect(counted).toContain('szacunek czasu, nie postęp pracy');
    expect(counted).toMatch(/NIE jest postęp pracy silnika/);
    const plain = renderToStaticMarkup(<LoadingStatus label="Ładowanie chemii" />);
    expect(plain).toContain('Ładowanie chemii…');
    expect(plain).not.toMatch(/\d+ s/);
    expect(plain).not.toContain('data-remaining-s');
  });
});

describe('the waiting ring shows how much of a MEASURED wait is left', () => {
  it('fills one tick per fifth of the estimate, marking the tick being worked through', () => {
    expect(RING_SEGMENTS).toBe(5);
    expect(ringProgress(10_000, 0)).toEqual({ filled: 0, active: 0, segments: 5, fraction: 0, overrun: false });
    expect(ringProgress(10_000, 2_500)).toMatchObject({ filled: 1, active: 1, overrun: false });
    expect(ringProgress(10_000, 5_000)).toMatchObject({ filled: 2, active: 2 });
    expect(ringProgress(10_000, 9_900)).toMatchObject({ filled: 4, active: 4, overrun: false });
  });

  it('never pretends to know a fraction it has not measured, and says so when the wait runs long', () => {
    // No estimate: nothing filled, nothing active — the caller turns the ring instead.
    expect(ringProgress(null, 5_000)).toEqual({ filled: 0, active: null, segments: 5, fraction: 0, overrun: false });
    expect(ringProgress(0, 5_000).active).toBeNull();
    // Past the estimate: full and honest, never parked just below the end.
    expect(ringProgress(10_000, 10_001)).toEqual({ filled: 5, active: null, segments: 5, fraction: 1, overrun: true });
    expect(ringProgress(10_000, 60_000).overrun).toBe(true);
    // A negative clock jump cannot rewind past the start.
    expect(ringProgress(10_000, -5_000).filled).toBe(0);
  });

  it('renders the ticks: five marks, filled ones reported for a test to read', () => {
    const measured = renderToStaticMarkup(<LoadingStatus label="Silnik liczy" estimateMs={10_000} testId="ring" />);
    expect(measured.match(/gx-ring-tick/g)).toHaveLength(5);
    expect(measured).toContain('data-ring-segments="5"');
    expect(measured).toContain('data-ring-filled="0"');
    expect(measured).not.toContain('is-indeterminate');

    // Without a measurement the ring turns and reports no fill at all.
    const unmeasured = renderToStaticMarkup(<LoadingStatus label="Ładowanie" testId="ring" />);
    expect(unmeasured).toContain('is-indeterminate');
    expect(unmeasured).not.toContain('data-ring-filled');
    // Nothing to estimate → no estimate wording at all, rather than a vaguer claim.
    expect(unmeasured).toContain('data-indicator="INDETERMINATE"');
    expect(unmeasured).not.toContain('szacunek czasu');

    // Dense places can still take the text alone.
    expect(renderToStaticMarkup(<LoadingStatus label="Ładowanie" ring={false} />)).not.toContain('gx-ring');
  });
});
