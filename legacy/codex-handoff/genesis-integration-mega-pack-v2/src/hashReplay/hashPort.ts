/**
 * Fix area 4 (hash/replay duplication). Every V1 package (D-141, D-142, core-hardening,
 * world-visual) shipped its own private fnv1a32/canonicalJson pair. That is fine for a
 * fully standalone package with zero repo dependency, but it means four independent
 * "reproducibility" hash implementations exist with no guarantee they ever agree with
 * the real repo's canonical `core/events/hash.ts::fnv1a`/`canonicalJson`.
 *
 * V2 rule: every module in this package that needs a fingerprint takes a `HashPort`
 * instead of importing a local hash function directly. In the real Genesis repo, Codex
 * must bind this port to `core/events/hash.ts` (`fnv1a`, `canonicalJson`) so every
 * fingerprint this package produces is computed by the SAME function the rest of the
 * repo already uses for replay/evidence fingerprints. `testHash.ts` in this same folder
 * is a tiny reference implementation for standalone tests and demos only — it must never
 * be the production default.
 */
export interface HashPort {
  /** Deterministic fingerprint of an arbitrary JSON-serializable value. */
  fingerprint(value: unknown): string;
}
