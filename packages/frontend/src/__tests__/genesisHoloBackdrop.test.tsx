import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../components/AppShell';
import { GenesisHoloBackdrop, mountHoloBackdrop, shouldAnimate } from '../components/GenesisHoloBackdrop';
import { SUPPRESSED_ROUTES } from '../components/MatrixDataStream';

/**
 * The 2040 shell's ambient 3D layer is decoration, and decoration has exactly
 * two obligations: never break the app, and never steal frame budget where it
 * is not wanted. This repo's component tests run without a DOM (no jsdom —
 * `renderToStaticMarkup`), which is the harshest environment the layer can
 * meet, so that is where it is proven safe: no window, no WebGL, no throw.
 */

/** A canvas-shaped object with NO WebGL — what jsdom, a blocked GPU or a
 *  headless environment hands three.js. */
function canvasWithoutWebGL(): HTMLCanvasElement {
  return {
    width: 300, height: 150, style: {},
    getContext: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    ownerDocument: { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined },
  } as unknown as HTMLCanvasElement;
}

const fakeWindow = {
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
  location: { hash: '#/' },
  matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
} as unknown as Window & typeof globalThis;

describe('GenesisHoloBackdrop — frame-budget policy (shouldAnimate)', () => {
  it('runs only when the tab is visible, motion is allowed and the route is not a heavy-3D one', () => {
    expect(shouldAnimate({ hidden: false, reducedMotion: false, hash: '#/' })).toBe(true);
    expect(shouldAnimate({ hidden: false, reducedMotion: false, hash: '#/settings' })).toBe(true);
    expect(shouldAnimate({ hidden: true, reducedMotion: false, hash: '#/' })).toBe(false);
    expect(shouldAnimate({ hidden: false, reducedMotion: true, hash: '#/' })).toBe(false);
  });

  it('reuses the exact MatrixDataStream suppression list rather than a second copy of it', () => {
    for (const route of SUPPRESSED_ROUTES) {
      expect(shouldAnimate({ hidden: false, reducedMotion: false, hash: route }), route).toBe(false);
      expect(shouldAnimate({ hidden: false, reducedMotion: false, hash: `${route}?x=1` }), `${route}?x=1`).toBe(false);
    }
    expect(shouldAnimate({ hidden: false, reducedMotion: false, hash: '#/lab/pendulum' })).toBe(false);
  });
});

describe('GenesisHoloBackdrop — safe without WebGL / without a DOM', () => {
  it('returns null (allocating nothing, throwing nothing) when no WebGL renderer can be created', () => {
    expect(mountHoloBackdrop(canvasWithoutWebGL(), fakeWindow)).toBeNull();
    // A canvas with no getContext at all (the jsdom shape) must be just as safe.
    const bare = { style: {}, ownerDocument: {} } as unknown as HTMLCanvasElement;
    expect(mountHoloBackdrop(bare, fakeWindow)).toBeNull();
  });

  it('renders as an inert, aria-hidden, pointer-transparent canvas in static markup', () => {
    const html = renderToStaticMarkup(<GenesisHoloBackdrop />);
    expect(html).toContain('class="holo-backdrop"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-testid="holo-backdrop"');
  });
});

describe('AppShell — 2040 chrome mounts without breaking the frame', () => {
  it('renders the route, the navigation and the HUD readout; the lazy backdrop suspends to nothing', () => {
    const html = renderToStaticMarkup(<AppShell><main id="x">ROUTE</main></AppShell>);
    expect(html).toContain('ROUTE');
    expect(html).toContain('class="shell"');
    expect(html).toContain('aria-label="Nawigacja Genesis"');
    expect(html).toContain('aria-label="Nawigacja Genesis (mobile)"');
    expect(html).toContain('data-testid="shell-hud"');
    expect(html).toContain('SYS · HOME');
    // No DOM here: the backdrop's Suspense boundary must fall back to nothing
    // instead of throwing out of the whole shell.
    expect(html).not.toContain('holo-backdrop');
  });

  it('keeps the existing navigation contract intact (labels, planned badge, more-disclosure)', () => {
    const html = renderToStaticMarkup(<AppShell>x</AppShell>);
    expect(html).toContain('Wszystkie moduły');
    expect(html).toContain('genesis-physics.com');
    expect(html).toContain('aria-current="page"');
  });
});
