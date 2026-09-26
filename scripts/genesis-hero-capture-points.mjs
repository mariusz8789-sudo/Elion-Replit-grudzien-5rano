#!/usr/bin/env node
/* global setTimeout */
/**
 * GENESIS — HERO CAPTURE POINTS (technical harness, not a film).
 *
 * Drives the canonical live drug-bench run and captures a still at each moment worth showing, then
 * writes a manifest saying what was on screen and what the record held at that instant. It produces
 * no cut, no music, no narration and no deck: those are downstream decisions this only feeds.
 *
 * The capture points are NOT invented for the camera. Each one waits on a selector or attribute the
 * live acceptance test (packages/e2e/src/liveDrugBench.e2e.spec.ts) already proves stable against a
 * real backend, so a still can never be taken of a state the record does not hold. Nothing here
 * writes app state, and a point that never becomes true is reported MISSED rather than faked.
 *
 * Requires the production server with the real engines:
 *   npm run build && npm start        (see scripts/genesis-engine-venvs.sh)
 *
 * Usage:
 *   node scripts/genesis-hero-capture-points.mjs [--base URL] [--out DIR] [--camera VISOR|SPECTATOR]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';

function parseArgs(argv) {
  const a = { base: process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080', out: path.join(REPO, 'artifacts', 'hero-capture'), camera: 'VISOR' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') a.base = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--camera') a.camera = argv[++i];
  }
  return a;
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * THE POINTS, in the order the run reaches them. `ready` is what must be true on screen before the
 * still is worth taking; `reads` are the attributes recorded alongside it, so the manifest says what
 * the scene was showing rather than what we hoped it was showing.
 */
const POINTS = [
  {
    id: '01-arrival', title: 'Laboratorium otwiera się jako świat, nie pulpit',
    ready: async (p) => (await p.getByTestId('scientific-worlds').getAttribute('data-details')) === 'closed',
    reads: [], settleMs: 1200,
  },
  {
    id: '02-preregistration', title: 'Zamrożone kryteria na ekranie, ZANIM silniki policzą',
    ready: async (p) => p.getByTestId('drug-prereg').isVisible().catch(() => false),
    reads: [], settleMs: 400,
  },
  {
    id: '03-candidates-live', title: 'Kandydaci LIVE z wynikami i powodami odrzuceń',
    ready: async (p) => {
      const el = p.getByTestId('drug-candidate-list');
      return (await el.isVisible().catch(() => false)) && (await el.innerText().catch(() => '')).length > 40;
    },
    reads: [['drug-bench-live', 'data-stage'], ['drug-bench-live', 'data-phase']], settleMs: 400,
  },
  {
    id: '04-hands-carry', title: 'Próbka NIESIONA w dłoni — nie teleportowana',
    // The fix in drugBenchLayer guarantees the transfer's sub-steps are rendered; this waits for the
    // scene's own record of them rather than for a lucky frame.
    ready: async (p) => {
      const seen = (await p.getByTestId('drug-bench-live').getAttribute('data-hand-seen').catch(() => '')) ?? '';
      return seen.includes('CARRY');
    },
    reads: [['drug-bench-live', 'data-hand-action'], ['drug-bench-live', 'data-hand-sample'], ['drug-bench-live', 'data-hand-grip-mm']], settleMs: 0,
  },
  {
    id: '05-hands-place', title: 'Fiolka wkładana do aparatu',
    ready: async (p) => {
      const seen = (await p.getByTestId('drug-bench-live').getAttribute('data-hand-seen').catch(() => '')) ?? '';
      return seen.includes('PLACE');
    },
    reads: [['drug-bench-live', 'data-hand-instrument'], ['drug-bench-live', 'data-hand-seen']], settleMs: 0,
  },
  {
    id: '06-finalist', title: 'Finalista ze ZMIERZONYM wynikiem dokowania',
    ready: async (p) => (await p.getByTestId('drug-bench-live').innerText().catch(() => '')).includes('finaliści'),
    reads: [['drug-bench-live', 'data-stage']], settleMs: 600,
  },
  {
    id: '07-evidence', title: 'Evidence — łańcuch, hashe, replay',
    ready: async (p) => p.getByTestId('sw-evidence').isVisible().catch(() => false),
    reads: [], settleMs: 400,
  },
  {
    id: '08-engine-replay', title: 'Engine Replay — silnik przelicza ponownie, werdykt MATCH',
    // Replay is an ACT, not a state that arrives on its own: the scientist asks for it, the backend
    // re-executes the persisted docking run and compares the hashes. The protocol is assembled from
    // the record only once that has happened, which is why nothing below appears until this is done.
    act: async (p) => {
      const button = p.getByTestId('sw-replay');
      await button.waitFor({ state: 'visible', timeout: 120_000 });
      await button.click({ timeout: 15_000 }).catch(async () => { await button.dispatchEvent('click').catch(() => {}); });
    },
    ready: async (p) => ((await p.getByTestId('sw-replay-verdict').innerText().catch(() => '')) ?? '').includes('MATCH'),
    reads: [], settleMs: 500,
  },
  {
    id: '09-protocol', title: 'Protokół końcowy A/B/C',
    ready: async (p) => p.getByTestId('drug-protocol').isVisible().catch(() => false),
    reads: [['drug-protocol', 'data-protocol-fingerprint'], ['drug-protocol', 'data-protocol-sections']], settleMs: 600,
  },
  {
    id: '10-section-b-honest', title: 'Sekcja B nazywa swój stan: NOT_ATTEMPTED albo BLOCKED_BY_RUNTIME — nigdy wymyślona trasa',
    // Becomes 'ROUTE_PROVIDED' once the models are present; the point is that the screen states which.
    ready: async (p) => p.getByTestId('drug-protocol-synthesis').isVisible().catch(() => false),
    reads: [['drug-protocol-synthesis', 'data-synthesis-status'], ['drug-protocol-synthesis', 'data-route-provided'], ['drug-protocol-synthesis', 'data-missing-model-files']], settleMs: 300,
  },
];

