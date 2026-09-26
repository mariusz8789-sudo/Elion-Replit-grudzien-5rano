/** V6.1 honest status: canonical WebGL browser capture is wired; encoder availability is runtime-dependent. */
export const BLOCKED_BY_RUNTIME = 'BLOCKED_BY_RUNTIME' as const;
export interface RuntimeBlocker { readonly code: typeof BLOCKED_BY_RUNTIME; readonly stage: 'video-encode'; readonly reason: string; }
export const TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS: readonly RuntimeBlocker[] = [{
  code: BLOCKED_BY_RUNTIME,
  stage: 'video-encode',
  reason: 'Canonical browser capture is wired through seekAndWait() + the real temporal canvas. WEBM encoding still requires a real Playwright-bundled ffmpeg binary at execution time.',
}];
export function isRenderToVideoReady(): boolean { return TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS.length === 0; }
