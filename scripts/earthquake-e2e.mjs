/**
 * Genesis Earthquake Vertical Slice — dowód E2E w prawdziwej przeglądarce.
 *
 * Ten moduł nie ma UI i nie powinien go mieć w tej fazie (City3D dostaje
 * tylko gotowy, read-only kontrakt projekcji — patrz
 * earthquakeWorldProjection.ts) — więc E2E ładuje moduł bezpośrednio do
 * Chromium, bez ekranu, tym samym wzorcem co scripts/discovery-e2e.mjs.
 * Sprawdza dwie rzeczy naraz: że cały pipeline SourceArtifact -> HazardInput
 * -> HazardRun -> Exposure -> Impact -> Evidence -> Replay działa naprawdę w
 * przeglądarce (Web Crypto SHA-256 via crypto.subtle, nie tylko w Node), i
 * że wynik jest BAJT-IDENTYCZNY między Node a Chromium — najmocniejszy
 * dostępny dowód determinizmu.
 *
 * Portability (independent-audit remediation): `playwright` is a declared
 * devDependency (see package.json), resolved via normal module resolution —
 * not a hard-coded absolute path into one sandbox's global npm install. The
 * Chromium executable is resolved in this order: an explicit
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE` env var override; Playwright's own
 * `chromium.executablePath()` if that file actually exists (correct for
 * whatever revision this installed playwright version expects); this
 * project's environment's stable, revision-independent
 * `$PLAYWRIGHT_BROWSERS_PATH/chromium` symlink if present; otherwise no
 * override at all, letting Playwright's own launch fail with its own
 * actionable "run `npx playwright install`" message instead of a silent
 * wrong-path crash.
 *
 * Użycie: node scripts/earthquake-e2e.mjs
 * Kod wyjścia 0 = wszystkie sprawdzenia przeszły; 2 = wykryto niezgodność.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

function resolveChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch { /* fall through to other strategies */ }
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsersPath) {
    const stableSymlink = join(browsersPath, 'chromium');
    if (existsSync(stableSymlink)) return stableSymlink;
  }
  return undefined; // let Playwright's own launch produce its actionable install error
}
const CHROME = resolveChromiumExecutable();
const ROOT = new URL('..', import.meta.url).pathname;

const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
    failures.push(name);
  }
};

const work = mkdtempSync(join(tmpdir(), 'genesis-eq-'));

