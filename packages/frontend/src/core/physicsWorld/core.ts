import { canonicalJson, fnv1a } from '../events/hash';
import { FailClosedError, type ExperimentDefinition, type ModelCard, type ParamSpec } from './contracts';

/**
 * HASH PROVIDER DECISION (item 1 of the integration mandate: "integracja z
 * istniejącym Genesis SHA-256/hash providerem").
 *
 * The source bundle asked for a swappable `HashProvider` interface defaulting
 * to `node:crypto`'s SHA-256, to be replaced in-repo by "the existing Genesis
 * hash module". That module is `core/events/hash.ts` — and it is FNV-1a
 * (8 hex chars), not SHA-256. Every fingerprint already in this codebase
 * (A2, G2, D-042 through D-050, `genesisAdjudicationProtocol.ts`'s own
 * `ruleFingerprint`/`inputFingerprint`) is `fnv1a(canonicalJson(...))`.
 *
 * Introducing a real SHA-256 provider here — even labelled "for physics
 * only" — would be a second, parallel crypto system living beside the one
 * every other fingerprint in this repo already uses, for the sole benefit of
 * one new module. That is exactly the "second engine" this mandate forbids.
 * So this file drops the `HashProvider` abstraction entirely and calls
 * `fnv1a(canonicalJson(...))` directly, exactly like every other domain in
 * this repo. `reproducibilityFingerprint`/`modelCardHash` below are 8 hex
 * chars, not 64 — that is the real, existing provider's real output, and the
 * ported test suite asserts the true length rather than the bundle's
 * SHA-256 assumption.
 */
export const fingerprintOf = (value: unknown): string => fnv1a(canonicalJson(value));

/** Mulberry32 — deterministic PRNG from a 32-bit integer seed. Ported unchanged. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateParams(specs: readonly ParamSpec[]): void {
  for (const p of specs) {
    if (p.required && !Number.isFinite(p.value)) {
      throw new FailClosedError(`param '${p.name}' missing/non-finite`, 'PARAMS');
    }
    if (Number.isFinite(p.value) && (p.value < p.min || p.value > p.max)) {
      throw new FailClosedError(`param '${p.name}'=${p.value} outside [${p.min},${p.max}]`, 'PARAMS');
    }
  }
}

const sealedCards = new Map<string, string>();

/** Fingerprints a ModelCard and refuses if a DIFFERENT card was already sealed under the same modelId — a model definition may not silently change mid-run. */
export function sealModelCard(card: ModelCard): string {
  const h = fingerprintOf(card);
  const prev = sealedCards.get(card.modelId);
  if (prev !== undefined && prev !== h) {
    throw new FailClosedError(`model card '${card.modelId}' changed after experiment start`, 'MODEL');
  }
  sealedCards.set(card.modelId, h);
  return h;
}

export function _resetSealedCards(): void {
  sealedCards.clear();
}

export const defFingerprint = (def: ExperimentDefinition): string => fingerprintOf(def);
