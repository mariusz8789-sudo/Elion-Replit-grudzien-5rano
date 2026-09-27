/**
 * Priority 10 (Meta-Orchestrator) tests. Deterministic; distinct failure classes,
 * cross-run scoring, traceable recommendation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as dag from './cognitive/taskGraph.mjs';
import * as planner from './cognitive/missionPlanner.mjs';
import * as meta from './cognitive/metaOrchestrator.mjs';

test('v12 migration: strategy_records table exists, schema >= 12', () => {
  const db = openDatabase(':memory:');
  assert.ok(db.prepare('PRAGMA user_version').get().user_version >= 12);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_records'").get());
  db.close();
});

test('distinguishes CAPABILITY_GAP (all engines unavailable) from ENGINE_FAILURE (a task failed)', () => {
  const db = openDatabase(':memory:');
  // all compute tasks unavailable → CAPABILITY_GAP
  const m1 = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => false }).mission;
  assert.equal(meta.classifyOutcome(db, m1.id).outcomeClass, 'CAPABILITY_GAP');

  // engines available but a task FAILED → ENGINE_FAILURE
  const m2 = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
  const seed = dag.executionFrontier(db, m2.id)[0];
  dag.transition(db, seed.id, 'RUNNING');
  dag.transition(db, seed.id, 'FAILED', 'engine error');
  assert.equal(meta.classifyOutcome(db, m2.id).outcomeClass, 'ENGINE_FAILURE');
  db.close();
});

test('SUCCESS requires verified evidence AND an accepted/supported hypothesis', () => {
  const db = openDatabase(':memory:');
  const m = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
  const h = store.listHypotheses(db, m.id)[0];
  ev.updateHypothesisStatus(db, h.id, { status: 'supported', epistemicStatus: 'SUPPORTED' });
  const e = ev.recordEvidence(db, { missionId: m.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { x: 1 }, scienceRunId: 'r1' });
  ev.setEvidenceVerification(db, e.id, 'VERIFIED');
  const c = meta.classifyOutcome(db, m.id);
  assert.equal(c.outcomeClass, 'SUCCESS');
  assert.ok(c.metrics.verifiedEvidence >= 1);
  db.close();
});

test('INSUFFICIENT_EVIDENCE when nothing is verified but questions remain', () => {
  const db = openDatabase(':memory:');
  const m = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
  assert.equal(meta.classifyOutcome(db, m.id).outcomeClass, 'INSUFFICIENT_EVIDENCE');
  db.close();
});

test('cross-run strategy scoring aggregates outcomes and recommends with traceable reasons', () => {
  const db = openDatabase(':memory:');
  // Two SUCCESS runs and one INSUFFICIENT for the same strategy key.
  for (let i = 0; i < 2; i++) {
    const m = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
    const h = store.listHypotheses(db, m.id)[0];
    ev.updateHypothesisStatus(db, h.id, { status: 'accepted', epistemicStatus: 'SUPPORTED' });
    const e = ev.recordEvidence(db, { missionId: m.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { x: i }, scienceRunId: `r${i}` });
    ev.setEvidenceVerification(db, e.id, 'VERIFIED');
    meta.recordOutcome(db, m.id);
  }
  const m3 = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
  meta.recordOutcome(db, m3.id); // INSUFFICIENT

  const key = meta.strategyKey(db, m3.id);
  const s = meta.scoreStrategy(db, key);
  assert.equal(s.runs, 3);
  assert.ok(s.successRate > 0 && s.successRate < 1);
  assert.ok(s.meanScore > 0);

  const rec = meta.recommendStrategy(db, 'drug-discovery');
  assert.equal(rec.recommendation, key);
  assert.match(rec.reason, /mean score|success rate/);
  assert.ok(rec.evidenceRefs.length >= 1, 'recommendation cites mission evidence refs');
  db.close();
});

test('recommendStrategy with no history → honest gap, no fabricated recommendation', () => {
  const db = openDatabase(':memory:');
  const rec = meta.recommendStrategy(db, 'materials');
  assert.equal(rec.recommendation, null);
  assert.match(rec.reason, /no prior strategy history|CAPABILITY_GAP/);
  db.close();
});

/* ---- Regression: funnel-campaign outcome mapping (Commercial Hardening Phase 5) ---- */
import * as mf from './cognitive/molecularFunnel.mjs';

