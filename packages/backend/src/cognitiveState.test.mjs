import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { canonicalJson, fnv1a } from './determinism.mjs';
import { RESEARCH_STATE_GENESIS_HEAD } from './agentRun.mjs';
import { addCandidate, createCampaign, getCampaign } from './campaign/persistence.mjs';
import { preregisterExperiment, hypothesisFingerprint } from './experimentMemory.mjs';
import { buildCognitiveState } from './cognitiveState.mjs';
import { KNOWLEDGE_REGISTRY_TOOL, readKnowledgeRegistry } from './knowledgeRegistry.mjs';
import { planVirtualExperiment } from './campaign/virtualLabClosedLoop.mjs';

/**
 * ENTITY-2 — Genesis rebuilds what it was working on after a restart, keeps what it does not know
 * as UNKNOWN, keeps gaps open until evidence it can find closes them, and never settles a
 * contradiction by picking a side.
 */

const HYPOTHESIS = {
  subject: 'kepler',
  target: { targetId: 'SOLAR_SYSTEM' },
  statement: 'Okres orbitalny rośnie jak a^1.5.',
  criteria: [{ id: 'exponent', critical: true, threshold: 1.5, evidence: 'REFERENCE_DATA', label: 'Wykładnik 1.5 ± 0.05' }],
};

function chainOf(specs) {
  let head = RESEARCH_STATE_GENESIS_HEAD;
  return specs.map(([type, payload], seq) => {
    const payloadFingerprint = fnv1a(canonicalJson(payload));
    const transitionFingerprint = fnv1a(canonicalJson({ prev: head, type, payloadFingerprint, seq }));
    head = transitionFingerprint;
    return { seq, type, at: `t${seq}`, payload, payloadFingerprint, transitionFingerprint };
  });
}

function setup(db, email = 'mind@lab.org') {
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {} });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'ENTITY-2' } }).body.project;
  const base = `/api/projects/${project.id}`;
  return { call, owner, project, base };
}

/** A project with a campaign, a preregistered hypothesis, a research run mid-way, one gap and one contradiction. */
function populate({ call, owner, project, base }, db) {
  const campaign = getCampaign(db, createCampaign(db, { projectId: project.id, objective: 'Recover the Kepler exponent', domain: 'PHYSICS', createdBy: owner.user.id }).id);
  const prereg = preregisterExperiment(db, { projectId: project.id, campaign, hypothesis: HYPOTHESIS, userId: owner.user.id });
  assert.equal(prereg.ok, true);
  const run = call('POST', `${base}/agent-runs`, { token: owner.token, body: { goal: 'Kepler from NASA data', domain: 'mind' } }).body.run;
  for (const event of chainOf([
    ['PROBLEM_FORMALIZED', { problemId: 'kepler', problemFingerprint: 'abcd1234' }],
    ['HYPOTHESES_GENERATED', { hypotheses: ['H1: a^1.5', 'H2: a^2'] }],
    ['NEXT_EXPERIMENT', { round: 0, continue: true, reason: 'pair not separated' }],
  ])) assert.equal(call('POST', `${base}/agent-runs/${run.id}/research-state`, { token: owner.token, body: { event } }).status, 201);
  const gap = call('POST', `${base}/knowledge-registry/gaps`, { token: owner.token, body: {
    question: 'Which exponent separates H1 and H2 on outer planets?', source: { kind: 'KNOWLEDGE_GAP', ref: 'session-1#pair-0' },
    relatedHypotheses: ['H1', 'H2'], missingEvidence: ['Orbital period of Neptune with sigma < 0.1 d'], requiredCapability: 'maxwell-fdtd',
  } });
  assert.equal(gap.status, 201, JSON.stringify(gap.body));
  const contradiction = call('POST', `${base}/knowledge-registry/contradictions`, { token: owner.token, body: {
    contradictionId: 'ctr-kepler-1', type: 'NUMERIC_DISAGREEMENT',
    claimA: { recordId: 'rec-nasa', source: 'nssdc.gsfc.nasa.gov' }, claimB: { recordId: 'rec-wiki', source: 'en.wikipedia.org' },
    reason: 'periodDays reported as 60182 and 60190',
  } });
  assert.equal(contradiction.status, 201);
  return { campaign, prereg: prereg.record, run, gapId: gap.body.gap.gapId };
}

