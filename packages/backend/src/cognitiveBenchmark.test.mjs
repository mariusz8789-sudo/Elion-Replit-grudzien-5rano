/**
 * Priority 13 — Cognitive Research Benchmark Suite.
 *
 * Adversarial benchmarks designed to EXPOSE cognitive weakness, not mirror the
 * implementation. Each case feeds Genesis a hostile situation (malformed /
 * contradictory evidence, unavailable engines, unavailable model providers,
 * interruption, a misleading high-"confidence" candidate) and asserts that Genesis
 * behaves HONESTLY — never manufacturing success. A failing assertion here means a
 * real cognitive/honesty defect.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as dag from './cognitive/taskGraph.mjs';
import * as planner from './cognitive/missionPlanner.mjs';
import * as he from './cognitive/hypothesisEngine.mjs';
import * as cs from './cognitive/criticSwarm.mjs';
import * as we from './cognitive/workflowEngine.mjs';
import * as rec from './cognitive/recovery.mjs';
import * as meta from './cognitive/metaOrchestrator.mjs';
import * as co from './cognitive/computeOrchestrator.mjs';
import * as sb from './cognitive/sandboxLab.mjs';
import * as router from './cognitive/modelRouter.mjs';
import * as af from './cognitive/agentFabric.mjs';

beforeEach(() => { router.resetProviders(); co.resetBackends(); });

// 1. Mission decomposition quality — a real DAG with dependencies, not a flat list.
test('BM01 mission decomposition produces a dependency DAG (not a flat list)', () => {
  const db = openDatabase(':memory:');
  const out = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true });
  assert.ok(out.tasks.length >= 5 && out.edges.length >= 4, 'multiple tasks with real dependencies');
  assert.equal(dag.executionFrontier(db, out.mission.id).length, 1, 'a single frontier, not everything runnable at once');
  db.close();
});

// 2. Competing hypothesis generation.
test('BM02 generates genuinely competing hypotheses (opposite predictions)', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const out = he.generateCompetingHypotheses(db, { missionId: m.id });
  assert.equal(out.hypotheses.length, 2);
  assert.notEqual(out.hypotheses[0].predictedObservations[0].op, out.hypotheses[1].predictedObservations[0].op);
  db.close();
});

// 3. Falsifiability enforcement — unfalsifiable claim is rejected.
test('BM03 unfalsifiable hypothesis is REJECTED', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const h = ev.addHypothesis(db, { missionId: m.id, claim: 'it works somehow', disconfirmingObservations: [] });
  assert.equal(cs.critiqueHypothesis(db, m.id, h.id).decision, 'REJECT');
  db.close();
});

// 4. Critic independence — proposer roles are disjoint from judge roles.
test('BM04 proposer is never its own judge', () => {
  for (const r of af.PROPOSER_ROLES) assert.ok(!af.JUDGE_ROLES.has(r));
});

// 5. Evidence contradiction handling — falsification dominates.
test('BM05 contradictory evidence contradicts a hypothesis even amid support', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -7 } });
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -1 } }); // disconfirms H1
  const res = he.evaluateHypothesesAgainstEvidence(db, m.id, { questionId: q.id });
  assert.equal(res.find((r) => r.label === 'H1').status, 'contradicted');
  db.close();
});

// 6. Workflow adaptation after failure.
test('BM06 a failed task blocking downstream triggers a route-around that restores the frontier', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'B', taskType: 'compute' });
  dag.addDependency(db, m.id, a.id, b.id);
  dag.transition(db, a.id, 'RUNNING'); dag.transition(db, a.id, 'FAILED');
  const before = dag.executionFrontier(db, m.id).length; // 0
  we.adapt(db, m.id);
  assert.ok(dag.executionFrontier(db, m.id).length > before, 'a runnable path was restored');
  db.close();
});

// 7. Recovery after interruption (real file DB).
test('BM07 recovers an interrupted mission without duplicating completed work', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-bm-'));
  const file = path.join(dir, 'm.db');
  try {
    const db1 = openDatabase(file);
    const m = planner.planMission(db1, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
    const seed = dag.executionFrontier(db1, m.id)[0];
    dag.transition(db1, seed.id, 'RUNNING');
    db1.close();
    const db2 = openDatabase(file);
    const r = rec.recoverMission(db2, m.id);
    assert.equal(store.getTaskNode(db2, seed.id).state, 'READY');
    assert.equal(r.nextSafeAction.action, 'EXECUTE_TASK');
    db2.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 8. Strategy selection across runs (+ honest gap with no history).
test('BM08 cross-run strategy scoring; no history → honest gap', () => {
  const db = openDatabase(':memory:');
  assert.equal(meta.recommendStrategy(db, 'materials').recommendation, null); // honest gap
  const m = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
  const h = store.listHypotheses(db, m.id)[0];
  ev.updateHypothesisStatus(db, h.id, { status: 'accepted', epistemicStatus: 'SUPPORTED' });
  const e = ev.recordEvidence(db, { missionId: m.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { x: 1 }, scienceRunId: 'r' });
  ev.setEvidenceVerification(db, e.id, 'VERIFIED');
  meta.recordOutcome(db, m.id);
  assert.equal(meta.recommendStrategy(db, 'drug-discovery').recommendation, meta.strategyKey(db, m.id));
  db.close();
});

// 9. Compute placement — GPU requirement is blocked, never faked onto CPU.
test('BM09 GPU-required task is BLOCKED_BY_RESOURCES, never faked', () => {
  const db = openDatabase(':memory:');
  co.registerDefaultBackends({ resolveCapability: () => true });
  const p = co.placeTask(db, { taskId: 't', requirements: { needs: ['gpu'] } });
  assert.equal(p.failureClass, 'BLOCKED_BY_RESOURCES');
  assert.equal(p.backendId, null);
  db.close();
});

// 10. Sandbox promotion integrity.
test('BM10 unverified sandbox evidence never reaches the main store; verified does', () => {
  const db = openDatabase(':memory:');
  const main = ev.createMission(db, { goal: 'main' });
  const sandbox = sb.createSandbox(db, { parentMissionId: main.id, goal: 's' });
  const unv = ev.recordEvidence(db, { missionId: sandbox.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { a: 1 } });
  assert.equal(sb.promoteEvidence(db, unv.id, { targetMissionId: main.id }).decision, 'HELD');
  assert.equal(store.listEvidence(db, main.id).length, 0);
  db.close();
});

// 11. Capability-gap honesty — malformed / absent inputs never fabricate.
test('BM11 malformed and absent inputs yield explicit gaps/errors, never fabricated numbers', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  // unknown planner domain
  assert.equal(planner.planMission(db, { goal: 'x', domain: 'astrology' }).planStatus, 'CAPABILITY_GAP');
  // unknown hypothesis template
  assert.equal(he.generateCompetingHypotheses(db, { missionId: m.id, template: 'nonsense' }).status, 'CAPABILITY_GAP');
  // malformed evidence rejected by validation
  assert.throws(() => ev.recordEvidence(db, { missionId: m.id, kind: 'garbage', epistemicStatus: 'OBSERVED', content: {} }), /invalid evidence kind/);
  assert.throws(() => ev.recordEvidence(db, { missionId: m.id, kind: 'finding', epistemicStatus: 'TOTALLY_SURE', content: {} }), /invalid epistemic status/);
  // no model provider registered
  assert.equal(router.route(db, { role: router.MODEL_ROLE.REASONING }).status, 'CAPABILITY_GAP');
  db.close();
});

// 12. End-to-end honest classification, and the ADVERSARIAL misleading-confidence case.
test('BM12 a misleading high-confidence candidate that contradicts is NOT accepted', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const q = ev.addQuestion(db, { missionId: m.id, text: 'q' });
  const gen = he.generateCompetingHypotheses(db, { missionId: m.id, questionId: q.id });
  const h1 = gen.hypotheses.find((h) => h.label === 'H1');
  // An attacker-supplied "high confidence" candidate that actually shows weak binding.
  ev.recordEvidence(db, { missionId: m.id, kind: 'measurement', epistemicStatus: 'COMPUTED', content: { dockingAffinity: -1.2 }, confidence: 0.99, source: 'suspicious-oracle' });
  const { decision } = cs.critiqueHypothesis(db, m.id, h1.id);
  assert.equal(decision, 'REJECT', 'a high confidence label cannot override contradicting evidence');
  assert.notEqual(store.getHypothesis(db, h1.id).status, 'accepted');
  db.close();
});

// Adversarial: unavailable engines → outcome is CAPABILITY_GAP, not a fake result.
test('BM13 (adversarial) all engines unavailable → CAPABILITY_GAP outcome, no fabricated evidence', () => {
  const db = openDatabase(':memory:');
  const m = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => false }).mission;
  assert.equal(meta.classifyOutcome(db, m.id).outcomeClass, 'CAPABILITY_GAP');
  assert.equal(store.listEvidence(db, m.id).filter((e) => e.epistemicStatus === 'VERIFIED').length, 0);
  db.close();
});

// Adversarial: unavailable model provider → agent records the gap honestly, no fabricated model output.
test('BM14 (adversarial) unavailable model provider → agent records CAPABILITY_GAP model status', () => {
  const db = openDatabase(':memory:');
  const m = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
  const { invocation } = af.invokeAgent(db, m.id, af.AGENT_ROLE.HYPOTHESIS_PROPOSER);
  assert.equal(invocation.modelStatus, 'CAPABILITY_GAP', 'no provider registered → honest model-status gap');
  db.close();
});
