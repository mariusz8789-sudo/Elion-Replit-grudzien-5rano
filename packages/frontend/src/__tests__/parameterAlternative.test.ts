import { describe, expect, it } from 'vitest';

import { runAutonomousInquiry, type InquiryLoopInput } from '../core/agent/inquiryLoop';
import { proteinFoldingInquiry, proteinFoldingSystem } from '../core/agent/proteinFoldingInquiry';
import {
  asParameterHypothesis,
  deriveAlternativeParameterValue,
  PARAMETER_ALTERNATIVE_CONTRACT_VERSION,
} from '../core/agent/parameterAlternative';

/**
 * A ❌ B ❌ C ❌ D ❌ → Genesis derives E, and E survives a real experiment.
 *
 * The substrate is the same seeded HP-lattice Metropolis solver
 * `proteinFoldingInquiry.test.ts` already measures. A fold at temperature 0.5
 * is one NOBODY declared: the four candidates are 0.3, 0.7, 1.2 and 2.0, and a
 * real run refutes all four. Every number asserted below was read off that real
 * run before it was written down.
 */

const TRUE_HIDDEN_TEMPERATURE = 0.5;

function exhaustedRun(): { input: InquiryLoopInput; result: ReturnType<typeof runAutonomousInquiry> } {
  const input = proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
  return { input, result: runAutonomousInquiry(input) };
}

describe('parameterAlternative — a value nobody declared, derived from the failure', () => {
  it('grounds the fixture: every declared candidate really is refuted', () => {
    const { result } = exhaustedRun();
    expect(result.survivingHypothesisIds).toEqual([]);
    expect([...result.falsifiedHypothesisIds].sort()).toEqual(['h:cold', 'h:cool', 'h:hot', 'h:warm']);
    expect(result.openQuestions.join(' ')).toContain('not among the values anyone proposed');
  });

  it('THE DEFINING BEHAVIOUR: derives the bracketed value, and it is the true hidden one', () => {
    const { input, result } = exhaustedRun();
    const derived = deriveAlternativeParameterValue(result, input);

    expect(derived).not.toBeNull();
    expect(derived!.contractVersion).toBe(PARAMETER_ALTERNATIVE_CONTRACT_VERSION);
    expect(derived!.parameterId).toBe('temperature');
    // Bracketed by cold (T=0.3, predicted 0.1728) and cool (T=0.7, predicted
    // 0.3428) around the observed 0.2576 at 5000 steps — midpoint 0.5.
    expect(derived!.bracketLowHypothesisId).toBe('h:cold');
    expect(derived!.bracketHighHypothesisId).toBe('h:cool');
    expect(derived!.value).toBe(0.5);
    // Not a coincidence worth hiding: the derivation landed on the real answer.
    expect(derived!.value).toBe(TRUE_HIDDEN_TEMPERATURE);
    expect(derived!.derivedFromProbeValue).toBe(5000);
    expect(derived!.hypothesisId).toBe('h:derived-temperature-0.5');
  });

  it('ANTI-HARKING: the probe that derived the value is excluded from judging it', () => {
    const { input, result } = exhaustedRun();
    const derived = deriveAlternativeParameterValue(result, input)!;
    expect(derived.excludedProbeValues).toEqual([derived.derivedFromProbeValue]);
    expect(derived.excludedProbeValues).toContain(5000);
    expect(derived.why).toContain('never confirmed by the measurement that produced it');
  });

  it('THE PAYOFF: the derived value survives a real experiment at a probe it was NOT derived from', () => {
    const { input, result } = exhaustedRun();
    const derived = deriveAlternativeParameterValue(result, input)!;

    // A genuinely new inquiry: the derived candidate against the two declared
    // claims that bracketed it, opened at an UNTRIED probe (20000 — never run
    // in the first inquiry, and not the 5000 that produced the derivation).
    const followUp: InquiryLoopInput = {
      question: 'Does the value derived from the exhausted space hold up?',
      system: proteinFoldingSystem(TRUE_HIDDEN_TEMPERATURE),
      hypotheses: [
        asParameterHypothesis(derived),
        ...input.hypotheses.filter((h) => h.hypothesisId === 'h:cold' || h.hypothesisId === 'h:cool'),
      ],
      openingProbeValue: 20000,
      maxRounds: 4,
    };
    expect(followUp.openingProbeValue).not.toBe(derived.derivedFromProbeValue);
    expect(derived.excludedProbeValues).not.toContain(followUp.openingProbeValue);

    const verdict = runAutonomousInquiry(followUp);

    // The derived hypothesis is the one left standing, and the two declared
    // claims that bracketed it are refuted again — on measurements neither the
    // derivation nor the original run had seen.
    expect(verdict.survivingHypothesisIds).toEqual([derived.hypothesisId]);
    expect([...verdict.falsifiedHypothesisIds].sort()).toEqual(['h:cold', 'h:cool']);
    // It was really tested, not merely carried through untested.
    expect(verdict.untestedHypothesisIds).not.toContain(derived.hypothesisId);
    const judgedRounds = verdict.rounds.filter((r) => r.outcomes.some((o) => o.hypothesisId === derived.hypothesisId));
    expect(judgedRounds.length).toBeGreaterThan(0);
  });
});

