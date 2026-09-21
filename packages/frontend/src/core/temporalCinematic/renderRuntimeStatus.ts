/**
 * TEMPORAL CINEMATIC ENGINE — HONEST RUNTIME STATUS (V5.1).
 *
 * Browser rendering is no longer a blocker: the live route is wired through
 * TemporalCinematicScreen -> TemporalCinematicSim3D -> WorldFrameRenderer.
 * The repository also has a real Playwright capture script that drives the canonical
 * `window.__GENESIS_TEMPORAL_CAPTURE__` hook and screenshots the real canvas.
 *
 * What remains runtime-dependent is VIDEO ENCODING availability. V5.1's capture script tries a
 * system ffmpeg first and then the Playwright-bundled stripped ffmpeg (WEBM/VP8). A source file
 * cannot honestly promise either binary exists in every deployment, so readiness stays false here
 * until a runtime execution proves an encoder on the machine doing the capture.
 */
export const BLOCKED_BY_RUNTIME = 'BLOCKED_BY_RUNTIME' as const;

export interface RuntimeBlocker {
  readonly code: typeof BLOCKED_BY_RUNTIME;
  readonly stage: 'video-encode';
  readonly reason: string;
}

export const TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS: readonly RuntimeBlocker[] = [
  {
    code: BLOCKED_BY_RUNTIME,
    stage: 'video-encode',
    reason:
      'Browser render/capture is wired. Video encoding is runtime-dependent: scripts/temporal-cinematic-e2e-capture.mjs must find either a system ffmpeg (MP4/H.264) or Playwright-bundled ffmpeg (WEBM/VP8) in the execution environment.',
  },
];

/** Static source inspection cannot prove a runtime binary exists; the real E2E script is the authority. */
export function isRenderToVideoReady(): boolean {
  return TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS.length === 0;
}
