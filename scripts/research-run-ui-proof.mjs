/**
 * Authenticated, populated UI proof for the canonical Science Chat ResearchRun.
 *
 * Starts a disposable local reasoning endpoint and the real production backend,
 * registers an owner/project through HTTP, loads the production frontend, then
 * drives /badanie -> /eksperyment -> /powtórz at desktop and mobile widths.
 * Scientific execution remains the backend's real RDKit path. No browser mocks,
 * direct state writes, fake engine output or second ResearchRun are used.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { chromium } from 'playwright';

const OUT = process.env.RESEARCH_RUN_UI_PROOF_OUT ?? 'artifacts/research-run-ui-proof';
const STATIC_DIR = path.resolve('packages/frontend/dist');
const VIEWPORTS = [
  { mode: 'desktop', width: 1440, height: 900 },
  { mode: 'mobile', width: 390, height: 844 },
];
const executablePath = process.env.CHROMIUM_PATH
  ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';

const PLAN = {
  subProblems: [{ question: 'Can the bounded descriptor claim survive its null challenge?', whyItMatters: 'It tests a preregistered alternative.' }],
  hypotheses: [
    {
      claim: 'Aspirin has molecular weight below 200 Da.', claimType: 'PREDICTION',
      assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
      uncertainty: { level: 'LOW', statement: 'Bounded descriptor test only.' },
      falsificationProposal: 'RDKit molecular weight is at least 200 Da.',
      challengesHypothesisIndex: null,
      experimentProposal: {
        kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'RDKit molecular descriptors', parameterChanges: [],
        parameters: { smiles: ASPIRIN, predictions: [{ observable: 'molWt', operator: '<', value: 200, critical: true }] },
      },
    },
    {
      claim: 'Null challenge: aspirin has molecular weight at least 200 Da.', claimType: 'PREDICTION',
      assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
      uncertainty: { level: 'LOW', statement: 'Bounded null challenge only.' },
      falsificationProposal: 'RDKit molecular weight is below 200 Da.',
      challengesHypothesisIndex: 0,
      experimentProposal: {
        kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'RDKit null challenge', parameterChanges: [],
        parameters: { smiles: ASPIRIN, predictions: [{ observable: 'molWt', operator: '>=', value: 200, critical: true }] },
      },
    },
  ],
  nextActions: ['Require human review after the bounded challenge.'],
};

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function startReasoningServer() {
  return createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ model: 'genesis-ui-proof-model', choices: [{ message: { content: JSON.stringify(PLAN) } }] }));
    });
  });
}

function startGenesis({ databasePath, ledgerPath, reasoningBaseUrl }) {
  const processHandle = spawn(process.execPath, ['packages/backend/src/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: '0',
      GENESIS_DB_PATH: databasePath,
      GENESIS_LEDGER_PATH: ledgerPath,
      GENESIS_STATIC_DIR: STATIC_DIR,
      GENESIS_REASONING_PROVIDER: 'local',
      GENESIS_REASONING_BASE_URL: reasoningBaseUrl,
      GENESIS_REASONING_MODEL: 'genesis-ui-proof-model',
      ANTHROPIC_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Genesis backend did not start within 60 seconds.')), 60_000);
    let buffer = '';
    let stderr = '';
    processHandle.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    processHandle.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Genesis backend exited before startup (code ${code}): ${stderr}`));
    });
    processHandle.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        if (entry?.msg === 'started' && Number.isInteger(entry.port)) {
          clearTimeout(timeout);
          resolve({ processHandle, baseUrl: `http://127.0.0.1:${entry.port}` });
          return;
        }
      }
    });
  });
  return ready;
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => { processHandle.kill('SIGKILL'); resolve(); }, 6000);
    processHandle.once('exit', () => { clearTimeout(timeout); resolve(); });
    processHandle.kill('SIGTERM');
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

async function send(page, text, expectedText) {
  const input = page.getByRole('textbox', { name: 'Wiadomość do Science Chat' });
  await input.fill(text);
  await page.getByRole('button', { name: 'Wyślij' }).click();
  await page.locator('.sc-genesis .sc-text').filter({ hasText: expectedText }).last().waitFor({ state: 'visible', timeout: 90_000 });
}

mkdirSync(OUT, { recursive: true });
const temp = mkdtempSync(path.join(tmpdir(), 'genesis-research-run-ui-'));
const testedCommit = (await import('node:child_process')).execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const report = {
  schemaVersion: 'genesis.research-run-ui-proof@1',
  testedCommit,
  testedAt: new Date().toISOString(),
  viewports: VIEWPORTS,
  cases: [],
  failures: [],
};
let backend = null;
let browser = null;
const reasoning = startReasoningServer();

try {
  const reasoningPort = await listen(reasoning);
  backend = await startGenesis({
    databasePath: path.join(temp, 'genesis.db'),
    ledgerPath: path.join(temp, 'evidence-ledger.json'),
    reasoningBaseUrl: `http://127.0.0.1:${reasoningPort}/v1`,
  });
  report.baseUrl = backend.baseUrl;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  report.browser = browser.version();

  for (const viewport of VIEWPORTS) {
    const suffix = `${viewport.mode}-${Date.now()}`;
    const session = await api(backend.baseUrl, 'POST', '/auth/register', { body: { email: `ui-proof-${suffix}@genesis.local`, password: 'password123' } });
    const created = await api(backend.baseUrl, 'POST', '/projects', { token: session.token, body: { name: `UI proof ${viewport.mode}` } });
    const project = created.project;
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mode === 'mobile',
      hasTouch: viewport.mode === 'mobile',
      reducedMotion: 'reduce',
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
    await page.goto(`${backend.baseUrl}/#/`, { waitUntil: 'networkidle', timeout: 60_000 });
    const openButton = page.getByRole('button', { name: 'Otwórz Science Chat' });
    if (await openButton.isVisible().catch(() => false)) await openButton.click();
    else await page.evaluate(() => window.dispatchEvent(new window.CustomEvent('genesis:open-science-chat')));
    await page.getByTestId('science-chat-drawer').or(page.getByTestId('science-chat-inline')).waitFor({ state: 'visible' });

    await send(page, `/badanie Czy aspiryna spełnia ograniczony test masy cząsteczkowej? ${viewport.mode}`, 'PODTRZYMANA w tym protokole');
    await page.locator('.sc-genesis .sc-text').filter({ hasText: 'Evidence: PROPOZYCJA' }).last().waitFor({ state: 'attached' });
    await page.locator('.sc-genesis .sc-text').filter({ hasText: 'Powtórzenie: ZGODNE' }).last().waitFor({ state: 'attached' });
    await send(page, '/eksperyment', 'OBALONA w tym protokole');
    await send(page, '/powtórz', 'Wszystkie powtórzenia tego eksperymentu: MATCH, MATCH');

    const runs = await api(backend.baseUrl, 'GET', `/projects/${project.id}/research-runs`, { token: session.token });
    if (runs.researchRuns.length !== 1) throw new Error(`${viewport.mode}: expected exactly one ResearchRun, got ${runs.researchRuns.length}`);
    const run = await api(backend.baseUrl, 'GET', `/projects/${project.id}/research-runs/${runs.researchRuns[0].researchRunId}`, { token: session.token });
    const researchRun = run.researchRun;
    if (researchRun.experiments.length !== 2 || researchRun.researchState.chain.ok !== true) {
      throw new Error(`${viewport.mode}: canonical ResearchRun state is incomplete.`);
    }
    const verdicts = researchRun.experiments.map((experiment) => experiment.falsification?.verdict);
    const replays = researchRun.experiments.map((experiment) => experiment.next?.replay?.verdict);
    if (verdicts.join(',') !== 'SUPPORTED_WITHIN_PROTOCOL,FALSIFIED_WITHIN_PROTOCOL' || replays.join(',') !== 'MATCH,MATCH') {
      throw new Error(`${viewport.mode}: unexpected verdict/replay sequence ${verdicts} / ${replays}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) errors.push(`horizontal-overflow:${overflow}`);
    const screenshotPath = path.join(OUT, `${viewport.mode}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const screenshotHash = sha256(readFileSync(screenshotPath));
    report.cases.push({
      viewport: viewport.mode,
      status: errors.length ? 'FAIL' : 'PASS',
      researchRunId: researchRun.researchRunId,
      eventCount: researchRun.researchState.events.length,
      experimentCount: researchRun.experiments.length,
      verdicts,
      replays,
      chainVerified: researchRun.researchState.chain.ok,
      decisionReasons: researchRun.experiments.map((experiment) => experiment.next?.proposal?.reason ?? null),
      screenshotSha256: screenshotHash,
      errors,
    });
    report.failures.push(...errors.map((error) => `${viewport.mode}:${error}`));
    await context.close();
  }
} catch (error) {
  report.failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  report.status = report.failures.length ? 'FAIL' : 'PASS';
  writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(OUT, 'report.sha256'), `${sha256(readFileSync(path.join(OUT, 'report.json')))}  report.json\n`);
  await browser?.close().catch(() => {});
  await stopProcess(backend?.processHandle);
  await new Promise((resolve) => reasoning.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: report.status, testedCommit, cases: report.cases.length, failures: report.failures, output: OUT }, null, 2));
if (report.failures.length) process.exitCode = 1;
