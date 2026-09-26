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
 *   Every frame and encoded film is committed through the page's canonical
 *   EvidenceLedger hook. The manifest only calls a video READY when the real
 *   encoder produced a non-empty container with a valid signature.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { detectCinematicEncoderCapability, encodeCinematicFrames } from './cinematic-video-encoder.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.TEMPORAL_OUT_DIR
  ? path.resolve(process.env.TEMPORAL_OUT_DIR)
  : path.join(REPO, 'artifacts', 'temporal-cinematic-e2e');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8181';
const WEATHER = process.env.TEMPORAL_WEATHER ?? 'CLEAR';
const CHROME = [process.env.GENESIS_CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => p !== undefined && existsSync(p));
const requestedFrameCount = Number(process.env.TEMPORAL_FRAME_COUNT ?? 6);
const requestedDuration = Number(process.env.TEMPORAL_DURATION_SECONDS ?? 3);
const FRAME_COUNT = Number.isFinite(requestedFrameCount) ? Math.max(2, Math.min(7200, Math.round(requestedFrameCount))) : 6;
const DURATION_SECONDS = Number.isFinite(requestedDuration) ? Math.max(0.05, requestedDuration) : 3;
const FPS = Math.max(1, FRAME_COUNT / Math.max(0.001, DURATION_SECONDS));
const ASPECT = process.env.TEMPORAL_ASPECT ?? '16:9';
const VIEWPORTS = { '16:9': { width: 1280, height: 720 }, '9:16': { width: 720, height: 1280 }, '1:1': { width: 900, height: 900 } };
const VIEWPORT = VIEWPORTS[ASPECT];
if (!VIEWPORT) throw new Error(`Unsupported TEMPORAL_ASPECT=${ASPECT}; expected 16:9, 9:16 or 1:1`);

const DEFAULT_SCENES = [
  { place: 'Warsaw', year: 1900, dirName: 'warsaw-1900', prompt: 'Create a historical Warsaw 1900 cinematic reconstruction.' },
  { place: 'Warsaw', year: 2026, dirName: 'warsaw-2026', prompt: 'Create a modern Warsaw 2026 cinematic reconstruction.' },
];

