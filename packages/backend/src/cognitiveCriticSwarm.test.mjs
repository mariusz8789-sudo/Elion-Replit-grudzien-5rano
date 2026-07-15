/**
 * Priority 5 (Independent Critic Swarm) tests. Deterministic; no engines.
 * The Hypothesis Engine proposes; the swarm is the independent judge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as he from './cognitive/hypothesisEngine.mjs';
import * as cs from './cognitive/criticSwarm.mjs';
import * as store from './store.mjs';

function mission(db) { return ev.createMission(db, { goal: 'g' }); }

test('decide(): falsifiability/contradiction fail → REJECT; concerns → REVISE; clean → ACCEPT', () => {
  assert.equal(cs.decide([{ lens: 'contradictory-evidence', verdict: 'fail' }]), 'REJECT');
  assert.equal(cs.decide([{ lens: 'falsifiability', verdict: 'fail' }]), 'REJECT');
  assert.equal(cs.decide([{ lens: 'a', verdict: 'fail' }, { lens: 'b', verdict: 'fail' }]), 'REJECT');
  assert.equal(cs.decide([{ lens: 'stated-assumptions', verdict: 'concern' }]), 'REVISE');
  assert.equal(cs.decide([{ lens: 'x', verdict: 'pass' }]), 'ACCEPT');
});

test('supported hypothesis with a competitor and no contradiction → ACCEPT (by the swarm, not the proposer)', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  const gen = he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  const h1 = gen.hypotheses.find((h) => h.label === 'H1');
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -7.0 } });
  const { critiques, decision } = cs.critiqueHypothesis(db, m.id, h1.id);
  assert.equal(decision, 'ACCEPT');
  // acceptance is recorded on the hypothesis, and only the swarm sets it
  assert.equal(store.getHypothesis(db, h1.id).status, 'accepted');
  // every critique persisted as its own evidence object (append-only, independent)
  const critiqueEvidence = store.listEvidence(db, m.id, { hypothesisId: h1.id });
  assert.equal(critiqueEvidence.length, critiques.length);
  assert.ok(critiqueEvidence.every((e) => e.content.critic && e.origin === 'agent'));
  db.close();
});

test('contradicted hypothesis → REJECT', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  const gen = he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  const h1 = gen.hypotheses.find((h) => h.label === 'H1');
  // weak binding contradicts H1's "binds favorably" claim
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -1.0 } });
  const { decision } = cs.critiqueHypothesis(db, m.id, h1.id);
  assert.equal(decision, 'REJECT');
  assert.equal(store.getHypothesis(db, h1.id).status, 'rejected');
  db.close();
});

test('unfalsifiable, lone hypothesis → REJECT (falsifiability hard-fail)', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const h = ev.addHypothesis(db, { missionId: m.id, claim: 'It will work somehow', assumptions: [], predictedObservations: [], disconfirmingObservations: [] });
  const { decision, critiques } = cs.critiqueHypothesis(db, m.id, h.id);
  assert.equal(decision, 'REJECT');
  assert.ok(critiques.find((c) => c.lens === 'falsifiability').verdict === 'fail');
  assert.ok(critiques.find((c) => c.lens === 'alternative-explanation').verdict === 'concern');
  db.close();
});

test('a falsifiable hypothesis with an untested prediction and no competitor → REVISE (not accepted)', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const h = ev.addHypothesis(db, {
    missionId: m.id, claim: 'metric M stays below 5', assumptions: ['linear regime'],
    predictedObservations: [{ metric: 'M', op: '<', value: 5 }],
    disconfirmingObservations: [{ metric: 'M', op: '>=', value: 5 }],
  });
  // no evidence recorded → untested; lone hypothesis → alternative-explanation concern
  const { decision } = cs.critiqueHypothesis(db, m.id, h.id);
  assert.equal(decision, 'REVISE');
  assert.notEqual(store.getHypothesis(db, h.id).status, 'accepted');
  assert.equal(store.getHypothesis(db, h.id).epistemicStatus, 'PROVISIONAL');
  db.close();
});
