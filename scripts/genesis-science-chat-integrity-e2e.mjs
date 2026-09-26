#!/usr/bin/env node
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.E2E_BASE ?? 'http://127.0.0.1:5000';
const out = path.resolve(process.env.GENESIS_SCIENCE_CHAT_OUT ?? 'artifacts/vision-review/science-chat-integrity');
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH
  ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const report = { capturedAt: new Date().toISOString(), browser: browser.version(), checks: [], errors: [] };

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const input = page.getByLabel('Wiadomość do Science Chat');
  await input.waitFor({ state: 'visible', timeout: 90_000 });

  const send = async (message, expected) => {
    await input.fill(message);
    await page.getByRole('button', { name: 'Wyślij', exact: true }).click();
    await page.getByText(expected, { exact: false }).last().waitFor({ state: 'visible', timeout: 90_000 });
    report.checks.push({ message, expected, passed: true });
  };

  await send('/pain-research Explore mechanisms of chronic neuropathic pain.', 'PAIN RESEARCH: BLOCKED');
  await send('/physics-claim An Einstein-Rosen wormhole is a hypothetical geometry.', 'WORMHOLE: PASS');
  await send('/physics-claim A wormhole let us travel back in time and change the past.', 'WORMHOLE: REJECTED');
  const transcript = await page.locator('.science-chat-log').innerText();
  if (!/Evidence:\s*[1-9]\d* rekord/.test(transcript)) throw new Error('SCIENCE_CHAT_EVIDENCE_COUNT_MISSING');
  const screenshot = path.join(out, 'science-chat-pain-physics.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  report.screenshot = path.relative(process.cwd(), screenshot).replaceAll('\\', '/');
  report.transcriptProof = {
    painBlocked: transcript.includes('PAIN RESEARCH: BLOCKED'),
    wormholePass: transcript.includes('WORMHOLE: PASS'),
    backwardTravelRejected: transcript.includes('WORMHOLE: REJECTED'),
    evidenceCountVisible: /Evidence:\s*[1-9]\d* rekord/.test(transcript),
  };
  await context.close();
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await browser.close();
}

const ok = report.checks.length === 3 && report.errors.length === 0 && Object.values(report.transcriptProof ?? {}).every(Boolean);
writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify({ ...report, status: ok ? 'PASS' : 'FAIL' }, null, 2)}\n`);
console.log(ok ? 'PASSED: Science Chat drove Pain Research and spacetime integrity through the real browser UI.' : `FAILED: inspect ${path.join(out, 'manifest.json')}`);
process.exit(ok ? 0 : 1);
