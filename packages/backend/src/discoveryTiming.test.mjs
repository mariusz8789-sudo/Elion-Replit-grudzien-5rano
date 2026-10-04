import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, CURRENT_SCHEMA_VERSION } from './store.mjs';
import { handleApi } from './api.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';
import {
  campaignCycleTiming, campaignsOfScope, closeStage, COMPETITOR_PROVENANCE_FIELDS, COUNT_KINDS,
  DISCOVERY_STAGES, discoveryTimingReport, FULL_CYCLE_STAGE, genesisSpeedup, getCompetitorBaseline,
  linkScopeToCampaign, listCompetitorBaselines, MEMBER_KINDS, openStage, recordCompetitorBaseline,
  recordCount, recordMember, recordSpan, SPAN_KINDS, SPEEDUP_GREEN_THRESHOLD, SPEEDUP_STATUS,
  stageTimings, taskScopeHash,
} from './discoveryTiming.mjs';

/**
 * TIME-TO-DISCOVERY — the owner's KPI is "2x faster than a comparable competitor workflow", i.e.
 * Genesis needs at most 50% of the competitor time at the same task scope and a comparable evidence
 * standard. These tests cover the two halves of that: the stages are really measured inside the
 * canonical ResearchRun loop and survive a restart, and the indicator CANNOT report a speedup or
 * GREEN from no competitor data.
 */

const TEMP = [];
function tempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-ttd-'));
  TEMP.push(dir);
  return path.join(dir, 'genesis.db');
}
test.after(() => { for (const dir of TEMP) rmSync(dir, { recursive: true, force: true }); });

const rawMarks = (db) => db.prepare('SELECT scope_kind, scope_id, stage, mark, COUNT(*) AS n FROM discovery_stage_marks GROUP BY 1,2,3,4').all();

/* ---------------- a loop harness that needs no installed engine ---------------- */

const FAKE_ENGINE_ID = 'rdkit';

/** Deterministic stand-in for an engine adapter. No science capability, so nothing is replayed. */
const fakeExecutor = Object.freeze({
  engineId: FAKE_ENGINE_ID,
  scienceCapability: null,
  inputShape: '{ "smiles": string }',
  observables: { molWt: 'number' },
  parseInput(parameters) {
    const smiles = typeof parameters?.smiles === 'string' ? parameters.smiles.trim() : '';
    if (!smiles) return { ok: false, reason: 'smiles_required' };
    return { ok: true, input: { smiles } };
  },
  run(input) {
    // A deliberately invalid input is REJECTED by the engine; that is a failed attempt, i.e. a retry.
    if (input.smiles === 'NOT-A-MOLECULE') return { ok: false, status: 'ENGINE_REJECTED_INPUT', error: 'invalid_input' };
    return { ok: true, output: { molWt: 180.16 }, engineLabel: 'fake-engine 1.0' };
  },
});

const FAKE_TOOLS = Object.freeze({
  executors: { [FAKE_ENGINE_ID]: fakeExecutor },
  engineStatus: () => ({
    available: true, reason: null, engineName: 'fake-engine', version: '1.0', engine: 'fake-engine 1.0',
    toolchainFingerprint: 'fake', evidenceClass: 'MODEL_ESTIMATE', environment: null, validationCaseIds: [],
  }),
});

const experimentProposal = (smiles) => ({
  kind: 'COMPUTATIONAL', engineId: FAKE_ENGINE_ID, description: 'descriptors',
  parameters: { smiles, predictions: [{ observable: 'molWt', operator: '<', value: 200, critical: true }] },
});

/**
 * One usable hypothesis, one whose input the engine rejects, and one the validator throws out (no
 * falsification proposal), so the run has a real rejected-candidate count.
 */