const scenario = `
export default async function scenario(h) {
  const spec = {
    scenarioLabel: 'SYNTHETIC-EQ-E2E-001',
    magnitude: 6.4,
    depthKm: 14,
    epicenter: { x: 0, y: 0 },
    seed: 9001,
  };
  const commitHash = 'e2e-test-commit';

  const result = await h.runEarthquakeScenario(spec, commitHash);

  // MATCH: fully persisted, unmodified.
  const matchStore = new h.InMemoryHazardProvenanceStore();
  await matchStore.putArtifact(result.artifact);
  await matchStore.putInput(result.input);
  await matchStore.putRun(result.run);
  const matchReplay = await h.replayHazardRun({ store: matchStore, hazardRunId: result.run.hazardRunId, evaluator: h.earthquakeEvaluator });

  // DRIFT: a tampered run fingerprint, never the true one, persisted directly.
  const driftStore = new h.InMemoryHazardProvenanceStore();
  await driftStore.putArtifact(result.artifact);
  await driftStore.putInput(result.input);
  await driftStore.putRun({ ...result.run, resultFingerprint: 'deliberately-wrong-fingerprint' });
  const driftReplay = await h.replayHazardRun({ store: driftStore, hazardRunId: result.run.hazardRunId, evaluator: h.earthquakeEvaluator });

  // BLOCKED: artifact never persisted.
  const blockedStore = new h.InMemoryHazardProvenanceStore();
  await blockedStore.putInput(result.input);
  await blockedStore.putRun(result.run);
  const blockedReplay = await h.replayHazardRun({ store: blockedStore, hazardRunId: result.run.hazardRunId, evaluator: h.earthquakeEvaluator });

  // NOT_REPRODUCIBLE: run id never saved anywhere.
  const emptyStore = new h.InMemoryHazardProvenanceStore();
  const notReproducibleReplay = await h.replayHazardRun({ store: emptyStore, hazardRunId: 'never-saved', evaluator: h.earthquakeEvaluator });

  const evidencePack = await h.buildHazardEvidencePack(result);
  // Same fixed result, hashed twice: proves the digest function itself is
  // deterministic given fixed input (result.run.createdAt /
  // artifact.provenance.retrievedAt are real wall-clock provenance fields
  // frozen at scenario-build time, so two independently-run scenarios are
  // legitimately different records with different digests — that is not
  // what this checks).
  const evidencePackAgain = await h.buildHazardEvidencePack(result);
  const projection = h.projectEarthquakeWorldState(result);

  const admission = {
    artifact: h.checkSourceArtifactAdmission(result.artifact),
    input: h.checkHazardInputAdmission(result.input),
    run: h.checkHazardRunAdmission(result.run),
  };

  return {
    artifactContentHash: result.artifact.contentHash,
    inputFingerprint: result.input.inputFingerprint,
    resultFingerprint: result.run.resultFingerprint,
    outputFields: result.run.outputFields,
    exposureSiteCount: result.exposure.sites.length,
    exposureDatasetStatus: result.exposure.datasetStatus,
    impactCount: result.impacts.length,
    impactSeverities: result.impacts.map((i) => [i.siteId, i.severity, i.severityValue]),
    impactDatasetStatuses: [...new Set(result.impacts.map((i) => i.datasetStatus))],
    matchStatus: matchReplay.status,
    driftStatus: driftReplay.status,
    blockedStatus: blockedReplay.status,
    notReproducibleStatus: notReproducibleReplay.status,
    evidenceMissingFields: evidencePack.missingFields,
    evidenceSha256: evidencePack.sha256,
    evidenceSha256Repeated: evidencePackAgain.sha256,
    evidenceHazardType: evidencePack.hazardType,
    projectionSchemaVersion: projection.schemaVersion,
    projectionSiteCount: projection.sites.length,
    projectionNotModeledCount: projection.notModeled.length,
    admissionAllPassed: admission.artifact.admitted && admission.input.admitted && admission.run.admitted,
  };
}
`;
writeFileSync(join(work, 'scenario-browser.js'), scenario.replace('export default async function scenario', 'window.__scenario = async function scenario'));

// --- Wartości odniesienia policzone w Node z TEGO SAMEGO kodu źródłowego ---
const nodeEntry = join(work, 'node-entry.ts');
writeFileSync(join(work, 'scenario.ts'), scenario);
writeFileSync(nodeEntry, `
import * as h from '${join(ROOT, 'packages/frontend/src/core/hazard/index.ts')}';
import scenario from '${join(work, 'scenario.ts')}';
scenario(h).then((r) => console.log('__RESULT__' + JSON.stringify(r)));
`);
const nodeBundle = join(work, 'node.mjs');
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  nodeEntry, '--bundle', '--format=esm', '--platform=node', '--target=node22', `--outfile=${nodeBundle}`,
], { stdio: 'inherit' });
const nodeOut = execFileSync('node', [nodeBundle], { cwd: ROOT, encoding: 'utf8' });
const expected = JSON.parse(nodeOut.split('__RESULT__')[1].trim());

// --- Ten sam kod w Chromium ---
const browserEntry = join(work, 'browser-entry.ts');
writeFileSync(browserEntry, `
import * as h from '${join(ROOT, 'packages/frontend/src/core/hazard/index.ts')}';
globalThis.__genesisHazard = h;
`);
const browserBundle = join(work, 'hazard.bundle.js');
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  browserEntry, '--bundle', '--format=iife', '--platform=browser', '--target=es2020', `--outfile=${browserBundle}`,
], { stdio: 'inherit' });

// crypto.subtle (Web Crypto) requires a secure context — an opaque about:blank
// page via setContent() does NOT expose it in Chromium, but http://127.0.0.1
// does (loopback is treated as secure). Serve the two bundles over a real
// local HTTP server so this E2E genuinely exercises crypto.subtle, exactly
// as the deployed app does.
const html = '<!doctype html><title>Genesis Earthquake E2E</title><body>'
  + `<script src="/hazard.bundle.js"></script>`
  + `<script src="/scenario-browser.js"></script>`;
