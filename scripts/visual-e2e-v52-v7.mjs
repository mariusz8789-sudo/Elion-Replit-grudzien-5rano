#!/usr/bin/env node
/**
 * V5.2 → V7 real browser acceptance. Requires a running Genesis preview server.
 * It does not mock WebGL, WorldGraph, the Human Explorer, experiment sessions or screenshots.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'artifacts', 'visual-e2e-v52-v7');
const BASE = (process.env.E2E_BASE ?? 'http://127.0.0.1:8181').replace(/\/$/, '');
const CHROME = [process.env.GENESIS_CHROMIUM_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => p && existsSync(p));

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const report = { capturedAt: new Date().toISOString(), base: BASE, chromium: CHROME ?? 'playwright-managed', checks: {}, artifacts: [], failures: [] };

function nonEmptyDifferent(a, b) {
  const aa = readFileSync(a); const bb = readFileSync(b);
  return aa.length > 0 && bb.length > 0 && !aa.equals(bb);
}
async function twoRaf(page) { await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function browserLaunch() {
  return chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}) });
}
async function newPage(browser, viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { context, page, errors };
}
async function hasWebgl(page, selector) {
  return page.evaluate((s) => { const c = document.querySelector(s); if (!(c instanceof HTMLCanvasElement)) return false; return Boolean(c.getContext('webgl2') || c.getContext('webgl')); }, selector);
}

async function captureTemporal(browser, name, query) {
  const { context, page, errors } = await newPage(browser);
  const url = `${BASE}/#/temporal-cinematic?${new URLSearchParams(query).toString()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__GENESIS_TEMPORAL_CAPTURE__?.ready === true, undefined, { timeout: 25_000 });
  const canvasSel = 'canvas[data-testid="temporal-cinematic-canvas"]';
  await page.locator(canvasSel).waitFor({ state: 'visible', timeout: 20_000 });
  const summary = await page.evaluate(() => window.__GENESIS_TEMPORAL_CAPTURE__?.getPresentationSummary?.() ?? null);
  const webgl = await hasWebgl(page, canvasSel);
  const duration = Number(query.duration ?? 3);
  // A software-rendered (no GPU) canvas under continuous weather-particle animation never settles
  // Playwright's element/locator screenshot stability wait (observed to hang past 60s under RAIN).
  // page.screenshot({clip}) on a boundingBox computed once avoids that wait entirely.
  const canvasBox = await page.locator(canvasSel).boundingBox();
  if (!canvasBox) throw new Error('canonical canvas has no bounding box');
  const files = [];
  for (const [i, t] of [0, duration * 0.52, duration].entries()) {
    await page.evaluate(async (seconds) => {
      const h = window.__GENESIS_TEMPORAL_CAPTURE__;
      if (!h) throw new Error('canonical capture hook missing');
      if (h.seekAndWait) await h.seekAndWait(seconds); else { h.seekTo(seconds); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
    }, t);
    const file = path.join(OUT, `${name}-${i}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 94, clip: canvasBox, timeout: 60_000 }); files.push(file); report.artifacts.push(file);
  }
  const moved = nonEmptyDifferent(files[0], files[2]);
  await context.close();
  return { url, summary, webgl, errors, moved, files };
}

async function captureBiology(browser) {
  const { context, page, errors } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(`${BASE}/#/human-biology-lab`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('canvas[data-testid="sw-canvas"]').waitFor({ state: 'visible', timeout: 25_000 });
  await page.locator('[data-testid="sw-explorer"]').waitFor({ state: 'visible', timeout: 25_000 });
  const webgl = await hasWebgl(page, 'canvas[data-testid="sw-canvas"]');
  await page.waitForFunction(() => {
    const twin = document.querySelector('[data-testid="sw-twin"]');
    return twin?.getAttribute('data-load-state') === 'READY' && twin.getAttribute('data-tier') === 'LICENSED_CC0_ASSET';
  }, null, { timeout: 90_000 });

  await page.locator('[data-testid="sw-explorer-twin-camera"]').click();
  await page.locator('[data-testid="sw-explorer-organ-heart"]').click();
  await twoRaf(page);
  const organ = path.join(OUT, 'biology-organ.jpg'); await page.screenshot({ path: organ, type: 'jpeg', quality: 92 }); report.artifacts.push(organ);

  // Each rung click re-runs the agent's own NAVIGATE->ALIGN->REACH->INTERACT->...->OBSERVING state
  // machine in real simulated time. Measured directly on this sandbox's software-rendered (no GPU)
  // WebGL: the organ->tissue transition alone took 159s. The delivered 120-150s stage timeouts were
  // too tight and produced a false failure; 240s matches the observed real duration with headroom.
  const stages = [
    { testId: 'sw-explorer-rung-tissue', level: 'tissue', macro: 'tissue', file: 'biology-tissue.jpg', timeout: 240_000 },
    { testId: 'sw-explorer-rung-cell', level: 'cell', macro: 'cell', file: 'biology-cell.jpg', timeout: 240_000 },
    { testId: 'sw-explorer-rung-organelle', level: 'organelle', macro: 'organelle', file: 'biology-organelle.jpg', timeout: 240_000 },
    // Existing Human Explorer maps central-dogma session display to the DNA rung; V7's 3D layer
    // intentionally reports the visual as "molecule" because it shows DNA + the real peptide chain.
    { testId: 'sw-explorer-rung-molecule', level: 'molecule', macro: 'molecule', file: 'biology-molecule.jpg', timeout: 240_000 },
  ];
  const stageResults = [];
  for (const stage of stages) {
    const button = page.locator(`[data-testid="${stage.testId}"]`);
    await button.waitFor({ state: 'visible', timeout: 20_000 });
    // The rung only enables once the agent's own NAVIGATE->ALIGN->REACH->INTERACT->ARRIVE->IDLE state
    // machine finishes the previous command in real simulated time; measured at ~127s for the first
    // organ selection on this sandbox's software-rendered (no GPU) WebGL. 90s was too tight and
    // produced a false failure. 210s matches this repo's existing precedent for slow first-resource
    // waits in this same sandbox (capture-mockup-plates.mjs's 180s licensed-asset wait) with headroom.
    await page.waitForFunction((id) => { const b = document.querySelector(`[data-testid="${id}"]`); return b instanceof HTMLButtonElement && !b.disabled; }, stage.testId, { timeout: 210_000 });
    await button.click();
    await page.waitForFunction(({ level, macro }) => {
      const explorer = document.querySelector('[data-testid="sw-explorer"]');
      const main = document.querySelector('[data-testid="scientific-worlds"]');
      return explorer?.getAttribute('data-level') === level && main?.getAttribute('data-macro-level') === macro;
    }, { level: stage.level, macro: stage.macro }, { timeout: stage.timeout });
    await twoRaf(page);
    const file = path.join(OUT, stage.file); await page.screenshot({ path: file, type: 'jpeg', quality: 92 }); report.artifacts.push(file);
    stageResults.push({ level: stage.level, macro: stage.macro, file, changedFromOrgan: nonEmptyDifferent(organ, file) });
  }
  await context.close();
  return { webgl, errors, stageResults };
}

let browser;
try {
  browser = await browserLaunch();
  const street = await captureTemporal(browser, 'street-rain', { place: 'Warsaw', year: '2026', duration: '3', road: '1', weather: 'RAIN', view: 'street' });
  report.checks.street = street;
  let interior = null;
  for (const place of ['Geneva', 'Cambridge', 'Oxford', 'Zurich', 'Berlin', 'Barcelona', 'Tokyo', 'Boston']) {
    const attempt = await captureTemporal(browser, `scientific-interior-${place.toLowerCase()}`, { place, year: '2026', duration: '3', road: '1', view: 'interior', interiors: '1' });
    interior = attempt;
    if ((attempt.summary?.interiorAssetSlotCount ?? 0) > 0) break;
  }
  report.checks.interior = interior;
  const biology = await captureBiology(browser);
  report.checks.biology = biology;

  const streetOk = street.webgl && street.errors.length === 0 && street.moved && street.summary?.viewMode === 'street' && street.summary?.livingWorld === true;
  const interiorOk = Boolean(interior && interior.webgl && interior.errors.length === 0 && interior.moved && interior.summary?.viewMode === 'interior' && typeof interior.summary?.interiorRoomId === 'string' && (interior.summary?.interiorAssetSlotCount ?? 0) > 0);
  const biologyOk = biology.webgl && biology.errors.length === 0 && biology.stageResults.length === 4 && biology.stageResults.every((s) => s.changedFromOrgan);
  report.checks.acceptance = { streetOk, interiorOk, biologyOk };
  writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (!(streetOk && interiorOk && biologyOk)) throw new Error(`acceptance failed: ${JSON.stringify({ streetOk, interiorOk, biologyOk })}`);
  console.log(`PASSED V5.2→V7 real E2E. Artifacts: ${OUT}`);
} catch (err) {
  report.failures.push(err instanceof Error ? err.stack ?? err.message : String(err));
  writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(report.failures.at(-1)); process.exitCode = 1;
} finally { await browser?.close(); }
