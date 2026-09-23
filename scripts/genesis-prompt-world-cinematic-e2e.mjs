#!/usr/bin/env node
/**
 * Real prompt-world → canonical WorldGraph → THREE.js pixels → H.264/MP4 proof.
 * The browser owns world generation, rendering, camera seeking and Evidence.
 * Node only captures the canvas and invokes the existing canonical encoder.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { detectCinematicEncoderCapability, encodeCinematicFrames } from './cinematic-video-encoder.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:5000';
const OUT = path.resolve(process.env.GENESIS_PROMPT_FILM_OUT ?? path.join(REPO, 'artifacts', 'vision-review', 'prompt-world-films'));
const FRAME_COUNT = Math.max(3, Math.min(48, Number(process.env.GENESIS_PROMPT_FILM_FRAMES ?? 24)));
const DURATION_SECONDS = Math.max(1, Number(process.env.GENESIS_PROMPT_FILM_DURATION ?? 4));
const FPS = FRAME_COUNT / DURATION_SECONDS;
const executablePath = process.env.CHROMIUM_PATH
  ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);

const ALL_CASES = [
  ['wormhole', 'Generate an Einstein-Rosen bridge and create a cinematic flythrough.', 'EINSTEIN_ROSEN_BRIDGE', 'WORMHOLE_RINGS'],
  ['boston', 'Create a historical Boston battle reconstruction with people, streets, smoke and cinematic shots.', 'HISTORICAL_RECONSTRUCTION', 'HISTORICAL_CITY'],
  ['alien-desert', 'Create a desert alien planet with ruins and two suns.', 'DESERT_ALIEN', 'ALIEN_DESERT'],
  ['mars', 'Create a Mars research world.', 'MARS_RESEARCH', 'MARS_STATION'],
  ['quantum', 'Create a quantum world showing superposition and tunneling.', 'QUANTUM', 'QUANTUM_BARRIER'],
  ['cosmology', 'Create a cosmology world showing gravity wells, dark matter and time dilation.', 'COSMOLOGY_SPACETIME', 'GRAVITY_WELL_GRID'],
  ['timelines', 'Create 5 alternative timeline worlds.', 'MULTIVERSE_BRANCH', 'TIMELINE_BRANCHES'],
  ['time-dilation', 'Create a time dilation laboratory with relativistic clocks.', 'TIME_DILATION_LAB', 'RELATIVISTIC_CLOCKS'],
  ['underwater', 'Create a cinematic underwater research city.', 'UNDERWATER_RESEARCH_CITY', 'UNDERWATER_CITY'],
];

// Final release validation normally needs one representative film, while the
// broader visual audit can still request every case. Keeping selection here
// avoids a second capture pipeline and prevents an eight-film render when a
// caller deliberately asks for a cheap, focused proof.
const requestedCases = (process.env.GENESIS_PROMPT_FILM_CASES ?? 'all')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CASES = requestedCases.includes('all')
  ? ALL_CASES
  : ALL_CASES.filter(([slug]) => requestedCases.includes(slug));
if (CASES.length === 0) {
  throw new Error(`GENESIS_PROMPT_FILM_CASES did not match a known case: ${requestedCases.join(', ')}`);
}

const sha256File = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex');
const distinct = (values) => new Set(values).size === values.length;

function decoderCheck(capability, videoPath) {
  if (capability.status !== 'AVAILABLE' || !videoPath) return { ok: false, reason: 'encoder unavailable or video missing' };
  const result = spawnSync(capability.binary, ['-hide_banner', '-v', 'error', '-i', videoPath, '-f', 'null', '-'], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  return result.status === 0 && !result.error
    ? { ok: true, reason: null }
    : { ok: false, reason: result.stderr?.slice(-1_200) || String(result.error ?? `decoder exited ${result.status}`) };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
const encoderCapability = detectCinematicEncoderCapability();
const report = { capturedAt: new Date().toISOString(), base: BASE, browser: browser.version(), encoderCapability, frameCount: FRAME_COUNT, durationSeconds: DURATION_SECONDS, films: [], expectedFallbacks: [], errors: [] };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error)}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    const detail = `${response.status()} ${url.pathname}`;
    // The C3/Astra proposer is optional. Without provider credentials the UI
    // deliberately falls back to the deterministic canonical parser. Record
    // that boundary without turning a successful fail-closed film run red.
    if (url.pathname === '/api/c3/world-proposal' && response.status() >= 500) report.expectedFallbacks.push(detail);
    else report.errors.push(`http: ${detail}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Chromium emits this generic line for every non-2xx response; the
    // response listener above retains the actionable URL/status.
    if (message.text().startsWith('Failed to load resource:')) return;
    report.errors.push(`console: ${message.text()}`);
  });
  await page.goto(`${BASE}/#/world-director`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => window.__GENESIS_WORLD_DIRECTOR__?.ready === true, undefined, { timeout: 90_000 });

  for (const [slug, prompt, template, descriptorKind] of CASES) {
    const filmDir = path.join(OUT, slug);
    mkdirSync(filmDir, { recursive: true });
    await page.getByTestId('world-director-prompt').fill(prompt);
    await page.getByTestId('world-director-generate').click();
    await page.waitForFunction(({ expectedTemplate, expectedKind }) => {
      const hook = window.__GENESIS_WORLD_DIRECTOR__;
      const product = hook?.getProductWorld();
      return hook?.ready === true && product?.template === expectedTemplate && product.descriptor.kind === expectedKind;
    }, { expectedTemplate: template, expectedKind: descriptorKind }, { timeout: 90_000 });

    const canvas = page.getByTestId('world-director-canvas');
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error(`${slug}: canvas has no bounding box`);
    const hookState = await page.evaluate(() => {
      const hook = window.__GENESIS_WORLD_DIRECTOR__;
      if (!hook) throw new Error('WORLD_DIRECTOR_HOOK_MISSING');
      return { worldId: hook.worldId, durationSeconds: hook.durationSeconds, evidenceHash: hook.evidenceHash, product: hook.getProductWorld(), presentation: hook.getPresentationSummary() };
    });
    const captureDuration = Math.min(DURATION_SECONDS, hookState.durationSeconds);
    const frames = [];
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      const seconds = (index / (FRAME_COUNT - 1)) * captureDuration;
      await page.evaluate((time) => window.__GENESIS_WORLD_DIRECTOR__?.seekAndWait(time), seconds);
      const framePath = path.join(filmDir, `frame-${String(index).padStart(3, '0')}.jpg`);
      await page.screenshot({ path: framePath, type: 'jpeg', quality: 94, clip: canvasBox, timeout: 60_000 });
      const sha256 = sha256File(framePath);
      const evidence = await page.evaluate(({ time, artifactFile, artifactSha256 }) => {
        const hook = window.__GENESIS_WORLD_DIRECTOR__;
        if (!hook?.recordCaptureArtifact) throw new Error('WORLD_DIRECTOR_CAPTURE_HOOK_MISSING');
        return hook.recordCaptureArtifact({ seconds: time, artifactFile, artifactSha256 });
      }, { time: seconds, artifactFile: path.relative(REPO, framePath).replaceAll('\\', '/'), artifactSha256: sha256 });
      frames.push({ seconds, path: framePath, bytes: statSync(framePath).size, sha256, ...evidence });
    }

    const encoded = encodeCinematicFrames(frames.map((frame) => frame.path), path.join(OUT, slug), FPS);
    let video = encoded;
    let decoder = { ok: false, reason: encoded.note };
    if (encoded.status === 'AVAILABLE' && encoded.outputPath) {
      const sha256 = sha256File(encoded.outputPath);
      const evidence = await page.evaluate(({ time, artifactFile, artifactSha256 }) => {
        const hook = window.__GENESIS_WORLD_DIRECTOR__;
        if (!hook?.recordCaptureArtifact) throw new Error('WORLD_DIRECTOR_CAPTURE_HOOK_MISSING');
        return hook.recordCaptureArtifact({ seconds: time, artifactFile, artifactSha256 });
      }, { time: captureDuration, artifactFile: path.relative(REPO, encoded.outputPath).replaceAll('\\', '/'), artifactSha256: sha256 });
      decoder = decoderCheck(encoderCapability, encoded.outputPath);
      video = { ...encoded, sha256, ...evidence };
    }
    const frameHashesDistinct = distinct(frames.map((frame) => frame.sha256));
    const film = {
      slug, prompt, template, descriptorKind, hookState,
      cameraPlan: { source: 'canonical Spacetime CameraPath', mode: 'CINEMATIC', durationSeconds: captureDuration, fps: FPS, aspectRatio: '16:9', frameTimesSeconds: frames.map((frame) => frame.seconds) },
      frames: frames.map((frame) => ({ ...frame, path: path.relative(REPO, frame.path).replaceAll('\\', '/') })),
      video: video.outputPath ? { ...video, outputPath: path.relative(REPO, video.outputPath).replaceAll('\\', '/') } : video,
      decoder,
      frameHashesDistinct,
      subtitles: { status: 'METADATA_ONLY', cues: [] },
      narration: { status: 'METADATA_ONLY', track: null },
    };
    report.films.push(film);
    writeFileSync(path.join(filmDir, 'manifest.json'), `${JSON.stringify(film, null, 2)}\n`);
  }
  await context.close();
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

const ok = report.films.length === CASES.length
  && report.errors.length === 0
  && report.films.every((film) => film.frameHashesDistinct && film.video.status === 'AVAILABLE' && film.video.format === 'MP4' && film.video.codec === 'H264' && film.decoder.ok && /^[a-f0-9]{64}$/i.test(film.video.sha256) && /^[a-f0-9]{64}$/i.test(film.video.evidenceHash));
writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify({ ...report, status: ok ? 'PASS' : 'FAIL' }, null, 2)}\n`);
for (const film of report.films) console.log(`${film.slug}: frames=${film.frames.length} distinct=${film.frameHashesDistinct} video=${film.video.status}/${film.video.format ?? '-'} decoder=${film.decoder.ok}`);
console.log(ok
  ? `PASSED: ${CASES.length} prompt world(s) produced real canonical H264/MP4 film(s) with Evidence.`
  : `FAILED: inspect ${path.join(OUT, 'manifest.json')}`);
process.exit(ok ? 0 : 1);
