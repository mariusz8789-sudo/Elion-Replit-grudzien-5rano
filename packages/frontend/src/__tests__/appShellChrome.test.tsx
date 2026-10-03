import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../components/AppShell';

/** The shell renders without a DOM (no jsdom — `renderToStaticMarkup`) and keeps its navigation contract. */
describe('AppShell — chrome mounts without breaking the frame', () => {
  it('renders the route, the desktop sidebar and the mobile tab bar', () => {
    const html = renderToStaticMarkup(<AppShell><main id="x">ROUTE</main></AppShell>);
    expect(html).toContain('ROUTE');
    expect(html).toContain('class="shell"');
    expect(html).toContain('aria-label="Nawigacja Genesis"');
    expect(html).toContain('aria-label="Nawigacja Genesis (mobile)"');
    expect(html).not.toContain('holo-backdrop');
    // No internal route enum in the chrome any more (the old "SYS · HOME" pill); server telemetry,
    // when the backend reports it, sits folded under "Stan serwera" as a technical detail.
    expect(html).not.toContain('SYS · ');
  });

  it('keeps the navigation contract: groups, the current page, More, search and collapse', () => {
    const html = renderToStaticMarkup(<AppShell>x</AppShell>);
    for (const group of ['Badania', 'Eksploruj', 'Dowody', 'Operacje', 'Rezultaty']) expect(html).toContain(group);
    expect(html).toContain('Więcej · wszystkie moduły');
    expect(html).toContain('genesis-physics.com');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-testid="nav-search"');
    expect(html).toContain('data-testid="nav-collapse"');
    expect(html).toContain('data-testid="mobile-more"');
    expect(html).toContain('aria-controls="genesis-explorer"');
    // Group headers fold and say so; the explorer opens as a dialog.
    expect(html).toContain('aria-expanded="true" aria-controls="gn-group-research"');
    expect(html).toContain('aria-haspopup="dialog"');
    // Places are real links to real routes.
    expect(html).toContain('href="#/flight-control"');
    expect(html).toContain('href="#/verify"');
  });

  it('the mobile tab bar holds Start, Zapytaj, Przebiegi, Dowody and Więcej', () => {
    const html = renderToStaticMarkup(<AppShell>x</AppShell>);
    const bar = html.slice(html.indexOf('data-testid="mobile-navigation"'), html.indexOf('</nav>', html.indexOf('data-testid="mobile-navigation"')));
    const labels = [...bar.matchAll(/class="gn-label">([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual(['Start', 'Zapytaj', 'Przebiegi', 'Dowody', 'Więcej']);
  });
});
