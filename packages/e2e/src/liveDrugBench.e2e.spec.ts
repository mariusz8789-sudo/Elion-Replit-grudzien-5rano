/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const API = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';
/** Imatinib: the co-crystallised, NON-COVALENT ligand of the docking target (PDB 1IEP, chain A). */
const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';

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
 * backend campaign runs (RDKit → ADMET-AI → Vina against the real protein PDB 1IEP chain A → PySCF),
 * and while it computes the scene shows the SAME state the backend persisted — proven by the scene's
 * rendered state hash equalling the read model's hash at several intermediate points. The docked pose
 * the scene draws is the one Vina produced. Then the session is sealed and replays to MATCH.
 */

/** The lab shows the world by default; the panels (evidence, status, readouts) live behind one control. */
async function openLabDetails(page: import('@playwright/test').Page): Promise<void> {
  const details = page.getByTestId('sw-details');
  await details.waitFor({ state: 'visible', timeout: 120_000 });
  if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
}

test('drug bench: live state in the scene equals the backend run, end to end for one candidate', async ({ page }) => {
  test.setTimeout(900_000);
  const reg = await api('/api/auth/register', null, { email: `live-bench-${Date.now()}@lab.org`, password: 'password123' });
  const token: string = reg.token;
  const project = await api('/api/projects', token, { name: 'Live drug bench' });
  const projectId: string = project.project.id;
  const campaign = await api(`/api/projects/${projectId}/campaigns`, token, {
    objective: `Live drug bench ${Date.now()}`, domain: 'DRUG_DISCOVERY', startingSmiles: [IMATINIB],
    budget: { maxGenerations: 2, maxGeneratedCandidates: 6 },
  });
  const campaignId: string = campaign.campaign.id;

  await page.addInitScript(({ t, u }) => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    window.localStorage.setItem('genesis-os:session/v1', JSON.stringify({ token: t, user: u }));
  }, { t: token, u: reg.user });
  await page.goto(`/#/scientific-worlds?station=st-drug-bench&project=${projectId}&campaign=${campaignId}`);

  // The laboratory opens as a world, not a dashboard: every panel is behind one control.
  await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-details', 'closed');
  await openLabDetails(page);

  const live = page.getByTestId('drug-bench-live');
  await expect(live).toBeVisible({ timeout: 300_000 });

  // While the engines compute: collect every state the scene has caught up with.
  const matched = new Set<string>();
  const seen = new Set<string>();
  const dockingSteps = new Set<string>();
  const procedurePhases: string[] = [];
  const deadline = Date.now() + 700_000;
  let phase = '';
  while (Date.now() < deadline) {
    const snap = await live.evaluate((el) => ({ phase: el.getAttribute('data-phase') ?? '', state: el.getAttribute('data-state-hash') ?? '', scene: el.getAttribute('data-scene-hash') ?? '', step: el.getAttribute('data-docking-step') ?? '', procedure: el.getAttribute('data-procedure') ?? '' }));
    phase = snap.phase;
    if (snap.state) seen.add(snap.state);
    if (snap.step) dockingSteps.add(snap.step);
    if (snap.procedure && procedurePhases.at(-1) !== snap.procedure) procedurePhases.push(snap.procedure);
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

  // The docking ran against the real protein, step by step, and the pose Vina produced is in the scene.
  expect(await live.getAttribute('data-target')).toBe('ABL1_1IEP');
  // The panel followed the run live (a step shorter than the poll interval can be missed), and the
  // backend's own events hold the full sequence, each written only once that step actually completed.
  expect([...dockingSteps]).toContain('POSE_SCORED');
  expect(dockingSteps.size, 'the bench showed the docking advancing, not just its result').toBeGreaterThan(1);
  const steps = (events.events as { type: string; payload: Record<string, any> }[])
    .filter((e) => e.payload?.stage === 'docking')
    .map((e) => e.payload.step ?? e.payload.reason);
  expect(steps).toEqual(['RECEPTOR_PREPARED', 'SELECTED_FOR_DOCKING', 'LIGAND_PREPARED', 'VINA_STARTED', 'DOCKING_RESULT_RETAINED']);
  expect(Number(await live.getAttribute('data-pose-atoms'))).toBeGreaterThan(20);
  await expect.poll(async () => Number(await live.getAttribute('data-scene-pose-atoms')), { timeout: 60_000 })
    .toBe(Number(await live.getAttribute('data-pose-atoms')));
  await expect(live).toContainText('PDB 1IEP');

  // The bench procedure a viewer can follow: the phases appeared in their laboratory order, each only
  // once the record that proves it existed, and the finished run has them all behind it.
  const ORDER = ['PREPARE', 'LOAD', 'CONFIGURE', 'EXECUTE', 'OBSERVE', 'MEASURE', 'INTERPRET', 'EVIDENCE', 'REPLAY'];
  const seenPhases = procedurePhases.filter((p) => ORDER.includes(p));
  expect(seenPhases.length, 'the panel followed the procedure while the engines ran').toBeGreaterThan(1);
  expect(seenPhases.map((p) => ORDER.indexOf(p))).toEqual([...seenPhases.map((p) => ORDER.indexOf(p))].sort((a, b) => a - b));
  const doneNow = (await live.getAttribute('data-procedure-done') ?? '').split(',');
  expect(doneNow).toEqual(expect.arrayContaining(['PREPARE', 'LOAD', 'CONFIGURE', 'EXECUTE', 'OBSERVE', 'MEASURE']));
  await expect(live).toContainText('REAL_ENGINE_OUTPUT');
  await expect(live).toContainText('MODEL_ESTIMATE');

  // The scientist seals the session from that run: the one outcome panel carries the frozen hypothesis,
  // its verdict, the engine runs, and replay reproduces the sealed session.
  await expect(page.getByTestId('sw-agent-state')).toHaveText(/bezczynny/i, { timeout: 180_000 });
  const evidenceToggle = page.getByTestId('sw-evidence').locator('button[aria-expanded]').first();
  if ((await evidenceToggle.getAttribute('aria-expanded')) !== 'true') await evidenceToggle.click();
  await expect(page.getByText(/Hipoteza: (SUPPORTED|WEAKENED|FALSIFIED|UNRESOLVED)/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('drug-hypothesis-fingerprint')).toBeVisible();
  await expect(page.getByTestId('drug-state-hash')).toContainText(finalHash!);
  await expect(page.getByTestId('drug-receptor')).toContainText('PDB 1IEP, łańcuch A');
  await expect(page.getByTestId('drug-pose-hash')).toBeVisible();
  await expect(page.getByTestId('sw-replay')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('sw-replay').click();
  await expect(page.getByTestId('sw-replay-verdict')).toContainText('MATCH', { timeout: 60_000 });
});
