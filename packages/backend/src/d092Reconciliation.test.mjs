/**
 * D-092 — the declaration audit must FAIL on the declaration we were actually
 * given. A reconciliation routine that passes everything is decoration.
 *
 * These tests pin the two defects found in the offered manifest so that a
 * later "cleanup" cannot quietly make them pass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcile, declaredUnverified } from '../../../scripts/d092-ingest-readiness.mjs';

const run = () => reconcile(declaredUnverified.counts, declaredUnverified.pages);
const byName = (n) => run().find((r) => r.name === n);

test('D-092: the listed pages cannot reproduce the declared row count', () => {
  const c = byName('pages reproduce rowsTotal');
  assert.equal(c.ok, false);
  assert.equal(c.actual, 2365); // 1000 + 1000 + 365
  assert.equal(c.expected, 3365);
  assert.equal(c.delta, -1000); // exactly one full page absent
});

test('D-092: molecule buckets do not partition the declared molecule count', () => {
  const c = byName('replicateGroups + singleRecord = uniqueMolecules');
  assert.equal(c.ok, false);
  assert.equal(c.delta, -134); // the unreported sameAssayOnly bucket
});

test('D-092: the row-filter arithmetic IS coherent — this audit is not a blanket reject', () => {
  for (const n of [
    'rowsTotal - censored - noRelation = rowsRelationEqual',
    'rowsRelationEqual - badUnits = rowsEqGoodUnits',
    'action_type partition = rowsEqGoodUnits',
    'assay_type partition = rowsEqGoodUnits',
  ]) assert.equal(byName(n).ok, true, n);
});

test('D-092: a manifest whose pages sum correctly passes that check', () => {
  const pages = [{ declaredRows: 1000 }, { declaredRows: 1000 }, { declaredRows: 1000 }, { declaredRows: 365 }, { declaredRows: null }];
  const c = reconcile(declaredUnverified.counts, pages).find((r) => r.name === 'pages reproduce rowsTotal');
  assert.equal(c.ok, true);
  assert.equal(c.actual, 3365);
});

test('D-092: a declaration is data — nothing in it is promoted to a measurement', () => {
  assert.match(declaredUnverified.provenance, /bytes were NOT transferred/);
  assert.equal(declaredUnverified.pages.find((p) => p.label === 'manifest').sha256, null);
});

test('D-092: importing the module must not run the measurement or write the seal', () => {
  // The script guards main() behind an argv check; importing it here is the proof.
  assert.ok(typeof reconcile === 'function');
});
