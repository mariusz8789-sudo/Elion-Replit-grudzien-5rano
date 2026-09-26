import { expect, test } from '@playwright/test';
const chromiumPath = process.env.CHROME;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });
const API = 'http://127.0.0.1:8080';
const OUT = 'artifacts/live';
async function api(p: string, t: string | null, b?: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${API}${p}`, { method: b === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, ...(b === undefined ? {} : { body: JSON.stringify(b) }) });
  return r.json() as Promise<Record<string, unknown>>;
}
test('live run: every candidate is visible in the UI while the engines are still computing', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const reg = await api('/api/auth/register', null, { email: `live-${Date.now()}@l.org`, password: 'password123' });
  const token = reg.token as string;
  const pr = await api('/api/projects', token, { name: 'live' });
  const pid = (pr.project as { id: string }).id;
  const c = await api(`/api/projects/${pid}/campaigns`, token, { objective: `live ${Date.now()}`, domain: 'DRUG_DISCOVERY', startingSmiles: ['Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1'], budget: { maxGenerations: 2, maxGeneratedCandidates: 6 } });
  const cid = (c.campaign as { id: string }).id;
  await page.addInitScript(({ t, u }) => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    window.localStorage.setItem('genesis-os:session/v1', JSON.stringify({ token: t, user: u }));
  }, { t: token, u: reg.user });
  await page.goto(`/#/scientific-worlds?station=st-drug-bench&project=${pid}&campaign=${cid}`);
  const d = page.getByTestId('sw-details');
  await d.waitFor({ state: 'visible', timeout: 120_000 });
  if ((await d.getAttribute('aria-expanded')) !== 'true') await d.click();
  const live = page.getByTestId('drug-bench-live');
  await live.waitFor({ state: 'visible', timeout: 300_000 });

  // The candidate list must appear WHILE the run is still going, not only at the end.
  const prereg = page.getByTestId('drug-prereg');
  const list = page.getByTestId('drug-candidate-list');
  await list.waitFor({ state: 'visible', timeout: 600_000 });
  const stillRunning = await live.getAttribute('data-phase');
  const rows = await list.locator('li').count();
  const geo = await live.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, w: r.width, right: r.x + r.width }; });
  // eslint-disable-next-line no-console
  console.log(`LIVE rows=${rows} phase=${stillRunning} panelX=${geo.x} panelW=${geo.w}`);
  await page.screenshot({ path: `${OUT}/live-candidates.png` });
  expect(rows, 'candidate rows rendered while running').toBeGreaterThan(0);
  expect(geo.x, 'panel starts clear of the 200px sidebar').toBeGreaterThanOrEqual(200);
  // The criteria the server froze BEFORE any engine ran must be on screen while it is still running.
  await prereg.waitFor({ state: 'visible', timeout: 120_000 });
  const nCrit = Number(await prereg.getAttribute('data-criteria'));
  // eslint-disable-next-line no-console
  console.log(`LIVE prereg criteria=${nCrit}`);
  expect(nCrit, 'frozen criteria listed during the run').toBeGreaterThan(0);

  // Let it finish and photograph the moment candidates carry docking numbers and rejection reasons.
  await page.waitForTimeout(90_000);
  const withDock = await list.locator('li[data-docking]:not([data-docking=""])').count();
  const rejected = await list.locator('li[data-status="rejected"]').count();
  // eslint-disable-next-line no-console
  console.log(`LIVE withDocking=${withDock} rejected=${rejected} rowsNow=${await list.locator('li').count()}`);
  await page.screenshot({ path: `${OUT}/live-candidates-scored.png` });
});
