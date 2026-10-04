import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { probeEnvironment, _resetProbe } from './compute/scienceEnv.mjs';
import { handleRemoteWorkerApi } from './remoteWorkerApi.mjs';
import {
  scanPublicText, scanPublicValue, validateExceptions, isExcepted,
  SECRET_PATTERNS, HOME_PATH_PATTERNS, STACK_TRACE_PATTERNS,
} from './security/publicSurface.mjs';

/**
 * PUBLIC-DEMO SECURITY GATE (D-168) — a standing check, not a one-off audit.
 *
 * Genesis is about to be shown to people who are not its operator: a grant panel, a
 * public demo, a forum post. Three things must not reach them, and all three have
 * already reached a response once in this repository's history:
 *
 *   1. a secret-shaped value anywhere in the working tree or the built frontend,
 *   2. an internal filesystem path or an internal hostname in an HTTP response,
 *   3. a stack trace in an HTTP response.
 *
 * The gate therefore has three parts, run against the REAL surfaces:
 *   A — every unauthenticated API route, driven through the real router;
 *   B — the files that ship publicly (docs, evidence artefacts, scripts, public assets);
 *   C — the production frontend build, when one exists in the working tree.
 *
 * It is deliberately specific. A gate that fires on the word "token" is a gate that
 * gets commented out; see security/publicSurface.mjs for the pattern set and
 * security/public-surface-exceptions.json for how a legitimate exception is recorded.
 *
 * NOTHING THIS TEST PRINTS CONTAINS THE MATCHED VALUE — a failing gate must not put the
 * secret it found into the CI log.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const EXCEPTIONS_FILE = path.join(HERE, 'security', 'public-surface-exceptions.json');

const exceptionsRaw = JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8'));
const exceptions = Array.isArray(exceptionsRaw?.exceptions) ? exceptionsRaw.exceptions : [];

const report = (surface, findings) => `${surface} leaks: ${findings.map((f) => `${f.patternId}@line ${f.line} (${f.length} chars)`).join(', ')}`;
const keep = (surface, findings) => findings.filter((f) => !isExcepted(exceptions, surface, f.patternId));

/* ------------------------------------------------------------------ exceptions */

test('GATE: every exception is a recorded decision, not a silencer', () => {
  const v = validateExceptions(exceptionsRaw);
  assert.deepEqual(v.problems, [], `malformed exceptions in ${path.relative(REPO, EXCEPTIONS_FILE)}:\n  ${v.problems.join('\n  ')}`);
  assert.equal(v.ok, true);
});

/* ------------------------------------------------- the scanner itself is honest */

test('SCANNER: it catches each leak class, and never echoes what it found', () => {
  const key = `AKIA${'ABCDEFGHIJKLMNOP'}`;
  const secret = scanPublicText(`config:\n  aws: ${key}\n`);
  assert.equal(secret.clean, false);
  assert.equal(secret.findings[0].patternId, 'AWS_ACCESS_KEY_ID');
  assert.equal(JSON.stringify(secret).includes(key), false, 'a finding must never carry the secret');

  assert.equal(scanPublicText('/home/mariusz/genesis/packages').clean, false);
  assert.equal(scanPublicText('C:\\Users\\Admin\\Documents\\x').clean, false);
  assert.equal(scanPublicText('Error: boom\n    at run (/app/server.mjs:12:3)').clean, false);
  assert.equal(scanPublicText('  File "/srv/probe.py", line 4').clean, false);
  assert.equal(scanPublicText('http://chem-light.railway.internal:8090').clean, false);
  assert.equal(scanPublicText('{"path":"/usr/bin/vina"}').clean, false, 'an absolute system path is a response leak');
});

test('SCANNER: it does not fire on a public URL that merely contains a path', () => {
  // The exact false positive that would have made this gate unrunnable: /api/ingestion/status
  // publishes its allowlisted upstream URLs, whose paths look like filesystem paths.
  const r = scanPublicText('https://www.ebi.ac.uk/chembl/api/data/molecule/<ID>.json');
  assert.deepEqual(r.findings, [], 'an https URL path is not a filesystem path');
  assert.deepEqual(scanPublicText('https://files.rcsb.org/download/1IEP.pdb').findings, []);
  // The 'artifact' profile tolerates a documented system path; a home path is still a leak.
  assert.equal(scanPublicText('set GENESIS_PYTHON=/usr/bin/python3', { profile: 'artifact' }).clean, true);
  assert.equal(scanPublicText('/Users/Admin/Documents/x', { profile: 'artifact' }).clean, false);
  assert.ok(SECRET_PATTERNS.length > 10 && HOME_PATH_PATTERNS.length > 0 && STACK_TRACE_PATTERNS.length > 0);
});

/* ------------------------------------- A. every unauthenticated route of the API */

/**
 * The public route table, read off api.mjs's own dispatch: everything handled BEFORE the
 * `const user = getUserByToken(...)` gate, plus the two unauthenticated server.mjs routes
 * that are covered by their own assertions below. A new public family added above that gate
 * belongs in this list; `serverApiPrefixes.test.mjs` already fails when a family is added to
 * api.mjs and not to the HTTP layer, and the segment check below ties this list to the same source.
 */
