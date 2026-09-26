import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextualRouteGuide } from '../components/guide/ContextualRouteGuide';
import { contextualGuideSteps, type ContextualGuideSurface } from '../core/guide/contextualGuideContent';

const SURFACES: readonly ContextualGuideSurface[] = [
  'CERN', 'CYBER', 'GOVERNMENT', 'MIRROR', 'WORLD_DIRECTOR', 'VIRTUAL_LAB', 'CAMPAIGN', 'HUMAN_EXPLORER',
];

describe('contextual product guide', () => {
  it('has truthful, bilingual guidance for every high-value product surface', () => {
    for (const surface of SURFACES) {
      const steps = contextualGuideSteps(surface);
      expect(steps.length).toBeGreaterThanOrEqual(2);
      for (const step of steps) {
        expect(step.pl.trim()).not.toBe('');
        expect(step.en.trim()).not.toBe('');
        expect(step.plainPl.trim()).not.toBe('');
        expect(step.plainEn.trim()).not.toBe('');
      }
    }
  });

  it('keeps CERN honest about the educational model and points to separate real CMS data', () => {
    const text = contextualGuideSteps('CERN').map((step) => step.pl).join(' ');
    expect(text).toContain('TOY_MC_MODEL');
    expect(text).toContain('REAL CMS DATA');
    expect(text).toContain('Nie jest to transmisja');
  });

  it('keeps computational, physical and patient claims separated', () => {
    expect(contextualGuideSteps('CAMPAIGN').map((step) => step.pl).join(' ')).toContain('in silico');
    expect(contextualGuideSteps('VIRTUAL_LAB').map((step) => step.pl).join(' ').toLowerCase()).toContain('nie oznacza fizycznego pomiaru');
    expect(contextualGuideSteps('HUMAN_EXPLORER').map((step) => step.pl).join(' ')).toContain('Nie przedstawia anatomii konkretnego pacjenta');
    expect(contextualGuideSteps('GOVERNMENT').map((step) => step.pl).join(' ')).toContain('nie rekomendacją refundacyjną');
  });

  it('renders one opt-in launcher and does not speak automatically', () => {
    const html = renderToStaticMarkup(<ContextualRouteGuide surface="WORLD_DIRECTOR" />);
    expect(html).toContain('data-testid="context-guide-start"');
    expect(html).toContain('Uruchom przewodnika');
    expect(html).not.toContain('data-testid="context-guide-caption"');
  });

  it('renders nothing outside supported product surfaces', () => {
    expect(renderToStaticMarkup(<ContextualRouteGuide surface={null} />)).toBe('');
  });
});
