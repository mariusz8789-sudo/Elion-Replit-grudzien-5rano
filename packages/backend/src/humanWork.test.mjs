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
  AUTOMATION_COVERAGE_TARGET, automationCoverage, campaignHumanWorkReport, closeStage,
  COVERAGE_EXCLUSIONS, DISCOVERY_STAGES, effectiveLoopStepClassification, FULL_CYCLE_STAGE,
  getHumanWorkBaseline, HUMAN_TOUCH_KINDS, HUMAN_WORK_BASELINE_PROVENANCE_FIELDS, humanTouches,
  humanWorkReport, linkScopeToCampaign, listCostRates, listHumanWorkBaselines, LOOP_STEPS,
  loopStepClassification, openStage, recordCostRates, recordHumanTouch, recordHumanWorkBaseline,
  recordLoopStep, recordSpan, STEP_CLASSES, syncLoopStepClassification, taskScopeHash, UNKNOWN,
} from './discoveryTiming.mjs';

/**
 * HUMAN WORK — the owner's principle made measurable: "Genesis takes the human's work onto itself; a
 * step a person performs that Genesis could perform correctly, reproducibly, under Evidence, safely and
 * automatically is a PRODUCT BUG."
 *
 * Two halves are tested. (1) The classification is a real, schema-enforced vocabulary: one class per
 * step, an unknown class refused, and a HUMAN_REQUIRED step without a reason refused by SQLite itself.
 * (2) THE HONESTY INVARIANT: every quantity that needs a baseline of what a person would have done
 * WITHOUT Genesis returns the literal UNKNOWN, there is no code path from an absent baseline to a
 * saved-hours number, an avoided-experiment count or a cost figure — including when a caller hands in
 * its own numbers — and a recorded, comparable baseline does produce a real number, so the invariant is
 * not vacuous.
 */

const TEMP = [];
function tempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-hw-'));
  TEMP.push(dir);
  return path.join(dir, 'genesis.db');
}
test.after(() => { for (const dir of TEMP) rmSync(dir, { recursive: true, force: true }); });

const BASELINE_DEPENDENT = Object.freeze([
  'SCIENTIST_HOURS_SAVED', 'LAB_HOURS_AVOIDED', 'EXPERIMENTS_AVOIDED', 'FAILED_EXPERIMENTS_AVOIDED', 'COST_TO_DECISION',
]);

const TASK_SCOPE = Object.freeze({
  question: 'Is aspirin drug-like by molecular weight?',
  deliverable: 'one computational candidate with a preregistered protocol, a falsification verdict and an Evidence Pack proposal',
  inputs: ['the SMILES string only'],
  stoppingRule: 'the loop has no further justified experiment',
});
const EVIDENCE_STANDARD = 'preregistered protocol + replay verdict + evidence pack proposal';

/** A complete, provenanced human-work baseline. Nothing in the shipped code builds one of these. */
const completeBaseline = (overrides = {}) => ({
  taskScopeId: 'aspirin-mw-v1',
  taskScope: TASK_SCOPE,
  evidenceStandard: EVIDENCE_STANDARD,
  activeHumanMs: 4 * 3_600_000,
  wallClockMs: 3 * 24 * 3_600_000,
  labInstrumentMs: 6 * 3_600_000,
  experiments: 12,
  failedExperiments: 5,
  costMinor: 250_000,
  currency: 'EUR',
  measuredBy: 'external computational chemist, name on file',
  measuredAt: '2026-10-04T09:00:00Z',
  measurementMethod: 'stopwatch; active human time logged separately from machine time; raw log hashed',
  sourceUri: 'file://baselines/aspirin-mw-manual-2026-10-04.json',
  sourceSha256: 'a'.repeat(64),
  ...overrides,
});

const completeRates = (overrides = {}) => ({
  currency: 'EUR',
  scientistMinorPerHour: 9_000,
  computeMinorPerHour: 150,
  labMinorPerHour: 12_000,
  effectiveFrom: '2026-10-01',
  measuredBy: 'finance, invoice reconciliation',
  measuredAt: '2026-10-02T12:00:00Z',
  measurementMethod: 'twelve months of paid invoices divided by recorded hours',
  sourceUri: 'file://rates/2026-10.json',
  sourceSha256: 'b'.repeat(64),
  ...overrides,
});

/* ---------------- a loop harness that needs no installed engine ---------------- */

const FAKE_ENGINE_ID = 'rdkit';

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

const PLAN = {
  subProblems: [{ question: 'Is it small?' }],
  hypotheses: [
    { claim: 'It weighs under 200 Da.', claimType: 'PREDICTION', falsificationProposal: 'molWt >= 200.', experimentProposal: experimentProposal('CC(=O)Oc1ccccc1C(=O)O') },
    { claim: 'A nonsense input is still small.', claimType: 'HYPOTHESIS', falsificationProposal: 'molWt >= 200.', experimentProposal: experimentProposal('NOT-A-MOLECULE') },
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

async function loopRun(email, { file = null, campaignId = null } = {}) {
  const db = openDatabase(file ?? ':memory:');
  const call = (method, pathname, { token, body, query } = {}) => handleApi(db, {
    method, pathname, token, body, query: query ?? {}, reasoningProvider: fakeProvider(PLAN),
  });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: email } }).body.project;
  const base = `/api/projects/${project.id}`;
  const started = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: TASK_SCOPE.question, ...(campaignId ? { campaignId } : {}) } });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const runId = started.body.researchRun.researchRunId;
  const proposed = await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
  return { db, call, owner, project, base, runId, plan: proposed.body.researchRun.plan };
}

