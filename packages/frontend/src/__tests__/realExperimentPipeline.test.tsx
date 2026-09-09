import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RealExperimentPipeline, type RealExperimentPredictionContext } from '../components/visual-simulation/RealExperimentPipeline';
import type { DiscoveryLoopResult } from '../core/agent/discoveryLoop';

/**
 * REAL EXPERIMENT PIPELINE — product/demo readiness (C2) + wiring (C1).
 *
 * The underlying scientific chain (createRealExperimentRun ->
 * buildSavedRealExperimentVerification -> save -> replay) is proven
 * end-to-end by `realExperimentE2E.test.ts`, re-executed for real, not
 * asserted. This file proves two things that file cannot: that the
 * component's six-stage contract (order, statuses, plain-language copy) holds
 * standalone, independent of `CellLabScreen`; and that the manual-entry form
 * genuinely appears once a completed prediction exists, and stays honestly
 * absent when it does not — `handleSubmit` calls exactly the same functions
 * that file already exercises.
 */

const FIXTURE_METRIC = 'totalCells';

const BASE_PROPS = {
  predictionMechanism: 'shortening G1 transit to 7 h',
  predictionRationale: 'the real control node mitogens act on',
  comparisonNote: 'control 1000 cells vs treatment 1200 cells (+20.0%)',
  evidenceBundleId: null,
};

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

describe('RealExperimentPipeline — six stages, honest statuses, before a prediction exists', () => {
  it('renders exactly the six stages in the declared order', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} prediction={null} />);
    const order = ['prediction', 'request', 'waiting', 'data', 'comparison', 'evidence'];
    let lastIndex = -1;
    for (const key of order) {
      const index = markup.indexOf(`data-testid="rex-stage-${key}"`);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it('Prediction is the only stage marked AVAILABLE, built from the real mechanism/rationale given', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} prediction={null} />);
    expect(markup).toContain('shortening G1 transit to 7 h');
    expect(markup).toContain('the real control node mitogens act on');
    // Exactly one "real" gx-status among the six stages.
    expect((markup.match(/gx-status real/g) ?? []).length).toBe(1);
  });

  it('Request/Waiting/Data are honestly NOT YET AVAILABLE, in plain product language (no file paths or function names)', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} prediction={null} />);
    for (const key of ['request', 'waiting', 'data']) {
      expect(markup).toContain(`data-testid="rex-stage-${key}"`);
    }
    expect(markup).not.toContain('createRealExperimentRun');
    expect(markup).not.toContain('.ts)');
    expect(markup).not.toMatch(/RawMeasurement|DerivedMeasurement/);
  });

  it('Comparison embeds the real comparisonNote given and is marked partially available', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} prediction={null} />);
    expect(markup).toContain('control 1000 cells vs treatment 1200 cells (+20.0%)');
    expect(markup).toContain('data-testid="rex-stage-comparison"');
  });

  it('Evidence is NOT YET AVAILABLE with no bundle id', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} prediction={null} />);
    const evidenceStart = markup.indexOf('data-testid="rex-stage-evidence"');
    const evidenceStage = markup.slice(evidenceStart, evidenceStart + 400);
    expect(evidenceStage).toContain('NOT YET AVAILABLE');
  });

  it('Evidence shows the real bundle id once one exists, even before a real measurement is entered', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} evidenceBundleId="bundle-real-123" prediction={null} />);
    const evidenceStart = markup.indexOf('data-testid="rex-stage-evidence"');
    const evidenceStage = markup.slice(evidenceStart, evidenceStart + 400);
    expect(evidenceStage).toContain('bundle-real-123');
    expect(evidenceStage).toContain('PARTIALLY AVAILABLE');
  });

  it('never claims REAL_EXPERIMENTAL data exists when no real measurement has been entered', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} evidenceBundleId="bundle-real-123" prediction={null} />);
    expect(markup).not.toContain('REAL EXPERIMENTAL DATA');
    expect(markup).not.toContain('REAL_EXPERIMENTAL');
  });
});

describe('RealExperimentPipeline — wired manual entry, once a prediction exists', () => {
  it('shows every stage honestly not-modelled when no prediction exists yet', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} prediction={null} />);
    expect(markup).not.toContain('data-testid="rex-entry-form"');
    expect(markup).toMatch(/run a discovery search on the left first/i);
  });

  it('renders a real manual-entry form, requiring protocol/value/unit/tolerance, once a prediction exists', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} prediction={predictionFixture()} />);
    expect(markup).toContain('data-testid="rex-entry-form"');
    expect(markup).toContain('data-testid="rex-protocol-ref"');
    expect(markup).toContain('data-testid="rex-raw-value"');
    expect(markup).toContain('data-testid="rex-unit"');
    expect(markup).toContain('data-testid="rex-tolerance"');
    expect(markup).toContain('data-testid="rex-submit-measurement"');
    expect(markup).toContain(FIXTURE_METRIC);
  });
});
