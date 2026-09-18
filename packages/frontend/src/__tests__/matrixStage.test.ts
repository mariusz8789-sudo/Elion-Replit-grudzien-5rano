import { describe, expect, it } from 'vitest';
import { isMatrixRoute, MATRIX_WORDS } from '../components/holo/MatrixStage';

/**
 * The Matrix stage is the one place the backdrop swaps its world for another.
 * Its route predicate must be exact (a query string is still the route; a
 * prefix collision like #/matrix-hub is not), and the words on stage are the
 * five the owner set, in order.
 */
describe('MatrixStage — route predicate and stage words', () => {
  it('matches #/matrix exactly, with or without a query, and nothing else', () => {
    expect(isMatrixRoute('#/matrix')).toBe(true);
    expect(isMatrixRoute('#/matrix?focus=1')).toBe(true);
    expect(isMatrixRoute('#/')).toBe(false);
    expect(isMatrixRoute('')).toBe(false);
    expect(isMatrixRoute('#/matrix-hub')).toBe(false);
    expect(isMatrixRoute('#/worlds')).toBe(false);
  });
  it('stages the five words in the owner’s order', () => {
    expect([...MATRIX_WORDS]).toEqual(['GENESIS', 'EVIDENCE', 'TRUTH', 'ABSENCE', 'A BETTER TOMORROW']);
  });
});
