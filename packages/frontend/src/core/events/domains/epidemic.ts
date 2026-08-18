import type { GenesisRule } from '../consequence';
import type { GenesisEventInput } from '../genesisEvent';

/**
 * DOMENA: EPIDEMIA — typy zdarzeń + JEDNA prawdziwa reguła konsekwencji.
 *
 * NIE wymyśla nauki. Reguła `transmissionCausesExposure` jest WIERNYM
 * przełożeniem tego, co model JUŻ robi: `EpidemicCitySimulation` przy transmisji
 * ustawia stan celu na 'E' (Exposed). Reguła wystawia to jako zdarzenie
 * `infection.exposure` z `parentEventId` = zdarzenie transmisji — czyli
 * przyczynowość na poziomie EVENT, w pełni śledzalna przez provenance.
 * To NIE jest nowa dynamika ani drugi model — to restatement istniejącego
 * przejścia S→E w języku zdarzeń.
 */

export const EVENT_INFECTION_TRANSMISSION = 'infection.transmission';
export const EVENT_INFECTION_EXPOSURE = 'infection.exposure';

export interface ExposureParams extends Record<string, unknown> {
  agent: number;       // kto został narażony (cel transmisji)
  exposedBy: number;   // źródło (agent zakażający)
}

/**
 * infection.transmission → infection.exposure (cel wchodzi w stan Exposed).
 * Wierne odwzorowanie efektu modelu (S→E), nie nowa nauka.
 */
export const transmissionCausesExposure: GenesisRule = {
  id: 'epidemic.transmission-causes-exposure',
  description: 'Transmission puts the target agent into Exposed (E) — restates the model’s own S→E transition at the event layer.',
  trigger: { type: EVENT_INFECTION_TRANSMISSION },
  emit(event): GenesisEventInput<ExposureParams>[] {
    const target = event.affectedEntities[0];
    const source = event.source;
    if (!target) return [];
    const toAgent = Number(target.id);
    const fromAgent = source ? Number(source.id) : -1;
    return [{
      type: EVENT_INFECTION_EXPOSURE,
      timestamp: event.timestamp,
      location: event.location,
      source: event.source,
      cause: 'infection.transmission',
      affectedEntities: [target],
      parameters: { agent: toAgent, exposedBy: fromAgent },
      // parentEventId + provenance.origin ustawia silnik konsekwencji.
    }];
  },
};
