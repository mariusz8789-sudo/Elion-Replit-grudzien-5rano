import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5000';
const out = 'artifacts/human-twin-review';
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const report = { browser: browser.version(), routes: [], errors: [] };

async function capture(page, name, options = {}) {
  const path = `${out}/${name}`;
  await page.screenshot({ path, timeout: 60_000, ...options });
  return {
    file: path,
    capturedAt: new Date().toISOString(),
    url: page.url(),
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(String(error)));

  await page.goto(`${base}/#/world-director`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GENESIS_WORLD_DIRECTOR__?.ready === true, null, { timeout: 90_000 });
  const initialLab = await page.evaluate(() => ({ ...window.__GENESIS_WORLD_DIRECTOR__, summary: window.__GENESIS_WORLD_DIRECTOR__.getPresentationSummary() }));
  report.routes.push({ route: 'world-director-initial', state: initialLab });
  assert.equal(initialLab.summary.interiorRoomType, 'MATERIALS_LAB');
  await page.waitForFunction(
    () => window.__GENESIS_WORLD_DIRECTOR__?.getPresentationSummary().interiorAssetSlots
      .some((slot) => slot.slotType === 'COMPUTE_STATION' && slot.rendered),
    null,
    { timeout: 90_000 },
  );
  const lab = await page.evaluate(() => ({ ...window.__GENESIS_WORLD_DIRECTOR__, summary: window.__GENESIS_WORLD_DIRECTOR__.getPresentationSummary() }));
  assert.equal(lab.preset, 'MODERN_SCIENTIFIC_LAB');
  assert.equal(lab.summary.interiorRoomType, 'MATERIALS_LAB');
  assert.ok(lab.summary.interiorAssetSlots.some((slot) => slot.slotType === 'COMPUTE_STATION' && slot.rendered));
  const interactionTargets = await page.evaluate(() => window.__GENESIS_WORLD_DIRECTOR__.getInteractionTargets());
  assert.ok(interactionTargets.length > 0, 'generated ASSET_SLOT interaction targets are projected');
  const canvasBox = await page.getByTestId('world-director-canvas').boundingBox();
  assert.ok(canvasBox, 'world director canvas has a real viewport');
  let selectedTarget = null;
  for (const target of interactionTargets) {
    if (target.x < 0 || target.y < 0 || target.x > canvasBox.width || target.y > canvasBox.height) continue;
    await page.mouse.click(canvasBox.x + target.x, canvasBox.y + target.y);
    try {
      await page.waitForFunction((id) => window.__GENESIS_WORLD_DIRECTOR__?.getPresentationSummary().selectedAssetSlotId === id, target.id, { timeout: 5_000 });
      selectedTarget = target;
      break;
    } catch { /* projected center can be occluded; try the next canonical slot */ }
  }
  assert.ok(selectedTarget, 'real canvas click selects a generated ASSET_SLOT');
  const selectedSummary = await page.evaluate(() => window.__GENESIS_WORLD_DIRECTOR__.getPresentationSummary());
  assert.equal(selectedSummary.interactionCommand?.type, 'INSPECT_ENTITY');
  assert.equal(selectedSummary.selectedAssetSlotId, selectedTarget.id);
  await page.getByTestId('world-director-selection-evidence').waitFor();
  assert.match(await page.getByTestId('world-director-selection-evidence').innerText(), /[a-f0-9]{16}/i);
  const labShot = await capture(page, 'world-director-lab.png');
  const panelStyle = await page.locator('.world-director-panel').evaluate((element) => {
    const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect();
    return { display: style.display, visibility: style.visibility, opacity: style.opacity, zIndex: style.zIndex, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  });
  const layout = await page.evaluate(() => ({
    scrollY: window.scrollY,
    bodyHeight: document.body.getBoundingClientRect().height,
    worldDirector: (() => { const rect = document.querySelector('[data-testid="world-director"]')?.getBoundingClientRect(); return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null; })(),
    canvases: [...document.querySelectorAll('canvas')].map((canvas) => { const rect = canvas.getBoundingClientRect(); return { className: canvas.className, display: window.getComputedStyle(canvas).display, x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }),
  }));

  await page.getByTestId('world-director-preset').selectOption('MODERN_CITY');
  await page.waitForFunction(() => window.__GENESIS_WORLD_DIRECTOR__?.preset === 'MODERN_CITY', null, { timeout: 90_000 });
  const city = await page.evaluate(() => ({ ...window.__GENESIS_WORLD_DIRECTOR__, summary: window.__GENESIS_WORLD_DIRECTOR__.getPresentationSummary() }));
  assert.equal(city.summary.viewMode, 'street');
  const cityShot = await capture(page, 'world-director-city.png');

  await page.getByTestId('world-director-preset').selectOption('HISTORICAL_RECONSTRUCTION');
  await page.getByTestId('world-director-navigation').selectOption('WALK');
  await page.waitForFunction(() => window.__GENESIS_WORLD_DIRECTOR__?.preset === 'HISTORICAL_RECONSTRUCTION', null, { timeout: 90_000 });
  const historicalShot = await capture(page, 'world-director-historical.png');
  report.routes.push({ route: 'world-director', lab: { ...lab, interactionTargets, selectedTarget, selectedSummary }, city, panelStyle, layout, screenshots: [labShot, cityShot, historicalShot], status: 'PASS' });

  await page.goto(`${base}/#/meta-cognition`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('meta-cognition').waitFor({ timeout: 30_000 });
  await page.getByTestId('meta-run-audit').click();
  await page.getByTestId('meta-events').waitFor();
  const metaText = await page.getByTestId('meta-events').innerText();
  assert.match(metaText, /META_SELF_AUDIT_COMPLETED/);
  assert.match(await page.getByTestId('meta-capabilities').innerText(), /spacetime-photon|molecular-biology|d140-laboratory/);
  await page.getByTestId('meta-run-campaign').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-testid="meta-campaign-result"]')?.textContent ?? '';
    return /Status/.test(text) && /Cykle/.test(text) && !/Nie uruchomiono/.test(text);
  }, null, { timeout: 90_000 });
  const campaignText = await page.getByTestId('meta-campaign-result').innerText();
  assert.match(campaignText, /DecisionTrace/i);
  assert.match(campaignText, /Evidence/i);
  const metaShot = await capture(page, 'meta-cognition.png', { fullPage: true });
  report.routes.push({ route: 'meta-cognition', status: 'PASS', metaEvents: metaText.split('\n').filter(Boolean).length, campaign: campaignText, screenshots: [metaShot] });

  await page.goto(`${base}/#/mirror`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('mirror-status').waitFor({ timeout: 30_000 });
  const states = [];
  for (let index = 0; index < 7; index += 1) {
    states.push(await page.getByTestId('mirror-state').innerText());
    await page.getByTestId('mirror-advance').click();
  }
  states.push(await page.getByTestId('mirror-state').innerText());
  assert.deepEqual(states, ['MIRROR_IDLE', 'CONSENT_REQUIRED', 'SCANNING', 'SYNCING', 'TWIN_READY', 'DIVERGENCE_MODE', 'CAPTURE', 'REPLAY']);
  assert.match(await page.getByTestId('mirror-status').innerText(), /EXPERIMENTAL \/ SYNTHETIC/);
  assert.match(await page.getByTestId('mirror-status').innerText(), /NOT_CONNECTED/);
  assert.match(await page.getByTestId('mirror-status').innerText(), /LOCAL_CAMERA_VALIDATION_REQUIRED/);
  const mirrorShot = await capture(page, 'mirror-experimental.png');
  report.routes.push({ route: 'mirror', states, status: 'PASS', screenshots: [mirrorShot] });

  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  await context.close();
} catch (error) {
  report.errors.push(String(error));
  process.exitCode = 1;
  console.error(error);
} finally {
  writeFileSync(`${out}/director-meta-mirror-browser.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
