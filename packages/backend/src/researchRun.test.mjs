import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { readKnowledgeRegistry } from './knowledgeRegistry.mjs';
import { RESEARCH_RUN_DOMAIN } from './researchRun.mjs';

/**
 * R1-a — one question, one ResearchRun id; the model proposes sub-problems, hypotheses and
 * experiments, never facts; everything persists, resumes after a restart, never duplicates and
 * never crosses projects.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A plan that tries everything the model must not: FACT, SUPPORTED, invented citations, a gate change. */
const PLAN = {
  subProblems: [
    { question: 'Which GLP-1R assays measure agonism rather than binding?', whyItMatters: 'Binding is not activation.' },
    { question: 'Is there enough functional data to train a model?' },
    { whyItMatters: 'no question here' },
  ],
  hypotheses: [
    {
      claim: 'Compound X is a GLP-1R agonist.', claimType: 'FACT', status: 'SUPPORTED',
      assumptions: ['cAMP readout reflects agonism'], supportingEvidenceRefs: ['doi:10.1000/fake'], contradictingEvidenceRefs: [],
      missingEvidence: ['measured cAMP EC50'], uncertainty: { level: 'LOW', statement: 'sure' },
      falsificationProposal: 'cAMP EC50 above 1 µM.',
      experimentProposal: { kind: 'WET_LAB', description: 'Measure cAMP EC50 in HEK293-GLP1R cells.' },
    },
    {
      claim: 'The current model gate is too strict.', claimType: 'HYPOTHESIS',
      falsificationProposal: 'Gate passes without the change.',
      challengesHypothesisIndex: 99,
      experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Relax the gate', parameterChanges: [{ target: 'maxMae', to: 1.2 }] },
    },
    { claim: 'Compound X is inactive at GLP-1R (null hypothesis).', claimType: 'HYPOTHESIS', falsificationProposal: 'Any measured agonism.', challengesHypothesisIndex: 0 },
    { claim: 'no falsification given' },
  ],
  nextActions: ['Separate functional from binding assays', ''],
};

function fakeProvider(answer, { delayMs = 0 } = {}) {
  let calls = 0;
  return {
    providerId: 'PRIVATE_LOCAL', model: 'fake-model', configured: true, reason: null,
    describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fake-model', configured: true, status: 'CONFIGURED', reason: null }),
    async complete() {
      calls += 1;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return { text: typeof answer === 'string' ? answer : JSON.stringify(answer), model: 'fake-model' };
    },
    get calls() { return calls; },
  };
}

function setup(db, email, reasoningProvider) {
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: email } }).body.project;
  return { call, owner, project, base: `/api/projects/${project.id}` };
}

