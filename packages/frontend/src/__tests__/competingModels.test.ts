import { describe, expect, it } from 'vitest';

import { assessCompetingModels, COMPETING_MODELS_CONTRACT_VERSION } from '../core/agent/competingModels';
import { runAutonomousDiscovery } from '../core/agent/discoveryLoop';
import { GENESIS_GENERATOR_CATALOG } from '../core/agent/electricalGeneratorLeverCatalog';
import { runAutonomousInquiry, type InquiryLoopInput, type ParameterHypothesis, type SystemUnderStudy } from '../core/agent/inquiryLoop';
import { toMechanismRun, toParameterRun } from '../core/agent/discoveryStrategies';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal } from '../core/agent/worldGoalIntent';

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

/**
 * MECHANISM SHAPE — the coverage this module's own doc names as an open gap
 * ("MECHANISM/CALIBRATION runs get no such sentence at all"). Found by
 * measuring every real lever catalog under a generic, all-levers goal
 * (`docs/AUTONOMOUS_DISCOVERY_ROADMAP.md`'s C3 audit), not assumed: of the
 * five real domains, only `GENESIS_GENERATOR_CATALOG` reaches
 * `bestSupported.length > 1` under `discoveryLoop.ts`'s current `selectNext` —
 * see that file's own module doc for why this is structurally rare (greedy
 * consolidation always retests a `SUPPORTED_ONCE` hypothesis before exploring
 * a new one, so two DECLARED hypotheses can never be simultaneously
 * mid-consolidation without help).
 *
 * The mechanism here is P3 regeneration, not plain declared-hypothesis
 * competition. Measured: `h:fuel-efficiency` and `h:load-shedding` are BOTH
 * declared with a criterion whose expected direction the real solver
 * contradicts (baseline 40.0 L fuel remaining; strength=1 gives 85.83 and
 * 98.67 respectively — the metric moves, just the opposite way the criterion
 * expected) — genuine `FALSIFIED_WITHIN_PROTOCOL`, not `REFUTED_BY_NO_EFFECT`.
 * Both derive a `RELATION_FLIP` alternative, each excluding strength=1 (the
 * strength that falsified its parent) from ever being retested. Both flipped
 * alternatives are tested at strength=0.5 and are genuinely `SUPPORTED` there
 * (62.92 and 69.33 respectively, same direction as their own strength-1
 * measurement — a real, dose-proportional effect, not noise: 22.92 ≈ 45.83/2
 * and 29.33 ≈ 58.67/2). Neither can EVER reach `SUPPORTED_AT_TWO_MAGNITUDES`,
 * because their only remaining untested magnitude (1) is the one excluded —
 * so `LEADER_CONFIRMED_AT_TWO_MAGNITUDES` never fires at all here, and the
 * loop instead runs out of testable hypotheses honestly
 * (`ALL_HYPOTHESES_RESOLVED`) with two permanently-unconsolidated survivors.
 */
describe('competingModels — MECHANISM shape, a real domain that reaches 2+ simultaneous survivors', () => {
  function generatorRun() {
    const goal = `Minimise ${Object.keys(GENESIS_GENERATOR_CATALOG.metricPhrases)[0]!}, at most 10 experiments.`;
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_GENERATOR_CATALOG);
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_GENERATOR_CATALOG);
    if ('error' in plan) throw new Error(`expected a runnable plan, got: ${plan.error}`);
    return toMechanismRun(runAutonomousDiscovery(plan));
  }

  it('grounds the fixture: two independently-derived survivors, neither consolidated, real measured numbers', () => {
    const run = generatorRun();
    // Grounding first, per this repo's measure-before-asserting discipline —
    // trusting the verdict on this fixture requires knowing the fixture is
    // really what the module doc above claims.
    expect(run.stopReason).toBe('ALL_HYPOTHESES_RESOLVED');
    expect(run.surviving).toEqual(['h:fuel-efficiency~RELATION_FLIP', 'h:load-shedding~RELATION_FLIP']);
    expect(run.falsified).toEqual(['h:fuel-efficiency', 'h:load-shedding', 'h:generator-rating', 'h:larger-tank']);
  });

  it('COMPETING_MODELS_UNRESOLVED: MECHANISM can reach 2+ simultaneous survivors WITHOUT LEADER_CONFIRMED_AT_TWO_MAGNITUDES ever firing', () => {
    const run = generatorRun();
    const verdict = assessCompetingModels(run);

    expect(verdict.status).toBe('COMPETING_MODELS_UNRESOLVED');
    expect(verdict.competingHypothesisIds).toEqual(['h:fuel-efficiency~RELATION_FLIP', 'h:load-shedding~RELATION_FLIP']);
    // The real finding: this MECHANISM run never even attempts the greedy
    // two-magnitude confirmation that would normally end the search on ONE
    // hypothesis — both survivors are stuck at SUPPORTED_ONCE by the
    // anti-HARK exclusion, so the loop reports the honest MECHANISM-specific
    // stop reason instead, exactly as this module's own doc says it must
    // (carried verbatim, never generalised into PARAMETER's vocabulary).
    expect(verdict.stopReason).toBe('ALL_HYPOTHESES_RESOLVED');
    expect(verdict.nextStep).toContain('2 hypotheses remain consistent');
    expect(verdict.nextStep).toContain('ALL_HYPOTHESES_RESOLVED');
  });
});
