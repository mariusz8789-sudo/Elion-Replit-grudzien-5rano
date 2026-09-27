import type { FaceTelemetryPayload } from '@genesis/core/mirror/GenesisMirrorBridge.js';

/**
 * BROWSER CAMERA ADAPTER — the ONE real `getUserMedia` integration in this
 * repo (none existed before this file). It is deliberately an ADAPTER, never
 * a second Mirror state machine: it only ever (a) requests/reports real
 * camera CAPABILITY and consent, and (b) produces the `TELEMETRY` event
 * payload the EXISTING canonical `mirrorTransition`
 * (`packages/core/src/flagship/mirrorTwin.ts`) already accepts. It never
 * calls `mirrorTransition` itself and never invents a new state.
 *
 * ## What this honestly does NOT do
 *
 * There is no real face-landmark extraction (no MediaPipe integration) in
 * this repo. So `buildTelemetry` NEVER reports `mode: 'MEDIAPIPE'` — only
 * `'SYNTHETIC_FALLBACK'`, with `confidence: 0` (no real tracking confidence
 * to report). A real, open camera stream proves real consent and real device
 * capability; it does NOT prove face tracking, calibration, or identity —
 * and this adapter never claims otherwise. This matches the existing
 * `MirrorTwinSession.appearance.sourceMode` contract
 * (`'MEDIAPIPE' | 'SYNTHETIC_FALLBACK' | null`) exactly as declared upstream.
 *
 * ## Lifecycle discipline
 *
 * Every `MediaStreamTrack` this adapter opens is stopped by `stop()` — the
 * one and only cleanup path, called on every request-flow failure and on
 * component unmount. No track is ever left running after `stop()` returns.
 */

export type CameraCapabilityStatus = 'UNAVAILABLE' | 'NOT_REQUESTED' | 'PERMISSION_DENIED' | 'STREAM_OPEN' | 'STOPPED' | 'ERROR';

export interface CameraCapabilityState {
  readonly status: CameraCapabilityStatus;
  readonly deviceLabel: string | null;
  readonly trackCount: number;
  readonly errorMessage: string | null;
}

/** The exact shape the canonical `mirrorTransition`'s TELEMETRY event accepts — never the full `FaceTelemetryPayload` (no `payloadId`/`seed`/`landmarkVec` is invented here). */
export type MirrorTelemetryPayload = Pick<FaceTelemetryPayload, 'consent' | 'containsRawImage' | 'mode' | 'confidence' | 'sentAt' | 'ttlMs'>;

/** The minimal real browser surface this adapter needs — injectable so tests never require an actual camera or browser. */
export interface MinimalMediaDevices {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

export interface BrowserCameraAdapter {
  /** Requests real camera permission/capability. Resolves to the resulting honest state — never throws. */
  requestCapability(): Promise<CameraCapabilityState>;
  /** Stops every open MediaStreamTrack. Idempotent and safe to call when nothing is open. */
  stop(): void;
  getState(): CameraCapabilityState;
  /** `null` unless a real stream is currently open — never fabricates telemetry for a camera that was never opened. */
  buildTelemetry(now: number): MirrorTelemetryPayload | null;
}

const TELEMETRY_TTL_MS = 10_000;

function resolveDefaultMediaDevices(): MinimalMediaDevices | null {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return navigator.mediaDevices;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function isPermissionError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError');
}

/** `mediaDevices` defaults to the real `navigator.mediaDevices` in a browser; pass a fake for tests. `undefined` in a non-browser environment (e.g. SSR/node) honestly resolves capability to `UNAVAILABLE`, never throwing. */
export function createBrowserCameraAdapter(mediaDevices: MinimalMediaDevices | null | undefined = resolveDefaultMediaDevices()): BrowserCameraAdapter {
  let stream: MediaStream | null = null;
  let state: CameraCapabilityState = mediaDevices
    ? { status: 'NOT_REQUESTED', deviceLabel: null, trackCount: 0, errorMessage: null }
    : { status: 'UNAVAILABLE', deviceLabel: null, trackCount: 0, errorMessage: 'navigator.mediaDevices.getUserMedia is not available in this environment.' };

  async function requestCapability(): Promise<CameraCapabilityState> {
    if (!mediaDevices) return state;
    try {
      const opened = await mediaDevices.getUserMedia({ video: true, audio: false });
      stream = opened;
      const tracks = opened.getVideoTracks();
      state = { status: 'STREAM_OPEN', deviceLabel: tracks[0]?.label || null, trackCount: opened.getTracks().length, errorMessage: null };
    } catch (err) {
      state = isPermissionError(err)
        ? { status: 'PERMISSION_DENIED', deviceLabel: null, trackCount: 0, errorMessage: describeError(err) }
        : { status: 'ERROR', deviceLabel: null, trackCount: 0, errorMessage: describeError(err) };
    }
    return state;
  }

  function stop(): void {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    if (state.status === 'STREAM_OPEN') {
      state = { status: 'STOPPED', deviceLabel: null, trackCount: 0, errorMessage: null };
    }
  }

  function getState(): CameraCapabilityState {
    return state;
  }

  function buildTelemetry(now: number): MirrorTelemetryPayload | null {
    if (state.status !== 'STREAM_OPEN') return null;
    return { consent: true, containsRawImage: false, mode: 'SYNTHETIC_FALLBACK', confidence: 0, sentAt: now, ttlMs: TELEMETRY_TTL_MS };
  }

  return { requestCapability, stop, getState, buildTelemetry };
}