const PLAN = {
  subProblems: [{ question: 'Is it small?' }],
  hypotheses: [
    { claim: 'It weighs under 200 Da.', claimType: 'PREDICTION', falsificationProposal: 'molWt >= 200.', experimentProposal: experimentProposal('CC(=O)Oc1ccccc1C(=O)O') },
    { claim: 'A nonsense input is still small.', claimType: 'HYPOTHESIS', falsificationProposal: 'molWt >= 200.', experimentProposal: experimentProposal('NOT-A-MOLECULE') },
    { claim: 'No falsification given, so this one must be rejected.', claimType: 'HYPOTHESIS', experimentProposal: null },
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

/** A real run through the canonical loop: question -> plan -> frozen protocol -> engine -> falsification -> evidence -> next. */
async function loopRun(email, { file = null, campaignId = null } = {}) {
  const db = openDatabase(file ?? ':memory:');
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: fakeProvider(PLAN) });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: email } }).body.project;
  const base = `/api/projects/${project.id}`;
  const started = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Is aspirin drug-like?', ...(campaignId ? { campaignId } : {}) } });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const runId = started.body.researchRun.researchRunId;
  const proposed = await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
  return { db, call, owner, project, base, runId, plan: proposed.body.researchRun.plan };
}

/* ---------------- vocabulary ---------------- */

