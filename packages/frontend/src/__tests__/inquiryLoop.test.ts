import { describe, expect, it } from 'vitest';

import {
  INQUIRY_LOOP_CONTRACT_VERSION,
  runAutonomousInquiry,
  type InquiryLoopInput,
  type ParameterHypothesis,
  type SystemUnderStudy,
} from '../core/agent/inquiryLoop';
import { getRouterModel } from '../core/experimentFabric/router';

/**
 * The scientific setup, and why it is this one.
 *
 * Arrhenius kinetics has a real, well-known degeneracy: a higher activation
 * energy compensated by a larger pre-exponential factor gives an IDENTICAL rate
 * at one temperature and a divergent rate at another. On the compensation line
 *   log10(A) = C + Ea / (R * T0 * ln 10)
 * every (Ea, log10 A) pair predicts the same rate at T0. That is exactly why
 * chemists measure rates at several temperatures instead of one, and it is what
 * makes "which experiment should I run next" a real question rather than a
 * formality: after the first measurement several assignments are still standing,
 * and WHICH ones are still standing is decided by what was measured.
 *
 * All four hypotheses below sit on the compensation line through T0 = 350 K
 * (slope 0.14926 per kJ/mol), so at 350 K they are indistinguishable by
 * construction. The inquiry never opens there.
 */
const ON_COMPENSATION_LINE = [
  { id: 'h:A-Ea60', ea: 60, logA: 11.0 },
  { id: 'h:C-Ea62', ea: 62, logA: 11.2985 },
  { id: 'h:B-Ea66', ea: 66, logA: 11.8956 },
  { id: 'h:D-Ea70', ea: 70, logA: 12.4926 },
] as const;

const HYPOTHESES: readonly ParameterHypothesis[] = ON_COMPENSATION_LINE.map((h) => ({
  hypothesisId: h.id,
  statement: `The sample's activation energy is ${h.ea} kJ/mol with log10 A = ${h.logA}`,
  claimedValues: { activationEnergyKJ: h.ea, preExponentialLog10: h.logA },
  priorConfidence: 0.5,
}));

function systemWithHidden(ea: number, logA: number): SystemUnderStudy {
  return {
    systemId: `sample-Ea${ea}`,
    label: `Unmeasured kinetic sample (Ea = ${ea} kJ/mol)`,
    modelId: 'chemistry-arrhenius',
    hiddenParameters: { activationEnergyKJ: ea, preExponentialLog10: logA },
    probeParameterId: 'temperatureK',
    candidateProbeValues: [350, 400, 450, 500, 600, 800],
    fixedParameters: {},
    observedMetric: 'rateConstant',
    agreementTolerance: 0.25,
  };
}

function inquiryOn(ea: number, logA: number, overrides: Partial<InquiryLoopInput> = {}) {
  return runAutonomousInquiry({
    question: 'Which activation energy / pre-exponential pair does this sample actually have?',
    system: systemWithHidden(ea, logA),
    hypotheses: HYPOTHESES,
    openingProbeValue: 400,
    maxRounds: 4,
    ...overrides,
  });
}

const HIDDEN_A = ON_COMPENSATION_LINE[0];
const HIDDEN_D = ON_COMPENSATION_LINE[3];

describe('inquiryLoop — the substrate is real', () => {
  it('runs on a model that exists in the router, not a stub defined here', () => {
    const model = getRouterModel('chemistry-arrhenius');
    expect(model).toBeDefined();
    expect(model?.domainId).toBe('chemistry');
    expect(model?.engine).toBe('genesis-model-graph@1.0.0');
  });

  it('carries real run provenance on every round', () => {
    const result = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
    expect(result.contractVersion).toBe(INQUIRY_LOOP_CONTRACT_VERSION);
    expect(result.domainId).toBe('chemistry');
    expect(result.rounds.length).toBeGreaterThan(0);
    for (const round of result.rounds) {
      expect(round.runId).toBeTruthy();
      expect(round.runFingerprint).toBeTruthy();
      expect(round.engine).toBe('genesis-model-graph@1.0.0');
      expect(round.modelId).toBe('chemistry-arrhenius');
      expect(round.observed).not.toBeNull();
    }
    // Different probes are different runs — not one cached number reused.
    const fingerprints = new Set(result.rounds.map((r) => r.runFingerprint));
    expect(fingerprints.size).toBe(result.rounds.length);
  });

  it('is deterministic: the same inquiry twice gives the same probes and beliefs', () => {
    const first = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
    const second = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
    expect(second.rounds.map((r) => r.probeValue)).toEqual(first.rounds.map((r) => r.probeValue));
    expect(second.finalBeliefs).toEqual(first.finalBeliefs);
    expect(second.survivingHypothesisIds).toEqual(first.survivingHypothesisIds);
  });
});

