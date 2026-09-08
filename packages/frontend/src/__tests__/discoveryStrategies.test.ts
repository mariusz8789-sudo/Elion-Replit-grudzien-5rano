import { describe, expect, it } from 'vitest';
import { GENESIS_CHEMISTRY_CATALOG } from '../core/agent/chemistryLeverCatalog';
import { discoveryResultFingerprint, runAutonomousDiscovery } from '../core/agent/discoveryLoop';
import { inquiryResultFingerprint, runAutonomousInquiry, type InquiryLoopInput } from '../core/agent/inquiryLoop';
import {
  mechanismStrategy,
  parameterStrategy,
  toMechanismRun,
  toParameterRun,
} from '../core/agent/discoveryStrategies';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal, GENESIS_FLOOD_CATALOG } from '../core/agent/worldGoalIntent';

/**
 * ADAPTER EQUIVALENCE — the property that makes the shared contract safe.
 *
 * A `StrategyRun` is only trustworthy if wrapping a loop changed nothing about
 * what it decided. These tests assert that by comparing against a DIRECT call
 * to the same loop with the same input, rather than by trusting the adapter's
 * own description of itself — the same discipline `nextActionSelectors.test.ts`
 * already applies to the six selectors it wraps.
 */

function floodPlan() {
  const intent = parseWorldDiscoveryGoal('Minimise peak flood depth, at most 3 experiments.', GENESIS_FLOOD_CATALOG);
  const plan = buildWorldDiscoveryPlan(intent, GENESIS_FLOOD_CATALOG);
  if ('error' in plan) throw new Error(`expected a runnable plan, got: ${plan.error}`);
  return plan;
}

function chemistryPlan() {
  const intent = parseWorldDiscoveryGoal('Minimise the remaining fraction by heating, at most 2 experiments.', GENESIS_CHEMISTRY_CATALOG);
  const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_CATALOG);
  if ('error' in plan) throw new Error(`expected a runnable plan, got: ${plan.error}`);
  return plan;
}

/** A real degenerate-parameter inquiry: two Arrhenius assignments that agree at one temperature. */
function inquiryInput(): InquiryLoopInput {
  return {
    question: 'Which activation energy does this sample have?',
    system: {
      systemId: 'sample-under-test',
      label: 'Unknown kinetics sample',
      modelId: 'chem-arrhenius',
      hiddenParameters: { activationEnergyKJ: 60 },
      probeParameterId: 'temperatureK',
      candidateProbeValues: [400, 450, 800],
      fixedParameters: { preExponentialLog10: 4 },
      observedMetric: 'rateConstant',
      agreementTolerance: 0.15,
    },
    hypotheses: [
      { hypothesisId: 'h:ea-60', statement: 'Ea is 60 kJ/mol.', claimedValues: { activationEnergyKJ: 60 }, priorConfidence: 0.5 },
      { hypothesisId: 'h:ea-70', statement: 'Ea is 70 kJ/mol.', claimedValues: { activationEnergyKJ: 70 }, priorConfidence: 0.5 },
    ],
    openingProbeValue: 400,
    maxRounds: 3,
  };
}

describe('discovery strategy adapters', () => {
  it('MECHANISM: native carries the loop result untouched', () => {
    // Reference identity, which is the strongest possible statement that the
    // adapter did not copy, reshape or filter the loop's own result.
    const direct = runAutonomousDiscovery(floodPlan());
    expect(toMechanismRun(direct).native).toBe(direct);
  });

  it('MECHANISM: wrapping changes nothing about what the loop decided', () => {
    // Compared by CONTENT FINGERPRINT rather than object equality on purpose:
    // `TemporalEngine` labels branches from a process-global counter, so two
    // runs of the same plan carry different `branchId`s while being the same
    // science. That is exactly why `discoveryResultFingerprint` excludes branch
    // ids — this test would be asserting an artefact of run order otherwise.
    const plan = floodPlan();
    const direct = runAutonomousDiscovery(plan);
    const viaStrategy = mechanismStrategy.run(plan);
    expect(viaStrategy.resultFingerprint).toBe(discoveryResultFingerprint(direct));
  });

  it('MECHANISM: the projection reports the loop\'s own verdicts, not re-judged ones', () => {
    const plan = floodPlan();
    const direct = runAutonomousDiscovery(plan);
    const run = mechanismStrategy.run(plan);

    expect(run.shape).toBe('MECHANISM');
    expect(run.stopReason).toBe(direct.stopReason);
    expect(run.surviving).toEqual(direct.bestSupported.map((b) => b.hypothesisId));
    expect(run.falsified).toEqual(direct.failedHypotheses.map((b) => b.hypothesisId));
    expect(run.rounds).toHaveLength(direct.rounds.length);
    for (const [i, round] of run.rounds.entries()) {
      const source = direct.rounds[i]!;
      expect(round.why).toBe(source.selectionReason);
      expect(round.observed).toBe(source.objectiveObserved);
      expect(round.verdicts[0]!.assessment).toBe(source.assessment.assessment);
    }
  });

  it('MECHANISM: carries the world\'s declared limits, so a reader sees what it did not model', () => {
    const run = mechanismStrategy.run(floodPlan());
    expect(run.limitations.length).toBeGreaterThan(0);
  });

  it('MECHANISM: works unchanged on a second domain (chemistry), not just the flood city', () => {
    const run = mechanismStrategy.run(chemistryPlan());
    expect(run.domainId).toBe('chemistry-kinetics');
    expect(run.rounds.length).toBeGreaterThan(0);
    // Same adapter, same shape, genuinely different science underneath.
    expect(run.strategyId).toBe(mechanismStrategy.run(floodPlan()).strategyId);
  });

  it('PARAMETER: native is exactly what calling the inquiry loop directly returns', () => {
    const input = inquiryInput();
    const direct = runAutonomousInquiry(input);
    const viaStrategy = parameterStrategy.run(input);
    // This loop measures through the Fabric rather than forking a world, so it
    // carries no process-local branch labels and full equality holds.
    expect(viaStrategy.native).toEqual(direct);
    expect(viaStrategy.resultFingerprint).toBe(inquiryResultFingerprint(direct));
    expect(toParameterRun(direct, input).native).toBe(direct);
  });

  it('PARAMETER: the projection reports the loop\'s own partition and proposal', () => {
    const input = inquiryInput();
    const direct = runAutonomousInquiry(input);
    const run = parameterStrategy.run(input);

    expect(run.shape).toBe('PARAMETER');
    expect(run.stopReason).toBe(direct.stopReason);
    expect(run.surviving).toEqual(direct.survivingHypothesisIds);
    expect(run.falsified).toEqual(direct.falsifiedHypothesisIds);
    expect(run.untested).toEqual(direct.untestedHypothesisIds);
    // The proposal comes from the existing nextAction adapter, not a second converter.
    expect(run.nextExperiment?.selectorId).toBe('parameter-inquiry');
  });

  it('admits before it runs, and refuses a question with no solver behind it', () => {
    // A real capability check, not a formality: this is the gap neither loop
    // checked before the admission layer existed.
    expect(mechanismStrategy.admit(floodPlan()).status).toBe('APPROXIMATION');

    const unknownModel: InquiryLoopInput = {
      ...inquiryInput(),
      system: { ...inquiryInput().system, modelId: 'no-such-model' },
    };
    const refused = parameterStrategy.admit(unknownModel);
    expect(refused.status).toBe('BLOCKED');
    expect(refused.missing.length).toBeGreaterThan(0);
  });
});
