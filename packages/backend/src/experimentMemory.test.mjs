/* Proprietary / All Rights Reserved - Genesis OS */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  openDatabase, createUser, createProject, getExperimentPreregistration, listExperimentRecords,
  verifyExperimentRecordChain, saveScienceRun,
} from './store.mjs';
import { hashPassword } from './auth.mjs';
import { createCampaign, getCampaign, updateCampaign, addEvent } from './campaign/persistence.mjs';
import {
  preregisterExperiment, sealExperimentSession, readExperimentMemory, hypothesisFingerprint,
  deriveVerdict, campaignHasExecuted,
} from './experimentMemory.mjs';

/**
 * SCIENTIFIC MEMORY on the server: preregistration before execution, sealed sessions after it, both
 * immutable and hash-chained, and the session checked against the preregistration by the server
 * itself. These tests are the teeth of that claim — including that the database REFUSES an update or
 * a delete of a stored record.
 */

const HYPOTHESIS = {
  subject: 'imatinib',
  target: { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'kinaza ABL1 (domena kinazowa)' },
  statement: 'Pochodne wiążą się w kieszeni ABL1 z wynikiem Vina ≤ -9.0 kcal/mol.',
  criteria: [
    { id: 'docking', critical: true, threshold: -9, evidence: 'REAL_ENGINE_OUTPUT', label: 'Wynik Vina ≤ -9.0 kcal/mol' },
    { id: 'retained', critical: false, threshold: null, evidence: 'REAL_ENGINE_OUTPUT', label: 'Co najmniej jeden kandydat lekopodobny' },
    { id: 'ames', critical: false, threshold: 0.5, evidence: 'MODEL_ESTIMATE', label: 'AMES ≤ 0.5' },
  ],
  plan: [{ stage: 'docking', engine: 'AutoDock Vina', label: 'Docking do 1IEP', evidence: 'REAL_ENGINE_OUTPUT' }],
};

function seed(db, { objective = 'memory' } = {}) {
  const u = createUser(db, { email: `m${Math.random().toString(36).slice(2)}@lab.org`, displayName: 'M', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'M', ownerId: u.id });
  const c = createCampaign(db, {
    projectId: p.id, objective, domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 2, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: u.id,
  });
  return { db, userId: u.id, projectId: p.id, campaign: getCampaign(db, c.id) };
}

