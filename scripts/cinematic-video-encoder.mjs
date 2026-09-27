#!/usr/bin/env node
/**
 * Canonical cinematic video encoding helper.
 *
 * This module never reports a video as ready unless a real encoder process
 * exits successfully and the resulting container has the expected signature.
 * System ffmpeg + libx264 is preferred for MP4. Playwright's stripped ffmpeg
 * is an honest VP8/WebM fallback when it is installed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_ENCODER_OUTPUT_BYTES = 1024 * 1024 * 512;
const require = createRequire(import.meta.url);

function executableWorks(binary) {
  const result = spawnSync(binary, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true });
  return !result.error && result.status === 0;
}

function availableEncoders(binary) {
  const result = spawnSync(binary, ['-hide_banner', '-encoders'], { encoding: 'utf8', windowsHide: true });
  return !result.error && result.status === 0 ? result.stdout : '';
}

function systemFfmpegCandidate() {
  const candidates = [process.env.FFMPEG, 'ffmpeg'].filter(Boolean);
  return candidates.find(executableWorks) ?? null;
}

function npmFfmpegCandidate() {
  try {
    const binary = require('ffmpeg-static');
    return typeof binary === 'string' && existsSync(binary) && executableWorks(binary) ? binary : null;
  } catch {
    return null;
  }
}

function playwrightRoots() {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  return [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
    home ? path.join(home, '.cache', 'ms-playwright') : null,
    '/opt/pw-browsers',
  ].filter(Boolean);
}

export function locatePlaywrightFfmpeg() {
  for (const root of playwrightRoots()) {
    if (!existsSync(root)) continue;
    let entries;
    try { entries = readdirSync(root); } catch { continue; }
    for (const entry of entries.filter((name) => /^ffmpeg-\d+$/.test(name)).sort().reverse()) {
      const dir = path.join(root, entry);
      for (const name of ['ffmpeg-win64.exe', 'ffmpeg-win32.exe', 'ffmpeg-linux', 'ffmpeg-mac-arm64', 'ffmpeg-mac']) {
        const candidate = path.join(dir, name);
        if (existsSync(candidate) && executableWorks(candidate)) return candidate;
      }
    }
  }
  return null;
}

export function detectCinematicEncoderCapability() {
  const npmStatic = npmFfmpegCandidate();
  if (npmStatic) {
    const encoders = availableEncoders(npmStatic);
    if (/\blibx264\b/.test(encoders)) {
      return { status: 'AVAILABLE', format: 'MP4', codec: 'H264', binary: npmStatic, source: 'NPM_FFMPEG_STATIC' };
    }
  }
  const system = systemFfmpegCandidate();
  if (system) {
    const encoders = availableEncoders(system);
    if (/\blibx264\b/.test(encoders)) {
      return { status: 'AVAILABLE', format: 'MP4', codec: 'H264', binary: system, source: 'SYSTEM_FFMPEG' };
    }
  }
  const bundled = locatePlaywrightFfmpeg();
  if (bundled) {
    const encoders = availableEncoders(bundled);
    if (/\blibvpx\b/.test(encoders)) {
      return { status: 'AVAILABLE', format: 'WEBM', codec: 'VP8', binary: bundled, source: 'PLAYWRIGHT_FFMPEG' };
    }
  }
  return {
    status: 'BLOCKED_BY_RUNTIME',
    format: null,
    codec: null,
    binary: null,
    source: null,
    reason: system
      ? 'Available ffmpeg runtimes have no libx264 encoder, and no Playwright ffmpeg with libvpx is available.'
      : 'No supported ffmpeg-static/system ffmpeg with libx264 or Playwright ffmpeg with libvpx is available.',
  };
}

function inspectContainer(filePath, format) {
  if (!existsSync(filePath)) return { ok: false, byteLength: 0, reason: 'output file is missing' };
  const byteLength = statSync(filePath).size;
  if (byteLength <= 12) return { ok: false, byteLength, reason: 'output file is empty or too small' };
  const prefix = readFileSync(filePath).subarray(0, 12);
  const matches = format === 'MP4'
    ? prefix.subarray(4, 8).toString('ascii') === 'ftyp'
    : prefix[0] === 0x1a && prefix[1] === 0x45 && prefix[2] === 0xdf && prefix[3] === 0xa3;
  return matches
    ? { ok: true, byteLength, reason: null }
    : { ok: false, byteLength, reason: `${format} container signature is missing` };
}

/** Encode real JPEG frames, preferring H.264/MP4 and falling back to VP8/WebM. */
export function encodeCinematicFrames(framePaths, outputBasePath, fps) {
  if (!Array.isArray(framePaths) || framePaths.length === 0) {
    return { status: 'BLOCKED_BY_INPUT', format: null, codec: null, outputPath: null, byteLength: null, frameCount: 0, note: 'No JPEG frames were supplied.' };
  }
  for (const framePath of framePaths) {
    if (!existsSync(framePath)) {
      return { status: 'BLOCKED_BY_INPUT', format: null, codec: null, outputPath: null, byteLength: null, frameCount: framePaths.length, note: `Frame is missing: ${framePath}` };
    }
  }
  const capability = detectCinematicEncoderCapability();
  if (capability.status !== 'AVAILABLE') {
    return { status: 'BLOCKED_BY_RUNTIME', format: null, codec: null, outputPath: null, byteLength: null, frameCount: framePaths.length, note: capability.reason };
  }

  const safeFps = Number.isFinite(fps) && fps > 0 ? Math.max(1, Math.min(120, fps)) : 24;
  const outputPath = `${outputBasePath}.${capability.format === 'MP4' ? 'mp4' : 'webm'}`;
  const workDir = mkdtempSync(path.join(tmpdir(), 'genesis-cinematic-video-'));
  const mjpegPath = path.join(workDir, 'frames.mjpeg');
  try {
    try { writeFileSync(mjpegPath, Buffer.concat(framePaths.map((framePath) => readFileSync(framePath)))); }
    catch (error) {
      return { status: 'BLOCKED_BY_INPUT', format: null, codec: null, outputPath: null, byteLength: null, frameCount: framePaths.length, note: `Frame read failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const codecArgs = capability.format === 'MP4'
      ? ['-c:v', 'libx264', '-movflags', '+faststart']
      : ['-c:v', 'libvpx'];
    const result = spawnSync(capability.binary, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(safeFps), '-vcodec', 'mjpeg', '-i', mjpegPath,
      // H.264 yuv420p requires even dimensions; clipped browser canvases can
      // be one CSS pixel odd (notably 9:16 after layout). Padding preserves
      // every rendered pixel instead of silently cropping the frame.
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', ...codecArgs, '-pix_fmt', 'yuv420p', outputPath,
    ], { maxBuffer: MAX_ENCODER_OUTPUT_BYTES, windowsHide: true });
    if (result.error || result.status !== 0) {
      const tail = result.stderr?.toString('utf8').slice(-1200) ?? String(result.error ?? 'unknown ffmpeg failure');
      return { status: 'BLOCKED_BY_RUNTIME', format: capability.format, codec: capability.codec, outputPath: null, byteLength: null, frameCount: framePaths.length, note: `ffmpeg exited ${result.status ?? 'null'}: ${tail}` };
    }
    const inspected = inspectContainer(outputPath, capability.format);
    if (!inspected.ok) {
      return { status: 'BLOCKED_BY_RUNTIME', format: capability.format, codec: capability.codec, outputPath: null, byteLength: inspected.byteLength, frameCount: framePaths.length, note: `Encoder returned success but ${inspected.reason}.` };
    }
    return {
      status: 'AVAILABLE', format: capability.format, codec: capability.codec,
      outputPath, byteLength: inspected.byteLength, frameCount: framePaths.length,
      note: `Real ${capability.codec}/${capability.format} encode via ${capability.source}.`,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv[2] === '--probe') {
    process.stdout.write(`${JSON.stringify(detectCinematicEncoderCapability())}\n`);
  } else if (process.argv[2] === '--encode-json') {
    let request;
    try { request = JSON.parse(process.argv[3] ?? '{}'); }
    catch (error) {
      process.stderr.write(`Invalid encoder request JSON: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
    if (request) {
      const result = encodeCinematicFrames(request.framePaths, request.outputBasePath, request.fps);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } else {
    process.stderr.write('Usage: node scripts/cinematic-video-encoder.mjs --probe | --encode-json <request-json>\n');
    process.exitCode = 2;
  }
}
