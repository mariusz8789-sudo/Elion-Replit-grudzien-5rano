import {
  GENESIS_EVENT_CONTRACT_VERSION, validateEvent,
  type GenesisEvent, type GenesisEventInput, type EventProvenance,
} from './genesisEvent';
import { fnv1a, canonicalJson } from './hash';

/**
 * EVENT REGISTRY — deterministyczny, uporządkowany czasowo rejestr zdarzeń.
 *
 * Gwarancje:
 *  - jednoznaczne, DETERMINISTYCZNE `id` (skrót kanonicznych pól + numer
 *    sekwencyjny w obrębie rejestru) — ten sam ciąg wejść w tej samej
 *    kolejności daje te same ID (reprodukowalność),
 *  - kolejność czasowa (timestamp rosnąco, remis rozstrzyga sekwencja dodania),
 *  - `parentEventId` do łańcucha przyczynowego,
 *  - odczyt provenance po ID,
 *  - ŻADNYCH losowych zdarzeń — `add()` wymaga jawnego wejścia ze źródła
 *    modelowego/eksperymentu (pole provenance.origin).
 *
 * To NIE drugi World State ani magazyn provenance — to lekki bufor zdarzeń,
 * który konsument (renderer) czyta read-only, a provenance wskazuje na
 * istniejący eksperyment (scienceMemory) / model.
 */
export class EventRegistry {
  private events: GenesisEvent[] = [];
  private seq = 0;
  private readonly ctx: { modelId?: string; experimentId?: string; seed?: number | string };

  constructor(ctx: { modelId?: string; experimentId?: string; seed?: number | string } = {}) {
    this.ctx = ctx;
  }

  /** Deterministyczny ID z kanonicznych pól tożsamości + numeru sekwencyjnego. */
  private makeId(input: GenesisEventInput, seq: number): string {
    const identity = canonicalJson({
      type: input.type,
      timestamp: input.timestamp,
      source: input.source ?? null,
      affected: input.affectedEntities,
      parent: input.parentEventId ?? null,
      modelId: input.modelId ?? this.ctx.modelId ?? null,
      experimentId: input.experimentId ?? this.ctx.experimentId ?? null,
      seq,
    });
    return `${input.type}@${fnv1a(identity)}`;
  }

  /** Rejestruje zdarzenie. Rzuca, gdy kształt jest nieprawidłowy (uczciwa walidacja). */
  add<P extends Record<string, unknown>>(input: GenesisEventInput<P>): GenesisEvent<P> {
    const v = validateEvent(input as Partial<GenesisEvent>);
    if (!v.ok) throw new Error(`Invalid GenesisEvent: ${v.errors.join('; ')}`);
    if (!input.provenance || !input.provenance.origin) {
      throw new Error('GenesisEvent requires provenance.origin (model | experiment-action | consequence-rule) — no fake events');
    }
    if (input.parentEventId && !this.events.some((e) => e.id === input.parentEventId)) {
      throw new Error(`parentEventId "${input.parentEventId}" not found in registry`);
    }
    const seq = this.seq++;
    const event: GenesisEvent<P> = {
      ...input,
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: this.makeId(input as GenesisEventInput, seq),
      modelId: input.modelId ?? this.ctx.modelId,
      experimentId: input.experimentId ?? this.ctx.experimentId,
    };
    this.events.push(event);
    return event;
  }

  /** Wszystkie zdarzenia w kolejności czasowej (stabilnej). */
  all(): readonly GenesisEvent[] {
    return [...this.events].sort((a, b) => a.timestamp - b.timestamp || this.indexOf(a) - this.indexOf(b));
  }

  private indexOf(e: GenesisEvent): number { return this.events.indexOf(e); }

  byType(type: string): GenesisEvent[] { return this.events.filter((e) => e.type === type); }
  get(id: string): GenesisEvent | undefined { return this.events.find((e) => e.id === id); }
  children(parentId: string): GenesisEvent[] { return this.events.filter((e) => e.parentEventId === parentId); }
  provenanceOf(id: string): EventProvenance | null { return this.get(id)?.provenance ?? null; }
  count(): number { return this.events.length; }

  /** Kursor strumienia = liczba dotąd zarejestrowanych zdarzeń (monotoniczny). */
  cursor(): number { return this.events.length; }

  /**
   * Zdarzenia dodane OD podanego kursora (włącznie z indeksem `cursor`).
   * Zwraca porcję + nowy kursor — do konsumpcji per tick przez renderer.
   * Deterministyczne: kolejność rejestracji jest kolejnością zwracania.
   */
  since(cursor: number): { events: readonly GenesisEvent[]; cursor: number } {
    const from = Math.max(0, Math.min(cursor, this.events.length));
    return { events: this.events.slice(from), cursor: this.events.length };
  }

  /** Wszystkie zdarzenia danego eksperymentu (po experimentId), w kolejności czasowej. */
  experimentHistory(experimentId: string): GenesisEvent[] {
    return this.all().filter((e) => e.experimentId === experimentId);
  }

  reset(): void { this.events = []; this.seq = 0; }
}
