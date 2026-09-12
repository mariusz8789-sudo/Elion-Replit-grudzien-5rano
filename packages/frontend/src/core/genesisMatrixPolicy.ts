import type { GenesisVisualState } from '../components/liveMatrix/genesisVisualState';

/**
 * GENESIS → MATRIX BACKGROUND POLICY — the ONE place that decides what the
 * live Matrix background (`components/liveMatrix/LiveMatrixBackground.tsx`)
 * should look like for the app's current route.
 *
 * Deliberately NOT a second config store: it reuses the EXISTING
 * `GenesisVisualState`/`toMatrixConfig` adapter contract (liveMatrix/
 * genesisVisualState.ts) and the EXISTING `hasActiveSim()` signal
 * (core/activeSimControls.ts, already used for the Space/R keyboard
 * shortcuts) as its only two inputs. `routeKind` is accepted as a plain
 * string rather than App.tsx's own `Route` union to avoid a circular import
 * between this module and App.tsx — `genesisMatrixPolicy.test.ts` imports
 * App.tsx's real route table and asserts every literal below still matches
 * one of its `Route['kind']` values, so the two cannot silently drift apart.
 */

/**
 * Routes that already own a full-viewport, continuously-rendering Three.js/
 * WebGL scene (found by grepping `components/` for `useThreeLoop`/
 * `WebGLRenderer` imports — see genesisMatrixPolicy.test.ts for the same
 * search run as a regression check). Matrix STAYS MOUNTED AND VISIBLE here
 * too — most of these screens' own opaque 3D canvas already covers the
 * viewport, so Matrix is naturally only visible at the screen's own margins
 * (header strips, empty space), never competing with the 3D content itself.
 * What this list actually controls is COST, not visibility: LOW quality/
 * density here means fewer streams/particles, zero glow blur and a lower
 * device-pixel-ratio cap (liveMatrix/matrixEngine.ts::QUALITY), so the two
 * independent rAF loops (Matrix's and the 3D scene's) share the frame
 * budget safely instead of the decoration taxing the solver.
 */
export const MATRIX_HEAVY_3D_ROUTES: ReadonlySet<string> = new Set([
  'lab', 'city3d', 'scientific-city', 'hf-slice', 'first-person-lab',
  'investor-demo', 'character', 'genesis-world', 'molecule',
]);

/**
 * One fixed seed for the whole app: `LiveMatrixBackground` mounts once
 * (see App.tsx) and lives for the app's whole lifetime, so there is nothing
 * to keep visually stable ACROSS mounts — a single constant seed is simply
 * the deterministic field layout `matrixEngine.ts` already guarantees for
 * any fixed `(seed)`, not a second determinism mechanism.
 */
const APP_MATRIX_SEED = 190107;

/**
 * The whole policy: a pure, total function from (route, real activity signal)
 * to the visual vocabulary `toMatrixConfig` already knows how to render.
 * `hasActiveSim` is the one piece of REAL Genesis state this depends on —
 * an experiment session actually open and registered, not a guess.
 */
export function deriveMatrixVisualState(routeKind: string, hasActiveSim: boolean): GenesisVisualState {
  const heavy3D = MATRIX_HEAVY_3D_ROUTES.has(routeKind);
  const activity: GenesisVisualState['activity'] = hasActiveSim
    ? 'RUNNING'
    : routeKind === 'home'
      ? 'ACTIVE'
      : 'RESEARCH';
  return {
    activity,
    intensity: heavy3D ? 0.22 : 0.55,
    quality: heavy3D ? 'LOW' : 'HIGH',
    seed: APP_MATRIX_SEED,
  };
}