const withoutTime = (state) => ({ ...state, generatedAt: null });

describe('ENTITY-2 cognitive state', () => {
  test('after a restart the same active project is reconstructed; gaps and contradictions are still there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'genesis-entity2-'));
    const file = join(dir, 'genesis.db');
    try {
      let db = openDatabase(file);
      const ctx = setup(db);
      const { run, gapId, campaign } = populate(ctx, db);
      const before = buildCognitiveState(db, ctx.project.id);
      db.close();

      db = openDatabase(file); // the restart
      const after = buildCognitiveState(db, ctx.project.id);
      assert.deepEqual(withoutTime(after), withoutTime(before));
      assert.equal(after.view, 'MATERIALIZED_VIEW');
      assert.deepEqual(after.currentGoals.map((g) => g.id).sort(), [campaign.id, run.id].sort());
      assert.deepEqual(after.activeQuestions, [{ kind: 'RESEARCH_PROBLEM', runId: run.id, problem: { problemId: 'kepler', problemFingerprint: 'abcd1234' } }]);
      assert.equal(after.knowledgeGaps.length, 1);
      assert.equal(after.knowledgeGaps[0].gapId, gapId);
      assert.equal(after.knowledgeGaps[0].status, 'OPEN');
      assert.equal(after.contradictions[0].status, 'UNRESOLVED');
      assert.equal(after.contradictions[0].epistemicState, 'CONFLICTING_EVIDENCE');
      assert.ok(after.proposedNextActions.length >= 3);
      assert.ok(after.proposedNextActions.every((a) => a.status === 'PROPOSED'));
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('UNKNOWN stays UNKNOWN: untested hypotheses, no self model, a broken registry', () => {
    const db = openDatabase();
    const ctx = setup(db);
    const { prereg } = populate(ctx, db);
    const state = buildCognitiveState(db, ctx.project.id);
    const fromRecords = state.activeHypotheses.find((h) => h.source === 'EXPERIMENT_RECORDS');
    assert.equal(fromRecords.status, 'UNKNOWN', 'a preregistered hypothesis no session has judged is UNKNOWN, not supported');
    assert.equal(fromRecords.preregistrationRef, `experiment_record:${prereg.id}`);
    assert.equal(state.activeHypotheses.find((h) => h.source === 'RESEARCH_STATE').status, 'UNKNOWN');
    assert.deepEqual(state.blockedCapabilities, { status: 'UNKNOWN', reason: 'SELF_MODEL_UNAVAILABLE' });
    assert.equal(state.proposedNextActions.find((a) => a.kind === 'OBTAIN_MISSING_EVIDENCE').capabilityRuntimeAvailableNow, 'UNKNOWN');

    const withSelf = buildCognitiveState(db, ctx.project.id, { selfModel: {
      engines: [{ toolId: 'pymeep', capabilityId: 'maxwell-fdtd', runtimeAvailableNow: false }],
      blockedEngines: [{ toolId: 'pymeep', blockedBy: 'BLOCKED_BY_RUNTIME' }], missingCapabilities: [],
    } });
    assert.deepEqual(withSelf.blockedCapabilities, [{ kind: 'ENGINE_RUNTIME', id: 'pymeep', blockedBy: 'BLOCKED_BY_RUNTIME' }]);
    assert.equal(withSelf.proposedNextActions.find((a) => a.kind === 'OBTAIN_MISSING_EVIDENCE').capabilityRuntimeAvailableNow, false);

    const { runId } = readKnowledgeRegistry(db, ctx.project.id);
    db.prepare('UPDATE agent_run_steps SET observation_json = ? WHERE agent_run_id = ? AND step_index = 0 AND tool_invoked = ?')
      .run(JSON.stringify({ tampered: true }), runId, KNOWLEDGE_REGISTRY_TOOL);
    const broken = buildCognitiveState(db, ctx.project.id);
    assert.equal(broken.knowledgeGaps.status, 'UNKNOWN', 'a tampered registry is not shown as "no gaps"');
    assert.equal(broken.contradictions.status, 'UNKNOWN');
    const refused = ctx.call('POST', `${ctx.base}/knowledge-registry/gaps`, { token: ctx.owner.token, body: { question: 'q', source: { kind: 'OPEN_QUESTION', ref: 'x' } } });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, 'state_integrity_failure');
  });

  test('a gap closes only on evidence that exists in this project', () => {
    const db = openDatabase();
    const ctx = setup(db);
    const { prereg, gapId } = populate(ctx, db);
    const other = setup(db, 'other@lab.org');
    const foreign = populate(other, db);
    const resolve = (evidenceRefs) => ctx.call('POST', `${ctx.base}/knowledge-registry/gaps/${gapId}/resolve`, { token: ctx.owner.token, body: { evidenceRefs } });

    assert.equal(resolve([]).body.error, 'evidence_required');
    assert.equal(resolve(['experiment_record:does-not-exist']).body.error, 'evidence_ref_not_found');
    assert.equal(resolve(['https://example.org/paper']).body.error, 'evidence_ref_not_found', 'a URL is not evidence the project holds');
    assert.equal(resolve([`experiment_record:${foreign.prereg.id}`]).body.error, 'evidence_ref_not_found', 'another project’s record closes nothing here');
    assert.equal(buildCognitiveState(db, ctx.project.id).knowledgeGaps.length, 1);

    const done = resolve([`experiment_record:${prereg.id}`]);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.gap.status, 'RESOLVED');
    assert.deepEqual(done.body.gap.resolvedEvidenceRefs, [`experiment_record:${prereg.id}`]);
    assert.equal(buildCognitiveState(db, ctx.project.id).knowledgeGaps.length, 0);
    assert.equal(resolve([`experiment_record:${prereg.id}`]).status, 409, 'a resolved gap is not resolved twice');
  });

  test('a contradiction is never resolved without new evidence, and never by picking a side', () => {
    const db = openDatabase();
    const ctx = setup(db);
    const { prereg } = populate(ctx, db);
    const path = `${ctx.base}/knowledge-registry/contradictions/ctr-kepler-1/resolve`;
    const attempt = (body) => ctx.call('POST', path, { token: ctx.owner.token, body });

    assert.equal(attempt({ statement: 'NASA is right', evidenceRefs: [] }).body.error, 'new_evidence_required');
    assert.equal(attempt({ statement: 'NASA is right', evidenceRefs: ['rec-nasa'] }).body.error, 'new_evidence_required', 're-citing one side is picking a side');
    assert.equal(attempt({ evidenceRefs: [`experiment_record:${prereg.id}`] }).body.error, 'resolution_statement_required');
    assert.equal(attempt({ statement: 'x', evidenceRefs: ['science_run:nope'] }).body.error, 'evidence_ref_not_found');
    const again = ctx.call('POST', `${ctx.base}/knowledge-registry/contradictions`, { token: ctx.owner.token, body: {
      contradictionId: 'ctr-kepler-1', type: 'NUMERIC_DISAGREEMENT', claimA: { recordId: 'rec-nasa' }, claimB: { recordId: 'rec-wiki' },
    } });
    assert.equal(again.body.deduped, true);
    let state = buildCognitiveState(db, ctx.project.id);
    assert.equal(state.contradictions[0].status, 'UNRESOLVED');
    assert.equal(state.contradictions[0].epistemicState, 'CONFLICTING_EVIDENCE');

    const settled = attempt({ statement: 'An independent measurement agrees with the NASA value.', evidenceRefs: [`experiment_record:${prereg.id}`] });
    assert.equal(settled.status, 200, JSON.stringify(settled.body));
    state = buildCognitiveState(db, ctx.project.id);
    assert.equal(state.contradictions[0].status, 'RESOLVED');
    assert.equal(state.contradictions[0].epistemicState, 'RESOLVED_BY_NEW_EVIDENCE');
    assert.ok(!state.proposedNextActions.some((a) => a.kind === 'SEEK_EVIDENCE_FOR_CONTRADICTION'));
  });

  test('HTTP: the view is served to members; only editors write the registry', async () => {
    const db = openDatabase();
    const ctx = setup(db);
    populate(ctx, db);
    const res = await ctx.call('GET', `${ctx.base}/cognitive-state`, { token: ctx.owner.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.cognitiveState.view, 'MATERIALIZED_VIEW');
    assert.ok(Array.isArray(res.body.cognitiveState.blockedCapabilities), 'the route supplies the ENTITY-1 self model');

    const viewer = ctx.call('POST', '/api/auth/register', { body: { email: 'viewer@lab.org', password: 'password123' } }).body;
    ctx.call('POST', `${ctx.base}/members`, { token: ctx.owner.token, body: { email: 'viewer@lab.org', role: 'viewer' } });
    assert.equal(ctx.call('GET', `${ctx.base}/knowledge-registry`, { token: viewer.token }).status, 200);
    assert.equal(ctx.call('POST', `${ctx.base}/knowledge-registry/gaps`, { token: viewer.token, body: { question: 'q', source: { kind: 'OPEN_QUESTION' } } }).status, 403);
    const stranger = ctx.call('POST', '/api/auth/register', { body: { email: 'x@lab.org', password: 'password123' } }).body;
    assert.equal((await ctx.call('GET', `${ctx.base}/cognitive-state`, { token: stranger.token })).status, 404);
    assert.equal(ctx.call('POST', `${ctx.base}/knowledge-registry/gaps`, { token: ctx.owner.token, body: { question: 'q', source: { kind: 'GUESS' } } }).status, 400);
    assert.equal(hypothesisFingerprint(HYPOTHESIS).length > 0, true);
  });

  test('BYT reconstructs Experiment Firewall state from canonical campaign events after restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'genesis-flight-control-'));
    const file = join(dir, 'genesis.db');
    try {
      let db = openDatabase(file);
      const ctx = setup(db, 'flight-control@lab.org');
      const campaign = createCampaign(db, { projectId: ctx.project.id, objective: 'Flight Control reconstruction', domain: 'CHEMISTRY', createdBy: ctx.owner.user.id });
      const candidateId = addCandidate(db, { campaignId: campaign.id, generation: 0, canonicalSmiles: 'CCO', valid: true });
      const planned = planVirtualExperiment(db, {
        projectId: ctx.project.id, campaignId: campaign.id, candidateId,
        hypothesis: 'A deterministic descriptor run should remain reconstructable.',
        requestedCapability: 'molecular-descriptors', requestedBy: ctx.owner.user.id,
      });
      assert.equal(planned.ok, true);
      const before = buildCognitiveState(db, ctx.project.id);
      assert.equal(before.byt.scienceFlightControl.flights.length, 1);
      assert.equal(before.byt.scienceFlightControl.flights[0].status, 'READY_TO_EXECUTE');
      assert.equal(before.byt.scienceFlightControl.flights[0].bytUpdate.persistence, 'NONE');
      db.close();

      db = openDatabase(file);
      const after = buildCognitiveState(db, ctx.project.id);
      assert.deepEqual(withoutTime(after), withoutTime(before));
      assert.equal(after.byt.scienceFlightControl.flights[0].preflight.decision, 'CLEARED');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
