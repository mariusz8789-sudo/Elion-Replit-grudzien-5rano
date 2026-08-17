import { validateEvent, type GenesisEvent } from './genesisEvent';

/**
 * SERIALIZATION (Pakiet A) — JSON-safe round-trip GenesisEvent.
 *
 * GenesisEvent jest z założenia czystymi danymi (bez funkcji/klas), więc
 * serializacja to kanoniczny JSON. `deserializeEvent` waliduje kształt, żeby
 * konsument nie wczytał uszkodzonego zdarzenia. Round-trip nie może gubić
 * id / timestamp / parentEventId / provenance / parameters.
 */

export function serializeEvent(event: GenesisEvent): string {
  return JSON.stringify(event);
}

export function serializeEvents(events: readonly GenesisEvent[]): string {
  return JSON.stringify(events);
}

export function deserializeEvent(json: string): GenesisEvent {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('deserializeEvent: not an object');
  const e = parsed as GenesisEvent;
  const v = validateEvent(e);
  if (!v.ok) throw new Error(`deserializeEvent: invalid GenesisEvent (${v.errors.join('; ')})`);
  if (typeof e.id !== 'string' || typeof e.contractVersion !== 'string') {
    throw new Error('deserializeEvent: missing id/contractVersion');
  }
  return e;
}

export function deserializeEvents(json: string): GenesisEvent[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error('deserializeEvents: not an array');
  return parsed.map((p) => deserializeEvent(JSON.stringify(p)));
}
