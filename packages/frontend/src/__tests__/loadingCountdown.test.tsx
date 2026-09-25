import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { countdownSeconds, estimateDuration, recordDuration } from '../core/product/durationEstimate';
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
    expect(counted).toContain('ok. 3 s');
    expect(counted).toContain('data-remaining-s="3"');
    const plain = renderToStaticMarkup(<LoadingStatus label="Ładowanie chemii" />);
    expect(plain).toContain('Ładowanie chemii…');
    expect(plain).not.toMatch(/\d+ s/);
    expect(plain).not.toContain('data-remaining-s');
  });
});
