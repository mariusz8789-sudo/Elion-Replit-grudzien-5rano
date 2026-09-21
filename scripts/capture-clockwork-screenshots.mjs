/* Proprietary / All Rights Reserved - Genesis OS */
// CLOCKWORK dashboard screenshots against a running Genesis server (default http://127.0.0.1:8080).
// Drives the real UI: cases are typed into the form, nothing is seeded. Output: artifacts/clockwork-*.png.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';
const executablePath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
// Same as the other e2e flows: the first-visit onboarding dialog is marked completed so the route itself renders.
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
await page.goto(BASE + '/clockwork');
await page.getByTestId('clockwork-dashboard').waitFor();
await page.getByTestId('cw-today').fill('2026-03-04');
await page.getByTestId('cw-operator').fill('J.Kowalska');
const add = async (id, kind, received, subject) => {
  await page.getByTestId('cw-new-id').fill(id);
  await page.getByTestId('cw-new-kind').selectOption(kind);
  await page.getByTestId('cw-new-received').fill(received);
  await page.getByTestId('cw-new-subject').fill(subject);
  await page.getByTestId('cw-new-submit').click();
};
await add('WOŚ.6131.12.2026', 'KPA_STANDARD', '2026-02-10', 'zezwolenie na usunięcie drzewa');
await add('AB.6730.3.2026', 'KPA_STANDARD', '2026-01-05', 'warunki zabudowy');
await add('OR.1431.7.2026', 'FOI', '2026-02-24', 'rejestr umów za 2025');
await add('OŚ.6341.2.2026', 'KPA_COMPLEX', '2026-02-20', 'pozwolenie wodnoprawne');
await page.getByTestId('cw-case-AB.6730.3.2026').waitFor();
await page.screenshot({ path: 'artifacts/clockwork-dashboard-desktop.png' });
await page.getByTestId('cw-case-WOŚ.6131.12.2026').click();
await page.getByTestId('cw-draft-ZAWIADOMIENIE_ART_36').waitFor();
await page.getByTestId('cw-draft-reason').fill('oczekiwanie na opinię Regionalnej Dyrekcji Ochrony Środowiska');
await page.getByTestId('cw-approver').fill('J.Kowalska');
await page.getByTestId('cw-approve').click();
await page.getByText('Dual-control: 1/2').waitFor();
await page.setViewportSize({ width: 1600, height: 1700 });
await page.screenshot({ path: 'artifacts/clockwork-draft-inspection.png' });
await browser.close();
if (errors.length) { console.error('CONSOLE ERRORS:', errors); process.exit(1); }
console.log('SCREENSHOTS: artifacts/clockwork-dashboard-desktop.png, artifacts/clockwork-draft-inspection.png');
