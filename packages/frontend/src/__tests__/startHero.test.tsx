import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * D-118 — Start: one question box, three doors, a status strip with real
 * reads only. Rendered statically (no DOM environment here), so effects do
 * not run: the strip shows the "checking" state and the Science Memory count
 * the store really returns.
 */
describe('StartHero', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('renders the question box, the three doors and the status strip', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }, location: { hash: '' } });
    const { StartHero } = await import('../components/StartHero');
    const html = renderToStaticMarkup(<StartHero />);
    expect(html).toContain('data-testid="start-hero"');
    expect(html).toContain('class="start-ask-input"');
    for (const id of ['door-ask', 'door-discover', 'door-worlds']) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toContain('href="#/research-console"');
    expect(html).toContain('href="#/worlds"');
    expect(html).toContain('zapisanych przebiegów');
    expect(html).toContain('sprawdzanie…'); // effects do not run statically: the honest pre-fetch state
    expect(html).not.toContain('undefined');
  });
});
