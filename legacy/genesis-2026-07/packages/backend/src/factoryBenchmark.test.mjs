/**
 * Phase 3O — Discovery Factory Benchmark. 20 adversarial classes that try to make
 * ZEFIR lie: accept weak evidence, promote a candidate on one favorable score,
 * confuse MODEL_ESTIMATE with VERIFIED, treat a hypothesis as evidence, or repeat a
 * failed path. Genesis must resist. A failing assertion is a real integrity defect.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as dag from './cognitive/taskGraph.mjs';
import * as runner from './cognitive/campaignRunner.mjs';
import * as mf from './cognitive/molecularFunnel.mjs';
import * as he from './cognitive/hypothesisEngine.mjs';
import * as cs from './cognitive/criticSwarm.mjs';
import * as sb from './cognitive/sandboxLab.mjs';
import * as router from './cognitive/modelRouter.mjs';
import * as rl from './cognitive/resourceLayer.mjs';
import * as rb from './cognitive/realityBridge.mjs';

beforeEach(() => router.resetProviders());
const CLEAN = {
  validate: (s) => ({ ok: true, canonicalSmiles: s }),
  descriptors: () => ({ ok: true, data: { molWt: 250, crippenLogP: 2, lipinskiViolations: 0 } }),
  alerts: () => ({ ok: true, alerts: [], nAlerts: 0 }), novelty: () => ({ ok: true, maxTanimoto: null, nReference: 0 }),
  saScore: () => ({ ok: true, saScore: 2.5 }), admet: () => ({ ok: true, predictions: [{ hERG_drugbank_approved_percentile: 20 }], version: '2.0.1' }),
};
const chain = (db) => { const m = ev.createMission(db, { goal: 'g' }); const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute' }); const b = dag.addTask(db, { missionId: m.id, title: 'B', taskType: 'compute' }); dag.addDependency(db, m.id, a.id, b.id); return { m, a, b }; };
const complete = () => ({ status: 'COMPLETED', computeMs: 5 });

test('FB01 autonomous DAG execution', () => { const db = openDatabase(':memory:'); const { m } = chain(db); assert.equal(runner.runCampaign(db, m.id, { executor: complete }).status, 'COMPLETED'); db.close(); });

test('FB02 safe restart + FB03 no duplicate work after recovery', () => {
  const db = openDatabase(':memory:'); const { m } = chain(db); const c = {};
  const exec = (d, t) => { c[t.id] = (c[t.id] ?? 0) + 1; return complete(); };
  runner.runCampaign(db, m.id, { executor: exec, budgets: { maxIterations: 1 } });
  runner.runCampaign(db, m.id, { executor: exec });
  assert.ok(Object.values(c).every((n) => n === 1)); db.close();
});

test('FB04 candidate rejection (physicochemical liability)', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'X', engines: { ...CLEAN, descriptors: () => ({ ok: true, data: { molWt: 900, crippenLogP: 9, lipinskiViolations: 3 } }) } });
  assert.equal(r.decision, 'REJECT'); db.close();
});

test('FB05 contradictory engine evidence contradicts the hypothesis', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' }); const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -1 } });
  assert.equal(he.evaluateHypothesesAgainstEvidence(db, m.id, { questionId: q.id }).find((r) => r.label === 'H1').status, 'contradicted'); db.close();
});

test('FB06 misleading favorable score cannot promote a contradicted candidate', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' }); const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  const h1 = he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id }).hypotheses[0];
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -1 }, confidence: 0.99 });
  assert.equal(cs.critiqueHypothesis(db, m.id, h1.id).decision, 'REJECT'); db.close();
});

test('FB07 ADMET concern is recorded as MODEL_ESTIMATE, never VERIFIED', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'Y', engines: { ...CLEAN, admet: () => ({ ok: true, predictions: [{ hERG_drugbank_approved_percentile: 95 }], version: '2.0.1' }) } });
  const admetStage = r.stages.find((s) => s.stage === 'ADMET_MODEL_ESTIMATE');
  assert.equal(admetStage.epistemicClass, 'MODEL_ESTIMATE');
  assert.notEqual(admetStage.epistemicClass, 'VERIFIED'); db.close();
});

test('FB08 off-target + FB09 insufficient target coverage → not fabricated', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'CCO', engines: CLEAN });
  const t = r.stages.find((s) => s.stage === 'TARGET_COMPUTATION');
  assert.equal(t.status, 'BLOCKED_BY_RESOURCES'); assert.match(t.output.note, /SELECTIVITY_NOT_ASSESSED|INSUFFICIENT_TARGET_COVERAGE'?/); db.close();
});

test('FB10 novelty not assessed when reference data absent', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'CCO', engines: CLEAN, referenceSet: [] });
  assert.equal(r.stages.find((s) => s.stage === 'STRUCTURAL_NOVELTY').status, 'BLOCKED_BY_RESOURCES'); db.close();
});

test('FB11 negative-result path avoidance (known motif skipped)', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  const bad = { ...CLEAN, descriptors: () => ({ ok: true, data: { molWt: 900, crippenLogP: 9, lipinskiViolations: 3 } }) };
  mf.runFunnel(db, { missionId: m.id, smiles: 'REPEAT', engines: bad });
  const second = mf.runFunnel(db, { missionId: m.id, smiles: 'REPEAT', engines: CLEAN });
  assert.ok(second.signals.knownMotif); assert.ok(second.stages.some((s) => s.status === 'SKIPPED_BY_POLICY')); db.close();
});

test('FB12 compute budget exhaustion pauses', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute', engine: 'qc', computeEstimate: { ms: 1000 } });
  assert.equal(runner.runCampaign(db, m.id, { executor: () => ({ status: 'COMPLETED', computeMs: 1000 }), budgets: { computeMs: 500 } }).status, 'PAUSED_BUDGET'); db.close();
});

test('FB13 model provider unavailable → CAPABILITY_GAP', () => {
  const db = openDatabase(':memory:'); assert.equal(router.route(db, { role: router.MODEL_ROLE.REASONING }).status, 'CAPABILITY_GAP'); db.close();
});

test('FB14 scientific resource unavailable → BLOCKED_BY_RESOURCES', () => {
  const db = openDatabase(':memory:');
  assert.equal(rl.requestRemote(db, { resourceId: 'r', url: 'https://files.rcsb.org/x.pdb' }).status, 'BLOCKED_BY_RESOURCES'); db.close();
});

test('FB15 sandbox promotion rejection (unverified never enters main)', () => {
  const db = openDatabase(':memory:'); const main = ev.createMission(db, { goal: 'm' }); const s = sb.createSandbox(db, { parentMissionId: main.id, goal: 's' });
  const e = ev.recordEvidence(db, { missionId: s.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { a: 1 } });
  assert.equal(sb.promoteEvidence(db, e.id, { targetMissionId: main.id }).decision, 'HELD');
  assert.equal(store.listEvidence(db, main.id).length, 0); db.close();
});

test('FB16 experimental-result import integrity (typed claim rejected)', () => {
  const db = openDatabase(':memory:');
  assert.equal(rb.importExperimentalResult(db, { externalId: 'x', labIdentity: 'L', protocolRef: 'P', candidateId: 'c', measurementType: 'IC50', resultClass: 'BINDING_ASSAY' }).ok, false);
  assert.equal(rb.importExperimentalResult(db, { externalId: 'x', labIdentity: 'L', protocolRef: 'P', candidateId: 'c', measurementType: 'IC50', resultClass: 'BINDING_ASSAY', resultValue: 10, artifactRef: 'a', artifactHash: 'h' }).ok, true); db.close();
});

test('FB17 prediction-vs-measurement error recording', () => {
  const db = openDatabase(':memory:'); rb.recordPredictionError(db, { candidateId: 'c', measurementType: 'IC50', predicted: 100, measured: 120, strategyKey: 'S' });
  assert.equal(rb.predictionPerformance(db, 'S').meanAbsError, 20); db.close();
});

test('FB18 dossier completeness + FB19 Translational Gap Warning enforcement', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'CCO', engines: CLEAN });
  const d = mf.buildDossier(db, r.candidate.id);
  assert.equal(d.TRANSLATIONAL_GAP_WARNING, mf.TRANSLATIONAL_GAP_WARNING);
  assert.ok(d.provenanceChain.length >= 5 && d.croHandoffReadiness && d.contentHash); db.close();
});

test('FB20 end-to-end autonomous campaign eliminates a liability, survives a clean one', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  const t1 = dag.addTask(db, { missionId: m.id, title: 'c-bad', taskType: 'compute', engine: 'molecular-descriptors' });
  const t2 = dag.addTask(db, { missionId: m.id, title: 'c-good', taskType: 'compute', engine: 'molecular-descriptors' });
  const smilesFor = { [t1.id]: 'BAD', [t2.id]: 'GOOD' };
  const decisions = [];
  const exec = (d, task) => {
    const bad = task.id === t1.id;
    const engines = bad ? { ...CLEAN, descriptors: () => ({ ok: true, data: { molWt: 900, crippenLogP: 9, lipinskiViolations: 3 } }) } : CLEAN;
    decisions.push(mf.runFunnel(d, { missionId: m.id, smiles: smilesFor[task.id], engines }).decision);
    return complete();
  };
  runner.runCampaign(db, m.id, { executor: exec, capabilityResolver: () => true });
  assert.ok(decisions.includes('REJECT') && decisions.includes('SURVIVES_CURRENT_COMPUTATIONAL_REVIEW'), 'campaign both eliminated and survived candidates');
  db.close();
});

// Adversarial meta-checks: try to make Genesis confuse categories.
test('FB-ADV a hypothesis is not evidence; malformed evidence is rejected', () => {
  const db = openDatabase(':memory:'); const m = ev.createMission(db, { goal: 'g' });
  ev.addHypothesis(db, { missionId: m.id, claim: 'H', disconfirmingObservations: [{ metric: 'x', op: '<', value: 1 }] });
  // hypotheses live in their own table; they are not evidence rows
  assert.equal(store.listEvidence(db, m.id).length, 0);
  assert.throws(() => ev.recordEvidence(db, { missionId: m.id, kind: 'proof', epistemicStatus: 'VERIFIED', content: {} }), /invalid evidence kind/);
  db.close();
});