const PUBLIC_ROUTES = Object.freeze([
  ['GET', '/api/auth/me', {}],
  ['POST', '/api/auth/login', { email: 'nobody@example.org', password: 'wrong-password' }],
  ['GET', '/api/compute/capabilities', {}],
  ['GET', '/api/compute/models', {}],
  ['GET', '/api/compute/models/does-not-exist', {}],
  ['GET', '/api/compute/fabric/contract', {}],
  ['GET', '/api/compute/toolchain', {}],
  ['GET', '/api/compute/environment', {}],
  ['GET', '/api/compute/access', {}],
  ['GET', '/api/compute/admet/endpoints', {}],
  ['GET', '/api/compute/local-video/runtime', {}],
  ['POST', '/api/compute/local-video/plan', {}],
  ['POST', '/api/compute/run', {}],
  ['POST', '/api/compute/fabric/run', {}],
  ['GET', '/api/knowledge/proposals', {}],
  ['POST', '/api/manifold/evaluate', { points: [{ x: 0, y: 0, z: 0, temporalT: 0, hyperspaceW: 0 }] }],
  ['GET', '/api/system/telemetry', {}],
  ['GET', '/api/ingestion/status', {}],
  ['GET', '/api/quantum/status', {}],
  ['POST', '/api/speculative/run', {}],
  ['GET', '/api/physics/cms-z', {}],
  ['GET', '/api/worlds', {}],
  ['POST', '/api/worlds', {}],
  ['GET', '/api/does-not-exist', {}],
]);

test('A: the public route list covers every family api.mjs routes before its auth gate', () => {
  const source = readFileSync(path.join(HERE, 'api.mjs'), 'utf8');
  const gateAt = source.indexOf('const user = getUserByToken(db, ctx.token);\n  if (!user) return err(401');
  assert.ok(gateAt > 0, 'api.mjs no longer has the single "from here a token is required" gate this list is read off');
  const publicPart = source.slice(0, gateAt);
  const families = new Set([...publicPart.matchAll(/seg\[0\] === '([a-z-]+)'/g)].map((m) => m[1]));
  const covered = new Set(PUBLIC_ROUTES.map(([, p]) => p.split('/')[2]));
  const uncovered = [...families].filter((f) => !covered.has(f));
  assert.deepEqual(uncovered, [], `api.mjs serves these families WITHOUT a token and the gate does not probe them: ${uncovered.join(', ')}`);
});

test('A: no unauthenticated route leaks a path, a host, a stack trace or a secret', async () => {
  const db = openDatabase();
  const leaks = [];
  for (const [method, pathname, body] of PUBLIC_ROUTES) {
    const surface = `${method} ${pathname}`;
    let result;
    try {
      result = await handleApi(db, { method, pathname, body, query: {}, token: undefined });
    } catch (error) {
      leaks.push(`${surface} THREW (an unhandled throw becomes a 500 whose body is not controlled): ${error?.constructor?.name}`);
      continue;
    }
    const findings = keep(surface, scanPublicValue(result.body).findings);
    if (findings.length) leaks.push(report(surface, findings));
  }
  db.close?.();
  assert.deepEqual(leaks, [], `public API responses leaked:\n  ${leaks.join('\n  ')}`);
});

test('A: GET /api/compute/environment never returns the interpreter or binary location', async () => {
  // The real defect this closes: env_probe.py reports shutil.which()'s absolute path for every
  // binary engine, and the handler returned the probe verbatim on an UNAUTHENTICATED route.
  const db = openDatabase();
  const r = await handleApi(db, { method: 'GET', pathname: '/api/compute/environment', body: {}, query: {} });
  db.close?.();
  assert.equal(r.status === 200 || r.status === 503, true);
  if (r.status !== 200) return; // no python in this environment: the 503 body is covered by the scan above
  for (const [id, engine] of Object.entries(r.body.environment.engines)) {
    assert.equal('path' in engine, false, `engine ${id} still exposes its filesystem location`);
  }
  assert.deepEqual(scanPublicValue(r.body).findings, []);
});

test('A: the environment probe\'s own failure text is path-redacted before it can be returned', () => {
  // probeEnvironment() wraps a live execFileSync, whose failure message is literally
  // "Command failed: <interpreter path> <script path>".
  _resetProbe();
  const probe = probeEnvironment({ fresh: true });
  if (probe.ok) { _resetProbe(); return; } // this machine has a working probe; the shape is covered above
  assert.deepEqual(scanPublicText(probe.error).findings, [], 'the probe failure text carries a host path');
  _resetProbe();
});

