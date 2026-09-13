#!/usr/bin/env node
/**
 * GOV-DRUG-DISCOVERY-CAMPAIGN-01 — the BROWSER proof.
 *
 *   npm run build && npm run e2e:gov-campaign:browser
 *
 * The Node scenario (scripts/gov-drug-discovery-campaign.mjs) proves the
 * engine. This proves the SCREEN: it opens the real production build in
 * Chromium, clicks the campaign button, and reads the numbers back out of the
 * rendered DOM — then checks them against a Node run of the same engine.
 *
 * WHY THIS EXISTS. A screen that displays a pinned narrative and a screen that
 * displays a live run look identical in a video. The only way to tell them
 * apart is to prove the rendered numbers came from the engine, so this script
 * refuses to pass unless the DOM text matches what the engine independently
 * returns in Node — including the verdict, which is never asserted as a
 * specific value here, only as "the same one both ways".
 *
 * Exit 0 = the screen renders a real run. Exit 1 = it does not.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.GDD_PORT ?? '8137';
const BASE = `http://127.0.0.1:${PORT}`;

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

// --- 1. The same engine, run in Node, as the reference ---------------------
const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-gdd-browser-'));
const out = path.join(bundleDir, 'campaign.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/govDrugDiscoveryCampaign.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const nodeRun = (await import(out)).runGovDrugDiscoveryCampaign();

console.log('\nGENESIS — GOV-DRUG-DISCOVERY-CAMPAIGN-01 (browser)');
console.log(`node reference: outcome=${nodeRun.decision.outcome} fingerprint=${nodeRun.campaignFingerprint}\n`);

// --- 2. Serve the real production build ------------------------------------
const server = spawn('npx', ['--yes', 'http-server', path.join(REPO, 'packages/frontend/dist'), '-p', PORT, '-s', '--silent'], {
  cwd: REPO, stdio: 'ignore', detached: false,
});
const shutdown = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', shutdown);

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
if (!await waitForServer()) {
  console.error('The static server never came up. Run `npm run build` first.');
  shutdown();
  process.exit(1);
}

// --- 3. Drive the real screen ----------------------------------------------
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// Skip the first-run onboarding overlay, the same way scripts/smoke-e2e.mjs does.
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

await page.goto(`${BASE}/#/gov-campaign`, { waitUntil: 'networkidle' });
await page.waitForSelector('.gdd-screen', { timeout: 30_000 });

const beforeText = await page.locator('.gdd-screen').innerText();
record('Before the click, the screen shows no result — it does not display a run that never happened',
  !/Werdykt/.test(beforeText) && /Nic nie jest policzone/.test(beforeText),
  'empty state present, no verdict section');

await page.getByRole('button', { name: /Uruchom kampanię/ }).click();
await page.waitForSelector('.gdd-verdict', { timeout: 60_000 });
const text = await page.locator('.gdd-screen').innerText();

// --- 4. Does the DOM carry the engine's real numbers? ----------------------
const domVerdict = (await page.locator('.gdd-verdict').innerText()).trim();
record('The verdict rendered in the browser is the one the engine returns in Node',
  domVerdict === nodeRun.decision.outcome,
  `DOM "${domVerdict}" === Node "${nodeRun.decision.outcome}"`);

const counts = await page.locator('.gdd-funnel-count').allInnerTexts();
const expectedCounts = [
  String(nodeRun.generationCheck.generatedCount),
  ...nodeRun.stages.map((s) => String(s.outputCount)),
  String(nodeRun.shortlist.length),
  String(nodeRun.finalists.length),
];
record('Every funnel count in the DOM matches the engine, stage for stage',
  counts.length === expectedCounts.length && counts.every((c, i) => c.trim() === expectedCounts[i]),
  `DOM [${counts.map((c) => c.trim()).join(', ')}] vs engine [${expectedCounts.join(', ')}]`);

record('The generated candidate space is rendered at its real size, not a rounded headline',
  text.includes(String(nodeRun.generationCheck.generatedCount)),
  `${nodeRun.generationCheck.generatedCount} molecules`);

const shortlistRows = await page.locator('.gdd-table tbody tr').count();
record('The shortlist table renders one row per shortlisted candidate',
  shortlistRows === nodeRun.shortlist.length,
  `${shortlistRows} rows === ${nodeRun.shortlist.length} shortlisted`);

record('The campaign fingerprint on screen is the engine\'s own',
  text.includes(nodeRun.campaignFingerprint),
  nodeRun.campaignFingerprint);

record('Every declared exhaustion path is shown with its real status',
  nodeRun.exhaustion.steps.every((s) => text.includes(s.path) && text.includes(s.status)),
  nodeRun.exhaustion.steps.map((s) => `${s.path}=${s.status}`).join(' | '));

record('The safety gate outcome for every finalist is rendered',
  nodeRun.safetyGate.every((g) => text.includes(g.prefName) && text.includes(g.decision.outcome)),
  nodeRun.safetyGate.map((g) => `${g.prefName}=${g.decision.outcome}`).join(', ') || 'no finalists');

record('The research recipe section states plainly that none was emitted when there is no winner',
  nodeRun.decision.outcome === 'WINNER'
    ? /Mechanizm:/.test(text)
    : /receptura powstaje wyłącznie dla werdyktu WINNER/.test(text),
  `outcome=${nodeRun.decision.outcome}`);

record('No banned marketing or clinical-claim language reached the screen',
  nodeRun.bannedStringHits.length === 0 && !/cudowny lek|approved replacement/i.test(text),
  'clean');

record('The page raised no console or runtime errors while running the campaign',
  consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(' | ') || 'none');

// --- 5. Mobile width --------------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(150);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
record('The screen does not scroll sideways at phone width', overflow <= 1, `overflow ${overflow}px at 390px`);

await browser.close();
shutdown();

const failed = checks.filter((c) => !c.ok);
console.log(`\nRESULT: ${checks.length - failed.length}/${checks.length} browser properties held.`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
process.exit(0);
