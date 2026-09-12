import { describe, expect, it } from 'vitest';
import { deriveDiscoveryConclusion } from '../core/discovery/discoveryConclusion';
import type { DiscoveryCase, DiscoveryComparison, DiscoveryReplay } from '../core/discovery/discoveryCase';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import type { ObservableDerivation } from '../core/agent/tautologyGate';

/**
 * TAUTOLOGY GATE × DISCOVERY CONCLUSION — regression for all four
 * classifications the gate can produce (`tautologyGate.ts::TautologyClassification`).
 *
 * No second gate is built here: every case below only DECLARES
 * `DiscoveryHypothesis.observableDerivations` and lets
 * `deriveDiscoveryConclusion` call the existing `assessTautology` once over
 * whatever was declared (`discoveryConclusion.ts::assessDeclaredDerivations`).
 * The rule under test throughout: a tautological criterion (CONSISTENCY_CHECK
 * or UNTESTABLE) must never move the verdict, met or not — an empirical one
 * may, exactly as before this feature existed.
 */

const CRITERION = (over: Partial<FalsificationCriterion> = {}): FalsificationCriterion => ({
  metric: 'totalDeaths',
  relation: 'less-than',
  rationale: 'test',
  ...over,
});

function caseWith(
  criterion: FalsificationCriterion,
  options: {
    supportingCriteria?: readonly FalsificationCriterion[];
    observableDerivations?: Record<string, Omit<import('../core/agent/tautologyGate').TautologyComponent, 'componentId'>>;
  } = {},
): DiscoveryCase {
  return {
    caseId: 'c1',
    question: 'q',
    hypothesis: {
      statement: 's',
      falsification: criterion,
      assumptions: [],
      supportingCriteria: options.supportingCriteria,
      observableDerivations: options.observableDerivations,
    },
    model: { modelId: 'm', modelVersion: '1.0.0', engine: 'e' },
    seed: 1,
    initialConditions: { nAgents: 10, initialInfected: 1, seed: 1, days: 10, stepsPerDay: 1 },
    arms: [],
    comparison: null,
    replay: null,
    evidence: null,
    conclusion: null,
    limitations: [],
    status: 'COMPLETED',
  } as unknown as DiscoveryCase;
}

const COMPARISON = (metrics: { key: string; baseline: number; variant: number }[]): DiscoveryComparison => ({
  status: 'COMPLETED',
  controlledDifference: 'scenario',
  metrics: metrics.map((m) => ({ ...m, absoluteDelta: m.variant - m.baseline, relativeDeltaPercent: null })),
  message: 'ok',
  blockedReason: null,
} as unknown as DiscoveryComparison);

const REPLAY: DiscoveryReplay = { status: 'MATCH', message: 'ok' } as unknown as DiscoveryReplay;

const MODEL_INVARIANT: ObservableDerivation = { source: 'model-invariant', modelId: 'solver', rationale: 'analytic ceiling of the solver\'s own formalism' };
const HYPOTHESIS_PARAM: ObservableDerivation = { source: 'hypothesis-parameter', modelId: 'solver', rationale: 'genuinely varies with which hypothesis is true' };
const INDEPENDENT_MEASUREMENT: ObservableDerivation = { source: 'independent-measurement', modelId: 'external-dataset', rationale: 'shares no code path with the prediction' };

