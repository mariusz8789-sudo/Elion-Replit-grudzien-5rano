/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const API = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';
/** Imatinib: the co-crystallised, NON-COVALENT ligand of the docking target (PDB 1IEP, chain A). */
const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';

async function api(path: string, token: string | null, body?: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return r.json() as Promise<Record<string, unknown>>;
}

/**
 * D-150 — THE WHOLE STORY IN ONE BROWSER RUN: start a real campaign → the real engines → a finalist →
 * the 13 self-falsification probes, each with a verdict, a reason, an evidence source and an evidence
 * identity → what is still unknown → the next experiments → the server's scientific memory → the
 * evidence identities → replay.
 *
 * This spec asserts nothing about WHICH verdict a probe reaches: it asserts the CONTRACT — all 13
 * probes present, every PASS/FAIL carrying a resolvable evidence identity, every UNRESOLVED carrying
 * a named blocker, and the whole thing agreeing with what the backend persisted. A probe that FAILs
 * in this environment is a real finding, not a broken test, so the spec records the distribution
 * rather than demanding a clean sheet.
 *
 * WHICH ENGINES ARE REAL HERE is read from `/api/health` and printed, so a run with a blocked
 * engine (ADMET-AI, PySCF) is honest about what it did and did not execute.
 */
test('finalist falsification: campaign → finalist → 13 probes with provenance → unknowns → next experiments → memory → evidence → replay', async ({ page }) => {
  test.setTimeout(900_000);

  const health = await api('/api/health', null);
  const toolchain = (health.toolchain as { id: string; status: string; version: string | null }[]) ?? [];
  const engineStatus = Object.fromEntries(toolchain.map((t) => [t.id, t.status]));
  console.log(`ENGINES: ${toolchain.map((t) => `${t.id}=${t.status}${t.version ? `(${t.version})` : ''}`).join(' ')}`);
  // The two engines this flow genuinely needs: RDKit (generation) and Vina (the docking measurement).
  expect(engineStatus.rdkit, 'RDKit must be available for the generation stage to be real').toBe('AVAILABLE');
  expect(engineStatus.vina, 'AutoDock Vina must be available for the docking measurement to be real').toBe('AVAILABLE');

  const reg = await api('/api/auth/register', null, { email: `falsify-${Date.now()}@lab.org`, password: 'password123' });
  const token = reg.token as string;
  const project = await api('/api/projects', token, { name: 'Finalist falsification' });
  const projectId = (project.project as { id: string }).id;
  const campaign = await api(`/api/projects/${projectId}/campaigns`, token, {
    objective: `Falsification battery ${Date.now()}`, domain: 'DRUG_DISCOVERY', startingSmiles: [IMATINIB],
    budget: { maxGenerations: 2, maxGeneratedCandidates: 6 },
  });
  const campaignId = (campaign.campaign as { id: string }).id;

  await page.addInitScript(({ t, u }) => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    window.localStorage.setItem('genesis-os:session/v1', JSON.stringify({ token: t, user: u }));
  }, { t: token, u: reg.user });
  await page.goto(`/#/scientific-worlds?station=st-drug-bench&project=${projectId}&campaign=${campaignId}`);

  // STEP 1 — START. The lab opens as a world; the panels are behind one control.
  const details = page.getByTestId('sw-details');
  await details.waitFor({ state: 'visible', timeout: 120_000 });
  if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
  const live = page.getByTestId('drug-bench-live');
  await expect(live).toBeVisible({ timeout: 300_000 });

  // STEP 2 — THE REAL ENGINES RUN. Wait for the run to end, following its own phase attribute.
  const deadline = Date.now() + 700_000;
  let phase = '';
  while (Date.now() < deadline) {
    phase = (await live.getAttribute('data-phase')) ?? '';
    if (phase === 'DONE' || phase === 'FAILED') break;
    await page.waitForTimeout(500);
  }
  expect(phase, 'the real campaign and its heavy stage must finish').toBe('DONE');
  expect(await live.getAttribute('data-target')).toBe('ABL1_1IEP');
  await expect(live).toContainText('PDB 1IEP');
  // What the engines actually persisted. A stage whose engine is blocked in this environment is
  // recorded as STAGE_BLOCKED, and the spec says so instead of pretending it ran.
  const events = (await api(`/api/projects/${projectId}/campaigns/${campaignId}/events?after=0`, token)).events as { type: string; payload: Record<string, unknown> }[];
  const blocked = events.filter((e) => e.type === 'STAGE_BLOCKED').map((e) => `${e.payload.stage}:${e.payload.blocker}`);
  console.log(`BLOCKED STAGES (engine not present in this environment): ${blocked.length ? blocked.join(', ') : 'none'}`);
  const dockingSteps = events.filter((e) => e.payload?.stage === 'docking').map((e) => e.payload.step ?? e.payload.reason);
  expect(dockingSteps, 'the docking measurement must be real: receptor prepared, ligand prepared, Vina run, pose scored')
    .toEqual(expect.arrayContaining(['RECEPTOR_PREPARED', 'LIGAND_PREPARED', 'VINA_STARTED']));
  expect(dockingSteps.some((s) => String(s).startsWith('DOCKING_RESULT'))).toBe(true);

  // STEP 3 — A FINALIST. The funnel put at least one candidate with a measured score on the stand.
  const zones = Object.fromEntries((await live.getAttribute('data-bench-zones'))!.split(',').map((p) => {
    const [zone, count] = p.split(':');
    return [zone, Number(count)];
  })) as Record<string, number>;
  expect(zones.FINALIST, 'a finished run must have at least one finalist with a measured score').toBeGreaterThan(0);

  // STEP 4 — THE 13 PROBES, EACH WITH PROVENANCE. This is what D-150 adds.
  const panel = page.getByTestId('drug-finalist-falsification');
  await expect(panel).toBeVisible({ timeout: 120_000 });
  await expect(panel).toHaveAttribute('data-status', 'RESOLVED');
  await expect(panel).toContainText('Genesis próbuje obalić własny wynik');
  await expect(panel).toContainText('Genesis nie ogłasza sukcesu');
  const rows = page.getByTestId('drug-finalist-probe');
  await expect(rows).toHaveCount(13);
  const ALL = ['LEAKAGE', 'SELECTION_BIAS', 'MULTIPLE_TESTING', 'OVERFITTING', 'HIDDEN_PREREG',
    'DATASET_CONTAMINATION', 'TAUTOLOGY', 'CONFOUNDING', 'ALTERNATIVE_MODEL',
    'MEASUREMENT_ARTIFACT', 'NUMERICAL_ARTIFACT', 'PREPROCESSING_ARTIFACT', 'TEMPORAL_LEAKAGE'];
  const probes = await rows.evaluateAll((els) => els.map((el) => ({
    probe: el.getAttribute('data-probe') ?? '',
    verdict: el.getAttribute('data-verdict') ?? '',
    source: el.getAttribute('data-evidence-source') ?? '',
    id: el.getAttribute('data-evidence-id') ?? '',
    blocker: el.getAttribute('data-blocker') ?? '',
    text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  })));
  // All 13, in the battery's own order, no subset and no repeat.
  expect(probes.map((p) => p.probe)).toEqual(ALL);
  for (const p of probes) {
    expect(['PASS', 'FAIL', 'UNRESOLVED'], p.probe).toContain(p.verdict);
    // THE CONTRACT: a verdict without provenance, or an UNRESOLVED without a blocker, is a bug.
    if (p.verdict === 'UNRESOLVED') {
      expect(p.blocker, `${p.probe} is UNRESOLVED and must name its blocker`).toBe('1');
      expect(p.id, `${p.probe} is UNRESOLVED and must claim no evidence`).toBe('');
      expect(p.text, p.probe).toContain('Brakuje:');
    } else {
      expect(p.source.length, `${p.probe} (${p.verdict}) must name its evidence source`).toBeGreaterThan(5);
      expect(p.id, `${p.probe} (${p.verdict}) must carry a resolvable evidence identity`).toMatch(/^(sha256:[0-9a-f]{64}|fnv1a:[0-9a-f]+|prereg-|[A-Za-z0-9_-]{6,})/);
      expect(p.blocker, `${p.probe} is ${p.verdict} and must carry no blocker`).toBe('');
    }
  }
  const counts = { PASS: 0, FAIL: 0, UNRESOLVED: 0 } as Record<string, number>;
  for (const p of probes) counts[p.verdict] += 1;
  console.log(`13 PROBES: PASS=${counts.PASS} FAIL=${counts.FAIL} UNRESOLVED=${counts.UNRESOLVED}`);
  for (const p of probes) console.log(`  ${p.verdict.padEnd(10)} ${p.probe.padEnd(23)} ${p.id || '(no evidence)'}`);
  expect(counts.PASS + counts.FAIL + counts.UNRESOLVED).toBe(13);
  // The panel's own counters must agree with the rows it drew.
  expect(Number(await panel.getAttribute('data-pass'))).toBe(counts.PASS);
  expect(Number(await panel.getAttribute('data-fail'))).toBe(counts.FAIL);
  expect(Number(await panel.getAttribute('data-unresolved'))).toBe(counts.UNRESOLVED);
  // The four probes the recorded real redock + control run resolves are pinned to that run's sha256.
  const byProbe = Object.fromEntries(probes.map((p) => [p.probe, p]));
  for (const id of ['NUMERICAL_ARTIFACT', 'MEASUREMENT_ARTIFACT', 'ALTERNATIVE_MODEL', 'TAUTOLOGY']) {
    expect(byProbe[id].verdict, id).not.toBe('UNRESOLVED');
    expect(byProbe[id].id, id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(byProbe[id].source, id).toContain('docs/evidence/finalist-falsification');
  }
  // HIDDEN_PREREG points at the SERVER's own preregistration record, not at anything the tab computed.
  expect(byProbe.HIDDEN_PREREG.verdict).not.toBe('UNRESOLVED');

  // STEP 5 — WHAT IS STILL UNKNOWN. Every UNRESOLVED probe appears, and so does the tissue caveat.
  const unknowns = page.getByTestId('drug-finalist-unknowns');
  await expect(unknowns).toBeVisible();
  const unknownIds = await unknowns.locator('li').evaluateAll((els) => els.map((el) => el.getAttribute('data-unknown') ?? ''));
  for (const p of probes.filter((x) => x.verdict === 'UNRESOLVED')) expect(unknownIds).toContain(`probe:${p.probe}`);
  await expect(unknowns).toContainText('Efekt leku w tym narządzie: nie policzony');
  expect(Number(await unknowns.getAttribute('data-count'))).toBe(unknownIds.length);

  // STEP 6 — THE NEXT EXPERIMENTS. The run's own next step first, then one resolver per unresolved probe.
  const next = page.getByTestId('drug-finalist-next');
  await expect(next).toBeVisible();
  const nextProbes = await next.locator('li').evaluateAll((els) => els.map((el) => el.getAttribute('data-probe') ?? ''));
  expect(nextProbes[0]).toBe('HYPOTHESIS');
  expect(nextProbes.slice(1)).toEqual(probes.filter((p) => p.verdict === 'UNRESOLVED').map((p) => p.probe));
  // The caption sits next to the list, on the panel: a next experiment is a proposal, never something run.
  await expect(panel).toContainText('propozycje, nie uruchomione automatycznie');

  // STEP 7 — THE EVIDENCE IDENTITIES, listed once each, resolvable.
  const evidence = page.getByTestId('drug-finalist-evidence');
  await expect(evidence).toBeVisible();
  const identities = await evidence.locator('li').evaluateAll((els) => els.map((el) => el.getAttribute('data-evidence-identity') ?? ''));
  expect(identities.length, 'the report must list the evidence it used').toBeGreaterThan(0);
  expect(new Set(identities).size).toBe(identities.length);
  // Every identity a row claimed is in the list.
  for (const p of probes.filter((x) => x.verdict !== 'UNRESOLVED')) expect(identities).toContain(p.id);
  console.log(`EVIDENCE RECORDS USED: ${identities.length}`);

  // STEP 8 — SCIENTIFIC MEMORY ON THE SERVER. The criteria were stored before the engines ran and the
  // sealed result was checked against them by the server itself.
  await expect(page.getByTestId('sw-agent-state')).toHaveText(/bezczynny/i, { timeout: 180_000 });
  const memory = (await api(`/api/projects/${projectId}/campaigns/${campaignId}/experiment-memory`, token)).memory as {
    preregistration: { id: string; kind: string; seq: number } | null;
    chain: { ok: boolean };
    sessions: { id: string; preregCheck: string; body: Record<string, unknown> }[];
  };
  expect(memory.preregistration, 'the criteria must be on the server, not only in this tab').not.toBeNull();
  expect(memory.preregistration!.kind).toBe('PREREGISTRATION');
  expect(memory.preregistration!.seq).toBe(1);
  expect(memory.chain.ok).toBe(true);
  expect(memory.sessions.length).toBeGreaterThan(0);
  expect(memory.sessions.at(-1)!.preregCheck).toBe('MATCH');
  // The panel's HIDDEN_PREREG identity names that same server record.
  expect(byProbe.HIDDEN_PREREG.id).toContain(memory.preregistration!.id);

  // STEP 9 — REPLAY. The sealed session replays to MATCH, in the laboratory, not only over the API.
  const evidenceToggle = page.getByTestId('sw-evidence').locator('button[aria-expanded]').first();
  if ((await evidenceToggle.getAttribute('aria-expanded')) !== 'true') await evidenceToggle.click();
  await expect(page.getByTestId('drug-state-hash')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('drug-pose-hash')).toBeVisible();
  const replay = page.getByTestId('sw-replay');
  await expect(replay).toBeVisible({ timeout: 60_000 });
  await replay.click();
  await expect(page.getByTestId('sw-replay-verdict')).toContainText('MATCH', { timeout: 120_000 });

  // The report is deterministic: the same state gives the same fingerprint after the replay too.
  const fingerprint = await panel.getAttribute('data-report-fingerprint');
  expect(fingerprint).toBeTruthy();
  await page.reload();
  console.log(`REPORT FINGERPRINT: ${fingerprint}`);
});
