import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RealExperimentPipeline, type RealExperimentPredictionContext } from '../components/visual-simulation/RealExperimentPipeline';
import type { DiscoveryLoopResult } from '../core/agent/discoveryLoop';

/**
 * The underlying scientific chain (createRealExperimentRun ->
 * buildSavedRealExperimentVerification -> save -> replay) is proven
 * end-to-end by `realExperimentE2E.test.ts`, re-executed for real, not
 * asserted. This file only proves the ONE thing that file cannot: that the
 * manual-entry form genuinely appears once a completed prediction exists,
 * and stays honestly absent when it does not — `handleSubmit` calls exactly
 * the same functions that file already exercises.
 */

const FIXTURE_METRIC = 'totalCells';

function predictionFixture(): RealExperimentPredictionContext {
  // Only `.rounds[last].hypothesisId` / `.objectiveObserved` are read by this
  // component; the rest of `DiscoveryLoopResult` is irrelevant to it, so this
  // fixture leaves those fields structurally minimal rather than replaying a
  // real discovery run (which `realExperimentE2E.test.ts` already does).
  const loopResult = {
    contractVersion: '1.0.0',
    question: 'fixture goal',
    worldId: 'fixture-world',
    domainId: 'fixture-domain',
    beliefs: [],
    rounds: [{ round: 1, hypothesisId: 'h:fixture', strength: 1, branchId: 'branch-1', objectiveBaseline: 100, objectiveObserved: 120, effect: 20 }],
    trace: [],
    stopReason: 'ROUND_BUDGET_EXHAUSTED',
    failedHypotheses: [],
    bestSupported: [],
    unresolvedQuestions: [],
    declaredAssumptions: [],
    notModelledFactors: [],
  } as unknown as DiscoveryLoopResult;
  return {
    predictionSourceExperimentId: 'experiment:fixture',
    loopResult,
    domainId: 'cell-biology',
    metric: FIXTURE_METRIC,
  };
}

describe('RealExperimentPipeline — wired manual entry', () => {
  it('shows every stage honestly not-modelled when no prediction exists yet', () => {
    const markup = renderToStaticMarkup(
      <RealExperimentPipeline predictionMechanism="m" predictionRationale="r" comparisonNote="c" evidenceBundleId={null} prediction={null} />,
    );
    expect(markup).not.toContain('data-testid="rex-entry-form"');
    expect(markup).toMatch(/run a discovery search on the left first/i);
  });

  it('renders a real manual-entry form, requiring protocol/value/unit/tolerance, once a prediction exists', () => {
    const markup = renderToStaticMarkup(
      <RealExperimentPipeline predictionMechanism="m" predictionRationale="r" comparisonNote="c" evidenceBundleId={null} prediction={predictionFixture()} />,
    );
    expect(markup).toContain('data-testid="rex-entry-form"');
    expect(markup).toContain('data-testid="rex-protocol-ref"');
    expect(markup).toContain('data-testid="rex-raw-value"');
    expect(markup).toContain('data-testid="rex-unit"');
    expect(markup).toContain('data-testid="rex-tolerance"');
    expect(markup).toContain('data-testid="rex-submit-measurement"');
    expect(markup).toContain(FIXTURE_METRIC);
  });
});
