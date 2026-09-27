/**
 * chartMath (V5 charts) — pure-geometry unit tests. Verify determinism, safe
 * handling of empty/degenerate input, and correct proportional mapping.
 */
import { describe, expect, it } from 'vitest';
import { sparklinePath, sparklineArea, donutSegments, polar, radarPoints, niceTicks } from '../components/charts/chartMath';

describe('sparklinePath', () => {
  it('returns empty string for no values', () => {
    expect(sparklinePath([], 100, 30)).toBe('');
  });
  it('draws a flat mid-line for a single value', () => {
    expect(sparklinePath([5], 100, 30)).toContain('M2 15');
  });
  it('starts with M and maps first/last to the horizontal extents', () => {
    const p = sparklinePath([0, 10], 100, 30, 2);
    expect(p.startsWith('M2')).toBe(true);
    expect(p).toContain('L98.00');
  });
  it('puts the max at the top (small y) and min at the bottom', () => {
    // values ascending → last point highest value → smallest y
    const p = sparklinePath([0, 100], 100, 30, 0).split('L')[1];
    const y = Number(p.trim().split(' ')[1]);
    expect(y).toBeCloseTo(0, 1);
  });
});

describe('sparklineArea', () => {
  it('is empty when no values', () => expect(sparklineArea([], 10, 10)).toBe(''));
  it('closes the path with Z', () => expect(sparklineArea([1, 2, 3], 100, 30).endsWith('Z')).toBe(true));
});

describe('donutSegments', () => {
  it('all-zero input yields zero-length arcs (no NaN)', () => {
    const segs = donutSegments([0, 0], 50);
    expect(segs.every((s) => s.dash.startsWith('0 '))).toBe(true);
  });
  it('splits proportionally: two equal values → two half arcs', () => {
    const r = 50; const circ = 2 * Math.PI * r;
    const segs = donutSegments([1, 1], r);
    const firstLen = Number(segs[0].dash.split(' ')[0]);
    expect(firstLen).toBeCloseTo(circ / 2, 1);
    expect(segs[1].offset).toBeCloseTo(-circ / 2, 1);
  });
});

describe('polar / radarPoints', () => {
  it('axis 0 points straight up from centre', () => {
    const p = polar(100, 50, 0, 4);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5); // c - r
  });
  it('radarPoints scales radius by normalised value', () => {
    const pts = radarPoints([1, 0, 0.5], 100, 40);
    expect(pts[0].y).toBeCloseTo(60, 5); // full radius up
    expect(pts[1].x).toBeCloseTo(100, 5); // zero radius → centre
  });
});

describe('niceTicks', () => {
  it('returns a single tick for a degenerate range', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });
  it('produces evenly spaced, rounded ticks', () => {
    const t = niceTicks(0, 1000, 3);
    expect(t[0]).toBe(0);
    expect(t.length).toBeGreaterThanOrEqual(3);
    const step = t[1] - t[0];
    expect(t[2] - t[1]).toBeCloseTo(step, 6);
  });
});
