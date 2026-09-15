#!/usr/bin/env node
/**
 * D-108 — per-ROW custody for the A2 chunks whose chunk-level hash never lands.
 *
 * WHY THIS EXISTS. Five transmissions established that this channel corrupts
 * individual rows non-deterministically (D-107): chunk 2 reproduced identical
 * wrong bytes, chunk 4 disagreed with itself in both directions, chunk 8's two
 * corrupted rows became four on re-send. A chunk-level hash over ~100 rows is
 * therefore a coin flip that never lands: one bad row condemns the whole chunk
 * and says nothing about which. Hashing each row separately CONVERGES — every
 * re-transmission can only shrink the failing set, because a row that verifies
 * stays verified and is never re-sent.
 *
 * WHAT THIS IS NOT. This is a finer-grained custody check, not a weaker one.
 * A row is usable only if its RECEIVED BYTES hash to the supplier's declared
 * value for that row. Nothing is inferred, averaged, or repaired into place.
 *
 * ============== THE CHANNEL CORRECTION, AND WHY IT IS QUARANTINED ==========
 *
 * One corruption has a known, single, literal signature (D-107): `Cb3cccc(`
 * where the source reads `Cc3cccc(` — aromatic boron in place of aromatic
 * carbon. The supplier proposed applying it automatically before re-checking.
 * That is NOT done silently here, and corrected rows do NOT become usable data:
 *
 *   - the correction is ONE literal replacement, declared in advance, applied
 *     never to any other pattern and never iteratively;
 *   - BOTH byte sequences are retained — the row as received and the row after
 *     correction — so the audit shows what arrived and what was changed;
 *   - a row that only verifies after correction gets its own status,
 *     VERIFIED_AFTER_CHANNEL_CORRECTION, which is NOT the same as RAW_VERIFIED
 *     and is EXCLUDED from the usable set by default.
 *
 * The last point is the one that matters. A correction that makes a hash match
 * is strong evidence about that row — but a repository that silently promotes
 * repaired bytes to verified data has stopped recording what it received. The
 * repaired rows are held in quarantine and reported; whether they may enter a
 * measurement is a human seal, not an agent's inference.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { A2_DECLARED, attemptsOf } from './d105-a2-custody.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROWHASH_DIR = join(ROOT, 'data/transcription/glp1r-a2/per-row');

const sha256 = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/**
 * The one correction this module knows. A literal pair, not a pattern language:
 * adding a second entry here is a methodology change and needs its own D-entry.
 */
export const DECLARED_CHANNEL_CORRECTION = Object.freeze({
  id: 'D-107-AROMATIC-BORON',
  from: 'Cb3cccc(',
  to: 'Cc3cccc(',
  rationale: 'lowercase b is aromatic boron; every occurrence in this delivery sat in this exact context, where the source reads aromatic carbon',
});

export function applyDeclaredCorrection(smiles) {
  return smiles.split(DECLARED_CHANNEL_CORRECTION.from).join(DECLARED_CHANNEL_CORRECTION.to);
}

/** Supplier-declared per-row hashes, as delivered. Empty where not yet sent. */
export function declaredRowHashes() {
  const byChunk = new Map();
  if (!existsSync(ROWHASH_DIR)) return byChunk;
  for (const file of readdirSync(ROWHASH_DIR).filter((f) => f.endsWith('.rowhash')).sort()) {
    const n = Number(/chunk-0(\d)/.exec(file)[1]);
    const partial = file.includes('.partial.');
    const rows = new Map();
    for (const line of readFileSync(join(ROWHASH_DIR, file), 'utf8').split('\n')) {
      if (!line) continue;
      const [id, hash] = line.split('|');
      rows.set(id, hash);
    }
    byChunk.set(n, { rows, partial, file });
  }
  return byChunk;
}

/** Every distinct byte-sequence received for a row, across all attempts. */
function receivedRowVariants(chunk) {
  const byId = new Map();
  for (const attempt of attemptsOf(chunk)) {
    for (const row of attempt.rows) {
      const i = row.indexOf('|');
      const id = row.slice(0, i);
      if (!byId.has(id)) byId.set(id, []);
      const seen = byId.get(id);
      if (!seen.some((v) => v.row === row)) seen.push({ row, file: attempt.file });
    }
  }
  return byId;
}

export const ROW_STATUS = Object.freeze({
  RAW_VERIFIED: 'RAW_VERIFIED',
  VERIFIED_AFTER_CHANNEL_CORRECTION: 'VERIFIED_AFTER_CHANNEL_CORRECTION',
  FAILED: 'FAILED',
  NOT_DECLARED: 'NOT_DECLARED',
});

/**
 * Check one chunk row by row. Returns a status per row plus, for corrected
 * rows, both byte sequences — received and corrected — so the audit is complete.
 */
