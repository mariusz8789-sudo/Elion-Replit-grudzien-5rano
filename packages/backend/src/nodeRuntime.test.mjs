import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MINIMUM_NODE,
  parseNodeVersion,
  meetsMinimumNode,
  hasNodeSqlite,
  checkNodeRuntime,
  nodeRuntimeMessage,
} from './nodeRuntime.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const manifest = (rel) => JSON.parse(read(rel));

/**
 * P0.1 — THE DECLARED RUNTIME MUST MATCH THE RUNTIME THE CODE ACTUALLY NEEDS.
 *
 * `store.mjs`, `server.mjs` and `agentRun.mjs` import `node:sqlite`, which does
 * not exist before Node 22.5.0. The repo declared `>=18` at the root, nothing
 * at all in the three workspaces, and `nodejs-20` in `.replit` — so the one
 * platform manifest that names a concrete runtime named one where every
 * persistence path fails at MODULE RESOLUTION, before a single line of our own
 * code runs. `ERR_UNKNOWN_BUILTIN_MODULE` is what an operator would have seen.
 *
 * These tests are the mechanical guard against that drifting back.
 */

test('P0.1 parseNodeVersion reads real version strings and rejects junk', () => {
  assert.deepEqual(parseNodeVersion('v22.22.2'), { major: 22, minor: 22, patch: 2 });
  assert.deepEqual(parseNodeVersion('22.5.0'), { major: 22, minor: 5, patch: 0 });
  assert.deepEqual(parseNodeVersion('v18.20.8'), { major: 18, minor: 20, patch: 8 });
  assert.equal(parseNodeVersion('nodejs-20'), null);
  assert.equal(parseNodeVersion(''), null);
  assert.equal(parseNodeVersion(undefined), null);
});

test('P0.1 meetsMinimumNode puts the floor exactly where node:sqlite appeared', () => {
  // Below the floor: node:sqlite does not exist on any of these.
  for (const below of ['v18.20.8', 'v20.19.0', 'v21.7.3', 'v22.4.1']) {
    assert.equal(meetsMinimumNode(below), false, `${below} must be rejected`);
  }
  // At and above the floor.
  for (const ok of ['v22.5.0', 'v22.22.2', 'v23.0.0', 'v24.1.0']) {
    assert.equal(meetsMinimumNode(ok), true, `${ok} must be accepted`);
  }
  // An unparseable version is NOT silently accepted.
  assert.equal(meetsMinimumNode('unknown'), false);
});

test('P0.1 the guard probes the real capability, not only the version number', () => {
  // Empirical, not a version table: this is the actual question that matters,
  // and on this interpreter it must answer true (the suite itself needs it).
  assert.equal(hasNodeSqlite(), true);
});

test('P0.1 the failure message is readable and names the cause, not a stack trace', () => {
  const message = nodeRuntimeMessage({ ok: false, version: 'v20.19.0', reason: 'VERSION_TOO_OLD' });
  assert.match(message, /20\.19\.0/, 'must state the version it actually found');
  assert.match(message, new RegExp(MINIMUM_NODE.replace(/\./g, '\\.')), 'must state the minimum required');
  assert.match(message, /node:sqlite/, 'must name WHY that minimum exists');
  assert.doesNotMatch(message, /ERR_UNKNOWN_BUILTIN_MODULE|at Object\./, 'must not be a raw crash');
});

test('P0.1 checkNodeRuntime passes on this interpreter and fails closed on an old one', () => {
  const here = checkNodeRuntime();
  assert.equal(here.ok, true, `this interpreter (${process.version}) must be supported`);

  const old = checkNodeRuntime({ version: 'v20.19.0', sqliteAvailable: false });
  assert.equal(old.ok, false);
  assert.equal(old.reason, 'VERSION_TOO_OLD');

  // A new-enough version whose node:sqlite is missing anyway (custom build,
  // stripped runtime) must still fail — the capability is the real requirement.
  const noSqlite = checkNodeRuntime({ version: 'v22.22.2', sqliteAvailable: false });
  assert.equal(noSqlite.ok, false);
  assert.equal(noSqlite.reason, 'SQLITE_UNAVAILABLE');
});

test('P0.1 every workspace manifest declares a Node floor at or above the real minimum', () => {
  const manifests = ['package.json', 'packages/backend/package.json', 'packages/frontend/package.json', 'packages/csrn/package.json'];
  for (const rel of manifests) {
    const declared = manifest(rel).engines?.node;
    assert.ok(declared, `${rel} declares no engines.node — the runtime contract is unstated`);
    const floor = parseNodeVersion(String(declared).replace(/^[^\d]*/, ''));
    assert.ok(floor, `${rel} engines.node=${declared} has no parseable floor`);
    assert.equal(meetsMinimumNode(`${floor.major}.${floor.minor}.${floor.patch}`), true,
      `${rel} declares node ${declared}, below the ${MINIMUM_NODE} that node:sqlite needs`);
  }
});

test('P0.1 .replit does not name a Node runtime below the floor', () => {
  const replit = read('.replit');
  const modules = /modules\s*=\s*\[([^\]]*)\]/.exec(replit);
  assert.ok(modules, '.replit declares no modules array');
  const nodeModule = /nodejs-(\d+)/.exec(modules[1]);
  assert.ok(nodeModule, '.replit names no nodejs-* module');
  assert.ok(Number(nodeModule[1]) >= parseNodeVersion(MINIMUM_NODE).major,
    `.replit runs nodejs-${nodeModule[1]}, where node:sqlite does not exist`);
});

test('P0.1 every process entry point goes through the guard, so nothing bypasses it', () => {
  const backend = manifest('packages/backend/package.json');
  assert.match(backend.scripts.start, /start\.mjs/, 'npm start must boot through the guard');
  assert.match(backend.scripts.dev, /start\.mjs/, 'npm run dev must boot through the guard');
  assert.match(read('Dockerfile'), /CMD \["node", "packages\/backend\/src\/start\.mjs"\]/);
  assert.match(read('.replit'), /run = \["node", "packages\/backend\/src\/start\.mjs"\]/);
});