const sessionOf = (over = {}) => ({
  subject: 'imatinib',
  hypothesisFingerprint: hypothesisFingerprint(HYPOTHESIS),
  verdict: 'SUPPORTED',
  rule: 'wszystkie zarejestrowane kryteria spełnione',
  stateHash: 'a1b2c3d4',
  criteria: [
    { id: 'docking', status: 'MET', observed: '-12.60 kcal/mol (1IEP:A)' },
    { id: 'retained', status: 'MET', observed: '3/3 zachowanych' },
    { id: 'ames', status: 'MET', observed: 'AMES = 0.17' },
  ],
  target: { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A' },
  candidate: { smiles: 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1' },
  evidence: [{ id: 'drug-docking', label: 'Vina', detail: '-12.60 kcal/mol', epistemic: 'REAL_ENGINE_OUTPUT' }],
  engineReplay: { runId: 'run-1', verdict: 'MATCH', engine: 'vina 1.2.7 → vina 1.2.7', originalHash: 'x', replayHash: 'x' },
  durationMs: 510_000,
  ...over,
});

describe('preregistration is a server-side record written before execution', () => {
  test('a hypothesis is stored with the fingerprint the server recomputes from its own content', () => {
    const { db, projectId, campaign, userId } = seed(openDatabase(':memory:'));
    const r = preregisterExperiment(db, { projectId, campaign, hypothesis: HYPOTHESIS, userId });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'REGISTERED');
    assert.equal(r.record.kind, 'PREREGISTRATION');
    assert.equal(r.record.fingerprint, hypothesisFingerprint(HYPOTHESIS));
    assert.equal(r.record.seq, 1);
    assert.equal(r.record.prevChainHash, null);
    assert.deepEqual(r.record.body.criteria.map((c) => c.id), ['docking', 'retained', 'ames']);
    assert.equal(getExperimentPreregistration(db, campaign.id).id, r.record.id);
  });

  test('a declared fingerprint that does not match the declared criteria is refused', () => {
    const { db, projectId, campaign } = seed(openDatabase(':memory:'));
    const r = preregisterExperiment(db, { projectId, campaign, hypothesis: { ...HYPOTHESIS, fingerprint: 'deadbeef' } });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'fingerprint_mismatch');
    assert.equal(r.recomputed, hypothesisFingerprint(HYPOTHESIS));
    assert.equal(listExperimentRecords(db, campaign.id).length, 0);
  });

  test('re-posting the SAME hypothesis is idempotent; a DIFFERENT one is refused as immutable', () => {
    const { db, projectId, campaign } = seed(openDatabase(':memory:'));
    const first = preregisterExperiment(db, { projectId, campaign, hypothesis: HYPOTHESIS });
    const again = preregisterExperiment(db, { projectId, campaign, hypothesis: HYPOTHESIS });
    assert.equal(again.status, 'ALREADY_REGISTERED');
    assert.equal(again.record.id, first.record.id);
    const moved = { ...HYPOTHESIS, criteria: HYPOTHESIS.criteria.map((c) => (c.id === 'docking' ? { ...c, threshold: -6 } : c)) };
    const refused = preregisterExperiment(db, { projectId, campaign, hypothesis: moved });
    assert.equal(refused.ok, false);
    assert.equal(refused.error, 'preregistration_immutable');
    assert.equal(refused.record.body.criteria.find((c) => c.id === 'docking').threshold, -9);
    assert.equal(listExperimentRecords(db, campaign.id).length, 1);
  });

  test('criteria invented after the engines ran are refused — running campaign, events or Science Runs all count as executed', () => {
    const a = seed(openDatabase(':memory:'));
    updateCampaign(a.db, a.campaign.id, { status: 'running' });
    const started = preregisterExperiment(a.db, { projectId: a.projectId, campaign: getCampaign(a.db, a.campaign.id), hypothesis: HYPOTHESIS });
    assert.equal(started.ok, false);
    assert.equal(started.error, 'campaign_already_executed');
    assert.equal(started.reason, 'campaign_status_running');

    const b = seed(openDatabase(':memory:'));
    addEvent(b.db, { campaignId: b.campaign.id, type: 'STAGE_RESULT', payload: { stage: 'docking' } });
    const evented = preregisterExperiment(b.db, { projectId: b.projectId, campaign: b.campaign, hypothesis: HYPOTHESIS });
    assert.equal(evented.error, 'campaign_already_executed');
    assert.match(evented.reason, /^campaign_events_present:1$/);

    const c = seed(openDatabase(':memory:'));
    saveScienceRun(c.db, { projectId: c.projectId, campaignId: c.campaign.id, engine: 'vina', capability: 'molecular-docking', status: 'ok' });
    const ran = preregisterExperiment(c.db, { projectId: c.projectId, campaign: c.campaign, hypothesis: HYPOTHESIS });
    assert.equal(ran.reason, 'science_runs_present');
    assert.equal(campaignHasExecuted(c.db, c.campaign).executed, true);
  });

  test('an incomplete hypothesis is refused field by field, and nothing is written', () => {
    const { db, projectId, campaign } = seed(openDatabase(':memory:'));
    const cases = [
      [undefined, 'hypothesis_required'],
      [{ ...HYPOTHESIS, subject: '' }, 'subject_required'],
      [{ ...HYPOTHESIS, target: {} }, 'target_required'],
      [{ ...HYPOTHESIS, criteria: [] }, 'criteria_required'],
      [{ ...HYPOTHESIS, criteria: [{ id: 'x', label: 'x', threshold: null, evidence: 'REAL_ENGINE_OUTPUT' }] }, 'criterion_criticality_required'],
      [{ ...HYPOTHESIS, criteria: [{ id: 'x', label: 'x', critical: true, threshold: null, evidence: 'VIBES' }] }, 'criterion_evidence_class_invalid'],
      [{ ...HYPOTHESIS, criteria: [HYPOTHESIS.criteria[0], HYPOTHESIS.criteria[0]] }, 'criterion_ids_not_unique'],
    ];
    for (const [hypothesis, error] of cases) {
      assert.equal(preregisterExperiment(db, { projectId, campaign, hypothesis }).error, error);
    }
    assert.equal(listExperimentRecords(db, campaign.id).length, 0);
  });
});

