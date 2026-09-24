/* Proprietary / All Rights Reserved - Genesis OS */
// BodyParts3D 4.0 anatomy pilot (Playwright, real Chromium, production server). DOM, network and
// scene diagnostics only: this spec deliberately takes NO screenshots and records NO video.
import { test, expect, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) }, screenshot: 'off', video: 'off', trace: 'off' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
});

const PILOT_NODES = 'aorta,heart,left-lung,liver,right-lung';

interface Diagnostics { render: { drawCalls: number; triangles: number } | null; lastPickedNode: string | null; organScreenPositions: { id: string; x: number; y: number }[] }
const diagnostics = async (page: Page): Promise<Diagnostics> => JSON.parse(await page.getByTestId('scientific-worlds').getAttribute('data-runtime-diagnostics') ?? '{}');

/** Open the explorer, pick the liver chip and isolate it: the first need for a pilot structure loads the atlas. */
async function isolateLiver(page: Page): Promise<string[]> {
  const requested: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/bodyparts3d/')) requested.push(new URL(r.url()).pathname); });
  await page.goto('/#/human-biology-lab');
  await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-world', 'biology', { timeout: 60_000 });
  await expect(page.getByTestId('sw-explorer')).toBeVisible({ timeout: 60_000 });
  // Nothing is fetched until a pilot structure is actually needed.
  expect(requested).toEqual([]);
  await page.getByTestId('human-inspector-toggle').click();
  await page.getByTestId('sw-explorer-organ-liver').click();
  await page.getByTestId('human-tab-section').click();
  await page.getByTestId('sw-explorer-isolate').click();
  return requested;
}

async function expectPilotLoaded(page: Page, lod: 'DESKTOP' | 'MOBILE', requested: string[]): Promise<{ runtimePath: string; bytes: number; loadMs: number }[]> {
  const attribution = page.getByTestId('bp3d-attribution');
  await expect(attribution).toHaveAttribute('data-status', 'READY', { timeout: 300_000 });
  await expect(attribution).toHaveAttribute('data-lod', lod);
  await expect(attribution).toHaveAttribute('data-nodes', PILOT_NODES);
  await expect(attribution).toContainText('BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International');
  const suffix = `.${lod.toLowerCase()}.glb`;
  expect([...requested].sort()).toEqual(PILOT_NODES.split(',').map((id) => `/assets/bodyparts3d/pilot/${id}${suffix}`));
  const d = JSON.parse(await attribution.getAttribute('data-diagnostics') ?? '[]') as { runtimePath: string; status: string; bytes: number; loadMs: number }[];
  expect(d.map((x) => x.status)).toEqual(Array(5).fill('READY'));
  return d;
}

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }] as const) {
  test(`mobile ${viewport.width}×${viewport.height}: the light level loads, is attributed, and fits the screen`, async ({ page }) => {
    test.setTimeout(600_000);
    page.setDefaultTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize(viewport);
    const requested = await isolateLiver(page);
    const d = await expectPilotLoaded(page, 'MOBILE', requested);
    console.log(`[bp3d] mobile ${viewport.width}: ${d.map((x) => `${x.runtimePath.split('/').pop()} ${x.bytes} B ${Math.round(x.loadMs)} ms`).join(' · ')}`);
    await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-camera', 'TWIN');
    const overflow = await page.evaluate(() => ({ vw: window.innerWidth, doc: document.documentElement.scrollWidth }));
    expect(overflow.doc, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.vw + 1);
    const a = await page.getByTestId('bp3d-attribution').boundingBox();
    expect(a && a.x >= 0 && a.x + a.width <= viewport.width + 1).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('desktop: full level loads, raycast picks the isolated reference liver, card shows its FMA/BP provenance', async ({ page }) => {
  // Software GL renders a frame every few seconds at this size; actions wait for the main thread.
  test.setTimeout(900_000);
  page.setDefaultTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
  const heapBefore = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null).catch(() => null);
  const requested = await isolateLiver(page);
  const d = await expectPilotLoaded(page, 'DESKTOP', requested);
  const heapAfter = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
  await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-camera', 'TWIN');

  // Real raycast through the existing pointer path: click where the isolated liver projects on the canvas.
  const canvas = page.locator('canvas').first();
  await expect.poll(async () => (await diagnostics(page)).organScreenPositions.map((o) => o.id).join(','), { timeout: 300_000 }).toBe('liver');
  const frame = Number(await page.getByTestId('scientific-worlds').getAttribute('data-frames'));
  await expect.poll(async () => Number(await page.getByTestId('scientific-worlds').getAttribute('data-frames')), { timeout: 300_000 }).toBeGreaterThan(frame + 3);
  const liver = (await diagnostics(page)).organScreenPositions.find((o) => o.id === 'liver')!;
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + liver.x, box.y + liver.y);
  await expect.poll(async () => (await diagnostics(page)).lastPickedNode, { timeout: 300_000 }).toBe('liver');
  const render = (await diagnostics(page)).render;
  console.log(`[bp3d] desktop: ${d.map((x) => `${x.runtimePath.split('/').pop()} ${x.bytes} B ${Math.round(x.loadMs)} ms`).join(' · ')}`);
  console.log(`[bp3d] desktop render: drawCalls=${render?.drawCalls} triangles=${render?.triangles} · JS heap ${heapBefore} → ${heapAfter} B`);

  await page.getByTestId('human-tab-research').click();
  await expect(page.getByTestId('sw-explorer-reference')).toHaveAttribute('data-fma', 'FMA7197');
  await expect(page.getByTestId('sw-explorer-reference')).toHaveAttribute('data-bp', 'BP9334');
  await expect(page.getByTestId('sw-explorer-reference')).toHaveAttribute('data-lod', 'DESKTOP');
  await expect(page.getByTestId('sw-explorer-reference-scope')).toContainText('nie pacjent');
  expect(errors).toEqual([]);
});
