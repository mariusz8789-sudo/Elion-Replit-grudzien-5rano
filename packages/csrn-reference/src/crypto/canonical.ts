/**
 * CANONICAL JSON — the base layer everything else in this package builds on.
 * Zero dependencies of its own, so it can be imported by both the cert
 * builder and the crypto layer without creating a cycle.
 *
 * Same algorithm as Genesis's own `core/integrity/integrityEnvelope.ts`
 * (frontend): round-trip through `JSON.parse(JSON.stringify(...))` first so
 * the hash matches exactly what a real `JSON.stringify` call on this value
 * would produce (drops `undefined`, turns `Date` into its ISO string via
 * `.toJSON()`, turns `NaN`/`Infinity` into `null`), THEN sort object keys
 * recursively at every nesting level so two logically identical objects with
 * different key insertion order canonicalize identically. Arrays keep their
 * order — they are sequences, not sets.
 *
 * NOT the same concept as Genesis's `core/events/hash.ts` (`fnv1a` +
 * `canonicalJson`): that pairing is an explicitly non-cryptographic 32-bit
 * hash for stable event IDs. This module feeds a real SHA-256 digest
 * (`fingerprint.ts`) for tamper-evidence and signing — a different job.
 */

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, sortKeys(obj[key])]),
    );
  }
  return value;
}

/** Canonical JSON string of `value`: real-`JSON.stringify` semantics first, then keys sorted at every level. */
export function canonicalize(value: unknown): string {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  return JSON.stringify(sortKeys(normalized));
}
