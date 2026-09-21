import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { CameraPath, FrameArtifact, HistoricalWorldState } from './contracts.ts';
import { BrowserFrameRenderer } from './browserFrameRenderer.node.ts';

/**
 * REAL TEMPORAL CAPTURE — Node-only async orchestration mirroring
 * `temporalRenderController.ts`'s `renderTemporalScene` year-selection logic
 * (multiple resolved years share one camera timeline proportionally), but
 * driving the REAL `BrowserFrameRenderer` instead of the injectable
 * synchronous `FrameRenderer` port. Kept as a SEPARATE module rather than
 * changing `renderTemporalScene`'s signature to async: that function's
 * existing sync contract is exercised by the whole existing orchestrator
 * pipeline and test suite, and real browser capture is inherently async
 * (`page.evaluate`) — this module is purely additive control/capture
 * plumbing over the same states/cameraPath data, not a second renderer.
 */
export interface RealCaptureFrame {
  readonly frame: FrameArtifact;
  /** Real PNG path on disk — only set for `frame.source === 'CAPTURED'`. */
  readonly path: string | null;
}

export interface RealCaptureResult {
  readonly frames: readonly RealCaptureFrame[];
  readonly allBlocked: boolean;
  readonly browserAvailable: boolean;
}

export async function captureRealTemporalFrames(
  states: readonly HistoricalWorldState[],
  cameraPath: CameraPath,
  routeUrl: string,
  outDir: string,
  onFrame?: (index: number, total: number, frame: RealCaptureFrame) => void,
  // Injectable, matching this pipeline's existing FrameRenderer/VideoEncoder port pattern — the real
  // default is a real BrowserFrameRenderer; tests inject a fake to exercise the year/camera-point
  // pairing and failure-propagation logic deterministically, without a real browser.
  renderer: Pick<BrowserFrameRenderer, 'launch' | 'captureFrame' | 'close'> = new BrowserFrameRenderer(),
  /** Parsed `TemporalSceneRequest.atmosphere.weather` (e.g. 'rain') — same value for every frame in
   * one capture run; threaded to the real weather rig / wet-ground dressing in the scene mount. */
  weather?: string,
): Promise<RealCaptureResult> {
  mkdirSync(outDir, { recursive: true });
  const launch = await renderer.launch(routeUrl);
  if (!launch.ok) {
    const frames: RealCaptureFrame[] = cameraPath.points.map((point) => ({
      frame: {
        year: states[0]?.year ?? 0,
        timestampSeconds: point.timestampSeconds,
        source: 'NOT_RENDERED',
        note: `BROWSER_UNAVAILABLE: ${launch.detail}`,
      },
      path: null,
    }));
    return { frames, allBlocked: true, browserAvailable: false };
  }

  const frames: RealCaptureFrame[] = [];
  for (let i = 0; i < cameraPath.points.length; i++) {
    const point = cameraPath.points[i];
    const stateIndex = states.length <= 1 ? 0 : Math.min(states.length - 1, Math.floor((i / cameraPath.points.length) * states.length));
    const state = states[stateIndex];
    const outPath = path.join(outDir, `frame-${String(i).padStart(4, '0')}.jpg`);
    const result = await renderer.captureFrame(state, point.position, point.target, point.fov, point.timestampSeconds, outPath, weather);
    const captured: RealCaptureFrame = result.ok
      ? {
        frame: { year: state.year, timestampSeconds: point.timestampSeconds, source: 'CAPTURED', byteLength: result.byteLength, note: 'real Playwright capture of the #/temporal-cinematic canvas' },
        path: result.path,
      }
      : {
        frame: { year: state.year, timestampSeconds: point.timestampSeconds, source: 'NOT_RENDERED', note: `${result.reason}: ${result.detail}` },
        path: null,
      };
    frames.push(captured);
    onFrame?.(i, cameraPath.points.length, captured);
  }
  await renderer.close();
  return { frames, allBlocked: frames.every((f) => f.frame.source === 'NOT_RENDERED'), browserAvailable: true };
}
