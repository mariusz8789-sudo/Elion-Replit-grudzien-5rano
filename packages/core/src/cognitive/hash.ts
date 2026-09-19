/**
 * Delivered as a FNV-1a over `JSON.stringify(input, Object.keys(input).sort())`. That replacer
 * array applies to EVERY nesting level, so any nested key absent from the top-level key list was
 * silently dropped from the hash (two plans differing only in `steps[].actionType` hashed alike;
 * a decision's `facts` array collapsed to `[]`). Corrected to a canonical JSON (sorted keys at every
 * level, arrays in order) with the same FNV-1a and the same 8-hex output shape — documented in
 * docs/DECISIONS.md D-127.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function stableHash(input: unknown): string {
  const json = canonical(input);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
