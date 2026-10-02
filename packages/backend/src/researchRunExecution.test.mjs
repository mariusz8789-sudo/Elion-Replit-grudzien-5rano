import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, getScienceRun, listExperimentRecords, verifyExperimentRecordChain } from './store.mjs';
import { handleApi } from './api.mjs';
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { buildDecisionTrace } from './decisionTrace.mjs';
import { listProposals } from './knowledgeApi.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { deriveSurpriseItems, executeResearchExperiment, parsePredictions, VERDICT_SCOPE } from './researchRunExecution.mjs';
import { DEFAULT_RESEARCH_TOOLS } from './researchRunEngines.mjs';
import { createComputeAdmission } from './compute/computeAdmission.mjs';

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

async function planned(email, plan = PLAN) {
  const db = openDatabase();
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: fakeProvider(plan) });
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
  test('surprise rules are numeric, complete and frozen independently from falsification criteria', () => {
    const executor = { observables: { value: 'number', flag: 'boolean' } };
    const parsed = parsePredictions([
      { observable: 'value', operator: '<', value: 20, expectedValue: 10, surpriseTolerance: 2, critical: true },
      { observable: 'value', operator: '<', value: 20, expectedValue: 10 },
      { observable: 'flag', operator: '==', value: true, expectedValue: 1, surpriseTolerance: 1 },
      { observable: 'value', operator: '<', value: 20, expectedValue: 10, surpriseTolerance: 0 },
    ], executor);
    assert.equal(parsed.criteria.length, 1);
    assert.deepEqual(parsed.criteria[0].surpriseRule, { kind: 'ABSOLUTE_ERROR_EXCEEDS', expectedValue: 10, tolerance: 2 });
    assert.deepEqual(parsed.rejected.map((item) => item.reason), [
      'surprise_rule_requires_expected_value_and_tolerance',
      'surprise_rule_requires_numeric_observable',
      'surprise_tolerance_invalid',
    ]);
    assert.deepEqual(deriveSurpriseItems([{ ...parsed.criteria[0], observed: 12 }]), []);
    assert.deepEqual(deriveSurpriseItems([{ ...parsed.criteria[0], observed: 12.01 }]), [{
      criterionId: 'c0-value', observable: 'value', rule: parsed.criteria[0].surpriseRule,
      observedValue: 12.01, absoluteError: 2.01,
    }]);
  });

  test('a supported result prioritizes and executes its preregistered self-falsification challenge', needsRdkit, async () => {
    const challengePlan = {
      subProblems: [{ question: 'Can the bounded descriptor claim survive its null challenge?' }],
      hypotheses: [
        {
          claim: 'Aspirin has molecular weight below 200 Da.',
          claimType: 'PREDICTION',
          falsificationProposal: 'RDKit molecular weight is at least 200 Da.',
          experimentProposal: rdkitExperiment(ASPIRIN, [{ observable: 'molWt', operator: '<', value: 200, critical: true }]),
        },
        {
          claim: 'Null challenge: aspirin has molecular weight at least 200 Da.',
          claimType: 'PREDICTION',
          falsificationProposal: 'RDKit molecular weight is below 200 Da.',
          challengesHypothesisIndex: 0,
          experimentProposal: rdkitExperiment(ASPIRIN, [{ observable: 'molWt', operator: '>=', value: 200, critical: true }]),
        },
      ],
      nextActions: ['Require human review after the challenge.'],
    };
    const { call, owner, base, runId, plan } = await planned('rb-self-falsification@lab.org', challengePlan);
    const first = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.experiment.falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');
    assert.equal(plan.hypotheses[1].challengesHypothesisId, plan.hypotheses[0].hypothesisId);
    assert.deepEqual(first.body.experiment.next.proposal, {
      action: 'EXECUTE_NEXT_HYPOTHESIS',
      hypothesisId: plan.hypotheses[1].hypothesisId,
      engineId: 'rdkit',
      reason: 'SELF_FALSIFICATION_CHALLENGE_IN_PLAN',
      challengesHypothesisId: plan.hypotheses[0].hypothesisId,
    });
    assert.match(first.body.experiment.next.decisionTrace.summary, /SELF_FALSIFICATION_CHALLENGE_IN_PLAN/);
    assert.ok(first.body.experiment.next.decisionTrace.evidenceRefs.some((ref) => ref.id.startsWith('execution:')));

    const challenge = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(challenge.status, 201, JSON.stringify(challenge.body));
    assert.equal(challenge.body.experiment.frozen.hypothesisId, plan.hypotheses[1].hypothesisId);
    assert.equal(challenge.body.experiment.falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');
    assert.equal(challenge.body.experiment.next.replay.verdict, 'MATCH');
    assert.equal(challenge.body.researchRun.researchState.chain.ok, true);
  });

  test('authenticated ResearchRun execution uses the shared heavy-compute admission before mutating the run', needsRdkit, async () => {
    const { db, owner, base, runId } = await planned('rb-admission@lab.org');
    const admission = createComputeAdmission({ limit: 2, maxActive: 1 });
    const held = admission.acquire('another-principal');
    assert.equal(held.ok, true);

    const blocked = handleApi(db, {
      method: 'POST',
      pathname: `${base}/research-runs/${runId}/experiments`,
      token: owner.token,
      body: {},
      query: {},
      computeAdmission: admission,
    });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.error, 'compute_busy');
    assert.equal(handleApi(db, {
      method: 'GET', pathname: `${base}/research-runs/${runId}`, token: owner.token, body: null, query: {},
    }).body.researchRun.experiments.length, 0);
    held.release();
  });

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
    const trace = x.next.decisionTrace;
    assert.equal(trace.contractVersion, '1.0.0');
    assert.equal(trace.solverId, 'GENESIS_FIXED_RULE');
    assert.equal(trace.suggestedNextExperiment, plan.hypotheses[1].hypothesisId);
    assert.equal(trace.alternatives.find((alternative) => alternative.status === 'SELECTED').id, plan.hypotheses[1].hypothesisId);
    assert.ok(trace.evidenceRefs.some((reference) => reference.id === `execution:${e.scienceRunId}` && reference.contentHash === e.outputHash));
    assert.ok(trace.evidenceRefs.some((reference) => reference.id === `evidence:${x.evidence.evidenceProposalId}`));
    const { traceFingerprint, ...traceInput } = trace;
    assert.equal(buildDecisionTrace(traceInput).traceFingerprint, traceFingerprint);
    assert.equal(rr.nextStep, 'AWAITING_EXECUTION');

    // R1-c: the engine output is a canonical Scientific Run, replayed once by the existing verifier before
    // the next experiment is proposed. Replaying again on request adds a row and never rewrites the chain.
    const sr = getScienceRun(db, e.scienceRunId);
    assert.equal(sr.capability, 'molecular-descriptors');
    assert.equal(sr.projectId, project.id);
    assert.deepEqual(sr.outputs, e.output);
    assert.equal(x.next.replay.verdict, 'MATCH');
    assert.equal(x.next.replay.originalOutputHash, x.next.replay.replayOutputHash);
    const replayUrl = `${base}/research-runs/${runId}/experiments/${x.experimentId}/replays`;
    const replayAgain = await call('POST', replayUrl, { token: owner.token });
    assert.equal(replayAgain.status, 201, JSON.stringify(replayAgain.body));
    assert.equal(replayAgain.body.verification.verdict, 'MATCH');
    assert.deepEqual((await call('GET', replayUrl, { token: owner.token })).body.replays.map((r) => r.verdict), ['MATCH', 'MATCH']);
    assert.deepEqual((await call('GET', `${base}/research-runs/${runId}`, { token: owner.token })).body.researchRun.researchState.events.length, rr.researchState.events.length);

    const second = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(second.status, 201);
    assert.equal(second.body.experiment.falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');
    assert.equal(second.body.experiment.falsification.serverVerdict, 'FALSIFIED');
    assert.equal(second.body.experiment.falsification.criteria[0].observed, e.output.crippenLogP);

    // An input the engine rejects is recorded as such, and the frozen prediction stays unresolved.
    const third = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(third.status, 201);
    assert.equal(third.body.experiment.execution.status, 'ENGINE_REJECTED_INPUT');
    assert.equal(third.body.experiment.execution.scienceRunId, null, 'a rejected input stores no Scientific Run');
    assert.equal(third.body.experiment.next.replay.verdict, 'NOT_APPLICABLE');
    const nothing = await call('POST', `${base}/research-runs/${runId}/experiments/${third.body.experimentId}/replays`, { token: owner.token });
    assert.equal(nothing.status, 409);
    assert.equal(nothing.body.error, 'NOTHING_TO_REPLAY');
    assert.equal(third.body.experiment.falsification.verdict, 'INCONCLUSIVE');
    assert.equal(third.body.experiment.next.proposal.action, 'HUMAN_REVIEW');
    assert.equal(third.body.experiment.next.decisionTrace.outputClassification, 'REQUIRES_HUMAN_APPROVAL');
    assert.equal(third.body.experiment.next.decisionTrace.alternatives.find((alternative) => alternative.status === 'SELECTED').id, 'HUMAN_REVIEW');
    assert.equal(third.body.experiment.next.decisionTrace.blockedReason, third.body.experiment.next.proposal.reason);
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

  test('an engine output that does not replay stops the run at HUMAN_REVIEW', needsRdkit, async () => {
    const { db, project, runId } = await planned('rb5@lab.org');
    // An engine answer that the real engine does not reproduce, e.g. a corrupted or substituted result.
    const skewed = { ...DEFAULT_RESEARCH_TOOLS, executors: { rdkit: { ...DEFAULT_RESEARCH_TOOLS.executors.rdkit, run: (input) => {
      const r = DEFAULT_RESEARCH_TOOLS.executors.rdkit.run(input);
      return { ...r, output: { ...r.output, molWt: r.output.molWt + 1 } };
    } } } };
    const r = executeResearchExperiment(db, project.id, runId, { tools: skewed });
    assert.equal(r.ok, true);
    assert.equal(r.experiment.next.replay.verdict, 'DRIFT');
    assert.deepEqual([r.experiment.next.proposal.action, r.experiment.next.proposal.reason], ['HUMAN_REVIEW', 'REPLAY_DRIFT']);
    assert.equal(r.researchRun.nextStep, 'AWAITING_HUMAN_REVIEW');
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
      const bytBeforeRestart = (await server.api('GET', `${base}/cognitive-state`, { token: owner.token })).body.cognitiveState.byt;
      assert.equal(bytBeforeRestart.view, 'DERIVED_FROM_CANONICAL_STATE');
      assert.equal(bytBeforeRestart.predictionLedger.length, 1);
      assert.equal(bytBeforeRestart.predictionLedger[0].researchRunId, id);
      assert.equal(bytBeforeRestart.predictionLedger[0].replay.verdict, 'MATCH');
      assert.equal(bytBeforeRestart.necropolis.length, 0);

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
      const bytAfterRestart = (await server.api('GET', `${base}/cognitive-state`, { token: owner.token })).body.cognitiveState.byt;
      assert.deepEqual(bytAfterRestart.predictionLedger, bytBeforeRestart.predictionLedger);
      assert.deepEqual(bytAfterRestart.calibration, bytBeforeRestart.calibration);
      assert.deepEqual(bytAfterRestart.necropolis, bytBeforeRestart.necropolis);
      assert.equal(bytAfterRestart.continuity.brokenRuns, 0);
      const proposals = (await server.api('GET', '/api/knowledge/proposals')).body.proposals;
      assert.equal(proposals.filter((p) => p.proposalId === x.evidence.evidenceProposalId && p.status === 'pending').length, 1);
      // R1-c after the restart: the replay recorded in the chain still stands, a fresh replay of the
      // stored run matches, and a person publishes the evidence through the existing ledger route.
      assert.equal(after.experiments[0].next.replay.verdict, 'MATCH');
      const replayed = await server.api('POST', `${base}/research-runs/${id}/experiments/${x.experimentId}/replays`, { token: owner.token });
      assert.equal(replayed.status, 201, JSON.stringify(replayed.body));
      assert.equal(replayed.body.verification.verdict, 'MATCH');
      assert.equal(replayed.body.verification.replayOutputHash, after.experiments[0].next.replay.originalOutputHash);
      const published = await server.api('POST', `/api/knowledge/proposals/${x.evidence.evidenceProposalId}/publish`, { token: owner.token });
      assert.equal(published.status, 200, JSON.stringify(published.body));
      const same = await server.api('POST', `${base}/research-runs/${id}/experiments`, { token: owner.token, body: { hypothesisId: x.frozen.hypothesisId } });
      assert.equal(same.status, 200);
      assert.equal(same.body.status, 'ALREADY_EXECUTED');
      const next = await server.api('POST', `${base}/research-runs/${id}/experiments`, { token: owner.token });
      assert.equal(next.status, 201);
      assert.equal(next.body.experiment.falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');
      const bytWithFalsification = (await server.api('GET', `${base}/cognitive-state`, { token: owner.token })).body.cognitiveState.byt;
      assert.equal(bytWithFalsification.predictionLedger.length, 2);
      assert.equal(bytWithFalsification.necropolis.length, 1);
      assert.equal(bytWithFalsification.necropolis[0].hypothesisId, next.body.experiment.frozen.hypothesisId);
      assert.equal(bytWithFalsification.necropolis[0].reopening, 'REQUIRES_NEW_EVIDENCE_AND_HUMAN_APPROVAL');
    } finally {
      await server?.kill();
      await new Promise((r) => model.close(r));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
