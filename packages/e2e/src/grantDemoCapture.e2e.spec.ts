/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

/**
 * GRANT DEMO CAPTURE — not an acceptance test. It drives the SAME real campaign the acceptance test
 * drives (RDKit → ADMET-AI → AutoDock Vina against PDB 1IEP chain A → PySCF, then seal and replay)
 * and photographs it at the six moments a grant reviewer actually needs to see. Every frame is the
 * running product against a live backend: nothing here is staged, and nothing is rendered offline.
 *
 * It exists because a deck built from screenshots of a real run survives the question "can we see
 * that live?", and a deck built from renders does not.
 */
const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const API = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';
const OUT = process.env.DEMO_OUT ?? 'artifacts/demo';
/** Imatinib: the co-crystallised, non-covalent ligand of the docking target (PDB 1IEP, chain A). */
const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';

async function api(path: string, token: string | null, body?: unknown): Promise<Record<string, any>> {
  const r = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return r.json() as Promise<Record<string, any>>;
}

async function openLabDetails(page: import('@playwright/test').Page): Promise<void> {
  const details = page.getByTestId('sw-details');
  await details.waitFor({ state: 'visible', timeout: 120_000 });
  if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
}

test('grant demo: photograph one real campaign from question to protocol', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1600, height: 1000 });

  const reg = await api('/api/auth/register', null, { email: `grant-demo-${Date.now()}@lab.org`, password: 'password123' });
  const token: string = reg.token;
  const project = await api('/api/projects', token, { name: 'Genesis grant demo' });
  const projectId: string = project.project.id;
  const campaign = await api(`/api/projects/${projectId}/campaigns`, token, {
    objective: `Grant demo ${Date.now()}`, domain: 'DRUG_DISCOVERY', startingSmiles: [IMATINIB],
    budget: { maxGenerations: 2, maxGeneratedCandidates: 6 },
  });
  const campaignId: string = campaign.campaign.id;

  await page.addInitScript(({ t, u }) => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    window.localStorage.setItem('genesis-os:session/v1', JSON.stringify({ token: t, user: u }));
  }, { t: token, u: reg.user });
  await page.goto(`/#/scientific-worlds?station=st-drug-bench&project=${projectId}&campaign=${campaignId}`);

  // 1. The laboratory as the visitor first meets it: a place, not a dashboard.
  await expect(page.getByTestId('scientific-worlds')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/01-laboratory.png` });

  // 2. The panels: the same run, with its engines and its state named.
  await openLabDetails(page);
  const live = page.getByTestId('drug-bench-live');
  await expect(live).toBeVisible({ timeout: 300_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/02-live-state.png` });

  // 3. Mid-run: the engines are working and the scene is showing what the backend has persisted.
  await page.waitForTimeout(45_000);
  await page.screenshot({ path: `${OUT}/03-engines-running.png` });

  // 4. The sealed result: verdict, candidates, and why the others were rejected.
  const protocol = page.getByTestId('drug-protocol');
  await protocol.waitFor({ state: 'visible', timeout: 600_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/04-result-sealed.png` });

  // 5. The final protocol, in full: the reproducible artefact a reviewer can check.
  await protocol.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/05-final-protocol.png` });
  await protocol.screenshot({ path: `${OUT}/06-protocol-detail.png` });

  // The backend's own copy of the protocol, saved next to the frames so the deck can show that the
  // number on screen and the number in the database are the same number.
  const backendProtocol = await api(`/api/projects/${projectId}/campaigns/${campaignId}/protocol`, token);
  await page.evaluate(() => undefined);
  test.info().attach('protocol.json', { body: JSON.stringify(backendProtocol, null, 1), contentType: 'application/json' });
  // eslint-disable-next-line no-console
  console.log('DEMO_PROJECT=' + projectId + ' DEMO_CAMPAIGN=' + campaignId);
});
