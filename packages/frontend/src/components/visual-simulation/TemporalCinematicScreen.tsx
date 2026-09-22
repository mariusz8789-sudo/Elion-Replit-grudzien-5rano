import { useEffect, useMemo, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { TemporalCinematicSim3D } from '../../core/temporalCinematic/temporalCinematicSim3D';
import { buildHistoricalScene, recordTemporalCaptureArtifact, type HistoricalScene } from '../../core/temporalCinematic/temporalCinematicEngine';
import type { CameraPath } from '../../core/temporalCinematic/cameraPath';
import type { SimParams } from '../../core/types';
import type { CinematicViewMode } from '../../core/temporalCinematic/cinematicShotDirector';
import type { RoomType } from '../../core/worldModel/ecs/geometry';
import { kernelLedger } from '../../core/agent/cyberReasoningKernel';
import { canonicalJson, fnv1a } from '../../core/events/hash';

/** One canonical capture hook; V6.1 adds deterministic seek-and-wait, not a second hook. */
export interface GenesisTemporalCaptureHook {
  readonly ready: true;
  readonly place: string;
  readonly year: number;
  readonly durationSeconds: number;
  readonly sameStreetLocation: boolean | null;
  seekTo(seconds: number): void;
  seekAndWait(seconds: number): Promise<void>;
  getCurrentTimeSeconds(): number;
  getPresentationSummary(): ReturnType<TemporalCinematicSim3D['getPresentationSummary']>;
  getInteractionTargets(): ReturnType<TemporalCinematicSim3D['getInteractionTargets']>;
  recordCaptureArtifact(input: { readonly seconds: number; readonly artifactFile: string; readonly artifactSha256: string }): { readonly evidenceHash: string; readonly semanticFingerprint: string };
  debugEntitySummary(): readonly { id: string; position: readonly [number, number, number]; scale: number }[];
}

declare global {
  interface Window { __GENESIS_TEMPORAL_CAPTURE__?: GenesisTemporalCaptureHook; }
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
  readonly weather?: string;
  readonly viewMode: CinematicViewMode;
  readonly generateInteriors: boolean;
  readonly roomType?: RoomType;
}

export function parseTemporalCinematicRoute(hash: string): TemporalCinematicRouteParams | null {
  const params = parseQuery(hash);
  const place = params.get('place');
  const yearRaw = params.get('year');
  if (!place || !yearRaw) return null;
  const year = parseInt(yearRaw, 10);
  if (!Number.isFinite(year)) return null;
  const durationRaw = params.get('duration');
  const roadRaw = params.get('road');
  const weatherRaw = params.get('weather');
  const viewRaw = params.get('view');
  const viewMode: CinematicViewMode = viewRaw === 'interior' ? 'interior' : 'street';
  const generateInteriors = viewMode === 'interior' || params.get('interiors') === '1' || params.get('interiors') === 'true';
  return {
    place,
    year,
    durationSeconds: durationRaw ? parseInt(durationRaw, 10) : undefined,
    roadIndex: roadRaw ? parseInt(roadRaw, 10) : undefined,
    weather: weatherRaw?.trim() || undefined,
    viewMode,
    generateInteriors,
    roomType: params.get('roomType') === 'MATERIALS_LAB' ? 'MATERIALS_LAB' : undefined,
  };
}

interface BuildOutcome { readonly kind: 'ok'; readonly scene: HistoricalScene; readonly cameraPath: CameraPath; }
interface BuildFailure { readonly kind: 'blocked'; readonly reason: string; }

function twoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
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
    const scene = buildHistoricalScene({
      place: route.place,
      year: route.year,
      durationSeconds: route.durationSeconds,
      roadIndex: route.roadIndex,
      generateInteriors: route.generateInteriors,
    });
    if (!('keyframes' in scene.camera)) return { kind: 'blocked', reason: scene.camera.reason };
    return { kind: 'ok', scene, cameraPath: scene.camera };
  }, [route]);

  const sim = useMemo(() => {
    if (!outcome || outcome.kind !== 'ok' || !route) return null;
    return new TemporalCinematicSim3D(outcome.scene.world.engine, outcome.cameraPath, {
      weather: route.weather,
      year: route.year,
      viewMode: route.viewMode,
      roomType: route.roomType,
    });
  }, [outcome, route]);

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
      seekAndWait: async (seconds: number) => { sim.seekTo(seconds); await twoAnimationFrames(); },
      getCurrentTimeSeconds: () => sim.getCurrentTimeSeconds(),
      getPresentationSummary: () => sim.getPresentationSummary(),
      getInteractionTargets: () => sim.getInteractionTargets(),
      recordCaptureArtifact: (input) => {
        const semanticFingerprint = fnv1a(canonicalJson({
          worldId: outcome.scene.world.worldId,
          place: outcome.scene.place,
          year: outcome.scene.year,
          seconds: input.seconds,
          presentation: sim.getPresentationSummary(),
        }));
        const evidenceHash = recordTemporalCaptureArtifact(kernelLedger, {
          worldId: outcome.scene.world.worldId,
          place: outcome.scene.place,
          year: outcome.scene.year,
          seconds: input.seconds,
          artifactFile: input.artifactFile,
          artifactSha256: input.artifactSha256,
          semanticFingerprint,
          viewMode: route!.viewMode,
        });
        return { evidenceHash, semanticFingerprint };
      },
      debugEntitySummary: () => sim.debugEntitySummary(),
    };
    window.__GENESIS_TEMPORAL_CAPTURE__ = hook;
    return () => { if (window.__GENESIS_TEMPORAL_CAPTURE__ === hook) delete window.__GENESIS_TEMPORAL_CAPTURE__; };
  }, [sim, outcome, loading, failed]);

  if (!route) {
    return <div className="app" style={{ padding: 32, color: '#d7e2ee' }}><h2>Temporal Cinematic Engine</h2><p>Missing required <code>place</code>/<code>year</code> query params.</p></div>;
  }
  if (outcome?.kind === 'blocked') {
    return <div className="app" style={{ padding: 32, color: '#d7e2ee' }}><h2>Temporal Cinematic Engine — BLOCKED_BY_RUNTIME</h2><p>{outcome.reason}</p></div>;
  }

  return (
    <div className="app" style={{ position: 'relative', width: '100%', height: '100vh' }} data-view={route.viewMode}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} data-testid="temporal-cinematic-canvas" />
      {loading ? <div style={{ position: 'absolute', top: 16, left: 16, color: '#d7e2ee' }}>Loading Three.js…</div> : null}
      {failed ? <div style={{ position: 'absolute', top: 16, left: 16, color: '#f08a8a' }}>WebGL failed to initialize.</div> : null}
      {outcome?.kind === 'ok' ? (
        <div style={{ position: 'absolute', bottom: 16, left: 16, color: '#96a7bb', font: '13px monospace' }}>
          {outcome.scene.place} · {outcome.scene.year} · {route.viewMode.toUpperCase()} · road#{route.roadIndex ?? 0}{route.weather ? ` · ${route.weather.toUpperCase()}` : ''}
        </div>
      ) : null}
    </div>
  );
}
