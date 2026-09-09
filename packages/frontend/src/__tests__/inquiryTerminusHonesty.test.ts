import { describe, expect, it } from 'vitest';

import { runAutonomousInquiryWithRuns, type InquiryLoopInput } from '../core/agent/inquiryLoop';
import { toParameterRun } from '../core/agent/discoveryStrategies';
import { deriveAlternativeParameterValue } from '../core/agent/parameterAlternative';
import {
  PROTEIN_FOLDING_HYPOTHESES,
  PROTEIN_FOLDING_PROBE_STEPS,
  proteinFoldingSystem,
} from '../core/agent/proteinFoldingInquiry';

/**
 * WHAT GENESIS SAYS AT THE POINTS WHERE IT STOPS.
 *
 * Two defects found by auditing every terminus of the PARAMETER loop for
 * "does Genesis have a correct next action here, or does it just end?", both
 * reproduced on the real seeded HP-lattice solver with no mocking.
 */

function foldingInquiry(over: Partial<InquiryLoopInput['system']>, opening: number, maxRounds = 4): InquiryLoopInput {
  const base = proteinFoldingSystem(0.5);
  return {
    question: 'What temperature did this HP-lattice protein fold actually run at?',
    system: { ...base, ...over },
    hypotheses: PROTEIN_FOLDING_HYPOTHESES,
    openingProbeValue: opening,
    maxRounds,
  };
}

describe('a failed measurement is not a proposal', () => {
  // `steps` is validated to [1, 50000] by the runner, so 999999 makes the real
  // solver return nothing — a genuine failure, not a stub.
  const input = foldingInquiry({ candidateProbeValues: [999_999, 5000, 1000] }, 999_999);

  it('THE DEFECT: the run used to propose re-running the measurement that had just failed', () => {
    const result = runAutonomousInquiryWithRuns(input).result;
    expect(result.stopReason).toBe('MEASUREMENT_FAILED');
    expect(result.rounds).toHaveLength(0);

    // No probe is proposed at all now. Previously `nextExperiment` still held
    // the selection that chose 999999, and the adapter turned it into a
    // READY_TO_RUN request to measure at steps=999999 — a consumer routing on
    // that status would retry the same failure forever.
    expect(result.nextExperiment.probeValue).toBeNull();
    expect(result.nextExperiment.rule).toBe('MEASUREMENT_FAILED');
    expect(result.nextExperiment.why).toContain('would repeat the failure');
  });

  it('the shared contract reports it as resolved-with-nothing-to-run, never as an executable request', () => {
    const run = toParameterRun(runAutonomousInquiryWithRuns(input).result, input);
    expect(run.nextExperiment).not.toBeNull();
    expect(run.nextExperiment!.status).toBe('RESOLVED');
    expect(run.nextExperiment!.request).toBeNull();
  });

  it('the failure is NAMED, so "never tested" has a reason attached to it', () => {
    const result = runAutonomousInquiryWithRuns(input).result;
    // Previously openQuestions listed only "Never tested: h:cold." and friends,
    // with nothing anywhere saying the apparatus had failed.
    const failureNoted = result.openQuestions.some(
      (q) => q.includes('999999') && q.includes('no usable'),
    );
    expect(failureNoted).toBe(true);
    // And it is stated as an open question about the apparatus, not silently
    // resolved into a claim about the hypotheses.
    expect(result.survivingHypothesisIds).toEqual([]);
    expect([...result.untestedHypothesisIds].sort()).toEqual(['h:cold', 'h:cool', 'h:hot', 'h:warm']);
  });
});

/**
 * BRACKETING ASSUMES MONOTONICITY. THE RUN'S OWN DATA CAN REFUTE IT.
 *
 * `deriveAlternativeParameterValue` proposes the midpoint of two claims whose
 * predictions straddle the observation. That localises the truth only if the
 * metric moves monotonically with the parameter across them. The check costs
 * nothing — the round already ran every candidate through the solver — and it
 * is not hypothetical on this substrate.
 */
describe('the monotonicity bracketing rests on is checked, not assumed', () => {
  it('acceptanceRate really is monotonic in temperature, so generation still fires there', () => {
    const input = foldingInquiry({}, PROTEIN_FOLDING_PROBE_STEPS[0]!);
    const result = runAutonomousInquiryWithRuns(input).result;
    const derived = deriveAlternativeParameterValue(result, input);

    expect(derived).not.toBeNull();
    expect(derived!.value).toBe(0.5);
    // Confirmed on 4 real predictions, not waved through.
    expect(derived!.monotonicity).toBe('MONOTONIC');

    // The round it derived from, shown to be genuinely ordered.
    const round = result.rounds.find((r) => r.probeValue === derived!.derivedFromProbeValue)!;
    const claimed: Record<string, number> = { 'h:cold': 0.3, 'h:cool': 0.7, 'h:warm': 1.2, 'h:hot': 2.0 };
    const byClaim = round.outcomes
      .filter((o) => o.predicted !== null)
      .sort((a, b) => claimed[a.hypothesisId]! - claimed[b.hypothesisId]!)
      .map((o) => o.predicted!);
    expect(byClaim).toEqual([...byClaim].sort((a, b) => a - b));
    expect(byClaim.length).toBeGreaterThanOrEqual(3);
  });

  it('THE VIOLATION IS REAL: judged by bestEnergy, the same four temperatures are NOT monotonic', () => {
    // Same solver, same seed, same temperatures — only the metric differs. The
    // protein-folding module's own doc says energy is dominated by which local
    // minimum one seeded trajectory falls into; this is that, measured.
    const input = foldingInquiry({ observedMetric: 'bestEnergy' }, PROTEIN_FOLDING_PROBE_STEPS[0]!);
    const result = runAutonomousInquiryWithRuns(input).result;

    const round = result.rounds.find((r) => r.probeValue === 1000);
    expect(round, 'expected the inquiry to reach steps=1000').toBeDefined();

    const claimed: Record<string, number> = { 'h:cold': 0.3, 'h:cool': 0.7, 'h:warm': 1.2, 'h:hot': 2.0 };
    const byClaim = round!.outcomes
      .filter((o) => o.predicted !== null)
      .sort((a, b) => claimed[a.hypothesisId]! - claimed[b.hypothesisId]!)
      .map((o) => o.predicted!);

    // -3, -2, -3, -3: rises then falls. A straddle here would be coincidence,
    // not a localisation of the truth between two claims.
    expect(byClaim.length).toBeGreaterThanOrEqual(3);
    const nonDecreasing = byClaim.every((v, i) => i === 0 || v >= byClaim[i - 1]!);
    const nonIncreasing = byClaim.every((v, i) => i === 0 || v <= byClaim[i - 1]!);
    expect(nonDecreasing || nonIncreasing).toBe(false);
  });
});
