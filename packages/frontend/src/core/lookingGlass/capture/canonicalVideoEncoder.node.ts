import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { locatePlaywrightBundledFfmpeg } from './playwrightFfmpegLocator.node';

export interface CanonicalVideoArtifact {
  readonly status: 'AVAILABLE' | 'BLOCKED_BY_RUNTIME';
  readonly format: 'WEBM' | 'MP4';
  readonly frameCount: number;
  readonly outputPath: string | null;
  readonly byteLength: number | null;
  readonly note: string;
}

export function bundledFfmpegAvailable(): boolean { return locatePlaywrightBundledFfmpeg() !== null; }

interface FrameEncodeSpec {
  readonly format: 'WEBM' | 'MP4';
  readonly encodeArgs: readonly string[];
}

/**
 * Shared real-encode path for both formats: writes real JPEG frames to a temp MJPEG concat
 * file, then runs the real Playwright-bundled ffmpeg binary against it. Never fabricates an
 * artifact — any missing binary, missing frames, non-zero ffmpeg exit, or empty output file
 * is reported as `BLOCKED_BY_RUNTIME` with the real ffmpeg diagnostic in `note`.
 */
function runCanonicalFrameEncode(framePaths: readonly string[], outputPath: string, fps: number, spec: FrameEncodeSpec): CanonicalVideoArtifact {
  const binary = locatePlaywrightBundledFfmpeg();
  if (!binary) return { status: 'BLOCKED_BY_RUNTIME', format: spec.format, frameCount: framePaths.length, outputPath: null, byteLength: null, note: 'No Playwright-bundled ffmpeg binary is available.' };
  if (framePaths.length === 0) return { status: 'BLOCKED_BY_RUNTIME', format: spec.format, frameCount: 0, outputPath: null, byteLength: null, note: 'No JPEG frames were supplied.' };
  const safeFps = Number.isFinite(fps) && fps > 0 ? Math.max(1, Math.min(120, fps)) : 24;
  const workDir = mkdtempSync(path.join(tmpdir(), 'genesis-canonical-video-'));
  const concatPath = path.join(workDir, 'frames.mjpeg');
  try {
    try { writeFileSync(concatPath, Buffer.concat(framePaths.map((p) => readFileSync(p)))); }
    catch (err) { return { status: 'BLOCKED_BY_RUNTIME', format: spec.format, frameCount: framePaths.length, outputPath: null, byteLength: null, note: `Frame read failed: ${err instanceof Error ? err.message : String(err)}` }; }
    const args = ['-y', '-f', 'image2pipe', '-framerate', String(safeFps), '-vcodec', 'mjpeg', '-i', concatPath, ...spec.encodeArgs, outputPath];
    const result = spawnSync(binary, args, { maxBuffer: 1024 * 1024 * 512 });
    if (result.error || result.status !== 0) {
      const tail = result.stderr?.toString('utf8').slice(-1200) ?? String(result.error ?? 'unknown ffmpeg failure');
      return { status: 'BLOCKED_BY_RUNTIME', format: spec.format, frameCount: framePaths.length, outputPath: null, byteLength: null, note: `ffmpeg exited ${result.status ?? 'null'}: ${tail}` };
    }
    let bytes = 0;
    try { bytes = statSync(outputPath).size; } catch { bytes = 0; }
    if (bytes <= 0) return { status: 'BLOCKED_BY_RUNTIME', format: spec.format, frameCount: framePaths.length, outputPath: null, byteLength: null, note: 'ffmpeg reported success but output is missing/empty.' };
    return { status: 'AVAILABLE', format: spec.format, frameCount: framePaths.length, outputPath, byteLength: bytes, note: `Real ${spec.format} encode via ${binary}` };
  } finally { rmSync(workDir, { recursive: true, force: true }); }
}

/** Real VP8/WebM encode from real JPEG frames. Never fabricates an artifact when runtime support is absent. */
export function encodeCanonicalFramesToWebm(framePaths: readonly string[], outputPath: string, fps: number): CanonicalVideoArtifact {
  return runCanonicalFrameEncode(framePaths, outputPath, fps, { format: 'WEBM', encodeArgs: ['-c:v', 'libvpx', '-pix_fmt', 'yuv420p'] });
}

/**
 * Real H.264/MP4 encode from real JPEG frames, attempted through the SAME Playwright-bundled
 * ffmpeg binary as the WEBM path above. That binary is a stripped build (no `libx264` encoder,
 * no mp4/mov muxer — verified directly: `ffmpeg -encoders`/`-muxers` list neither), so in THIS
 * environment every call here returns `BLOCKED_BY_RUNTIME` with ffmpeg's own real error text —
 * never a fabricated MP4. Against a full ffmpeg build (e.g. a production deploy with a
 * non-stripped binary) the identical code path produces a real MP4 with no changes needed.
 */
export function encodeCanonicalFramesToMp4(framePaths: readonly string[], outputPath: string, fps: number): CanonicalVideoArtifact {
  return runCanonicalFrameEncode(framePaths, outputPath, fps, { format: 'MP4', encodeArgs: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4'] });
}
