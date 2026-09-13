import { describe, expect, it } from 'vitest';
import { runDiscoveryCampaign, type CampaignLaboratory } from '../core/agent/discoveryCampaign';
import { makeKeplerCampaignLab, makeQe4CampaignLab } from '../core/biotechData/campaignLabs';
import { pointsForGrid } from '../core/biotechData/qe4DatasetLaboratory';
import { compareObservationGapReplay, fulfilObservationGap, TAU_DISCRIMINABILITY } from '../core/agent/observationGap';

/**
 * M1 END-TO-END, ON REAL PINNED DATA.
 *
 * Every scenario below runs against the Brydges et al. 2019 trapped-ion
 * dataset or the NASA NSSDC fact sheet — no synthetic y values anywhere. The
 * degenerate condition is produced the way this repository has produced such
 * conditions before (`discoveryCampaign.test.ts` §15 denies the grammar a
 * basis): by restricting the MODEL GRAMMAR, never by inventing measurements.
 * With only `c·log(x)` and `c·x` alive, the two surviving laws genuinely
 * predict the next real time point to within a fraction of that measurement's
 * own bootstrap sigma — so no remaining experiment can separate them, which is
 * a fact about the data, not a fixture.
 */

/** Real QE4 disorder points, k=5, restricted to a time window — real y and real per-point sigma throughout. */
function qe4Window(ts: readonly number[]): CampaignLaboratory {
  const points = pointsForGrid('disorder', 5).filter((p) => ts.includes(p.t));
  const byX = new Map(points.map((p) => [p.t, { x: p.t, y: p.s2, sigma: p.sigma }]));
  const xs = points.map((p) => p.t);
  return {
    labId: 'qe4-brydges-disorder-k5-window',
    problem: 'How does S2 grow with time, judged only over this window of the pinned disorder dataset?',
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: Math.min(...xs), max: Math.max(...xs) },
    xLabel: 'T[ms]',
    yLabel: 'S2',
    declareObservable: () => ({
      quantity: 'second Rényi entropy S2 at a time outside this pinned window',
      unit: 'dimensionless (S2)',
      instrumentClass: 'trapped-ion quantum simulator with randomized-measurement readout',
    }),
    gapRecipient: 'LABORATORY',
  };
}

const WINDOW = [4, 6, 10, 16, 20] as const;

describe('M1 — LOW_DISCRIMINABILITY on real pinned quantum data', () => {
  /** log-growth vs linear growth, one term each: two real competing physical laws, nothing else alive. */
  const twoLaws = { maxRounds: 5, maxTerms: 1, excludeBases: ['CONSTANT', 'POWER', 'EXP_SATURATION', 'RECIPROCAL'] as const };

  it('refuses to run the remaining experiment when it separates the live laws by less than one sigma', () => {
    const result = runDiscoveryCampaign(qe4Window(WINDOW), twoLaws);
    const gapRound = result.rounds.find((r) => r.observationGap !== null);
    expect(gapRound).toBeDefined();
    expect(gapRound!.observationGap!.trigger).toBe('LOW_DISCRIMINABILITY');
    // The engine measured a real, non-zero disagreement — and still declined it as too small to settle anything.
    expect(gapRound!.discriminationScore).toBeGreaterThan(0);
    expect(gapRound!.discriminationScore).toBeLessThan(TAU_DISCRIMINABILITY);
    expect(gapRound!.selectedNextX).toBeNull();
  });

  it('emits exactly one request and stops on it, rather than spending the experiment', () => {
    const result = runDiscoveryCampaign(qe4Window(WINDOW), twoLaws);
    expect(result.observationGaps).toHaveLength(1);
    expect(result.stopReason).toBe('OBSERVATION_GAP');
    // Real experiments remained attached and unobserved: stopping was a judgement, not exhaustion.
    const admittedCount = result.rounds[result.rounds.length - 1]!.admittedX.length;
    expect(admittedCount).toBeLessThan(WINDOW.length);
  });

  it('names what would settle it: a real observable, a real instrument class, and why the attached set cannot', () => {
    const [gap] = runDiscoveryCampaign(qe4Window(WINDOW), twoLaws).observationGaps;
    expect(gap!.requiredObservable.instrumentClass).toContain('trapped-ion');
    expect(gap!.requiredObservable.unit).not.toBe('UNDECLARED');
    expect(gap!.rationale).toContain('sigma');
    expect(gap!.liveHypothesisIds.length).toBeGreaterThanOrEqual(2);
    expect(gap!.requestedFrom).toBe('LABORATORY');
    expect(gap!.status).toBe('OPEN');
  });

  it('reports the missing measurement as the next experiment, not null and not a useless one', () => {
    const { discovery } = runDiscoveryCampaign(qe4Window(WINDOW), twoLaws);
    expect(discovery.nextExperiment).toContain('REQUESTED OBSERVATION');
    expect(discovery.nextExperiment).toContain('trapped-ion');
  });

  it('is replay-deterministic: two runs agree on the campaign, the ledger and every gap fingerprint', () => {
    const a = runDiscoveryCampaign(qe4Window(WINDOW), twoLaws);
    const b = runDiscoveryCampaign(qe4Window(WINDOW), twoLaws);
    expect(a.campaignFingerprint).toBe(b.campaignFingerprint);
    expect(a.gapLedgerFingerprint).toBe(b.gapLedgerFingerprint);
    expect(compareObservationGapReplay(a.observationGaps[0]!, b.observationGaps[0]!)).toBe('MATCH');
  });
});

