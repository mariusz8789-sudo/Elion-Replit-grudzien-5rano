import { stableHash as canonicalStableHash } from '../determinism.js';

/**
 * Delivered as a FNV-1a over `JSON.stringify(input, Object.keys(input).sort())`. That replacer
 * array applies to EVERY nesting level, so any nested key absent from the top-level key list was
 * silently dropped from the hash (two plans differing only in `steps[].actionType` hashed alike;
 * a decision's `facts` array collapsed to `[]`). Corrected to a canonical JSON (sorted keys at every
 * level, arrays in order) with the same FNV-1a and the same 8-hex output shape — documented in
 * docs/DECISIONS.md D-127.
 */
/** 8-hex FNV-1a of the canonical JSON — now the ONE implementation in ../determinism.ts. */
export function stableHash(input: unknown): string {
  return canonicalStableHash(input);
}
