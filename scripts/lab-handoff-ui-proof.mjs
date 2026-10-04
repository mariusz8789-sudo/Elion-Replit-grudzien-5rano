/**
 * Browser proof for the DELIVER screens: #/lab-handoff and #/reports, against `vite preview` of the
 * production build and the real backend (temporary database and ledger, real RDKit execution).
 *
 * Setup goes through the HTTP API (two accounts, one project, a ResearchRun whose plan comes from a
 * disposable local reasoning endpoint, two real RDKit experiments: one SUPPORTED, one FALSIFIED). Then, at
 * 375, 390, 430 and 1366 px, a person in the browser: sees the eligible and the refused experiment, has a
 * procedure-shaped request refused, prepares the request, saves and checks the UNSIGNED package, has a
 * tampered package rejected, enters a lab observation with a raw file (Genesis hashes it), is refused when
 * reviewing their own observation; a second person accepts it, compares model and measurement and proposes
 * evidence; Reports hands over the Evidence Pack and the lab package. No browser mocks, no state written
 * behind the API. The laboratory values typed in are TEST FIXTURES, not measurements of anything.
 *
 * Usage: npm run build --workspace=packages/frontend && node scripts/lab-handoff-ui-proof.mjs
 * Only the processes this script starts are stopped (by their own handles).
 */
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT = process.env.LAB_HANDOFF_UI_PROOF_OUT ?? path.join(tmpdir(), 'genesis-lab-handoff-ui-proof');
const VIEWPORTS = [
  { name: '375', width: 375, height: 812, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '430', width: 430, height: 932, mobile: true },
  { name: '1366', width: 1366, height: 900, mobile: false },
];
const executablePath = process.env.CHROMIUM_PATH
  ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium'].find(existsSync);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const UNIT = 'log10 (dimensionless)';

const hypothesis = (claim, prediction) => ({
  claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
  falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real descriptor execution.', parameters: { smiles: ASPIRIN, predictions: [prediction] }, parameterChanges: [] },
});
const PLAN = {
  subProblems: [{ question: 'Is aspirin small and moderately lipophilic?', whyItMatters: 'Lab handoff UI proof.' }],
  hypotheses: [
    hypothesis('Aspirin molecular weight is below 200 Da.', { observable: 'molWt', operator: '<', value: 200, critical: true }),
    hypothesis('Aspirin logP is above 3.', { observable: 'crippenLogP', operator: '>', value: 3, critical: true }),
  ],
  nextActions: ['Human review'],
};

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function startReasoningServer() {
  return createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return; }
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ model: 'lab-handoff-proof-model', choices: [{ message: { content: JSON.stringify(PLAN) } }] }));
    });
  });
}

function waitForLine(handle, label, match) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} did not start within 60 seconds.`)), 60_000);
    let buffer = '';
    let stderr = '';
    handle.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    handle.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`${label} exited before startup (code ${code}): ${stderr}`)); });
    handle.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const found = match(line);
        if (found) { clearTimeout(timeout); resolve(found); return; }
      }
    });
  });
}

async function startBackend({ databasePath, ledgerPath, reasoningBaseUrl }) {
  const handle = spawn(process.execPath, ['packages/backend/src/server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: '0', GENESIS_DB_PATH: databasePath, GENESIS_LEDGER_PATH: ledgerPath,
      GENESIS_REASONING_PROVIDER: 'local', GENESIS_REASONING_BASE_URL: reasoningBaseUrl, GENESIS_REASONING_MODEL: 'lab-handoff-proof-model', ANTHROPIC_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await waitForLine(handle, 'Genesis backend', (line) => {
    try { const entry = JSON.parse(line); return entry?.msg === 'started' && Number.isInteger(entry.port) ? entry.port : null; } catch { return null; }
  });
  // The browser reaches the backend through the preview proxy (127.0.0.1); the script's own setup calls use
  // ::1 when it answers, so the setup does not eat the per-address request budget the UI is measured under.
  const setupUrl = await fetch(`http://[::1]:${port}/api/health`).then(() => `http://[::1]:${port}`).catch(() => `http://127.0.0.1:${port}`);
  return { handle, baseUrl: `http://127.0.0.1:${port}`, setupUrl };
}

