/**
 * CANONICAL JSON — the SAME deterministic contract Genesis already uses
 * (`packages/frontend/src/core/events/hash.ts::canonicalJson`): recursively
 * sort object keys before stringifying, so the same logical value always
 * produces the same string regardless of property insertion order. Arrays
 * keep their own order (order is meaningful there); `null` and primitives
 * pass through unchanged; nested objects/arrays are canonicalized
 * recursively.
 *
 * This is intentionally NOT reimplemented differently — it is copied
 * verbatim from Genesis's own contract rather than invented ad hoc, per the
 * "don't build almost-JSON-canonicalization when a simpler deterministic
 * contract already exists" rule. It lives in this package (rather than a
 * cross-package import) only because `@genesis-os/csrn` must build and run
 * standalone (its own `npm test`/`npm run demo`), independent of the
 * frontend package's Vite toolchain.
 *
 * NOT SUPPORTED, DELIBERATELY: `bigint` and `undefined` values inside an
 * object throw (`JSON.stringify` would otherwise silently drop `undefined`
 * keys or throw on `bigint` deep inside `JSON.stringify` anyway) — a
 * certificate's canonical form must never silently lose a field.
 */
export function canonicalJson(value: unknown): string {
  assertNoUnsupportedValues(value, '$');
  return JSON.stringify(sortKeys(value));
}

function assertNoUnsupportedValues(value: unknown, path: string): void {
  if (typeof value === 'bigint') {
    throw new Error(`canonicalJson: bigint is not supported (at ${path}) — canonicalize a string representation instead.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUnsupportedValues(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        throw new Error(`canonicalJson: undefined field "${key}" (at ${path}.${key}) would be silently dropped — omit the key explicitly or use null.`);
      }
      assertNoUnsupportedValues(entry, `${path}.${key}`);
    }
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}