describe('R1-a research run', () => {
  test('one question → one run id; the same question does not start a second run', async () => {
    const db = openDatabase();
    const { call, owner, base } = setup(db, 'rr1@lab.org');
    const a = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Find a GLP-1R agonist.' } });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const run = a.body.researchRun;
    assert.equal(run.run.domain, RESEARCH_RUN_DOMAIN);
    assert.equal(run.researchRunId, run.run.id);
    assert.deepEqual(run.researchState.events.map((e) => e.type), ['PROBLEM_FORMALIZED']);
    assert.equal(run.researchState.events[0].payload.researchRunId, run.researchRunId);
    assert.equal(run.researchState.chain.ok, true);
    assert.equal(run.nextStep, 'PROPOSE_PLAN');

    const again = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: '  find a   GLP-1R agonist. ' } });
    assert.equal(again.status, 200);
    assert.equal(again.body.deduped, true);
    assert.equal(again.body.researchRun.researchRunId, run.researchRunId);

    const keyed1 = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Find a GLP-1R agonist.', idempotencyKey: 'k1' } });
    const keyed2 = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Find a GLP-1R agonist.', idempotencyKey: 'k1' } });
    assert.equal(keyed1.status, 201);
    assert.notEqual(keyed1.body.researchRun.researchRunId, run.researchRunId);
    assert.equal(keyed2.body.researchRun.researchRunId, keyed1.body.researchRun.researchRunId);
    assert.equal((await call('GET', `${base}/research-runs`, { token: owner.token })).body.researchRuns.length, 2);
    assert.equal((await call('POST', `${base}/research-runs`, { token: owner.token, body: {} })).status, 400);
  });

  test('projects never mix: another project gets its own run and cannot read this one', async () => {
    const db = openDatabase();
    const A = setup(db, 'rr2a@lab.org');
    const B = setup(db, 'rr2b@lab.org');
    const q = { question: 'Same question in two projects' };
    const ra = (await A.call('POST', `${A.base}/research-runs`, { token: A.owner.token, body: q })).body.researchRun;
    const rb = (await B.call('POST', `${B.base}/research-runs`, { token: B.owner.token, body: q })).body.researchRun;
    assert.notEqual(ra.researchRunId, rb.researchRunId);
    assert.equal((await B.call('GET', `${B.base}/research-runs/${ra.researchRunId}`, { token: B.owner.token })).status, 404, 'A run is not found through B');
    assert.notEqual((await B.call('GET', `${A.base}/research-runs/${ra.researchRunId}`, { token: B.owner.token })).status, 200, 'B is not a member of A');
    assert.equal((await B.call('POST', `${B.base}/research-runs/${ra.researchRunId}/proposals`, { token: B.owner.token })).status, 404);
    assert.deepEqual((await B.call('GET', `${B.base}/research-runs`, { token: B.owner.token })).body.researchRuns.map((r) => r.researchRunId), [rb.researchRunId]);
  });

  test('the model only proposes: FACT and SUPPORTED are degraded, fake citations dropped, a gate change rejected, provenance kept', async () => {
    const db = openDatabase();
    const provider = fakeProvider(PLAN);
    const { call, owner, project, base } = setup(db, 'rr3@lab.org', provider);
    const run = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Is compound X a GLP-1R agonist?' } })).body.researchRun;
    const res = await call('POST', `${base}/research-runs/${run.researchRunId}/proposals`, { token: owner.token });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const after = res.body.researchRun;
    assert.deepEqual(after.researchState.events.map((e) => e.type), ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED']);
    assert.equal(after.nextStep, 'AWAITING_EXECUTION');
    const plan = after.plan;
    assert.equal(plan.status, 'PROPOSED');
    assert.equal(plan.epistemicStatus, 'NOT_EVIDENCE');
    assert.equal(plan.researchRunId, run.researchRunId);
    assert.equal(plan.subProblems.length, 2);
    assert.ok(plan.subProblems.every((s) => s.status === 'PROPOSED' && s.researchRunId === run.researchRunId));
    assert.equal(plan.hypotheses.length, 3);
    for (const h of plan.hypotheses) {
      assert.equal(h.status, 'PROPOSED');
      assert.equal(h.epistemicStatus, 'NOT_EVIDENCE');
      assert.notEqual(h.claimType, 'FACT');
      assert.equal(h.researchRunId, run.researchRunId);
      assert.equal(h.generatedBy.kind, 'EXTERNAL_REASONING_MODEL');
      assert.equal(h.generatedBy.providerId, 'PRIVATE_LOCAL');
      assert.match(h.generatedBy.promptFingerprint, /^[0-9a-f]+$/);
      assert.match(h.generatedBy.responseFingerprint, /^[0-9a-f]+$/);
    }
    const [fact, gate] = plan.hypotheses;
    assert.equal(fact.claimType, 'HYPOTHESIS');
    assert.ok(fact.degradations.some((d) => d.from === 'FACT'));
    assert.ok(fact.degradations.some((d) => d.from === 'SUPPORTED'));
    assert.deepEqual(fact.supportingEvidenceRefs, []);
    assert.equal(fact.experimentProposal.decision, 'HUMAN_APPROVAL_REQUIRED');
    assert.equal(fact.experimentProposal.executedByModel, false);
    assert.equal(gate.experimentProposal.decision, 'REJECTED_FROZEN_THRESHOLD');
    assert.ok(gate.degradations.some((d) => d.reason === 'CHALLENGE_MUST_REFERENCE_AN_ACCEPTED_EARLIER_HYPOTHESIS'));
    assert.equal(plan.hypotheses[2].challengesHypothesisId, fact.hypothesisId);
    assert.deepEqual(plan.rejected.map((r) => [r.kind, r.index]), [['SUB_PROBLEM', 2], ['HYPOTHESIS', 3]]);
    assert.deepEqual(plan.nextActions.map((a) => a.action), ['Separate functional from binding assays']);

    // Also in the project's ENTITY-2 registry, tagged with the run id, still PROPOSED.
    const claims = readKnowledgeRegistry(db, project.id).claims;
    assert.equal(claims.length, 3);
    assert.ok(claims.every((c) => c.status === 'PROPOSED' && c.researchRunId === run.researchRunId));

    // Asking again reuses the stored plan: no second model call, no duplicate claims.
    const again = await call('POST', `${base}/research-runs/${run.researchRunId}/proposals`, { token: owner.token });
    assert.equal(again.status, 200);
    assert.equal(again.body.deduped, true);
    assert.equal(provider.calls, 1);
    assert.equal(readKnowledgeRegistry(db, project.id).claims.length, 3);
  });

  test('provider missing or answer malformed: nothing is written', async () => {
    const db = openDatabase();
    const { call, owner, project, base } = setup(db, 'rr4@lab.org', { configured: false, reason: 'NO_PROVIDER_CONFIGURED', describe: () => ({ configured: false }) });
    const run = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Q?' } })).body.researchRun;
    const blocked = await call('POST', `${base}/research-runs/${run.researchRunId}/proposals`, { token: owner.token });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.error, 'BLOCKED_BY_PROVIDER_CONFIGURATION');

    const db2 = openDatabase();
    const bad = setup(db2, 'rr4b@lab.org', fakeProvider({ subProblems: [], hypotheses: [{ claim: 'x' }] }));
    const run2 = (await bad.call('POST', `${bad.base}/research-runs`, { token: bad.owner.token, body: { question: 'Q?' } })).body.researchRun;
    const rejected = await bad.call('POST', `${bad.base}/research-runs/${run2.researchRunId}/proposals`, { token: bad.owner.token });
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error, 'REJECTED_MALFORMED_RESPONSE');
    for (const [d, b, id, p] of [[db, base, run.researchRunId, project], [db2, bad.base, run2.researchRunId, bad.project]]) {
      const view = (await handleApi(d, { method: 'GET', pathname: `${b}/research-runs/${id}`, token: d === db ? owner.token : bad.owner.token, body: null, query: {} })).body.researchRun;
      assert.equal(view.researchState.events.length, 1);
      assert.equal(view.nextStep, 'PROPOSE_PLAN');
      assert.equal(readKnowledgeRegistry(d, p.id).claims.length, 0);
    }
  });

  test('clients cannot write a research run state or forge a research run through the generic agent-runs route', async () => {
    const db = openDatabase();
    const { call, owner, base } = setup(db, 'rr5@lab.org');
    const run = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Q?' } })).body.researchRun;
    const forged = await call('POST', `${base}/agent-runs/${run.researchRunId}/research-state`, { token: owner.token, body: { event: { seq: 1, type: 'HYPOTHESES_GENERATED', at: 'x', payload: { hypotheses: ['FACT'] } } } });
    assert.equal(forged.status, 409);
    assert.equal(forged.body.error, 'server_managed_run');
    const created = await call('POST', `${base}/agent-runs`, { token: owner.token, body: { goal: 'x', domain: RESEARCH_RUN_DOMAIN } });
    assert.equal(created.status, 409);
  });

  test('two concurrent proposal requests store one plan', async () => {
    const db = openDatabase();
    const provider = fakeProvider(PLAN, { delayMs: 30 });
    const { call, owner, project, base } = setup(db, 'rr6@lab.org', provider);
    const run = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Q?' } })).body.researchRun;
    const [r1, r2] = await Promise.all([1, 2].map(() => call('POST', `${base}/research-runs/${run.researchRunId}/proposals`, { token: owner.token })));
    assert.deepEqual([r1.status, r2.status].sort(), [200, 201]);
    const view = (await call('GET', `${base}/research-runs/${run.researchRunId}`, { token: owner.token })).body.researchRun;
    assert.equal(view.researchState.events.filter((e) => e.type === 'HYPOTHESES_GENERATED').length, 1);
    assert.equal(readKnowledgeRegistry(db, project.id).claims.length, 3);
  });
});