describe('a sealed session is checked against the preregistration by the server', () => {
  test('a matching session is sealed: prereg MATCH, and the verdict is re-derived, not taken on trust', () => {
    const { db, projectId, campaign, userId } = seed(openDatabase(':memory:'));
    preregisterExperiment(db, { projectId, campaign, hypothesis: HYPOTHESIS });
    const r = sealExperimentSession(db, { projectId, campaign, session: sessionOf(), userId });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'SEALED');
    assert.equal(r.record.seq, 2);
    assert.equal(r.record.preregCheck, 'MATCH');
    assert.equal(r.record.body.verdictCheck, 'MATCH');
    assert.equal(r.record.body.serverVerdict, 'SUPPORTED');
    assert.equal(r.record.body.reportedVerdict, 'SUPPORTED');
    assert.equal(r.record.body.engineReplay.verdict, 'MATCH');
    assert.equal(r.record.body.evidence.length, 1);
    assert.equal(r.record.preregistrationId, getExperimentPreregistration(db, campaign.id).id);
  });

  test('the server contradicts a verdict that does not follow from the registered criticality', () => {
    const { db, projectId, campaign } = seed(openDatabase(':memory:'));
    preregisterExperiment(db, { projectId, campaign, hypothesis: HYPOTHESIS });
    const session = sessionOf({
      verdict: 'SUPPORTED',
      criteria: [
        { id: 'docking', status: 'NOT_MET', observed: '-6.10 kcal/mol (1IEP:A)' },
        { id: 'retained', status: 'MET', observed: '3/3' },
        { id: 'ames', status: 'MET', observed: 'AMES = 0.17' },
      ],
    });
    const r = sealExperimentSession(db, { projectId, campaign, session });
    assert.equal(r.ok, true);
    assert.equal(r.record.body.verdictCheck, 'CLIENT_VERDICT_DIFFERS');
    assert.equal(r.record.body.serverVerdict, 'FALSIFIED');
    assert.equal(r.record.body.reportedVerdict, 'SUPPORTED');
    assert.match(r.record.body.serverRule, /critical criterion not met: docking/);
  });

  test('a session judged against other criteria, or with no preregistration at all, is recorded as such', () => {
    const a = seed(openDatabase(':memory:'));
    preregisterExperiment(a.db, { projectId: a.projectId, campaign: a.campaign, hypothesis: HYPOTHESIS });
    const drifted = sealExperimentSession(a.db, { projectId: a.projectId, campaign: a.campaign, session: sessionOf({ hypothesisFingerprint: 'ffffffff' }) });
    assert.equal(drifted.record.preregCheck, 'FINGERPRINT_MISMATCH');
    assert.equal(drifted.record.body.verdictCheck, 'NOT_DERIVABLE');
    assert.equal(drifted.record.body.serverVerdict, null);

    const fewer = sealExperimentSession(a.db, {
      projectId: a.projectId, campaign: a.campaign,
      session: sessionOf({ criteria: [{ id: 'docking', status: 'MET', observed: '-12.60' }] }),
    });
    assert.equal(fewer.record.preregCheck, 'CRITERIA_MISMATCH');
    assert.match(fewer.record.body.preregCheckReason, /registered ames,docking,retained/);

    const b = seed(openDatabase(':memory:'));
    const unregistered = sealExperimentSession(b.db, { projectId: b.projectId, campaign: b.campaign, session: sessionOf() });
    assert.equal(unregistered.record.preregCheck, 'MISSING');
    assert.equal(unregistered.record.body.serverVerdict, null);
    assert.equal(unregistered.record.body.verdictCheck, 'NOT_DERIVABLE');
  });

  test('re-posting the identical session returns the stored record instead of a second row', () => {
    const { db, projectId, campaign } = seed(openDatabase(':memory:'));
    preregisterExperiment(db, { projectId, campaign, hypothesis: HYPOTHESIS });
    const first = sealExperimentSession(db, { projectId, campaign, session: sessionOf() });
    const again = sealExperimentSession(db, { projectId, campaign, session: sessionOf() });
    assert.equal(again.deduped, true);
    assert.equal(again.record.id, first.record.id);
    assert.equal(listExperimentRecords(db, campaign.id, 'SESSION').length, 1);
    // a genuinely different run (different state hash) does append
    const second = sealExperimentSession(db, { projectId, campaign, session: sessionOf({ stateHash: 'ffff0000' }) });
    assert.equal(second.deduped, false);
    assert.equal(second.record.seq, 3);
  });

  test('a malformed session is refused rather than stored half-understood', () => {
    const { db, projectId, campaign } = seed(openDatabase(':memory:'));
    assert.equal(sealExperimentSession(db, { projectId, campaign, session: undefined }).error, 'session_required');
    assert.equal(sealExperimentSession(db, { projectId, campaign, session: sessionOf({ verdict: 'PROBABLY' }) }).error, 'verdict_invalid');
    assert.equal(sealExperimentSession(db, { projectId, campaign, session: sessionOf({ stateHash: '' }) }).error, 'state_hash_required');
    assert.equal(sealExperimentSession(db, { projectId, campaign, session: sessionOf({ criteria: [{ id: 'docking', status: 'MAYBE' }] }) }).error, 'criterion_result_shape');
    assert.equal(listExperimentRecords(db, campaign.id).length, 0);
  });
});

