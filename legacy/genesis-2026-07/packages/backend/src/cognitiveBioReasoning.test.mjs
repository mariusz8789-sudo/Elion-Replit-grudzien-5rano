/**
 * Phase 3D (Bio Foundation) + 3B (Reasoning Contracts) tests. Deterministic.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as bio from './cognitive/bioFoundation.mjs';
import * as rc from './cognitive/reasoningContracts.mjs';
import * as router from './cognitive/modelRouter.mjs';

beforeEach(() => router.resetProviders());

/* ---- Bio Foundation ---- */
test('v17: bio entities + relations with explicit evidence class; KNOWN_FROM_SOURCE needs a source', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const disease = bio.addEntity(db, { missionId: m.id, entityType: 'DISEASE', name: 'dengue', evidenceClass: 'KNOWN_FROM_SOURCE', source: 'SYNTHETIC_TEST_FIXTURE' });
  const target = bio.addEntity(db, { missionId: m.id, entityType: 'TARGET', name: 'NS5', evidenceClass: 'WEAK_HYPOTHESIS' });
  bio.addRelation(db, { missionId: m.id, fromEntity: disease.id, toEntity: target.id, relationType: 'implicates', evidenceClass: 'WEAK_HYPOTHESIS' });
  assert.equal(bio.listEntities(db, m.id).length, 2);
  assert.equal(bio.listRelations(db, m.id).length, 1);
  assert.throws(() => bio.addEntity(db, { missionId: m.id, entityType: 'GENE', name: 'X', evidenceClass: 'KNOWN_FROM_SOURCE' }), /requires a source/);
  assert.throws(() => bio.addEntity(db, { missionId: m.id, entityType: 'NONSENSE', name: 'X', evidenceClass: 'UNKNOWN' }), /invalid bio entity type/);
  db.close();
});

test('next-best-experiment picks the most discriminating available experiment', () => {
  const hypotheses = [
    { id: 'H1', predictedObservations: ['obsA', 'obsB'] },
    { id: 'H2', predictedObservations: ['obsA'] },
    { id: 'H3', predictedObservations: [] },
  ];
  const experiments = [
    { id: 'E-A', observation: 'obsA' }, // predicted by 2/3 (split 2/1)
    { id: 'E-B', observation: 'obsB' }, // predicted by 1/3 (split 1/2) — but more balanced? |1-2|/3
    { id: 'E-C', observation: 'obsC' }, // predicted by 0/3 (no discrimination)
  ];
  const r = bio.nextBestExperiment({ hypotheses, availableExperiments: experiments });
  assert.equal(r.ok, true);
  assert.notEqual(r.recommendation.id, 'E-C', 'a non-discriminating experiment is not chosen');
  assert.ok(r.discriminationProxy > 0);
});

test('next-best-experiment with no available experiment → BLOCKED_BY_RESOURCES', () => {
  const r = bio.nextBestExperiment({ hypotheses: [{ id: 'H1' }, { id: 'H2' }], availableExperiments: [] });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'BLOCKED_BY_RESOURCES');
});

/* ---- Reasoning Contracts ---- */
test('reasoning role without a provider → CAPABILITY_GAP, no fabricated output', () => {
  const db = openDatabase(':memory:');
  const r = rc.runReasoning(db, { role: rc.REASONING_ROLE.SCIENTIFIC_GOAL_DECOMPOSER, input: { goal: 'x' } });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'CAPABILITY_GAP');
  assert.equal(r.invocation.status, 'CAPABILITY_GAP');
  assert.equal(r.invocation.output, null, 'no invented model output');
  db.close();
});

test('with a provider, output is MODEL_GENERATED_* and is NEVER evidence/verified', () => {
  const db = openDatabase(':memory:');
  router.registerProvider({ id: 'fake', modelId: 'fake-1', roles: [router.MODEL_ROLE.REASONING], available: () => true, complete: () => ({ text: { questions: ['q1'] }, usage: { tokensIn: 5, tokensOut: 3 } }) });
  const r = rc.runReasoning(db, { role: rc.REASONING_ROLE.CHEMICAL_STRATEGY_PROPOSER, input: { goal: 'x' }, evidenceRefs: [{ ref: 'e1' }] });
  assert.equal(r.ok, true);
  assert.equal(r.output.kind, 'MODEL_GENERATED_PROPOSAL');
  assert.equal(r.output.isEvidence, false);
  assert.equal(r.output.isVerified, false);
  assert.ok(/^[0-9a-f]{64}$/.test(r.invocation.outputHash));
  assert.throws(() => rc.assertNotEvidence({ isEvidence: true }), /never be marked evidence/);
  db.close();
});

test('proposer roles are disjoint from judge roles', () => {
  for (const p of rc.PROPOSER) assert.ok(!rc.JUDGE.has(p));
});
