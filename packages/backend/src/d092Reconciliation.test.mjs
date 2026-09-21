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

// ---------------------------------------------------------------------------
// MANIFEST v2 — the resupplied declaration. v1 stays pinned above, so the
// correction remains auditable instead of being overwritten by a clean story.
// ---------------------------------------------------------------------------
import { reconcileV2, transitionChecks, policyProjection, declaredV2Unverified } from '../../../scripts/d092-ingest-readiness.mjs';

test('D-092a: every v2 identity closes — the arithmetic objection is answered', () => {
  const results = reconcileV2(declaredV2Unverified.counts, declaredV2Unverified.pages);
  assert.equal(results.length, 6);
  for (const r of results) assert.equal(r.ok, true, `${r.name}: declared ${r.expected}, implied ${r.actual}`);
});

test('D-092a: v2 supplies the two things v1 was missing', () => {
  assert.equal(declaredV2Unverified.pages.find((p) => p.label === 'manifest').sha256,
    '698d556f3b8049388e4b8585cb94a1ef08bf19551ccb2ae6feb08c17240d8c94');
  assert.equal(declaredV2Unverified.counts.sameAssayOnlyMultiRow, 39);
});

test('D-092a: v2 is still a declaration, not a measurement', () => {
  assert.match(declaredV2Unverified.provenance, /bytes still NOT transferred/);
});

test('D-092a: dedup on activity_id cannot shrink the molecule set — flagged, not swallowed', () => {
  const t = transitionChecks(declaredUnverified.counts, declaredV2Unverified.counts);
  const dedup = t.find((x) => x.name.startsWith('dedup on activity_id'));
  assert.equal(dedup.holds, false);
  assert.match(dedup.verdict, /IMPOSSIBLE_UNDER_STATED_OPERATION/);
});

test('D-092a: 1586 is corroborated by BOTH declarations, which is why v2 survives that flag', () => {
  const t = transitionChecks(declaredUnverified.counts, declaredV2Unverified.counts);
  const union = t.find((x) => x.name.startsWith("v1's singleRecord"));
  assert.equal(union.holds, true);           // 1261 === 1222 + 39
  // v1: groups + singleRecord = 325 + 1261 = 1586, the same total v2 measures.
  assert.equal(declaredUnverified.counts.replicateGroupsEC50 + declaredUnverified.counts.singleRecordMolecules,
    declaredV2Unverified.counts.uniqueMolecules);
});

test('D-092a: existing policy is projected, never redefined', () => {
  const p = policyProjection(declaredV2Unverified.counts);
  assert.equal(p.startFrom, 2173);
  // 201 and 20 are REJECTED by the policy already in the repo; their overlap is
  // unknown, so the survivor count must be an interval and never a point.
  assert.equal(p.survivingRowsBeforeCanonicalisation.min, 1952);
  assert.equal(p.survivingRowsBeforeCanonicalisation.max, 1972);
  assert.equal(p.branches.AGONIST_FAMILY_ONLY.replicateGroups, 'NOT_MEASURED — the group count for this subset was never computed');
  assert.equal(p.branches.RETAIN_NONE_WITH_FLAG.replicateGroups, 325);
});

test('D-092a: the branch choice must not be made on which yields more replicate groups', () => {
  const p = policyProjection(declaredV2Unverified.counts);
  assert.match(p.theTrapToAvoid, /selecting the analysis to obtain the result/);
  assert.match(p.theTrapToAvoid, /sealed on pharmacological grounds BEFORE/);
});