async function startPreview(apiBaseUrl) {
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const vite = path.join(path.dirname(createRequire(path.join(ROOT, 'packages/frontend/package.json')).resolve('vite/package.json')), 'bin/vite.js');
  const handle = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: path.join(ROOT, 'packages/frontend'),
    env: { ...process.env, GENESIS_API_PROXY: apiBaseUrl, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForLine(handle, 'vite preview', (line) => (line.includes(`:${port}`) ? true : null));
  return { handle, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopProcess(handle) {
  if (!handle || handle.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => { handle.kill('SIGKILL'); resolve(); }, 6000);
    handle.once('exit', () => { clearTimeout(timeout); resolve(); });
    handle.kill('SIGTERM');
  });
}

async function api(baseUrl, method, route, { token = null, body = null } = {}) {
  const response = await fetch(`${baseUrl}/api${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === null ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** One project with a run of two real RDKit experiments, set up through the API like any client would. */
async function setUp(backend, name) {
  const owner = await api(backend, 'POST', '/auth/register', { body: { email: `lab-owner-${name}-${Date.now()}@genesis.local`, password: 'password123' } });
  const reviewer = await api(backend, 'POST', '/auth/register', { body: { email: `lab-reviewer-${name}-${Date.now()}@genesis.local`, password: 'password123' } });
  const { project } = await api(backend, 'POST', '/projects', { token: owner.token, body: { name: `Lab handoff ${name}` } });
  await api(backend, 'POST', `/projects/${project.id}/members`, { token: owner.token, body: { email: reviewer.user.email, role: 'editor' } });
  const started = await api(backend, 'POST', `/projects/${project.id}/research-runs`, { token: owner.token, body: { question: `Is aspirin small and moderately lipophilic? (${name})` } });
  const runId = started.researchRun.researchRunId;
  await api(backend, 'POST', `/projects/${project.id}/research-runs/${runId}/proposals`, { token: owner.token });
  for (let i = 0; i < 2; i += 1) await api(backend, 'POST', `/projects/${project.id}/research-runs/${runId}/experiments`, { token: owner.token, body: {} });
  const { researchRun } = await api(backend, 'GET', `/projects/${project.id}/research-runs/${runId}`, { token: owner.token });
  const verdicts = researchRun.experiments.map((x) => x.falsification?.verdict).join(',');
  check(verdicts === 'SUPPORTED_WITHIN_PROTOCOL,FALSIFIED_WITHIN_PROTOCOL', `unexpected verdicts ${verdicts}`);
  check(researchRun.experiments.every((x) => x.next?.replay?.verdict === 'MATCH'), 'replay did not MATCH');
  return { owner, reviewer, project, runId, experiments: researchRun.experiments };
}

async function openAs(browser, viewport, session, project, url) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile, hasTouch: viewport.mobile, reducedMotion: 'reduce', acceptDownloads: true,
  });
  await context.addInitScript(({ storedSession, activeProject }) => {
    localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    localStorage.setItem('genesis-os:session/v1', JSON.stringify(storedSession));
    localStorage.setItem('genesis.active-research-project.v1', JSON.stringify(activeProject));
  }, { storedSession: { token: session.token, user: session.user }, activeProject: { id: project.id, name: project.name } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`console.error:${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  return { context, page, errors };
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function saveDownload(page, locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), locator.click()]);
  const file = await download.path();
  return { name: download.suggestedFilename(), text: readFileSync(file, 'utf8') };
}

async function pickRun(page, runId) {
  await page.getByTestId('lh-run').selectOption(runId);
  await page.getByTestId('lh-experiments').waitFor({ state: 'visible', timeout: 30_000 });
}

async function runViewport(browser, server, preview, viewport) {
  const s = await setUp(server.setupUrl, viewport.name);
  const [supported, falsified] = s.experiments;
  const modelLogP = supported.execution.output.crippenLogP;
  const result = { viewport: viewport.name, runId: s.runId, steps: [], errors: [] };
  const step = (name, detail = null) => result.steps.push(detail === null ? name : { name, ...detail });

  // ---- the owner: eligibility, refusal, request, package, verification, observation ----
  const owner = await openAs(browser, viewport, s.owner, s.project, `${preview}/#/lab-handoff`);
  const { page } = owner;
  await page.getByTestId('lh-honest').waitFor({ state: 'visible' });
  await pickRun(page, s.runId);
  const okRow = page.getByTestId(`lh-experiment-${supported.experimentId}`);
  const noRow = page.getByTestId(`lh-experiment-${falsified.experimentId}`);
  check(await okRow.getAttribute('data-eligible') === 'yes', 'SUPPORTED experiment not eligible');
  check(await noRow.getAttribute('data-eligible') === 'no', 'FALSIFIED experiment eligible');
  check(/SFALSYFIKOWAN|falsified/i.test(await noRow.getByTestId('lh-why').innerText()), 'no plain reason for the FALSIFIED experiment');
  step('eligibility');

  await okRow.getByTestId('lh-prepare-open').click();
  const form = page.getByTestId('lh-request-form');
  await form.getByTestId('lh-endpoint-id').fill('measured-logp');
  await form.getByTestId('lh-assay').fill('synthesis of the compound followed by its logP');
  await form.getByTestId('lh-output-key').selectOption('crippenLogP');
  await form.getByTestId('lh-unit').fill(UNIT);
  await form.getByTestId('lh-request-submit').click();
  check(await form.getByTestId('lh-request-missing').isVisible(), 'missing tolerance not flagged before sending');
  await form.getByTestId('lh-tol-abs').fill('0.5');
  await form.getByTestId('lh-request-submit').click();
  const refusal = form.getByTestId('lh-request-notice');
  await refusal.waitFor({ state: 'visible' });
  check(/syntez|synthesis/i.test(await refusal.innerText()), 'procedure-shaped request not refused plainly');
  step('procedure-refused');
  await form.getByTestId('lh-assay').fill('Octanol/water partition coefficient (logP), external laboratory measurement');
  await form.getByTestId('lh-lab-name').fill('fixture-lab');
  await form.getByTestId('lh-request-submit').click();
  const requestCard = page.getByTestId('lh-request');
  await requestCard.waitFor({ state: 'visible', timeout: 30_000 });
  const frozen = await requestCard.getByTestId('lh-frozen-value').innerText();
  check(frozen.startsWith(String(modelLogP)), `frozen model value ${frozen} != ${modelLogP}`);
  step('request-prepared', { frozenModelValue: modelLogP });

  await requestCard.getByTestId('lh-get-package').click();
  const saveLink = requestCard.getByTestId('lh-save-package');
  await saveLink.waitFor({ state: 'visible', timeout: 60_000 });
  const pkgFile = await saveDownload(page, saveLink);
  const pkg = JSON.parse(pkgFile.text);
  check(pkg.kind === 'GENESIS_RESEARCH_RUN_LAB_PACKAGE' && pkg.integrity.signature.status === 'UNSIGNED', 'package not an UNSIGNED Genesis lab package');
  const { technicalDetails, ...readable } = pkg;
  check(!/rdkit|crippen/i.test(JSON.stringify(readable)), 'engine name outside the package technical details');
  check(Array.isArray(technicalDetails.engines), 'package technical details missing');
  step('package-downloaded', { fileName: pkgFile.name, packageHash: pkg.packageHash, sha256: sha256(pkgFile.text) });

  await page.getByTestId('lh-verify-saved').click();
  const verified = page.getByTestId('lh-verify-notice');
  await verified.waitFor({ state: 'visible' });
  check((await verified.getAttribute('class')).includes('vf-tone-good'), 'saved package did not verify');
  const tampered = globalThis.structuredClone(pkg);
  tampered.technicalDetails.request.modelBinding.modelValue += 1;
  await page.getByTestId('lh-verify-file').setInputFiles({ name: 'tampered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
  await page.locator('[data-testid="lh-verify-notice"].vf-tone-bad').waitFor({ state: 'visible' });
  step('package-verified-and-tamper-rejected');

  const obsForm = page.getByTestId('lh-observation-form');
  await obsForm.getByTestId('lh-obs-value').fill('1.19');
  await obsForm.getByTestId('lh-obs-when').fill('2026-10-03T10:00');
  await obsForm.getByTestId('lh-obs-method').fill('FIXTURE-METHOD-1');
  await obsForm.getByTestId('lh-obs-ext-id').fill(`OBS-${viewport.name}`);
  await obsForm.getByTestId('lh-obs-uri').fill(`https://lab.example.test/results/OBS-${viewport.name}`);
  await obsForm.getByTestId('lh-obs-qc').selectOption('QC_PASSED');
  const raw = Buffer.from(`fixture raw file OBS-${viewport.name} 1.19\n`);
  await obsForm.getByTestId('lh-obs-file').setInputFiles({ name: 'raw-result.csv', mimeType: 'text/csv', buffer: raw });
  await obsForm.getByTestId('lh-obs-file-name').waitFor({ state: 'visible' });
  await obsForm.getByTestId('lh-obs-submit').click();
  const obsCard = page.getByTestId('lh-observation').first();
  await obsCard.waitFor({ state: 'visible', timeout: 30_000 });
  const hashed = await obsCard.getByTestId('lh-obs-sha').innerText();
  check(hashed === sha256(raw), `Genesis hash ${hashed} != local sha256 of the raw file`);
  step('observation-entered', { rawSha256: hashed });

  await obsCard.getByTestId('lh-you-entered').waitFor({ state: 'visible' });
  await obsCard.getByTestId('lh-review-verdict').selectOption('ACCEPTED_AS_OBSERVATION');
  await obsCard.getByTestId('lh-review-submit').click();
  const own = obsCard.getByTestId('lh-review-notice');
  await own.waitFor({ state: 'visible' });
  check(/ktoś inny|Someone else/i.test(await own.innerText()), 'self-review not refused plainly');
  step('self-review-refused');

  if (viewport.name === '1366') {
    // A second result whose quality control failed: nobody can accept it.
    await obsForm.getByTestId('lh-obs-value').fill('2.5');
    await obsForm.getByTestId('lh-obs-when').fill('2026-10-03T11:00');
    await obsForm.getByTestId('lh-obs-method').fill('FIXTURE-METHOD-1');
    await obsForm.getByTestId('lh-obs-ext-id').fill('OBS-QC');
    await obsForm.getByTestId('lh-obs-uri').fill('https://lab.example.test/results/OBS-QC');
    await obsForm.getByTestId('lh-obs-qc').selectOption('QC_FAILED');
    await obsForm.getByTestId('lh-obs-file').setInputFiles({ name: 'raw-qc.csv', mimeType: 'text/csv', buffer: Buffer.from('fixture qc failed\n') });
    await obsForm.getByTestId('lh-obs-submit').click();
    await page.getByTestId('lh-observation').nth(1).waitFor({ state: 'visible', timeout: 30_000 });
  }
  result.ownerOverflow = await overflow(page);
  await page.screenshot({ path: path.join(OUT, `lab-handoff-owner-${viewport.name}.png`), fullPage: true });
  result.errors.push(...owner.errors);
  await owner.context.close();

  // ---- a second person: review, compare, propose evidence ----
  const second = await openAs(browser, viewport, s.reviewer, s.project, `${preview}/#/lab-handoff`);
  const p2 = second.page;
  await pickRun(p2, s.runId);
  const card = p2.locator(`[data-testid="lh-observation"]`).first();
  await card.waitFor({ state: 'visible' });
  check(await card.getByTestId('lh-you-entered').count() === 0, 'reviewer shown as the person who entered the result');
  await card.getByTestId('lh-review-verdict').selectOption('ACCEPTED_AS_OBSERVATION');
  await card.getByTestId('lh-review-note').fill('Raw file hash checked.');
  await card.getByTestId('lh-review-submit').click();
  await card.getByTestId('lh-compare').waitFor({ state: 'visible', timeout: 30_000 });
  step('reviewed-by-another-person');
  await card.getByTestId('lh-compare').click();
  const cmp = card.getByTestId('lh-comparison');
  await cmp.waitFor({ state: 'visible', timeout: 30_000 });
  const verdict = await cmp.getAttribute('data-verdict');
  check(verdict === (Math.abs(1.19 - modelLogP) <= 0.5 ? 'AGREES_WITHIN_TOLERANCE' : 'DISAGREES_OUTSIDE_TOLERANCE'), `comparison verdict ${verdict} does not follow the frozen tolerance`);
  check((await cmp.getByTestId('lh-cmp-model').innerText()).startsWith(String(modelLogP)), 'model value in comparison differs from the frozen one');
  check((await cmp.getByTestId('lh-cmp-measured').innerText()).startsWith('1.19'), 'measured value differs');
  step('compared', { verdict, model: modelLogP, measured: 1.19 });
  await card.getByTestId('lh-propose').click();
  await card.getByTestId('lh-evidence-proposed').waitFor({ state: 'visible', timeout: 30_000 });
  step('evidence-proposed');
  if (viewport.name === '1366') {
    const qcCard = p2.locator('[data-testid="lh-observation"]').nth(1);
    await qcCard.getByTestId('lh-qc-failed').waitFor({ state: 'visible' });
    check(await qcCard.locator('[data-testid="lh-review-verdict"] option[value="ACCEPTED_AS_OBSERVATION"]').evaluate((el) => el.disabled), 'QC_FAILED result can be accepted in the UI');
    const direct = await fetch(`${server.setupUrl}/api/projects/${s.project.id}/research-runs/${s.runId}/lab/observations/${await qcCard.getAttribute('data-observation-id')}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.reviewer.token}` }, body: JSON.stringify({ verdict: 'ACCEPTED_AS_OBSERVATION' }),
    }).then((r) => r.json());
    check(direct.error === 'QC_FAILED_CANNOT_BE_ACCEPTED', `server accepted a QC_FAILED result: ${JSON.stringify(direct)}`);
    step('qc-failed-cannot-be-accepted');
  }
  result.reviewerOverflow = await overflow(p2);
  await p2.screenshot({ path: path.join(OUT, `lab-handoff-reviewer-${viewport.name}.png`), fullPage: true });

  // ---- Reports: the deliverables that exist ----
  await p2.goto(`${preview}/#/reports`, { waitUntil: 'networkidle' });
  const runCard = p2.locator(`[data-testid="rp-run"][data-run-id="${s.runId}"]`);
  await runCard.getByTestId('rp-item-evidence-pack').waitFor({ state: 'visible', timeout: 30_000 });
  const packItem = runCard.getByTestId('rp-item-evidence-pack');
  await packItem.getByTestId('rp-act').click();
  const packFile = await saveDownload(p2, packItem.getByTestId('rp-save'));
  check(JSON.parse(packFile.text).researchRunId === s.runId, 'Evidence Pack is for another run');
  const labItem = runCard.getByTestId('rp-item-lab-package');
  await labItem.getByTestId('rp-act').click();
  const labFile = await saveDownload(p2, labItem.getByTestId('rp-save'));
  // The package embeds the run's current Evidence Pack, so its hash moves as lab events are appended; the request it carries does not.
  const labPkg = JSON.parse(labFile.text);
  check(labPkg.requestId === pkg.requestId && labPkg.requestFingerprint === pkg.requestFingerprint, 'Reports lab package is for another request');
  const deliveryItem = runCard.getByTestId('rp-item-customer-delivery');
  await deliveryItem.getByTestId('rp-act').click();
  const delivery = deliveryItem.getByTestId('rp-delivery').or(deliveryItem.getByTestId('rp-item-error'));
  await delivery.first().waitFor({ state: 'visible', timeout: 30_000 });
  step('reports-downloaded', { evidencePack: packFile.name, labPackage: labFile.name, customerDelivery: await deliveryItem.getByTestId('rp-delivery').getAttribute('data-status').catch(() => 'refused') });
  result.reportsOverflow = await overflow(p2);
  await p2.screenshot({ path: path.join(OUT, `reports-${viewport.name}.png`), fullPage: true });
  result.errors.push(...second.errors);
  await second.context.close();

  for (const key of ['ownerOverflow', 'reviewerOverflow', 'reportsOverflow']) if (result[key] > 1) result.errors.push(`horizontal-overflow:${key}:${result[key]}`);
  result.status = result.errors.length ? 'FAIL' : 'PASS';
  return result;
}

mkdirSync(OUT, { recursive: true });
const temp = mkdtempSync(path.join(tmpdir(), 'genesis-lab-handoff-ui-'));
const report = { schemaVersion: 'genesis.lab-handoff-ui-proof@1', testedCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), testedAt: new Date().toISOString(), cases: [], failures: [] };
let backend = null;
let preview = null;
let browser = null;
const reasoning = startReasoningServer();
try {
  const reasoningPort = await listen(reasoning);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  report.browser = browser.version();
  report.pids = [];
  for (const viewport of VIEWPORTS) {
    // A fresh backend (own temporary database and ledger) and preview per viewport: no state or request budget is shared.
    const dir = path.join(temp, viewport.name);
    mkdirSync(dir, { recursive: true });
    try {
      backend = await startBackend({ databasePath: path.join(dir, 'genesis.db'), ledgerPath: path.join(dir, 'evidence-ledger.json'), reasoningBaseUrl: `http://127.0.0.1:${reasoningPort}/v1` });
      preview = await startPreview(backend.baseUrl);
      report.pids.push({ viewport: viewport.name, backend: backend.handle.pid, preview: preview.handle.pid });
      const r = await runViewport(browser, backend, preview.baseUrl, viewport);
      report.cases.push(r);
      report.failures.push(...r.errors.map((e) => `${viewport.name}:${e}`));
    } catch (error) {
      report.cases.push({ viewport: viewport.name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) });
      report.failures.push(`${viewport.name}:${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    } finally {
      await stopProcess(preview?.handle);
      await stopProcess(backend?.handle);
      preview = null; backend = null;
    }
  }
} catch (error) {
  report.failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  report.status = report.failures.length ? 'FAIL' : 'PASS';
  writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  await stopProcess(preview?.handle);
  await stopProcess(backend?.handle);
  await new Promise((resolve) => reasoning.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: report.status, cases: report.cases.map((c) => ({ viewport: c.viewport, status: c.status, steps: c.steps?.length ?? 0, error: c.error })), failures: report.failures, output: OUT }, null, 2));
if (report.failures.length) process.exitCode = 1;
