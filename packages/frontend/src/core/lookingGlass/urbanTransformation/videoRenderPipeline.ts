import type { FrameArtifact, VideoArtifact } from './contracts';

/**
 * VIDEO RENDER PIPELINE — browser-safe orchestration over an injectable
 * `VideoEncoder` port. The real encoder (`ffmpegVideoEncoder.node.ts`,
 * sibling file) shells out to `ffmpeg` and therefore imports `node:child_process`
 * — it must never be imported from this file or anything the Vite frontend
 * bundle reaches (same `.node.ts` convention this repo already uses for
 * `core/repro/reproEntry.node.ts` and others), so it is wired in only from a
 * Node-side caller (a script or a future backend route), never from here.
 */
export interface VideoEncoder {
  readonly available: () => boolean;
  readonly encode: (frames: readonly FrameArtifact[]) => VideoArtifact;
}

/** Honest default for the browser bundle: ffmpeg cannot run in a browser at all, so this is not a placeholder to be "fixed" here — it is architecturally permanent for this file. */
export const NOT_IMPLEMENTED_VIDEO_ENCODER: VideoEncoder = {
  available: () => false,
  encode: (frames) => ({ status: 'BLOCKED_BY_RUNTIME', format: 'MP4', frameCount: frames.length, note: 'no video encoder is wired into the browser runtime; a Node-side ffmpeg adapter (ffmpegVideoEncoder.node.ts) exists but is not reachable from this bundle' }),
};

export function encodeTemporalVideo(frames: readonly FrameArtifact[], encoder: VideoEncoder = NOT_IMPLEMENTED_VIDEO_ENCODER): VideoArtifact {
  const capturedCount = frames.filter((f) => f.source === 'CAPTURED').length;
  if (capturedCount === 0) {
    return { status: 'BLOCKED_BY_RUNTIME', format: 'MP4', frameCount: frames.length, note: 'no frames were captured (renderer BLOCKED_BY_RUNTIME) — nothing to encode' };
  }
  if (!encoder.available()) {
    return { status: 'BLOCKED_BY_RUNTIME', format: 'MP4', frameCount: capturedCount, note: 'VIDEO_ENCODER_UNAVAILABLE: ffmpeg is not available in this runtime' };
  }
  return encoder.encode(frames);
}
