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

/**
 * The certificate-auditor's terminal state, distinguishing outcomes
 * `valid: boolean` alone cannot: a well-formed, unsigned, hash-valid
 * envelope; a validly signed one; one signed by SOMEONE but not the
 * expected/trusted signer (the file is genuine, just not from who you
 * trust); a hash or signature that plainly fails; and a malformed envelope
 * that never reached a real check at all. Added alongside `valid`/`reason`
 * (never replacing them — every existing caller keeps working) because a
 * real cert:// auditor UI needs to react differently to "untrusted signer"
 * than to "corrupted file", and a boolean cannot carry that distinction.
 */
export type IntegrityCertificateStatus =
  /** Hash matches; the envelope carries no signature at all — `verifyIntegrityEnvelope`'s own ceiling. */
  | 'INTEGRITY_VALID_UNSIGNED'
  /** Hash matches, signature cryptographically verifies, and (when checked) the signer is the expected/trusted one. */
  | 'INTEGRITY_SIGNED_VERIFIED'
  /** Hash matches, signature cryptographically verifies — but the embedded key is NOT the expected/trusted signer's key. */
  | 'INTEGRITY_SIGNED_UNTRUSTED'
  /** The envelope is well-formed but its content fails a real check: the hash does not match the record, or the signature does not verify. */
  | 'INTEGRITY_INVALID'
  /** The envelope itself is malformed — missing or wrong-typed fields — before any hash or signature check could even run. */
  | 'STRUCTURALLY_INVALID';

export interface VerificationResult {
  readonly valid: boolean;
  readonly reason: string;
  readonly status: IntegrityCertificateStatus;
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
  if (!envelope || typeof envelope !== 'object') return { valid: false, reason: 'Invalid envelope: not an object.', status: 'STRUCTURALLY_INVALID' };
  if (!envelope.record || typeof envelope.record !== 'object') return { valid: false, reason: 'Invalid envelope: missing or invalid "record" field.', status: 'STRUCTURALLY_INVALID' };
  if (typeof envelope.integrityHash !== 'string' || !HASH_FORMAT.test(envelope.integrityHash)) {
    return { valid: false, reason: `Invalid envelope: "integrityHash" is not 64 lowercase hex characters (got "${String(envelope.integrityHash).slice(0, 32)}").`, status: 'STRUCTURALLY_INVALID' };
  }
  try {
    const recomputed = await computeIntegrityHash(envelope.record);
    return recomputed === envelope.integrityHash
      ? { valid: true, reason: 'Integrity verified: the record matches its hash.', status: 'INTEGRITY_VALID_UNSIGNED' }
      : { valid: false, reason: `Hash mismatch — record has been modified since export (expected "${envelope.integrityHash}", computed "${recomputed}").`, status: 'INTEGRITY_INVALID' };
  } catch (error) {
    return { valid: false, reason: `Verification error: ${error instanceof Error ? error.message : String(error)}`, status: 'STRUCTURALLY_INVALID' };
  }
}

/**
 * SIGNED INTEGRITY ENVELOPE — real ECDSA signatures over the hash above,
 * same zero-dependency philosophy (native Web Crypto `SubtleCrypto`, nothing
 * imported).
 *
 * WHAT THIS ADDS OVER THE BARE HASH, AND WHAT IT STILL DOES NOT PROVE.
 * `computeIntegrityHash` alone lets ANYONE recompute the same hash from the
 * record alone — it detects tampering but says nothing about who produced
 * the file. A real signature needs a private key nobody but the signer
 * holds; `signIntegrityEnvelope` produces that signature, over the hash
 * (not the whole record — the hash already commits to the record's exact
 * bytes, so signing it is equivalent to signing the record and far
 * cheaper).
 *
 * NON-REPUDIATION IS STILL NOT ACHIEVED BY THIS MODULE ALONE, and this is
 * stated as plainly as the parent envelope's own "not a signature" notice:
 * `publicKeySpki` travels INSIDE the same JSON as the signature. Verifying
 * against that embedded key only proves internal self-consistency — "this
 * signature really was produced by the holder of THIS declared key" — the
 * same class of limit `verifyIntegrityEnvelope` already has for hashes
 * ("this record matches its OWN claimed hash"). Establishing that the
 * embedded key actually belongs to a specific real signer needs the
 * verifier to already know that signer's public key fingerprint from an
 * INDEPENDENT channel — which is why `verifySignedEnvelope` takes an
 * optional `expectedPublicKeySpki` to check against, rather than only ever
 * trusting the key riding along in the file.
 */
export type SignatureAlgorithm = 'ECDSA-P256-SHA256';

export interface SignedIntegrityEnvelope extends IntegrityEnvelope {
  /** Base64-encoded ECDSA signature (raw P1363 format) over `integrityHash`'s UTF-8 bytes. */
  readonly signature: string;
  /** Base64-encoded SPKI-format public key the signature verifies against. Travels with the file — see module doc on why that alone is not non-repudiation. */
  readonly publicKeySpki: string;
  readonly signatureAlgorithm: SignatureAlgorithm;
  /** ISO 8601 timestamp of when the signature itself was produced — distinct from (and normally later than) `exportedAt`, which timestamps the underlying hash's envelope. */
  readonly signedAt: string;
}

