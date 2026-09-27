import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingOverlay } from '../components/OnboardingOverlay';

describe('first-run product introduction', () => {
  it('explains one complete scientific journey without teaching old module controls', () => {
    const html = renderToStaticMarkup(<OnboardingOverlay onFinish={vi.fn()} />);

    expect(html).toContain('ONE CHAT · ONE LABORATORY');
    for (const label of ['Pytanie', 'Laboratorium', 'Wynik', 'Evidence + replay']) {
      expect(html).toContain(label);
    }
    for (const truthLabel of ['LIVE COMPUTATIONAL', 'EDUCATIONAL MODEL', 'REAL OBSERVATION']) {
      expect(html).toContain(truthLabel);
    }
    expect(html).toContain('Wejdź do Laboratorium');
    expect(html).not.toContain('Przykładowy parametr');
    expect(html).not.toContain('Narrator AI');
  });
});