// A candidate the real deterministic critic rejects (heavy + very lipophilic + 3 Lipinski violations).
const REJECT_ENGINES = {
  validate: (s) => ({ ok: true, canonicalSmiles: s }),
  descriptors: () => ({ ok: true, data: { molWt: 900, crippenLogP: 8, lipinskiViolations: 3, canonicalSmiles: 'x' } }),
  alerts: () => ({ ok: true, alerts: [], nAlerts: 0, engine: 'RDKit' }),
  novelty: () => ({ ok: true, maxTanimoto: null, nReference: 0 }),
  saScore: () => ({ ok: true, saScore: 2.5 }),
  admet: () => ({ ok: true, predictions: [{ hERG_drugbank_approved_percentile: 20 }], version: '2.0.1' }),
};

test('regression: funnel that rejects EVERY candidate is a valid completion, NOT MISSION_FAILURE', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'kill-them-all' });
  mf.runFunnel(db, { missionId: m.id, smiles: 'BIGMOL1', engines: REJECT_ENGINES });
  mf.runFunnel(db, { missionId: m.id, smiles: 'BIGMOL2', engines: REJECT_ENGINES });
  const c = meta.classifyOutcome(db, m.id);
  assert.notEqual(c.outcomeClass, 'MISSION_FAILURE'); // the defect: this used to be MISSION_FAILURE
  assert.equal(c.outcomeClass, 'FUNNEL_COMPLETE');    // decisive rejection = valid negative result
  assert.match(c.reasons.join(' '), /valid negative result|reached a terminal decision/);
  db.close();
});

test('regression: a surviving candidate makes the funnel a SUCCESS', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'find-one' });
  mf.runFunnel(db, { missionId: m.id, smiles: 'CCO', engines: {
    validate: (s) => ({ ok: true, canonicalSmiles: s }),
    descriptors: () => ({ ok: true, data: { molWt: 250, crippenLogP: 2.1, lipinskiViolations: 0, canonicalSmiles: 'x' } }),
    alerts: () => ({ ok: true, alerts: [], nAlerts: 0, engine: 'RDKit' }),
    novelty: () => ({ ok: true, maxTanimoto: null, nReference: 0 }),
    saScore: () => ({ ok: true, saScore: 2.5 }),
    admet: () => ({ ok: true, predictions: [{ hERG_drugbank_approved_percentile: 20 }], version: '2.0.1' }),
  } });
  assert.equal(meta.classifyOutcome(db, m.id).outcomeClass, 'SUCCESS');
  db.close();
});

test('regression: genuine failure path preserved — candidate with no decision stays MISSION_FAILURE', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'broken-funnel' });
  // Persist a candidate that never ran to any stage/decision (default surviving, no stages).
  store.saveFunnelCandidate(db, { missionId: m.id, canonicalSmiles: 'CCO', molecularHash: 'deadbeef01' });
  assert.equal(meta.classifyOutcome(db, m.id).outcomeClass, 'MISSION_FAILURE');
  db.close();
});

test('regression: partially-run funnel is INSUFFICIENT_EVIDENCE, honestly incomplete', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'half-run' });
  mf.runFunnel(db, { missionId: m.id, smiles: 'BIGMOL1', engines: REJECT_ENGINES }); // decided (rejected)
  store.saveFunnelCandidate(db, { missionId: m.id, canonicalSmiles: 'CCN', molecularHash: 'undecided99' }); // undecided
  assert.equal(meta.classifyOutcome(db, m.id).outcomeClass, 'INSUFFICIENT_EVIDENCE');
  db.close();
});
