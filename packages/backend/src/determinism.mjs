/**
 * THE deterministic primitives of the backend — the .mjs twin of packages/core/src/determinism.ts,
 * with the SAME rules, so a fingerprint means the same thing in the browser, the core engines and
 * the API:
 *
 * - canonicalJson: JSON.stringify with object keys sorted recursively by UTF-16 code unit
 *   (default Array.prototype.sort, as RFC 8785/JCS) — never localeCompare. Arrays keep their order;
 *   `toJSON` is honoured; `undefined`-valued keys are omitted (JSON semantics).
 * - sha256Hex: node:crypto SHA-256 of a UTF-8 string or of raw bytes → lower-case hex.
 * - fnv1a: FNV-1a 32-bit over UTF-16 code units → 8 hex chars (not cryptographic).
 */
import { createHash } from 'node:crypto';

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    if (typeof value.toJSON === 'function') return sortKeysDeep(value.toJSON());
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

/** Canonical JSON (code-unit key order at every level). `undefined` at the top level yields 'null'. */
export function canonicalJson(value) {
  return JSON.stringify(sortKeysDeep(value)) ?? 'null';
}

/** SHA-256 hex of a UTF-8 string, Buffer or Uint8Array. */
export function sha256Hex(data) {
  return typeof data === 'string'
    ? createHash('sha256').update(data, 'utf8').digest('hex')
    : createHash('sha256').update(data).digest('hex');
}

/** FNV-1a 32-bit → 8 hex chars. */
export function fnv1a(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