describe('inquiryLoop — the degeneracy is real, so round 1 cannot settle it', () => {
  it('leaves several hypotheses standing after the first measurement', () => {
    const result = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
    const roundOne = result.rounds[0];
    const stillStanding = roundOne.beliefsAfter.filter((b) => b.status !== 'FALSIFIED_WITHIN_PROTOCOL');
    expect(stillStanding.length).toBeGreaterThan(1);
    // ...and it did falsify something: the observation carries information.
    expect(roundOne.beliefsAfter.some((b) => b.status === 'FALSIFIED_WITHIN_PROTOCOL')).toBe(true);
  });

  it('predicts each hypothesis by running the same solver, so predictions differ per hypothesis', () => {
    const roundOne = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA).rounds[0];
    const predictions = roundOne.outcomes.map((o) => o.predicted);
    expect(predictions.every((p) => typeof p === 'number')).toBe(true);
    expect(new Set(predictions).size).toBe(predictions.length);
  });
});

/**
 * THE AUTONOMY PROOF.
 *
 * Identical inputs in every respect a scripted system could key on: the same
 * question, the same four hypotheses with the same priors, the same candidate
 * probe list, the same opening probe of 400 K, the same model, the same round
 * budget. The ONLY difference is which sample is on the bench — i.e. what the
 * first measurement returns.
 *
 * If experiment 2 were predetermined, hard-coded or scripted, it would be the
 * same in both runs. It is not.
 */
describe('inquiryLoop — PROOF OF AUTONOMY: the observation chooses the next experiment', () => {
  const fromA = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
  const fromD = inquiryOn(HIDDEN_D.ea, HIDDEN_D.logA);

  it('starts both inquiries from a genuinely identical state', () => {
    expect(fromA.rounds[0].probeValue).toBe(400);
    expect(fromD.rounds[0].probeValue).toBe(400);
    expect(fromA.rounds[0].selection.rule).toBe('OPENING_PROBE_DECLARED');
    expect(fromD.rounds[0].selection.rule).toBe('OPENING_PROBE_DECLARED');
    // Same priors, same statuses, same order: nothing distinguishes the two
    // agents before the first measurement comes back.
    expect(fromD.rounds[0].beliefsBefore).toEqual(fromA.rounds[0].beliefsBefore);
    // Every prediction made in round 1 is identical too — the hypotheses are the
    // same, so what they expect at 400 K is the same. Only the measurement differs.
    expect(fromD.rounds[0].outcomes.map((o) => o.predicted))
      .toEqual(fromA.rounds[0].outcomes.map((o) => o.predicted));
  });

  it('observes a different result', () => {
    expect(fromA.rounds[0].observed).not.toBe(fromD.rounds[0].observed);
  });

  it('reaches a different hypothesis state', () => {
    const falsifiedByA = fromA.rounds[0].beliefsAfter
      .filter((b) => b.status === 'FALSIFIED_WITHIN_PROTOCOL').map((b) => b.hypothesisId);
    const falsifiedByD = fromD.rounds[0].beliefsAfter
      .filter((b) => b.status === 'FALSIFIED_WITHIN_PROTOCOL').map((b) => b.hypothesisId);
    expect(falsifiedByA).not.toEqual(falsifiedByD);
    // Specifically: each observation rules out the hypotheses far from the truth.
    expect(falsifiedByA).toContain('h:D-Ea70');
    expect(falsifiedByD).toContain('h:A-Ea60');
  });

  it('reaches a different confidence state', () => {
    const confidenceA = Object.fromEntries(fromA.rounds[0].beliefsAfter.map((b) => [b.hypothesisId, b.confidence]));
    const confidenceD = Object.fromEntries(fromD.rounds[0].beliefsAfter.map((b) => [b.hypothesisId, b.confidence]));
    expect(confidenceA).not.toEqual(confidenceD);
    // The moves are in the scientifically right direction, not merely different.
    expect(confidenceA['h:A-Ea60']).toBeGreaterThan(0.5);
    expect(confidenceA['h:D-Ea70']).toBeLessThan(0.5);
    expect(confidenceD['h:D-Ea70']).toBeGreaterThan(0.5);
    expect(confidenceD['h:A-Ea60']).toBeLessThan(0.5);
  });

  it('SELECTS A DIFFERENT NEXT EXPERIMENT — the claim the mission tests', () => {
    const nextAfterA = fromA.rounds[0].nextSelection;
    const nextAfterD = fromD.rounds[0].nextSelection;
    expect(nextAfterA.rule).toBe('DISCRIMINATES_TOP_TWO');
    expect(nextAfterD.rule).toBe('DISCRIMINATES_TOP_TWO');
    expect(nextAfterA.probeValue).not.toBe(nextAfterD.probeValue);
    // The concrete values, pinned so a regression is a test failure and not a
    // silently weakened claim. Both are real candidate temperatures.
    expect(nextAfterA.probeValue).toBe(800);
    expect(nextAfterD.probeValue).toBe(450);
    // And it is chosen to separate a DIFFERENT pair of survivors.
    expect(nextAfterA.betweenHypothesisIds).not.toEqual(nextAfterD.betweenHypothesisIds);
  });

  it('actually executes that different second experiment', () => {
    expect(fromA.rounds[1]?.probeValue).toBe(800);
    expect(fromD.rounds[1]?.probeValue).toBe(450);
    // Executable behaviour, not narration: the round-2 measurements are
    // different real runs at different temperatures.
    expect(fromA.rounds[1].runFingerprint).not.toBe(fromD.rounds[1].runFingerprint);
  });

  it('converges on the hypothesis that matches the sample actually on the bench', () => {
    expect(fromA.survivingHypothesisIds).toEqual(['h:A-Ea60']);
    expect(fromD.survivingHypothesisIds).toEqual(['h:D-Ea70']);
    expect(fromA.falsifiedHypothesisIds).toContain('h:D-Ea70');
    expect(fromD.falsifiedHypothesisIds).toContain('h:A-Ea60');
  });

  it('reports why round 2 was chosen in terms of round 1, not in terms of a script', () => {
    const why = fromA.rounds[0].nextSelection.why;
    expect(why).toContain('temperatureK=800');
    expect(why).toContain('h:A-Ea60');
    // A real number from a real prediction appears in the justification.
    expect(/\d/.test(why)).toBe(true);
  });
});

