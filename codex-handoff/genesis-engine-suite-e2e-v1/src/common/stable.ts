export interface HashPort {
  hash(text: string): string;
}

export function canonicalJson(value: unknown): string {
  const normalize = (v: unknown, path: object[]): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (path.includes(v as object)) throw new Error("Cannot canonicalize cyclic value.");
    const next = [...path, v as object];
    if (Array.isArray(v)) return v.map((x) => normalize(x, next));
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = normalize(obj[key], next);
    return out;
  };
  return JSON.stringify(normalize(value, []));
}

/**
 * Reference-only deterministic hash for standalone E2E tests.
 * Real Genesis integration should inject canonical core/events/hash.ts.
 */
export class ReferenceHashPort implements HashPort {
  hash(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
}
