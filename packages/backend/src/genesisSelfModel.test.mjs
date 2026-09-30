import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENESIS_IDENTITY } from './genesisIdentity.mjs';
import { buildSelfModel, engineSelfView, countAwaitingMeasurements, readSealedGateFailures } from './genesisSelfModel.mjs';
import { listToolIds, TOOL_STATUS } from './campaign/toolchain.mjs';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { createCampaign, addEvent } from './campaign/persistence.mjs';
import { LAB_EVENT } from './campaign/labClosedLoop.mjs';

/**
 * ENTITY-1 — Genesis knows who it is and what it can do now. Identity is four fields that survive a
 * restart; the self model is read from the toolchain and runtime status, never from a copied list, and
 * keeps "the adapter exists" apart from "the runtime works right now".
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

function bootAndReadSelf(dbPath) {
  const proc = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: { ...process.env, PORT: '0', GENESIS_DB_PATH: dbPath, ANTHROPIC_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('server did not start in time')); }, 20000);
    let buf = '';
    proc.stderr.on('data', () => {});
    proc.stdout.on('data', async (chunk) => {
      buf += chunk.toString();
      const started = buf.split('\n').map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((j) => j?.msg === 'started');
      if (!started) return;
      buf = '';
      clearTimeout(timer);
      try {
        const res = await fetch(`http://127.0.0.1:${started.port}/api/genesis/self`);
        resolve({ status: res.status, body: await res.json() });
      } catch (err) { reject(err); } finally { proc.kill('SIGKILL'); }
    });
  });
}

describe('ENTITY-1 GenesisIdentity', () => {
  test('is a thin record: exactly the four fields nothing else can derive', () => {
    assert.deepEqual(Object.keys(GENESIS_IDENTITY).sort(), ['constitutionVersion', 'entityId', 'identitySchemaVersion', 'mission']);
    assert.match(GENESIS_IDENTITY.entityId, /^genesis-entity:[0-9a-f-]{36}$/);
    const source = readFileSync(path.join(HERE, 'genesisIdentity.mjs'), 'utf8');
    for (const toolId of listToolIds()) assert.ok(!source.toLowerCase().includes(`'${toolId}'`), `identity must not copy engine ${toolId}`);
  });

  test('constitutionVersion names the constitution actually in the repo (an edit forces a new version)', () => {
    const sha = createHash('sha256').update(readFileSync(path.join(REPO, 'docs/GENESIS_CONSTITUTION.md'))).digest('hex');
    assert.equal(GENESIS_IDENTITY.constitutionVersion, `GENESIS_CONSTITUTION@${sha.slice(0, 16)}`);
  });

  test('a restart, even onto a new database, is still the same entity', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-entity1-'));
    try {
      const first = await bootAndReadSelf(path.join(dir, 'a.db'));
      const second = await bootAndReadSelf(path.join(dir, 'a.db'));
      const otherDb = await bootAndReadSelf(path.join(dir, 'b.db'));
      assert.equal(first.status, 200);
      assert.equal(first.body.identity.entityId, GENESIS_IDENTITY.entityId);
      assert.equal(second.body.identity.entityId, first.body.identity.entityId);
      assert.equal(otherDb.body.identity.entityId, first.body.identity.entityId);
      assert.deepEqual(first.body.engines.map((e) => e.toolId).slice(0, listToolIds().length), listToolIds());
      assert.equal(first.body.knownModels[0].status, 'BLOCKED_BY_PROVIDER_CONFIGURATION', 'no key → the reasoning model is named as blocked');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('mission and constitution cannot reach science: only the self model imports the identity', () => {
    const importers = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) { if (name !== 'node_modules') walk(file); continue; }
        if (!name.endsWith('.mjs') || name.endsWith('.test.mjs')) continue;
        const text = readFileSync(file, 'utf8');
        if (/from '\.{1,2}\/(?:.*\/)?genesisIdentity\.mjs'/.test(text)) importers.push(path.relative(HERE, file));
        if (/from '\.{1,2}\/(?:.*\/)?genesisSelfModel\.mjs'/.test(text)) importers.push(`${path.relative(HERE, file)} (self model)`);
      }
    };
    walk(HERE);
    assert.deepEqual(importers.sort(), ['api.mjs (self model)', 'genesisSelfModel.mjs', 'server.mjs (self model)']);
  });
});

describe('ENTITY-1 SelfModel', () => {
  const tool = (toolId, status, extra = {}) => ({
    toolId, engineName: toolId === 'openmm' ? 'OpenMM' : toolId, capabilityId: `${toolId}-cap`, status,
    reason: status === TOOL_STATUS.AVAILABLE ? null : `${toolId} runtime missing`, provenance: { validationCaseIds: ['ref-1'] }, version: '1.0', ...extra,
  });

  test('reads the canonical toolchain, not a copy: an engine added there appears here', () => {
    const model = buildSelfModel({ toolchain: [tool('future-engine', TOOL_STATUS.AVAILABLE)], runtime: { engines: [] }, capabilities: [], ingestion: { sources: [] } });
    assert.deepEqual(model.engines.map((e) => e.toolId), ['future-engine']);
    const real = buildSelfModel({ runtime: { engines: [] }, ingestion: { sources: [] } });
    assert.deepEqual(real.engines.map((e) => e.toolId), listToolIds());
  });

  test('an engine whose reference case failed is BLOCKED, with the adapter still acknowledged', () => {
    const view = engineSelfView(tool('openmm', TOOL_STATUS.VALIDATION_FAILED), undefined);
    assert.equal(view.capabilityExists, true);
    assert.equal(view.runtimeAvailableNow, false);
    assert.equal(view.status, 'BLOCKED');
    assert.equal(view.blockedBy, 'REFERENCE_CASE_FAILED');
    assert.match(view.statement, /^Mam adapter OpenMM, ale/);
  });

  test('"I have the OpenMM adapter, but its runtime is unavailable now" — not "no OpenMM", not "OpenMM works"', () => {
    const view = engineSelfView(tool('openmm', TOOL_STATUS.BLOCKED_BY_RUNTIME), { id: 'openmm', status: 'BLOCKED_BY_RUNTIME', reason: 'WORKER_URL_MISSING' });
    assert.equal(view.statement, 'Mam adapter OpenMM, ale obecnie runtime jest niedostępny (BLOCKED_BY_RUNTIME).');
  });

  test('an unavailable engine is never AVAILABLE: every local × remote combination', () => {
    const locals = [...Object.values(TOOL_STATUS), undefined];
    const remotes = ['AVAILABLE', 'PENDING_REAL_EXECUTION', 'BLOCKED_BY_RUNTIME', undefined];
    for (const l of locals) {
      for (const r of remotes) {
        const view = engineSelfView(l ? tool('x', l) : null, r ? { id: 'x', status: r, workerGroup: 'g' } : undefined);
        const expected = l === TOOL_STATUS.AVAILABLE || r === 'AVAILABLE';
        assert.equal(view.runtimeAvailableNow, expected, `local=${l} remote=${r}`);
        assert.equal(view.status === 'AVAILABLE', expected, `local=${l} remote=${r}`);
        assert.equal(view.proof !== null, expected, 'AVAILABLE always carries its proof, BLOCKED never does');
        assert.equal(view.capabilityExists, true);
      }
    }
    const pending = engineSelfView(tool('openmm', TOOL_STATUS.BLOCKED_BY_RUNTIME), { id: 'openmm', status: 'PENDING_REAL_EXECUTION' });
    assert.equal(pending.blockedBy, 'NO_REAL_REMOTE_RUN_YET', 'a worker that is online but never ran it for real is not available');
    assert.equal(pending.runtimeAvailableNow, false);
  });

  test('failed gates come from the sealed evaluations; missing capabilities, blockers and models are named', () => {
    const failures = readSealedGateFailures();
    const h = failures.find((f) => f.evaluationId === 'D-144-EXPANDED-CUSTODY-VERIFIED-SET' && f.arm === 'H-COMBINED-ALL');
    assert.ok(h, 'the sealed D-144 combined arm is reported as a failed gate');
    assert.deepEqual(h.reasons, ['MAE=1.0118 > MAX_MAE=1']);

    const model = buildSelfModel({ runtime: { engines: [] }, reasoningModel: { configured: true, model: 'm' } });
    assert.equal(model.knownModels[0].status, 'CONFIGURED');
    assert.ok(model.knownModels.some((m) => m.kind === 'PREDICTIVE_MODEL_GATE' && m.target === 'GLP1R' && m.ruleFingerprint === 'd2f77a7e6042f0fc'));
    assert.ok(model.missingCapabilities.some((c) => c.id === 'generative-de-novo'));
    assert.ok(model.missingCapabilities.every((c) => c.status !== 'AVAILABLE' && c.status !== 'BLOCKED_BY_RUNTIME'), 'an engine with an adapter is never listed as missing');
    assert.ok(model.dataAccessBlockers.every((b) => b.status !== 'LIVE'));
    assert.deepEqual(model.availableEngines, model.engines.filter((e) => e.runtimeAvailableNow).map((e) => e.toolId));
  });

  test('lab work awaiting a measurement is counted until an observation arrives', () => {
    const db = openDatabase();
    const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {} });
    const owner = call('POST', '/api/auth/register', { body: { email: 'self@lab.org', password: 'password123' } }).body;
    const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'ENTITY-1' } }).body.project;
    const campaign = createCampaign(db, { projectId: project.id, objective: 'o', domain: 'd' });
    assert.deepEqual(countAwaitingMeasurements(db), { known: true, candidates: 0, campaigns: 0 });
    addEvent(db, { campaignId: campaign.id, type: LAB_EVENT.VALIDATION_REQUESTED, payload: { candidateId: 'c1', status: 'DRAFT_BLOCKED_BY_RESEARCH_GATE' } });
    assert.equal(countAwaitingMeasurements(db).candidates, 0, 'a draft blocked by the research gate is not waiting on a lab');
    addEvent(db, { campaignId: campaign.id, type: LAB_EVENT.VALIDATION_REQUESTED, payload: { candidateId: 'c1', status: 'READY_FOR_EXTERNAL_LAB_REVIEW' } });
    assert.deepEqual(countAwaitingMeasurements(db), { known: true, candidates: 1, campaigns: 1 });
    addEvent(db, { campaignId: campaign.id, type: LAB_EVENT.OBSERVATION_INGESTED, payload: { candidateId: 'c1' } });
    assert.equal(countAwaitingMeasurements(db).candidates, 0);
    assert.deepEqual(countAwaitingMeasurements(null), { known: false, candidates: 0, campaigns: 0 });
  });
});
