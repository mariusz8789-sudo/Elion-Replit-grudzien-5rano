import { describe, expect, it } from 'vitest';
import {
  discriminationAt,
  falsificationValueAt,
  redundancyAt,
  runDiscoveryCampaign,
  type CampaignLaboratory,
} from '../core/agent/discoveryCampaign';
import { makeQe4CampaignLab } from '../core/biotechData/campaignLabs';

/**
 * The planner scores three terms and reports each separately. These tests pin
 * the BEHAVIOUR each term is supposed to produce, on real pinned data wherever
 * the behaviour is visible there.
 */

function evenlySpacedLab(): CampaignLaboratory {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const byX = new Map(xs.map((x) => [x, { x, y: 1 + 0.7 * x + 0.4 * Math.log(x), sigma: 0.05 }]));
  return {
    labId: 'planner-probe',
    problem: 'Probe laboratory for planner term behaviour.',
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: 1, max: 10 },
    xLabel: 'x',
    yLabel: 'y',
  };
}

describe('planner — the three terms are reported, not hidden inside one number', () => {
  it('reports discrimination, redundancy and falsification value for the chosen experiment', () => {
    const result = runDiscoveryCampaign(evenlySpacedLab(), { maxRounds: 4, maxTerms: 2 });
    const chosen = result.rounds.filter((r) => r.selectedNextX !== null);
    expect(chosen.length).toBeGreaterThan(0);
    for (const round of chosen) {
      expect(round.selectionTerms).not.toBeNull();
      expect(round.selectionTerms!.discrimination).toBeGreaterThanOrEqual(0);
      expect(round.selectionTerms!.redundancy).toBeGreaterThanOrEqual(0);
      expect(round.selectionTerms!.redundancy).toBeLessThanOrEqual(1);
      expect(round.selectionTerms!.falsificationValue).toBeGreaterThanOrEqual(0);
      expect(round.selectionTerms!.falsificationValue).toBeLessThanOrEqual(1);
    }
  });

  it('states all three in the human-readable reason, so the choice is auditable without the object', () => {
    const result = runDiscoveryCampaign(evenlySpacedLab(), { maxRounds: 3, maxTerms: 2 });
    const round = result.rounds.find((r) => r.selectedNextX !== null)!;
    expect(round.selectionReason).toContain('disagree');
    expect(round.selectionReason).toContain('repeats an existing observation');
    expect(round.selectionReason).toContain('at stake');
  });
});

describe('planner — redundancy, as a term and as a consequence', () => {
  const admitted = [1, 2, 4, 20].map((x) => ({ x, y: 0, sigma: 1 }));
  const SPAN = 19; // the real Brydges window, T from 1 to 20 ms

  it('scores a candidate sitting exactly on an admitted observation as fully redundant', () => {
    expect(redundancyAt(4, admitted, SPAN)).toBe(1);
  });

  it('falls toward zero as a candidate moves away from everything already measured', () => {
    expect(redundancyAt(10, admitted, SPAN)).toBeLessThan(redundancyAt(16, admitted, SPAN));
    expect(redundancyAt(10, admitted, SPAN)).toBeCloseTo(1 - 6 / SPAN, 9);
    expect(redundancyAt(16, admitted, SPAN)).toBeCloseTo(1 - 4 / SPAN, 9);
  });

  it('is zero when nothing has been observed yet, and never negative', () => {
    expect(redundancyAt(5, [], SPAN)).toBe(0);
    expect(redundancyAt(-500, admitted, SPAN)).toBe(0);
  });

  /**
   * The behavioural consequence on REAL data. Before the redundancy term the
   * campaign ran [20, 16, 10, 6]; T=16 was chosen second purely on prediction
   * spread, while sitting 4 ms from the T=20 point just measured. With
   * redundancy the planner takes T=10 instead — six ms from anything measured —
   * and the round-3 hold-out score improves (0.3729 → 0.2751), which is the
   * evidence that covering new ground was in fact the better experiment.
   */
  it('changes the real QE4 experiment sequence, and the out-of-sample score improves', () => {
    const result = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    expect(result.rounds.map((r) => r.selectedNextX)).toEqual([20, 10, 16, 6, null]);
    expect(result.rounds[1]!.selectedNextX).toBe(10);
    expect(result.rounds[2]!.bestHoldoutScore!).toBeLessThan(0.3);
    // The conclusion is unchanged by the reordering — this improved the route, not the answer.
    expect(result.discovery.winningModel!.formula).toBe('y = c0 + c1·log(x)');
  }, 30000);
});

describe('planner — falsification value as a term', () => {
  const flat = (v: number) => ({ predict: () => v });

  it('counts the FRACTION of live models a measurement could refute', () => {
    // Reference predicts 0; three models sit 5 sigma away, one sits on top of it.
    const fits = [flat(5), flat(5), flat(5), flat(0)];
    expect(falsificationValueAt(1, fits, () => 0, 1)).toBeCloseTo(0.75, 9);
  });

  it('is zero where every live model agrees with the reference — nothing is at stake there', () => {
    expect(falsificationValueAt(1, [flat(0), flat(0)], () => 0, 1)).toBe(0);
  });

  it('is distinct from discrimination: one wide outlier gives high width but low breadth', () => {
    const fits = [flat(0), flat(0), flat(0), flat(100)];
    const width = discriminationAt(1, fits, 1);
    const breadth = falsificationValueAt(1, fits, () => 0, 1);
    expect(width).toBe(100);
    expect(breadth).toBeCloseTo(0.25, 9);
  });
});

describe('planner — falsification value measures breadth, not width', () => {
  it('is a fraction of the live models, so it never exceeds one however far apart two models are', () => {
    const result = runDiscoveryCampaign(evenlySpacedLab(), { maxRounds: 4, maxTerms: 2 });
    for (const round of result.rounds) {
      if (round.selectionTerms === null) continue;
      expect(round.selectionTerms.falsificationValue).toBeLessThanOrEqual(1);
      // Discrimination is unbounded above; the two terms are genuinely different measurements.
      expect(round.selectionTerms.discrimination).not.toBe(round.selectionTerms.falsificationValue);
    }
  });

  it('never contains an EIG term: the combined score is exactly discrimination·(1−redundancy) + 0.5·falsification', () => {
    const result = runDiscoveryCampaign(evenlySpacedLab(), { maxRounds: 3, maxTerms: 2 });
    for (const round of result.rounds) {
      if (round.selectionTerms === null) continue;
      const { discrimination, redundancy, falsificationValue, combined } = round.selectionTerms;
      expect(combined).toBeCloseTo(discrimination * (1 - redundancy) + 0.5 * falsificationValue, 9);
    }
  });
});

describe('planner — the gap test still judges discrimination alone', () => {
  it('does not raise an observation gap merely because the best candidate is redundant', () => {
    const result = runDiscoveryCampaign(evenlySpacedLab(), { maxRounds: 5, maxTerms: 2 });
    for (const round of result.rounds) {
      if (round.observationGap === null) continue;
      // Any gap raised must be justified by discrimination, never by the redundancy discount.
      expect(round.discriminationScore === null || round.discriminationScore < 1).toBe(true);
    }
  });
});
