import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5000';
const out = process.env.GENESIS_VISION_OUT ?? 'artifacts/vision-review/worlds';
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH
  ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

const cases = [
  ['wormhole', 'Generate an Einstein-Rosen bridge and create a cinematic flythrough.', 'EINSTEIN_ROSEN_BRIDGE', 'WORMHOLE_RINGS', 'HYPOTHESIS'],
  ['timelines', 'Create 5 alternative timeline worlds.', 'MULTIVERSE_BRANCH', 'TIMELINE_BRANCHES', 'SIMULATION'],
  ['time-dilation', 'Create a time dilation laboratory.', 'TIME_DILATION_LAB', 'RELATIVISTIC_CLOCKS', 'MODEL'],
  ['quantum', 'Create a quantum world showing superposition and tunneling.', 'QUANTUM', 'QUANTUM_BARRIER', 'MODEL'],
  ['cosmology', 'Create a cosmology world showing gravity wells, dark matter and time dilation.', 'COSMOLOGY_SPACETIME', 'GRAVITY_WELL_GRID', 'MODEL'],
  ['boston', 'Create a historical Boston battle reconstruction with people, streets, smoke and cinematic shots.', 'HISTORICAL_RECONSTRUCTION', 'HISTORICAL_CITY', 'RECONSTRUCTION'],
  ['alien-desert', 'Create a desert alien planet with ruins and two suns.', 'DESERT_ALIEN', 'ALIEN_DESERT', 'FICTION_INSPIRED'],
  ['mars', 'Create a Mars research world.', 'MARS_RESEARCH', 'MARS_STATION', 'SIMULATION'],
];

const report = { generatedAt: new Date().toISOString(), browser: browser.version(), worlds: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  await page.goto(`${base}/#/world-director`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__GENESIS_WORLD_DIRECTOR__?.ready === true, null, { timeout: 90_000 });

  for (const [slug, prompt, template, visualKind, epistemic] of cases) {
    await page.getByTestId('world-director-prompt').fill(prompt);
    await page.getByTestId('world-director-generate').click();
    await page.waitForFunction(
      ({ expectedTemplate, expectedKind }) => {
        const hook = window.__GENESIS_WORLD_DIRECTOR__;
        const product = hook?.getProductWorld();
        const summary = hook?.getPresentationSummary();
        return hook?.ready === true
          && product?.template === expectedTemplate
          && product.descriptor.kind === expectedKind
          && summary?.spacetimeVisual?.kind === expectedKind;
      },
      { expectedTemplate: template, expectedKind: visualKind },
      { timeout: 90_000 },
    );
    await page.waitForTimeout(1_200);
    const state = await page.evaluate(() => {
      const hook = window.__GENESIS_WORLD_DIRECTOR__;
      if (!hook) throw new Error('WORLD_DIRECTOR_HOOK_MISSING');
      return {
        worldId: hook.worldId,
        entityCount: hook.entityCount,
        evidenceHash: hook.evidenceHash,
        product: hook.getProductWorld(),
        presentation: hook.getPresentationSummary(),
      };
    });
    assert.equal(state.product.template, template);
    assert.equal(state.product.descriptor.kind, visualKind);
    assert.equal(state.product.descriptor.epistemic, epistemic);
    assert.equal(state.presentation.spacetimeVisual.kind, visualKind);
    assert.ok(state.presentation.spacetimeVisual.objectCount > 0, `${slug} has rendered Three.js objects`);
    assert.ok(state.entityCount > 1, `${slug} has a canonical generated WorldGraph`);
    assert.match(state.evidenceHash, /^[a-f0-9]{64}$/);
    assert.match(state.product.fingerprint, /^[a-f0-9]{8}$/);
    const canvas = page.getByTestId('world-director-canvas');
    const bytes = await canvas.screenshot({ path: `${out}/${slug}.png`, timeout: 60_000 });
    assert.ok(bytes.length > 12_000, `${slug} canvas screenshot is non-empty`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await page.screenshot({ path: `${out}/${slug}-with-ui.png`, timeout: 60_000 });
    report.worlds.push({ slug, prompt, template, visualKind, epistemic, sha256, bytes: bytes.length, ...state });
  }

  assert.equal(new Set(report.worlds.map((world) => world.sha256)).size, cases.length, 'all prompt worlds render distinct canvas frames');
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  await context.close();
} catch (error) {
  report.errors.push(String(error));
  process.exitCode = 1;
  console.error(error);
} finally {
  writeFileSync(`${out}/manifest.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