describe('TIME-TO-DISCOVERY vocabulary', () => {
  test('the ten stages the owner named are the measured vocabulary, in order', () => {
    assert.deepEqual([...DISCOVERY_STAGES], [
      'QUESTION_TO_HYPOTHESES',
      'HYPOTHESES_TO_FROZEN_PROTOCOLS',
      'PROTOCOLS_TO_COMPLETED_EXPERIMENTS',
      'EXPERIMENT_TO_FALSIFICATION',
      'RESULT_TO_REPLAY',
      'RESULT_TO_EVIDENCE_PACK',
      'CANDIDATE_POOL_TO_RANKED_CANDIDATE',
      'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER',
      'WINNER_TO_LABORATORY_HANDOFF',
      'QUESTION_TO_VERIFIED_RESEARCH_OUTCOME',
    ]);
    assert.equal(FULL_CYCLE_STAGE, 'QUESTION_TO_VERIFIED_RESEARCH_OUTCOME');
  });

  test('queue time (waiting for a machine) and human-wait time (blocked on a person) are separate clocks', () => {
    assert.ok(SPAN_KINDS.includes('QUEUE'), 'queue time must be its own span kind');
    assert.ok(SPAN_KINDS.includes('HUMAN_WAIT'), 'human-wait time must be its own span kind');
    assert.notEqual('QUEUE', 'HUMAN_WAIT');

    const db = openDatabase();
    const scope = { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-spans', stage: 'WINNER_TO_LABORATORY_HANDOFF' };
    openStage(db, { ...scope, atMs: 1_000 });
    recordSpan(db, { ...scope, kind: 'COMPUTE', ms: 40 });
    recordSpan(db, { ...scope, kind: 'QUEUE', ms: 300, source: 'EXPERIMENT_JOB_QUEUE' });
    recordSpan(db, { ...scope, kind: 'HUMAN_WAIT', ms: 7_000, source: 'LAB_SCHEDULING' });
    recordSpan(db, { ...scope, kind: 'HUMAN_WAIT', ms: 1_000, source: 'REVIEWER_DECISION' });
    closeStage(db, { ...scope, atMs: 10_000 });

    const [s] = stageTimings(db, 'RESEARCH_RUN', 'rr-spans');
    assert.equal(s.wallClockMs, 9_000);
    assert.equal(s.computeMs, 40);
    assert.equal(s.queueMs, 300, 'queue time must not absorb human-wait time');
    assert.equal(s.humanWaitMs, 8_000, 'human-wait time accumulates separately and is never folded into queue time');
    db.close();
  });

  test('an unknown stage, span kind, counter or member kind is refused instead of silently recorded', () => {
    const db = openDatabase();
    const scope = { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-bad', stage: 'QUESTION_TO_HYPOTHESES' };
    assert.throws(() => openStage(db, { ...scope, stage: 'MADE_UP_STAGE' }), /unknown stage/);
    assert.throws(() => recordSpan(db, { ...scope, kind: 'THINKING', ms: 1 }), /unknown span kind/);
    assert.throws(() => recordCount(db, { ...scope, kind: 'VIBES', delta: 1 }), /unknown count kind/);
    assert.throws(() => recordMember(db, { ...scope, kind: 'ROBOT', member: 'x' }), /unknown member kind/);
    assert.throws(() => openStage(db, { scopeKind: 'GUESS', scopeId: 'x', stage: 'QUESTION_TO_HYPOTHESES' }), /unknown scopeKind/);
    assert.ok(COUNT_KINDS.includes('RETRIES') && COUNT_KINDS.includes('REJECTED_CANDIDATES'));
    assert.ok(MEMBER_KINDS.includes('AGENT') && MEMBER_KINDS.includes('WORKER'));
    db.close();
  });
});

/* ---------------- boundaries are recorded once ---------------- */

describe('TIME-TO-DISCOVERY stage boundaries', () => {
  test('a boundary is recorded once: the second call dedupes and the database refuses a duplicate row', () => {
    const db = openDatabase();
    const scope = { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-once', stage: 'QUESTION_TO_HYPOTHESES' };
    assert.deepEqual(openStage(db, { ...scope, atMs: 100 }), { ok: true, deduped: false, atMs: 100 });
    assert.deepEqual(openStage(db, { ...scope, atMs: 999 }), { ok: true, deduped: true, atMs: 100 }, 'a re-entered stage keeps its original start');
    assert.deepEqual(closeStage(db, { ...scope, atMs: 500 }), { ok: true, deduped: false, atMs: 500 });
    assert.deepEqual(closeStage(db, { ...scope, atMs: 4_000 }), { ok: true, deduped: true, atMs: 500 }, 'a re-entered stage keeps its original end');

    const [only] = stageTimings(db, 'RESEARCH_RUN', 'rr-once');
    assert.equal(only.wallClockMs, 400);
    assert.deepEqual(rawMarks(db).map((r) => r.n), [1, 1], 'exactly one OPEN row and one CLOSE row');

    // Not merely a convention in JS: SQLite itself refuses a second boundary.
    assert.throws(() => db.prepare(
      'INSERT INTO discovery_stage_marks (scope_kind, scope_id, stage, mark, at_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('RESEARCH_RUN', 'rr-once', 'QUESTION_TO_HYPOTHESES', 'OPEN', 7, 7), /UNIQUE/i);
    // And a recorded boundary cannot be moved or deleted.
    assert.throws(() => db.prepare('UPDATE discovery_stage_marks SET at_ms = 0').run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM discovery_stage_marks').run(), /append-only/);
    db.close();
  });

  test('the canonical ResearchRun loop records each stage boundary exactly once', async () => {
    const { db, project, runId } = await loopRun('ttd-loop@example.com');
    const first = executeResearchExperiment(db, project.id, runId, { tools: FAKE_TOOLS });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.status, 'EXECUTED');
    // A second experiment in the same run re-enters the same stages; the boundaries must not multiply.
    executeResearchExperiment(db, project.id, runId, { tools: FAKE_TOOLS });

    for (const row of rawMarks(db)) {
      assert.equal(row.n, 1, `${row.scope_kind} ${row.scope_id} ${row.stage} ${row.mark} recorded ${row.n} times`);
    }

    const report = discoveryTimingReport(db, 'RESEARCH_RUN', runId);
    const byStage = new Map(report.stages.map((s) => [s.stage, s]));
    for (const stage of [
      'QUESTION_TO_HYPOTHESES', 'HYPOTHESES_TO_FROZEN_PROTOCOLS', 'PROTOCOLS_TO_COMPLETED_EXPERIMENTS',
      'EXPERIMENT_TO_FALSIFICATION', 'RESULT_TO_REPLAY', 'RESULT_TO_EVIDENCE_PACK', FULL_CYCLE_STAGE,
    ]) {
      const s = byStage.get(stage);
      assert.ok(s, `the loop must measure ${stage}`);
      assert.equal(s.complete, true, `${stage} must be closed`);
      assert.ok(Number.isInteger(s.wallClockMs) && s.wallClockMs >= 0, `${stage} must have a wall clock`);
    }
    // Candidate-pool, ranking and laboratory-handoff stages belong to the candidate pipeline; the
    // loop does not invent them, so they are absent rather than reported as zero.
    assert.equal(byStage.has('CANDIDATE_POOL_TO_RANKED_CANDIDATE'), false);
    assert.equal(byStage.has('WINNER_TO_LABORATORY_HANDOFF'), false);

    const experiments = byStage.get('PROTOCOLS_TO_COMPLETED_EXPERIMENTS');
    assert.ok(experiments.experiments >= 1, 'experiments must be counted');
    assert.ok(experiments.computeMs >= 0, 'engine runtime is recorded as compute time');
    assert.ok(experiments.workers >= 1, 'the worker that ran the engine is named');
    assert.equal(byStage.get('QUESTION_TO_HYPOTHESES').agents, 1, 'the reasoning model is the agent of the hypotheses stage');

    // Evidence and Replay statuses travel with the timings, so a fast stage cannot be read alone.
    assert.equal(byStage.get('RESULT_TO_EVIDENCE_PACK').evidenceStatuses.at(0)?.status, 'PROPOSED_REQUIRES_HUMAN_APPROVAL');
    assert.ok(byStage.get('RESULT_TO_REPLAY').replayStatuses.length >= 1, 'a replay status is recorded');
    db.close();
  });

  test('retries and rejected candidates are counted', async () => {
    const { db, project, runId, plan } = await loopRun('ttd-counts@example.com');
    // The validator threw out the hypothesis with no falsification proposal.
    assert.ok(plan.rejected.length >= 1, 'the fixture must really have a rejected proposal');
    const rejectedAtPlan = plan.rejected.length;

    // Run the hypothesis whose input the engine rejects: one failed attempt, i.e. one retry.
    const nonsense = plan.hypotheses.find((h) => h.claim.startsWith('A nonsense input'));
    const r = executeResearchExperiment(db, project.id, runId, { hypothesisId: nonsense.hypothesisId, tools: FAKE_TOOLS });
    assert.equal(r.ok, true, JSON.stringify(r));

    const byStage = new Map(stageTimings(db, 'RESEARCH_RUN', runId).map((s) => [s.stage, s]));
    assert.equal(byStage.get('QUESTION_TO_HYPOTHESES').rejectedCandidates, rejectedAtPlan);
    assert.equal(byStage.get('PROTOCOLS_TO_COMPLETED_EXPERIMENTS').retries, 1, 'an attempt the engine refused is a retry');
    assert.equal(byStage.get('PROTOCOLS_TO_COMPLETED_EXPERIMENTS').experiments, 1);

    // The same facts are on the experiment's own scope, so a per-experiment duration is retrievable.
    const perExperiment = stageTimings(db, 'EXPERIMENT', r.experimentId);
    assert.ok(perExperiment.length >= 3, 'each experiment is measured on its own scope');
    assert.equal(perExperiment.find((s) => s.stage === 'PROTOCOLS_TO_COMPLETED_EXPERIMENTS').retries, 1);
    db.close();
  });

  test('counters add up and members are counted distinctly', () => {
    const db = openDatabase();
    const scope = { scopeKind: 'CAMPAIGN', scopeId: 'camp-counts', stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE' };
    openStage(db, { ...scope, atMs: 0 });
    recordCount(db, { ...scope, kind: 'REJECTED_CANDIDATES', delta: 480 });
    recordCount(db, { ...scope, kind: 'REJECTED_CANDIDATES', delta: 20 });
    recordCount(db, { ...scope, kind: 'RETRIES', delta: 3 });
    recordMember(db, { ...scope, kind: 'WORKER', member: 'worker-1' });
    recordMember(db, { ...scope, kind: 'WORKER', member: 'worker-1' });
    recordMember(db, { ...scope, kind: 'WORKER', member: 'worker-2' });
    recordMember(db, { ...scope, kind: 'AGENT', member: 'ranker' });
    closeStage(db, { ...scope, atMs: 5 });
    const [s] = stageTimings(db, 'CAMPAIGN', 'camp-counts');
    assert.equal(s.rejectedCandidates, 500);
    assert.equal(s.retries, 3);
    assert.equal(s.workers, 2, 'one worker named twice is one worker');
    assert.deepEqual(s.workerIds, ['worker-1', 'worker-2']);
    assert.equal(s.agents, 1);
    db.close();
  });
});

/* ---------------- persistence ---------------- */

describe('TIME-TO-DISCOVERY persistence', () => {
  test('timings are persisted and survive a restart', async () => {
    const file = tempDb();
    const { db, project, runId } = await loopRun('ttd-restart@example.com', { file });
    const r = executeResearchExperiment(db, project.id, runId, { tools: FAKE_TOOLS });
    assert.equal(r.ok, true, JSON.stringify(r));
    // Human-wait time observed by an operator is recorded the same way and must also survive.
    recordSpan(db, { scopeKind: 'RESEARCH_RUN', scopeId: runId, stage: FULL_CYCLE_STAGE, kind: 'HUMAN_WAIT', ms: 86_400_000, source: 'OWNER_REVIEW' });
    const before = discoveryTimingReport(db, 'RESEARCH_RUN', runId);
    db.close();

    // A whole new process-level open of the same file: the server restarted.
    const reopened = openDatabase(file);
    const after = discoveryTimingReport(reopened, 'RESEARCH_RUN', runId);
    assert.deepEqual(after, before, 'every stage timing must read back identically after a restart');
    assert.ok(after.stages.length >= 6);
    assert.equal(after.fullCycle.humanWaitMs, 86_400_000);
    reopened.close();
  });
});

/* ---------------- the no-competitor-data invariant ---------------- */

describe('GENESIS SPEEDUP indicator', () => {
  test('no competitor data means TARGET_2X_NOT_YET_BENCHMARKED: no speedup, no GREEN, for any stage', () => {
    const db = openDatabase();
    assert.deepEqual(listCompetitorBaselines(db), [], 'a fresh Genesis database ships no competitor baseline');

    // A Genesis side that looks as fast as anyone could wish.
    openStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-fast', stage: FULL_CYCLE_STAGE, atMs: 0 });
    closeStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-fast', stage: FULL_CYCLE_STAGE, atMs: 1 });

    for (const stage of DISCOVERY_STAGES) {
      const out = genesisSpeedup(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-fast', stage });
      assert.equal(out.status, 'TARGET_2X_NOT_YET_BENCHMARKED', `${stage} must report the literal not-yet-benchmarked status`);
      assert.equal(out.speedup, null, `${stage} must not produce a speedup number`);
      assert.equal(out.green, false, `${stage} must not be GREEN`);
      assert.equal(out.competitor, null);
      assert.equal(out.reason, 'NO_COMPETITOR_MEASUREMENT_RECORDED');
    }

    // Nor can a caller get there by handing the indicator its own Genesis number, however small,
    // or by claiming a task scope and an evidence standard that no measurement backs.
    for (const genesisWallClockMs of [1, 0.001, 1_000_000]) {
      const out = genesisSpeedup(db, {
        scopeKind: 'RESEARCH_RUN', scopeId: 'rr-fast', stage: FULL_CYCLE_STAGE, genesisWallClockMs,
        taskScopeId: 'glp1r-weight-loss-v1', taskScope: { target: 'GLP-1R' }, evidenceStandard: 'anything',
      });
      assert.equal(out.status, 'TARGET_2X_NOT_YET_BENCHMARKED');
      assert.equal(out.speedup, null);
      assert.equal(out.green, false);
    }

    // And the whole repository, as shipped, cannot report a 2x: there is no baseline row anywhere.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_competitor_baselines').get().n, 0);
    db.close();
  });

  test('a competitor baseline cannot be recorded without its own provenance', () => {
    const db = openDatabase();
    const complete = {
      taskScopeId: 'glp1r-weight-loss-v1',
      taskScope: { target: 'GLP-1R', deliverable: 'one computational candidate with a falsified protocol' },
      evidenceStandard: 'preregistered protocol + replay MATCH + evidence pack proposal',
      wallClockMs: 40 * 3_600_000, activeHumanMs: 9 * 3_600_000, computeMs: 2 * 3_600_000,
      measuredBy: 'external computational chemist, name on file',
      measuredAt: '2026-10-04T09:00:00Z',
      measurementMethod: 'stopwatch, active human time logged separately from compute time',
      sourceUri: 'file://baselines/glp1r-manual-2026-10-04.json',
      sourceSha256: 'a'.repeat(64),
    };
    for (const field of COMPETITOR_PROVENANCE_FIELDS) {
      const broken = { ...complete, [field]: '' };
      const out = recordCompetitorBaselineSafe(db, broken);
      assert.equal(out.ok, false, `a baseline without ${field} must be refused`);
    }
    assert.equal(recordCompetitorBaselineSafe(db, { ...complete, sourceSha256: 'not-a-hash' }).ok, false);
    assert.equal(recordCompetitorBaselineSafe(db, { ...complete, wallClockMs: 0 }).ok, false);
    assert.equal(recordCompetitorBaselineSafe(db, { ...complete, taskScope: null }).ok, false);
    assert.equal(recordCompetitorBaselineSafe(db, { ...complete, evidenceStandard: '  ' }).ok, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_competitor_baselines').get().n, 0, 'nothing incomplete was stored');

    const good = recordCompetitorBaselineSafe(db, complete);
    assert.equal(good.ok, true, JSON.stringify(good));
    const stored = getCompetitorBaseline(db, good.id);
    assert.equal(stored.provenance.measuredBy, complete.measuredBy);
    assert.equal(stored.provenanceHash.length, 64);
    // A recorded baseline is append-only: it cannot be edited into a better number later.
    assert.throws(() => db.prepare('UPDATE discovery_competitor_baselines SET wall_clock_ms = 999999999').run(), /append-only/);
    db.close();
  });

  test('with a recorded baseline the indicator does compute a ratio, and only at comparable scope and evidence standard', () => {
    const db = openDatabase();
    const taskScope = { target: 'GLP-1R', deliverable: 'one computational candidate with a falsified protocol' };
    const evidenceStandard = 'preregistered protocol + replay MATCH + evidence pack proposal';
    const baseline = {
      taskScopeId: 'glp1r-weight-loss-v1', taskScope, evidenceStandard,
      wallClockMs: 40_000, activeHumanMs: 9_000, computeMs: 2_000,
      measuredBy: 'external computational chemist, name on file', measuredAt: '2026-10-04T09:00:00Z',
      measurementMethod: 'stopwatch, active human time logged separately from compute time',
      sourceUri: 'file://baselines/glp1r-manual-2026-10-04.json', sourceSha256: 'b'.repeat(64),
    };
    assert.equal(recordCompetitorBaselineSafe(db, baseline).ok, true);

    openStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-cmp', stage: FULL_CYCLE_STAGE, atMs: 0 });
    closeStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-cmp', stage: FULL_CYCLE_STAGE, atMs: 20_000 });
    const same = { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-cmp', stage: FULL_CYCLE_STAGE, taskScopeId: 'glp1r-weight-loss-v1', taskScope, evidenceStandard };

    const green = genesisSpeedup(db, same);
    assert.equal(green.speedup, 2, '40000 / 20000 = 2');
    assert.equal(green.green, true);
    assert.equal(green.status, SPEEDUP_STATUS.GREEN);
    assert.equal(green.greenThreshold, SPEEDUP_GREEN_THRESHOLD);

    // Just under the threshold is not GREEN: 2x means AT MOST 50% of the competitor time.
    const under = genesisSpeedup(db, { ...same, genesisWallClockMs: 20_001 });
    assert.ok(under.speedup < 2);
    assert.equal(under.green, false);
    assert.equal(under.status, SPEEDUP_STATUS.BELOW_TARGET);

    // A shrunken task scope or a different evidence standard is not a comparison at all.
    const shrunk = genesisSpeedup(db, { ...same, taskScope: { target: 'GLP-1R' } });
    assert.equal(shrunk.green, false);
    assert.equal(shrunk.status, SPEEDUP_STATUS.NOT_COMPARABLE);
    assert.equal(shrunk.reason, 'TASK_SCOPE_MISMATCH');
    assert.notEqual(taskScopeHash(taskScope), taskScopeHash({ target: 'GLP-1R' }));

    const easier = genesisSpeedup(db, { ...same, evidenceStandard: 'eyeballed it' });
    assert.equal(easier.green, false);
    assert.equal(easier.status, SPEEDUP_STATUS.NOT_COMPARABLE);
    assert.equal(easier.reason, 'EVIDENCE_STANDARD_MISMATCH');

    // A Genesis side that was never measured gives no ratio, even with a baseline on file.
    const unmeasured = genesisSpeedup(db, { ...same, scopeId: 'rr-never-ran', genesisWallClockMs: null });
    assert.equal(unmeasured.speedup, null);
    assert.equal(unmeasured.green, false);
    assert.equal(unmeasured.status, SPEEDUP_STATUS.GENESIS_NOT_MEASURED);

    // Adding a SLOWER competitor baseline can never raise the reported speedup.
    assert.equal(recordCompetitorBaselineSafe(db, { ...baseline, wallClockMs: 400_000, sourceSha256: 'c'.repeat(64) }).ok, true);
    assert.equal(genesisSpeedup(db, same).speedup, 2, 'the smallest recorded competitor time is used');
    db.close();
  });
});

/** recordCompetitorBaseline, but a database-level refusal is reported like a validation refusal. */
function recordCompetitorBaselineSafe(db, input) {
  try {
    return recordCompetitorBaseline(db, input);
  } catch (error) {
    return { ok: false, error: 'database_refused', reason: String(error?.message ?? error) };
  }
}

/* ---------------- GLP-1R / weight-loss campaign cycle ---------------- */

describe('TIME-TO-DISCOVERY per campaign', () => {
  test("a campaign's whole cycle duration is retrievable, across its runs and its candidate stages", async () => {
    const campaignId = 'campaign-glp1r-weight-loss';
    const { db, project, runId } = await loopRun('ttd-campaign@example.com', { campaignId });
    assert.deepEqual(campaignsOfScope(db, 'RESEARCH_RUN', runId), [campaignId], 'the run is attached to its campaign');
    const executed = executeResearchExperiment(db, project.id, runId, { tools: FAKE_TOOLS });
    assert.equal(executed.ok, true, JSON.stringify(executed));

    // The candidate pipeline owns these three stages; this test only uses the substrate it calls.
    const t0 = Date.now();
    openStage(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE', atMs: t0 - 90_000, campaignId });
    recordCount(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE', kind: 'REJECTED_CANDIDATES', delta: 1_200, campaignId });
    closeStage(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE', atMs: t0 - 60_000, campaignId });
    openStage(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER', atMs: t0 - 60_000, campaignId });
    closeStage(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER', atMs: t0 - 30_000, campaignId });
    openStage(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'WINNER_TO_LABORATORY_HANDOFF', atMs: t0 - 30_000, campaignId });
    recordSpan(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'WINNER_TO_LABORATORY_HANDOFF', kind: 'HUMAN_WAIT', ms: 25_000, source: 'CHEMISTRY_REVIEW', campaignId });
    closeStage(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'WINNER_TO_LABORATORY_HANDOFF', atMs: t0, campaignId });

    const cycle = campaignCycleTiming(db, campaignId);
    const stages = cycle.stages.map((s) => s.stage);
    for (const stage of [
      'QUESTION_TO_HYPOTHESES', 'HYPOTHESES_TO_FROZEN_PROTOCOLS', 'PROTOCOLS_TO_COMPLETED_EXPERIMENTS',
      'EXPERIMENT_TO_FALSIFICATION', 'RESULT_TO_REPLAY', 'RESULT_TO_EVIDENCE_PACK',
      'CANDIDATE_POOL_TO_RANKED_CANDIDATE', 'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER', 'WINNER_TO_LABORATORY_HANDOFF',
    ]) {
      assert.ok(stages.includes(stage), `the campaign cycle must cover ${stage}`);
    }
    assert.ok(cycle.cycleWallClockMs >= 90_000, 'the cycle spans the campaign stages and the run inside it');
    assert.equal(cycle.stages.find((s) => s.stage === 'CANDIDATE_POOL_TO_RANKED_CANDIDATE').rejectedCandidates, 1_200);
    assert.equal(cycle.stages.find((s) => s.stage === 'WINNER_TO_LABORATORY_HANDOFF').humanWaitMs, 25_000);
    assert.ok(cycle.scopes.some((s) => s.scopeKind === 'RESEARCH_RUN' && s.scopeId === runId));

    // Even for a fully measured campaign cycle, the indicator still refuses to claim a 2x.
    const speedup = genesisSpeedup(db, { scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: FULL_CYCLE_STAGE });
    assert.equal(speedup.status, 'TARGET_2X_NOT_YET_BENCHMARKED');
    assert.equal(speedup.green, false);
    db.close();
  });

  test('a run can be attached to a campaign after the fact', () => {
    const db = openDatabase();
    openStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-late', stage: FULL_CYCLE_STAGE, atMs: 10 });
    closeStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-late', stage: FULL_CYCLE_STAGE, atMs: 40 });
    assert.deepEqual(campaignCycleTiming(db, 'camp-late').stages, []);
    linkScopeToCampaign(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-late', campaignId: 'camp-late' });
    linkScopeToCampaign(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-late', campaignId: 'camp-late' });
    const cycle = campaignCycleTiming(db, 'camp-late');
    assert.equal(cycle.cycleWallClockMs, 30);
    assert.equal(cycle.stages.length, 1);
    db.close();
  });
});

/* ---------------- migration ---------------- */

describe('TIME-TO-DISCOVERY schema migration', () => {
  test('an older database keeps working and simply gains the timing tables', () => {
    const file = tempDb();
    // Build a real v16 database with real rows through the shipped code, then pretend it is old.
    const seed = openDatabase(file);
    const call = (method, pathname, { token, body } = {}) => handleApi(seed, { method, pathname, token, body, query: {} });
    const owner = call('POST', '/api/auth/register', { body: { email: 'ttd-migrate@example.com', password: 'password123' } }).body;
    const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'legacy' } }).body.project;
    seed.close();

    // Drop the v17 tables and set the version back: this is now a database an older release wrote.
    const downgraded = new DatabaseSync(file);
    for (const t of ['discovery_stage_marks', 'discovery_stage_facts', 'discovery_competitor_baselines', 'discovery_timing_campaign_links']) {
      downgraded.exec(`DROP TABLE IF EXISTS ${t}`);
    }
    downgraded.exec('PRAGMA user_version = 16');
    const usersBefore = downgraded.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const projectsBefore = downgraded.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
    assert.ok(usersBefore >= 1 && projectsBefore >= 1, 'the fixture must carry real rows');
    downgraded.close();

    const migrated = openDatabase(file);
    assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, CURRENT_SCHEMA_VERSION);
    // The timing tables arrived at v17; later additive migrations push the current version higher,
    // and this case is about the v17 upgrade still happening, not about 17 being the newest.
    assert.ok(CURRENT_SCHEMA_VERSION >= 17, `expected at least v17, got ${CURRENT_SCHEMA_VERSION}`);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM users').get().n, usersBefore, 'migration must not touch existing rows');
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM projects').get().n, projectsBefore);
    assert.equal(migrated.prepare('SELECT id FROM projects WHERE id = ?').get(project.id).id, project.id);
    for (const t of ['discovery_stage_marks', 'discovery_stage_facts', 'discovery_competitor_baselines', 'discovery_timing_campaign_links']) {
      assert.equal(migrated.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, `${t} exists and starts empty`);
    }
    // A run that happened before the migration has no timings: the correct state, not a backfilled guess.
    assert.deepEqual(stageTimings(migrated, 'RESEARCH_RUN', 'rr-from-before'), []);
    // The new tables are writable straight after the migration.
    openStage(migrated, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-after', stage: FULL_CYCLE_STAGE, atMs: 1 });
    closeStage(migrated, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-after', stage: FULL_CYCLE_STAGE, atMs: 3 });
    assert.equal(stageTimings(migrated, 'RESEARCH_RUN', 'rr-after')[0].wallClockMs, 2);
    migrated.close();

    // Re-opening again is idempotent: no duplicate tables, no lost rows.
    const again = openDatabase(file);
    assert.equal(again.prepare('PRAGMA user_version').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.equal(again.prepare('SELECT COUNT(*) AS n FROM discovery_stage_marks').get().n, 2);
    again.close();
  });
});
