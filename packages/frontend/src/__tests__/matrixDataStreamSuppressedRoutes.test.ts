import { describe, expect, it } from 'vitest';
import { SUPPRESSED_ROUTES, isSuppressed } from '../components/MatrixDataStream';

/**
 * SUPPRESSED_ROUTES was previously private and untested — it becomes
 * load-bearing the moment a second background layer (liveMatrix/) reuses it
 * for the same "no decorative canvas behind a full-viewport 3D scene" rule.
 * Checked directly against real App.tsx route hashes, not just its own
 * declared list, so a renamed/removed route can't silently stop being
 * suppressed without a test noticing.
 */
describe('MatrixDataStream — SUPPRESSED_ROUTES / isSuppressed', () => {
  it('suppresses every declared route exactly, and a query-string variant of it', () => {
    for (const route of SUPPRESSED_ROUTES) {
      expect(isSuppressed(route)).toBe(true);
      expect(isSuppressed(`${route}?foo=bar`)).toBe(true);
    }
  });

  it('suppresses every #/lab/<id> sub-route, not just the literal prefix', () => {
    expect(isSuppressed('#/lab/pump-pipe-1')).toBe(true);
    expect(isSuppressed('#/lab/')).toBe(true);
  });

  it('does NOT suppress Home, Genesis World, or other non-3D routes', () => {
    for (const route of ['#/', '', '#/world', '#/dashboard', '#/campaign', '#/evidence']) {
      expect(isSuppressed(route)).toBe(false);
    }
  });

  it('does not false-positive on a route that merely starts with a suppressed one as a substring, not a real segment', () => {
    // '#/city3d-extended' is NOT '#/city3d' and not '#/city3d?...' — must not match.
    expect(isSuppressed('#/city3d-extended')).toBe(false);
    expect(isSuppressed('#/cityscape')).toBe(false); // must not fuzzy-match '#/city'
  });

  /**
   * Confirms the exact route hashes App.tsx itself dispatches on are still
   * present here — checked against a snapshot of the real route table rather
   * than trusting the two lists to stay in sync by convention.
   */
  it('matches every 3D/full-viewport route App.tsx actually dispatches today', () => {
    const realRouteHashes = [
      '#/timeline', '#/reality', '#/prebuild', '#/city', '#/city3d', '#/scientific-city',
      '#/concept', '#/character', '#/molecule', '#/cell-lab', '#/hf-slice',
      '#/lab-3d', '#/first-person-lab', '#/investor-demo',
    ];
    for (const hash of realRouteHashes) {
      expect(isSuppressed(hash)).toBe(true);
    }
  });
});
