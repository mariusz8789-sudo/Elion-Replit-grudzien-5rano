// D-135 — 10 real screenshots from a real running browser against the real production build.
// Uses only reliable button-click paths (HumanExplorerPanel chips, camera toggle) — every one of
// these is a plain DOM <button> click, proven reliable across every diagnostic run in this session;
// none depend on the still-unresolved synthetic canvas-raycast-click path. Every step is wrapped so a
// single slow/stuck interaction logs a warning and the run continues to the next screenshot rather
// than aborting the whole capture.
import { chromium } from 'playwright';

const OUT = '/home/user/Elion-Replit-grudzien-5rano/docs/evidence/d135/screenshots';
const t0 = Date.now();
const mark = (label) => console.log(`[mark] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const CLICK_TIMEOUT = 240_000;

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });

async function settled(page, root, frames = 2, timeout = 180_000) {
  const before = Number(await root.getAttribute('data-frames'));
  await page.waitForFunction(
    ([sel, target]) => Number(document.querySelector(sel)?.getAttribute('data-frames')) >= target,
    [`[data-testid="scientific-worlds"]`, before + frames],
    { timeout },
  );
}

async function step(label, fn) {
  try { await fn(); } catch (e) { console.log(`[warn] step "${label}" failed: ${e.message.split('\n')[0]}`); }
  mark(label);
}

async function shoot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}` });
}

// ---------- DESKTOP ----------
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('http://127.0.0.1:8080/#/human-biology-lab');
  const root = page.getByTestId('scientific-worlds');
  await root.waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByTestId('sw-canvas').waitFor({ state: 'visible', timeout: 60_000 });
  await settled(page, root, 3);
  mark('loaded, settled');

  await step('01-body', async () => { await shoot(page, '01-body.png'); });

  await step('02-twin', async () => {
    await page.getByTestId('sw-explorer-twin-camera').click({ timeout: CLICK_TIMEOUT });
    await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'TWIN', { timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, '02-twin.png');
  });

  await step('03-heart', async () => {
    await page.getByTestId('sw-explorer-organ-heart').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, '03-heart.png');
  });

  await step('04-heart-isolated', async () => {
    await page.getByTestId('sw-explorer-isolate').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, '04-heart-isolated.png');
  });

  await step('05-cutaway', async () => {
    await page.getByTestId('sw-explorer-cut-toggle').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, '05-cutaway.png');
  });

  await step('cleared isolation+cutaway', async () => {
    await page.getByTestId('sw-explorer-cut-toggle').click({ timeout: CLICK_TIMEOUT });
    await page.getByTestId('sw-explorer-isolate').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
  });

  await step('06-vessels', async () => {
    await page.getByTestId('sw-explorer-network-vascular').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, '06-vessels.png');
  });

  await step('07-neural', async () => {
    await page.getByTestId('sw-explorer-network-nervous').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, '07-neural.png');
  });

  await step('re-selected heart for ladder', async () => {
    await page.getByTestId('sw-explorer-organ-heart').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
  });

  await step('08-tissue', async () => {
    await page.getByTestId('sw-explorer-rung-tissue').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2, 300_000);
    await shoot(page, '08-tissue.png');
  });

  await step('09-cell', async () => {
    await page.getByTestId('sw-explorer-rung-cell').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2, 300_000);
    await shoot(page, '09-cell.png');
  });

  await step('10-research-evidence', async () => {
    await page.getByTestId('sw-explorer-twin-camera').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, '10-research-evidence.png');
  });

  await page.close();
}

// ---------- MOBILE (2 shots) ----------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('http://127.0.0.1:8080/#/human-biology-lab');
  const root = page.getByTestId('scientific-worlds');
  await root.waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByTestId('sw-canvas').waitFor({ state: 'visible', timeout: 60_000 });
  await settled(page, root, 3);
  await step('11-mobile-body', async () => { await shoot(page, '11-mobile-body.png'); });

  await step('12-mobile-heart', async () => {
    await page.getByTestId('sw-explorer-twin-camera').click({ timeout: CLICK_TIMEOUT });
    await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'TWIN', { timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await page.getByTestId('sw-explorer-organ-heart').click({ timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, '12-mobile-heart.png');
  });
  await page.close();
}

await browser.close();
mark('done');
