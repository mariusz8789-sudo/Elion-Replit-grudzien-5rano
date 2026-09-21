/**
 * TEMPORAL CINEMATIC ENGINE — HONEST RUNTIME STATUS.
 *
 * `temporalCinematicEngine.ts` builds a real, deterministic historical
 * `WorldGraph` + camera keyframe path (`buildHistoricalScene`) — that part
 * is genuinely done and tested end to end. Turning that keyframe path into
 * actual rendered PIXELS (via the browser's `WorldFrameRenderer`/THREE.js)
 * and then into an encoded video FILE is explicitly the NEXT phase per the
 * project's own ordering ("TEMPORAL CINEMATIC ENGINE (this) -> REAL RENDER
 * E2E -> VIDEO"), and is not wired today. This module names exactly why,
 * so nothing downstream can accidentally claim a film was produced.
 *
 * Two concrete, verified-by-reading gaps (not assumptions):
 *
 * 1. UI WIRING: `components/visual-simulation/GenesisWorldScreen.tsx` (the
 *    one browser route that already composes `getFrameState` ->
 *    `toGraphicsWorldFrame` -> `WorldFrameRenderer` on a real WebGL canvas)
 *    is hardcoded to `buildGenesisScientificCity4()` — it has no prop/route
 *    parameter accepting an arbitrary `WorldSpecification`/`TemporalEngine`,
 *    so a historical scene built by this module cannot reach that screen
 *    without new UI wiring (a real, buildable task — not a fundamental
 *    blocker — just not yet done).
 * 2. VIDEO ENCODING: `ffmpeg` is not installed in this environment
 *    (confirmed: `ffmpeg: command not found`), though it IS installable via
 *    `apt-get`. Separately, Playwright's own `browser.newContext({
 *    recordVideo })` (already proven in this repo by
 *    `scripts/gov-drug-discovery-e2e-demo-capture.mjs`, which produces a
 *    real `.webm` file) may make ffmpeg unnecessary for a first working
 *    capture — this needs to be tried, not assumed either way.
 */
export const BLOCKED_BY_RUNTIME = 'BLOCKED_BY_RUNTIME' as const;

export interface RuntimeBlocker {
  readonly code: typeof BLOCKED_BY_RUNTIME;
  readonly stage: 'browser-render' | 'video-encode';
  readonly reason: string;
}

export const TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS: readonly RuntimeBlocker[] = [
  {
    code: BLOCKED_BY_RUNTIME,
    stage: 'browser-render',
    reason:
      'GenesisWorldScreen.tsx is hardcoded to buildGenesisScientificCity4() and has no route/prop for an arbitrary WorldSpecification yet — a historical scene from this module cannot reach the real WorldFrameRenderer canvas without that wiring.',
  },
  {
    code: BLOCKED_BY_RUNTIME,
    stage: 'video-encode',
    reason:
      'ffmpeg is not installed in this environment (apt-get install would work, not yet done). Playwright context.recordVideo is available and already proven elsewhere in this repo, but has not been exercised for this pipeline yet.',
  },
];

/** True until both real-render wiring and a proven video-capture path exist — never asserted true by a claim alone. */
export function isRenderToVideoReady(): boolean {
  return TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS.length === 0;
}