describe('parameterAlternative — the three refusals, each on a real case', () => {
  it('refuses while a declared hypothesis still survives: the space is not exhausted', () => {
    // A fold at 0.45 leaves h:cool standing — testing between survivors is the
    // loop's own job, and inventing here would pre-empt it.
    const input = proteinFoldingInquiry(0.45);
    const result = runAutonomousInquiry(input);
    expect(result.survivingHypothesisIds.length).toBeGreaterThan(0);
    expect(deriveAlternativeParameterValue(result, input)).toBeNull();
  });

  it('refuses when the hypotheses claim two coupled parameters, not one scalar', () => {
    // Arrhenius: every hypothesis claims Ea AND log10 A. A 1-D bracket cannot
    // locate a point in that 2-D space — and these four sit on a compensation
    // line by construction, so approximating would be actively wrong.
    const input: InquiryLoopInput = {
      question: 'Which activation energy / pre-exponential pair does this sample have?',
      system: {
        systemId: 'sample-unproposed', label: 'A sample nobody proposed', modelId: 'chemistry-arrhenius',
        hiddenParameters: { activationEnergyKJ: 120, preExponentialLog10: 18.5 },
        probeParameterId: 'temperatureK', candidateProbeValues: [350, 400, 450, 500, 600, 800],
        fixedParameters: {}, observedMetric: 'rateConstant', agreementTolerance: 0.25,
      },
      hypotheses: [
        { hypothesisId: 'h:A-Ea60', statement: 'Ea=60', claimedValues: { activationEnergyKJ: 60, preExponentialLog10: 11.0 }, priorConfidence: 0.5 },
        { hypothesisId: 'h:C-Ea62', statement: 'Ea=62', claimedValues: { activationEnergyKJ: 62, preExponentialLog10: 11.2985 }, priorConfidence: 0.5 },
        { hypothesisId: 'h:B-Ea66', statement: 'Ea=66', claimedValues: { activationEnergyKJ: 66, preExponentialLog10: 11.8956 }, priorConfidence: 0.5 },
        { hypothesisId: 'h:D-Ea70', statement: 'Ea=70', claimedValues: { activationEnergyKJ: 70, preExponentialLog10: 12.4926 }, priorConfidence: 0.5 },
      ],
      openingProbeValue: 400,
      maxRounds: 4,
    };
    const result = runAutonomousInquiry(input);
    // Ground it: this really IS an exhausted space, so only refusal 2 can be
    // what stops the derivation.
    expect(result.survivingHypothesisIds).toEqual([]);
    expect(deriveAlternativeParameterValue(result, input)).toBeNull();
  });

  it('refuses to extrapolate: a round where nothing brackets the observation yields nothing', () => {
    // At 200 steps every candidate predicts the identical 0.13 — a real
    // algorithmic floor of this solver, so that round can never bracket. The
    // derivation must come from a later round or not at all; a run whose ONLY
    // round is that one has nothing honest to offer.
    const input: InquiryLoopInput = { ...proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE), maxRounds: 1 };
    const result = runAutonomousInquiry(input);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0]!.probeValue).toBe(200);
    // Nothing was even falsified at the floor, so the space is not exhausted
    // either — both refusals point the same way, and the answer is null.
    expect(deriveAlternativeParameterValue(result, input)).toBeNull();
  });
});