test('A: the remote-worker surface is off without a token and leaks nothing when it is on', async () => {
  const off = await handleRemoteWorkerApi(null, { method: 'GET', pathname: '/api/worker/v1/health', token: 'anything', body: {}, expectedToken: undefined });
  assert.equal(off.status, 503);
  assert.deepEqual(scanPublicValue(off.body).findings, []);

  const wrong = await handleRemoteWorkerApi(null, { method: 'GET', pathname: '/api/worker/v1/health', token: 'not-the-token', body: {}, expectedToken: 'x'.repeat(40) });
  assert.equal(wrong.status, 401);
  assert.equal(JSON.stringify(wrong.body).includes('x'.repeat(40)), false, 'the expected token must never appear in a response');

  // An unexpected server error must not hand the worker host the server's own file layout.
  const boom = await handleRemoteWorkerApi(
    { prepare() { throw new Error('SQLITE_IOERR: disk I/O error opening /data/genesis.db'); } },
    { method: 'POST', pathname: '/api/worker/v1/claim', token: 'x'.repeat(40), body: {}, expectedToken: 'x'.repeat(40) },
  );
  assert.equal(boom.status >= 400, true);
  assert.deepEqual(scanPublicValue(boom.body).findings, [], 'the worker API 500 reason carries a host path');
});

/* ------------------------------------------- B. the files that ship to the public */

/** Paths whose contents a visitor can read, or which end up in a grant pack / evidence export. */
const PUBLIC_TREE = Object.freeze(['docs', 'artifacts', 'scripts', 'knowledge', 'packages/frontend/public', 'README.md', 'SECURITY.md']);

function trackedFiles(prefixes) {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...prefixes], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.zip', '.gz', '.pdf', '.ico', '.woff', '.woff2', '.ttf', '.bin', '.npy', '.sqlite', '.db']);

test('B: no tracked file that ships publicly carries a secret, a home path or a stack trace', () => {
  const leaks = [];
  for (const rel of trackedFiles(PUBLIC_TREE)) {
    if (SKIP_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(REPO, rel);
    if (!existsSync(abs) || statSync(abs).size > 8 * 1024 * 1024) continue;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue; // binary
    const findings = keep(rel, scanPublicText(text, { profile: 'artifact' }).findings);
    if (findings.length) leaks.push(report(rel, findings.slice(0, 5)));
  }
  assert.deepEqual(leaks, [], `files that ship publicly leaked:\n  ${leaks.join('\n  ')}`);
});

test('B: .env.example still documents every secret as EMPTY, and .env stays ignored', () => {
  // envContract.test.mjs owns the drift rule; this gate owns the one-line consequence of it,
  // so the public-demo gate fails by itself if a credential is ever committed as an "example".
  const example = readFileSync(path.join(REPO, '.env.example'), 'utf8');
  const secretish = [...example.matchAll(/^([A-Z_][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*)=(.*)$/gm)];
  assert.ok(secretish.length >= 5, 'the gate must see real credential variables, or it checks nothing');
  const withValue = secretish.filter(([, , value]) => value.trim() !== '').map(([, name]) => name);
  assert.deepEqual(withValue, [], `credential variables carry a value in .env.example: ${withValue.join(', ')}`);
  assert.match(readFileSync(path.join(REPO, '.gitignore'), 'utf8'), /^\.env$/m);
  // The shared worker secret in particular: present as a name, never as a value, anywhere tracked.
  assert.match(example, /^GENESIS_WORKER_TOKEN=\s*$/m);
  assert.match(example, /^GENESIS_SCIENTIFIC_WORKER_TOKEN=\s*$/m);
});

/* ------------------------------------------ C. the production frontend build output */

test('C: the built frontend inlines no secret and no developer path', () => {
  const dist = path.join(REPO, 'packages', 'frontend', 'dist');
  if (!existsSync(dist)) return; // nothing built in this checkout; CI builds before running the gate
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.map', '.txt'].includes(path.extname(entry.name).toLowerCase())) files.push(abs);
    }
  };
  walk(dist);
  assert.ok(files.length > 0, 'dist exists but holds no inspectable asset');
  const leaks = [];
  for (const abs of files) {
    if (statSync(abs).size > 24 * 1024 * 1024) continue;
    // Vite gives every asset a content hash, so the filename changes on every build. An exception
    // is recorded against the STABLE name (`assets/experimentGraph.js`), or it would silently stop
    // applying — which is the same as having no exception, discovered at the worst moment.
    const rel = path.relative(REPO, abs).replace(/-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)$/, '$1');
    const findings = keep(rel, scanPublicText(readFileSync(abs, 'utf8'), { profile: 'artifact' }).findings);
    if (findings.length) leaks.push(report(rel, findings.slice(0, 5)));
  }
  assert.deepEqual(leaks, [], `the production bundle leaked:\n  ${leaks.join('\n  ')}`);
});

test('C: the frontend declares no client-inlined variable that could carry a secret', () => {
  // Vite inlines anything the client reads from import.meta.env (VITE_*) straight into the bundle,
  // so a VITE_-prefixed credential is a secret published to every visitor. There are none today;
  // this fails the moment one appears, which is before it can be given a value.
  const hits = (() => {
    try {
      return execFileSync('git', ['grep', '-lI', '--', 'VITE_', 'packages/frontend/src', 'packages/ui/src'], { cwd: REPO, encoding: 'utf8' });
    } catch (err) { if (err.status === 1) return ''; throw err; }
  })();
  assert.equal(hits.trim(), '', `client-inlined VITE_ variables appeared:\n${hits}`);
});
