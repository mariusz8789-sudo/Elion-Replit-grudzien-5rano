import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComparisonPanel } from '../components/looking-glass/ComparisonPanel';
import type { ScenarioComparisonView } from '../core/lookingGlass/scenarioComparison';

const READY: ScenarioComparisonView = {
  status: 'READY',
  baselineLabel: 'Baza — brak interwencji',
  variantLabel: 'Izolacja objawowych',
  changedFactors: ['isolate'],
  metrics: [{ key: 'totalDeaths', baseline: 8, variant: 0, absoluteDelta: -8, relativeDeltaPercent: -100 }],
  message: 'ok',
  producedBy: 'scenarioEngine.compareScenarios(BASELINE, ISOLATION)',
};

const BLOCKED: ScenarioComparisonView = {
  status: 'BLOCKED_NOT_COMPARABLE',
  baselineLabel: 'growthRate', variantLabel: 'growthRate',
  changedFactors: [], metrics: [],
  message: 'Uporządkowanie nie jest rozstrzygające.',
  producedBy: 'hypothesisLoop.discrimination(x)',
};

describe('ComparisonPanel — renders only what is real', () => {
  it('renders nothing when there is no comparison and none was requested', () => {
    const markup = renderToStaticMarkup(<ComparisonPanel comparison={null} requestedButMissing={false} />);
    expect(markup).toBe('');
  });

  it('says a comparison was requested but nothing exists to compare, rather than staying silent', () => {
    const markup = renderToStaticMarkup(<ComparisonPanel comparison={null} requestedButMissing />);
    expect(markup).toMatch(/nie ma z czym porównać/);
  });

  it('renders real metrics and the exact producing call for a READY comparison', () => {
    const markup = renderToStaticMarkup(<ComparisonPanel comparison={READY} requestedButMissing />);
    expect(markup).toContain('Baza — brak interwencji');
    expect(markup).toContain('Izolacja objawowych');
    expect(markup).toContain('totalDeaths');
    expect(markup).toContain('8.00');
    expect(markup).toContain('scenarioEngine.compareScenarios(BASELINE, ISOLATION)');
  });

  it('renders the engine refusal message for a blocked comparison, never a fabricated metric', () => {
    const markup = renderToStaticMarkup(<ComparisonPanel comparison={BLOCKED} requestedButMissing />);
    expect(markup).toContain('Uporządkowanie nie jest rozstrzygające.');
    expect(markup).not.toContain('<table');
  });
});