const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ECDSA_SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' } as const;

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** A fresh ECDSA P-256 key pair for signing envelopes. Both keys are extractable, so the public key can travel with the envelope and the private key can be persisted by whoever holds it. */
export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDSA_PARAMS, true, ['sign', 'verify']);
}

/** Portable (base64 SPKI) form of a public key, for embedding in an envelope or publishing out-of-band as a fingerprint to check against later. */
export async function exportPublicKeySpki(publicKey: CryptoKey): Promise<string> {
  return bufferToBase64(await crypto.subtle.exportKey('spki', publicKey));
}

/** Inverse of `exportPublicKeySpki` — reconstructs a usable verification key from its portable form. */
export async function importPublicKeySpki(base64Spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToBuffer(base64Spki), ECDSA_PARAMS, true, ['verify']);
}

/**
 * Signs an already-built `IntegrityEnvelope` with an ECDSA key pair,
 * producing a `SignedIntegrityEnvelope` a recipient can check with
 * `verifySignedEnvelope` — no private key ever leaves this function's
 * caller. `signedAt` defaults to now; pass it explicitly only when
 * reproducing a signature made at a specific past time (e.g. in tests).
 */
export async function signIntegrityEnvelope(envelope: IntegrityEnvelope, keyPair: CryptoKeyPair, signedAt: string = new Date().toISOString()): Promise<SignedIntegrityEnvelope> {
  const hashBytes = new TextEncoder().encode(envelope.integrityHash);
  const signatureBuffer = await crypto.subtle.sign(ECDSA_SIGN_PARAMS, keyPair.privateKey, hashBytes);
  return {
    ...envelope,
    signature: bufferToBase64(signatureBuffer),
    publicKeySpki: await exportPublicKeySpki(keyPair.publicKey),
    signatureAlgorithm: 'ECDSA-P256-SHA256',
    signedAt,
  };
}

/**
 * Verifies a `SignedIntegrityEnvelope` in two independent steps, and reports
 * exactly which one failed:
 *
 * 1. HASH — same check `verifyIntegrityEnvelope` does: does `record` still
 *    match `integrityHash`?
 * 2. SIGNATURE — does `signature` really verify against `integrityHash`
 *    under the declared public key?
 *
 * `expectedPublicKeySpki`, when passed, adds a THIRD check: does the
 * envelope's own embedded key match the key the caller already knows (from
 * an out-of-band fingerprint) belongs to the expected signer? Omitting it
 * verifies only "internally self-consistent — signed by SOMEONE holding the
 * embedded key", the same self-consistency-only honesty the bare hash
 * already carries; passing it is what turns this into a real identity
 * check.
 */
export async function verifySignedEnvelope(signed: SignedIntegrityEnvelope, expectedPublicKeySpki?: string): Promise<VerificationResult> {
  const hashResult = await verifyIntegrityEnvelope(signed);
  if (!hashResult.valid) return hashResult;

  if (!signed || typeof signed !== 'object') return { valid: false, reason: 'Invalid signed envelope: not an object.', status: 'STRUCTURALLY_INVALID' };
  if (typeof signed.signature !== 'string' || signed.signature.length === 0) {
    return { valid: false, reason: 'Invalid signed envelope: missing "signature".', status: 'STRUCTURALLY_INVALID' };
  }
  if (typeof signed.publicKeySpki !== 'string' || signed.publicKeySpki.length === 0) {
    return { valid: false, reason: 'Invalid signed envelope: missing "publicKeySpki".', status: 'STRUCTURALLY_INVALID' };
  }
  if (signed.signatureAlgorithm !== 'ECDSA-P256-SHA256') {
    return { valid: false, reason: `Unsupported signature algorithm "${String(signed.signatureAlgorithm)}" — only ECDSA-P256-SHA256 is verified here.`, status: 'STRUCTURALLY_INVALID' };
  }
  if (typeof signed.signedAt !== 'string' || signed.signedAt.length === 0) {
    return { valid: false, reason: 'Invalid signed envelope: missing "signedAt".', status: 'STRUCTURALLY_INVALID' };
  }
  if (expectedPublicKeySpki !== undefined && expectedPublicKeySpki !== signed.publicKeySpki) {
    return { valid: false, reason: 'The embedded public key does not match the expected signer\'s key — this file was not signed by the key you were told to trust.', status: 'INTEGRITY_SIGNED_UNTRUSTED' };
  }

  try {
    const publicKey = await importPublicKeySpki(signed.publicKeySpki);
    const hashBytes = new TextEncoder().encode(signed.integrityHash);
    const signatureBuffer = base64ToBuffer(signed.signature);
    const signatureValid = await crypto.subtle.verify(ECDSA_SIGN_PARAMS, publicKey, signatureBuffer, hashBytes);
    return signatureValid
      ? { valid: true, reason: 'Integrity and signature both verified: the record is unmodified and the signature matches the declared key.', status: 'INTEGRITY_SIGNED_VERIFIED' }
      : { valid: false, reason: 'Signature does not verify: the file was altered after signing, or the signature does not belong to the declared key.', status: 'INTEGRITY_INVALID' };
  } catch (error) {
    return { valid: false, reason: `Signature verification error: ${error instanceof Error ? error.message : String(error)}`, status: 'STRUCTURALLY_INVALID' };
  }
}