describe('the record is immutable and the chain verifies', () => {
  test('the chain links preregistration and sessions in order, and verifies from the stored bodies', () => {
    const { db, projectId, campaign } = seed(openDatabase(':memory:'));
    preregisterExperiment(db, { projectId, campaign, hypothesis: HYPOTHESIS });
    sealExperimentSession(db, { projectId, campaign, session: sessionOf() });
    sealExperimentSession(db, { projectId, campaign, session: sessionOf({ stateHash: 'beef0001' }) });
    const memory = readExperimentMemory(db, campaign.id);
    assert.equal(memory.preregistration.seq, 1);
    assert.equal(memory.sessions.length, 2);
    assert.equal(memory.chain.ok, true);
    assert.equal(memory.chain.length, 3);
    const records = listExperimentRecords(db, campaign.id);
    assert.equal(records[1].prevChainHash, records[0].chainHash);
    assert.equal(records[2].prevChainHash, records[1].chainHash);
  });

  test('the database itself refuses to update or delete a sealed record', () => {
    const { db, projectId, campaign } = seed(openDatabase(':memory:'));
    const r = preregisterExperiment(db, { projectId, campaign, hypothesis: HYPOTHESIS });
    assert.throws(
      () => db.prepare('UPDATE experiment_records SET body_json = ? WHERE id = ?').run('{}', r.record.id),
      /append-only/,
    );
    assert.throws(
      () => db.prepare('DELETE FROM experiment_records WHERE id = ?').run(r.record.id),
      /append-only/,
    );
    assert.equal(verifyExperimentRecordChain(db, campaign.id).ok, true);
    assert.equal(getExperimentPreregistration(db, campaign.id).fingerprint, hypothesisFingerprint(HYPOTHESIS));
  });

  test("one campaign's memory never leaks into another's chain", () => {
    const db = openDatabase(':memory:');
    const a = seed(db, { objective: 'A' });
    const b = seed(db, { objective: 'B' });
    preregisterExperiment(db, { projectId: a.projectId, campaign: a.campaign, hypothesis: HYPOTHESIS });
    preregisterExperiment(db, { projectId: b.projectId, campaign: b.campaign, hypothesis: HYPOTHESIS });
    assert.equal(listExperimentRecords(db, a.campaign.id).length, 1);
    assert.equal(listExperimentRecords(db, b.campaign.id)[0].seq, 1);
    assert.equal(listExperimentRecords(db, b.campaign.id)[0].prevChainHash, null);
    assert.equal(readExperimentMemory(db, a.campaign.id).chain.ok, true);
    assert.equal(readExperimentMemory(db, b.campaign.id).chain.ok, true);
  });
});

