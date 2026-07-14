/**
 * Priority 1 (cognitive ceiling) tests: Evidence Store ontology + Scientific Task
 * DAG lifecycle + WorkflowMutation records + long-horizon restart reconstruction.
 * Pure JS (node:test) — no external engines required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as dag from './cognitive/taskGraph.mjs';
import * as wf from './cognitive/workflowMutation.mjs';
import { canonicalHash } from './provenance.mjs';

test('v9 migration: tables exist and PRAGMA user_version is 9', () => {
  const db = openDatabase(':memory:');
  const { user_version } = db.prepare('PRAGMA user_version').get();
  assert.equal(user_version, 9);
  const expected = ['research_missions', 'research_questions', 'hypotheses', 'evidence',
    'task_dag_nodes', 'task_dag_edges', 'task_state_transitions', 'workflow_mutations', 'mission_checkpoints'];
  for (const t of expected) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(t);
    assert.ok(row, `table ${t} should exist`);
  }
  // Additive: a pre-existing v8 table is untouched.
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='science_runs'").get());
  db.close();
});

test('Evidence Store: mission/question/hypothesis with content hashes; validation is strict', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'Characterize solubility of small aromatics', domain: 'chemistry' });
  assert.equal(m.contentHash, canonicalHash({ goal: m.goal, domain: 'chemistry', spec: {} }));

  const q = ev.addQuestion(db, { missionId: m.id, text: 'Does logP predict aqueous solubility here?' });
  assert.equal(q.status, 'open');

  const h = ev.addHypothesis(db, {
    missionId: m.id, questionId: q.id, label: 'H1',
    claim: 'logP is inversely correlated with solubility for this set',
    assumptions: ['no ionization at pH 7'], predictedObservations: ['higher logP -> lower solubility'],
    disconfirmingObservations: ['high logP AND high solubility'],
  });
  assert.equal(h.epistemicStatus, 'HYPOTHESIZED');
  assert.equal(h.status, 'open');
  assert.equal(h.confidence, null); // never fabricated

  assert.throws(() => ev.addHypothesis(db, { missionId: m.id, claim: 'x', epistemicStatus: 'DEFINITELY_TRUE' }), /invalid epistemic status/);
  db.close();
});

test('Evidence: canonical content hash + tamper detection; epistemic status required', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const e = ev.recordEvidence(db, {
    missionId: m.id, kind: 'computation', epistemicStatus: ev.EPISTEMIC_STATUS.COMPUTED,
    content: { descriptor: 'logP', value: 1.31, units: 'dimensionless' },
    source: 'RDKit 2026.03.3', origin: 'engine',
  });
  assert.equal(e.contentHash, canonicalHash({ descriptor: 'logP', value: 1.31, units: 'dimensionless' }));

  const integ = ev.verifyEvidenceIntegrity(db, e.id);
  assert.equal(integ.ok, true);

  // Simulate out-of-band tampering of stored content; integrity must catch it.
  db.prepare('UPDATE evidence SET content_json = ? WHERE id = ?').run(JSON.stringify({ descriptor: 'logP', value: 9.99 }), e.id);
  const tampered = ev.verifyEvidenceIntegrity(db, e.id);
  assert.equal(tampered.ok, false);
  assert.notEqual(tampered.recomputed, tampered.stored);

  assert.throws(() => ev.recordEvidence(db, { missionId: m.id, kind: 'nonsense', epistemicStatus: 'OBSERVED', content: {} }), /invalid evidence kind/);
  assert.throws(() => ev.recordEvidence(db, { missionId: m.id, kind: 'observation', epistemicStatus: 'BOGUS', content: {} }), /invalid epistemic status/);
  db.close();
});

test('Task DAG: no-dep task is READY; dependency blocks; completion auto-unblocks', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const a = dag.addTask(db, { missionId: m.id, title: 'compute descriptors', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'dock top candidates', taskType: 'compute' });
  assert.equal(a.state, 'READY');
  assert.equal(b.state, 'READY');

  dag.addDependency(db, m.id, a.id, b.id); // b depends on a
  assert.equal(dag.executionFrontier(db, m.id).map((t) => t.id).sort().join(','), [a.id].sort().join(','));
  assert.equal(db.prepare('SELECT state FROM task_dag_nodes WHERE id = ?').get(b.id).state, 'BLOCKED');

  dag.transition(db, a.id, 'RUNNING');
  dag.transition(db, a.id, 'COMPLETED');
  // b should now be auto-unblocked to READY.
  assert.equal(db.prepare('SELECT state FROM task_dag_nodes WHERE id = ?').get(b.id).state, 'READY');
  const frontier = dag.executionFrontier(db, m.id).map((t) => t.id);
  assert.deepEqual(frontier, [b.id]);
  db.close();
});

test('Task DAG: cycles are rejected; illegal transitions are rejected', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'B', taskType: 'compute' });
  dag.addDependency(db, m.id, a.id, b.id); // b depends on a
  assert.throws(() => dag.addDependency(db, m.id, b.id, a.id), /would create a cycle/);
  assert.throws(() => dag.addDependency(db, m.id, a.id, a.id), /would create a cycle/);

  dag.transition(db, a.id, 'RUNNING');
  dag.transition(db, a.id, 'COMPLETED');
  assert.throws(() => dag.transition(db, a.id, 'RUNNING'), /illegal transition/); // COMPLETED is terminal (except SUPERSEDED)
  const sup = dag.supersedeTask(db, a.id, 'replaced');
  assert.equal(sup.state, 'SUPERSEDED');
  db.close();
});

test('Task DAG: append-only transition audit accumulates', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute' });
  dag.transition(db, a.id, 'RUNNING');
  dag.transition(db, a.id, 'COMPLETED');
  const hist = db.prepare('SELECT to_state FROM task_state_transitions WHERE task_id = ? ORDER BY created_at ASC').all(a.id).map((r) => r.to_state);
  assert.deepEqual(hist, ['READY', 'RUNNING', 'COMPLETED']);
  db.close();
});

test('WorkflowMutation: recorded with previous workflow hash; result closes the loop', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute' });
  const prevHash = dag.workflowHash(db, m.id);
  const mut = wf.recordWorkflowMutation(db, {
    missionId: m.id, reason: 'diversity collapsed; broaden generator',
    triggeringEvidence: ['ev-123'], previousWorkflowHash: prevHash,
    proposed: { addTasks: ['broaden-scaffold'] }, expectedBenefit: { expectedInfoGain: 'high', computeDelta: '+1 stage', riskDelta: 'low' },
    rollback: { supersedeTasks: [] },
  });
  assert.equal(mut.previousWorkflowHash, prevHash);
  assert.equal(mut.verificationStatus, 'UNVERIFIED');
  assert.equal(mut.contentHash, canonicalHash({ reason: mut.reason, previousWorkflowHash: prevHash, proposed: mut.proposed, expectedBenefit: mut.expectedBenefit }));

  const done = wf.completeWorkflowMutation(db, mut.id, { actualResult: { diversityAfter: 0.42 }, verificationStatus: 'VERIFIED' });
  assert.equal(done.verificationStatus, 'VERIFIED');
  assert.deepEqual(done.actualResult, { diversityAfter: 0.42 });
  assert.ok(a); // referenced to keep the DAG non-trivial
  db.close();
});

test('Long-horizon: state survives a real DB restart; frontier reconstructs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-cog-'));
  const file = path.join(dir, 'mission.db');
  let missionId;
  try {
    // Session 1: build a mission, tasks with a dependency, evidence, checkpoint.
    const db1 = openDatabase(file);
    const m = ev.createMission(db1, { goal: 'long-horizon mission', domain: 'chemistry' });
    missionId = m.id;
    const q = ev.addQuestion(db1, { missionId: m.id, text: 'open Q' });
    ev.addHypothesis(db1, { missionId: m.id, questionId: q.id, claim: 'H1 claim' });
    const t1 = dag.addTask(db1, { missionId: m.id, title: 'stage 1', taskType: 'compute' });
    const t2 = dag.addTask(db1, { missionId: m.id, title: 'stage 2', taskType: 'compute' });
    dag.addDependency(db1, m.id, t1.id, t2.id);
    dag.transition(db1, t1.id, 'RUNNING');
    dag.transition(db1, t1.id, 'COMPLETED', 'done', { result: { ok: true } });
    ev.recordEvidence(db1, { missionId: m.id, kind: 'finding', epistemicStatus: 'COMPUTED', content: { x: 1 }, taskId: t1.id });
    dag.checkpoint(db1, m.id, 'after-stage-1');
    db1.close();

    // Session 2: reopen the same file — understanding must NOT reset.
    const db2 = openDatabase(file);
    assert.equal(db2.prepare('PRAGMA user_version').get().user_version, 9);
    const frontier = dag.executionFrontier(db2, missionId).map((t) => t.title);
    assert.deepEqual(frontier, ['stage 2'], 'frontier continues at the unfinished stage');
    const state = ev.reconstructMissionState(db2, missionId, { frontier: dag.executionFrontier(db2, missionId).map((t) => t.id) });
    assert.equal(state.mission.goal, 'long-horizon mission');
    assert.equal(state.counts.openQuestions, 1);
    assert.equal(state.counts.liveHypotheses, 1);
    assert.equal(state.counts.evidence, 1);
    assert.equal(state.counts.tasksByState.COMPLETED, 1);
    assert.equal(state.counts.tasksByState.READY, 1);
    assert.equal(state.latestCheckpoint.label, 'after-stage-1');
    assert.equal(state.latestCheckpoint.frontier.length, 1);
    db2.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
