import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from './genesisEvent';
import type { EventRegistry } from './eventRegistry';
import { fnv1a, canonicalJson } from './hash';

/**
 * DETERMINISTIC REPLAY (Pakiet B) — READ-ONLY narzędzie porównawcze przebiegów
 * zdarzeń. NIE zapisuje historii (żadnego localStorage/backendu). Buduje
 * odcisk przebiegu i strukturalnie porównuje dwa przebiegi, jawnie raportując
 * pierwszy rozjazd — nie maskując go.
 */

export interface EventRunFingerprint {
  contractVersion: string;
  modelId?: string;
  experimentId?: string;
  seed?: number | string;
  paramsHash?: string;
  eventCount: number;
  /** Uporządkowana lista ID zdarzeń (kolejność chronologiczna, stabilna). */
  eventIds: string[];
  /** Skrót całej sekwencji (id|type|timestamp) — szybkie porównanie równości. */
  digest: string;
}

/** Chronologiczne, stabilne uporządkowanie: timestamp rosnąco, remis → kolejność rejestracji. */
function orderedEvents(registry: EventRegistry): readonly GenesisEvent[] {
  return registry.all(); // EventRegistry.all() już sortuje po timestamp + insertion index
}

export function fingerprintRun(registry: EventRegistry, ctx: {
  modelId?: string; experimentId?: string; seed?: number | string; paramsHash?: string;
} = {}): EventRunFingerprint {
  const events = orderedEvents(registry);
  const eventIds = events.map((e) => e.id);
  const digest = fnv1a(canonicalJson(events.map((e) => [e.id, e.type, e.timestamp])));
  return {
    contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
    modelId: ctx.modelId, experimentId: ctx.experimentId, seed: ctx.seed, paramsHash: ctx.paramsHash,
    eventCount: events.length, eventIds, digest,
  };
}

export type DivergenceReason =
  | 'missing-in-a' | 'missing-in-b' | 'id' | 'type' | 'timestamp' | 'source' | 'target' | 'provenance';

export interface RunComparison {
  match: boolean;
  countA: number;
  countB: number;
  /** Indeks pierwszego rozjazdu (-1 jeśli brak). */
  firstDivergenceIndex: number;
  /** Szczegóły rozjazdu — jawne, nie maskowane. */
  divergence?: {
    index: number;
    a?: { id: string; type: string; timestamp: number };
    b?: { id: string; type: string; timestamp: number };
    reason: DivergenceReason;
  };
}

export function compareEventRuns(a: EventRegistry, b: EventRegistry): RunComparison {
  const ea = orderedEvents(a), eb = orderedEvents(b);
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) {
    const x = ea[i], y = eb[i];
    if (!x || !y) {
      return {
        match: false, countA: ea.length, countB: eb.length, firstDivergenceIndex: i,
        divergence: {
          index: i,
          a: x && { id: x.id, type: x.type, timestamp: x.timestamp },
          b: y && { id: y.id, type: y.type, timestamp: y.timestamp },
          reason: !x ? 'missing-in-a' : 'missing-in-b',
        },
      };
    }
    const reason = firstFieldMismatch(x, y);
    if (reason) {
      return {
        match: false, countA: ea.length, countB: eb.length, firstDivergenceIndex: i,
        divergence: {
          index: i,
          a: { id: x.id, type: x.type, timestamp: x.timestamp },
          b: { id: y.id, type: y.type, timestamp: y.timestamp },
          reason,
        },
      };
    }
  }
  return { match: true, countA: ea.length, countB: eb.length, firstDivergenceIndex: -1 };
}

function firstFieldMismatch(x: GenesisEvent, y: GenesisEvent): DivergenceReason | null {
  if (x.id !== y.id) return 'id';
  if (x.type !== y.type) return 'type';
  if (x.timestamp !== y.timestamp) return 'timestamp';
  if (canonicalJson(x.source ?? null) !== canonicalJson(y.source ?? null)) return 'source';
  if (canonicalJson(x.affectedEntities) !== canonicalJson(y.affectedEntities)) return 'target';
  if (canonicalJson(x.provenance ?? null) !== canonicalJson(y.provenance ?? null)) return 'provenance';
  return null;
}
