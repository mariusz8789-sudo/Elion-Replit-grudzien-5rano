import type { TransmissionEvent } from '../simulation/types';
import type { GenesisEvent, GenesisEventInput, EventProvenance } from './genesisEvent';
import type { EventRegistry } from './eventRegistry';
import { provenanceFromModel } from './provenance';
import type { SimParams } from '../types';

/**
 * TRANSMISSION ADAPTER — most między ISTNIEJĄCYM `TransmissionEvent`
 * (core/simulation/types.ts, produkowanym przez EpidemicCitySimulation) a
 * neutralnym `GenesisEvent` typu `infection.transmission`.
 *
 * NIE zmienia mechanizmu transmisji ani modelu. Czyta tylko to, co model już
 * wystawia przez `sim.lastTransmissions()`.
 *
 * CZEGO BRAKUJE W MODELU (zgłoszone, NIE naprawiane przez edycję modelu):
 *  - `TransmissionEvent` niesie tylko { from, to, x, y }. NIE zawiera czasu
 *    symulacji, modelId ani experimentId. Adapter WSTRZYKUJE je z `ctx`
 *    dostarczanego przez wywołującego (który zna kontekst symulacji), zamiast
 *    przebudowywać model. Czas najlepiej podać z zegara wywołującego; przy
 *    granularności dziennej można użyć `sim.stats().dzien`.
 *  Rekomendacja migracji (do uzgodnienia, NIE wykonana): model mógłby wystawić
 *  publiczny `time` lub stemplować `TransmissionEvent.t`. Do tego czasu czas
 *  pochodzi z `ctx.simTime`.
 */

export interface TransmissionContext {
  /** Czas symulacji zdarzenia (jednostka modelu, np. dzień). */
  simTime: number;
  modelId: string;
  experimentId?: string;
  seed?: number | string;
  /** Migawka parametrów (do paramsHash w provenance). Opcjonalna. */
  params?: SimParams;
  /** Nadpisanie provenance (np. z zapisanego eksperymentu). */
  provenance?: EventProvenance;
}

export interface TransmissionParams extends Record<string, unknown> {
  fromAgent: number;
  toAgent: number;
}

/** Pojedyncza transmisja → wejście GenesisEvent (bez ID; ID nada rejestr). */
export function adaptTransmission(ev: TransmissionEvent, ctx: TransmissionContext): GenesisEventInput<TransmissionParams> {
  return {
    type: 'infection.transmission',
    timestamp: ctx.simTime,
    location: { x: ev.x, y: ev.y },
    source: { kind: 'agent', id: ev.from },
    cause: 'proximity-contact',
    affectedEntities: [{ kind: 'agent', id: ev.to }],
    severity: undefined,
    parameters: { fromAgent: ev.from, toAgent: ev.to },
    parentEventId: null,
    modelId: ctx.modelId,
    experimentId: ctx.experimentId,
    provenance: ctx.provenance ?? provenanceFromModel({
      modelId: ctx.modelId, experimentId: ctx.experimentId, seed: ctx.seed, params: ctx.params,
    }),
  };
}

/**
 * Wchłania partię transmisji (np. `sim.lastTransmissions()` z jednego ticku) do
 * rejestru, zachowując kolejność. Wywołujący (integracja / Manus) podaje `ctx`
 * — rdzeń nie sięga do modelu. Zwraca zarejestrowane zdarzenia.
 */
export function ingestTransmissions(
  registry: EventRegistry, events: readonly TransmissionEvent[], ctx: TransmissionContext,
): GenesisEvent<TransmissionParams>[] {
  return events.map((ev) => registry.add(adaptTransmission(ev, ctx)));
}
