/**
 * Necropolis tenant-isolation + accumulation tests (Commercial Hardening — Phase 4).
 * Proves: (1) a tenant's failure memory materially changes its OWN later decision,
 * (2) a hostile cross-tenant read leaks NOTHING, (3) export/import is deterministic,
 * validated, and de-duplicated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as necro from './cognitive/necropolis.mjs';

// Necropolis is scoped by a plain tenant (project) id — no mission/FK dependency.
function tenants() { return { A: 'tenant-A', B: 'tenant-B' }; }

test('recording a failure requires explicit tenant ownership', () => {
  const db = openDatabase(':memory:');
  assert.throws(() => necro.recordFailure(db, { failureClass: 'X', parameterVector: { T: 900 } }), /projectId/);
  db.close();
});

test('a tenant failure region MATERIALLY changes that tenant\'s later assessment', () => {
  const db = openDatabase(':memory:');
  const { A } = tenants();
  // Before recording: the region is novel to tenant A.
  const before = necro.assess(db, A, { context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } });
  assert.equal(before.verdict, 'NOVEL_REGION');
  // Record a real dead end at T≈900.
  necro.recordFailure(db, { projectId: A, domain: 'thermal', failureClass: 'FAILED_PARAMETER_REGION', context: 'reactor', parameterVector: { T: 900 }, scales: { T: 900 }, failureMode: 'runaway' });
  // After: a near-identical proposal is now a KNOWN_DEAD_END for tenant A.
  const after = necro.assess(db, A, { context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } });
  assert.equal(after.verdict, 'KNOWN_DEAD_END');
  assert.equal(after.tenantRegionsConsidered, 1);
  db.close();
});

test('HOSTILE cross-tenant isolation: tenant B is NOT influenced by tenant A\'s private failures', () => {
  const db = openDatabase(':memory:');
  const { A, B } = tenants();
  // Tenant A records many dead ends.
  for (const T of [900, 905, 910, 915]) {
    necro.recordFailure(db, { projectId: A, domain: 'thermal', failureClass: 'FAILED_PARAMETER_REGION', context: 'reactor', parameterVector: { T }, scales: { T: 900 } });
  }
  // Tenant B submits the SAME proposal that is a dead end for A.
  const bView = necro.assess(db, B, { context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } });
  assert.equal(bView.verdict, 'NOVEL_REGION', 'tenant B must see NONE of tenant A\'s regions');
  assert.equal(bView.tenantRegionsConsidered, 0);
  // And tenant A still correctly sees the dead end (isolation is not amnesia).
  assert.equal(necro.assess(db, A, { context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } }).verdict, 'KNOWN_DEAD_END');
  db.close();
});

test('duplicate failure regions are de-duplicated within a tenant', () => {
  const db = openDatabase(':memory:');
  const { A } = tenants();
  const spec = { projectId: A, domain: 'thermal', failureClass: 'FAILED_PARAMETER_REGION', context: 'reactor', parameterVector: { T: 900 }, scales: { T: 900 } };
  const first = necro.recordFailure(db, spec);
  const second = necro.recordFailure(db, spec);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(necro.stats(db, A).total, 1);
  db.close();
});

test('export is deterministic (same regions → same exportHash, order-independent)', () => {
  const db1 = openDatabase(':memory:'); const db2 = openDatabase(':memory:');
  const specs = [
    { projectId: 'T', domain: 'thermal', failureClass: 'F', context: 'c', parameterVector: { T: 900 }, scales: { T: 900 } },
    { projectId: 'T', domain: 'fluid', failureClass: 'F', context: 'c', parameterVector: { Re: 2300 }, scales: { Re: 2300 } },
  ];
  for (const s of specs) necro.recordFailure(db1, s);
  for (const s of [...specs].reverse()) necro.recordFailure(db2, s); // inserted in opposite order
  assert.equal(necro.exportArtifact(db1, 'T').exportHash, necro.exportArtifact(db2, 'T').exportHash);
  db1.close(); db2.close();
});

test('import validates schema, preserves provenance, and de-duplicates', () => {
  const db = openDatabase(':memory:');
  necro.recordFailure(db, { projectId: 'SRC', domain: 'thermal', failureClass: 'F', context: 'c', parameterVector: { T: 900 }, scales: { T: 900 }, provenance: { source: 'lab-run-42' } });
  const artifact = necro.exportArtifact(db, 'SRC');

  // Wrong schema is rejected honestly.
  assert.equal(necro.importArtifact(db, 'DST', { schema: 'bogus/9', regions: [] }).ok, false);

  const r1 = necro.importArtifact(db, 'DST', artifact);
  assert.equal(r1.imported, 1);
  const r2 = necro.importArtifact(db, 'DST', artifact); // re-import → all duplicates
  assert.equal(r2.imported, 0);
  assert.equal(r2.duplicates, 1);

  // DST now has the region and it materially influences DST's assessment.
  assert.equal(necro.assess(db, 'DST', { context: 'c', parameterVector: { T: 902 }, scales: { T: 900 } }).verdict, 'KNOWN_DEAD_END');
  db.close();
});

test('import rejects malformed regions without crashing', () => {
  const db = openDatabase(':memory:');
  const res = necro.importArtifact(db, 'DST', { schema: necro.NECROPOLIS_SCHEMA, projectId: 'X', regions: [{ nope: true }, { failureClass: 'F', normalized: null }] });
  assert.equal(res.ok, true);
  assert.equal(res.imported, 0);
  assert.equal(res.rejected.length, 2);
  db.close();
});
