import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { handleApi } from './api.mjs';
import { buildSandboxExecutionPlan } from './compute/scientificSandboxContract.mjs';
import { openDatabase } from './store.mjs';

const IMAGE = 'registry.example/genesis-scientific-python@sha256:' + 'b'.repeat(64);
const SOURCE = 'import json\nvalues = [1, 2, 3, 4]\nprint(json.dumps({"mean": sum(values) / len(values), "n": len(values)}, sort_keys=True))';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function provider(text = JSON.stringify({
  source: SOURCE,
  methodSummary: 'Compute a bounded arithmetic mean and sample count.',
  expectedOutputKeys: ['mean', 'n'],
})) {
  return {
    providerId: 'PRIVATE_LOCAL',
    model: 'fixture-code-model',
    configured: true,
    reason: null,
    calls: 0,
    describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture-code-model', configured: true }),
    async complete() {
      this.calls += 1;
      return { model: this.model, text };
    },
  };
}

function sandbox(outputs = [{ mean: 2.5, n: 4 }]) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async execute(request, options) {
      const plan = buildSandboxExecutionPlan(request, options);
      assert.equal(plan.ok, true);
      const output = outputs[Math.min(calls, outputs.length - 1)];
      calls += 1;
      const stdout = JSON.stringify(output) + '\n';
      const stderr = '';
      return {
        ok: true,
        status: 'SUCCESS',
        sourceHash: plan.plan.sourceHash,
        environmentFingerprint: plan.plan.environmentFingerprint,
        stdout,
        stderr,
        stdoutHash: sha256(stdout),
        stderrHash: sha256(stderr),
      };
    },
  };
}

const computeAdmission = { acquire: () => ({ ok: true, release() {} }) };

function setup(db, email, extras = {}) {
  const call = (method, pathname, body, token) => handleApi(db, {
    method,
    pathname,
    body,
    token,
    query: {},
    computeAdmission,
    scientificSandboxImage: IMAGE,
    ...extras,
  });
  const owner = call('POST', '/api/auth/register', { email, password: 'password123' }).body;
  const project = call('POST', '/api/projects', { name: 'Generated analysis' }, owner.token).body.project;
  return { call, owner, project, base: `/api/projects/${project.id}` };
}