function requestedScenes() {
  if (!process.env.TEMPORAL_SCENES_JSON) return DEFAULT_SCENES;
  let parsed;
  try { parsed = JSON.parse(process.env.TEMPORAL_SCENES_JSON); }
  catch (error) { throw new Error(`TEMPORAL_SCENES_JSON is invalid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('TEMPORAL_SCENES_JSON must be a non-empty array');
  return parsed.map((scene, index) => {
    if (!scene || typeof scene.place !== 'string' || !Number.isFinite(scene.year) || typeof scene.dirName !== 'string') {
      throw new Error(`TEMPORAL_SCENES_JSON[${index}] requires place, finite year and dirName`);
    }
    if (scene.promptResolutionEvidenceHash !== undefined && !/^[a-f0-9]{64}$/i.test(scene.promptResolutionEvidenceHash)) {
      throw new Error(`TEMPORAL_SCENES_JSON[${index}].promptResolutionEvidenceHash must be a SHA-256 hash`);
    }
    return {
      place: scene.place,
      year: scene.year,
      dirName: scene.dirName.replace(/[^a-z0-9_-]/gi, '-'),
      prompt: typeof scene.prompt === 'string' ? scene.prompt : null,
      promptResolutionEvidenceHash: scene.promptResolutionEvidenceHash ?? null,
    };
  });
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

function sha256File(filePath) { return createHash('sha256').update(readFileSync(filePath)).digest('hex'); }

async function captureScene(browser, { place, year, dirName, prompt, promptResolutionEvidenceHash = null }) {
  const dir = path.join(OUT_DIR, dirName);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const url = `${BASE}/#/temporal-cinematic?place=${encodeURIComponent(place)}&year=${year}&duration=${DURATION_SECONDS}&road=1&weather=${encodeURIComponent(WEATHER)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__GENESIS_TEMPORAL_CAPTURE__?.ready === true, undefined, { timeout: 20_000 });
  const hook = await page.evaluate(() => {
    const h = window.__GENESIS_TEMPORAL_CAPTURE__;
    return h ? { ready: h.ready, place: h.place, year: h.year, durationSeconds: h.durationSeconds, sameStreetLocation: h.sameStreetLocation, presentation: h.getPresentationSummary?.() ?? null } : null;
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
    const artifactSha256 = sha256File(framePath);
    const evidence = await page.evaluate(({ seconds, artifactFile, artifactSha256: sha }) => {
      const h = window.__GENESIS_TEMPORAL_CAPTURE__;
      if (!h?.recordCaptureArtifact) throw new Error('canonical Evidence capture hook unavailable');
      return h.recordCaptureArtifact({ seconds, artifactFile, artifactSha256: sha });
    }, { seconds: t, artifactFile: path.relative(REPO, framePath).replaceAll('\\', '/'), artifactSha256 });
    frames.push({ t, path: framePath, bytes: statSync(framePath).size, sha256: artifactSha256, ...evidence });
  }

  const video = encodeCinematicFrames(frames.map((frame) => frame.path), path.join(OUT_DIR, dirName), FPS);
  let videoEvidence = null;
  let videoArtifact = video;
  if (video.status === 'AVAILABLE' && video.outputPath) {
    const artifactSha256 = sha256File(video.outputPath);
    videoEvidence = await page.evaluate(({ seconds, artifactFile, artifactSha256: sha }) => {
      const h = window.__GENESIS_TEMPORAL_CAPTURE__;
      if (!h?.recordCaptureArtifact) throw new Error('canonical Evidence capture hook unavailable');
      return h.recordCaptureArtifact({ seconds, artifactFile, artifactSha256: sha });
    }, { seconds: DURATION_SECONDS, artifactFile: path.relative(REPO, video.outputPath).replaceAll('\\', '/'), artifactSha256 });
    videoArtifact = { ...video, sha256: artifactSha256, ...videoEvidence };
  }

  await context.close();
  return {
    prompt,
    worldDerivation: promptResolutionEvidenceHash ? 'PROMPT_RESOLUTION_EVIDENCED' : 'CANONICAL_TEMPORAL_ROUTE_PARAMETERS',
    promptResolutionEvidenceHash,
    place,
    year,
    hook,
    hasWebGL,
    frames,
    pageErrors,
    video: videoArtifact,
    cameraPlan: {
      source: 'window.__GENESIS_TEMPORAL_CAPTURE__',
      mode: 'CINEMATIC',
      durationSeconds: DURATION_SECONDS,
      fps: FPS,
      frameTimesSeconds: frames.map((frame) => frame.t),
      aspectRatio: ASPECT,
      viewport: VIEWPORT,
      presentation: hook?.presentation ?? null,
    },
    subtitles: { status: 'METADATA_ONLY', cues: [] },
    narration: { status: 'METADATA_ONLY', track: null },
    evidence: { frameHashes: frames.map((frame) => frame.evidenceHash), videoHash: videoEvidence?.evidenceHash ?? null },
  };
}

console.log('GENESIS — Temporal Cinematic V5.1 — real canonical browser capture');
console.log(`base=${BASE} weather=${WEATHER} frames=${FRAME_COUNT} duration=${DURATION_SECONDS}s`);

const launchOptions = CHROME ? { headless: true, executablePath: CHROME, args: ['--no-sandbox'] } : { headless: true, args: ['--no-sandbox'] };
const browser = await chromium.launch(launchOptions);
const sceneRequests = requestedScenes();
const scenes = [];
for (const request of sceneRequests) scenes.push(await captureScene(browser, request));
await browser.close();

const bytesEqual = (a, b) => {
  const aa = readFileSync(a), bb = readFileSync(b);
  return aa.length === bb.length && aa.equals(bb);
};
const sameSceneMotion = scenes.every((scene) => !bytesEqual(scene.frames[0].path, scene.frames.at(-1).path));
const skylineDiffers = scenes.length >= 2 ? !bytesEqual(scenes[0].frames[0].path, scenes[1].frames[0].path) : null;

const encoderCapability = detectCinematicEncoderCapability();
const videoStatus = scenes.every((scene) => scene.video.status === 'AVAILABLE')
  ? { code: 'READY', format: scenes[0].video.format, reason: scenes.map((scene) => scene.video.note).join('; ') }
  : { code: 'BLOCKED_BY_RUNTIME', format: null, reason: scenes.map((scene) => scene.video.note).join('; ') };

const manifest = {
  capturedAt: new Date().toISOString(),
  base: BASE,
  weather: WEATHER,
  aspectRatio: ASPECT,
  encoderCapability,
  frameCount: FRAME_COUNT,
  durationSeconds: DURATION_SECONDS,
  scenes: scenes.map((s) => ({
    prompt: s.prompt,
    worldDerivation: s.worldDerivation,
    promptResolutionEvidenceHash: s.promptResolutionEvidenceHash,
    place: s.place,
    year: s.year,
    hook: s.hook,
    hasWebGL: s.hasWebGL,
    cameraPlan: s.cameraPlan,
    subtitles: s.subtitles,
    narration: s.narration,
    frames: s.frames.map((f) => ({ t: f.t, path: path.relative(REPO, f.path).replaceAll('\\', '/'), bytes: f.bytes, sha256: f.sha256, evidenceHash: f.evidenceHash, semanticFingerprint: f.semanticFingerprint })),
    video: s.video.outputPath ? { ...s.video, outputPath: path.relative(REPO, s.video.outputPath).replaceAll('\\', '/') } : s.video,
    evidence: s.evidence,
    pageErrors: s.pageErrors,
  })),
  realPixelProof: { sameSceneMotion, skylineDiffers },
  video: videoStatus,
};
writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const ok = scenes.every((scene) => scene.hasWebGL && scene.pageErrors.length === 0)
  && sameSceneMotion && skylineDiffers !== false && videoStatus.code === 'READY';

for (const scene of scenes) console.log(`${scene.place}/${scene.year}: webgl=${scene.hasWebGL} frames=${scene.frames.length} errors=${scene.pageErrors.length}`);
console.log(`same-scene motion=${sameSceneMotion} skyline differs=${skylineDiffers}`);
console.log(`video=${videoStatus.code}${videoStatus.format ? `/${videoStatus.format}` : ''} — ${videoStatus.reason}`);
console.log(ok ? 'PASSED: canonical browser/WebGL capture produced real distinct frames and verified video artifacts.' : `FAILED: inspect ${path.join(OUT_DIR, 'manifest.json')}`);
process.exit(ok ? 0 : 1);
