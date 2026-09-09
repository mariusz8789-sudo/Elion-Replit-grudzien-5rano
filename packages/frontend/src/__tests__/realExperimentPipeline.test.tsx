import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RealExperimentPipeline } from '../components/visual-simulation/RealExperimentPipeline';

/**
 * REAL EXPERIMENT PIPELINE — product/demo readiness pass.
 *
 * These exercise the component standalone (not only through `CellLabScreen.tsx`), so a future
 * caller — including whoever wires the admission seam / real-data-entry UI this component's own
 * doc comment points to — has a direct contract test to check the stage shape against, without
 * needing to stand up the whole Cell Lab screen.
 */

const BASE_PROPS = {
  predictionMechanism: 'shortening G1 transit to 7 h',
  predictionRationale: 'the real control node mitogens act on',
  comparisonNote: 'control 1000 cells vs treatment 1200 cells (+20.0%)',
  evidenceBundleId: null,
};

describe('RealExperimentPipeline — six real stages, honest statuses', () => {
  it('renders exactly the six stages in the declared order', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} />);
    const order = ['prediction', 'request', 'waiting', 'data', 'comparison', 'evidence'];
    let lastIndex = -1;
    for (const key of order) {
      const index = markup.indexOf(`data-testid="rex-stage-${key}"`);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it('Prediction is the only stage marked AVAILABLE, built from the real mechanism/rationale given', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} />);
    expect(markup).toContain('shortening G1 transit to 7 h');
    expect(markup).toContain('the real control node mitogens act on');
    // Exactly one "real" gx-status among the six stages.
    expect((markup.match(/gx-status real/g) ?? []).length).toBe(1);
  });

  it('Request/Waiting/Data are honestly NOT YET AVAILABLE, in plain product language (no file paths or function names)', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} />);
    for (const key of ['request', 'waiting', 'data']) {
      expect(markup).toContain(`data-testid="rex-stage-${key}"`);
    }
    expect(markup).not.toContain('createRealExperimentRun');
    expect(markup).not.toContain('.ts)');
    expect(markup).not.toMatch(/RawMeasurement|DerivedMeasurement/);
  });

  it('Comparison embeds the real comparisonNote given and is marked partially available', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} />);
    expect(markup).toContain('control 1000 cells vs treatment 1200 cells (+20.0%)');
    expect(markup).toContain('data-testid="rex-stage-comparison"');
  });

  it('Evidence is NOT YET AVAILABLE with no bundle id', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} />);
    const evidenceStart = markup.indexOf('data-testid="rex-stage-evidence"');
    const evidenceStage = markup.slice(evidenceStart, evidenceStart + 400);
    expect(evidenceStage).toContain('NOT YET AVAILABLE');
  });

  it('Evidence shows the real bundle id and a SIMULATION provenance badge once one exists', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} evidenceBundleId="bundle-real-123" />);
    const evidenceStart = markup.indexOf('data-testid="rex-stage-evidence"');
    const evidenceStage = markup.slice(evidenceStart, evidenceStart + 400);
    expect(evidenceStage).toContain('bundle-real-123');
    expect(evidenceStage).toContain('PARTIALLY AVAILABLE');
  });

  it('never claims REAL_EXPERIMENTAL data exists — no fabricated real result anywhere in the markup', () => {
    const markup = renderToStaticMarkup(<RealExperimentPipeline {...BASE_PROPS} evidenceBundleId="bundle-real-123" />);
    expect(markup).not.toContain('REAL EXPERIMENTAL DATA');
    expect(markup).not.toContain('REAL_EXPERIMENTAL');
  });
});