describe('Tautology Gate integration in discoveryConclusion — CONSISTENCY_CHECK / EMPIRICAL_TEST / MIXED_TEST / UNTESTABLE', () => {
  it('a case without observableDerivations behaves exactly as before (tautologyClassification null, tautologyAssessment null)', () => {
    const conclusion = deriveDiscoveryConclusion(
      caseWith(CRITERION()),
      COMPARISON([{ key: 'totalDeaths', baseline: 10, variant: 5 }]),
      REPLAY,
    );
    expect(conclusion.verdict).toBe('SUPPORTED');
    expect(conclusion.tautologyAssessment ?? null).toBeNull();
    expect(conclusion.primary?.tautologyClassification ?? null).toBeNull();
  });

  it('a CONSISTENCY_CHECK primary criterion is INSUFFICIENT_EVIDENCE, whether met or not', () => {
    const derivations = { totalDeaths: { prediction: MODEL_INVARIANT, observation: MODEL_INVARIANT } };

    const met = deriveDiscoveryConclusion(
      caseWith(CRITERION(), { observableDerivations: derivations }),
      COMPARISON([{ key: 'totalDeaths', baseline: 10, variant: 5 }]),
      REPLAY,
    );
    expect(met.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(met.tautologyAssessment?.classification).toBe('CONSISTENCY_CHECK');

    const notMet = deriveDiscoveryConclusion(
      caseWith(CRITERION(), { observableDerivations: derivations }),
      COMPARISON([{ key: 'totalDeaths', baseline: 5, variant: 10 }]),
      REPLAY,
    );
    expect(notMet.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(notMet.verdict).not.toBe('NOT_SUPPORTED');
    expect(notMet.tautologyAssessment?.classification).toBe('CONSISTENCY_CHECK');
  });

  it('an UNTESTABLE primary criterion (undeclared derivation side) is also INSUFFICIENT_EVIDENCE, never NOT_SUPPORTED', () => {
    const conclusion = deriveDiscoveryConclusion(
      caseWith(CRITERION(), {
        observableDerivations: { totalDeaths: { prediction: null, observation: HYPOTHESIS_PARAM } },
      }),
      COMPARISON([{ key: 'totalDeaths', baseline: 5, variant: 10 }]),
      REPLAY,
    );
    expect(conclusion.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(conclusion.verdict).not.toBe('NOT_SUPPORTED');
    expect(conclusion.tautologyAssessment?.classification).toBe('UNTESTABLE');
  });

  it('an EMPIRICAL_TEST primary criterion decides the verdict normally, both ways', () => {
    const derivations = { totalDeaths: { prediction: HYPOTHESIS_PARAM, observation: INDEPENDENT_MEASUREMENT } };

    const supported = deriveDiscoveryConclusion(
      caseWith(CRITERION(), { observableDerivations: derivations }),
      COMPARISON([{ key: 'totalDeaths', baseline: 10, variant: 5 }]),
      REPLAY,
    );
    expect(supported.verdict).toBe('SUPPORTED');
    expect(supported.tautologyAssessment?.classification).toBe('EMPIRICAL_TEST');

    const notSupported = deriveDiscoveryConclusion(
      caseWith(CRITERION(), { observableDerivations: derivations }),
      COMPARISON([{ key: 'totalDeaths', baseline: 5, variant: 10 }]),
      REPLAY,
    );
    expect(notSupported.verdict).toBe('NOT_SUPPORTED');
    expect(notSupported.tautologyAssessment?.classification).toBe('EMPIRICAL_TEST');
  });

  it('a declaration on a SUPPORTING criterion only (primary undeclared) leaves the primary decision untouched and still excludes the inert supporting one', () => {
    const supportingCriterion = CRITERION({ metric: 'peakInfectious', relation: 'less-than' });
    // Only the supporting metric declares a derivation — the primary (totalDeaths)
    // is undeclared, exactly like every pre-P2.1 case, and must decide the
    // verdict exactly as before: assessDeclaredDerivations() builds a
    // single-component assessment from the one declared metric, so the
    // aggregate classification here is that ONE component's own
    // (CONSISTENCY_CHECK), not a MIXED_TEST — there is nothing to mix.
    const record = caseWith(CRITERION(), {
      supportingCriteria: [supportingCriterion],
      observableDerivations: { peakInfectious: { prediction: MODEL_INVARIANT, observation: MODEL_INVARIANT } },
    });

    const conclusion = deriveDiscoveryConclusion(
      record,
      COMPARISON([
        { key: 'totalDeaths', baseline: 10, variant: 5 },
        { key: 'peakInfectious', baseline: 9, variant: 12 }, // declared FAILING — must not count
      ]),
      REPLAY,
    );

    expect(conclusion.primary?.tautologyClassification ?? null).toBeNull();
    expect(conclusion.verdict).toBe('SUPPORTED');
    expect(conclusion.tautologyAssessment?.classification).toBe('CONSISTENCY_CHECK');
    const supporting = conclusion.supporting.find((s) => s.metricKey === 'peakInfectious');
    expect(supporting?.tautologyClassification).toBe('CONSISTENCY_CHECK');
    expect(supporting?.met).toBe(false);
  });

  it('MIXED_TEST: an empirical primary still decides, but a tautologically-inert supporting criterion never downgrades the verdict', () => {
    const supportingCriterion = CRITERION({ metric: 'peakInfectious', relation: 'less-than' });
    const record = caseWith(CRITERION(), {
      supportingCriteria: [supportingCriterion],
      observableDerivations: {
        totalDeaths: { prediction: HYPOTHESIS_PARAM, observation: INDEPENDENT_MEASUREMENT },
        peakInfectious: { prediction: MODEL_INVARIANT, observation: MODEL_INVARIANT },
      },
    });

    // peakInfectious is declared FAILING (baseline 9 -> variant 12, "less-than" not met) —
    // if the tautological part could count, this would become PARTIALLY_SUPPORTED.
    const conclusion = deriveDiscoveryConclusion(
      record,
      COMPARISON([
        { key: 'totalDeaths', baseline: 10, variant: 5 },
        { key: 'peakInfectious', baseline: 9, variant: 12 },
      ]),
      REPLAY,
    );

    expect(conclusion.tautologyAssessment?.classification).toBe('MIXED_TEST');
    expect(conclusion.verdict).toBe('SUPPORTED');
    expect(conclusion.verdict).not.toBe('PARTIALLY_SUPPORTED');

    const inertSupporting = conclusion.supporting.find((s) => s.metricKey === 'peakInfectious');
    expect(inertSupporting?.tautologyClassification).toBe('CONSISTENCY_CHECK');
    expect(inertSupporting?.met).toBe(false);
    // Excluded from the failure count, but still visible, not silently dropped.
    expect(conclusion.basis.join(' ')).toMatch(/peakInfectious/);
    expect(conclusion.basis.join(' ')).toMatch(/Tautology Gate: MIXED_TEST/);
  });

  it('MIXED_TEST: a genuinely failing EMPIRICAL_TEST supporting criterion still downgrades to PARTIALLY_SUPPORTED', () => {
    const supportingCriterion = CRITERION({ metric: 'peakInfectious', relation: 'less-than' });
    const record = caseWith(CRITERION(), {
      supportingCriteria: [supportingCriterion],
      observableDerivations: {
        totalDeaths: { prediction: HYPOTHESIS_PARAM, observation: INDEPENDENT_MEASUREMENT },
        peakInfectious: { prediction: HYPOTHESIS_PARAM, observation: INDEPENDENT_MEASUREMENT },
      },
    });

    const conclusion = deriveDiscoveryConclusion(
      record,
      COMPARISON([
        { key: 'totalDeaths', baseline: 10, variant: 5 },
        { key: 'peakInfectious', baseline: 9, variant: 12 },
      ]),
      REPLAY,
    );

    expect(conclusion.tautologyAssessment?.classification).toBe('EMPIRICAL_TEST');
    expect(conclusion.verdict).toBe('PARTIALLY_SUPPORTED');
  });
});
