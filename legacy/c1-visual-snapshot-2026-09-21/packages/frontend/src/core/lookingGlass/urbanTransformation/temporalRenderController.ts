import type { CameraPath, FrameArtifact, HistoricalWorldState } from './contracts';

/**
 * TEMPORAL RENDER CONTROLLER — the integration/orchestration layer the brief
 * asks for, NOT a second renderer. It is written against an injectable
 * `FrameRenderer` port so a real one (a headless capture of
 * `agentLabScene3D.ts` driving actual historical-era geometry) can be wired
 * in later without this module changing.
 *
 * HONEST STATE TODAY: no historical-era-aware 3D geometry generator exists
 * anywhere in Genesis (confirmed in this task's own repository audit —
 * `worldGenerator.ts` builds generic blueprint-driven worlds, not
 * building/vehicle archetypes keyed by year). `agentLabScene3D.ts` has no
 * mount for a `HistoricalWorldState`. So the default, production
 * `FrameRenderer` below reports `NOT_RENDERED` for every frame rather than
 * capturing a real screenshot of unrelated content and presenting it as a
 * historical scene — that would be exactly the "fake successful rendering"
 * the brief forbids, even though a REAL PNG could technically be produced
 * from some other existing route.
 */
export interface FrameRenderer {
  /** Returns null when this renderer cannot produce this frame at all (no historical geometry mount exists). */
  renderFrame(state: HistoricalWorldState, cameraPosition: readonly [number, number, number], cameraTarget: readonly [number, number, number]): { readonly byteLength: number } | null;
}

/** Honest default: reports the real, current limitation rather than fabricating a frame. */
export const NOT_IMPLEMENTED_FRAME_RENDERER: FrameRenderer = {
  renderFrame: () => null,
};

export interface RenderSequenceResult {
  readonly frames: readonly FrameArtifact[];
  readonly allBlocked: boolean;
}

export function renderTemporalScene(states: readonly HistoricalWorldState[], cameraPath: CameraPath, renderer: FrameRenderer = NOT_IMPLEMENTED_FRAME_RENDERER): RenderSequenceResult {
  const stateByYearIndex = states;
  const frames: FrameArtifact[] = cameraPath.points.map((point, i) => {
    // Multiple years share one camera path proportionally — the transformation
    // sequence walks the years in step with the camera timeline.
    const stateIndex = stateByYearIndex.length <= 1 ? 0 : Math.min(stateByYearIndex.length - 1, Math.floor((i / cameraPath.points.length) * stateByYearIndex.length));
    const state = stateByYearIndex[stateIndex];
    const rendered = renderer.renderFrame(state, point.position, point.target);
    return rendered
      ? { year: state.year, timestampSeconds: point.timestampSeconds, source: 'CAPTURED' as const, byteLength: rendered.byteLength, note: 'captured by the injected FrameRenderer' }
      : { year: state.year, timestampSeconds: point.timestampSeconds, source: 'NOT_RENDERED' as const, note: 'no historical-era-aware 3D renderer exists yet — BLOCKED_BY_RUNTIME, not faked' };
  });
  return { frames, allBlocked: frames.every((f) => f.source === 'NOT_RENDERED') };
}
