import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, listExperimentRecords, verifyExperimentRecordChain } from './store.mjs';
import { handleApi } from './api.mjs';
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { listProposals } from './knowledgeApi.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { executeResearchExperiment, VERDICT_SCOPE } from './researchRunExecution.mjs';
import { DEFAULT_RESEARCH_TOOLS } from './researchRunEngines.mjs';

/**
 * R1-b — one proposed experiment goes plan → frozen prediction → real engine → falsification →
 * evidence PROPOSAL → next experiment, in the same ResearchRun chain; a missing engine is BLOCKED
 * with nothing substituted; a restart at any point neither loses nor repeats the experiment.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const RDKIT = rdkitDetect();
const needsRdkit = RDKIT.available ? {} : { skip: `RDKit runtime unavailable: ${RDKIT.reason}` };

const rdkitExperiment = (smiles, predictions) => ({ kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'RDKit descriptors', parameters: { smiles, predictions } });

/** What a model might answer. The predictions are frozen before RDKit runs. */
const PLAN = {
  subProblems: [{ question: 'Does aspirin fall inside simple oral drug-likeness rules?' }],
  hypotheses: [
    {
      claim: 'Aspirin passes Lipinski and weighs under 200 Da.', claimType: 'PREDICTION',
      falsificationProposal: 'RDKit gives molWt >= 200 or a Lipinski failure.',
      experimentProposal: rdkitExperiment(ASPIRIN, [
        { observable: 'molWt', operator: '<', value: 200, critical: true },
        { observable: 'lipinskiPass', operator: '==', value: true, critical: true },
        { observable: 'madeUpField', operator: '>', value: 1 },
      ]),
    },
    {
      claim: 'Aspirin is lipophilic (Crippen logP above 3).', claimType: 'HYPOTHESIS',
      falsificationProposal: 'RDKit Crippen logP at or below 3.',
      experimentProposal: rdkitExperiment(ASPIRIN, [{ observable: 'crippenLogP', operator: '>', value: 3, critical: true }]),
    },
    {
      claim: 'Aspirin inhibits COX-1 in cells.', claimType: 'HYPOTHESIS', falsificationProposal: 'No inhibition in a cell assay.',
      experimentProposal: { kind: 'WET_LAB', description: 'Cell assay' },
    },
    {
      claim: 'A broken SMILES still has a small molecular weight.', claimType: 'HYPOTHESIS', falsificationProposal: 'molWt >= 100.',
      experimentProposal: rdkitExperiment('C1CC', [{ observable: 'molWt', operator: '<', value: 100, critical: true }]),
    },
  ],
  nextActions: ['Compare with ibuprofen'],
};

function fakeProvider(answer) {
  return {
    providerId: 'PRIVATE_LOCAL', model: 'fake-model', configured: true, reason: null,
    describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fake-model', configured: true, status: 'CONFIGURED', reason: null }),
    async complete() { return { text: JSON.stringify(answer), model: 'fake-model' }; },
  };
}

async function planned(email) {
  const db = openDatabase();
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: fakeProvider(PLAN) });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: email } }).body.project;
  const base = `/api/projects/${project.id}`;
  const run = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Is aspirin drug-like?' } })).body.researchRun;
  const proposed = await call('POST', `${base}/research-runs/${run.researchRunId}/proposals`, { token: owner.token });
  assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
  return { db, call, owner, project, base, runId: run.researchRunId, plan: proposed.body.researchRun.plan };
}

const types = (rr) => rr.researchState.events.map((e) => e.type);

