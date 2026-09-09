import { describe, expect, it } from 'vitest';

import { assessCompetingModels, COMPETING_MODELS_CONTRACT_VERSION } from '../core/agent/competingModels';
import { runAutonomousInquiry, type InquiryLoopInput, type ParameterHypothesis, type SystemUnderStudy } from '../core/agent/inquiryLoop';
import { toParameterRun } from '../core/agent/discoveryStrategies';

/**
 * Same real degeneracy `inquiryLoop.test.ts` proves: Arrhenius kinetics on the
 * compensation line through T0 = 350 K. Reused rather than re-derived, so this
 * file's "several hypotheses really are indistinguishable" claim rests on the
 * exact fixture that already earns it there.
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

function systemWithHidden(ea: number, logA: number, candidateProbeValues: readonly number[]): SystemUnderStudy {
  return {
    systemId: `sample-Ea${ea}`,
    label: `Unmeasured kinetic sample (Ea = ${ea} kJ/mol)`,
    modelId: 'chemistry-arrhenius',
    hiddenParameters: { activationEnergyKJ: ea, preExponentialLog10: logA },
    probeParameterId: 'temperatureK',
    candidateProbeValues,
    fixedParameters: {},
    observedMetric: 'rateConstant',
    agreementTolerance: 0.25,
  };
}

function runParameterInquiry(system: SystemUnderStudy, openingProbeValue = 400): { input: InquiryLoopInput; run: ReturnType<typeof toParameterRun> } {
  const input: InquiryLoopInput = {
    question: 'Which activation energy / pre-exponential pair does this sample actually have?',
    system,
    hypotheses: HYPOTHESES,
    openingProbeValue,
    maxRounds: 4,
  };
  return { input, run: toParameterRun(runAutonomousInquiry(input), input) };
}

const HIDDEN_A = ON_COMPENSATION_LINE[0];

describe('competingModels — reads a real StrategyRun, invents nothing', () => {
  it('COMPETING_MODELS_UNRESOLVED: four hypotheses genuinely indistinguishable at the only probe offered', () => {
    // Same fixture as inquiryLoop.test.ts's "refuses to propose an uninformative
    // probe rather than running one anyway" — 350 K is the compensation point,
    // where all four hypotheses agree by construction.
    const { run } = runParameterInquiry(systemWithHidden(HIDDEN_A.ea, HIDDEN_A.logA, [350]), 350);
    const verdict = assessCompetingModels(run);

    expect(verdict.contractVersion).toBe(COMPETING_MODELS_CONTRACT_VERSION);
    expect(verdict.status).toBe('COMPETING_MODELS_UNRESOLVED');
    expect(verdict.competingHypothesisIds).toEqual(['h:A-Ea60', 'h:C-Ea62', 'h:B-Ea66', 'h:D-Ea70']);
    expect(verdict.stopReason).toBe('NO_DISCRIMINATING_PROBE');
    expect(verdict.nextStep).not.toBeNull();
    expect(verdict.nextStep).toContain('4 hypotheses remain consistent');
    expect(verdict.nextStep).toContain('NO_DISCRIMINATING_PROBE');
  });

  it('SINGLE_EXPLANATION: a full probe list separates the sample down to the one that matches the bench', () => {
    const { run } = runParameterInquiry(systemWithHidden(HIDDEN_A.ea, HIDDEN_A.logA, [350, 400, 450, 500, 600, 800]));
    expect(run.surviving).toEqual(['h:A-Ea60']); // ground the fixture before trusting the verdict on it

    const verdict = assessCompetingModels(run);
    expect(verdict.status).toBe('SINGLE_EXPLANATION');
    expect(verdict.competingHypothesisIds).toEqual([]);
    expect(verdict.nextStep).toBeNull();
  });

  it('NOT_APPLICABLE: zero survivors is model-sufficiency\'s finding, not this module\'s', () => {
    // A sample nobody proposed — every hypothesis is genuinely wrong.
    const { run } = runParameterInquiry(systemWithHidden(120, 18.5, [350, 400, 450, 500, 600, 800]));
    expect(run.surviving).toEqual([]); // ground the fixture

    const verdict = assessCompetingModels(run);
    expect(verdict.status).toBe('NOT_APPLICABLE');
    expect(verdict.competingHypothesisIds).toEqual([]);
    expect(verdict.nextStep).toBeNull();
  });

  it('names whether the run already proposed a RUNNABLE next step, not just any NextAction object', () => {
    const { run } = runParameterInquiry(systemWithHidden(HIDDEN_A.ea, HIDDEN_A.logA, [350]), 350);
    const verdict = assessCompetingModels(run);
    // `parameterInquiryNextAction` always returns a NextAction, even when there
    // is nothing to run — here it is RESOLVED with "No further measurement
    // proposed (NO_DISCRIMINATING_PROBE)." A verdict that treated "non-null" as
    // "already proposed" would misreport this exact case, so it must check
    // status, not nullness.
    expect(run.nextExperiment).not.toBeNull();
    expect(run.nextExperiment?.status).toBe('RESOLVED');
    expect(verdict.nextStep).toContain('This run proposed no next step');
  });
});
