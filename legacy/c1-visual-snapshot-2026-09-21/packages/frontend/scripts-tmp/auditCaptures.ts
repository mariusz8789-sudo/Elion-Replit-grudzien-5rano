import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const ROUTES: { name: string; url: string; wait?: number }[] = [
  { name: 'scientific-city', url: 'http://localhost:8080/#/scientific-city', wait: 4000 },
  { name: 'genesis-world', url: 'http://localhost:8080/#/genesis-world', wait: 4000 },
  { name: 'molecule', url: 'http://localhost:8080/#/molecule', wait: 4000 },
  { name: 'first-person-lab', url: 'http://localhost:8080/#/first-person-lab', wait: 4000 },
  { name: 'human-biology-lab', url: 'http://localhost:8080/#/human-biology-lab', wait: 4000 },
  { name: 'city3d', url: 'http://localhost:8080/#/city3d', wait: 4000 },
];

async function main() {
  const FALLBACK = '/opt/pw-browsers/chromium';
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch (e) { if (!existsSync(FALLBACK)) throw e; browser = await chromium.launch({ headless: true, executablePath: FALLBACK }); }

  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => { window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })); });
    try {
      await page.goto(route.url, { waitUntil: 'load', timeout: 25_000 });
      await page.waitForTimeout(route.wait ?? 3000);
      await page.screenshot({ path: `/tmp/audit-${route.name}.png` });
      console.log(`OK ${route.name}`);
    } catch (err) {
      console.log(`FAIL ${route.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await page.close();
  }
  await browser.close();
}
main().catch((err) => { console.error('FATAL', err); process.exit(1); });