export function checkChunkRows(chunk) {
  const declared = declaredRowHashes().get(chunk);
  const variants = receivedRowVariants(chunk);
  const rows = [];

  for (const [id, seen] of variants) {
    const want = declared?.rows.get(id);
    if (!want) { rows.push({ id, status: ROW_STATUS.NOT_DECLARED }); continue; }

    const raw = seen.find((v) => sha256(v.row) === want);
    if (raw) { rows.push({ id, status: ROW_STATUS.RAW_VERIFIED, attemptFile: raw.file }); continue; }

    let corrected = null;
    for (const v of seen) {
      const fixed = applyDeclaredCorrection(v.row);
      if (fixed !== v.row && sha256(fixed) === want) { corrected = { v, fixed }; break; }
    }
    if (corrected) {
      rows.push({
        id,
        status: ROW_STATUS.VERIFIED_AFTER_CHANNEL_CORRECTION,
        attemptFile: corrected.v.file,
        correction: DECLARED_CHANNEL_CORRECTION.id,
        receivedBytes: corrected.v.row,
        correctedBytes: corrected.fixed,
        usable: false,
      });
      continue;
    }

    rows.push({
      id,
      status: ROW_STATUS.FAILED,
      declaredSha256: want,
      receivedSha256: seen.map((v) => sha256(v.row)),
      distinctVariantsReceived: seen.length,
    });
  }

  const by = (s) => rows.filter((r) => r.status === s);
  return {
    chunk,
    declaredRowHashesAvailable: Boolean(declared),
    declaredRowHashesPartial: declared?.partial ?? false,
    declaredRowCount: declared ? declared.rows.size : 0,
    rows,
    rawVerified: by(ROW_STATUS.RAW_VERIFIED).length,
    verifiedAfterCorrection: by(ROW_STATUS.VERIFIED_AFTER_CHANNEL_CORRECTION).length,
    failed: by(ROW_STATUS.FAILED).length,
    notDeclared: by(ROW_STATUS.NOT_DECLARED).length,
    /** Exactly what the supplier must re-send. Shrinks monotonically. */
    resendList: by(ROW_STATUS.FAILED).map((r) => r.id),
  };
}

export function checkAllChunkRows() {
  return A2_DECLARED.map((d) => checkChunkRows(d.n)).filter((r) => r.declaredRowHashesAvailable);
}

/**
 * Rows that may be used as structure identity on per-row custody alone.
 * RAW_VERIFIED only — corrected rows are quarantined pending a human seal.
 */
export function rawVerifiedRows() {
  const map = new Map();
  for (const result of checkAllChunkRows()) {
    for (const row of result.rows) {
      if (row.status !== ROW_STATUS.RAW_VERIFIED) continue;
      const received = receivedRowVariants(result.chunk).get(row.id)
        .find((v) => v.file === row.attemptFile).row;
      const i = received.indexOf('|');
      const smiles = received.slice(i + 1);
      if (smiles) map.set(row.id, smiles);
    }
  }
  return map;
}

/** The quarantine: repaired rows, both byte sequences, awaiting a human seal. */
export function quarantinedRows() {
  const out = [];
  for (const result of checkAllChunkRows()) {
    for (const row of result.rows) {
      if (row.status === ROW_STATUS.VERIFIED_AFTER_CHANNEL_CORRECTION) {
        out.push({ chunk: result.chunk, ...row });
      }
    }
  }
  return out;
}

export function summary() {
  const results = checkAllChunkRows();
  const declared = declaredRowHashes();
  const missing = A2_DECLARED
    .filter((d) => !declared.has(d.n))
    .map((d) => d.n);
  const partial = [...declared.entries()].filter(([, v]) => v.partial).map(([n]) => n);
  return {
    chunksWithRowHashes: results.map((r) => r.chunk),
    chunksAwaitingRowHashes: missing,
    chunksWithPartialRowHashes: partial,
    rawVerified: results.reduce((n, r) => n + r.rawVerified, 0),
    verifiedAfterCorrection: results.reduce((n, r) => n + r.verifiedAfterCorrection, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
    resendList: results.flatMap((r) => r.resendList),
    quarantined: quarantinedRows().length,
    correctedRowsUsable: false,
  };
}

function main() {
  console.log('=== D-108 — PER-ROW custody for A2 ===\n');
  for (const r of checkAllChunkRows()) {
    console.log(`chunk ${r.chunk}${r.declaredRowHashesPartial ? ' (PARTIAL row-hash list)' : ''}: ` +
      `${r.declaredRowCount} declared  RAW_VERIFIED=${r.rawVerified}  ` +
      `AFTER_CORRECTION=${r.verifiedAfterCorrection}  FAILED=${r.failed}  NOT_DECLARED=${r.notDeclared}`);
    if (r.resendList.length) console.log(`   resend: ${r.resendList.join(', ')}`);
  }
  console.log('\n' + JSON.stringify(summary(), null, 1));
}

if (process.argv[1] && process.argv[1].endsWith('d108-per-row-custody.mjs')) main();
