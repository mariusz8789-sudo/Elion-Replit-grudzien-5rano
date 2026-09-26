import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../components/AppShell';

/** The shell renders without a DOM (no jsdom — `renderToStaticMarkup`) and keeps its navigation contract. */
describe('AppShell — chrome mounts without breaking the frame', () => {
  it('renders the route, the navigation and the HUD readout', () => {
    const html = renderToStaticMarkup(<AppShell><main id="x">ROUTE</main></AppShell>);
    expect(html).toContain('ROUTE');
    expect(html).toContain('class="shell"');
    expect(html).toContain('aria-label="Nawigacja Genesis"');
    expect(html).toContain('aria-label="Nawigacja Genesis (mobile)"');
    expect(html).toContain('data-testid="shell-hud"');
    expect(html).toContain('SYS · HOME');
    expect(html).not.toContain('holo-backdrop');
  });

  it('keeps the existing navigation contract intact (labels, planned badge, more-disclosure)', () => {
    const html = renderToStaticMarkup(<AppShell>x</AppShell>);
    expect(html).toContain('Tryb badawczy');
    expect(html).toContain('genesis-physics.com');
    expect(html).toContain('aria-current="page"');
  });
});
