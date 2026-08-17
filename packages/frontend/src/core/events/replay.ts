import type { EventRegistry } from './eventRegistry';
import type { GenesisEvent } from './genesisEvent';

/**
 * REPLAY / PROVENANCE — narzędzia do prześledzenia i odtworzenia.
 *
 * Nie tworzy magazynu ani nie uruchamia modelu (żeby rdzeń zdarzeń pozostał
 * neutralny i nie zależał od konkretnego silnika). Dostarcza:
 *  - `provenanceChain`: pełną gałąź przyczynową event → parent → … (traceability),
 *  - `reconstructionKey`: klucz tożsamości do odtworzenia (experiment+seed+paramsHash).
 * Sam DOWÓD reprodukowalności (ten sam experiment+seed+params ⇒ ta sama
 * sekwencja zdarzeń) realizuje test integracyjny na PRAWDZIWYM modelu.
 */

/** Ancestry zdarzenia: [event, parent, grandparent, …] aż do korzenia. */
export function provenanceChain(registry: EventRegistry, eventId: string): GenesisEvent[] {
  const chain: GenesisEvent[] = [];
  let current = registry.get(eventId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parentEventId ? registry.get(current.parentEventId) : undefined;
  }
  return chain;
}

export interface ReconstructionKey {
  modelId?: string;
  experimentId?: string;
  seed?: number | string;
  paramsHash?: string;
}

/** Minimalny klucz odtworzenia — to, czego trzeba, by ponownie policzyć bieg. */
export function reconstructionKey(event: GenesisEvent): ReconstructionKey {
  return {
    modelId: event.modelId ?? event.provenance?.modelId,
    experimentId: event.experimentId ?? event.provenance?.experimentId,
    seed: event.provenance?.seed,
    paramsHash: event.provenance?.paramsHash,
  };
}
