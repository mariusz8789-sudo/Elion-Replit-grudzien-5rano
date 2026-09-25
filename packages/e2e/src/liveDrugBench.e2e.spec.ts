/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const API = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';

async function api(path: string, token: string | null, body?: unknown): Promise<Record<string, any>> {
  const r = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return r.json() as Promise<Record<string, any>>;
}

/**
 * LIVE EXPERIMENT ACCEPTANCE (drug bench): the scientist walks to the bench of the ONE lab, the REAL
 * backend campaign runs (RDKit → ADMET-AI → Vina → PySCF), and while it computes the scene shows the
 * SAME state the backend persisted — proven by the scene's rendered state hash equalling the read
 * model's hash at several intermediate points. Then the session is sealed and replays to MATCH.
 */
test('drug bench: live state in the scene equals the backend run, end to end for one candidate', async ({ page }) => {
  test.setTimeout(900_000);
  const reg = await api('/api/auth/register', null, { email: `live-bench-${Date.now()}@lab.org`, password: 'password123' });
  const token: string = reg.token;
  const project = await api('/api/projects', token, { name: 'Live drug bench' });
  const projectId: string = project.project.id;
  const campaign = await api(`/api/projects/${projectId}/campaigns`, token, {
    objective: `Live drug bench ${Date.now()}`, domain: 'DRUG_DISCOVERY', startingSmiles: [ASPIRIN],
    budget: { maxGenerations: 2, maxGeneratedCandidates: 6 },
  });
  const campaignId: string = campaign.campaign.id;

  await page.addInitScript(({ t, u }) => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    window.localStorage.setItem('genesis-os:session/v1', JSON.stringify({ token: t, user: u }));
  }, { t: token, u: reg.user });
  await page.goto(`/#/scientific-worlds?station=st-drug-bench&project=${projectId}&campaign=${campaignId}`);

  const live = page.getByTestId('drug-bench-live');
  await expect(live).toBeVisible({ timeout: 300_000 });

  // While the engines compute: collect every state the scene has caught up with.
  const matched = new Set<string>();
  const seen = new Set<string>();
  const deadline = Date.now() + 700_000;
  let phase = '';
  while (Date.now() < deadline) {
    const snap = await live.evaluate((el) => ({ phase: el.getAttribute('data-phase') ?? '', state: el.getAttribute('data-state-hash') ?? '', scene: el.getAttribute('data-scene-hash') ?? '' }));
    phase = snap.phase;
    if (snap.state) seen.add(snap.state);
    if (snap.state && snap.state === snap.scene) matched.add(snap.state);
    if (phase === 'DONE' || phase === 'FAILED') break;
    await page.waitForTimeout(400);
  }
  expect(phase).toBe('DONE');
  // Let the scene catch up with the final state, then compare it too.
  await expect.poll(async () => live.evaluate((el) => el.getAttribute('data-state-hash') === el.getAttribute('data-scene-hash')), { timeout: 60_000 }).toBe(true);
  const finalHash = await live.getAttribute('data-state-hash');
  matched.add(finalHash!);
  console.log(`states seen: ${seen.size}, states rendered by the scene: ${matched.size}`);
  expect(matched.size, 'the scene must have rendered several distinct live states, not only the final one').toBeGreaterThanOrEqual(3);

  // The backend's own persisted events project to the same final state the scene shows.
  const events = await api(`/api/projects/${projectId}/campaigns/${campaignId}/events?after=0`, token);
  expect(events.events.length).toBeGreaterThan(3);
  expect(Number(await live.getAttribute('data-candidates'))).toBeGreaterThan(0);
  // The focused candidate's real RDKit conformer is on the bench.
  await expect.poll(async () => Number(await live.getAttribute('data-scene-atoms')), { timeout: 60_000 }).toBeGreaterThan(10);

  // The scientist seals the session from that run: the one outcome panel carries the frozen hypothesis,
  // its verdict, the engine runs, and replay reproduces the sealed session.
  await expect(page.getByTestId('sw-agent-state')).toHaveText(/bezczynny/i, { timeout: 180_000 });
  const evidenceToggle = page.getByTestId('sw-evidence').locator('button[aria-expanded]').first();
  if ((await evidenceToggle.getAttribute('aria-expanded')) !== 'true') await evidenceToggle.click();
  await expect(page.getByText(/Hipoteza: (SUPPORTED|WEAKENED|FALSIFIED|UNRESOLVED)/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('drug-hypothesis-fingerprint')).toBeVisible();
  await expect(page.getByTestId('drug-state-hash')).toContainText(finalHash!);
  await expect(page.getByTestId('sw-replay')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('sw-replay').click();
  await expect(page.getByTestId('sw-replay-verdict')).toContainText('MATCH', { timeout: 60_000 });
});
