#!/usr/bin/env node
/**
 * Genesis — RETROSYNTHESIS RESUME POINT.
 *
 * The one command to run the moment the route-search models become reachable. It replaces the audit
 * that would otherwise happen first: the campaign already froze WHICH molecule it owes a route
 * (the canonical handoff), so nothing here re-reads the campaign to choose a candidate.
 *
 * download -> SHA256/provenance/licence -> readiness -> aspirin benchmark -> finalist retrosynthesis
 * -> Evidence -> Engine Replay -> final protocol section B.
 *
 * It fails CLOSED at every step. No models, no route. Aspirin unsolved, no route -- a planner that
 * cannot solve the textbook case is not trusted with a novel one. Finalist content hash moved, no
 * route -- the handoff would be describing a different molecule than the sealed record names.
 *
 * Usage:
 *   node scripts/genesis-retro-resume.mjs \
 *     --base http://127.0.0.1:8080 --token <jwt> --project <id> --campaign <id> \
 *     --model-dir /opt/genesis/retro-models [--out artifacts/retro-resume.json]
 *
 * Options:
 *   --skip-download   models are already in --model-dir
 *   --iterations <n>  search iteration limit (default 100; bounded search replays, timed does not)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';

const REQUIRED = [
  { role: 'expansion_policy_model', filename: 'uspto_model.onnx', aliases: [] },
  // The tool writes the templates under their upstream name; the adapter looks for ours.
  { role: 'expansion_templates', filename: 'uspto_templates.csv.gz', aliases: ['uspto_unique_templates.csv.gz'] },
  { role: 'stock', filename: 'zinc_stock.hdf5', aliases: ['zinc_stock.hdf5.gz', '23086469'] },
];

function parseArgs(argv) {
  const a = { base: 'http://127.0.0.1:8080', token: null, project: null, campaign: null, modelDir: null, out: null, skipDownload: false, iterations: 100 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--base') a.base = argv[++i];
    else if (v === '--token') a.token = argv[++i];
    else if (v === '--project') a.project = argv[++i];
    else if (v === '--campaign') a.campaign = argv[++i];
    else if (v === '--model-dir') a.modelDir = argv[++i];
    else if (v === '--out') a.out = argv[++i];
    else if (v === '--skip-download') a.skipDownload = true;
    else if (v === '--iterations') a.iterations = Number(argv[++i]);
  }
  return a;
}

const steps = [];
function step(name, status, detail) {
  steps.push({ name, status, detail: detail ?? null, at: new Date().toISOString() });
  const mark = status === 'OK' ? 'OK  ' : status === 'SKIP' ? 'SKIP' : 'FAIL';
  process.stderr.write(`[${mark}] ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}\n`);
}

function finish(status, extra, out) {
  const artefact = { kind: 'GENESIS_RETRO_RESUME', contractVersion: 1, status, steps, ...extra, finishedAt: new Date().toISOString() };
  const text = JSON.stringify(artefact, null, 2);
  if (out) { mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); writeFileSync(out, `${text}\n`); process.stderr.write(`written: ${out}\n`); }
  else process.stdout.write(`${text}\n`);
  process.exit(status === 'OK' ? 0 : 1);
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function api(base, token, p, body) {
  const r = await fetch(`${base}${p}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const req of ['token', 'project', 'campaign', 'modelDir']) {
    if (!args[req]) { process.stderr.write(`--${req === 'modelDir' ? 'model-dir' : req} is required\n`); process.exit(2); }
  }
  const python = process.env.GENESIS_RETRO_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
  const dir = path.resolve(args.modelDir);
  process.env.GENESIS_RETRO_MODEL_DIR = dir;

  // 1. DOWNLOAD — the engine's own tool, from the engine's own published sources.
  mkdirSync(dir, { recursive: true });
  if (args.skipDownload) step('download', 'SKIP', 'models assumed present');
  else {
    try {
      execFileSync(python, ['-m', 'aizynthfinder.tools.download_public_data', dir], { stdio: 'inherit', timeout: 3_600_000 });
      step('download', 'OK', dir);
    } catch (err) {
      return finish('DOWNLOAD_FAILED', { reason: String(err?.message ?? err).slice(0, 400), modelDir: dir }, args.out);
    }
  }

  // The adapter finds model files BY NAME; the upstream names differ. Rename rather than guess later.
  for (const f of REQUIRED) {
    const target = path.join(dir, f.filename);
    if (existsSync(target)) continue;
    const found = f.aliases.map((a) => path.join(dir, a)).find((p) => existsSync(p))
      ?? readdirSync(dir).map((n) => path.join(dir, n)).find((p) => f.aliases.includes(path.basename(p)));
    if (found) { renameSync(found, target); step('rename', 'OK', `${path.basename(found)} -> ${f.filename}`); }
  }
  const missing = REQUIRED.filter((f) => !existsSync(path.join(dir, f.filename))).map((f) => f.filename);
  if (missing.length) return finish('MODEL_FILES_MISSING', { missing, modelDir: dir }, args.out);

  // 2. SHA256 / PROVENANCE / LICENCE — the identity of the data that will produce the route.
  const models = [];
  for (const f of REQUIRED) {
    const p = path.join(dir, f.filename);
    models.push({ role: f.role, filename: f.filename, bytes: statSync(p).size, sha256: await sha256(p) });
  }
  step('sha256/provenance', 'OK', `${models.length} files`);

  const retro = await import('../packages/backend/src/compute/retroAdapter.mjs');
  retro._resetDetect();

  // 3. READINESS — the adapter's own verdict, not ours.
  const detection = retro.detect();
  if (!detection.available) return finish('BLOCKED_BY_RUNTIME', { readiness: detection, models, modelDir: dir }, args.out);
  step('readiness', 'OK', detection.engine);

  // 4. ASPIRIN — the reference case gates everything downstream.
  const reference = retro.referenceCase();
  if (!reference.ok || !reference.pass) {
    return finish('REFERENCE_CASE_FAILED', { reference, readiness: detection, models }, args.out);
  }
  step('aspirin benchmark', 'OK', `${reference.steps} steps, ${reference.startingMaterials.length} starting materials`);

  // 5. THE FROZEN FINALIST — read, never re-chosen.
  const h = await api(args.base, args.token, `/api/projects/${args.project}/campaigns/${args.campaign}/retrosynthesis-handoff`);
  if (h.status !== 200) return finish('HANDOFF_UNAVAILABLE', { httpStatus: h.status, body: h.json }, args.out);
  const handoff = h.json.handoff;
  step('canonical handoff', 'OK', { candidateId: handoff.finalist.candidateId, contentHash: handoff.finalist.contentHash });

  // 6. THE ROUTE — for that candidate id, by id, so no SMILES round-trip can substitute a molecule.
  const planned = await api(args.base, args.token, `/api/projects/${args.project}/campaigns/${args.campaign}/retrosynthesis`, {
    candidateId: handoff.finalist.candidateId, iterationLimit: args.iterations,
  });
  if (planned.status >= 400 || planned.json?.error) {
    return finish('ROUTE_SEARCH_FAILED', { httpStatus: planned.status, body: planned.json, handoff }, args.out);
  }
  const runId = planned.json.run?.id ?? planned.json.scienceRun?.id ?? null;
  step('finalist retrosynthesis', 'OK', { runId, solved: planned.json.solved });

  // 7. EVIDENCE — the Science Run as persisted, with its hashes.
  const runResp = runId ? await api(args.base, args.token, `/api/projects/${args.project}/campaigns/${args.campaign}/science-runs/${runId}`) : { json: {} };
  const run = runResp.json?.scienceRun ?? null;
  step('evidence', run ? 'OK' : 'FAIL', run ? { inputHash: run.inputHash, outputHash: run.outputHash, environmentHash: run.environmentHash } : 'run not readable');

  // 8. ENGINE REPLAY — the same identity function, re-executed.
  const verify = runId ? await api(args.base, args.token, `/api/projects/${args.project}/campaigns/${args.campaign}/science-runs/${runId}/verify`, {}) : { json: {} };
  const verdict = verify.json?.verification?.verdict ?? verify.json?.verdict ?? null;
  step('engine replay', verdict === 'MATCH' ? 'OK' : 'FAIL', { verdict });

  // 9. SECTION B — it fills itself from the run; we only read it back.
  const protocolResp = await api(args.base, args.token, `/api/projects/${args.project}/campaigns/${args.campaign}/protocol`);
  const synthesis = protocolResp.json?.protocol?.synthesis ?? null;
  step('protocol section B', synthesis?.routeProvided ? 'OK' : 'FAIL', { routeProvided: Boolean(synthesis?.routeProvided), status: synthesis?.status ?? null });

  const ok = verdict === 'MATCH' && Boolean(synthesis?.routeProvided) && Boolean(run);
  finish(ok ? 'OK' : 'INCOMPLETE', {
    modelDir: dir, models, readiness: detection, reference,
    handoff: {
      candidateId: handoff.finalist.candidateId, canonicalSmiles: handoff.finalist.canonicalSmiles,
      contentHash: handoff.finalist.contentHash, handoffFingerprint: handoff.handoffFingerprint,
      preregistrationFingerprint: handoff.preregistration?.fingerprint ?? null,
    },
    run: run ? { id: run.id, inputHash: run.inputHash, outputHash: run.outputHash, environmentHash: run.environmentHash, engineVersion: run.engineVersion } : null,
    replayVerdict: verdict,
    synthesis,
    protocolFingerprint: protocolResp.json?.protocol?.protocolFingerprint ?? null,
  }, args.out);
}

main().catch((err) => finish('CRASHED', { reason: String(err?.stack ?? err).slice(0, 800) }, parseArgs(process.argv.slice(2)).out));