async function api(base, p, token, body) {
  const r = await fetch(`${base}${p}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return r.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });

  const reg = await api(args.base, '/api/auth/register', null, { email: `capture-${Date.now()}@lab.org`, password: 'password123' });
  const token = reg.token;
  const project = await api(args.base, '/api/projects', token, { name: 'HERO capture' });
  const projectId = project.project.id;
  const campaign = await api(args.base, `/api/projects/${projectId}/campaigns`, token, {
    objective: `HERO capture ${Date.now()}`, domain: 'DRUG_DISCOVERY', startingSmiles: [IMATINIB],
    budget: { maxGenerations: 2, maxGeneratedCandidates: 6 },
  });
  const campaignId = campaign.campaign.id;

  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH ?? undefined });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(({ t, u }) => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    window.localStorage.setItem('genesis-os:session/v1', JSON.stringify({ token: t, user: u }));
  }, { t: token, u: reg.user });
  await page.goto(`${args.base}/#/scientific-worlds?station=st-drug-bench&project=${projectId}&campaign=${campaignId}`);

  const captured = [];
  const deadline = Date.now() + 35 * 60 * 1000;
  let detailsOpened = false;

  for (const point of POINTS) {
    // Point 1 is the only one that wants the panels still closed. Open them ONCE, before the first
    // point that needs them, never inside the polling loop: the lab renders a live WebGL canvas, and
    // clicking while a frame is in flight made the click hang instead of landing.
    if (!detailsOpened && point.id !== '01-arrival') {
      const details = page.getByTestId('sw-details');
      await details.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {});
      if ((await details.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
        await details.click({ timeout: 15_000 }).catch(async () => {
          // A click the renderer swallowed is not a reason to lose the whole run.
          await details.dispatchEvent('click').catch(() => {});
        });
      }
      detailsOpened = true;
      // The camera badge is read at every point so a still can be matched to the camera that took it.
      if (args.camera === 'SPECTATOR') await page.getByTestId('sw-camera').click({ timeout: 15_000 }).catch(() => {});
    }
    // A point may need the scientist to DO something first; the harness performs it, then waits for
    // the state it produces exactly like any other point.
    if (point.act) await point.act(page).catch((err) => process.stderr.write(`[act failed] ${point.id}: ${String(err?.message ?? err).slice(0, 160)}\n`));
    let ready = false;
    while (Date.now() < deadline) {
      if (await point.ready(page).catch(() => false)) { ready = true; break; }
      await sleep(500);
    }
    if (!ready) { captured.push({ ...pointMeta(point), status: 'MISSED', reason: 'the run never reached this state within the window' }); continue; }
    if (point.settleMs) await sleep(point.settleMs);
    const file = path.join(args.out, `${point.id}.png`);
    // The lab's render loop keeps the main thread busy while the engines compute, and a still can
    // simply not come back in time. One lost frame is not a reason to lose the run: try again, then
    // record the miss and carry on to the next point.
    let shot = false;
    for (const attempt of [0, 1]) {
      try { await page.screenshot({ path: file, timeout: 90_000 }); shot = true; break; }
      catch { if (attempt === 0) await sleep(2000); }
    }
    if (!shot) { captured.push({ ...pointMeta(point), status: 'CAPTURE_FAILED', reason: 'the state was reached but no frame came back in time' }); continue; }
    const reads = {};
    for (const [testId, attr] of point.reads) reads[`${testId}@${attr}`] = await page.getByTestId(testId).getAttribute(attr).catch(() => null);
    reads['camera'] = await page.getByTestId('sw-camera-badge').innerText().catch(() => null);
    captured.push({ ...pointMeta(point), status: 'CAPTURED', file: path.relative(REPO, file), reads });
    process.stderr.write(`[captured] ${point.id} — ${point.title}\n`);
  }

  await browser.close();
  const manifest = {
    kind: 'GENESIS_HERO_CAPTURE_POINTS', contractVersion: 1,
    base: args.base, projectId, campaignId, camera: args.camera,
    capturedAt: new Date().toISOString(),
    points: captured,
    note: 'Technical capture points only. Every still was taken after the scene reported the state it shows; a point that never became true is MISSED, never staged.',
  };
  writeFileSync(path.join(args.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const incomplete = captured.filter((c) => c.status !== 'CAPTURED');
  process.stderr.write(`\n${captured.length - incomplete.length}/${captured.length} captured -> ${args.out}\n`);
  for (const c of incomplete) process.stderr.write(`  ${c.status}: ${c.id} — ${c.reason}\n`);
  process.exit(incomplete.length ? 1 : 0);
}

function pointMeta(point) { return { id: point.id, title: point.title }; }

main().catch((err) => { process.stderr.write(`${String(err?.stack ?? err)}\n`); process.exit(1); });
