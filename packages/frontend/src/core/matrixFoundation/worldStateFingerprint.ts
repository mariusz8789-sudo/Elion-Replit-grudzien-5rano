/**
 * MATRIX FOUNDATION — WORLD STATE FINGERPRINT.
 *
 * docs/MATRIX_WORLD_POC_READINESS_AUDIT.md found that every existing
 * "result fingerprint" (ScenarioRun.resultFingerprint, DiscoveryCase's
 * runFingerprint, HazardRun.resultFingerprint) covers only aggregate/output
 * fields — per-day epidemic totals, an evidence pack, a hazard's scientific
 * output — never raw per-entity world state. That gap is structural, not
 * epidemic- or hazard-specific, so this is domain-neutral: any future
 * agent-level POC (Matrix World or otherwise) needs a fingerprint over
 * "who is where, doing what" that today does not exist anywhere in Genesis.
 *
 * Built on the same two primitives every other fingerprint in Genesis
 * already uses — `canonicalJson` (core/events/hash.ts) and `sha256Hex`
 * (core/discovery/evidenceCrypto.ts) — not a third hashing scheme. See
 * core/hazard/fingerprint.ts for the precedent this mirrors.
 *
 * This module does not read or write any World, Agent, City3D, Earthquake
 * or Epidemic Core state. It is a pure function of whatever snapshot a
 * caller already computed.
 */
import { canonicalJson } from '../events/hash';
import { sha256Hex } from '../discovery/evidenceCrypto';

/** One entity's state at a moment, in a domain-neutral shape — not epidemic AgentStateView. */
export interface WorldEntitySnapshot {
  readonly id: string | number;
  /** Domain-specific kind label (e.g. 'agent', 'building'). Neutral — this module does not interpret it. */
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  /** Domain-specific state label (e.g. a health state, an agent status). */
  readonly state: string;
  /** Optional domain payload, included verbatim in the fingerprint. */
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface WorldStateSnapshot {
  readonly tick: number;
  readonly entities: readonly WorldEntitySnapshot[];
}

/**
 * Quantizes a coordinate to a fixed decimal precision before hashing, so
 * cross-platform floating-point noise (same seed, different JS engine or
 * CPU) cannot flip a fingerprint that is otherwise scientifically
 * identical. Generalizes the same problem
 * core/hazard/earthquake/earthquakeModel.ts's (module-private)
 * roundForCrossEngineDeterminism solves for one hazard's output fields.
 */
export function quantizeForFingerprint(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function canonicalEntity(entity: WorldEntitySnapshot): Record<string, unknown> {
  return {
    id: entity.id,
    kind: entity.kind,
    x: quantizeForFingerprint(entity.x),
    y: quantizeForFingerprint(entity.y),
    state: entity.state,
    attributes: entity.attributes ?? {},
  };
}

/**
 * Fingerprints a world snapshot. Entities are sorted by (string-compared)
 * id before hashing so the fingerprint depends on WHO is where, never on
 * array/iteration order — a snapshot rebuilt from the same underlying
 * state (e.g. after a Map -> Array conversion) always fingerprints
 * identically, exactly like `HazardInput`'s canonical-field fingerprinting.
 */
export async function computeWorldStateFingerprint(snapshot: WorldStateSnapshot): Promise<string> {
  const sortedEntities = [...snapshot.entities]
    .map(canonicalEntity)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sha256Hex(canonicalJson({ tick: snapshot.tick, entities: sortedEntities }));
}
