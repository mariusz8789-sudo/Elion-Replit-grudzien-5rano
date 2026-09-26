/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256HexSync } from './knowledge/sha256.js';

/**
 * THE deterministic primitives of Genesis — one canonical JSON, one FNV-1a, one SHA-256, one PRNG.
 *
 * Every fingerprint, replay identity, ledger hash and seeded simulation in core and frontend uses
 * these (the backend's `provenance.mjs` implements the SAME canonical JSON rule for .mjs code).
 * Copies that had drifted apart disagreed on key order (`localeCompare` vs code-unit sort) and on
 * `undefined`, so one object could hash two ways. The rules here:
 *
 * - canonicalJson: `JSON.stringify` of the value with object keys sorted RECURSIVELY by UTF-16
 *   code unit (`Array.prototype.sort` default, as RFC 8785/JCS) — never `localeCompare`, whose
 *   order depends on the runtime's ICU/locale. Arrays keep their order. JSON semantics otherwise:
 *   keys whose value is `undefined` are omitted, `undefined` in arrays becomes `null`, `toJSON`
 *   (e.g. Date) is honoured. For plain JSON data this is byte-identical to every previous
 *   code-unit copy, so persisted ledger hashes still verify.
 * - fnv1a: FNV-1a 32-bit over UTF-16 code units → 8 lower-case hex chars. Not cryptographic.
 * - sha256Hex: FIPS 180-4 over UTF-8, isomorphic (bit-identical to node:crypto; sha256.test.ts).
 * - mulberry32: the seeded PRNG every simulation uses → float in [0, 1).
 */

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const withJson = value as { toJSON?: () => unknown };
    if (typeof withJson.toJSON === 'function') return sortKeysDeep(withJson.toJSON());
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = sortKeysDeep(record[key]);
    return out;
  }
  return value;
}

/** Canonical JSON (code-unit key order at every level). `undefined` at the top level yields `'null'`. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value)) ?? 'null';
}

/** FNV-1a 32-bit of a string → 8 hex chars. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** FNV-1a 32-bit as an unsigned integer (for seeds and buckets). Same bits as `fnv1a`. */
export function fnv1aUint(input: string): number {
  return Number.parseInt(fnv1a(input), 16);
}

/** 8-hex FNV-1a of the canonical JSON of a value — the short stable id. */
export function stableHash(value: unknown): string {
  return fnv1a(canonicalJson(value));
}

/** Lower-case hex SHA-256 of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return sha256HexSync(text);
}

/** Seeded PRNG (mulberry32) → float in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
