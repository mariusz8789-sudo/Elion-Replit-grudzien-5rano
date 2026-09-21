import { describe, expect, it } from 'vitest';
import { parameterStrategy } from '../core/agent/discoveryStrategies';
import {
  ENTANGLEMENT_MODEL_ID, QE1_HYPOTHESES, QE2_HYPOTHESES, QE3_HYPOTHESES,
  qe1VisibilityInquiry, qe2MonogamyInquiry, qe3BoundEntanglementInquiry,
} from '../core/agent/entanglementInquiry';
import { runAutonomousInquiry, type InquiryLoopResult } from '../core/agent/inquiryLoop';
import { runEntanglementState } from '../core/quantum/entanglementStateRunner';

/**
 * QE1-QE3 THROUGH THE REAL LOOP.
 *
 * Every number asserted below was produced by running the loop, and every one
 * of them is checkable against the closed form the state family is known for —
 * which is the reason these particular states are in the Fabric at all. The
 * tests assert the loop's DECISIONS (which probe, which verdict, which stop),
 * not just that it returned something.
 */

function firstRound(result: InquiryLoopResult) { return result.rounds[0]!; }
function outcome(result: InquiryLoopResult, round: number, id: string) {
  return result.rounds[round - 1]!.outcomes.find((o) => o.hypothesisId === id)!;
}

describe('QE1-QE3 are admitted by the real PARAMETER strategy', () => {
  it.each([
    ['QE1', qe1VisibilityInquiry()],
    ['QE2', qe2MonogamyInquiry()],
    ['QE3', qe3BoundEntanglementInquiry()],
  ])('%s is admitted as REAL, not approximated or refused', (_name, input) => {
    const admission = parameterStrategy.admit(input);
    expect(admission.status).toBe('REAL');
    expect(admission.missing).toEqual([]);
    expect(input.system.modelId).toBe(ENTANGLEMENT_MODEL_ID);
  });

  it('produces a StrategyRun with the same contract the other two strategies return', () => {
    const run = parameterStrategy.run(qe3BoundEntanglementInquiry());
    expect(run.shape).toBe('PARAMETER');
    expect(run.rounds.length).toBeGreaterThan(0);
    expect(run.resultFingerprint).toMatch(/\S/);
    // Exact algebra on a declared state is a SIMULATION, and the run says so
    // rather than letting a reader mistake it for a laboratory measurement.
    expect(run.dataProvenance.origin).toBe('SIMULATED');
  });
});

