/**
 * Durable, content-addressed custody of the raw bytes a ResearchRun read from outside Genesis:
 * the exact HTTP response bodies of a literature retrieval and the files of a registered dataset.
 *
 * The research-state chain stores only references (sha256, size, provider, request URL); the bytes
 * live here, keyed by their own SHA-256. Every read recomputes the hash, so an edited, truncated or
 * missing record is reported (TAMPERED / MISSING) and never repaired or replaced. Rows are
 * append-only by trigger; anyone able to drop the trigger and edit the file is still caught by the
 * hash. This is one table next to the run, not a second literature system or artifact store.
 */
import { sha256Hex } from './determinism.mjs';

export const SOURCE_RECORD_KIND = Object.freeze({
  LITERATURE_RESPONSE: 'LITERATURE_RESPONSE',
  DATASET: 'DATASET',
});

export const SOURCE_RECORD_STATUS = Object.freeze({
  INTACT: 'INTACT',
  TAMPERED: 'TAMPERED',
  MISSING: 'MISSING',
});

const KINDS = new Set(Object.values(SOURCE_RECORD_KIND));
const SHA256 = /^[a-f0-9]{64}$/;

export function ensureSourceRecordSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_source_records (
      sha256      TEXT PRIMARY KEY,
      kind        TEXT NOT NULL CHECK (kind IN ('LITERATURE_RESPONSE','DATASET')),
      media_type  TEXT NOT NULL,
      bytes       INTEGER NOT NULL,
      body        BLOB NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS research_source_records_append_only_update BEFORE UPDATE ON research_source_records
    BEGIN SELECT RAISE(ABORT, 'research_source_records is append-only: a stored source record cannot be updated'); END;
    CREATE TRIGGER IF NOT EXISTS research_source_records_append_only_delete BEFORE DELETE ON research_source_records
    BEGIN SELECT RAISE(ABORT, 'research_source_records is append-only: a stored source record cannot be deleted'); END;
  `);
}

/** Stores bytes under their SHA-256 (idempotent). Returns { sha256, bytes, artifactId }. */
export function putSourceRecord(db, { kind, mediaType, body }) {
  if (!KINDS.has(kind)) throw new Error(`unknown source record kind ${kind}`);
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  const sha256 = sha256Hex(buffer);
  db.prepare('INSERT OR IGNORE INTO research_source_records (sha256, kind, media_type, bytes, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256, kind, String(mediaType ?? 'application/octet-stream').slice(0, 200), buffer.byteLength, buffer, Date.now());
  return { sha256, bytes: buffer.byteLength, artifactId: `artifact:${sha256}` };
}

/**
 * Reads and re-verifies one record. { status: INTACT, body: Buffer } only when the stored bytes
 * still hash to the key they were stored under.
 */
export function readSourceRecord(db, sha256) {
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return { status: SOURCE_RECORD_STATUS.MISSING, sha256, reason: 'invalid_sha256' };
  const row = db.prepare('SELECT sha256, kind, media_type, bytes, body FROM research_source_records WHERE sha256 = ?').get(sha256);
  if (!row) return { status: SOURCE_RECORD_STATUS.MISSING, sha256 };
  const body = Buffer.from(row.body);
  const actual = sha256Hex(body);
  if (actual !== sha256 || body.byteLength !== row.bytes) {
    return { status: SOURCE_RECORD_STATUS.TAMPERED, sha256, actualSha256: actual, storedBytes: row.bytes, actualBytes: body.byteLength };
  }
  return { status: SOURCE_RECORD_STATUS.INTACT, sha256, kind: row.kind, mediaType: row.media_type, bytes: row.bytes, body };
}