/* ---------------- real integration: the real server process, a real file database, restarts ---------------- */

function boot(dbPath, modelUrl) {
  const proc = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: {
      ...process.env, PORT: '0', GENESIS_DB_PATH: dbPath, ANTHROPIC_API_KEY: '',
      GENESIS_REASONING_PROVIDER: 'local', GENESIS_REASONING_BASE_URL: modelUrl, GENESIS_REASONING_MODEL: 'fake-local-model',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('server did not start in time')); }, 60000);
    let buf = '';
    proc.stderr.on('data', () => {});
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const started = buf.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((j) => j?.msg === 'started');
      if (!started) return;
      buf = '';
      clearTimeout(timer);
      const url = `http://127.0.0.1:${started.port}`;
      const api = async (method, p, { token, body } = {}) => {
        const res = await fetch(`${url}${p}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: res.status, body: await res.json() };
      };
      resolve({ api, kill: () => new Promise((done) => { proc.once('exit', done); proc.kill('SIGKILL'); }) });
    });
  });
}

describe('R1-a definition of done (real server, real database, restarts)', () => {
  test('question → run → kill → restart → it resumes → model proposes → kill → restart → plan intact, one run, PROPOSED only', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-r1a-'));
    const dbPath = path.join(dir, 'genesis.db');
    let modelCalls = 0;
    const model = createServer((req, res) => {
      modelCalls += 1;
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ model: 'fake-local-model', choices: [{ message: { content: JSON.stringify(PLAN) } }] }));
      });
    });
    await new Promise((r) => model.listen(0, '127.0.0.1', r));
    const modelUrl = `http://127.0.0.1:${model.address().port}/v1`;
    let server = null;
    try {
      server = await boot(dbPath, modelUrl);
      const owner = (await server.api('POST', '/api/auth/register', { body: { email: 'r1a@lab.org', password: 'password123' } })).body;
      const project = (await server.api('POST', '/api/projects', { token: owner.token, body: { name: 'R1-a' } })).body.project;
      const base = `/api/projects/${project.id}`;
      const question = 'Find a potential GLP-1R agonist and show me the evidence.';
      const started = await server.api('POST', `${base}/research-runs`, { token: owner.token, body: { question } });
      assert.equal(started.status, 201, JSON.stringify(started.body));
      const id = started.body.researchRun.researchRunId;

      // Restart before the model was asked: the run survives and knows its next step.
      await server.kill();
      server = await boot(dbPath, modelUrl);
      const resumed = (await server.api('GET', `${base}/research-runs/${id}`, { token: owner.token })).body.researchRun;
      assert.equal(resumed.question, question);
      assert.equal(resumed.nextStep, 'PROPOSE_PLAN');
      assert.equal(resumed.researchState.chain.ok, true);
      // Asking the same question after the restart does not open a second run.
      const dup = await server.api('POST', `${base}/research-runs`, { token: owner.token, body: { question } });
      assert.equal(dup.status, 200);
      assert.equal(dup.body.researchRun.researchRunId, id);

      const proposed = await server.api('POST', `${base}/research-runs/${id}/proposals`, { token: owner.token });
      assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
      assert.equal(modelCalls, 1);

      // Restart after the proposal: the plan, its provenance and the chain are intact; nothing became fact.
      await server.kill();
      server = await boot(dbPath, modelUrl);
      const after = (await server.api('GET', `${base}/research-runs/${id}`, { token: owner.token })).body.researchRun;
      assert.equal(after.researchState.chain.ok, true);
      assert.deepEqual(after.researchState.events.map((e) => e.type), ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED']);
      assert.equal(after.nextStep, 'AWAITING_EXECUTION');
      assert.ok(after.plan.hypotheses.every((h) => h.status === 'PROPOSED' && h.epistemicStatus === 'NOT_EVIDENCE' && h.researchRunId === id));
      assert.equal(after.plan.generatedBy.model, 'fake-local-model');
      const again = await server.api('POST', `${base}/research-runs/${id}/proposals`, { token: owner.token });
      assert.equal(again.status, 200);
      assert.equal(modelCalls, 1, 'resuming never asks the model twice');
      const list = (await server.api('GET', `${base}/research-runs`, { token: owner.token })).body.researchRuns;
      assert.equal(list.length, 1);
      const state = (await server.api('GET', `${base}/cognitive-state`, { token: owner.token })).body.cognitiveState;
      assert.ok(state.proposedClaims.every((c) => c.status === 'PROPOSED'));
      assert.equal(state.proposedClaims.filter((c) => c.researchRunId === id).length, 3);
    } finally {
      await server?.kill();
      await new Promise((r) => model.close(r));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
