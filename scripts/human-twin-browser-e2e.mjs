import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5000';
const out = 'artifacts/human-twin-review';
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
const launch = () => chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
let browser = await launch();
const report = { startedAt: new Date().toISOString(), browser: browser.version(), executablePath, base, coldDefinition: 'New Chromium process and empty context per load; OS filesystem cache is not purged.', loads: [], scenarios: [], errors: [] };
const mode = process.argv[2] ?? 'loads';
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await ctx.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  return ctx;
}
async function state(page) {
  return page.evaluate(() => {
    const twin = document.querySelector('[data-testid="sw-twin"]');
    const world = document.querySelector('[data-testid="scientific-worlds"]');
    return {
      tier: twin?.getAttribute('data-tier'), load: JSON.parse(twin?.getAttribute('data-load-diagnostics') ?? 'null'),
      lod: twin?.getAttribute('data-lod'), lodDiagnostics: JSON.parse(twin?.getAttribute('data-lod-diagnostics') ?? 'null'),
      runtime: JSON.parse(world?.getAttribute('data-runtime-diagnostics') ?? 'null'),
      level: document.querySelector('[data-testid="sw-explorer"]')?.getAttribute('data-level'),
      macro: world?.getAttribute('data-macro-level'),
      selected: document.querySelector('[data-testid="sw-explorer"]')?.getAttribute('data-selected-node'),
      capture: document.querySelector('[data-testid="sw-explorer-capture"]')?.textContent,
    };
  });
}
async function frameHuman(page) {
  const button = page.getByTestId('sw-explorer-twin-camera');
  await button.waitFor({ timeout: 90000 });
  if (await page.getByTestId('scientific-worlds').getAttribute('data-camera') !== 'TWIN') await button.click();
}
async function ready(page) {
  await frameHuman(page);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="sw-twin"]');
    const data = JSON.parse(el?.getAttribute('data-load-diagnostics') ?? 'null');
    return el?.getAttribute('data-tier') === 'LICENSED_CC0_ASSET' && data?.status === 'READY' && data.firstRenderedAtMs >= data.insertedAtMs;
  }, null, { timeout: 90000 });
}
async function navigate(page) { await page.goto(`${base}/#/human-biology-lab`, { waitUntil: 'domcontentloaded', timeout: 90000 }); }
try {
  if (mode === 'loads' || mode === 'single') {
    const count = mode === 'single' ? 1 : 5;
    for (const kind of mode === 'single' ? ['cold'] : ['cold', 'repeat']) {
      let ctx, page;
      for (let i = 0; i < count; i++) {
        if (kind === 'cold' && i > 0) { await browser.close(); browser = await launch(); }
        if (kind === 'cold' || !ctx) { ctx = await context(); page = await ctx.newPage(); }
        const requests = [], errors = [];
        const onResponse = r => { if (r.url().endsWith('.glb')) requests.push({ url: r.url(), status: r.status() }); };
        const onError = e => errors.push(String(e));
        page.on('response', onResponse); page.on('pageerror', onError);
        const started = Date.now();
        if (kind === 'repeat' && i > 0) await page.reload({ waitUntil: 'domcontentloaded' }); else await navigate(page);
        await ready(page);
        const result = { kind, index: i + 1, wallMs: Date.now() - started, requests, errors, ...await state(page) };
        assert.equal(result.load.status, 'READY'); assert.equal(result.tier, 'LICENSED_CC0_ASSET'); assert.equal(errors.length, 0);
        report.loads.push(result);
        console.log(`${kind} ${i + 1}/${count}: READY ${result.wallMs}ms, fetch=${Math.round(result.load.diagnostics.fetchCompletedAtMs - result.load.diagnostics.fetchStartedAtMs)}ms, decode=${Math.round(result.load.diagnostics.decodeCompletedAtMs - result.load.diagnostics.decodeStartedAtMs)}ms`);
        if (kind === 'cold' && i === 0) {
          const firstFrame = Number(await page.getByTestId('scientific-worlds').getAttribute('data-frames'));
          await page.waitForFunction(f => Number(document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-frames')) >= f + 20, firstFrame);
          await page.screenshot({ path: `${out}/after-body.png`, timeout: 60000 });
        }
        page.off('response', onResponse); page.off('pageerror', onError);
        if (kind === 'cold') { await ctx.close(); ctx = null; }
      }
      if (ctx) await ctx.close();
    }
  }
  if (mode === 'recovery') {
    // Playwright page.route cannot intercept requests owned by a ServiceWorker. Block only for this
    // injected transport-failure scenario; normal load/repeat coverage above still exercises the PWA path.
    const ctx = await context({ serviceWorkers: 'block' }), page = await ctx.newPage();
    const glbPattern = /\.glb(?:\?.*)?$/i;
    let injected503 = false;
    await page.route(glbPattern, route => { injected503 = true; return route.fulfill({ status: 503, body: 'injected transport failure' }); });
    await navigate(page); await frameHuman(page);
    const failureSamples = [];
    for (let i = 0; i < 60; i++) {
      const sample = await state(page); failureSamples.push(sample);
      if (sample.load?.status === 'ERROR') break;
      await page.waitForTimeout(500);
    }
    assert.ok(injected503, 'the GLB request must be intercepted before testing recovery');
    const failed = await state(page); assert.equal(failed.tier, 'PROXY'); assert.equal(failed.load.reason, 'HTTP_503');
    await page.unroute(glbPattern); await page.getByTestId('sw-twin-retry').click(); await ready(page);
    report.scenarios.push({ name: 'HTTP error → explicit retry → full model', injected503, failureSamples, failed, recovered: await state(page) });
    let release; const held = new Promise(resolve => { release = resolve; }); let intercepted = false;
    await page.route(glbPattern, async route => { intercepted = true; await held; await route.continue().catch(() => {}); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 90 && !intercepted; i++) await page.waitForTimeout(1000);
    assert.ok(intercepted, 'GLB request intercepted');
    await page.evaluate(() => { window.location.hash = '#/'; });
    await page.getByTestId('scientific-worlds').waitFor({ state: 'detached', timeout: 20000 });
    release(); await page.unroute(glbPattern);
    await page.evaluate(() => { window.location.hash = '#/human-biology-lab'; }); await ready(page);
    report.scenarios.push({ name: 'navigation away during fetch → return', recovered: await state(page) });
    await ctx.close();
  }
  if (mode === 'macro') {
    const ctx = await context(), page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push(String(e)));
    await navigate(page); await ready(page);
    for (const [level, testId] of [
      ['body', 'sw-explorer-rung-body'], ['organ_system', 'sw-explorer-system-cardiovascular'],
      ['organ', 'sw-explorer-organ-heart'], ['tissue', 'sw-explorer-rung-tissue'],
      ['cell', 'sw-explorer-rung-cell'], ['organelle', 'sw-explorer-rung-organelle'], ['molecule', 'sw-explorer-rung-molecule'],
    ]) {
      const before = await state(page), start = Date.now(), samples = [];
      await page.getByTestId(testId).click({ timeout: 30000 });
      let complete = false;
      while (Date.now() - start < 180000) {
        await page.waitForTimeout(1000);
        const sample = await state(page); samples.push({ wallMs: Date.now() - start, ...sample });
        if (sample.runtime?.blockedReason) throw new Error(`${level}: ${JSON.stringify(sample.runtime)}`);
        if (sample.level === level && sample.macro === level && ['IDLE', 'REPORTING'].includes(sample.runtime?.state)) { complete = true; break; }
        if (samples.length % 15 === 0) console.log(`${level} ${Date.now() - start}ms: ${JSON.stringify(sample.runtime)}`);
      }
      report.scenarios.push({ level, before, samples, wallMs: Date.now() - start, complete });
      writeFileSync(`${out}/browser-macro.json`, JSON.stringify(report, null, 2));
      assert.ok(complete, `${level} did not reach actual UI + scene level`);
      if (level === 'organ') {
        await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="scientific-worlds"]').getAttribute('data-runtime-diagnostics')).state === 'IDLE');
        const point = (await state(page)).runtime.organScreenPositions.find(p => p.id === 'heart');
        assert.ok(point, 'visible canonical heart mesh');
        const box = await page.getByTestId('sw-canvas').boundingBox();
        await page.mouse.click(box.x + point.x, box.y + point.y);
        await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="scientific-worlds"]').getAttribute('data-runtime-diagnostics')).lastPickedNode === 'heart');
        await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="scientific-worlds"]').getAttribute('data-runtime-diagnostics')).state === 'IDLE');
        report.scenarios.push({ name: 'real canvas raycast → canonical heart command', point, after: await state(page) });
      }
      if (['tissue', 'cell', 'organelle', 'molecule'].includes(level)) {
        await page.getByRole('button', { name: /DOWODY · SESJA/ }).click();
        await page.getByTestId('sw-replay').click();
        await page.getByTestId('sw-replay-verdict').waitFor();
        const verdict = await page.getByTestId('sw-replay-verdict').innerText();
        assert.equal(verdict.trim(), 'MATCH');
        report.scenarios.push({ level, replay: verdict.trim() });
        await page.getByRole('button', { name: /DOWODY · SESJA/ }).click();
      }
      await page.screenshot({ path: `${out}/macro-${level}.png`, timeout: 60000 });
      console.log(`${level}: PASS in ${Date.now() - start}ms`);
    }
    assert.equal(report.errors.length, 0); await ctx.close();
  }
  if (mode === 'lod') {
    const ctx = await context(), page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push(String(e)));
    await navigate(page); await ready(page);
    const full = await state(page);
    assert.equal(full.lod, 'FULL_ASSET');
    assert.ok(full.lodDiagnostics.metrics.triangleCount > 0);

    await page.getByTestId('sw-twin-lod').selectOption('LOW');
    await page.waitForFunction(() => document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-lod') === 'PROXY_LOW');
    const low = await state(page);
    assert.ok(low.lodDiagnostics.metrics.triangleCount > 0);
    await page.screenshot({ path: `${out}/lod-proxy-low.png`, timeout: 60000 });

    await page.getByTestId('sw-explorer-organ-heart').click({ timeout: 30000 });
    await page.waitForFunction(() => {
      const runtime = JSON.parse(document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-runtime-diagnostics') ?? 'null');
      return runtime?.state === 'IDLE' && runtime.organScreenPositions?.some(point => point.id === 'heart');
    }, null, { timeout: 180000 });
    const point = (await state(page)).runtime.organScreenPositions.find(candidate => candidate.id === 'heart');
    const box = await page.getByTestId('sw-canvas').boundingBox();
    await page.mouse.click(box.x + point.x, box.y + point.y);
    await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-runtime-diagnostics') ?? 'null')?.lastPickedNode === 'heart', null, { timeout: 180000 });

    await page.getByTestId('sw-twin-lod').selectOption('FULL');
    await page.waitForFunction(() => document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-lod') === 'FULL_ASSET');
    const restored = await state(page);
    assert.equal(restored.runtime.lastPickedNode, 'heart');
    assert.equal(restored.selected, 'heart');
    await page.screenshot({ path: `${out}/lod-full-restored.png`, timeout: 60000 });
    report.scenarios.push({ name: 'real runtime LOD preserves canonical organ interaction', full, low, point, restored });
    assert.equal(report.errors.length, 0); await ctx.close();
  }
} catch (e) { report.errors.push(String(e)); process.exitCode = 1; console.error(e); }
finally { writeFileSync(`${out}/browser-${mode}.json`, JSON.stringify(report, null, 2)); await browser.close(); }
