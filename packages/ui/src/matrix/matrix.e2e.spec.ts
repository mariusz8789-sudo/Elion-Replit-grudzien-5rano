/* Proprietary / All Rights Reserved - Genesis OS */
// PROPOSED E2E (Playwright). Uruchamia takze zrzuty ekranu HUD-u do artifacts/.
import { test, expect } from '@playwright/test';
test('matrix route: hex/bin rain canvas + live ledger hashes + INSUFFICIENT badge + screenshots', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { (window as unknown as { __GENESIS_TEST__: boolean }).__GENESIS_TEST__ = true; });
  await page.goto('/matrix');
  await expect(page.locator('canvas').first()).toBeVisible();
  const bodyText = await page.locator('body').innerText();
  expect((bodyText.match(/[一-鿿]/g) ?? []).length).toBe(0);
  await page.evaluate(() => {
    const append = (window as unknown as { __genesisLedgerAppend: (e: { index: number; kind: string; recordId: string; contentHash: string; at: number }) => void }).__genesisLedgerAppend;
    append({ index: 1, kind: 'ADD', recordId: 'EV-TEST1', contentHash: 'a'.repeat(64), at: 1000 });
    append({ index: 2, kind: 'ADD', recordId: 'EV-TEST2', contentHash: 'b'.repeat(64), at: 1001 });
  });
  await expect(page.getByText(/a{40}/)).toBeVisible();
  await expect(page.getByText(/b{40}/)).toBeVisible();
  await page.evaluate(() => {
    const cep = (window as unknown as { __genesisCepAppend: (a: { patternId: string; status: string; score: number; confidence: number; at: number }) => void }).__genesisCepAppend;
    cep({ patternId: 'CIC-TEST', status: 'INSUFFICIENT_EVIDENCE', score: 0.2, confidence: 0.1, at: 1 });
  });
  await expect(page.getByText('INSUFFICIENT_EVIDENCE')).toBeVisible();
  await page.screenshot({ path: 'artifacts/matrix-hud-live.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/matrix-hud-mobile.png' });
  expect(errors).toEqual([]);
});
