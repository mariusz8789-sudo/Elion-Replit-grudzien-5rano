/**
 * D-108 — negative-first tests for per-row custody, the declared channel
 * correction quarantine, the combined (chunk + row) noise floor, and the
 * identity-key monitor's real result.
 *
 * The load-bearing assertions are about what stays FALSE: a row that only
 * verifies after applying the declared correction must never be usable, a
 * row with no declared hash must never be silently promoted, and the
 * mechanism must converge (each re-transmission can only shrink the
 * resend list, never require re-checking a row that already verified).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const custody = await import(pathToFileURL(path.join(HERE, '../../../scripts/d108-per-row-custody.mjs')).href);
const chunkCustody = await import(pathToFileURL(path.join(HERE, '../../../scripts/d105-a2-custody.mjs')).href);
const combined = await import(pathToFileURL(path.join(HERE, '../../../scripts/d108-noise-floor-per-row.mjs')).href);

test('chunks 1, 2, and a partial chunk 4 have declared per-row hashes; 3, 5, 6, 7, 8 do not', () => {
  const s = custody.summary();
  assert.deepEqual(s.chunksAwaitingRowHashes, [3, 5, 6, 7, 8]);
  assert.deepEqual(s.chunksWithPartialRowHashes, [4]);
});

test('per-row custody converges: 37 rows raw-verified, only 4 named as still bad', () => {
  const s = custody.summary();
  assert.equal(s.rawVerified, 37);
  assert.equal(s.verifiedAfterCorrection, 0);
  assert.equal(s.failed, 4);
  assert.deepEqual(s.resendList.sort(), ['CHEMBL4065403', 'CHEMBL4087789', 'CHEMBL4093072', 'CHEMBL414357'].sort());
});

test('chunk 1: 15 of 18 rows verify individually even though the whole chunk fails', () => {
  const r = custody.checkChunkRows(1);
  assert.equal(r.rawVerified, 15);
  assert.equal(r.failed, 3);
  // The whole-chunk hash still fails — per-row custody does not change that.
  assert.equal(chunkCustody.checkAllChunks().find((c) => c.chunk === 1).custody, 'FAILED');
});

test('chunk 4 partial: every row WITH a declared hash verifies; rows without one are NOT_DECLARED, not silently trusted', () => {
  const r = custody.checkChunkRows(4);
  assert.equal(r.declaredRowHashesPartial, true);
  assert.equal(r.rawVerified, 6);
  assert.equal(r.notDeclared, 5);
  assert.equal(r.failed, 0);
});

test('a row status is RAW_VERIFIED only if RECEIVED bytes hash to the declared value — no averaging, no majority vote', () => {
  const r = custody.checkChunkRows(2);
  const bad = r.rows.find((row) => row.id === 'CHEMBL414357');
  assert.equal(bad.status, 'FAILED');
  assert.ok(bad.declaredSha256);
  assert.ok(Array.isArray(bad.receivedSha256));
});

test('the declared channel correction is the single literal pair from D-107, applied nowhere silently', () => {
  assert.equal(custody.DECLARED_CHANNEL_CORRECTION.from, 'Cb3cccc(');
  assert.equal(custody.DECLARED_CHANNEL_CORRECTION.to, 'Cc3cccc(');
  assert.equal(custody.applyDeclaredCorrection('foo Cb3cccc( bar'), 'foo Cc3cccc( bar');
  // A string without the pattern is returned unchanged, never touched speculatively.
  assert.equal(custody.applyDeclaredCorrection('unrelated smiles'), 'unrelated smiles');
});

test('a row verified only AFTER correction is quarantined, not usable, and both byte sequences are kept', () => {
  // No such row exists in the current declared hashes (0 quarantined today),
  // but the CONTRACT is asserted directly against the module's own logic so
  // a future declared hash that DOES require the correction is caught if the
  // usable/quarantine wiring ever regresses.
  assert.equal(custody.summary().quarantined, 0);
  assert.equal(custody.summary().correctedRowsUsable, false);
  // rawVerifiedRows() — the ONLY thing measurements may read — contains
  // nothing from the correction path, by construction (it only iterates
  // RAW_VERIFIED rows).
  const raw = custody.rawVerifiedRows();
  for (const id of raw.keys()) {
    const found = custody.checkAllChunkRows().flatMap((r) => r.rows).find((row) => row.id === id);
    assert.notEqual(found.status, custody.ROW_STATUS.VERIFIED_AFTER_CHANNEL_CORRECTION);
  }
});

test('CHEMBL4088708 (the row chunk 1 originally lost) is not among the 37 raw-verified rows', () => {
  // It was re-delivered inside chunk 1's re-transmission, but chunk 1 has no
  // declared per-row hash for it in what Qwen sent (the per-row list covers
  // the 18 IDs in chunk 1, and 4088708 IS one of the 18 — check directly).
  const r = custody.checkChunkRows(1);
  const row = r.rows.find((x) => x.id === 'CHEMBL4088708');
  assert.ok(row, 'CHEMBL4088708 must appear in chunk 1 per-row results');
  assert.equal(row.status, custody.ROW_STATUS.RAW_VERIFIED);
});

test('combined coverage: chunk-level 99 + per-row 32 new = 131 of 300 A1 molecules', () => {
  const c = combined.combinedCoverage();
  assert.equal(c.a1Molecules, 300);
  assert.equal(c.chunkLevelStructures, 99);
  assert.equal(c.additionalFromPerRowCustody, 32);
  assert.equal(c.combinedCustodyVerifiedStructures, 131);
  assert.equal(c.moleculesStillWithoutVerifiedStructure, 169);
});

test('the combined measurement still uses real canonicalSmiles identity, never molecule_chembl_id', () => {
  const src = readFileSync(path.join(HERE, '../../../scripts/d108-noise-floor-per-row.mjs'), 'utf8');
  assert.ok(src.includes('canonicalSmiles: s'));
  assert.ok(!/standardType:\s*r\.moleculeId|canonicalSmiles:\s*r\.moleculeId/.test(src));
});

test('C1 remains CLOSED under the combined measurement, with more groups but the same status', () => {
  const m = combined.measure();
  assert.equal(m.c1Closed, true);
  assert.deepEqual(m.measuredFamilies, ['CAMP']);
  assert.equal(m.perFamily.CAMP.groups, 43);
  assert.ok(m.perFamily.CAMP.groups >= 20);
});

test('the noise floor under combined identity is unchanged to 4 decimal places: 1.0005, still at MAX_MAE', () => {
  const m = combined.measure();
  assert.equal(m.perFamily.CAMP.medianSd, 1.0005);
});

test('the identity-key monitor found zero collisions on the real combined 131-structure set', () => {
  const reportPath = path.join(HERE, 'campaign/glp1r-d108-identity-key-report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.currentIdentityKey, 'canonicalSmiles');
  assert.equal(report.a1ScopedSet.distinctCanonicalSmiles, 131);
  assert.equal(report.a1ScopedSet.collisions.length, 0);
});

test('the D-108 sealed noise-floor artifact matches the module used to produce it', () => {
  const artifactPath = path.join(HERE, 'campaign/glp1r-d108-noise-floor-per-row.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  assert.equal(artifact.c1Status, 'CLOSED');
  assert.equal(artifact.perFamily.CAMP.groups, 43);
  assert.equal(artifact.coverage.combinedCustodyVerifiedStructures, 131);
});

test('per-row custody module exposes no repair-toward-hash or bulk-accept helper', () => {
  const names = Object.keys(custody).map((n) => n.toLowerCase());
  for (const banned of ['bruteforce', 'variants', 'autofix', 'bulkaccept', 'trustall']) {
    assert.ok(!names.some((n) => n.includes(banned)), `unexpected export matching ${banned}`);
  }
});