describe('inquiryLoop — honesty when it cannot decide', () => {
  it('refuses to propose an uninformative probe rather than running one anyway', () => {
    // Only 350 K is offered — the compensation point, where these two
    // hypotheses agree BY CONSTRUCTION. There is no experiment on this list
    // that could separate them, and the loop must say so.
    const degenerate = runAutonomousInquiry({
      question: 'Can a single measurement at the compensation temperature separate compensated pairs?',
      system: { ...systemWithHidden(HIDDEN_A.ea, HIDDEN_A.logA), candidateProbeValues: [350] },
      hypotheses: HYPOTHESES,
      openingProbeValue: 350,
      maxRounds: 4,
    });
    expect(degenerate.rounds).toHaveLength(1);
    expect(degenerate.stopReason).toBe('NO_DISCRIMINATING_PROBE');
    expect(degenerate.nextExperiment.probeValue).toBeNull();
    expect(degenerate.nextExperiment.rule).toBe('NO_DISCRIMINATING_PROBE');
    // All four survive: at the compensation point they really are indistinguishable.
    expect(degenerate.survivingHypothesisIds).toHaveLength(4);
    expect(degenerate.openQuestions.join(' ')).toContain('did not separate them');
  });

  it('says every hypothesis was wrong rather than crowning the least-wrong one', () => {
    // A sample nobody proposed: far off the compensation line.
    const unproposed = runAutonomousInquiry({
      question: 'What are this sample\'s kinetics?',
      system: systemWithHidden(120, 18.5),
      hypotheses: HYPOTHESES,
      openingProbeValue: 400,
      maxRounds: 4,
    });
    expect(unproposed.survivingHypothesisIds).toHaveLength(0);
    expect(unproposed.falsifiedHypothesisIds).toHaveLength(4);
    expect(unproposed.openQuestions.join(' ')).toContain('not among the values anyone proposed');
    expect(unproposed.stopReason).toBe('NO_CONTENDERS_LEFT');
  });

  it('reports untested hypotheses as untested, never as unlikely', () => {
    const zeroRounds = runAutonomousInquiry({
      question: 'What are this sample\'s kinetics?',
      system: systemWithHidden(HIDDEN_A.ea, HIDDEN_A.logA),
      hypotheses: HYPOTHESES,
      openingProbeValue: 400,
      maxRounds: 0,
    });
    expect(zeroRounds.rounds).toHaveLength(0);
    expect(zeroRounds.untestedHypothesisIds).toHaveLength(4);
    expect(zeroRounds.survivingHypothesisIds).toHaveLength(0);
    expect(zeroRounds.falsifiedHypothesisIds).toHaveLength(0);
    expect(zeroRounds.openQuestions.join(' ')).toContain('Never tested');
  });

  it('states the model boundary instead of implying a claim about real substances', () => {
    const result = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
    const limitations = result.limitations.join(' ');
    expect(limitations).toContain('chemistry-arrhenius');
    expect(limitations).toContain('which is not the same as being true of any real substance');
    expect(limitations).toContain('cannot find a value nobody proposed');
  });

  it('stops rather than repeating a probe it has already run', () => {
    const result = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
    const probes = result.rounds.map((r) => r.probeValue);
    expect(new Set(probes).size).toBe(probes.length);
  });
});

describe('inquiryLoop — the belief trajectory is a record, not a scalar', () => {
  it('keeps every confidence move, in order, with the reason and the real numbers', () => {
    const result = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
    const truthOutcomes = result.rounds.flatMap((r) => r.outcomes.filter((o) => o.hypothesisId === 'h:A-Ea60'));
    expect(truthOutcomes.length).toBeGreaterThan(1);
    for (const outcome of truthOutcomes) {
      expect(outcome.reason).toMatch(/Predicted .+, measured /);
      expect(outcome.relativeError).not.toBeNull();
      expect(outcome.confidenceAfter).not.toBe(outcome.confidenceBefore);
    }
    // Confidence in the true hypothesis rises across rounds, it does not reset.
    expect(truthOutcomes[1].confidenceBefore).toBe(truthOutcomes[0].confidenceAfter);
  });

  it('serializes: the whole result is plain JSON, storable verbatim', () => {
    const result = inquiryOn(HIDDEN_A.ea, HIDDEN_A.logA);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
