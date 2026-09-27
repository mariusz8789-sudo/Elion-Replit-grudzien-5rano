import type { HashPort } from "./hashPort.js";

/**
 * TEST/DEMO-ONLY reference implementation of HashPort. It exists so this package's own
 * standalone tests and examples can run without any host repo attached. Do NOT bind this
 * as the production HashPort in the real Genesis repo — bind the real
 * `core/events/hash.ts` (`fnv1a` + `canonicalJson`) implementation instead, so this
 * package's fingerprints are computed identically to the rest of the repo's evidence and
 * replay fingerprints.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

export const TEST_ONLY_HASH_PORT: HashPort = {
  fingerprint(value: unknown): string {
    return fnv1a32(canonicalJson(value));
  },
};
