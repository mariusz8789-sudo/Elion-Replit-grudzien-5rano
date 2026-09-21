/**
 * D-104 — negative-first custody tests for the third attempt at A3 chunk 3.
 *
 * These assert FAILURE, on purpose: the point of pinning it is that a later
 * change which quietly starts reporting the chunk as verified — a relaxed
 * convention, a "repair" step, a decoder that tolerates mid-stream padding —
 * breaks the suite instead of sliding past review.
 *
 * SCOPE NARROWED, NOT RELAXED. This file also covered A2 when A2 stood at 1 of
 * 8 chunks: that chunk 1 held 17 rows, that `CHEMBL4088708` was missing, that
 * no structure was custody-verified, that C1 was NOT_CLOSED. A2 has since
 * arrived in full and been re-transmitted, so those assertions describe a world
 * that no longer exists; `d105A2Custody.test.mjs` asserts the current state,
 * more strictly and over more chunks. They were removed because the facts
 * changed, NOT because they had become inconvenient — the D-104 entry in
 * docs/DECISIONS.md stands unedited as the record of what was true then.
 *
 * Nothing about A3 chunk 3 changed. Every check below is live.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.join(HERE, '../../../scripts/d104-transcription-custody.mjs');
const custody = await import(MOD);

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

test('the module exposes no repair or variant-search helper', () => {
  // The absence is the point: a function that tries encodings until a hash
  // matches is guess-and-check against a known target (D-099, D-101).
  const names = Object.keys(custody).map((n) => n.toLowerCase());
  for (const banned of ['repair', 'fix', 'strip', 'normalize', 'trysearch', 'variants', 'bruteforce']) {
    assert.ok(!names.some((n) => n.includes(banned)), `unexpected export matching ${banned}`);
  }
});