/**
 * A fully measured scope: one real loop run plus the records a deployment would add — the human touches
 * (the question, the dataset the person supplied, the evidence approval) and the laboratory instrument
 * time. Nothing here is a baseline.
 */
async function seededRun(email, { file = null } = {}) {
  const ctx = await loopRun(email, { file });
  const { db, project, runId } = ctx;
  const r = executeResearchExperiment(db, project.id, runId, { tools: FAKE_TOOLS });
  assert.equal(r.ok, true, JSON.stringify(r));
  // The hypothesis the engine refuses: one failed attempt, counted as a RETRY.
  const nonsense = ctx.plan.hypotheses.find((h) => h.claim.startsWith('A nonsense input'));
  executeResearchExperiment(db, project.id, runId, { hypothesisId: nonsense.hypothesisId, tools: FAKE_TOOLS });

  const scope = { scopeKind: 'RESEARCH_RUN', scopeId: runId };
  // Compute time the loop already recorded is tiny; add one explicit COMPUTE span so the ratio is
  // readable, and the laboratory instrument time LAB_HOURS_USED is computed from.
  recordSpan(db, { ...scope, stage: 'PROTOCOLS_TO_COMPLETED_EXPERIMENTS', kind: 'COMPUTE', ms: 1_800_000, source: 'engine' });
  recordSpan(db, { ...scope, stage: 'WINNER_TO_LABORATORY_HANDOFF', kind: 'LAB_INSTRUMENT', ms: 3_600_000, source: 'PLATE_READER' });
  recordSpan(db, { ...scope, stage: 'RESULT_TO_EVIDENCE_PACK', kind: 'HUMAN_WAIT', ms: 7_200_000, source: 'OWNER_REVIEW' });
  recordHumanTouch(db, { ...scope, stage: 'QUESTION_TO_HYPOTHESES', stepId: 'SUBMIT_RESEARCH_QUESTION', touchKind: 'QUESTION', actor: email, activeMs: 300_000 });
  recordHumanTouch(db, { ...scope, stage: 'HYPOTHESES_TO_FROZEN_PROTOCOLS', stepId: 'ATTACH_DATASET', touchKind: 'DATA_ENTRY', actor: email, activeMs: 600_000 });
  recordHumanTouch(db, { ...scope, stage: 'RESULT_TO_EVIDENCE_PACK', stepId: 'APPROVE_EVIDENCE_PUBLICATION', touchKind: 'APPROVAL', actor: email, activeMs: 900_000 });
  return { ...ctx, experimentId: r.experimentId };
}

/* ---------------- TASK 1: the classification ---------------- */