describe('M1 — ZERO_SPREAD on real pinned quantum data', () => {
  /** A single live law: there is no second prediction to disagree with, so no attached experiment discriminates at all. */
  const oneLaw = { maxRounds: 5, maxTerms: 1, excludeBases: ['CONSTANT', 'LINEAR', 'POWER', 'EXP_SATURATION', 'RECIPROCAL'] as const };

  it('separates "the models agree exactly" from "they disagree too little"', () => {
    const result = runDiscoveryCampaign(qe4Window(WINDOW), oneLaw);
    expect(result.observationGaps).toHaveLength(1);
    expect(result.observationGaps[0]!.trigger).toBe('ZERO_SPREAD');
    expect(result.observationGaps[0]!.discriminability).toBe(0);
    expect(result.stopReason).toBe('OBSERVATION_GAP');
    expect(result.rounds.every((r) => r.selectedNextX === null)).toBe(true);
  });
});

describe('M1 — NO_ATTACHED_EXPERIMENT on the real full QE4 campaign', () => {
  it('raises a gap when the pinned dataset runs out before the question is settled', () => {
    const result = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    expect(result.stopReason).toBe('EXPERIMENT_SPACE_EXHAUSTED');
    expect(result.observationGaps).toHaveLength(1);
    expect(result.observationGaps[0]!.trigger).toBe('NO_ATTACHED_EXPERIMENT');
    expect(result.observationGaps[0]!.feasibility.available).toBe(false);
    // Honest about cost rather than inventing one.
    expect(result.observationGaps[0]!.feasibility.costEstimate).toBeNull();
    expect(result.observationGaps[0]!.feasibility.basis).toContain('Zenodo');
  }, 30000);
});

describe('M1 — non-degenerate campaigns are untouched', () => {
  it('Kepler converges with no gap raised: a settled question needs no new measurement', () => {
    const result = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    expect(result.stopReason).toBe('CONVERGENCE');
    expect(result.observationGaps).toHaveLength(0);
  });

  it('every pre-M1 replay fingerprint is byte-identical — M1 added a capability without moving existing science', () => {
    const qe4 = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    const kepler = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    expect(qe4.campaignFingerprint).toBe('1a0226d5');
    expect(kepler.campaignFingerprint).toBe('2d6ce643');
    expect(qe4.rounds.map((r) => r.selectedNextX)).toEqual([20, 16, 10, 6, null]);
  }, 30000);

  it('above the threshold the existing selector still chooses, and says it cleared the floor', () => {
    const kepler = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    expect(kepler.rounds[0]!.selectedNextX).not.toBeNull();
    expect(kepler.rounds[0]!.discriminationScore!).toBeGreaterThan(TAU_DISCRIMINABILITY);
    expect(kepler.rounds[0]!.selectionReason).toContain('disagree');
  });
});

describe('M1 — fulfilment: data comes back from outside, with custody, as an OBSERVATION', () => {
  it('a fulfilled gap carries custody and provenance and never becomes a FACT', () => {
    const [gap] = runDiscoveryCampaign(qe4Window(WINDOW), { maxRounds: 5, maxTerms: 1, excludeBases: ['CONSTANT', 'POWER', 'EXP_SATURATION', 'RECIPROCAL'] }).observationGaps;
    const fulfilled = fulfilObservationGap(gap!, {
      custody: {
        steps: [{ handledBy: 'external trapped-ion group', action: 'measured the requested time point', at: '2026-09-13T09:00:00Z' }],
        provenance: 'REAL_EXPERIMENTAL',
        dataset: null,
      },
      value: 1.95,
      sigma: 0.12,
      at: 24,
    });
    if ('ok' in fulfilled) throw new Error('expected fulfilment');
    expect(fulfilled.epistemicStatus).toBe('OBSERVATION');
    expect(fulfilled.request.status).toBe('FULFILLED');
    expect(fulfilled.request.custody?.provenance).toBe('REAL_EXPERIMENTAL');
    expect(compareObservationGapReplay(gap!, fulfilled.request)).toBe('MATCH');
  });

  it('the engine never fulfils a gap itself — running the same campaign twice leaves both requests OPEN', () => {
    for (const result of [runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 })]) {
      for (const gap of result.observationGaps) expect(gap.status).toBe('OPEN');
    }
  }, 30000);
});
