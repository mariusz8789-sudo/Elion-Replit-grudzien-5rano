/**
 * Phase 3E (Resource Layer) + 3K (Reality Bridge) tests. Deterministic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as rl from './cognitive/resourceLayer.mjs';
import * as rb from './cognitive/realityBridge.mjs';

test('v16 migration adds resource/reality tables', () => {
  const db = openDatabase(':memory:');
  assert.ok(db.prepare('PRAGMA user_version').get().user_version >= 16);
  for (const t of ['scientific_resources', 'experimental_results', 'prediction_errors']) {
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t));
  }
  db.close();
});

test('local/user resource import records provenance; synthetic is force-labelled', () => {
  const db = openDatabase(':memory:');
  const r = rl.importResource(db, { resourceId: 'ref-set-1', sourceType: 'USER_PROVIDED_RESOURCE', license: 'CC0', version: '1', content: { smiles: ['CCO'] }, validate: (c) => Array.isArray(c.smiles) });
  assert.equal(r.validationStatus, 'VALIDATED');
  assert.ok(/^[0-9a-f]{64}$/.test(r.contentHash));
  const syn = rl.importResource(db, { resourceId: 'fixture-1', sourceType: 'SYNTHETIC_TEST_FIXTURE', content: { x: 1 } });
  assert.equal(syn.meta.synthetic, true, 'synthetic fixtures cannot masquerade as real');
  db.close();
});

test('remote fetch is BLOCKED_BY_RESOURCES (egress blocked) — never fabricated', () => {
  const db = openDatabase(':memory:');
  const res = rl.requestRemote(db, { resourceId: 'rcsb-1abc', url: 'https://files.rcsb.org/download/1ABC.pdb' });
  assert.equal(res.ok, false);
  assert.equal(res.status, 'BLOCKED_BY_RESOURCES');
  assert.equal(rl.listResources(db).length, 0, 'nothing imported on a blocked fetch');
  db.close();
});

test('a legitimate local resource activates a workflow (imports and is retrievable)', () => {
  const db = openDatabase(':memory:');
  rl.importResource(db, { resourceId: 'target-panel', sourceType: 'LOCAL_CURATED_RESOURCE', content: { pdbIds: ['LOCAL1'] } });
  assert.ok(rl.getResource(db, 'target-panel'));
  db.close();
});

test('experimental import REJECTS a free-text claim; ACCEPTS a structured result', () => {
  const db = openDatabase(':memory:');
  // "candidate works" — no structure → rejected, never becomes evidence.
  const bad = rb.importExperimentalResult(db, { externalId: 'x', labIdentity: 'LabA', protocolRef: 'P1', candidateId: 'c1', measurementType: 'IC50', resultClass: 'BINDING_ASSAY' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /typed claim is not evidence|resultValue/);
  // structured, with artifact → imported, reviewer PENDING.
  const good = rb.importExperimentalResult(db, { externalId: 'exp-1', labIdentity: 'LabA', protocolRef: 'P1', candidateId: 'c1', measurementType: 'IC50', resultClass: 'BINDING_ASSAY', units: 'nM', resultValue: 42.0, artifactRef: 's3://raw', artifactHash: 'abc123' });
  assert.equal(good.ok, true);
  assert.equal(good.result.reviewerStatus, 'PENDING', 'a human must review before it counts');
  db.close();
});

test('prediction-vs-measurement error is recorded and aggregated', () => {
  const db = openDatabase(':memory:');
  rb.recordPredictionError(db, { candidateId: 'c1', measurementType: 'IC50', predicted: 100, measured: 130, strategyKey: 'S1' });
  rb.recordPredictionError(db, { candidateId: 'c2', measurementType: 'IC50', predicted: 50, measured: 40, strategyKey: 'S1' });
  const perf = rb.predictionPerformance(db, 'S1');
  assert.equal(perf.n, 2);
  assert.equal(perf.meanAbsError, 20); // (30 + 10)/2
  db.close();
});
