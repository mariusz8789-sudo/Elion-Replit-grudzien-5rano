/**
 * Priority 2 (Mission Planner) tests. Deterministic; a stub capability resolver
 * keeps them fast and independent of installed engines.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as planner from './cognitive/missionPlanner.mjs';
import * as dag from './cognitive/taskGraph.mjs';

const allAvailable = () => true;

test('plans a drug-discovery mission into a persisted, executable Task DAG', () => {
  const db = openDatabase(':memory:');
  const out = planner.planMission(db, {
    goal: 'Optimize a drug-like scaffold toward the MPO objective', domain: 'drug-discovery',
    resolveCapability: allAvailable,
  });
  assert.equal(out.planStatus, 'planned');
  assert.ok(out.mission.id);
  assert.ok(out.questions.length >= 3, 'decomposition produces multiple questions');
  assert.ok(out.hypotheses.length >= 2, 'produces competing hypotheses');

  // Competing hypotheses must carry disconfirming observations (falsifiability).
  for (const h of out.hypotheses) {
    assert.ok(Array.isArray(h.disconfirmingObservations) && h.disconfirmingObservations.length >= 1, `${h.label} needs a disconfirming observation`);
  }
  const claims = out.hypotheses.map((h) => h.claim);
  assert.notEqual(claims[0], claims[1], 'H1 and H2 are genuinely competing');

  const titles = out.tasks.map((t) => t.title);
  assert.ok(titles.some((t) => /Seed & generate/.test(t)));
  assert.ok(titles.some((t) => /Docking/.test(t)));
  assert.ok(titles.some((t) => /Verify/.test(t)));

  // Only the seed task is on the frontier; everything downstream is BLOCKED.
  const frontier = dag.executionFrontier(db, out.mission.id).map((t) => t.title);
  assert.deepEqual(frontier, ['Seed & generate candidate set']);
  const blocked = out.tasks.filter((t) => t.state === 'BLOCKED').length;
  assert.equal(blocked, out.tasks.length - 1);
  db.close();
});

test('dependency structure is correct (dock waits on admet waits on descriptors waits on seed)', () => {
  const db = openDatabase(':memory:');
  const out = planner.planMission(db, { goal: 'g', domain: 'drug-discovery', resolveCapability: allAvailable });
  const byTitle = Object.fromEntries(out.tasks.map((t) => [t.title, t.id]));
  const edgeSet = new Set(out.edges.map((e) => `${e.fromTaskId}->${e.toTaskId}`));
  const seed = byTitle['Seed & generate candidate set'];
  const desc = byTitle['Compute descriptors (RDKit)'];
  const admet = byTitle['ADMET/toxicity filtering (ADMET-AI)'];
  const dock = byTitle['Docking (AutoDock Vina + Meeko)'];
  const verify = byTitle['Verify results & resolve H1 vs H2 (MCRE)'];
  assert.ok(edgeSet.has(`${seed}->${desc}`));
  assert.ok(edgeSet.has(`${desc}->${admet}`));
  assert.ok(edgeSet.has(`${admet}->${dock}`));
  assert.ok(edgeSet.has(`${dock}->${verify}`));
  db.close();
});

test('engine availability is recorded honestly (no fabrication when an engine is absent)', () => {
  const db = openDatabase(':memory:');
  const resolve = (cap) => cap !== 'molecular-docking'; // docking unavailable
  const out = planner.planMission(db, { goal: 'g', domain: 'drug-discovery', resolveCapability: resolve });
  assert.equal(out.engineAvailability['molecular-docking'], false);
  assert.equal(out.engineAvailability['molecular-descriptors'], true);
  const dockTask = out.tasks.find((t) => /Docking/.test(t.title));
  assert.equal(dockTask.spec.engineAvailable, false, 'docking task honestly flags its engine as unavailable');
  db.close();
});

test('unknown domain returns an explicit CAPABILITY_GAP, never a fabricated plan', () => {
  const db = openDatabase(':memory:');
  const out = planner.planMission(db, { goal: 'Prove the Riemann hypothesis', domain: 'pure-mathematics', resolveCapability: allAvailable });
  assert.equal(out.planStatus, 'CAPABILITY_GAP');
  assert.equal(out.tasks.length, 0, 'no tasks invented');
  assert.match(out.reason, /Model (Abstraction|Router)/);
  assert.ok(out.mission.id, 'mission is still persisted (paused), just not planned');
  assert.equal(out.mission.status, 'paused');
  db.close();
});

test('planning is deterministic (same inputs -> same DAG topology hash)', () => {
  const dbA = openDatabase(':memory:');
  const dbB = openDatabase(':memory:');
  const a = planner.planMission(dbA, { goal: 'g', domain: 'drug-discovery', resolveCapability: allAvailable });
  const b = planner.planMission(dbB, { goal: 'g', domain: 'drug-discovery', resolveCapability: allAvailable });
  // Topology (titles + edge shape) is identical even though ids differ; compare structure.
  const shape = (out) => {
    const idToTitle = Object.fromEntries(out.tasks.map((t) => [t.id, t.title]));
    return out.edges.map((e) => `${idToTitle[e.fromTaskId]}=>${idToTitle[e.toTaskId]}`).sort();
  };
  assert.deepEqual(shape(a), shape(b));
  dbA.close();
  dbB.close();
});
