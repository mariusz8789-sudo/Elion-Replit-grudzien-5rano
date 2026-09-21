import { useEffect, useMemo, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { TemporalCinematicSim3D } from '../../core/temporalCinematic/temporalCinematicSim3D';
import { buildHistoricalScene, type HistoricalScene } from '../../core/temporalCinematic/temporalCinematicEngine';
import type { CameraPath } from '../../core/temporalCinematic/cameraPath';
import type { SimParams } from '../../core/types';

/**
 * TEMPORAL CINEMATIC ENGINE — REAL BROWSER ENTRY POINT.
 *
 * The concrete gap this closes (see `renderRuntimeStatus.ts`'s own honest
 * accounting, written BEFORE this file existed): "a historical scene from
 * this module cannot reach the real WorldFrameRenderer canvas without [UI]
 * wiring." This is that wiring — a minimal, additive screen, not a rewrite
 * of `GenesisWorldScreen.tsx` (whose ~2000 lines are deeply specific to
 * `buildGenesisScientificCity4`'s hospital/floodplain/pump fixtures; bolting
 * an arbitrary `WorldSpecification` onto it safely is a separate, much
 * larger task than proving the temporal-cinematic path end to end). This
 * screen reuses the exact same canonical stack that one does
 * (`useThreeLoop`, the `Sim3D` contract, `WorldFrameRenderer` via
 * `TemporalCinematicSim3D`) — no second renderer, no second WebGL harness.
 *
 * URL CONTRACT (hash query string, e.g.
 * `#/temporal-cinematic?place=Warsaw&year=1900&duration=5&road=0`):
 *   place    - required, any string (see historicalWorldParameters.ts)
 *   year     - required, integer
 *   duration - optional seconds, defaults to 20 (temporalCinematicEngine.ts's own default)
 *   road     - optional 0-indexed generated road to point the camera at, defaults to 0
 *
 * CAPTURE HOOK — `window.__GENESIS_TEMPORAL_CAPTURE__`, set only once the
 * scene has genuinely built and the canvas exists. A Playwright script
 * calls `seekTo(seconds)` then screenshots the canvas element itself
 * (`document.querySelector('canvas')`) — this hook never returns pixel
 * bytes itself, so it cannot fake a capture; it only moves the same real
 * camera the visible canvas renders from.
 */
export interface GenesisTemporalCaptureHook {
  readonly ready: true;
  readonly place: string;
  readonly year: number;
  readonly durationSeconds: number;
  readonly sameStreetLocation: boolean | null;
  seekTo(seconds: number): void;
  getCurrentTimeSeconds(): number;
  debugEntitySummary(): readonly { id: string; position: readonly [number, number, number]; scale: number }[];
}

declare global {
  interface Window {
    __GENESIS_TEMPORAL_CAPTURE__?: GenesisTemporalCaptureHook;
  }
}

function parseQuery(hash: string): URLSearchParams {
  const qIndex = hash.indexOf('?');
  return new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : '');
}

export interface TemporalCinematicRouteParams {
  readonly place: string;
  readonly year: number;
  readonly durationSeconds?: number;
  readonly roadIndex?: number;
}

/** Pure parse — exported for tests. Returns `null` for a request missing required fields, never a fabricated default place/year. */
export function parseTemporalCinematicRoute(hash: string): TemporalCinematicRouteParams | null {
  const params = parseQuery(hash);
  const place = params.get('place');
  const yearRaw = params.get('year');
  if (!place || !yearRaw) return null;
  const year = parseInt(yearRaw, 10);
  if (!Number.isFinite(year)) return null;
  const durationRaw = params.get('duration');
  const roadRaw = params.get('road');
  return {
    place,
    year,
    durationSeconds: durationRaw ? parseInt(durationRaw, 10) : undefined,
    roadIndex: roadRaw ? parseInt(roadRaw, 10) : undefined,
  };
}

interface BuildOutcome {
  readonly kind: 'ok';
  readonly scene: HistoricalScene;
  readonly cameraPath: CameraPath;
}
interface BuildFailure {
  readonly kind: 'blocked';
  readonly reason: string;
}

export function TemporalCinematicScreen() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const route = useMemo(() => parseTemporalCinematicRoute(hash), [hash]);

  const outcome: BuildOutcome | BuildFailure | null = useMemo(() => {
    if (!route) return null;
    const scene = buildHistoricalScene({ place: route.place, year: route.year, durationSeconds: route.durationSeconds, roadIndex: route.roadIndex });
    if (!('keyframes' in scene.camera)) {
      return { kind: 'blocked', reason: scene.camera.reason };
    }
    return { kind: 'ok', scene, cameraPath: scene.camera };
  }, [route]);

  const sim = useMemo(() => {
    if (!outcome || outcome.kind !== 'ok') return null;
    return new TemporalCinematicSim3D(outcome.scene.world.engine, outcome.cameraPath);
  }, [outcome]);

  const params: SimParams = useMemo(() => ({}), []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);

  useEffect(() => {
    if (!sim || !outcome || outcome.kind !== 'ok' || loading || failed) return;
    const hook: GenesisTemporalCaptureHook = {
      ready: true,
      place: outcome.scene.place,
      year: outcome.scene.year,
      durationSeconds: outcome.cameraPath.durationSeconds,
      sameStreetLocation: null,
      seekTo: (seconds: number) => sim.seekTo(seconds),
      getCurrentTimeSeconds: () => sim.getCurrentTimeSeconds(),
      debugEntitySummary: () => sim.debugEntitySummary(),
    };
    window.__GENESIS_TEMPORAL_CAPTURE__ = hook;
    return () => {
      if (window.__GENESIS_TEMPORAL_CAPTURE__ === hook) delete window.__GENESIS_TEMPORAL_CAPTURE__;
    };
  }, [sim, outcome, loading, failed]);

  if (!route) {
    return (
      <div className="app" style={{ padding: 32, color: '#d7e2ee' }}>
        <h2>Temporal Cinematic Engine</h2>
        <p>Missing required <code>place</code>/<code>year</code> query params. Example: <code>#/temporal-cinematic?place=Warsaw&amp;year=1900&amp;duration=5</code></p>
      </div>
    );
  }

  if (outcome?.kind === 'blocked') {
    return (
      <div className="app" style={{ padding: 32, color: '#d7e2ee' }}>
        <h2>Temporal Cinematic Engine — BLOCKED_BY_RUNTIME</h2>
        <p>{outcome.reason}</p>
      </div>
    );
  }

  return (
    <div className="app" style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} data-testid="temporal-cinematic-canvas" />
      {loading ? <div style={{ position: 'absolute', top: 16, left: 16, color: '#d7e2ee' }}>Loading Three.js…</div> : null}
      {failed ? <div style={{ position: 'absolute', top: 16, left: 16, color: '#f08a8a' }}>WebGL failed to initialize.</div> : null}
      {outcome?.kind === 'ok' ? (
        <div style={{ position: 'absolute', bottom: 16, left: 16, color: '#96a7bb', font: '13px monospace' }}>
          {outcome.scene.place} · {outcome.scene.year} · road#{route.roadIndex ?? 0}
        </div>
      ) : null}
    </div>
  );
}
