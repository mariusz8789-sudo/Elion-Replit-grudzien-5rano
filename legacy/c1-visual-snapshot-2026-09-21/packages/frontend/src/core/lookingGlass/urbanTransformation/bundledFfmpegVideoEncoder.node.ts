import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { VideoArtifact } from './contracts.ts';
import { locatePlaywrightBundledFfmpeg } from './playwrightFfmpegLocator.node.ts';

/**
 * REAL video encoding via the Playwright-bundled ffmpeg binary (see
 * `playwrightFfmpegLocator.node.ts` for why this exists). Three real,
 * empirically-verified facts about this exact stripped build shape this
 * module:
 *
 * 1. Output: only `muxer=webm` + `encoder=libvpx_vp8` are enabled — no
 *    MP4/h264. This function produces a real `.webm` (VP8), never a real
 *    `.mp4`, and reports `format: 'WEBM'` honestly.
 * 2. Input decoder: only `decoder=mjpeg` is enabled — NOT `decoder=png`,
 *    confirmed by running this exact binary against a real PNG stream
 *    (`Unknown decoder 'png'`). So frames are captured as real JPEGs by
 *    `browserFrameRenderer.node.ts` (`captureFrame`'s screenshot uses
 *    `type: 'jpeg'`) rather than PNG.
 * 3. Input transport: `-i -` (stdin, the `pipe` protocol's shorthand) fails
 *    on this exact binary — confirmed by a real 120-frame run:
 *    `Error opening input: Protocol not found — Did you mean file:fd:?`.
 *    So frames are concatenated into ONE real temp file on disk instead, and
 *    ffmpeg reads that real file via its `image2pipe` demuxer
 *    (`-f image2pipe -vcodec mjpeg -i <file>`) — the same combination a
 *    manual 3-frame test proved works end-to-end (real webm produced) before
 *    it was wired in here. Not a `%04d.jpg` glob pattern either: this binary
 *    enables `demuxer=image2pipe` but not the separate `demuxer=image2` that
 *    glob-pattern file reading needs.
 */
export function bundledFfmpegAvailable(): boolean {
  return locatePlaywrightBundledFfmpeg() !== null;
}

export function encodeFramesToWebm(framePaths: readonly string[], outputPath: string, fps: number): VideoArtifact {
  const binary = locatePlaywrightBundledFfmpeg();
  if (!binary) {
    return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, note: 'VIDEO_ENCODE_FAILED: no Playwright-bundled ffmpeg binary found under PLAYWRIGHT_BROWSERS_PATH, and `ffmpeg` is not on PATH' };
  }
  if (framePaths.length === 0) {
    return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: 0, note: 'VIDEO_ENCODE_FAILED: no captured frames to encode' };
  }

  const workDir = mkdtempSync(path.join(tmpdir(), 'genesis-tc-ffmpeg-'));
  const concatPath = path.join(workDir, 'frames.mjpeg');
  try {
    let concatenated: Buffer;
    try {
      concatenated = Buffer.concat(framePaths.map((p) => readFileSync(p)));
      writeFileSync(concatPath, concatenated);
    } catch (err) {
      return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, note: `VIDEO_ENCODE_FAILED: could not read/concatenate frame files — ${err instanceof Error ? err.message : String(err)}` };
    }

    const result = spawnSync(
      binary,
      ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', concatPath, '-c:v', 'libvpx', '-pix_fmt', 'yuv420p', outputPath],
      { maxBuffer: 1024 * 1024 * 512 },
    );
    if (result.error || result.status !== 0) {
      const stderrTail = result.stderr ? result.stderr.toString('utf8').slice(-1200) : String(result.error ?? 'unknown ffmpeg failure');
      return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, note: `VIDEO_ENCODE_FAILED: ffmpeg exited ${result.status ?? 'null'} — ${stderrTail}` };
    }
    let byteLength: number;
    try {
      byteLength = statSync(outputPath).size;
    } catch (err) {
      return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, note: `VIDEO_ENCODE_FAILED: ffmpeg reported success but the output file is missing — ${err instanceof Error ? err.message : String(err)}` };
    }
    if (byteLength === 0) {
      return { status: 'BLOCKED_BY_RUNTIME', format: 'WEBM', frameCount: framePaths.length, note: 'VIDEO_ENCODE_FAILED: ffmpeg reported success but produced a zero-byte file' };
    }
    return { status: 'AVAILABLE', format: 'WEBM', frameCount: framePaths.length, note: `real encode via Playwright-bundled ffmpeg (${binary}) — ${byteLength} bytes at ${outputPath}` };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