describe('generated scientific analysis in canonical ResearchRun', () => {
  test('fails before a paid model call when no attested sandbox is configured', async () => {
    const db = openDatabase();
    const reasoningProvider = provider();
    const { call, owner, base } = setup(db, 'generated-blocked@lab.org', { reasoningProvider, scientificSandboxPort: null });
    const started = await call('POST', `${base}/research-runs`, { question: 'Calculate a descriptive statistic.' }, owner.token);
    const runId = started.body.researchRun.researchRunId;
    const response = await call('POST', `${base}/research-runs/${runId}/generated-analyses`, { objective: 'Compute the mean.' }, owner.token);
    assert.equal(response.status, 503);
    assert.equal(response.body.failureCode, 'CONTAINER_SANDBOX_BACKEND_NOT_CONFIGURED');
    assert.equal(reasoningProvider.calls, 0);
    const run = await call('GET', `${base}/research-runs/${runId}`, null, owner.token);
    assert.deepEqual(run.body.researchRun.researchState.events.map((event) => event.type), ['PROBLEM_FORMALIZED']);
    db.close();
  });

  test('NL objective -> frozen generated Python -> sandbox result -> provenance -> Replay survives restart', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-generated-analysis-'));
    const file = path.join(dir, 'genesis.db');
    const reasoningProvider = provider();
    const scientificSandboxPort = sandbox();
    try {
      let db = openDatabase(file);
      let context = setup(db, 'generated-e2e@lab.org', { reasoningProvider, scientificSandboxPort });
      const started = await context.call('POST', `${context.base}/research-runs`, { question: 'What is the mean of the bounded sample?' }, context.owner.token);
      const runId = started.body.researchRun.researchRunId;
      const route = `${context.base}/research-runs/${runId}/generated-analyses`;
      const generated = await context.call('POST', route, { objective: 'Compute mean and count for [1,2,3,4].' }, context.owner.token);
      assert.equal(generated.status, 201, JSON.stringify(generated.body));
      assert.equal(generated.body.execution.status, 'SUCCESS');
      assert.deepEqual(generated.body.execution.output, { mean: 2.5, n: 4 });
      assert.equal(generated.body.execution.epistemicStatus, 'NOT_EVIDENCE');
      assert.equal(generated.body.execution.evidenceEligibility, 'REQUIRES_SEPARATE_REVIEW');
      assert.equal(reasoningProvider.calls, 1);
      assert.equal(scientificSandboxPort.calls, 1);
      assert.deepEqual(generated.body.researchRun.researchState.events.map((event) => event.type), [
        'PROBLEM_FORMALIZED', 'GENERATED_ANALYSIS_PROPOSED', 'GENERATED_ANALYSIS_EXECUTED',
      ]);
      assert.equal(generated.body.researchRun.researchState.chain.ok, true);
      const analysisId = generated.body.execution.analysisId;

      const duplicate = await context.call('POST', route, { objective: 'Compute mean and count for [1,2,3,4].' }, context.owner.token);
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.deduped, true);
      assert.equal(reasoningProvider.calls, 1);
      assert.equal(scientificSandboxPort.calls, 1);
      db.close();

      db = openDatabase(file);
      context = {
        ...context,
        call: (method, pathname, body, token) => handleApi(db, {
          method, pathname, body, token, query: {}, computeAdmission, reasoningProvider,
          scientificSandboxPort, scientificSandboxImage: IMAGE,
        }),
      };
      const recovered = await context.call('GET', route, null, context.owner.token);
      assert.equal(recovered.status, 200);
      assert.equal(recovered.body.generatedAnalyses.length, 1);
      assert.equal(recovered.body.generatedAnalyses[0].execution.outputHash, generated.body.execution.outputHash);
      const replay = await context.call('POST', `${route}/${analysisId}/replay`, {}, context.owner.token);
      assert.equal(replay.status, 201, JSON.stringify(replay.body));
      assert.equal(replay.body.verdict, 'MATCH');
      assert.equal(scientificSandboxPort.calls, 2);
      assert.equal(reasoningProvider.calls, 1, 'Replay reuses frozen source and never calls the model.');
      assert.equal(replay.body.researchRun.researchState.chain.ok, true);
      assert.deepEqual(replay.body.researchRun.researchState.events.map((event) => event.type), [
        'PROBLEM_FORMALIZED', 'GENERATED_ANALYSIS_PROPOSED', 'GENERATED_ANALYSIS_EXECUTED', 'GENERATED_ANALYSIS_REPLAYED',
      ]);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Replay records DRIFT instead of smoothing a changed output', async () => {
    const db = openDatabase();
    const reasoningProvider = provider();
    const scientificSandboxPort = sandbox([{ mean: 2.5, n: 4 }, { mean: 3, n: 4 }]);
    const { call, owner, base } = setup(db, 'generated-drift@lab.org', { reasoningProvider, scientificSandboxPort });
    const started = await call('POST', `${base}/research-runs`, { question: 'Can the output drift?' }, owner.token);
    const runId = started.body.researchRun.researchRunId;
    const route = `${base}/research-runs/${runId}/generated-analyses`;
    const generated = await call('POST', route, { objective: 'Compute the mean.' }, owner.token);
    const replay = await call('POST', `${route}/${generated.body.execution.analysisId}/replay`, {}, owner.token);
    assert.equal(replay.status, 201);
    assert.equal(replay.body.verdict, 'DRIFT');
    assert.notEqual(replay.body.replay.outputHash, generated.body.execution.outputHash);
    db.close();
  });

  test('malformed provider output writes no generated-analysis event', async () => {
    const db = openDatabase();
    const reasoningProvider = provider('{"source":"print(1)"}');
    const { call, owner, base } = setup(db, 'generated-malformed@lab.org', { reasoningProvider, scientificSandboxPort: sandbox() });
    const started = await call('POST', `${base}/research-runs`, { question: 'Reject malformed generated code.' }, owner.token);
    const runId = started.body.researchRun.researchRunId;
    const response = await call('POST', `${base}/research-runs/${runId}/generated-analyses`, {}, owner.token);
    assert.equal(response.status, 422);
    const run = await call('GET', `${base}/research-runs/${runId}`, null, owner.token);
    assert.deepEqual(run.body.researchRun.researchState.events.map((event) => event.type), ['PROBLEM_FORMALIZED']);
    db.close();
  });

  test('output schema mismatch is a persisted failure, never a plausible substitute', async () => {
    const db = openDatabase();
    const { call, owner, base } = setup(db, 'generated-schema@lab.org', {
      reasoningProvider: provider(),
      scientificSandboxPort: sandbox([{ average: 2.5, n: 4 }]),
    });
    const started = await call('POST', `${base}/research-runs`, { question: 'Reject an output contract mismatch.' }, owner.token);
    const runId = started.body.researchRun.researchRunId;
    const response = await call('POST', `${base}/research-runs/${runId}/generated-analyses`, {}, owner.token);
    assert.equal(response.status, 422);
    assert.equal(response.body.error, 'FAILED');
    assert.equal(response.body.failureCode, 'SANDBOX_OUTPUT_SCHEMA_MISMATCH');
    const listed = await call('GET', `${base}/research-runs/${runId}/generated-analyses`, null, owner.token);
    assert.equal(listed.body.generatedAnalyses[0].execution.status, 'FAILED');
    assert.equal(listed.body.generatedAnalyses[0].execution.output, undefined);
    db.close();
  });

  test('a failed analysis stays deduped until the user explicitly retries; the failure stays in the chain', async () => {
    const db = openDatabase();
    const { call, owner, base } = setup(db, 'generated-retry@lab.org', {
      reasoningProvider: provider(),
      scientificSandboxPort: sandbox([{ average: 2.5, n: 4 }, { mean: 2.5, n: 4 }]),
    });
    const started = await call('POST', `${base}/research-runs`, { question: 'Retry a failed generated analysis.' }, owner.token);
    const runId = started.body.researchRun.researchRunId;
    const route = `${base}/research-runs/${runId}/generated-analyses`;
    const first = await call('POST', route, { objective: 'Compute the mean.' }, owner.token);
    assert.equal(first.status, 422);
    const again = await call('POST', route, { objective: 'Compute the mean.' }, owner.token);
    assert.equal(again.status, 422, 'no retry without an explicit request');
    const retried = await call('POST', route, { objective: 'Compute the mean.', retry: true }, owner.token);
    assert.equal(retried.status, 201);
    assert.equal(retried.body.execution.status, 'SUCCESS');
    const listed = await call('GET', route, null, owner.token);
    assert.deepEqual(listed.body.generatedAnalyses.map((a) => a.execution.status), ['FAILED', 'SUCCESS']);
    const afterSuccess = await call('POST', route, { objective: 'Compute the mean.', retry: true }, owner.token);
    assert.equal(afterSuccess.body.deduped, true, 'a successful analysis is never re-run by retry');
    db.close();
  });

  test('a pause during sandbox execution rejects the late result and keeps the canonical audit trail', async () => {
    const db = openDatabase();
    let release;
    let signalStarted;
    const gate = new Promise((resolve) => { release = resolve; });
    const startedExecution = new Promise((resolve) => { signalStarted = resolve; });
    const delayedSandbox = {
      async execute(request, options) {
        const plan = buildSandboxExecutionPlan(request, options);
        signalStarted();
        await gate;
        const stdout = '{"mean":2.5,"n":4}\n';
        return {
          ok: true,
          status: 'SUCCESS',
          sourceHash: plan.plan.sourceHash,
          environmentFingerprint: plan.plan.environmentFingerprint,
          stdout,
          stderr: '',
          stdoutHash: sha256(stdout),
          stderrHash: sha256(''),
        };
      },
    };
    const { call, owner, base } = setup(db, 'generated-pause@lab.org', {
      reasoningProvider: provider(),
      scientificSandboxPort: delayedSandbox,
    });
    const started = await call('POST', `${base}/research-runs`, { question: 'Reject a late generated result.' }, owner.token);
    const runId = started.body.researchRun.researchRunId;
    const pending = call('POST', `${base}/research-runs/${runId}/generated-analyses`, {}, owner.token);
    await startedExecution;
    const paused = await call('POST', `${base}/research-runs/${runId}/pause`, { reason: 'Operator pause' }, owner.token);
    assert.equal(paused.status, 200);
    release();
    const late = await pending;
    assert.equal(late.status, 409);
    assert.equal(late.body.error, 'RUN_NOT_EXECUTABLE');
    const recovered = await call('GET', `${base}/research-runs/${runId}`, null, owner.token);
    assert.deepEqual(recovered.body.researchRun.researchState.events.map((event) => event.type), [
      'PROBLEM_FORMALIZED', 'GENERATED_ANALYSIS_PROPOSED', 'RUN_CONTROLLED',
    ]);
    assert.equal(recovered.body.researchRun.researchState.chain.ok, true);
    db.close();
  });
});
