import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { locatePlaywrightBundledFfmpeg } from './playwrightFfmpegLocator.node';

export interface CanonicalVideoArtifact {
  readonly status: 'AVAILABLE' | 'BLOCKED_BY_RUNTIME';
  readonly format: 'WEBM';
  readonly frameCount: number;
  readonly outputPath: string | null;
  readonly byteLength: number | null;
  readonly note: string;
}

export function bundledFfmpegAvailable(): boolean { return locatePlaywrightBundledFfmpeg() !== null; }

/** Real VP8/WebM encode from real JPEG frames. Never fabricates an artifact when runtime support is absent. */
export function encodeCanonicalFramesToWebm(framePaths: readonly string[], outputPath: string, fps: number): CanonicalVideoArtifact {
  const binary = locatePlaywrightBundledFfmpeg();
  if (!binary) return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, outputPath: null, byteLength: null, note: 'No Playwright-bundled ffmpeg binary is available.' };
  if (framePaths.length === 0) return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: 0, outputPath: null, byteLength: null, note: 'No JPEG frames were supplied.' };
  const safeFps = Number.isFinite(fps) && fps > 0 ? Math.max(1, Math.min(120, fps)) : 24;
  const workDir = mkdtempSync(path.join(tmpdir(), 'genesis-canonical-video-'));
  const concatPath = path.join(workDir, 'frames.mjpeg');
  try {
    try { writeFileSync(concatPath, Buffer.concat(framePaths.map((p) => readFileSync(p)))); }
    catch (err) { return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, outputPath: null, byteLength: null, note: `Frame read failed: ${err instanceof Error ? err.message : String(err)}` }; }
    const result = spawnSync(binary, ['-y', '-f', 'image2pipe', '-framerate', String(safeFps), '-vcodec', 'mjpeg', '-i', concatPath, '-c:v', 'libvpx', '-pix_fmt', 'yuv420p', outputPath], { maxBuffer: 1024 * 1024 * 512 });
    if (result.error || result.status !== 0) {
      const tail = result.stderr?.toString('utf8').slice(-1200) ?? String(result.error ?? 'unknown ffmpeg failure');
      return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, outputPath: null, byteLength: null, note: `ffmpeg exited ${result.status ?? 'null'}: ${tail}` };
    }
    let bytes = 0;
    try { bytes = statSync(outputPath).size; } catch { bytes = 0; }
    if (bytes <= 0) return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, outputPath: null, byteLength: null, note: 'ffmpeg reported success but output is missing/empty.' };
    return { status: 'AVAILABLE', format: 'WEBM', frameCount: framePaths.length, outputPath, byteLength: bytes, note: `Real VP8/WebM encode via ${binary}` };
  } finally { rmSync(workDir, { recursive: true, force: true }); }
}
