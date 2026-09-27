import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5177';
const stage = process.env.VISUAL_STAGE ?? 'after';
const out = 'artifacts/astra-visual-polish';
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const report = { stage, browser: browser.version(), scenes: [], errors: [] };
try {
  for (const mode of ['desktop', 'mobile', 'reduced']) {
    const context = await browser.newContext({ viewport: mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mode === 'mobile', hasTouch: mode === 'mobile', reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    await context.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (/THREE.WebGLProgram: Shader Error|VALIDATE_STATUS|Error compiling/.test(message.text())) report.errors.push(message.text()); });
    await page.goto(base + '/#/human-biology-lab', { waitUntil: 'domcontentloaded', timeout: 90000 });
    const camera = page.getByTestId('sw-explorer-twin-camera');
    await camera.waitFor({ timeout: 90000 });
    if (await page.getByTestId('scientific-worlds').getAttribute('data-camera') !== 'TWIN') await camera.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-load-state') === 'READY', null, { timeout: 90000 });
    const shots = [];
    for (const surface of ['normal', 'xray', 'ghost']) {
      await page.getByTestId('sw-explorer-surface-' + surface).click();
      await page.waitForFunction(surface => document.querySelector('[data-testid="sw-explorer-surface"]')?.getAttribute('data-surface') === surface.toUpperCase(), surface);
      const frame = Number(await page.getByTestId('scientific-worlds').getAttribute('data-frames'));
      await page.waitForFunction(frame => Number(document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-frames')) >= frame + 20, frame, { timeout: 90000 });
      const state = await page.getByTestId('scientific-worlds').evaluate(element => JSON.parse(element.getAttribute('data-runtime-diagnostics')));
      assert.ok(state.render, 'existing renderer metrics are available');
      assert.match(await page.getByTestId('sw-twin').innerText(), /ANATOMIA: MODEL/);
      assert.equal(state.temporalEngineAdvances, 0);
      assert.equal(await page.getByTestId('sw-twin').getAttribute('data-tier'), 'LICENSED_CC0_ASSET');
      // One representative capture per stage: at most two images for a before/after review.
      const screenshot = mode === 'desktop' && surface === 'ghost' ? out + '/' + stage + '-desktop-ghost.png' : null;
      if (screenshot) await page.screenshot({ path: screenshot, timeout: 60000 });
      shots.push({ surface, screenshot, render: state.render, twinLod: state.twinLod });
    }
    report.scenes.push({ mode, shots });
    await context.close();
    console.log(mode + ': PASS');
  }
  assert.deepEqual(report.errors, []);
} catch (error) { report.errors.push(String(error)); console.error(error); process.exitCode = 1; }
finally { writeFileSync(out + '/' + stage + '.json', JSON.stringify(report, null, 2)); await browser.close(); }
