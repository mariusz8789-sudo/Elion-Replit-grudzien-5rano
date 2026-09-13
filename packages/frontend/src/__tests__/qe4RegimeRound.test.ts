import { describe, expect, it } from 'vitest';
import { buildQe4RegimeRound, compareQe4RegimeRoundReplay } from '../core/biotechData/qe4RegimeRound';

/**
 * P0-6 (Discovery Engine): every round of the (eventual) autonomous loop must
 * write a fingerprinted, replay-checkable record. Scoped to what P0 actually
 * has today -- hypothesis generation from the grid (P0.1+P0.2) -- not to a
 * planner/stopping-rule/adversarial-pass round that does not exist yet.
 */
describe('qe4RegimeRound — per-round provenance/replay fingerprint', () => {
  it('two independent builds of the same round are byte-identical (MATCH)', () => {
    const a = buildQe4RegimeRound('clean', 5);
    const b = buildQe4RegimeRound('clean', 5);
    expect(a.roundFingerprint).toBe(b.roundFingerprint);
    expect(compareQe4RegimeRoundReplay(a, b)).toBe('MATCH');
  });

  it('a different k produces a different round fingerprint (DRIFT)', () => {
    const a = buildQe4RegimeRound('clean', 5);
    const b = buildQe4RegimeRound('clean', 4);
    expect(a.roundFingerprint).not.toBe(b.roundFingerprint);
    expect(compareQe4RegimeRoundReplay(a, b)).toBe('DRIFT');
  });

  it('a different dataset at the same k produces a different round fingerprint', () => {
    const a = buildQe4RegimeRound('clean', 5);
    const b = buildQe4RegimeRound('disorder', 5);
    expect(a.roundFingerprint).not.toBe(b.roundFingerprint);
  });

  it('passes through generateQe4RegimeHypotheses output unchanged -- no re-derivation', () => {
    const round = buildQe4RegimeRound('clean', 5);
    expect(round.hypotheses).toHaveLength(3);
    for (const h of round.hypotheses) {
      expect(h.dataset).toBe('clean');
      expect(h.k).toBe(5);
    }
  });

  it('stamps a contractVersion', () => {
    const round = buildQe4RegimeRound('clean', 5);
    expect(round.contractVersion).toBe('1.0.0');
  });
});
