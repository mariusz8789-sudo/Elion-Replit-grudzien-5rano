import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5000';
const out = 'artifacts/human-twin-review'; mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const report = { browser: browser.version(), surfaces: [], errors: [] };
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  for (const mode of ['desktop', 'mobile', 'reduced']) {
    const ctx = await browser.newContext({ viewport: mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mode === 'mobile', hasTouch: mode === 'mobile', reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    await ctx.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    const page = await ctx.newPage(); page.on('pageerror', e => report.errors.push(String(e)));
    await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    const matrix = page.getByTestId('dashboard-matrix-background'); await matrix.waitFor();
    await page.waitForTimeout(1200);
    const pixelState = () => matrix.locator('canvas').evaluate(c => {
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let greenPixels = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 1] > 40 && data[i + 1] > data[i] * 1.2 && data[i + 1] > data[i + 2] * 1.2) greenPixels++;
      return { image: c.toDataURL(), greenPixels, width: c.width, height: c.height };
    });
    const first = await pixelState(); await page.waitForTimeout(1000); const second = await pixelState();
    assert.ok(second.greenPixels > 0, 'green glyphs present');
    assert.equal(first.image === second.image, mode === 'reduced', 'static only under reduced motion');
    assert.equal(await matrix.evaluate(e => window.getComputedStyle(e).pointerEvents), 'none');
    await page.screenshot({ path: `${out}/dashboard-${mode}.png` });
    // Real menu interaction, not a synthetic route dispatch through the background.
    const links = page.locator('a[href="#/human-biology-lab"]');
    if (await links.count() && await links.first().isVisible()) await links.first().click();
    else {
      const button = page.getByRole('button', { name: /Światy 3D/i }).first();
      if (await button.count() && await button.isVisible()) await button.click();
      await page.evaluate(() => { window.location.hash = '#/human-biology-lab'; });
    }
    await page.getByTestId('scientific-worlds').waitFor({ timeout: 90000 });
    assert.equal(await matrix.count(), 0, 'no Matrix in Human Explorer');
    if (mode === 'mobile') {
      await page.getByTestId('sw-explorer-twin-camera').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-load-state') === 'READY', null, { timeout: 90000 });
      await page.screenshot({ path: `${out}/human-mobile.png`, timeout: 60000 });
    }
    report.surfaces.push({ mode, greenPixels: second.greenPixels, animated: first.image !== second.image, matrixWidth: second.width, matrixHeight: second.height, humanMatrixAbsent: true });
    await ctx.close(); console.log(`Dashboard ${mode}: PASS`);
  }
  for (const [label, query] of [
    ['materials-compute', 'place=Vienna&year=2026&view=interior&roomType=MATERIALS_LAB&duration=3'],
    ['street', 'place=Cambridge&year=2026&weather=RAIN&duration=3'],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    const page = await ctx.newPage(); page.on('pageerror', e => report.errors.push(String(e)));
    await page.goto(`${base}/#/temporal-cinematic?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__GENESIS_TEMPORAL_CAPTURE__?.ready, null, { timeout: 90000 });
    assert.equal(await page.getByTestId('dashboard-matrix-background').count(), 0);
    const shots = [];
    for (const t of [0, 1.5, 3]) {
      await page.evaluate(t => window.__GENESIS_TEMPORAL_CAPTURE__.seekAndWait(t), t);
      const file = `${out}/${label}-${t}.png`;
      const bytes = await page.screenshot({ path: file, timeout: 60000 });
      const sha256 = fingerprint(bytes);
      const evidence = await page.evaluate(({ seconds, artifactFile, artifactSha256 }) => window.__GENESIS_TEMPORAL_CAPTURE__.recordCaptureArtifact({ seconds, artifactFile, artifactSha256 }), { seconds: t, artifactFile: file, artifactSha256: sha256 });
      shots.push({ t, file, sha256, ...evidence });
    }
    const summary = await page.evaluate(() => window.__GENESIS_TEMPORAL_CAPTURE__.getPresentationSummary());
    if (label === 'materials-compute') {
      assert.equal(summary.interiorRoomType, 'MATERIALS_LAB');
      for (const type of ['SPECTROMETER_STATION', 'THERMAL_STAGE_STATION', 'COMPUTE_STATION']) assert.ok(summary.interiorAssetSlots.some(s => s.slotType === type && s.rendered), `${type} actually drawn`);
    }
    assert.notEqual(shots[0].sha256, shots[2].sha256, 'camera frames differ');
    assert.ok(shots.every(shot => /^[a-f0-9]{64}$/.test(shot.evidenceHash) && /^[a-f0-9]{8}$/.test(shot.semanticFingerprint)), 'capture artifacts linked to canonical Evidence');
    assert.ok(summary.continuityEpoch >= 2, 'camera seeks pass through the production discontinuity guard');
    assert.equal(summary.temporalAccumulation, 'NOT_PRESENT', 'do not claim a TAA reset when the pipeline has no temporal history');
    report.surfaces.push({ label, summary, shots }); await ctx.close(); console.log(`${label}: PASS`);
  }
  assert.equal(report.errors.length, 0);
} catch (e) { report.errors.push(String(e)); process.exitCode = 1; console.error(e); }
finally { writeFileSync(`${out}/browser-surfaces.json`, JSON.stringify(report, null, 2)); await browser.close(); }