describe('R1-b research run execution', () => {
  test('plan → frozen prediction → RDKit → falsification → evidence PROPOSED → next experiment, three times', needsRdkit, async () => {
    const { db, call, owner, project, base, runId, plan } = await planned('rb1@lab.org');
    assert.deepEqual(plan.hypotheses.map((h) => h.experimentProposal.decision), ['PROPOSED', 'PROPOSED', 'HUMAN_APPROVAL_REQUIRED', 'PROPOSED']);

    const first = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const rr = first.body.researchRun;
    assert.equal(rr.researchState.chain.ok, true);
    assert.deepEqual(types(rr), ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED', 'PREDICTIONS_FROZEN', 'EXPERIMENT_HANDOFF', 'SELF_FALSIFICATION', 'EVIDENCE_UPDATE', 'NEXT_EXPERIMENT']);
    const x = first.body.experiment;
    assert.equal(x.frozen.hypothesisId, plan.hypotheses[0].hypothesisId);
    assert.deepEqual(x.frozen.criteria.map((c) => c.id), ['c0-molWt', 'c1-lipinskiPass']);
    assert.deepEqual(x.frozen.rejectedPredictions, [{ index: 2, reason: 'unknown_observable:madeUpField' }]);

    // The preregistration is in scientific memory, written before the result, and the chain verifies.
    const records = listExperimentRecords(db, x.frozen.preregistrationKey);
    assert.deepEqual(records.map((r) => r.kind), ['PREREGISTRATION', 'SESSION']);
    assert.equal(records[0].id, x.frozen.preregistrationRecordId);
    assert.equal(records[0].fingerprint, x.frozen.predictionFingerprint);
    assert.equal(records[0].contentHash, x.frozen.preregistrationFingerprint);
    assert.equal(x.frozen.protocolId, x.frozen.preregistrationKey);
    assert.equal(records[0].projectId, project.id);
    assert.ok(verifyExperimentRecordChain(db, x.frozen.preregistrationKey).ok);
    const frozenAt = rr.researchState.events.find((e) => e.type === 'PREDICTIONS_FROZEN').seq;
    const executedAt = rr.researchState.events.find((e) => e.type === 'EXPERIMENT_HANDOFF').seq;
    assert.ok(frozenAt < executedAt, 'the prediction is frozen before the engine runs');

    // The execution record carries everything the approved minimum asks for.
    const e = x.execution;
    assert.equal(e.researchRunId, runId);
    assert.equal(e.predictionFingerprint, x.frozen.predictionFingerprint);
    assert.equal(e.preregistrationRecordId, x.frozen.preregistrationRecordId);
    assert.equal(e.preregistrationFingerprint, x.frozen.preregistrationFingerprint);
    assert.equal(e.protocolId, x.frozen.protocolId);
    assert.equal(e.experimentId, x.experimentId);
    assert.ok(Date.parse(e.startedAt) <= Date.parse(e.finishedAt));
    assert.equal(e.engine.engineId, 'rdkit');
    assert.equal(e.engine.version, RDKIT.version);
    assert.match(e.engine.toolchainFingerprint, /^[0-9a-f]{16}$/);
    assert.equal(e.inputHash, sha256Hex(canonicalJson({ smiles: ASPIRIN })));
    assert.equal(e.outputHash, sha256Hex(canonicalJson(e.output)));
    assert.equal(e.status, 'EXECUTED');
    assert.equal(e.output.molecularFormula, 'C9H8O4');
    assert.ok(e.environment.node && e.environment.toolchain);

    // Falsification: server-derived, sealed, and scoped to this protocol only.
    const f = x.falsification;
    assert.equal(f.verdict, 'SUPPORTED_WITHIN_PROTOCOL');
    assert.equal(f.serverVerdict, 'SUPPORTED');
    assert.equal(f.preregCheck, 'MATCH');
    assert.equal(f.verdictCheck, 'MATCH');
    assert.equal(f.sealRecordId, records[1].id);
    assert.equal(f.scope, VERDICT_SCOPE);
    assert.deepEqual(f.criteria.map((c) => [c.id, c.status]), [['c0-molWt', 'MET'], ['c1-lipinskiPass', 'MET']]);

    // Evidence is a PROPOSAL in the canonical ledger; nobody published it.
    assert.equal(x.evidence.status, 'PROPOSED');
    assert.equal(x.evidence.publication, 'REQUIRES_HUMAN_APPROVAL');
    const ledger = listProposals().proposals.find((p) => p.proposalId === x.evidence.evidenceProposalId);
    assert.equal(ledger.status, 'pending');
    assert.equal(ledger.sourceUrl, `genesis://research-run/${runId}/experiment/${x.experimentId}`);
    assert.notEqual(ledger.recordStatus, 'verified');

    // The next experiment comes from a fixed rule over the plan.
    assert.equal(x.next.decidedBy, 'GENESIS_FIXED_RULE');
    assert.deepEqual([x.next.proposal.action, x.next.proposal.hypothesisId], ['EXECUTE_NEXT_HYPOTHESIS', plan.hypotheses[1].hypothesisId]);
    assert.equal(rr.nextStep, 'AWAITING_EXECUTION');

    const second = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(second.status, 201);
    assert.equal(second.body.experiment.falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');
    assert.equal(second.body.experiment.falsification.serverVerdict, 'FALSIFIED');
    assert.equal(second.body.experiment.falsification.criteria[0].observed, e.output.crippenLogP);

    // An input the engine rejects is recorded as such, and the frozen prediction stays unresolved.
    const third = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(third.status, 201);
    assert.equal(third.body.experiment.execution.status, 'ENGINE_REJECTED_INPUT');
    assert.equal(third.body.experiment.falsification.verdict, 'INCONCLUSIVE');
    assert.equal(third.body.experiment.next.proposal.action, 'HUMAN_REVIEW');
    assert.equal(third.body.researchRun.nextStep, 'AWAITING_HUMAN_REVIEW');

    const none = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(none.status, 409);
    assert.equal(none.body.error, 'NO_EXECUTABLE_EXPERIMENT');
    assert.deepEqual(none.body.skipped.map((s) => s.reason), ['EXPERIMENT_HUMAN_APPROVAL_REQUIRED']);
    const again = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: { hypothesisId: plan.hypotheses[0].hypothesisId } });
    assert.equal(again.status, 200);
    assert.equal(again.body.status, 'ALREADY_EXECUTED');
    const final = (await call('GET', `${base}/research-runs/${runId}`, { token: owner.token })).body.researchRun;
    assert.equal(final.experiments.length, 3);
    assert.equal(final.researchState.chain.ok, true);
  });

  test('engine not available now: BLOCKED, nothing written, nothing substituted', needsRdkit, async () => {
    const { db, project, runId } = await planned('rb2@lab.org');
    const down = { ...DEFAULT_RESEARCH_TOOLS, engineStatus: () => ({ available: false, reason: 'BLOCKED_BY_RUNTIME: test' }) };
    const r = executeResearchExperiment(db, project.id, runId, { tools: down });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.engineId, 'rdkit');
    const rows = db.prepare('SELECT COUNT(*) AS n FROM experiment_records WHERE project_id = ?').get(project.id).n;
    assert.equal(rows, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_run_steps WHERE agent_run_id = ?").get(runId).n, 2);

    // An engine without a research-run adapter is BLOCKED too, never swapped for another.
    const noAdapter = { ...DEFAULT_RESEARCH_TOOLS, executors: {} };
    const r2 = executeResearchExperiment(db, project.id, runId, { tools: noAdapter });
    assert.equal(r2.status, 'NO_EXECUTABLE_EXPERIMENT');
    assert.ok(r2.skipped.some((s) => s.reason === 'NO_RESEARCH_RUN_ADAPTER'));
  });

  test('a crash after the freeze, an engine outage and a failed evidence proposal: the same experiment resumes once', needsRdkit, async () => {
    const { db, project, runId } = await planned('rb3@lab.org');
    let engineRuns = 0;
    const crashing = { ...DEFAULT_RESEARCH_TOOLS, executors: { rdkit: { ...DEFAULT_RESEARCH_TOOLS.executors.rdkit, run: () => { throw new Error('process killed'); } } } };
    assert.throws(() => executeResearchExperiment(db, project.id, runId, { tools: crashing }), /process killed/);
    const afterCrash = executeResearchExperiment(db, project.id, runId, { tools: { ...DEFAULT_RESEARCH_TOOLS, engineStatus: () => ({ available: false, reason: 'down' }) } });
    assert.equal(afterCrash.status, 'BLOCKED', 'the frozen experiment waits for its own engine');
    // A worker that times out or dies mid-run is an infrastructure fault, not an INCONCLUSIVE result.
    const failing = { ...DEFAULT_RESEARCH_TOOLS, executors: { rdkit: { ...DEFAULT_RESEARCH_TOOLS.executors.rdkit, run: () => ({ ok: false, status: 'BLOCKED', reason: 'ENGINE_FAILED: execution_failed' }) } } };
    const timedOut = executeResearchExperiment(db, project.id, runId, { tools: failing });
    assert.equal(timedOut.status, 'BLOCKED');
    assert.match(timedOut.reason, /ENGINE_FAILED/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM experiment_records WHERE project_id = ? AND kind = 'SESSION'").get(project.id).n, 0, 'nothing sealed');

    const counting = { ...DEFAULT_RESEARCH_TOOLS, executors: { rdkit: { ...DEFAULT_RESEARCH_TOOLS.executors.rdkit, run: (input) => { engineRuns += 1; return DEFAULT_RESEARCH_TOOLS.executors.rdkit.run(input); } } } };
    const failedEvidence = executeResearchExperiment(db, project.id, runId, { tools: counting, proposeEvidence: () => ({ ok: false, error: 'ledger_unavailable' }) });
    assert.equal(failedEvidence.status, 'EVIDENCE_PROPOSAL_FAILED');
    const resumed = executeResearchExperiment(db, project.id, runId, { tools: counting });
    assert.equal(resumed.ok, true);
    assert.equal(engineRuns, 1, 'the engine ran exactly once');
    const rr = resumed.researchRun;
    assert.deepEqual(types(rr).slice(2), ['PREDICTIONS_FROZEN', 'EXPERIMENT_HANDOFF', 'SELF_FALSIFICATION', 'EVIDENCE_UPDATE', 'NEXT_EXPERIMENT']);
    assert.deepEqual(listExperimentRecords(db, rr.experiments[0].frozen.preregistrationKey).map((r) => r.kind), ['PREREGISTRATION', 'SESSION']);
    assert.equal(rr.experiments.length, 1);
  });

  test('an experiment in progress cannot be overtaken, and another project cannot execute it', needsRdkit, async () => {
    const { db, call, project, base, runId, plan } = await planned('rb4@lab.org');
    const crashing = { ...DEFAULT_RESEARCH_TOOLS, executors: { rdkit: { ...DEFAULT_RESEARCH_TOOLS.executors.rdkit, run: () => { throw new Error('killed'); } } } };
    assert.throws(() => executeResearchExperiment(db, project.id, runId, { tools: crashing }));
    const other = executeResearchExperiment(db, project.id, runId, { hypothesisId: plan.hypotheses[1].hypothesisId });
    assert.equal(other.status, 'EXPERIMENT_IN_PROGRESS');
    const stranger = call('POST', '/api/auth/register', { body: { email: 'rb4x@lab.org', password: 'password123' } }).body;
    const theirs = call('POST', '/api/projects', { token: stranger.token, body: { name: 'x' } }).body.project;
    assert.equal((await call('POST', `/api/projects/${theirs.id}/research-runs/${runId}/experiments`, { token: stranger.token })).status, 404);
    assert.notEqual((await call('POST', `${base}/research-runs/${runId}/experiments`, { token: stranger.token })).status, 201);
  });
});

/* ---------------- real integration: real server, real SQLite file, real RDKit, restarts ---------------- */

function boot(dbPath, modelUrl, extraEnv = {}) {
  const proc = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: {
      ...process.env, PORT: '0', GENESIS_DB_PATH: dbPath, ANTHROPIC_API_KEY: '',
      GENESIS_REASONING_PROVIDER: 'local', GENESIS_REASONING_BASE_URL: modelUrl, GENESIS_REASONING_MODEL: 'fake-local-model',
      ...extraEnv,
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

describe('R1-b definition of done (real server, real database, real RDKit, restarts)', () => {
  test('plan → restart without RDKit → BLOCKED → restart with RDKit → executed → restart → intact, no duplicate', needsRdkit, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-r1b-'));
    const dbPath = path.join(dir, 'genesis.db');
    const model = createServer((req, res) => {
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
      const owner = (await server.api('POST', '/api/auth/register', { body: { email: 'r1b@lab.org', password: 'password123' } })).body;
      const project = (await server.api('POST', '/api/projects', { token: owner.token, body: { name: 'R1-b' } })).body.project;
      const base = `/api/projects/${project.id}`;
      const id = (await server.api('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Is aspirin drug-like?' } })).body.researchRun.researchRunId;
      assert.equal((await server.api('POST', `${base}/research-runs/${id}/proposals`, { token: owner.token })).status, 201);

      // The runtime is gone: BLOCKED, and the run is exactly as it was.
      await server.kill();
      server = await boot(dbPath, modelUrl, { GENESIS_RDKIT_PYTHON: path.join(dir, 'no-such-python') });
      const blocked = await server.api('POST', `${base}/research-runs/${id}/experiments`, { token: owner.token });
      assert.equal(blocked.status, 503, JSON.stringify(blocked.body));
      assert.equal(blocked.body.error, 'BLOCKED');
      assert.equal(blocked.body.engineId, 'rdkit');
      const untouched = (await server.api('GET', `${base}/research-runs/${id}`, { token: owner.token })).body.researchRun;
      assert.deepEqual(types(untouched), ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED']);

      // RDKit is back: the experiment runs for real.
      await server.kill();
      server = await boot(dbPath, modelUrl);
      const executed = await server.api('POST', `${base}/research-runs/${id}/experiments`, { token: owner.token });
      assert.equal(executed.status, 201, JSON.stringify(executed.body));
      const x = executed.body.experiment;
      assert.equal(x.falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');
      assert.equal(x.execution.engine.version, RDKIT.version);

      // After a restart: the recovered run is identical, event for event, and says what comes next.
      const before = (await server.api('GET', `${base}/research-runs/${id}`, { token: owner.token })).body.researchRun;
      await server.kill();
      server = await boot(dbPath, modelUrl);
      const after = (await server.api('GET', `${base}/research-runs/${id}`, { token: owner.token })).body.researchRun;
      assert.deepEqual(after.researchState, before.researchState);
      assert.deepEqual(after.experiments, before.experiments);
      assert.equal(after.nextStep, before.nextStep);
      assert.equal(after.researchState.chain.ok, true);
      assert.equal(after.experiments.length, 1);
      assert.equal(after.experiments[0].execution.outputHash, x.execution.outputHash);
      assert.equal(after.nextStep, 'AWAITING_EXECUTION');
      const proposals = (await server.api('GET', '/api/knowledge/proposals')).body.proposals;
      assert.equal(proposals.filter((p) => p.proposalId === x.evidence.evidenceProposalId && p.status === 'pending').length, 1);
      const same = await server.api('POST', `${base}/research-runs/${id}/experiments`, { token: owner.token, body: { hypothesisId: x.frozen.hypothesisId } });
      assert.equal(same.status, 200);
      assert.equal(same.body.status, 'ALREADY_EXECUTED');
      const next = await server.api('POST', `${base}/research-runs/${id}/experiments`, { token: owner.token });
      assert.equal(next.status, 201);
      assert.equal(next.body.experiment.falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');
    } finally {
      await server?.kill();
      await new Promise((r) => model.close(r));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
