/**
 * INTEGRITY ENVELOPE — tamper detection for exported scientific records.
 *
 * SCOPE, STATED EXPLICITLY: this is an integrity HASH, not a cryptographic
 * SIGNATURE. It does not prove authorship, identity, or authenticity, and
 * provides no non-repudiation. It only detects whether a record's content
 * changed between export and verification — the honest minimum a downloaded
 * "Evidence Bundle" JSON needs so an external auditor can trust the file in
 * their hands is the file Genesis actually produced, without trusting
 * Genesis's UI to say so.
 *
 * ALGORITHM: canonicalize (sort object keys at every nesting level, preserve
 * array order, no whitespace) -> UTF-8 encode -> SHA-256 via the native Web
 * Crypto API (zero dependencies) -> lowercase hex.
 *
 * WHY THE RECORD IS JSON-ROUND-TRIPPED BEFORE CANONICALIZING: the hash must
 * match exactly what ends up in the downloaded file, not the richer
 * in-memory JS object. `JSON.stringify` silently DROPS `undefined`-valued
 * keys, converts `Date` objects to ISO strings via `.toJSON()`, and turns
 * `NaN`/`Infinity` into `null`. A canonicalizer that walked the raw in-memory
 * object instead would compute a hash over data the actual download never
 * contains — a normal export -> download -> reopen -> verify cycle would
 * then report a false DRIFT on a file nobody tampered with. Round-tripping
 * through `JSON.parse(JSON.stringify(...))` first makes the hash a function
 * of the exact bytes that get written, eliminating that whole class of false
 * positive.
 */

export interface ExportableRecord {
  readonly [key: string]: unknown;
}

export interface IntegrityEnvelope {
  readonly record: ExportableRecord;
  readonly integrityHash: string;
  readonly exportedAt: string;
  readonly verificationInstructions: string;
}

export interface VerificationResult {
  readonly valid: boolean;
  readonly reason: string;
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  if (type === 'object') {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    return `{${sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`).join(',')}}`;
  }
  // Functions, symbols, bigint — matches JSON.stringify's own "cannot represent, drop/error" territory.
  return 'null';
}

/** Exactly what `JSON.stringify(record)` will actually produce — see the module doc for why this precedes canonicalization. */
function normalizeForHashing(record: ExportableRecord): ExportableRecord {
  return JSON.parse(JSON.stringify(record)) as ExportableRecord;
}

/**
 * Deterministic SHA-256 hex hash of a record. Two logically identical
 * records (any key order, any construction history) produce the same hash;
 * one changed byte anywhere produces a different one.
 */
export async function computeIntegrityHash(record: ExportableRecord): Promise<string> {
  const canonicalJson = canonicalize(normalizeForHashing(record));
  const bytes = new TextEncoder().encode(canonicalJson);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const VERIFICATION_INSTRUCTIONS = `HOW TO VERIFY THIS RECORD'S INTEGRITY
=====================================

This is an INTEGRITY HASH, NOT a cryptographic signature. It does NOT prove
who created this record or when, and provides no authenticity guarantee —
anyone can recompute it from the record alone. It only lets you detect
whether the "record" field below has changed since it was exported.

STEP 1: Extract the "record" field from this JSON envelope.

STEP 2: Convert it to canonical JSON:
  - Round-trip it through your language's standard JSON parse/stringify
    once first (so undefined-like values and non-JSON types normalize the
    same way they did on export).
  - Primitives: standard JSON serialization.
  - Arrays: preserve element order; canonicalize each element recursively.
  - Objects: sort keys ALPHABETICALLY at every nesting level, then
    canonicalize each value recursively.
  - Join with no whitespace: {"key":value,...} / [value,...]

STEP 3: Hash the canonical JSON with SHA-256.

STEP 4: Compare to "integrityHash" below. Exact match (64 lowercase hex
characters) means unmodified; any difference means the record was altered
after export.

EXAMPLE (Node.js):
  const crypto = require('crypto');
  function canonicalize(v) {
    if (v === null || v === undefined) return 'null';
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
    if (t === 'object') {
      return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
    }
    return 'null';
  }
  const normalized = JSON.parse(JSON.stringify(envelope.record));
  const hash = crypto.createHash('sha256').update(canonicalize(normalized)).digest('hex');
  console.log(hash === envelope.integrityHash);

EXAMPLE (Python):
  import hashlib, json
  def canonicalize(v):
      if v is None: return 'null'
      if isinstance(v, bool): return 'true' if v else 'false'
      if isinstance(v, (int, float)): return json.dumps(v)
      if isinstance(v, str): return json.dumps(v)
      if isinstance(v, list): return '[' + ','.join(canonicalize(x) for x in v) + ']'
      if isinstance(v, dict):
          return '{' + ','.join(json.dumps(k) + ':' + canonicalize(v[k]) for k in sorted(v.keys())) + '}'
      return 'null'
  normalized = json.loads(json.dumps(envelope["record"]))
  digest = hashlib.sha256(canonicalize(normalized).encode('utf-8')).hexdigest()
  print(digest == envelope["integrityHash"])
`;

/** Wraps an already-assembled record in a portable, independently-verifiable envelope. */
export async function buildIntegrityEnvelope(record: ExportableRecord, exportedAt: string): Promise<IntegrityEnvelope> {
  return {
    record,
    integrityHash: await computeIntegrityHash(record),
    exportedAt,
    verificationInstructions: VERIFICATION_INSTRUCTIONS,
  };
}

const HASH_FORMAT = /^[a-f0-9]{64}$/;

/** Recomputes the hash from `envelope.record` and compares — never trusts `envelope.integrityHash` alone. */
export async function verifyIntegrityEnvelope(envelope: IntegrityEnvelope): Promise<VerificationResult> {
  if (!envelope || typeof envelope !== 'object') return { valid: false, reason: 'Invalid envelope: not an object.' };
  if (!envelope.record || typeof envelope.record !== 'object') return { valid: false, reason: 'Invalid envelope: missing or invalid "record" field.' };
  if (typeof envelope.integrityHash !== 'string' || !HASH_FORMAT.test(envelope.integrityHash)) {
    return { valid: false, reason: `Invalid envelope: "integrityHash" is not 64 lowercase hex characters (got "${String(envelope.integrityHash).slice(0, 32)}").` };
  }
  try {
    const recomputed = await computeIntegrityHash(envelope.record);
    return recomputed === envelope.integrityHash
      ? { valid: true, reason: 'Integrity verified: the record matches its hash.' }
      : { valid: false, reason: `Hash mismatch — record has been modified since export (expected "${envelope.integrityHash}", computed "${recomputed}").` };
  } catch (error) {
    return { valid: false, reason: `Verification error: ${error instanceof Error ? error.message : String(error)}` };
  }
}
