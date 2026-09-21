/**
 * Capture clean 3D "plates" from the REAL Genesis scenes, with the HUD hidden.
 *
 * The world-first mockups must show the world Genesis actually renders — not concept art.
 * This script opens the live app, lets a scene settle, hides every HUD layer with CSS
 * (the DOM is untouched otherwise; no product code changes), and screenshots what is left:
 * the raw 3D. Those plates become the backdrop of the mockups, so every proposed UI is
 * drawn over a picture of the real product.
 *
 *   CHROME=/opt/pw-browsers/chromium GENESIS_BASE_URL=http://127.0.0.1:8080 \
 *     node scripts/capture-mockup-plates.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';
const OUT = 'mockups/assets';

/**
 * Everything that is chrome rather than world. Hidden per element through CSSStyleDeclaration —
 * the app's CSP is `style-src 'self'` with no 'unsafe-inline', so an injected <style> tag is refused
 * (and rightly so: relaxing the policy for a screenshot script would be the tail wagging the dog).
 */
const HUD_SELECTORS = [
  '.sw-hud', '.app-nav', '.app-rail', 'nav', 'aside', 'header', 'footer',
  '[data-testid="sw-status"]', '[data-testid="sw-evidence"]', '[data-testid="sw-command"]',
  '[data-testid="sw-explorer"]', '[class*="science-chat"]', '[class*="ScienceChat"]',
  '[class*="sysmon"]', '.sw-brand', '.sw-footer', '.sw-topbar', '.sw-scale',
];

async function hideHud(page) {
  await page.evaluate((selectors) => {
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) (el).style.opacity = '0';
    }
  }, HUD_SELECTORS);
}

/** Wait for the scene's own frame counter to advance, so the plate is never a half-built scene. */
async function settled(page, seconds) {
  await page.waitForTimeout(seconds * 1000);
}

const PLATES = [
  {
    name: 'plate-human-biology.png',
    hash: '#/human-biology-lab',
    async prepare(page) {
      // The twin camera frames the licensed CC0 body — the subject the mockups are about. It lives in
      // the Human Explorer dock, so the dock has to be open before the control exists in the DOM.
      const toggle = page.getByTestId('sw-explorer-toggle');
      await toggle.waitFor({ timeout: 60_000 });
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      // Wait for the licensed asset to actually be in the scene. The GLB is ~17 MB, so there is a real
      // window in which the twin is still the PROXY — the first plate captured exactly that and showed a
      // featureless procedural figure. A plate of the proxy presented as the licensed body would be a lie
      // about the product, so the capture blocks on the tier the HUD itself reports.
      await page.waitForFunction(
        () => document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-tier') === 'LICENSED_CC0_ASSET',
        null,
        { timeout: 180_000 },
      );
      const cam = page.getByTestId('sw-explorer-twin-camera');
      await cam.waitFor({ timeout: 60_000 });
      await cam.click();
      await page.waitForFunction(
        () => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'TWIN',
        null,
        { timeout: 60_000 },
      );
    },
  },
  { name: 'plate-physics-lab.png', hash: '#/scientific-worlds' },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
await mkdir(OUT, { recursive: true });

for (const plate of PLATES) {
  try {
    await page.goto(`${BASE}/${plate.hash}`);
    await page.getByTestId('scientific-worlds').waitFor({ timeout: 60_000 });
    await settled(page, 6);
    if (plate.prepare) await plate.prepare(page);
    await settled(page, 6);
    await hideHud(page);
    await settled(page, 1);
    await page.screenshot({ path: `${OUT}/${plate.name}` });
    console.log(`captured ${plate.name}`);
  } catch (e) {
    // A plate that cannot be captured is reported, never substituted with a picture of something else.
    console.error(`FAILED ${plate.name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

await browser.close();
