#!/usr/bin/env node
/**
 * GENESIS — TEMPORAL CINEMATIC V5.1 — REAL CANONICAL BROWSER CAPTURE.
 *
 * Drives ONLY the canonical `#/temporal-cinematic` route and its object-shaped
 * `window.__GENESIS_TEMPORAL_CAPTURE__` hook. No HistoricalWorldState payload is injected from Node;
 * the browser renders the canonical WorldGraph/WorldFrameRenderer scene and Node only seeks time.
 *
 * Output:
 *   artifacts/temporal-cinematic-e2e/warsaw-1900/*.jpg
 *   artifacts/temporal-cinematic-e2e/warsaw-2026/*.jpg
 *   MP4/H.264 when system ffmpeg exists, otherwise WEBM/VP8 when Playwright's bundled ffmpeg exists.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO, 'artifacts', 'temporal-cinematic-e2e');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8181';
const WEATHER = process.env.TEMPORAL_WEATHER ?? 'CLEAR';
const CHROME = [process.env.GENESIS_CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => p !== undefined && existsSync(p));
const FRAME_COUNT = Number(process.env.TEMPORAL_FRAME_COUNT ?? 6);
const DURATION_SECONDS = Number(process.env.TEMPORAL_DURATION_SECONDS ?? 3);
const FPS = Math.max(1, FRAME_COUNT / Math.max(0.001, DURATION_SECONDS));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

function systemFfmpegAvailable() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function locatePlaywrightBundledFfmpeg() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries;
    try { entries = readdirSync(root); } catch { continue; }
    for (const entry of entries.filter((name) => /^ffmpeg-\d+$/.test(name)).sort().reverse()) {
      const dir = path.join(root, entry);
      for (const name of ['ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg-mac-arm64', 'ffmpeg-win64.exe', 'ffmpeg-win32.exe']) {
        const candidate = path.join(dir, name);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function encodeBundledWebm(framePaths, outputPath, fps) {
  const binary = locatePlaywrightBundledFfmpeg();
  if (!binary) return { code: 'BLOCKED_BY_RUNTIME', reason: 'no system ffmpeg and no Playwright-bundled ffmpeg found' };
  const workDir = mkdtempSync(path.join(tmpdir(), 'genesis-tc-v51-'));
  const stream = path.join(workDir, 'frames.mjpeg');
  try {
    writeFileSync(stream, Buffer.concat(framePaths.map((p) => readFileSync(p))));
    const result = spawnSync(binary, [
      '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', stream,
      '-c:v', 'libvpx', '-pix_fmt', 'yuv420p', outputPath,
    ], { maxBuffer: 1024 * 1024 * 512 });
    if (result.error || result.status !== 0) {
      return { code: 'BLOCKED_BY_RUNTIME', reason: `bundled ffmpeg failed: ${result.stderr?.toString('utf8').slice(-900) ?? result.error ?? 'unknown'}` };
    }
    const bytes = statSync(outputPath).size;
    return bytes > 0
      ? { code: 'READY', format: 'WEBM', reason: `Playwright-bundled ffmpeg produced ${bytes} bytes` }
      : { code: 'BLOCKED_BY_RUNTIME', reason: 'bundled ffmpeg returned success but produced a zero-byte file' };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function captureScene(browser, { place, year, dirName }) {
  const dir = path.join(OUT_DIR, dirName);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const url = `${BASE}/#/temporal-cinematic?place=${encodeURIComponent(place)}&year=${year}&duration=${DURATION_SECONDS}&road=1&weather=${encodeURIComponent(WEATHER)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__GENESIS_TEMPORAL_CAPTURE__?.ready === true, undefined, { timeout: 20_000 });
  const hook = await page.evaluate(() => {
    const h = window.__GENESIS_TEMPORAL_CAPTURE__;
    return h ? { ready: h.ready, place: h.place, year: h.year, durationSeconds: h.durationSeconds, sameStreetLocation: h.sameStreetLocation } : null;
  });
  const canvas = page.locator('canvas[data-testid="temporal-cinematic-canvas"]');
  await canvas.waitFor({ state: 'visible', timeout: 20_000 });
  const hasWebGL = await page.evaluate(() => {
    const el = document.querySelector('canvas[data-testid="temporal-cinematic-canvas"]');
    if (!(el instanceof HTMLCanvasElement)) return false;
    return el.getContext('webgl2') !== null || el.getContext('webgl') !== null;
  });

  // `locator.screenshot()`/`elementHandle.screenshot()` on this canvas measured 12-31s even for a
  // STATIC scene under this sandbox's software-rendered WebGL (no real GPU), and never completed at
  // all (60s+) once the weather rig's particles keep the canvas continuously animating — Playwright's
  // element-screenshot path appears to include a paint/actionability stability wait that a
  // perpetually-repainting <canvas> under rAF never satisfies. `page.screenshot({clip})` measured a
  // reliable ~12s regardless of motion (verified against both CLEAR and an animating scene), so frame
  // capture uses that path instead — same pixels, same canvas, just a different Playwright API to
  // read them. Real GPU environments make this distinction moot (both paths are near-instant there).
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('canonical canvas has no bounding box');

  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const t = FRAME_COUNT <= 1 ? 0 : (i / (FRAME_COUNT - 1)) * DURATION_SECONDS;
    await page.evaluate(async (seconds) => {
      window.__GENESIS_TEMPORAL_CAPTURE__?.seekTo(seconds);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, t);
    const framePath = path.join(dir, `frame-${String(i).padStart(3, '0')}.jpg`);
    await page.screenshot({ path: framePath, type: 'jpeg', quality: 94, clip: canvasBox, timeout: 60_000 });
    frames.push({ t, path: framePath, bytes: statSync(framePath).size });
  }

  await context.close();
  return { place, year, hook, hasWebGL, frames, pageErrors };
}

console.log('GENESIS — Temporal Cinematic V5.1 — real canonical browser capture');
console.log(`base=${BASE} weather=${WEATHER} frames=${FRAME_COUNT} duration=${DURATION_SECONDS}s`);

const launchOptions = CHROME ? { headless: true, executablePath: CHROME, args: ['--no-sandbox'] } : { headless: true, args: ['--no-sandbox'] };
const browser = await chromium.launch(launchOptions);
const sceneA = await captureScene(browser, { place: 'Warsaw', year: 1900, dirName: 'warsaw-1900' });
const sceneB = await captureScene(browser, { place: 'Warsaw', year: 2026, dirName: 'warsaw-2026' });
await browser.close();

const bytesEqual = (a, b) => {
  const aa = readFileSync(a), bb = readFileSync(b);
  return aa.length === bb.length && aa.equals(bb);
};
const sameSceneMotion = !bytesEqual(sceneA.frames[0].path, sceneA.frames.at(-1).path);
const skylineDiffers = !bytesEqual(sceneA.frames[0].path, sceneB.frames[0].path);

let videoStatus;
if (systemFfmpegAvailable()) {
  for (const dirName of ['warsaw-1900', 'warsaw-2026']) {
    execFileSync('ffmpeg', [
      '-y', '-framerate', String(FPS), '-i', path.join(OUT_DIR, dirName, 'frame-%03d.jpg'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(OUT_DIR, `${dirName}.mp4`),
    ], { stdio: 'ignore' });
  }
  videoStatus = { code: 'READY', format: 'MP4', reason: 'system ffmpeg encoded real H.264 MP4 files' };
} else {
  const results = [];
  for (const scene of [sceneA, sceneB]) {
    results.push(encodeBundledWebm(scene.frames.map((f) => f.path), path.join(OUT_DIR, `${scene.year === 1900 ? 'warsaw-1900' : 'warsaw-2026'}.webm`), FPS));
  }
  videoStatus = results.every((r) => r.code === 'READY')
    ? { code: 'READY', format: 'WEBM', reason: results.map((r) => r.reason).join('; ') }
    : { code: 'BLOCKED_BY_RUNTIME', reason: results.map((r) => r.reason).join('; ') };
}

const manifest = {
  capturedAt: new Date().toISOString(),
  base: BASE,
  weather: WEATHER,
  frameCount: FRAME_COUNT,
  durationSeconds: DURATION_SECONDS,
  scenes: [sceneA, sceneB].map((s) => ({ place: s.place, year: s.year, hook: s.hook, hasWebGL: s.hasWebGL, frames: s.frames.map((f) => ({ t: f.t, bytes: f.bytes })), pageErrors: s.pageErrors })),
  realPixelProof: { sameSceneMotion, skylineDiffers },
  video: videoStatus,
};
writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const ok = sceneA.hasWebGL && sceneB.hasWebGL
  && sceneA.pageErrors.length === 0 && sceneB.pageErrors.length === 0
  && sameSceneMotion && skylineDiffers;

console.log(`1900: webgl=${sceneA.hasWebGL} frames=${sceneA.frames.length} errors=${sceneA.pageErrors.length}`);
console.log(`2026: webgl=${sceneB.hasWebGL} frames=${sceneB.frames.length} errors=${sceneB.pageErrors.length}`);
console.log(`same-scene motion=${sameSceneMotion} skyline differs=${skylineDiffers}`);
console.log(`video=${videoStatus.code}${videoStatus.format ? `/${videoStatus.format}` : ''} — ${videoStatus.reason}`);
console.log(ok ? 'PASSED: canonical browser/WebGL capture produced real distinct frames.' : 'FAILED: inspect artifacts/temporal-cinematic-e2e/manifest.json');
process.exit(ok ? 0 : 1);
