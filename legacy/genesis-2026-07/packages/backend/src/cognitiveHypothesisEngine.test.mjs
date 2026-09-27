/**
 * Priority 4 (Competing Hypothesis Engine) tests. Deterministic; no engines.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as he from './cognitive/hypothesisEngine.mjs';

function mission(db) { return ev.createMission(db, { goal: 'g' }); }

test('evalPredicate: true/false when evaluable, null when not', () => {
  assert.equal(he.evalPredicate({ metric: 'x', op: '<=', value: -6 }, { x: -7 }), true);
  assert.equal(he.evalPredicate({ metric: 'x', op: '<=', value: -6 }, { x: -2 }), false);
  assert.equal(he.evalPredicate({ metric: 'x', op: '<=', value: -6 }, { y: 1 }), null); // metric absent
  assert.equal(he.evalPredicate({ metric: 'x', op: '??', value: 1 }, { x: 1 }), null); // unknown op
});

test('generates a genuinely competing hypothesis set with opposite predictions', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const q = ev.addQuestion(db, { missionId: m.id, text: 'do property-favorable candidates bind?' });
  const out = he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  assert.equal(out.status, 'generated');
  assert.equal(out.hypotheses.length, 2);
  const [h1, h2] = out.hypotheses;
  // H1 predicts favorable binding; H2 predicts the opposite on the SAME metric.
  assert.equal(h1.predictedObservations[0].metric, 'dockingAffinity');
  assert.equal(h2.predictedObservations[0].metric, 'dockingAffinity');
  assert.notEqual(h1.predictedObservations[0].op, h2.predictedObservations[0].op);
  // Each carries a disconfirming prediction (falsifiability).
  assert.ok(h1.disconfirmingObservations.length >= 1 && h2.disconfirmingObservations.length >= 1);
  db.close();
});

test('strong-binding evidence supports H1 and contradicts H2', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -7.2 }, source: 'Vina' });
  const res = he.evaluateHypothesesAgainstEvidence(db, m.id, { questionId: q.id });
  const byLabel = Object.fromEntries(res.map((r) => [r.label, r]));
  assert.equal(byLabel.H1.status, 'supported');
  assert.equal(byLabel.H2.status, 'contradicted');
  db.close();
});

test('weak-binding evidence contradicts H1 and supports H2 (symmetry)', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -1.5 }, source: 'Vina' });
  const res = he.evaluateHypothesesAgainstEvidence(db, m.id, { questionId: q.id });
  const byLabel = Object.fromEntries(res.map((r) => [r.label, r]));
  assert.equal(byLabel.H1.status, 'contradicted');
  assert.equal(byLabel.H2.status, 'supported');
  db.close();
});

test('falsification dominates: one disconfirming observation contradicts even amid support', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  // Two supporting-strength and one weak (disconfirming for H1) observation.
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -7.0 } });
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -6.5 } });
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -1.0 } }); // disconfirms H1
  const res = he.evaluateHypothesesAgainstEvidence(db, m.id, { questionId: q.id });
  const h1 = res.find((r) => r.label === 'H1');
  assert.ok(h1.contradicted >= 1);
  assert.equal(h1.status, 'contradicted', 'a single disconfirming observation falsifies H1');
  db.close();
});

test('unknown template → explicit CAPABILITY_GAP, no fabricated hypotheses', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const out = he.generateCompetingHypotheses(db, { missionId: m.id, template: 'quantum-gravity-unification' });
  assert.equal(out.status, 'CAPABILITY_GAP');
  assert.equal(out.hypotheses.length, 0);
  assert.match(out.reason, /Model Router/);
  db.close();
});
