import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClockworkDashboard } from '../components/ClockworkDashboard';

/**
 * The clerk's dashboard, rendered with no browser storage: the register is
 * empty and the screen must SAY so rather than plant sample cases. The
 * engine still runs (through the single kernel) and reports zero counts.
 */
describe('ClockworkDashboard — empty office looks empty, engine still live', () => {
  const html = renderToStaticMarkup(<ClockworkDashboard />);
  it('renders the two statutory groups, both empty, with their legal basis', () => {
    expect(html).toContain('Sprawy KPA');
    expect(html).toContain('art. 35 §3 · art. 36 · art. 57 KPA');
    expect(html).toContain('Wnioski o informację publiczną');
    expect(html).toContain('art. 13 UDIP');
    expect((html.match(/Brak spraw w tej grupie/g) ?? []).length).toBe(2);
    expect(html).not.toContain('cw-case-');
  });
  it('shows the live engine summary with zero counts and its honesty label, no error', () => {
    expect(html).toContain('PO TERMINIE 0');
    expect(html).toContain('ZBLIŻA SIĘ 0');
    expect(html).toContain('DETERMINISTIC_CALENDAR_MODEL');
    expect(html).not.toContain('Silnik CLOCKWORK niedostępny');
  });
  it('offers the add-case form and no inspection panel until a case is selected', () => {
    expect(html).toContain('data-testid="cw-new-submit"');
    expect(html).toContain('KPA — sprawa zwykła · art. 35 §3 KPA · 1 miesiąc');
    expect(html).not.toContain('data-testid="cw-inspect"');
  });
});
