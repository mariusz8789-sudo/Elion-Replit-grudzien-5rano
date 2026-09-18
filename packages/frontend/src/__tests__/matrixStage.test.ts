import { describe, expect, it } from 'vitest';
import { isMatrixRoute } from '../components/holo/MatrixStage';

/**
 * The Matrix stage is the one place the backdrop swaps its world for another.
 * Its route predicate must be exact (a query string is still the route; a
 * prefix collision like #/matrix-stage-hub is not; #/matrix itself is the
 * Mythos HUD route, which suppresses the backdrop entirely).
 */
describe('MatrixStage — route predicate', () => {
  it('matches #/matrix-stage exactly, with or without a query, and nothing else', () => {
    expect(isMatrixRoute('#/matrix-stage')).toBe(true);
    expect(isMatrixRoute('#/matrix-stage?focus=1')).toBe(true);
    expect(isMatrixRoute('#/matrix')).toBe(false);
    expect(isMatrixRoute('#/')).toBe(false);
    expect(isMatrixRoute('')).toBe(false);
    expect(isMatrixRoute('#/matrix-stage-hub')).toBe(false);
    expect(isMatrixRoute('#/worlds')).toBe(false);
  });
});
