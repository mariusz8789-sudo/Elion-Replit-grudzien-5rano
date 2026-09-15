/**
 * D-104 — negative-first custody tests for the A2 delivery and the third
 * attempt at A3 chunk 3.
 *
 * These assert FAILURE, on purpose. Two deliveries did not survive the channel,
 * and the point of pinning that in a test is that a later change which quietly
 * starts reporting them as verified — a relaxed convention, a "repair" step, a
 * decoder that tolerates mid-stream padding — breaks the suite instead of
 * sliding past review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.join(HERE, '../../../scripts/d104-transcription-custody.mjs');
const custody = await import(MOD);

test('A2 chunk 1 fails custody: neither row count nor sha256 matches the declaration', () => {
  const r = custody.checkDeliveredA2Chunk1();
  assert.equal(r.custody, 'FAILED');
  assert.equal(r.rowCountMatch, false);
  assert.equal(r.hashMatch, false);
  assert.equal(r.declaredRows, 18);
  assert.equal(r.receivedRows, 17);
});

test('the declared row count is vindicated by A1, so the channel lost the row', () => {
  const r = custody.checkDeliveredA2Chunk1();
  // A1 is frozen and byte-verified, so the ids belonging in the declared
  // [firstKey, lastKey] range are a fact, not a hypothesis.
  assert.deepEqual(r.missingFromDelivery, ['CHEMBL4088708']);
  assert.equal(r.firstKeyMatch, true);
  assert.equal(r.lastKeyMatch, true);
});

test('no delivered row is foreign to A1', () => {
  assert.deepEqual(custody.checkDeliveredA2Chunk1().foreignToA1, []);
});

test('the structure-less row deviates from the ||notRetrieved spec and is recorded, not rewritten', () => {
  const r = custody.checkDeliveredA2Chunk1();
  assert.deepEqual(r.emptySmiles, ['CHEMBL2108724']);
  assert.equal(r.withSmiles, 16);
});

test('A2 is not complete: one chunk delivered, seven declared only as inventory', () => {
  const cov = custody.a2Coverage();
  assert.equal(cov.complete, false);
  assert.equal(cov.chunksDelivered, 1);
  assert.equal(cov.chunksInventoryOnly, 7);
  assert.equal(cov.a1Molecules, 300);
  // The inventory's own arithmetic does check out — that much is true.
  assert.equal(cov.declaredSum, cov.declaredTotal);
});

test('no structure is custody-verified, so none may enter a provenance-bearing measurement', () => {
  assert.equal(custody.a2Coverage().custodyVerifiedStructures, 0);
});

test('A3 chunk 3: five of seven pieces verify, two do not', () => {
  const r = custody.checkA3Chunk3Pieces();
  assert.equal(r.pieces.length, 7);
  assert.equal(r.piecesMatched, 5);
  const failed = r.pieces.filter((p) => !p.match).map((p) => p.n);
  assert.deepEqual(failed, [2, 3]);
});

test('the concatenation is not structurally valid base64', () => {
  const r = custody.checkA3Chunk3Pieces();
  assert.equal(r.concatMatch, false);
  assert.equal(r.lengthIsBase64Valid, false);
  assert.equal(r.concatLen % 4, 1);
  // Pieces 2 and 3 each end in terminal padding, mid-stream.
  assert.deepEqual(r.interiorPadding, [3558, 3559, 5340, 5341]);
  // The excess is exactly the two over-long pieces.
  assert.equal(r.concatLen - custody.A3_C3_DECLARED.concatLen, 5);
});

test('TEST 1 and TEST 2 are not runnable, and custody stays UNKNOWN', () => {
  const d = custody.decodeTestsRunnable();
  assert.equal(d.runnable, false);
  assert.equal(d.custody, 'UNKNOWN');
  assert.ok(d.blockers.length >= 3);
  // Not "the tests failed" — the tests have no valid input.
  assert.ok(d.blockers.some((b) => b.includes('not a multiple of 4')));
});

test('C1 stays NOT_CLOSED and no threshold, prereg or gate moved', () => {
  const c1 = custody.c1Status();
  assert.equal(c1.status, 'NOT_CLOSED');
  assert.equal(c1.reason, 'data volume, not methodology');
  assert.equal(c1.thresholdsChanged, false);
  assert.equal(c1.preregChanged, false);
  assert.equal(c1.winnerGateChanged, false);
  assert.equal(c1.structuresNeeded, 300);
  assert.equal(c1.structuresFrozenInRepo, 7);
});

test('the module exposes no repair or variant-search helper', () => {
  // The absence is the point: a function that tries encodings until a hash
  // matches is guess-and-check against a known target (D-099, D-101).
  const names = Object.keys(custody).map((n) => n.toLowerCase());
  for (const banned of ['repair', 'fix', 'strip', 'normalize', 'trysearch', 'variants', 'bruteforce']) {
    assert.ok(!names.some((n) => n.includes(banned)), `unexpected export matching ${banned}`);
  }
});
