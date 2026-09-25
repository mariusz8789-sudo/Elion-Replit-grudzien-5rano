import { canonicalJson, fnv1a } from '../events/hash';
import { FailClosedError, type BioModelCard, type ParamSpec } from './contracts';

/**
 * Hash provider decision — same as the retired physicsWorld runtime (D-052, removed):
 * the bundle asked for a swappable SHA-256 `HashProvider`; the existing
 * Genesis hash module (`core/events/hash.ts`) is FNV-1a, used by every
 * fingerprint already in this codebase. Reused directly here rather than
 * adding a second, parallel crypto system — fingerprints are 8 hex chars.
 */
export const fingerprintOf = (value: unknown): string => fnv1a(canonicalJson(value));

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

/** Fingerprints a BioModelCard and refuses if a DIFFERENT card was already sealed under the same modelId — a model definition may not silently change mid-run. */
export function sealModelCard(card: BioModelCard): string {
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

/** Deterministic PRNG from a 32-bit integer seed — used only by `microscope.ts` for visual field layout, never by the models themselves (see `models.ts`'s header: every toy model here is a closed-form/ODE computation, no randomness). */
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
