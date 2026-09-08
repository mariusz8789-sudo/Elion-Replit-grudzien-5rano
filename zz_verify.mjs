import { chromium, devices } from 'playwright';
const OUT = '/tmp/claude-0/-home-user-Elion-Replit-grudzien-5rano/46175076-625b-5ef4-b2e8-0f1904751fc9/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function run(label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('api/health')) errors.push(m.text().slice(0, 200)); });
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  const skip = page.getByText('Pomiń', { exact: false }).first();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.location.hash = '#/scientific-city'; });
  await page.waitForSelector('#wd-goal', { timeout: 30000 });

  // Multi-action comparison goal
  await page.fill('#wd-goal', 'Reduce peak flood depth using the available interventions.');
  await page.click('.wd-panel button[type="submit"]');
  await page.waitForSelector('.wd-actions', { timeout: 60000 });
  const summary = (await page.textContent('.wd-summary')).trim();
  const rows = await page.$$eval('.wd-actions li', (ns) => ns.map((n) => n.textContent.replace(/\s+/g, ' ').slice(0, 95)));
  await page.screenshot({ path: `${OUT}/xaction-${label}.png` });

  // NOT_RANKABLE / refusal must show no winner
  await page.fill('#wd-goal', 'Compare the available interventions for insurance claims.');
  await page.click('.wd-panel button[type="submit"]');
  await page.waitForSelector('.wd-refusal', { timeout: 30000 });
  const refusal = (await page.textContent('.wd-refusal-why')).trim();
  const hasComparisonHeading = await page.locator('text=Action comparison').count();

  console.log(JSON.stringify({ label, summary, rows, refusal, winnerShownOnRefusal: hasComparisonHeading > 0, errors }, null, 1));
  await ctx.close();
}
await run('desktop', { viewport: { width: 1440, height: 900 } });
await run('mobile', devices['iPhone 13']);
await browser.close();
