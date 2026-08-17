import type { EventRegistry } from './eventRegistry';
import type { GenesisEvent, EventProvenance } from './genesisEvent';

/**
 * EVENT CONSUMER — nazwany, WĄSKI kontrakt read-only dla Manusa (Pakiet C).
 * Renderer trzyma referencję tego typu, nie EventRegistry — nie ma dostępu do
 * `add()` ani do mutacji. Żadnego EventViewModel tutaj (to własność Manusa).
 */
export interface EventConsumer {
  cursor(): number;
  getEventsSince(cursor: number): { events: readonly GenesisEvent[]; cursor: number };
  getEvent(id: string): GenesisEvent | undefined;
  getEventsByType(type: string): readonly GenesisEvent[];
  getChildren(parentId: string): readonly GenesisEvent[];
  getProvenance(id: string): EventProvenance | null;
  getExperimentHistory(experimentId: string): readonly GenesisEvent[];
  all(): readonly GenesisEvent[];
  count(): number;
}

/**
 * EVENT STREAM — READ-ONLY fasada strumienia zdarzeń dla KONSUMENTA (Manus).
 *
 * Ukrywa `add()` i wszystko, co mutuje. Konsument dostaje stabilny, wąski
 * interfejs (dokładnie ten z kontraktu integracyjnego), a EventRegistry
 * pozostaje jedynym źródłem historii (nie tworzymy drugiego magazynu).
 *
 * Wzorzec konsumpcji per tick:
 *   let cur = stream.cursor();
 *   // ...model tyka, adapter dokłada zdarzenia do registry...
 *   const { events, cursor } = stream.getEventsSince(cur); cur = cursor;
 */
export class EventStream implements EventConsumer {
  constructor(private readonly registry: EventRegistry) {}

  /** Bieżący kursor (do zapamiętania między tickami). */
  cursor(): number { return this.registry.cursor(); }

  /** Nowe zdarzenia od kursora + nowy kursor (do renderu markerów w tym ticku). */
  getEventsSince(cursor: number): { events: readonly GenesisEvent[]; cursor: number } {
    return this.registry.since(cursor);
  }

  getEvent(id: string): GenesisEvent | undefined { return this.registry.get(id); }
  getEventsByType(type: string): readonly GenesisEvent[] { return this.registry.byType(type); }
  getChildren(parentId: string): readonly GenesisEvent[] { return this.registry.children(parentId); }
  getProvenance(id: string): EventProvenance | null { return this.registry.provenanceOf(id); }
  getExperimentHistory(experimentId: string): readonly GenesisEvent[] { return this.registry.experimentHistory(experimentId); }
  all(): readonly GenesisEvent[] { return this.registry.all(); }
  count(): number { return this.registry.count(); }
}
