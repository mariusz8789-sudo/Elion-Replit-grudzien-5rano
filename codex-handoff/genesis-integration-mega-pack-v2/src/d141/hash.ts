import type { HashPort } from "../hashReplay/hashPort.js";
import { TEST_ONLY_HASH_PORT } from "../hashReplay/testHash.js";

/**
 * V1 declared its own private fnv1a32/canonicalJson pair directly in this file. V2 fix
 * area 4: this module no longer owns a hash implementation — it delegates to an injected
 * `HashPort` (see `../hashReplay/hashPort.ts`), defaulting to the TEST-ONLY reference
 * implementation only when the host supplies none. Production callers (Codex, binding
 * this into the real repo) MUST supply the real `core/events/hash.ts` HashPort so every
 * fingerprint this package emits agrees with the rest of the repo's evidence/replay
 * fingerprints.
 */
export function fingerprint(value: unknown, hashPort: HashPort = TEST_ONLY_HASH_PORT): string {
  return hashPort.fingerprint(value);
}