describe('HUMAN WORK step classification', () => {
  test('the vocabulary is exactly four classes and four admitted exclusion reasons', () => {
    assert.deepEqual([...STEP_CLASSES], ['AUTOMATED', 'HUMAN_APPROVAL_ONLY', 'HUMAN_REQUIRED', 'EXTERNAL_PHYSICAL_ACTION']);
    assert.deepEqual([...COVERAGE_EXCLUSIONS], ['PHYSICAL_PRESENCE', 'LEGAL_RESPONSIBILITY', 'REAL_MEASUREMENT', 'MANDATORY_HUMAN_REVIEW']);
  });

  test('every declared step carries exactly one known class, a justification and a code reference', () => {
    assert.ok(LOOP_STEPS.length > 0);
    const ids = new Set();
    for (const step of LOOP_STEPS) {
      assert.ok(STEP_CLASSES.includes(step.stepClass), `${step.stepId} has class ${step.stepClass}`);
      assert.ok(DISCOVERY_STAGES.includes(step.stage), `${step.stepId} names stage ${step.stage}`);
      assert.ok(step.justification.trim().length > 20, `${step.stepId} must say what justifies its class`);
      assert.ok(step.codeRef.trim().length > 0, `${step.stepId} must name the code that performs it`);
      assert.equal(ids.has(step.stepId), false, `${step.stepId} is declared twice`);
      ids.add(step.stepId);
      if (step.coverageExclusion !== null) assert.ok(COVERAGE_EXCLUSIONS.includes(step.coverageExclusion));
      if (step.stepClass === 'AUTOMATED') {
        assert.equal(step.coverageExclusion, null, `${step.stepId} is automated, so it cannot be excluded from the denominator`);
        assert.equal(step.whyHumanRequired, null);
      }
    }
    // Every stage of the canonical loop is covered, or the coverage number is not comparable to the target.
    const covered = new Set(LOOP_STEPS.map((s) => s.stage));
    assert.deepEqual(DISCOVERY_STAGES.filter((s) => !covered.has(s)), [], 'every stage must carry at least one classified step');
  });

  test('every HUMAN_REQUIRED step carries a non-empty WHY_HUMAN_REQUIRED reason', () => {
    const required = LOOP_STEPS.filter((s) => s.stepClass === 'HUMAN_REQUIRED');
    assert.ok(required.length > 0, 'the loop really does contain human-required steps');
    for (const step of required) {
      assert.equal(typeof step.whyHumanRequired, 'string', `${step.stepId} has no reason`);
      assert.ok(step.whyHumanRequired.trim().length > 40, `${step.stepId} needs a real reason, not a word`);
    }
  });

  test('an unknown class, stage or exclusion reason is refused instead of being recorded', () => {
    const db = openDatabase();
    const base = LOOP_STEPS[1];
    assert.throws(() => recordLoopStep(db, { ...base, stepId: 'X1', stepClass: 'MOSTLY_AUTOMATED' }), /unknown step class/);
    assert.throws(() => recordLoopStep(db, { ...base, stepId: 'X2', stage: 'MADE_UP_STAGE' }), /unknown stage/);
    assert.throws(() => recordLoopStep(db, { ...base, stepId: 'X3', coverageExclusion: 'IT_IS_HARD' }), /unknown coverage exclusion/);
    assert.throws(() => recordLoopStep(db, { ...base, stepId: '', stepClass: 'AUTOMATED' }), /stepId is required/);
    assert.throws(() => recordLoopStep(db, { ...base, stepId: 'X4', justification: '   ' }), /justification/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_loop_steps').get().n, 0, 'nothing invalid was stored');
    db.close();
  });

  test('the DATABASE refuses a HUMAN_REQUIRED step without a reason, and an excluded AUTOMATED step', () => {
    const db = openDatabase();
    const insert = (stepClass, why, exclusion) => db.prepare(
      `INSERT INTO discovery_loop_steps (step_id, seq, stage, step_class, why_human_required, coverage_exclusion, justification, code_ref, created_at)
       VALUES (?, 1, ?, ?, ?, ?, 'because', 'somewhere.mjs', 1)`,
    ).run(`raw-${stepClass}-${String(why)}-${String(exclusion)}`, FULL_CYCLE_STAGE, stepClass, why, exclusion);

    // Not a convention in JS: SQLite itself refuses these rows.
    assert.throws(() => insert('HUMAN_REQUIRED', null, null), /CHECK|constraint/i);
    assert.throws(() => insert('HUMAN_REQUIRED', '', null), /CHECK|constraint/i);
    assert.throws(() => insert('HUMAN_REQUIRED', '   ', null), /CHECK|constraint/i);
    assert.throws(() => insert('AUTOMATED', null, 'PHYSICAL_PRESENCE'), /CHECK|constraint/i);
    assert.throws(() => insert('SEMI_AUTOMATED', null, null), /CHECK|constraint/i);
    assert.throws(() => insert('AUTOMATED', '  ', null), /CHECK|constraint/i);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_loop_steps').get().n, 0);

    // The same row WITH a reason is accepted, so the refusals above are about the reason, not the row.
    insert('HUMAN_REQUIRED', 'a person must be physically present to open the freezer', 'PHYSICAL_PRESENCE');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_loop_steps').get().n, 1);
    db.close();
  });

  test('the classification persists, is idempotent, and is readable back as declared', () => {
    const db = openDatabase();
    assert.deepEqual(loopStepClassification(db), [], 'a fresh database carries no classification rows');
    assert.equal(effectiveLoopStepClassification(db).source, 'CODE_DECLARATION');
    syncLoopStepClassification(db);
    syncLoopStepClassification(db);
    const stored = loopStepClassification(db);
    assert.equal(stored.length, LOOP_STEPS.length, 're-syncing must not duplicate a step');
    assert.equal(effectiveLoopStepClassification(db).source, 'DATABASE');
    for (const declared of LOOP_STEPS) {
      const row = stored.find((s) => s.stepId === declared.stepId);
      assert.ok(row, `${declared.stepId} must be stored`);
      assert.equal(row.stepClass, declared.stepClass);
      assert.equal(row.coverageExclusion, declared.coverageExclusion ?? null);
      assert.equal(row.whyHumanRequired, declared.whyHumanRequired ?? null);
    }
    db.close();
  });
});

/* ---------------- TASK 2 / the coverage denominator ---------------- */

describe('AUTOMATION_COVERAGE', () => {
  test('the denominator is exactly the steps that are not excluded by one of the four admitted reasons', () => {
    const db = openDatabase();
    syncLoopStepClassification(db);
    const c = automationCoverage(db);

    const excluded = LOOP_STEPS.filter((s) => s.coverageExclusion !== null);
    const included = LOOP_STEPS.filter((s) => s.coverageExclusion === null);
    const automated = included.filter((s) => s.stepClass === 'AUTOMATED');
    assert.equal(c.totalSteps, LOOP_STEPS.length);
    assert.equal(c.excludedSteps, excluded.length);
    assert.equal(c.denominator, included.length);
    assert.equal(c.numerator, automated.length);
    assert.equal(c.coverage, automated.length / included.length);
    assert.equal(c.denominatorShareOfLoop, included.length / LOOP_STEPS.length);
    assert.ok(c.denominator < c.totalSteps, 'the denominator is smaller than the loop, and the report says by how much');
    assert.equal(c.target, AUTOMATION_COVERAGE_TARGET);
    assert.equal(c.target, 0.9);

    // Every excluded step names WHICH of the four reasons removed it; nothing is excluded implicitly.
    for (const stepId of c.excludedStepIds) {
      const step = LOOP_STEPS.find((s) => s.stepId === stepId);
      assert.ok(COVERAGE_EXCLUSIONS.includes(step.coverageExclusion), `${stepId} must name its exclusion reason`);
    }
    assert.equal(Object.values(c.excludedBy).reduce((a, b) => a + b, 0), excluded.length);
    db.close();
  });

  test('coverage is reported against the target only when the classification covers the whole loop', () => {
    const db = openDatabase();
    // Partial classification: one stage classified, nine not. A number here is not an achievement.
    recordLoopStep(db, LOOP_STEPS.find((s) => s.stepId === 'EXECUTE_EXPERIMENT'));
    const partial = automationCoverage(db);
    assert.equal(partial.coverage, 1, 'the arithmetic over the classified part is still reported');
    assert.equal(partial.targetComparable, false);
    assert.equal(partial.meetsTarget, null, 'a partial classification can never meet the target');
    assert.ok(partial.unclassifiedStageCount >= 9, 'the number of unclassified stages is reported, not rounded away');
    assert.match(partial.reason, /STEP_CLASSIFICATION_INCOMPLETE/);

    syncLoopStepClassification(db);
    const full = automationCoverage(db);
    assert.equal(full.unclassifiedStageCount, 0);
    assert.deepEqual(full.unclassifiedStages, []);
    assert.equal(full.targetComparable, true);
    assert.equal(full.meetsTarget, full.coverage >= AUTOMATION_COVERAGE_TARGET);
    db.close();
  });

  test('with no classification at all, coverage falls back to the code declaration and says so', () => {
    const db = openDatabase();
    const c = automationCoverage(db);
    assert.equal(c.classificationSource, 'CODE_DECLARATION');
    assert.equal(c.totalSteps, LOOP_STEPS.length);
    db.close();
  });
});

/* ---------------- TASK 2: the metrics on a seeded run ---------------- */

describe('HUMAN WORK metrics on a seeded run', () => {
  test('every recorded quantity is computed from the records, and from nothing else', async () => {
    const { db, runId } = await seededRun('hw-seeded@example.com');
    const report = humanWorkReport(db, 'RESEARCH_RUN', runId);
    const m = report.metrics;

    assert.equal(m.HUMAN_TOUCH_COUNT.value, 3, 'three human touches were recorded');
    assert.equal(m.HUMAN_TOUCH_COUNT.computable, true);
    assert.equal(m.SCIENTIST_ACTIVE_TIME.value, 300_000 + 600_000 + 900_000);
    assert.equal(m.SCIENTIST_WAIT_TIME.value, 7_200_000);
    assert.equal(m.LAB_HOURS_USED.value, 1, '3_600_000 ms of instrument time is one hour');

    // Genesis active time is the loop's own engine runtime plus the explicit span; it is at least the span.
    assert.equal(m.GENESIS_ACTIVE_TIME.computable, true);
    assert.ok(m.GENESIS_ACTIVE_TIME.value >= 1_800_000, 'the recorded compute span is included');
    assert.equal(m.GENESIS_ACTIVE_TIME.value, report.recorded.computeMs);

    // The ratios are over ACTIVE work time only; waiting is on neither side.
    const total = report.recorded.computeMs + report.recorded.activeHumanMs;
    assert.equal(m.AUTOMATED_WORK_RATIO.value, report.recorded.computeMs / total);
    assert.equal(m.HUMAN_WORK_RATIO.value, report.recorded.activeHumanMs / total);
    assert.ok(Math.abs(m.AUTOMATED_WORK_RATIO.value + m.HUMAN_WORK_RATIO.value - 1) < 1e-12);
    assert.ok(m.AUTOMATED_WORK_RATIO.value < 1, 'a run with human touches can never be reported as 100% automated');

    assert.equal(m.TIME_TO_DECISION.computable, true);
    assert.equal(m.TIME_TO_DECISION.value, report.timing.fullCycle.wallClockMs);

    // Retries and experiments come from the v17 counters, not from a new count.
    assert.equal(report.recorded.retries, 1, 'the attempt the engine refused is the recorded failed experiment');
    assert.ok(report.recorded.experiments >= 1);
    db.close();
  });

  test('an un-instrumented scope reports UNKNOWN rather than a flattering zero', () => {
    const db = openDatabase();
    openStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-bare', stage: FULL_CYCLE_STAGE, atMs: 0 });
    closeStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-bare', stage: FULL_CYCLE_STAGE, atMs: 5 });
    const m = humanWorkReport(db, 'RESEARCH_RUN', 'rr-bare').metrics;
    // A scope with no human touch recorded is NOT 100% automated: it is unmeasured.
    assert.equal(m.AUTOMATED_WORK_RATIO.value, UNKNOWN);
    assert.equal(m.AUTOMATED_WORK_RATIO.reason, 'NO_HUMAN_TIME_RECORDED');
    assert.equal(m.HUMAN_WORK_RATIO.value, UNKNOWN);
    assert.equal(m.SCIENTIST_ACTIVE_TIME.value, UNKNOWN);
    assert.equal(m.GENESIS_ACTIVE_TIME.value, UNKNOWN);
    assert.equal(m.SCIENTIST_WAIT_TIME.value, UNKNOWN);
    assert.equal(m.LAB_HOURS_USED.value, UNKNOWN);
    // Only what really was recorded is a number.
    assert.equal(m.HUMAN_TOUCH_COUNT.value, 0);
    assert.equal(m.TIME_TO_DECISION.value, 5);
    db.close();
  });

  test('a campaign report aggregates its runs, with the same invariant', async () => {
    const campaignId = 'camp-human-work';
    const { db, runId } = await seededRun('hw-campaign@example.com');
    linkScopeToCampaign(db, { scopeKind: 'RESEARCH_RUN', scopeId: runId, campaignId });
    recordHumanTouch(db, {
      scopeKind: 'CAMPAIGN', scopeId: campaignId, stage: 'WINNER_TO_LABORATORY_HANDOFF',
      stepId: 'APPROVE_LABORATORY_HANDOFF', touchKind: 'APPROVAL', actor: 'owner', activeMs: 120_000, campaignId,
    });
    const report = campaignHumanWorkReport(db, campaignId);
    assert.equal(report.metrics.HUMAN_TOUCH_COUNT.value, 4, 'the run’s three touches plus the campaign approval');
    assert.equal(report.metrics.SCIENTIST_ACTIVE_TIME.value, 300_000 + 600_000 + 900_000 + 120_000);
    for (const metric of BASELINE_DEPENDENT) {
      assert.equal(report.metrics[metric].value, UNKNOWN, `${metric} must be UNKNOWN for a campaign with no baseline`);
    }
    db.close();
  });
});

/* ---------------- TASK 3: THE HONESTY INVARIANT ---------------- */

describe('HUMAN WORK honesty invariant', () => {
  test('a fresh Genesis database ships no human-work baseline and no cost rate', () => {
    const db = openDatabase();
    assert.deepEqual(listHumanWorkBaselines(db), []);
    assert.deepEqual(listCostRates(db), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_human_work_baselines').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_cost_rates').get().n, 0);
    db.close();
  });

  test('with no baseline, every baseline-dependent metric is the literal UNKNOWN for every stage', async () => {
    const { db, runId } = await seededRun('hw-unknown@example.com');
    for (const stage of DISCOVERY_STAGES) {
      const m = humanWorkReport(db, 'RESEARCH_RUN', runId, { stage }).metrics;
      for (const metric of BASELINE_DEPENDENT) {
        assert.equal(m[metric].value, UNKNOWN, `${metric} at ${stage}`);
        assert.equal(m[metric].computable, false);
        assert.notEqual(m[metric].value, 0);
        assert.ok(typeof m[metric].reason === 'string' && m[metric].reason.length > 0, `${metric} must say why`);
      }
    }
    db.close();
  });

  test('there is NO code path from an absent baseline to a saved-hours, avoided-experiment or cost number', async () => {
    const { db, runId } = await seededRun('hw-no-path@example.com');
    // A caller trying every way in: its own numbers, its own baseline object, its own rates, a claimed
    // task scope and evidence standard no measurement backs.
    const attempts = [
      {},
      { taskScopeId: 'aspirin-mw-v1' },
      { taskScope: TASK_SCOPE, evidenceStandard: EVIDENCE_STANDARD },
      { taskScopeId: 'aspirin-mw-v1', taskScope: TASK_SCOPE, evidenceStandard: EVIDENCE_STANDARD },
      { scientistHoursSaved: 10_000, labHoursAvoided: 500, experimentsAvoided: 99, costToDecision: 1, baseline: completeBaseline() },
      { baselineActiveHumanMs: 10 ** 9, costRates: completeRates(), metrics: { SCIENTIST_HOURS_SAVED: 42 } },
    ];
    for (const options of attempts) {
      const report = humanWorkReport(db, 'RESEARCH_RUN', runId, options);
      assert.equal(report.baseline, null, `a caller must not be able to inject a baseline: ${JSON.stringify(Object.keys(options))}`);
      for (const metric of BASELINE_DEPENDENT) {
        assert.equal(report.metrics[metric].value, UNKNOWN, `${metric} leaked a number for ${JSON.stringify(Object.keys(options))}`);
      }
    }
    // And nothing the caller passed was written anywhere.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_human_work_baselines').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_cost_rates').get().n, 0);
    db.close();
  });

  test('a baseline cannot be recorded without its own provenance', () => {
    const db = openDatabase();
    for (const field of HUMAN_WORK_BASELINE_PROVENANCE_FIELDS) {
      const out = recordHumanWorkBaseline(db, completeBaseline({ [field]: '' }));
      assert.equal(out.ok, false, `a baseline without ${field} must be refused`);
      assert.equal(out.error, 'missing_provenance');
    }
    assert.equal(recordHumanWorkBaseline(db, completeBaseline({ sourceSha256: 'not-a-hash' })).ok, false);
    assert.equal(recordHumanWorkBaseline(db, completeBaseline({ taskScope: null })).ok, false);
    assert.equal(recordHumanWorkBaseline(db, completeBaseline({ evidenceStandard: '  ' })).ok, false);
    assert.equal(recordHumanWorkBaseline(db, completeBaseline({ wallClockMs: 0 })).ok, false);
    assert.equal(recordHumanWorkBaseline(db, completeBaseline({ activeHumanMs: -1 })).ok, false);
    assert.equal(recordHumanWorkBaseline(db, completeBaseline({ currency: 'euro' })).ok, false);
    assert.equal(recordHumanWorkBaseline(db, completeBaseline({ experiments: 1, failedExperiments: 2 })).ok, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_human_work_baselines').get().n, 0, 'nothing incomplete was stored');

    const good = recordHumanWorkBaseline(db, completeBaseline());
    assert.equal(good.ok, true, JSON.stringify(good));
    const stored = getHumanWorkBaseline(db, good.id);
    assert.equal(stored.provenance.measuredBy, completeBaseline().measuredBy);
    assert.equal(stored.provenanceHash.length, 64);
    assert.equal(stored.taskScopeHash, taskScopeHash(TASK_SCOPE));
    // Append-only: a recorded baseline cannot be edited into a better number later.
    assert.throws(() => db.prepare('UPDATE discovery_human_work_baselines SET active_human_ms = 999999999').run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM discovery_human_work_baselines').run(), /append-only/);
    db.close();
  });

  test('a cost rate cannot be recorded without provenance, and is append-only', () => {
    const db = openDatabase();
    for (const field of HUMAN_WORK_BASELINE_PROVENANCE_FIELDS) {
      assert.equal(recordCostRates(db, completeRates({ [field]: '' })).ok, false, `a rate without ${field} must be refused`);
    }
    assert.equal(recordCostRates(db, completeRates({ currency: 'eur' })).ok, false);
    assert.equal(recordCostRates(db, completeRates({ scientistMinorPerHour: -1 })).ok, false);
    assert.equal(recordCostRates(db, completeRates({ effectiveFrom: '' })).ok, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovery_cost_rates').get().n, 0);
    assert.equal(recordCostRates(db, completeRates()).ok, true);
    assert.throws(() => db.prepare('UPDATE discovery_cost_rates SET compute_minor_per_hour = 0').run(), /append-only/);
    db.close();
  });

  test('a baseline for DIFFERENT work is not a baseline for this work', async () => {
    const { db, runId } = await seededRun('hw-not-comparable@example.com');
    assert.equal(recordHumanWorkBaseline(db, completeBaseline()).ok, true);
    const declared = { taskScopeId: 'aspirin-mw-v1', taskScope: TASK_SCOPE, evidenceStandard: EVIDENCE_STANDARD };

    // A shrunken task scope, or an easier evidence standard, is not the same task.
    for (const broken of [
      { ...declared, taskScope: { question: TASK_SCOPE.question } },
      { ...declared, evidenceStandard: 'eyeballed it' },
      { ...declared, taskScope: null },
      { ...declared, evidenceStandard: null },
    ]) {
      const report = humanWorkReport(db, 'RESEARCH_RUN', runId, broken);
      assert.equal(report.baseline, null);
      assert.ok(['BASELINE_NOT_COMPARABLE_SCOPE_OR_EVIDENCE_STANDARD', 'NO_TASK_SCOPE_DECLARED_FOR_COMPARISON', 'NO_EVIDENCE_STANDARD_DECLARED_FOR_COMPARISON'].includes(report.baselineReason), report.baselineReason);
      for (const metric of BASELINE_DEPENDENT) assert.equal(report.metrics[metric].value, UNKNOWN, metric);
    }
    db.close();
  });

  test('NON-VACUOUS: a recorded, comparable baseline DOES produce real numbers', async () => {
    const { db, runId } = await seededRun('hw-positive@example.com');
    const declared = { taskScopeId: 'aspirin-mw-v1', taskScope: TASK_SCOPE, evidenceStandard: EVIDENCE_STANDARD };

    // Before: UNKNOWN. This is the control for the assertions below.
    const before = humanWorkReport(db, 'RESEARCH_RUN', runId, declared);
    for (const metric of BASELINE_DEPENDENT) assert.equal(before.metrics[metric].value, UNKNOWN, metric);

    assert.equal(recordHumanWorkBaseline(db, completeBaseline()).ok, true);
    assert.equal(recordCostRates(db, completeRates()).ok, true);
    const after = humanWorkReport(db, 'RESEARCH_RUN', runId, declared);
    assert.ok(after.baseline, 'the baseline must be selected');
    assert.equal(after.baselineReason, 'COMPARED_AGAINST_RECORDED_BASELINE');

    const activeHumanMs = 300_000 + 600_000 + 900_000;
    assert.equal(after.metrics.SCIENTIST_HOURS_SAVED.value, (4 * 3_600_000 - activeHumanMs) / 3_600_000);
    assert.equal(after.metrics.SCIENTIST_HOURS_SAVED.computable, true);
    assert.equal(after.metrics.LAB_HOURS_AVOIDED.value, 6 - 1, 'six baseline hours minus the one hour actually used');
    assert.equal(after.metrics.EXPERIMENTS_AVOIDED.value, 12 - after.recorded.experiments);
    assert.equal(after.metrics.FAILED_EXPERIMENTS_AVOIDED.value, 5 - after.recorded.retries);

    const expectedCost = (activeHumanMs / 3_600_000) * 9_000
      + (after.recorded.computeMs / 3_600_000) * 150
      + (3_600_000 / 3_600_000) * 12_000;
    assert.ok(Math.abs(after.metrics.COST_TO_DECISION.value - expectedCost) < 1e-9);
    assert.equal(after.metrics.COST_TO_DECISION.currency, 'EUR');

    // Adding a MORE wasteful baseline can never raise a saved-hours number.
    assert.equal(recordHumanWorkBaseline(db, completeBaseline({ activeHumanMs: 400 * 3_600_000, sourceSha256: 'c'.repeat(64) })).ok, true);
    const again = humanWorkReport(db, 'RESEARCH_RUN', runId, declared);
    assert.equal(again.metrics.SCIENTIST_HOURS_SAVED.value, after.metrics.SCIENTIST_HOURS_SAVED.value,
      'the smallest recorded human effort is used, so a worse baseline cannot inflate the saving');
    db.close();
  });

  test('a baseline with no recorded Genesis side still gives no number', () => {
    const db = openDatabase();
    openStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-empty', stage: FULL_CYCLE_STAGE, atMs: 0 });
    closeStage(db, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-empty', stage: FULL_CYCLE_STAGE, atMs: 10 });
    assert.equal(recordHumanWorkBaseline(db, completeBaseline()).ok, true);
    assert.equal(recordCostRates(db, completeRates()).ok, true);
    const m = humanWorkReport(db, 'RESEARCH_RUN', 'rr-empty', {
      taskScopeId: 'aspirin-mw-v1', taskScope: TASK_SCOPE, evidenceStandard: EVIDENCE_STANDARD,
    }).metrics;
    assert.equal(m.SCIENTIST_HOURS_SAVED.value, UNKNOWN);
    assert.equal(m.SCIENTIST_HOURS_SAVED.reason, 'NO_HUMAN_TOUCH_RECORDED');
    assert.equal(m.LAB_HOURS_AVOIDED.value, UNKNOWN);
    assert.equal(m.LAB_HOURS_AVOIDED.reason, 'NO_LAB_TIME_RECORDED');
    assert.equal(m.COST_TO_DECISION.value, UNKNOWN);
    assert.equal(m.COST_TO_DECISION.reason, 'COST_INPUT_NOT_MEASURED');
    db.close();
  });

  test('a human touch is append-only and must name its step, actor and kind', () => {
    const db = openDatabase();
    const scope = { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-touch', stage: FULL_CYCLE_STAGE };
    assert.throws(() => recordHumanTouch(db, { ...scope, stepId: 'ADVANCE_LOOP', touchKind: 'VIBES', actor: 'a' }), /unknown human touch kind/);
    assert.throws(() => recordHumanTouch(db, { ...scope, stepId: '', touchKind: 'APPROVAL', actor: 'a' }), /must name the step/);
    assert.throws(() => recordHumanTouch(db, { ...scope, stepId: 'ADVANCE_LOOP', touchKind: 'APPROVAL', actor: '' }), /must name its actor/);
    assert.throws(() => recordHumanTouch(db, { ...scope, stage: 'NOPE', stepId: 'ADVANCE_LOOP', touchKind: 'APPROVAL', actor: 'a' }), /unknown stage/);
    assert.ok(HUMAN_TOUCH_KINDS.includes('APPROVAL') && HUMAN_TOUCH_KINDS.includes('PHYSICAL_ACTION'));
    recordHumanTouch(db, { ...scope, stepId: 'APPROVE_EVIDENCE_PUBLICATION', touchKind: 'APPROVAL', actor: 'owner', activeMs: 60_000 });
    assert.equal(humanTouches(db, 'RESEARCH_RUN', 'rr-touch').length, 1);
    assert.throws(() => db.prepare('UPDATE discovery_human_touches SET active_ms = 0').run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM discovery_human_touches').run(), /append-only/);
    db.close();
  });
});

/* ---------------- TASK 4: the read-only routes ---------------- */

describe('HUMAN WORK read-only API', () => {
  test('the per-run and per-campaign routes are GET-only and report UNKNOWN where nothing was measured', async () => {
    const campaignId = 'camp-api-human-work';
    const { db, call, owner, base, runId } = await seededRun('hw-api@example.com');
    linkScopeToCampaign(db, { scopeKind: 'RESEARCH_RUN', scopeId: runId, campaignId });

    const res = await call('GET', `${base}/research-runs/${runId}/human-work`, { token: owner.token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const hw = res.body.humanWork;
    assert.equal(hw.report, 'HUMAN_WORK');
    assert.equal(hw.metrics.HUMAN_TOUCH_COUNT.value, 3);
    assert.equal(hw.metrics.AUTOMATION_COVERAGE.metric, 'AUTOMATION_COVERAGE');
    for (const metric of BASELINE_DEPENDENT) assert.equal(hw.metrics[metric].value, UNKNOWN, metric);
    assert.ok(hw.classification.length > 0, 'the route carries the classification with its justifications');
    for (const step of hw.classification.filter((s) => s.stepClass === 'HUMAN_REQUIRED')) {
      assert.ok(step.whyHumanRequired && step.whyHumanRequired.length > 0, `${step.stepId} must carry its reason over the API`);
    }

    // Write methods are refused: this is a readout, not a way in.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const bad = await call(method, `${base}/research-runs/${runId}/human-work`, { token: owner.token, body: { scientistHoursSaved: 1_000 } });
      assert.equal(bad.status, 405, `${method} must be refused`);
    }

    // A caller cannot smuggle numbers through the query string either.
    const smuggled = await call('GET', `${base}/research-runs/${runId}/human-work`, {
      token: owner.token,
      query: { taskScopeId: 'aspirin-mw-v1', scientistHoursSaved: '9999', costToDecision: '1' },
    });
    assert.equal(smuggled.status, 200);
    for (const metric of BASELINE_DEPENDENT) assert.equal(smuggled.body.humanWork.metrics[metric].value, UNKNOWN, metric);

    // The campaign route aggregates, with the same invariant.
    const project = base.split('/').at(-1);
    const created = await call('POST', `/api/projects/${project}/campaigns`, {
      token: owner.token,
      body: { objective: 'minimise molecular weight', startingSmiles: ['CC(=O)Oc1ccccc1C(=O)O'] },
    });
    assert.ok([200, 201].includes(created.status), JSON.stringify(created.body));
    const cid = created.body.campaign.id;
    linkScopeToCampaign(db, { scopeKind: 'RESEARCH_RUN', scopeId: runId, campaignId: cid });
    const campaignRes = await call('GET', `/api/projects/${project}/campaigns/${cid}/human-work`, { token: owner.token });
    assert.equal(campaignRes.status, 200, JSON.stringify(campaignRes.body));
    assert.equal(campaignRes.body.humanWork.metrics.HUMAN_TOUCH_COUNT.value, 3);
    for (const metric of BASELINE_DEPENDENT) assert.equal(campaignRes.body.humanWork.metrics[metric].value, UNKNOWN, metric);
    db.close();
  });
});

/* ---------------- persistence ---------------- */

describe('HUMAN WORK persistence', () => {
  test('the classification, the touches and a baseline all survive a restart', async () => {
    const file = tempDb();
    const { db, runId } = await seededRun('hw-restart@example.com', { file });
    syncLoopStepClassification(db);
    assert.equal(recordHumanWorkBaseline(db, completeBaseline()).ok, true);
    assert.equal(recordCostRates(db, completeRates()).ok, true);
    const declared = { taskScopeId: 'aspirin-mw-v1', taskScope: TASK_SCOPE, evidenceStandard: EVIDENCE_STANDARD };
    const before = humanWorkReport(db, 'RESEARCH_RUN', runId, declared);
    assert.ok(before.metrics.SCIENTIST_HOURS_SAVED.computable, 'the fixture must really produce a number before the restart');
    db.close();

    const reopened = openDatabase(file);
    const after = humanWorkReport(reopened, 'RESEARCH_RUN', runId, declared);
    assert.deepEqual(after, before, 'the whole human-work report must read back identically after a restart');
    assert.equal(loopStepClassification(reopened).length, LOOP_STEPS.length);
    assert.equal(humanTouches(reopened, 'RESEARCH_RUN', runId).length, 3);
    assert.equal(listHumanWorkBaselines(reopened).length, 1);
    reopened.close();
  });
});

/* ---------------- migration ---------------- */

describe('HUMAN WORK schema migration', () => {
  test('a v17 database keeps its rows, opens, stays writable and gains the four human-work tables', () => {
    const file = tempDb();
    const seed = openDatabase(file);
    const call = (method, pathname, { token, body } = {}) => handleApi(seed, { method, pathname, token, body, query: {} });
    const owner = call('POST', '/api/auth/register', { body: { email: 'hw-migrate@example.com', password: 'password123' } }).body;
    const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'legacy' } }).body.project;
    // Real v17 rows: a measured stage boundary that must survive the migration untouched.
    openStage(seed, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-v17', stage: FULL_CYCLE_STAGE, atMs: 1_000 });
    closeStage(seed, { scopeKind: 'RESEARCH_RUN', scopeId: 'rr-v17', stage: FULL_CYCLE_STAGE, atMs: 4_000 });
    seed.close();

    const HUMAN_WORK_TABLES = ['discovery_loop_steps', 'discovery_human_touches', 'discovery_human_work_baselines', 'discovery_cost_rates'];
    const downgraded = new DatabaseSync(file);
    for (const t of HUMAN_WORK_TABLES) downgraded.exec(`DROP TABLE IF EXISTS ${t}`);
    downgraded.exec('PRAGMA user_version = 17');
    const usersBefore = downgraded.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const marksBefore = downgraded.prepare('SELECT COUNT(*) AS n FROM discovery_stage_marks').get().n;
    assert.ok(usersBefore >= 1 && marksBefore === 2, 'the fixture must carry real v17 rows');
    downgraded.close();

    const migrated = openDatabase(file);
    assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, CURRENT_SCHEMA_VERSION);
    // The human-work tables were written against v18 and renumbered to v19 on integration (the
    // password-reset tables took v18 first). This case is about the upgrade still happening, not
    // about which number it carries, so it pins the floor and leaves room for later additions.
    assert.ok(CURRENT_SCHEMA_VERSION >= 19, `expected at least v19, got ${CURRENT_SCHEMA_VERSION}`);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM users').get().n, usersBefore, 'migration must not touch existing rows');
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM discovery_stage_marks').get().n, marksBefore);
    assert.equal(migrated.prepare('SELECT id FROM projects WHERE id = ?').get(project.id).id, project.id);
    for (const t of HUMAN_WORK_TABLES) {
      assert.equal(migrated.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, `${t} exists and starts empty`);
    }
    // A run from before the migration has no human touches: the correct state, never a backfilled guess.
    assert.deepEqual(humanTouches(migrated, 'RESEARCH_RUN', 'rr-v17'), []);
    assert.equal(humanWorkReport(migrated, 'RESEARCH_RUN', 'rr-v17').metrics.SCIENTIST_ACTIVE_TIME.value, UNKNOWN);
    // And the database is writable straight after the migration.
    syncLoopStepClassification(migrated);
    recordHumanTouch(migrated, {
      scopeKind: 'RESEARCH_RUN', scopeId: 'rr-v17', stage: FULL_CYCLE_STAGE,
      stepId: 'SUBMIT_RESEARCH_QUESTION', touchKind: 'QUESTION', actor: 'owner', activeMs: 1_000,
    });
    assert.equal(humanTouches(migrated, 'RESEARCH_RUN', 'rr-v17').length, 1);
    assert.equal(loopStepClassification(migrated).length, LOOP_STEPS.length);
    migrated.close();

    // Re-opening is idempotent: no lost rows, no duplicated classification.
    const again = openDatabase(file);
    assert.equal(again.prepare('PRAGMA user_version').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.equal(again.prepare('SELECT COUNT(*) AS n FROM discovery_human_touches').get().n, 1);
    assert.equal(again.prepare('SELECT COUNT(*) AS n FROM discovery_loop_steps').get().n, LOOP_STEPS.length);
    again.close();
  });
});
