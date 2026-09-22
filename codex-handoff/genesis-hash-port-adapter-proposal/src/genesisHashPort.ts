/**
 * Real HashPort adapter for the Genesis transfer packages (D-141/D-142/
 * GENESIS-INTEGRATION-MEGA-PACK-V2 and genesis-engine-suite-e2e-v1). Both package families
 * declare their own `HashPort`-shaped seam (`{ hash(text): string }` and/or
 * `{ fingerprint(value): string }`) with a reference/test-only FNV-1a reimplementation that
 * every one of their own READMEs explicitly says must not be used in production. This adapter
 * wraps the repo's ALREADY-canonical `fnv1a`/`canonicalJson` (core/events/hash.ts) so any
 * transfer package can be bound to the real algorithm instead of shipping yet another private
 * copy of it.
 *
 * Standalone-only: nothing in the real repo imports this yet (see ALLOWED_ORPHANS in
 * moduleReachability.test.ts). Which transfer-package architecture, if any, gets wired into
 * production, and where, is a decision for Codex/a human -- not made here.
 */
import { fnv1a, canonicalJson } from '../events/hash';

export interface TextHashPort {
  hash(text: string): string;
}

export interface ValueFingerprintPort {
  fingerprint(value: unknown): string;
}

export class GenesisHashPort implements TextHashPort, ValueFingerprintPort {
  hash(text: string): string {
    return fnv1a(text);
  }

  fingerprint(value: unknown): string {
    return fnv1a(canonicalJson(value));
  }
}

export const genesisHashPort = new GenesisHashPort();
