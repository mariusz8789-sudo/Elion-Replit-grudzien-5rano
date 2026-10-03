import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { advanceResearchRun } from './researchRunAdvance.mjs';
import { getResearchRun } from './researchRun.mjs';

const RDKIT = rdkitDetect();
const skip = RDKIT.available ? false : `RDKit runtime unavailable: ${RDKIT.reason}`;
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const CAFFEINE = 'Cn1cnc2c1c(=O)n(C)c(=O)n2C';
const hypothesis = (claim, smiles, operator, value, extra = {}) => ({
  claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' }, falsificationProposal: 'The frozen molWt criterion is not met.',
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles, predictions: [{ observable: 'molWt', operator, value, critical: true }] }, parameterChanges: [] },
  ...extra,
});
// Plan order: aspirin (0), caffeine (1), a challenge to aspirin (2). A justified rule must pick the challenge BEFORE caffeine.
const plan = {
  subProblems: [{ question: 'Are these molecules light?', whyItMatters: 'Next-experiment proof.' }],
  hypotheses: [
    hypothesis('Aspirin molecular weight is below 200 Da.', ASPIRIN, '<', 200),
    hypothesis('Caffeine molecular weight is below 200 Da.', CAFFEINE, '<', 200),
    hypothesis('Challenge: aspirin molecular weight is at least 200 Da.', ASPIRIN, '>=', 200, { challengesHypothesisIndex: 0 }),
  ],
  nextActions: ['Human review'],
};
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(plan), model: 'fixture' }; },
});
async function setup(email) {
  const db = openDatabase();
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider() });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Advance proof' } }).body.project;
  const base = `/api/projects/${project.id}`;
  const runId = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Are these molecules light?' } })).body.researchRun.researchRunId;
  await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  return { db, call, owner, project, base, runId };
}

test('advance executes the recorded justified choice (challenge before plan order), links each step, stops at human review', { skip }, async () => {
  const ctx = await setup('advance@genesis.test');
  try {
    const hyps = getResearchRun(ctx.db, ctx.project.id, ctx.runId).plan.hypotheses;
    assert.equal(hyps[2].challengesHypothesisId, hyps[0].hypothesisId);

    const one = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/advance`, { token: ctx.owner.token, body: { maxSteps: 1 } });
    assert.equal(one.status, 201);
    assert.equal(one.body.steps.length, 1);
    assert.equal(one.body.steps[0].hypothesisId, hyps[0].hypothesisId);
    assert.equal(one.body.status, 'STEP_BUDGET_REACHED');

    const rest = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/advance`, { token: ctx.owner.token, body: { maxSteps: 5 } });
    assert.deepEqual(rest.body.steps.map((s) => s.hypothesisId), [hyps[2].hypothesisId, hyps[1].hypothesisId], 'the challenge was justified by the supported, replayed result and went first');
    assert.equal(rest.body.steps[0].selectedBy, 'SELF_FALSIFICATION_CHALLENGE_IN_PLAN');
    assert.equal(rest.body.steps[0].verdict, 'FALSIFIED_WITHIN_PROTOCOL', 'the challenge to a supported claim was itself falsified');
    assert.equal(rest.body.steps[1].selectedBy, 'NEXT_EXECUTABLE_HYPOTHESIS_IN_PLAN');
    assert.equal(rest.body.status, 'AWAITING_HUMAN_REVIEW', 'the rule hands the run to a person when nothing executable is left');

    const run = getResearchRun(ctx.db, ctx.project.id, ctx.runId);
    assert.equal(run.researchState.chain.ok, true);
    assert.equal(run.experiments.length, 3);
    assert.equal(run.experiments[0].continuedFrom, null);
    assert.equal(run.experiments[1].continuedFrom.fromExperimentId, run.experiments[0].experimentId);
    assert.equal(run.experiments[2].continuedFrom.fromExperimentId, run.experiments[1].experimentId);
    assert.equal(run.experiments[1].continuedFrom.proposalFingerprint, rest.body.steps[0].justifiedBy.proposalFingerprint);
    assert.equal(run.experiments[1].continuedFrom.decisionId, run.experiments[0].next.decisionTrace.decisionId);

    const stopped = await advanceResearchRun(ctx.db, ctx.project.id, ctx.runId, { maxSteps: 3 });
    assert.equal(stopped.steps.length, 0, 'nothing is executed once the rule asks for human review');
    assert.equal(stopped.status, 'AWAITING_HUMAN_REVIEW');
    assert.equal(getResearchRun(ctx.db, ctx.project.id, ctx.runId).experiments.length, 3);
  } finally { ctx.db.close(); }
});

test('advance respects steering, the run status and the caller cannot name the experiment', { skip }, async () => {
  const ctx = await setup('advance-steer@genesis.test');
  try {
    const hyps = getResearchRun(ctx.db, ctx.project.id, ctx.runId).plan.hypotheses;
    assert.equal((await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/steering`, { token: ctx.owner.token, body: { action: 'ABANDON_HYPOTHESIS', hypothesisId: hyps[2].hypothesisId } })).status, 201);
    const out = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/advance`, { token: ctx.owner.token, body: { maxSteps: 9, hypothesisId: hyps[2].hypothesisId } });
    assert.deepEqual(out.body.steps.map((s) => s.hypothesisId), [hyps[0].hypothesisId, hyps[1].hypothesisId], 'the abandoned hypothesis is never run, and a named hypothesisId is ignored');
    assert.equal(out.body.status, 'AWAITING_HUMAN_REVIEW');
    const clamped = await advanceResearchRun(ctx.db, ctx.project.id, ctx.runId, { maxSteps: 10_000 });
    assert.equal(clamped.steps.length, 0);

    const other = await setup('advance-cancel@genesis.test');
    try {
      await other.call('POST', `${other.base}/research-runs/${other.runId}/cancel`, { token: other.owner.token, body: {} });
      const refused = await other.call('POST', `${other.base}/research-runs/${other.runId}/advance`, { token: other.owner.token, body: {} });
      assert.equal(refused.status, 200);
      assert.equal(refused.body.status, 'NOT_ADVANCEABLE');
      assert.equal(refused.body.steps.length, 0);
      assert.equal((await advanceResearchRun(other.db, other.project.id, 'agent-run-nope', {})).status, 'NOT_FOUND');
    } finally { other.db.close(); }
  } finally { ctx.db.close(); }
});
