/* Proprietary / All Rights Reserved - Genesis OS */
// CLOCKWORK e2e (Playwright): the clerk's dashboard on the production server, driven the way a clerk would.
// Cases are entered through the form (no seeded data), the engine classifies them, a draft is reviewed under
// dual-control, and two screenshots land in artifacts/.
import { test, expect } from '@playwright/test';

test('clockwork dashboard: enter cases, statuses, ledger hash, draft under dual-control, screenshots', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Same as the other e2e flows: the first-visit onboarding dialog is marked completed so the route itself renders.
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('/clockwork');
  await expect(page.getByTestId('clockwork-dashboard')).toBeVisible();
  await expect(page.getByText('Brak spraw w tej grupie').first()).toBeVisible();

  // Fixed assessment day so the statuses are reproducible whatever day the spec runs.
  await page.getByTestId('cw-today').fill('2026-03-04');
  await page.getByTestId('cw-operator').fill('J.Kowalska');

  const add = async (id: string, kind: string, received: string, subject: string): Promise<void> => {
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

  await expect(page.getByTestId('cw-case-WOŚ.6131.12.2026')).toHaveAttribute('data-status', 'DUE_SOON');
  await expect(page.getByTestId('cw-case-AB.6730.3.2026')).toHaveAttribute('data-status', 'OVERDUE');
  await expect(page.getByTestId('cw-case-OR.1431.7.2026')).toHaveAttribute('data-status', 'DUE_SOON');
  await expect(page.getByTestId('cw-case-OŚ.6341.2.2026')).toHaveAttribute('data-status', 'ON_TRACK');
  await expect(page.getByText('PO TERMINIE 1')).toBeVisible();
  await page.screenshot({ path: 'artifacts/clockwork-dashboard-desktop.png' });

  // Inspect the due-soon KPA case: statutory deadline, basis, real ledger hash, the art. 36 draft.
  await page.getByTestId('cw-case-WOŚ.6131.12.2026').click();
  await expect(page.getByTestId('cw-inspect')).toBeVisible();
  await expect(page.getByTestId('cw-ledger-hash')).toContainText(/contentHash [0-9a-f]{64}/);
  const draft = page.getByTestId('cw-draft-ZAWIADOMIENIE_ART_36');
  await expect(draft).toBeVisible();
  await expect(draft.getByTestId('cw-draft-body')).toContainText('art. 36 §1 KPA');

  // Dual-control: empty reason refused, same person twice blocked, second person seals.
  await page.getByTestId('cw-approver').fill('J.Kowalska');
  await page.getByTestId('cw-approve').click();
  await expect(page.getByTestId('cw-approve-error')).toContainText('Najpierw uzupełnij przyczynę');
  await page.getByTestId('cw-draft-reason').fill('oczekiwanie na opinię Regionalnej Dyrekcji Ochrony Środowiska');
  await page.getByTestId('cw-approve').click();
  await expect(page.getByText('Dual-control: 1/2')).toBeVisible();
  await page.getByTestId('cw-approve').click();
  await expect(page.getByTestId('cw-approve-error')).toContainText('BLOCKED');
  // A tall viewport instead of fullPage: fullPage capture floats the fixed navigation rail mid-page.
  await page.setViewportSize({ width: 1600, height: 1700 });
  await page.screenshot({ path: 'artifacts/clockwork-draft-inspection.png' });
  await page.getByTestId('cw-approver').fill('M.Nowak');
  await page.getByTestId('cw-approve').click();
  await expect(page.getByTestId('cw-final-hash')).toContainText(/hash zatwierdzonego pisma: [0-9a-f]{64}/);
  await expect(page.getByText('ZATWIERDZONE 2/2')).toBeVisible();

  expect(errors).toEqual([]);
});