describe('the verdict rule the server applies', () => {
  test('a failed falsifier decides first, then anything unevaluable, then all-met, then a weakened claim', () => {
    const critical = ['docking'];
    assert.equal(deriveVerdict([{ id: 'docking', status: 'NOT_MET' }, { id: 'ames', status: 'UNRESOLVED' }], critical).verdict, 'FALSIFIED');
    assert.equal(deriveVerdict([{ id: 'docking', status: 'MET' }, { id: 'ames', status: 'UNRESOLVED' }], critical).verdict, 'UNRESOLVED');
    assert.equal(deriveVerdict([{ id: 'docking', status: 'MET' }, { id: 'ames', status: 'MET' }], critical).verdict, 'SUPPORTED');
    assert.equal(deriveVerdict([{ id: 'docking', status: 'MET' }, { id: 'ames', status: 'NOT_MET' }], critical).verdict, 'WEAKENED');
  });
});

/* ---------------- the HTTP surface ---------------- */
import { handleApi } from './api.mjs';

describe('the experiment-memory routes', () => {
  const HYP = HYPOTHESIS;
  function bootstrap() {
    const db = openDatabase();
    const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });
    const owner = call('POST', '/api/auth/register', { body: { email: 'mem@lab.org', password: 'password123' } }).body;
    const viewerAcct = call('POST', '/api/auth/register', { body: { email: 'view@lab.org', password: 'password123' } }).body;
    const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Mem' } }).body.project;
    call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'view@lab.org', role: 'viewer' } });
    const campaign = call('POST', `/api/projects/${project.id}/campaigns`, { token: owner.token, body: { objective: 'x', startingSmiles: ['c1ccccc1'] } }).body.campaign;
    return { call, owner, viewer: viewerAcct, project, campaign, base: `/api/projects/${project.id}/campaigns/${campaign.id}/experiment-memory` };
  }

  test('POST preregistration then POST sessions then GET memory — and a viewer may read but not write', () => {
    const { call, owner, viewer, base } = bootstrap();
    const pre = call('POST', `${base}/preregistration`, { token: owner.token, body: { hypothesis: HYP } });
    assert.equal(pre.status, 201);
    assert.equal(pre.body.status, 'REGISTERED');
    assert.equal(pre.body.preregistration.fingerprint, hypothesisFingerprint(HYP));
    assert.equal(call('POST', `${base}/preregistration`, { token: owner.token, body: { hypothesis: HYP } }).status, 200);

    const sealed = call('POST', `${base}/sessions`, { token: owner.token, body: { session: sessionOf() } });
    assert.equal(sealed.status, 201);
    assert.equal(sealed.body.session.preregCheck, 'MATCH');
    assert.equal(sealed.body.session.body.serverVerdict, 'SUPPORTED');

    const memory = call('GET', base, { token: viewer.token }).body.memory;
    assert.equal(memory.preregistration.id, pre.body.preregistration.id);
    assert.equal(memory.sessions.length, 1);
    assert.equal(memory.chain.ok, true);
    assert.equal(call('POST', `${base}/preregistration`, { token: viewer.token, body: { hypothesis: HYP } }).status, 403);
    assert.equal(call('POST', `${base}/sessions`, { token: viewer.token, body: { session: sessionOf() } }).status, 403);
  });

  test('a preregistration after the campaign started is refused with 409; a bad hypothesis with 400', () => {
    const { call, owner, base, project, campaign } = bootstrap();
    assert.equal(call('POST', `${base}/preregistration`, { token: owner.token, body: { hypothesis: { subject: 'x' } } }).status, 400);
    call('POST', `/api/projects/${project.id}/campaigns/${campaign.id}/cancel`, { token: owner.token });
    const refused = call('POST', `${base}/preregistration`, { token: owner.token, body: { hypothesis: HYP } });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, 'campaign_already_executed');
    assert.equal(refused.body.reason, 'campaign_status_cancelled');
  });
});
