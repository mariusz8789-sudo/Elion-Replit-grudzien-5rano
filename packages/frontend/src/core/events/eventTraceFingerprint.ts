/**
 * EVENT TRACE FINGERPRINT.
 *
 * docs/MATRIX_WORLD_POC_READINESS_AUDIT.md: "`EventRegistry` has no digest
 * method... nothing computes it today." `canonicalJson`/`fnv1a` already make
 * this trivial (they mint each event's own `id` in eventRegistry.ts); this
 * is the missing piece that hashes the ORDERED TRACE itself, so a future
 * run record can pin "this exact sequence of events happened" the same way
 * `HazardRun.resultFingerprint` pins a hazard's output fields.
 *
 * Pure function of an already-computed event array — reads no store, no
 * registry, no epidemic or hazard state.
 */
import { canonicalJson } from './hash';
import { sha256Hex } from '../discovery/evidenceCrypto';
import type { GenesisEvent } from './genesisEvent';

/** Only the fields that define what happened — excludes nothing that would let a tampered field escape detection. */
function canonicalEvent(event: GenesisEvent): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    location: event.location ?? null,
    source: event.source ?? null,
    cause: event.cause ?? null,
    affectedEntities: event.affectedEntities,
    severity: event.severity ?? null,
    parameters: event.parameters,
    parentEventId: event.parentEventId ?? null,
  };
}

/**
 * Fingerprints an ORDERED event trace — order is significant and NOT
 * re-sorted here, unlike `computeWorldStateFingerprint`'s entity list.
 * `EventRegistry.all()` already returns a canonically time-and-insertion
 * ordered trace; passing any other ordering (e.g. shuffled) intentionally
 * yields a different fingerprint.
 */
export async function computeEventTraceFingerprint(events: readonly GenesisEvent[]): Promise<string> {
  return sha256Hex(canonicalJson(events.map(canonicalEvent)));
}
