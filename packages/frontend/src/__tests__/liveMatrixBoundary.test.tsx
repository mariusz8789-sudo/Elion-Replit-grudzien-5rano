import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import LiveMatrixBackground from '../components/liveMatrix/LiveMatrixBackground';

/**
 * LIVE MATRIX — the two claims that are about the component's PLACE in the
 * codebase rather than its behaviour:
 *
 * 1. it renders at all (which is where the v1 prototype crashed), and
 * 2. it is genuinely standalone — no Genesis import, in either direction.
 *
 * This repo has no DOM test environment, so `renderToStaticMarkup` is the
 * available depth here: effects do not run, so nothing about the animation
 * lifecycle is asserted in this file. That is deliberate and complete rather
 * than a gap — the lifecycle is tested directly and far more thoroughly
 * against `MatrixController` in `liveMatrixController.test.ts`, which is the
 * whole reason it was extracted out of the component.
 */

const COMPONENT_DIR = join(process.cwd(), 'src', 'components', 'liveMatrix');

function readOrNull(file: string): string | null {
  try { return readFileSync(file, 'utf8'); } catch { return null; }
}

/**
 * Comments are stripped before every "does this file name X" check in this
 * file, on purpose and in both directions. `genesisVisualState.ts` has to be
 * able to say "this must never take a SavedExperiment" without that sentence
 * tripping the Genesis check, and `App.tsx` has to be able to explain WHY the
 * background drops to the LOW tier ("no glow blur, lower device-pixel-ratio
 * cap — matrixEngine.ts::QUALITY") without that citation reading as App.tsx
 * importing the engine. Both rules are about what the code touches, not about
 * which words the rationale is allowed to use.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return filesIn(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

describe('LiveMatrixBackground renders', () => {
  /**
   * REGRESSION — the v1 prototype destructured `useRef` as if it were
   * `useState`: `const [a, setA] = useRef<T | null>(null)`. `useRef` returns
   * `{ current }`, which is not iterable, so this threw
   * `TypeError: ... is not iterable` during RENDER — the component could never
   * mount at all. Proven by execution during the audit, and caught here.
   */
  it('renders without throwing — a render-time crash is the one failure no amount of lifecycle care survives', () => {
    expect(() => renderToStaticMarkup(<LiveMatrixBackground />)).not.toThrow();
  });

  it('renders a canvas inside a decorative, non-interactive container', () => {
    const html = renderToStaticMarkup(<LiveMatrixBackground />);
    expect(html).toContain('<canvas');
    expect(html).toContain('aria-hidden="true"');   // never announced to a screen reader
    expect(html).toContain('pointer-events:none');  // never steals a click from the UI above it
  });

  it('accepts every documented prop without throwing, including hostile values', () => {
    expect(() => renderToStaticMarkup(
      <LiveMatrixBackground activity={4} density="HIGH" speed="LOW" glow="HIGH" quality="LOW" seed={0} reducedMotion />,
    )).not.toThrow();
    expect(() => renderToStaticMarkup(<LiveMatrixBackground intensity={0.5} />)).not.toThrow();
  });

  it('honours a caller-supplied className and style override', () => {
    const html = renderToStaticMarkup(<LiveMatrixBackground className="bg-layer" style={{ zIndex: -1 }} />);
    expect(html).toContain('class="bg-layer"');
    expect(html).toContain('z-index:-1');
  });
});

describe('the component is standalone — the dependency arrow points one way', () => {
  /**
   * The architecture claim is `Genesis → adapter → LiveMatrixBackground`, so
   * nothing in this directory may import Genesis. Asserted by scanning the
   * real files rather than by convention, because a convention nobody checks
   * is how a "standalone" component quietly grows a dependency on a store.
   */
  it('no file under components/liveMatrix imports anything outside its own directory except React', () => {
    const offenders: string[] = [];
    for (const file of filesIn(COMPONENT_DIR)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
        const specifier = match[1]!;
        const isReact = specifier === 'react' || specifier.startsWith('react/') || specifier.startsWith('react-dom');
        const isSibling = specifier.startsWith('./');
        if (!isReact && !isSibling) offenders.push(`${file.replace(process.cwd(), '')} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('names no Genesis domain concept in CODE — prose explaining the boundary is allowed, using it is not', () => {
    const forbidden = /scienceMemory|SavedExperiment|hypothesisLoop|HypothesisAssessment|experimentFabric|crossDomainSynthesis/;
    for (const file of filesIn(COMPONENT_DIR)) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(forbidden.test(code), `${file} references Genesis internals in code`).toBe(false);
    }
  });

  /**
   * Integration happened (App.tsx now mounts `LiveMatrixBackground`) — the
   * boundary this test now protects is HOW: only through the adapter, never
   * by an app file reaching past it into `matrixEngine`/`matrixController`
   * directly, which would let Genesis-side code start hand-rolling the
   * translation `genesisVisualState.ts` exists to own exclusively.
   */
  it('the app wires the component only through the genesisVisualState adapter, never around it', () => {
    const appFiles = [join(process.cwd(), 'src', 'App.tsx'), join(process.cwd(), 'src', 'main.tsx')];
    let mountedSomewhere = false;
    for (const file of appFiles) {
      const raw = readOrNull(file);
      if (raw === null) continue;
      const source = stripComments(raw);
      if (!source.includes('liveMatrix')) continue;
      mountedSomewhere = true;
      expect(source.includes('genesisVisualState'), `${file} mounts liveMatrix without going through genesisVisualState`).toBe(true);
      expect(source.includes('matrixEngine'), `${file} reaches past the adapter into matrixEngine directly`).toBe(false);
      expect(source.includes('matrixController'), `${file} reaches past the adapter into matrixController directly`).toBe(false);
    }
    expect(mountedSomewhere, 'expected at least one app file to mount the background').toBe(true);
  });

  /**
   * MEASURED DECISION, not a preference: the background used to be unmounted
   * entirely on heavy-3D routes. On #/genesis-world the 3D canvas measures
   * 1200x750 inside a 1440x900 viewport — 69% — so unmounting blanked the
   * remaining 31% (sidebar, title strip, description block, margins) where
   * the field is genuinely visible. The real constraint there is the frame
   * budget, because a second rAF loop runs beside the 3D scene's own, and
   * that is what the LOW quality tier is for. Reverting to a conditional
   * mount would silently throw that third of the screen away again.
   */
  it('heavy-3D routes tier the background down to LOW quality rather than unmounting it', () => {
    const app = readOrNull(join(process.cwd(), 'src', 'App.tsx'));
    expect(app).not.toBeNull();
    expect(app!).toMatch(/quality=\{[^}]*\?\s*'LOW'\s*:\s*'HIGH'\}/);
    // No conditional-render guard wrapping the background any more.
    expect(app!).not.toMatch(/\{\s*!\w*[Ss]uppressed\w*\s*&&\s*\(/);
  });
});