describe('QE1 — the opening measurement is worthless, and white noise cannot settle visibility', () => {
  const result = runAutonomousInquiry(qe1VisibilityInquiry());

  it('opens on total depolarisation, where every candidate predicts exactly 0', () => {
    const round = firstRound(result);
    expect(round.probeValue).toBe(1);
    expect(round.observed).toBe(0);
    expect(round.outcomes.map((o) => o.predicted)).toEqual([0, 0, 0, 0]);
    // Supported by a measurement that carries no evidence: confidence must not move.
    for (const o of round.outcomes) expect(o.confidenceAfter).toBe(o.confidenceBefore);
  });

  it('then reaches for a setting that narrows the field WITHOUT settling the top two, and says so', () => {
    expect(firstRound(result).nextSelection.rule).toBe('DISCRIMINATES_OTHER_PAIR');
    expect(result.rounds[1]!.probeValue).toBe(0.9);
    expect(outcome(result, 2, 'h:marginal').assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(outcome(result, 2, 'h:classical').assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('stops with two survivors and REFUSES to run an experiment that could not decide between them', () => {
    expect(result.stopReason).toBe('NO_DISCRIMINATING_PROBE');
    expect(result.survivingHypothesisIds).toEqual(['h:ideal', 'h:good']);
    expect(result.nextExperiment.probeValue).toBeNull();
    expect(result.openQuestions.join(' ')).toContain('did not separate them');
  });

  it('and the refusal is structural, not bad luck: white noise scales every prediction by the same factor', () => {
    // max CHSH = 2*sqrt(2)*(1-w)*p, so the RATIO between two visibilities is the
    // same at every setting — 1.00/0.92 = 1.087, inside the declared +/-15% band
    // at w = 0.9, at w = 0 and everywhere between. This is why no probe in the
    // list could have worked, and it is a fact about the experiment.
    for (const w of [0.9, 0.5, 0.1, 0]) {
      const ideal = runEntanglementState('werner', 1.0, { whiteNoise: w }).maxCHSH;
      const good = runEntanglementState('werner', 0.92, { whiteNoise: w }).maxCHSH;
      expect(ideal / good).toBeCloseTo(1 / 0.92, 12);
    }
  });

  it('carries the candidate that is entangled but CANNOT violate CHSH', () => {
    // p = 0.5 is above the entanglement threshold 1/3 and below the CHSH
    // threshold 1/sqrt(2): entangled is not the same thing as Bell-violating,
    // and that is measured here rather than recited.
    const weak = runEntanglementState('werner', 0.5, { whiteNoise: 0 });
    expect(weak.concurrence).toBeGreaterThan(0);
    expect(weak.maxCHSH).toBeCloseTo(Math.SQRT2, 12);
    expect(weak.maxCHSH).toBeLessThan(2);
    expect(QE1_HYPOTHESES.map((h) => h.claimedValues.familyParameter)).toContain(0.5);
  });
});

describe('QE2 — the loop walks into a real degeneracy and works its way out', () => {
  const result = runAutonomousInquiry(qe2MonogamyInquiry(70));

  it('opens on pure |W>, where the residual three-tangle is 0 for every candidate theta', () => {
    expect(firstRound(result).probeValue).toBe(90);
    expect(firstRound(result).observed).toBe(0);
    expect(firstRound(result).outcomes.every((o) => o.predicted === 0)).toBe(true);
  });

  it('goes to the pure generalised-GHZ limit next, and finds theta = 20 and theta = 70 indistinguishable there', () => {
    expect(result.rounds[1]!.probeValue).toBe(0);
    // sin^2(2*theta) is symmetric about 45 degrees, so these two agree to 1e-15.
    expect(outcome(result, 2, 'h:theta-20').predicted).toBeCloseTo(0.4131759111665345, 12);
    expect(outcome(result, 2, 'h:theta-70').predicted).toBeCloseTo(0.4131759111665345, 12);
    expect(outcome(result, 2, 'h:theta-20').assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(outcome(result, 2, 'h:theta-70').assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(outcome(result, 2, 'h:theta-45').assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('breaks the degeneracy with an off-axis mixing angle the GHZ limit could never break', () => {
    expect(result.rounds[2]!.probeValue).toBe(15);
    expect(result.rounds[1]!.nextSelection.rule).toBe('DISCRIMINATES_TOP_TWO');
    // The two survivors of the GHZ-limit round, ranked: theta-70 leads because
    // its prediction matched to the last bit while theta-20's was 1e-15 off, so
    // it collected marginally more evidence from the same measurement.
    expect([...result.rounds[1]!.nextSelection.betweenHypothesisIds].sort()).toEqual(['h:theta-20', 'h:theta-70']);
    expect(result.rounds[1]!.nextSelection.betweenHypothesisIds[0]).toBe('h:theta-70');
    expect(outcome(result, 3, 'h:theta-20').assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('recovers the hidden theta and then stops because nothing is left to separate', () => {
    expect(result.survivingHypothesisIds).toEqual(['h:theta-70']);
    expect(result.stopReason).toBe('NO_CONTENDERS_LEFT');
    expect(result.openQuestions).toEqual([]);
    expect(QE2_HYPOTHESES).toHaveLength(5);
  });

  it('refuses to report a three-tangle for a state that is not pure', () => {
    // tau_{A|BC} = 2(1 - Tr rho_A^2) is the A|BC tangle for PURE states only.
    // Under any depolarising noise the mixed-state three-tangle is a convex roof
    // this module does not compute, so it reports NaN rather than a number that
    // would look like a measurement.
    expect(runEntanglementState('ghz-w-family', 70, { mixingAngleDeg: 0, whiteNoise: 0.01 }).ckwResidual).toBeNaN();
  });
});

describe('QE3 — PPT sees nothing, and a second criterion decides the whole inquiry', () => {
  const result = runAutonomousInquiry(qe3BoundEntanglementInquiry(0.4));

  it('recovers the hidden Horodecki parameter from the one noiseless measurement', () => {
    expect(result.rounds[1]!.probeValue).toBe(0);
    expect(result.rounds[1]!.observed).toBeCloseTo(0.0027164860242032685, 12);
    expect(result.survivingHypothesisIds).toEqual(['h:a-0.4']);
    expect(result.falsifiedHypothesisIds).toEqual(['h:a-0.2', 'h:a-0.6', 'h:a-0.8']);
    expect(QE3_HYPOTHESES).toHaveLength(4);
  });

  it('does it on a state every candidate of which is PPT — so negativity could not have decided anything', () => {
    for (const a of [0.2, 0.4, 0.6, 0.8]) {
      const run = runEntanglementState('horodecki-bound', a, { whiteNoise: 0 });
      expect(run.negativity).toBe(0);
      expect(run.boundEntanglementMargin).toBeGreaterThan(0);
    }
  });

  it('MEASURES that bound entanglement does not survive even half a percent of white noise', () => {
    // The reason every setting in the probe list except w = 0 is uninformative.
    // It is a finding, not a limitation of the implementation: bound entangled
    // states lie right against the boundary of the separable set.
    for (const w of [0.005, 0.02, 0.1, 0.5]) {
      expect(runEntanglementState('horodecki-bound', 0.4, { whiteNoise: w }).boundEntanglementMargin).toBe(0);
    }
  });

  it('and a margin of 0 is never reported as separability', () => {
    // CCNR is one-directional. The run that reads 0 has NOT shown the state to
    // be separable, and the executor's own warnings have to say so.
    const noisy = runEntanglementState('horodecki-bound', 0.4, { whiteNoise: 0.1 });
    expect(noisy.boundEntanglementMargin).toBe(0);
    expect(noisy.ccnrTraceNorm).toBeLessThan(1);
  });
});

describe('QE1 with a genuinely misspecified world: no candidate is true, so none should survive', () => {
  /**
   * p = 0.6 is not any of QE1_CANDIDATES' declared visibilities (1.00, 0.92,
   * 0.72, 0.50). This is the loop's OTHER honest outcome, distinct from
   * "narrowed to two" (QE1's usual demo) and from "recovered exactly one"
   * (QE2/QE3's demos): a correct ending WITHOUT resolution, because the world
   * never matched any declared hypothesis in the first place. Rejecting every
   * candidate here is the right answer, not a recovery failure — the
   * AutonomousInquiryScreen demo built on this exact call must not blame the
   * agent for what the world simply isn't (see its `qe1-misspecified` entry).
   */
  const result = runAutonomousInquiry(qe1VisibilityInquiry(0.6));

  it('rejects every declared candidate and stops because none is left, not because it ran out of rounds', () => {
    expect(result.survivingHypothesisIds).toEqual([]);
    expect([...result.falsifiedHypothesisIds].sort()).toEqual(['h:classical', 'h:good', 'h:ideal', 'h:marginal']);
    expect(result.stopReason).toBe('NO_CONTENDERS_LEFT');
  });

  it('still ran a real, multi-round, Tautology-Gate-uncapped inquiry — this is a real result, not an admission failure', () => {
    expect(result.rounds.length).toBeGreaterThanOrEqual(2);
    expect(result.tautologyAssessment?.classification).toBe('EMPIRICAL_TEST');
    for (const round of result.rounds) expect(round.runFingerprint).toMatch(/\S/);
    // Round 1 (full depolarisation) predicts 0 for every candidate by
    // construction — the uninformative opening every QE1 demo shares — so real
    // belief movement only shows up once the probe leaves it; every falsified
    // outcome from round 2 on genuinely moved confidence, uncapped by the Gate.
    for (const o of result.rounds[1]!.outcomes) {
      expect(o.evidenceMagnitude).toBeGreaterThan(0);
      expect(o.confidenceAfter).toBeLessThan(o.confidenceBefore);
    }
  });
});

describe('the mandatory cycle is present in every round of all three inquiries', () => {
  it.each([
    ['QE1', qe1VisibilityInquiry()],
    ['QE2', qe2MonogamyInquiry()],
    ['QE3', qe3BoundEntanglementInquiry()],
  ])('%s: hypothesis -> prediction -> experiment -> verdict -> belief update -> next question', (_name, input) => {
    const result = runAutonomousInquiry(input);
    expect(result.rounds.length).toBeGreaterThanOrEqual(2);
    for (const round of result.rounds) {
      // experiment: a real run, with a real fingerprint, on the real model.
      expect(round.runId).toMatch(/\S/);
      expect(round.runFingerprint).toMatch(/\S/);
      expect(round.modelId).toBe(ENTANGLEMENT_MODEL_ID);
      expect(round.resultStatus).toBe('completed');
      // why THIS experiment, in the loop's own words.
      expect(round.selection.why.length).toBeGreaterThan(40);
      for (const o of round.outcomes) {
        // prediction, independently of the hidden truth, and a verdict on it.
        expect(o.predicted).not.toBeNull();
        expect(['SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL', 'INCONCLUSIVE']).toContain(o.assessment);
        // belief update, recorded on both sides.
        expect(o.confidenceBefore).toBeGreaterThan(0);
        expect(o.confidenceAfter).toBeGreaterThan(0);
      }
      // the next question, decided from what this round showed.
      expect(round.nextSelection.why.length).toBeGreaterThan(40);
    }
    // The proposal is never synthesised: a stop that proposes nothing says null.
    if (result.stopReason === 'NO_CONTENDERS_LEFT' || result.stopReason === 'NO_DISCRIMINATING_PROBE') {
      expect(result.nextExperiment.probeValue).toBeNull();
    }
  });
});
