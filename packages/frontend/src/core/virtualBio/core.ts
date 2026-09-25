import { canonicalJson, fnv1a } from '../events/hash';
import { FailClosedError, type BioModelCard, type ParamSpec } from './contracts';
import { mulberry32 } from '@genesis/core/determinism.js';
export { mulberry32 };

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
