import type { CameraPathPoint, HistoricalWorldState } from './contracts';

/**
 * BROWSER CAPTURE CONTRACT — the shared, browser-safe shape both sides of the
 * real capture bridge agree on: `TemporalCinematicStudio.tsx` (which installs
 * `window.__GENESIS_TEMPORAL_CAPTURE__`) and `browserFrameRenderer.node.ts`
 * (which calls it over a real Playwright `page.evaluate`). No `node:*`
 * imports here — this file is imported by the Vite frontend bundle.
 */

export const TEMPORAL_CAPTURE_FRAME_WIDTH = 960;
export const TEMPORAL_CAPTURE_FRAME_HEIGHT = 540;
export const TEMPORAL_CAPTURE_CANVAS_TEST_ID = 'tc-capture-canvas';

export interface TemporalCaptureCameraInput {
  readonly position: CameraPathPoint['position'];
  readonly target: CameraPathPoint['target'];
  readonly fov: number;
}

export interface TemporalCaptureRequest {
  readonly temporalState: HistoricalWorldState;
  readonly camera: TemporalCaptureCameraInput;
  readonly timestamp: number;
  /** Parsed `TemporalSceneRequest.atmosphere.weather` (e.g. 'rain') — drives the real weather rig
   * and wet-ground dressing in `temporalCinematicSceneMount.ts`. Absent means clear/default. */
  readonly weather?: string;
}

export type TemporalCaptureFailureReason = 'CANVAS_UNAVAILABLE' | 'RENDERER_UNAVAILABLE';

export interface TemporalCaptureResponse {
  readonly ok: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly reason?: TemporalCaptureFailureReason;
  readonly detail?: string;
}

export type TemporalCaptureHook = (request: TemporalCaptureRequest) => Promise<TemporalCaptureResponse>;

declare global {
  interface Window {
    __GENESIS_TEMPORAL_CAPTURE__?: TemporalCaptureHook;
  }
}
