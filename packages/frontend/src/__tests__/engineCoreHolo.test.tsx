import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FRONTEND_SRC } from './fixtures/repoPaths';

/**
 * ENGINE CORE HOLO — the decorative three.js core beside the Start headline.
 * No DOM environment is installed in this workspace, so the WebGL mount path
 * is exercised by the Playwright screenshot run; here we pin the contracts a
 * DOM-less render CAN prove: it is aria-hidden, it never imports three.js
 * eagerly, it refuses to start without WebGL, and StartHero keeps it off the
 * static render (tests/SSR) entirely.
 */
describe('EngineCoreHolo', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('renders an aria-hidden host with a canvas and nothing else', async () => {
    const { EngineCoreHolo } = await import('../components/holo/EngineCoreHolo');
    const html = renderToStaticMarkup(<EngineCoreHolo />);
    expect(html).toContain('data-testid="engine-core-holo"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<canvas');
    expect(html).not.toMatch(/undefined|NaN/);
  });

  it('imports three.js only dynamically (the Start route must not pay for it up front)', () => {
    const source = readFileSync(join(FRONTEND_SRC, 'components', 'holo', 'EngineCoreHolo.tsx'), 'utf8');
    expect(source).toMatch(/import\('three'\)/);
    expect(source).not.toMatch(/^import\s+(\*\s+as\s+\w+|\{[^}]*\}|\w+)\s+from\s+'three'/m);
  });

  it('refuses to start where no WebGL context can be created (guard runs before any three.js import)', async () => {
    const getContext = vi.fn(() => null);
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('document', { createElement: () => ({ getContext }), hidden: false });
    const { canUseWebGL } = await import('../components/holo/EngineCoreHolo');
    expect(canUseWebGL()).toBe(false);
    expect(getContext).toHaveBeenCalled();
    vi.stubGlobal('document', { createElement: () => { throw new Error('no canvas here'); } });
    expect(canUseWebGL()).toBe(false);
  });

  it('StartHero keeps the holo well in the markup but mounts the WebGL scene only after effects run', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }, location: { hash: '' } });
    const { StartHero } = await import('../components/StartHero');
    const html = renderToStaticMarkup(<StartHero />);
    expect(html).toContain('class="start-holo"');
    expect(html).not.toContain('engine-core-holo'); // effects do not run statically: no canvas, no three.js
  });
});
