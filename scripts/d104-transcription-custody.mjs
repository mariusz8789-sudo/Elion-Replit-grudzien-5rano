/**
 * D-104 — custody arithmetic for the A2 structure dictionary and the third
 * attempt at A3 chunk 3.
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
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A1_DIR = join(ROOT, 'data/transcription/glp1r-a1');
const A2_DIR = join(ROOT, 'data/transcription/glp1r-a2');
const A3_DIR = join(ROOT, 'data/transcription/glp1r-a3');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The convention under which all seven A1 chunks verified byte-exactly. */
export const CHUNK_HASH_CONVENTION = Object.freeze({
  content: 'data rows only, no header lines',
  separator: 'LF',
  trailingNewline: true,
});

/** What the supplier declared for A2. Claims, not findings. */
export const A2_DECLARED = Object.freeze({
  chunks: Object.freeze([
    Object.freeze({ n: 1, rows: 18, firstKey: 'CHEMBL2108724', lastKey: 'CHEMBL4098061', sha256: '0ee287d34316b4e222982e1daa3c7be0e4aab897a09be1e763e3dee9d6b36340', delivered: true }),
    Object.freeze({ n: 2, rows: 17, firstKey: 'CHEMBL4098545', lastKey: 'CHEMBL4533613', sha256Prefix: '73d267bd', delivered: false }),
    Object.freeze({ n: 3, rows: 12, firstKey: 'CHEMBL4556788', lastKey: 'CHEMBL4757461', sha256Prefix: 'ab509947', delivered: false }),
    Object.freeze({ n: 4, rows: 11, firstKey: 'CHEMBL4757600', lastKey: 'CHEMBL4787910', sha256Prefix: '58fea53f', delivered: false }),
    Object.freeze({ n: 5, rows: 15, firstKey: 'CHEMBL4788056', lastKey: 'CHEMBL5183336', sha256Prefix: '32c6d9e6', delivered: false }),
    Object.freeze({ n: 6, rows: 68, firstKey: 'CHEMBL5187044', lastKey: 'CHEMBL5840270', sha256Prefix: 'd27693d5', delivered: false }),
    Object.freeze({ n: 7, rows: 106, firstKey: 'CHEMBL5844419', lastKey: 'CHEMBL6039318', sha256Prefix: '11fb6869', delivered: false }),
    Object.freeze({ n: 8, rows: 53, firstKey: 'CHEMBL6041508', lastKey: 'CHEMBL6176273', sha256Prefix: '37946708', delivered: false }),
  ]),
  totalRows: 300,
  notRetrieved: Object.freeze(['CHEMBL2108724', 'CHEMBL5314341']),
});

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

/** Every distinct molecule_chembl_id in the byte-verified A1 chunks. */
export function a1MoleculeIds() {
  const ids = new Set();
  for (const file of readdirSync(A1_DIR).filter((f) => f.endsWith('.psv'))) {
    for (const line of readFileSync(join(A1_DIR, file), 'utf8').split('\n')) {
      if (line.trim()) ids.add(line.split('|')[1]);
    }
  }
  return ids;
}

/**
 * Check a delivered A2 chunk against its declaration AND against A1.
 *
 * The A1 cross-check is what makes a row-count discrepancy diagnosable rather
 * than merely visible: A1 is frozen and byte-verified, so the set of ids that
 * belong in a chunk's [firstKey, lastKey] range is a fact, and any id in that
 * range missing from the delivery is a transmission loss — established without
 * testing a single hypothesis against the declared hash.
 */
export function checkA2Chunk(declared, bytes) {
  const rows = bytes.toString('utf8').split('\n').filter((l) => l.length > 0);
  const ids = rows.map((r) => r.split('|')[0]);
  const a1 = a1MoleculeIds();
  const inRange = [...a1].sort().filter((id) => id >= declared.firstKey && id <= declared.lastKey);
  const got = new Set(ids);

  return {
    chunk: declared.n,
    declaredRows: declared.rows,
    receivedRows: rows.length,
    rowCountMatch: rows.length === declared.rows,
    firstKeyMatch: ids[0] === declared.firstKey,
    lastKeyMatch: ids[ids.length - 1] === declared.lastKey,
    declaredSha256: declared.sha256,
    receivedSha256: sha256(bytes),
    hashMatch: sha256(bytes) === declared.sha256,
    /** A1 ids in the declared key range that the delivery does not carry. */
    missingFromDelivery: inRange.filter((id) => !got.has(id)),
    /** Delivered ids that are not in A1 at all — would mean a wrong source. */
    foreignToA1: ids.filter((id) => !a1.has(id)),
    /** Rows whose SMILES field is empty; the spec asked for `||notRetrieved`. */
    emptySmiles: rows.filter((r) => r.split('|')[1] === '').map((r) => r.split('|')[0]),
    withSmiles: rows.filter((r) => r.split('|')[1]).length,
    custody: rows.length === declared.rows && sha256(bytes) === declared.sha256 ? 'VERIFIED' : 'FAILED',
  };
}

export function checkDeliveredA2Chunk1() {
  return checkA2Chunk(
    A2_DECLARED.chunks[0],
    readFileSync(join(A2_DIR, 'A2-chunk-01.received.psv')),
  );
}

/** Rows the A2 delivery still owes, counted against A1's frozen 300. */
export function a2Coverage() {
  const c1 = checkDeliveredA2Chunk1();
  const delivered = A2_DECLARED.chunks.filter((c) => c.delivered);
  return {
    a1Molecules: a1MoleculeIds().size,
    declaredTotal: A2_DECLARED.totalRows,
    declaredSum: A2_DECLARED.chunks.reduce((n, c) => n + c.rows, 0),
    chunksDelivered: delivered.length,
    chunksInventoryOnly: A2_DECLARED.chunks.length - delivered.length,
    rowsDelivered: c1.receivedRows,
    structuresDelivered: c1.withSmiles,
    custodyVerifiedStructures: 0, // no delivered chunk passed custody
    complete: false,
  };
}

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

/**
 * C1 is gated on data volume, and A2 is the only route to that volume. This
 * states the gate; it does not adjust it.
 */
export function c1Status() {
  const cov = a2Coverage();
  return {
    status: 'NOT_CLOSED',
    reason: 'data volume, not methodology',
    a2Complete: cov.complete,
    custodyVerifiedStructuresAvailable: cov.custodyVerifiedStructures,
    structuresFrozenInRepo: 7, // D-076/077 pin
    structuresNeeded: cov.a1Molecules,
    thresholdsChanged: false,
    preregChanged: false,
    winnerGateChanged: false,
  };
}