const files = {
  '/index.html': { body: html, type: 'text/html' },
  '/hazard.bundle.js': { body: readFileSync(browserBundle, 'utf8'), type: 'text/javascript' },
  '/scenario-browser.js': { body: readFileSync(join(work, 'scenario-browser.js'), 'utf8'), type: 'text/javascript' },
};
const server = createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = files[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.type });
  res.end(file.body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
const actual = await page.evaluate(() => window.__scenario(window.__genesisHazard));
await browser.close();
server.close();

console.log('\nGenesis Earthquake Vertical Slice — E2E w Chromium\n');
check('brak błędów runtime w przeglądarce', pageErrors.length === 0, pageErrors.join(' | '));
check('SourceArtifact.contentHash to prawdziwy SHA-256 (Web Crypto w przeglądarce)', /^[0-9a-f]{64}$/.test(actual.artifactContentHash), actual.artifactContentHash);
check('HazardInput.inputFingerprint to prawdziwy SHA-256', /^[0-9a-f]{64}$/.test(actual.inputFingerprint), actual.inputFingerprint);
check('HazardRun.resultFingerprint to prawdziwy SHA-256', /^[0-9a-f]{64}$/.test(actual.resultFingerprint), actual.resultFingerprint);
check('każdy output oznaczony datasetStatus SCENARIO — nigdy OBSERVED', actual.outputFields.datasetStatus === 'SCENARIO', actual.outputFields.datasetStatus);
check('Exposure ma niepustą, oznaczoną SCENARIO listę fixture\'ów', actual.exposureSiteCount > 0 && actual.exposureDatasetStatus === 'SCENARIO', `${actual.exposureSiteCount}/${actual.exposureDatasetStatus}`);
check('Impact policzony dla każdego site\'u, wszystkie SCENARIO', actual.impactCount === actual.exposureSiteCount && JSON.stringify(actual.impactDatasetStatuses) === JSON.stringify(['SCENARIO']), JSON.stringify(actual.impactDatasetStatuses));
check('replay niezmienionego przebiegu daje MATCH', actual.matchStatus === 'MATCH', actual.matchStatus);
check('replay przekłamanego odcisku daje DRIFT', actual.driftStatus === 'DRIFT', actual.driftStatus);
check('replay bez zamrożonego artefaktu daje BLOCKED (nigdy fałszywy MATCH)', actual.blockedStatus === 'BLOCKED', actual.blockedStatus);
check('replay nieznanego runId daje NOT_REPRODUCIBLE', actual.notReproducibleStatus === 'NOT_REPRODUCIBLE', actual.notReproducibleStatus);
check('kompletny przebieg przechodzi bramkę admisji Phase 0 bez zmian', actual.admissionAllPassed === true);
check('Evidence Pack jest kompletny i ma prawdziwy SHA-256', actual.evidenceMissingFields.length === 0 && /^[0-9a-f]{64}$/.test(actual.evidenceSha256) && actual.evidenceHazardType === 'earthquake', JSON.stringify(actual.evidenceMissingFields));
check('SHA-256 tego samego pakietu policzony dwa razy daje ten sam wynik (funkcja skrótu jest deterministyczna)', actual.evidenceSha256 === actual.evidenceSha256Repeated, `${actual.evidenceSha256} vs ${actual.evidenceSha256Repeated}`);
check('projekcja Digital Twin jest wersjonowana i deklaruje notModeled', actual.projectionSchemaVersion === '1.1.0' && actual.projectionSiteCount === actual.impactCount && actual.projectionNotModeledCount > 0, JSON.stringify(actual));

// Najmocniejszy dowód: identyczne odciski w Node i w przeglądarce.
// evidenceSha256 is deliberately excluded here: it hashes the full result,
// which includes real wall-clock provenance fields (run.createdAt,
// artifact.provenance.retrievedAt) frozen at scenario-build time — two
// independently-run scenarios are legitimately different records. Its
// determinism given a FIXED result is proven separately just above.
for (const key of ['artifactContentHash', 'inputFingerprint', 'resultFingerprint', 'outputFields', 'impactSeverities', 'matchStatus', 'driftStatus', 'blockedStatus', 'notReproducibleStatus', 'evidenceMissingFields', 'projectionSiteCount']) {
  check(`Node i Chromium zgodne: ${key}`, JSON.stringify(actual[key]) === JSON.stringify(expected[key]), `${JSON.stringify(expected[key])} vs ${JSON.stringify(actual[key])}`);
}

console.log(`\n${failures.length === 0 ? 'E2E OK' : `E2E FAILED (${failures.length})`}\n`);
process.exit(failures.length === 0 ? 0 : 2);
