/**
 * D-104 — custody arithmetic for the third attempt at A3 chunk 3.
 *
 * SCOPE NARROWED, NOT RELAXED. This module also carried the A2 custody
 * arithmetic when A2 stood at 1 of 8 chunks. A2 has since been delivered in
 * full and re-transmitted once, so those figures are no longer the state of the
 * world and `d105-a2-custody.mjs` computes them from the current bytes under a
 * stricter rule. The A2 parts were removed from here because a later delivery
 * changed the facts — NOT to make a failing assertion go away. The D-104
 * decision record in docs/DECISIONS.md stands unedited as the account of what
 * was true when it was written; nothing about A3 chunk 3 has changed, and every
 * check for it below is still live.
 *
 * Every number here is RECOMPUTED from the pinned bytes under
 * data/transcription/. Nothing is restated from a delivery note: a declaration
 * is not a measurement (D-095), which is the whole reason this module exists.
 *
 * Deliberately absent: any function that tries encodings, strips characters, or
 * shifts boundaries looking for a hash match. That search shape was named and
 * refused in D-099 and D-101, and it stays refused when the thing being fitted
 * is a custody hash rather than a scientific threshold.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A3_DIR = join(ROOT, 'data/transcription/glp1r-a3');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Per-piece declarations for the third A3 chunk-3 attempt. */
export const A3_C3_DECLARED = Object.freeze({
  pieces: Object.freeze([
    Object.freeze({ n: 1, len: 1779, sha256: '726c5764946295d4d420d6337ac9d4e1bf5187a3bfa934f0059f763c93c6c4ff' }),
    Object.freeze({ n: 2, len: 1779, sha256: 'bd63dcc77f7d8ad7591868183f02c38ec97c5b7029f566f16a6c0d039125fd0d' }),
    Object.freeze({ n: 3, len: 1779, sha256: '34f1c9f38a9af3a8130ace5d394fde5cd1288fe402144fff623cf8caa6f2c72b' }),
    Object.freeze({ n: 4, len: 1779, sha256: '7630dba1dd56fe32de99f3844a4f89c13712e19af8af14072e987e53d27b20eb' }),
    Object.freeze({ n: 5, len: 1779, sha256: '7d81c5e8a4a092e9a12ea677beecdcc4b921476c9f97015fcd8722a573bec4d5' }),
    Object.freeze({ n: 6, len: 1779, sha256: '335cbca904b175801237af72b31f8933ba391fecc96836994f240a10381db44b' }),
    Object.freeze({ n: 7, len: 1774, sha256: '5147564c13ccb7ece4f004ee19b3274cacd64542420a0ede97727fece852cdcf' }),
  ]),
  concatLen: 12448,
  concatSha256: 'b1c7b2351518ee5d513d40d6bc6e166255c20688bb32dbe1d8008f2a5306a0e2',
  /** The pinned bytes of attempts 1 and 2, which agreed with each other. */
  pinnedChunkSha256: 'dd8bf5c58959f432bccc0d50116e7d4a8fe78284d289840121511af356fb6f6f',
  /** What attempts 1-3 all claim the chunk hashes to. */
  originalChunkSha256: 'e5bb6931568d9694a3a58eebb9aa6f6f2d904ce1166cf5688ddabc044f471e38',
});

/**
 * Check the seven base64 pieces and the structural validity of their
 * concatenation. Returns facts; performs no repair.
 */
export function checkA3Chunk3Pieces() {
  const buffers = A3_C3_DECLARED.pieces.map((p) =>
    readFileSync(join(A3_DIR, `A3-chunk-03.piece-0${p.n}.b64`)));
  const pieces = A3_C3_DECLARED.pieces.map((p, i) => ({
    n: p.n,
    declaredLen: p.len,
    receivedLen: buffers[i].length,
    declaredSha256: p.sha256,
    receivedSha256: sha256(buffers[i]),
    match: buffers[i].length === p.len && sha256(buffers[i]) === p.sha256,
  }));
  const concat = Buffer.concat(buffers);
  const text = concat.toString('utf8');
  const padding = [...text].map((c, i) => [c, i]).filter(([c]) => c === '=').map(([, i]) => i);

  return {
    pieces,
    piecesMatched: pieces.filter((p) => p.match).length,
    concatLen: concat.length,
    concatSha256: sha256(concat),
    concatMatch: sha256(concat) === A3_C3_DECLARED.concatSha256,
    /** Base64 length is always a multiple of 4. */
    lengthIsBase64Valid: concat.length % 4 === 0,
    /** Padding may appear only at the very end. */
    paddingPositions: padding,
    interiorPadding: padding.filter((i) => i < concat.length - 2),
    nonAlphabetChars: [...text].filter((c) => !/[A-Za-z0-9+/=]/.test(c)).length,
  };
}

/**
 * Can TEST 1 / TEST 2 be run at all? They take decoded bytes as input, so a
 * stream that is not valid base64 gives them nothing to act on. Answering NO
 * here is the protocol terminating, not the protocol being skipped.
 */
export function decodeTestsRunnable() {
  const r = checkA3Chunk3Pieces();
  const blockers = [];
  if (r.piecesMatched !== r.pieces.length) {
    blockers.push(`${r.pieces.length - r.piecesMatched} of ${r.pieces.length} pieces failed custody`);
  }
  if (!r.concatMatch) blockers.push('concatenation sha256 does not match the declared value');
  if (!r.lengthIsBase64Valid) blockers.push(`concatenation length ${r.concatLen} is not a multiple of 4`);
  if (r.interiorPadding.length > 0) {
    blockers.push(`base64 padding appears mid-stream at offsets ${r.interiorPadding.join(', ')}`);
  }
  return { runnable: blockers.length === 0, blockers, custody: 'UNKNOWN' };
}
