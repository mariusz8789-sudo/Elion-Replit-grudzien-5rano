import test from 'node:test';
import assert from 'node:assert/strict';

import { replicateGroups, noiseFloorStatus, REPLICATE_RULE, REQUIRED_ROW_FIELDS } from './campaign/replicateGrouping.mjs';
import { loadGlp1rPin } from './campaign/glp1rDataset.mjs';

const row = (smiles, standardType, assayId, pActivity) => ({ canonicalSmiles: smiles, standardType, assayId, pActivity });

/* --------------------------------------------- REQUIRED 2: valid replicate */

test('two DIFFERENT assays of the same molecule + same endpoint form a replicate group', () => {
  const r = replicateGroups([
    row('CCO', 'EC50', 'CHEMBL-A', 8.0),
    row('CCO', 'EC50', 'CHEMBL-B', 8.6),
  ], 'EC50');
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].distinctAssays, 2);
  assert.equal(r.groups[0].n, 2);
  assert.ok(Math.abs(r.groups[0].spread - 0.6) < 1e-9);
  assert.equal(r.rejected.sameAssayOnly, 0);
});

/* ------------------------------------- REQUIRED 3: endpoints cannot mix */

test('EC50 and IC50 of the same molecule can NEVER enter one group', () => {
  const rows = [
    row('CCO', 'EC50', 'CHEMBL-A', 9.0),
    row('CCO', 'IC50', 'CHEMBL-B', 7.0),
  ];
  // requesting EC50 sees only the EC50 record -> a single record, not a group
  const ec50 = replicateGroups(rows, 'EC50');
  assert.equal(ec50.groups.length, 0);
  assert.equal(ec50.rejected.singleRecord, 1);

  const ic50 = replicateGroups(rows, 'IC50');
  assert.equal(ic50.groups.length, 0);

  // the 2.0 difference between them is endpoint DISAGREEMENT, never noise;
  // no call on this data may surface it as a replicate spread
  assert.deepEqual(ec50.groups, []);
});

/* --------------------------- REQUIRED 4: same-assay duplicates are rejected */

test('two records from the SAME assay are a duplicate, not a replicate', () => {
  const r = replicateGroups([
    row('CCO', 'EC50', 'CHEMBL-A', 8.0),
    row('CCO', 'EC50', 'CHEMBL-A', 8.0),
  ], 'EC50');
  assert.equal(r.groups.length, 0, 'a duplicated record must not count as an independent repeat');
  assert.equal(r.rejected.sameAssayOnly, 1);
});

test('the same-assay case is the DANGEROUS direction: it would fake a LOW floor', () => {
  // identical values from one assay would give spread 0 and make the data look
  // more reliable than it is. The rule refuses before that can happen.
  const naiveWouldAccept = [
    row('CCO', 'EC50', 'CHEMBL-A', 8.0),
    row('CCO', 'EC50', 'CHEMBL-A', 8.0),
    row('CCO', 'EC50', 'CHEMBL-A', 8.0),
  ];
  const r = replicateGroups(naiveWouldAccept, 'EC50');
  assert.equal(r.groups.length, 0);
  assert.equal(REPLICATE_RULE.minDistinctAssays, 2);
});

test('a row without assay provenance cannot be grouped at all', () => {
  for (const bad of [null, undefined, '']) {
    assert.throws(() => replicateGroups([row('CCO', 'EC50', bad, 8.0), row('CCO', 'EC50', 'B', 8.1)], 'EC50'), /ROW_NOT_GROUPABLE/);
  }
  assert.deepEqual([...REQUIRED_ROW_FIELDS], ['canonicalSmiles', 'standardType', 'assayId', 'pActivity']);
});

/* ------------------------------------ REQUIRED 9: MEASURED vs NOT_MEASURED */

test('below the frozen floor the status is NOT_MEASURED — never an estimate', () => {
  const few = replicateGroups([row('CCO', 'EC50', 'A', 8), row('CCO', 'EC50', 'B', 9)], 'EC50');
  const s = noiseFloorStatus(few);
  assert.equal(s.status, 'NOT_MEASURED');
  assert.equal(s.groups, 1);
  assert.equal(s.required, 20);
  assert.equal('medianSd' in s, false, 'a floor must not be reported below the group floor');
});

test('at or above the floor the status is MEASURED with a real median', () => {
  const rows = [];
  for (let i = 0; i < 25; i += 1) {
    rows.push(row(`MOL${i}`, 'EC50', 'A', 8.0), row(`MOL${i}`, 'EC50', 'B', 9.0));
  }
  const s = noiseFloorStatus(replicateGroups(rows, 'EC50'));
  assert.equal(s.status, 'MEASURED');
  assert.equal(s.groups, 25);
  assert.ok(Math.abs(s.medianSpread - 1.0) < 1e-9);
});

/* --------------------------- REQUIRED 1/5: the real pin, with provenance */

test('DIAGNOSTIC-1 on the REAL pin: NOT_MEASURED on every endpoint axis', () => {
  const pin = loadGlp1rPin();
  assert.equal(pin.ok, true);

  const expected = { EC50: 4, IC50: 2, KI: 0 };
  let total = 0;
  for (const [ep, n] of Object.entries(expected)) {
    const r = replicateGroups(pin.rows, ep);
    assert.equal(r.groups.length, n, `${ep} replicate groups moved`);
    assert.equal(r.rejected.sameAssayOnly, 0, `${ep}: this pin has no same-assay duplicates`);
    assert.equal(noiseFloorStatus(r).status, 'NOT_MEASURED');
    total += r.groups.length;
  }
  // reconciles with the sealed Diagnostic-0 aggregate
  assert.equal(total, 6, 'must agree with the 6 groups sealed in Diagnostic-0');
});

test('the pin\'s assayId is a sound discriminator — verified, not assumed', () => {
  const pin = loadGlp1rPin();
  assert.equal(pin.rows.filter((r) => !r.assayId).length, 0, 'no null/empty assayId');
  const perAssayEndpoints = new Map();
  const molAssayPairs = new Map();
  for (const r of pin.rows) {
    if (!perAssayEndpoints.has(r.assayId)) perAssayEndpoints.set(r.assayId, new Set());
    perAssayEndpoints.get(r.assayId).add(r.standardType);
    const k = `${r.canonicalSmiles}|${r.assayId}`;
    molAssayPairs.set(k, (molAssayPairs.get(k) ?? 0) + 1);
  }
  assert.equal([...perAssayEndpoints.values()].filter((s) => s.size > 1).length, 0, 'no assay mixes endpoint types');
  assert.equal([...molAssayPairs.values()].filter((v) => v > 1).length, 0, 'no molecule repeats within one assay');
  assert.equal(perAssayEndpoints.size, 25);
});
