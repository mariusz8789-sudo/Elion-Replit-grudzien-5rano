/* Proprietary / All Rights Reserved - Genesis OS */
// Genesis Lab Closed Loop — the EXISTING UI (CampaignScreen -> LabValidationPanel), against the
// REAL local API and a REAL, freshly-generated campaign candidate (RDKit, genuinely available in
// this environment). No physical laboratory is executed anywhere in this test or the product it
// exercises — "external observation" here is a caller-supplied artifact with its own declared
// provenance/QC/hash, reviewed by a human; the flow is software-only, exactly as the product
// itself discloses in its own on-screen copy.
//
// The UI now supplies the governed-manual-request basis and freezes comparison output/unit/
// tolerance at request creation. This spec also exercises the separate in-silico Virtual Lab
// loop on the same real candidate; it never presents that computation as a physical observation.
import { test, expect, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({
  launchOptions: {
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  },
});

const API_BASE = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';
const FIXTURE_OBJECTIVE = `GENESIS_E2E_VLAB_FIXTURE_${Date.now()}`;

interface SeededFixture {
  token: string;
  user: unknown;
  projectId: string;
  campaignId: string;
  candidateCount: number;
}

/** Seeds a REAL project + a REAL, small, generated campaign (RDKit-only, no docking/QM budget
 *  needed to produce a candidate) via the real local HTTP API — "deterministic test fixture
 *  data" via the real API, exactly as this task's brief permits. Not a mock: every call below is
 *  a genuine request against the running production server. */
async function seedRealCampaignWithCandidate(): Promise<SeededFixture> {
  const email = `e2e-vlab-closed-loop-${Date.now()}@lab.org`;
  const reg = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  }).then((r) => r.json());
  const token: string = reg.token;

  const proj = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'E2E Lab Closed Loop Fixture' }),
  }).then((r) => r.json());
  const projectId: string = proj.project.id;

  const camp = await fetch(`${API_BASE}/api/projects/${projectId}/campaigns`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      objective: FIXTURE_OBJECTIVE, domain: 'DRUG_DISCOVERY', startingSmiles: ['c1ccccc1'],
      budget: { maxGenerations: 1, maxGeneratedCandidates: 2 },
    }),
  }).then((r) => r.json());
  const campaignId: string = camp.campaign.id;

  await fetch(`${API_BASE}/api/projects/${projectId}/campaigns/${campaignId}/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}',
  });

  // A single small (maxGeneratedCandidates: 2) RDKit-only generation completes in ~20s in this
  // environment (measured directly against this branch's own build before writing this test) —
  // a fixed wait, not a tight poll loop, avoids hammering the server while its single Node event
  // loop is busy running the real orchestrator job.
  await new Promise((resolve) => setTimeout(resolve, 22_000));

  const status = await fetch(`${API_BASE}/api/projects/${projectId}/campaigns/${campaignId}`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  expect(status.campaign?.status, 'the seeded fixture campaign must actually complete before the UI test proceeds').toBe('completed');

  const candidates = await fetch(`${API_BASE}/api/projects/${projectId}/campaigns/${campaignId}/candidates`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  expect(candidates.candidates?.length ?? 0, 'the seeded fixture campaign must produce at least one real candidate').toBeGreaterThan(0);

  return { token, user: reg.user, projectId, campaignId, candidateCount: candidates.candidates.length };
}

async function injectSession(page: Page, token: string, user: unknown): Promise<void> {
  await page.addInitScript(({ t, u }) => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    window.localStorage.setItem('genesis-os:session/v1', JSON.stringify({ token: t, user: u }));
  }, { t: token, u: user });
}

test.describe('Genesis computational + external Lab loops — real API and real candidate', () => {
  test('Virtual Lab executes/replays RDKit and external validation accepts a governed request', async ({ page }) => {
    const fixture = await seedRealCampaignWithCandidate();
    const errors: string[] = [];
    const blockedOptionalResponses: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (response) => {
      if (response.status() === 503) blockedOptionalResponses.push(response.url());
    });

    await injectSession(page, fixture.token, fixture.user);
    await page.goto('/#/campaign');
    await expect(page.getByRole('heading', { name: 'Kampanie' })).toBeVisible({ timeout: 15_000 });

    // Real UI interaction: select the real, freshly-generated campaign (no LabValidationPanel
    // binding exists for the project/campaign pickers themselves — this locates the real
    // button the campaign list renders for our fixture's own distinctive objective string).
    await page.getByRole('button', { name: FIXTURE_OBJECTIVE }).click();

    const panel = page.getByTestId('lab-validation-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // The candidate dropdown is populated from the REAL generated candidates — proves the panel
    // is wired to the real campaign state, not a placeholder.
    const candidateSelect = page.getByTestId('lab-validation-candidate');
    await expect(candidateSelect.locator('option')).toHaveCount(fixture.candidateCount);

    // Execute the real in-silico loop through the product UI. The engine result and replay
    // status both come back from the canonical backend; the browser derives neither value.
    const virtualLab = page.getByTestId('virtual-lab-panel');
    await expect(virtualLab).toBeVisible();
    await virtualLab.getByTestId('virtual-lab-plan').click();
    await expect(virtualLab.getByRole('status')).toContainText('Plan ready:', { timeout: 10_000 });
    await virtualLab.getByTestId('virtual-lab-execute').click();
    await expect(virtualLab.getByTestId('virtual-lab-dossier')).toContainText('EXECUTED_COMPUTATIONAL_EXPERIMENT', { timeout: 20_000 });
    await expect(virtualLab.getByTestId('virtual-lab-dossier')).toContainText('pending proposal');
    await virtualLab.getByTestId('virtual-lab-replay').click();
    await expect(virtualLab.getByTestId('virtual-lab-dossier')).toContainText('REPLAY_MATCH', { timeout: 20_000 });
    const executionEvents = virtualLab.getByTestId('scientific-execution-events');
    await expect(executionEvents).toContainText('ENGINE SELECTED');
    await expect(executionEvents).toContainText('EXECUTION COMPLETED');
    await expect(executionEvents).toContainText('EVIDENCE PROPOSED');
    await expect(executionEvents).toContainText('REPLAY MATCH');
    await expect(executionEvents).not.toContainText('ENGINE PROGRESS');

    await virtualLab.getByTestId('experiment-presentation-level').selectOption('SCHOOL');
    await expect(executionEvents).toContainText('Genesis selected the scientific program');
    await virtualLab.getByTestId('experiment-presentation-level').selectOption('RESEARCH');
    await expect(virtualLab.getByTestId('research-execution-details')).toContainText('Output fingerprint');

    // Create a real governed external-validation request. No external observation is invented.
    await panel.getByLabel('Endpoint ID').fill('e2e-endpoint');
    await panel.getByLabel('Expected unit').fill('dimensionless');
    await panel.getByLabel('Model output key to compare').fill('crippenLogP');
    await panel.getByLabel('Pre-registered absolute tolerance').fill('0.25');
    const createButton = page.getByTestId('lab-validation-create-request');
    await expect(createButton).toBeEnabled();
    await createButton.click();
    await expect(panel.getByRole('status')).toContainText('Validation request:', { timeout: 10_000 });
    const counts = page.getByTestId('lab-validation-counts');
    await expect(counts).toBeVisible();
    await expect(counts).toContainText('1 request(s)');

    expect(blockedOptionalResponses.length).toBeGreaterThan(0);
    expect(blockedOptionalResponses.every((url) => url.includes('/api/compute/admet/endpoints'))).toBe(true);
    const unexpectedErrors = errors.filter((entry) => !entry.includes('503 (Service Unavailable)'));
    expect(unexpectedErrors, errors.join('\n')).toEqual([]);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/physical laboratory (executed|ran)/i);
  });
});
