import type { GenesisEvent, GenesisEventInput } from './genesisEvent';
import type { EventRegistry } from './eventRegistry';

/**
 * CONSEQUENCE ENGINE — TYLKO FUNDAMENT ARCHITEKTONICZNY.
 *
 * Łańcuch: Event → Rule → Secondary Event → (Model) → Result.
 * Ta warstwa odpowiada wyłącznie za PRZYCZYNOWOŚĆ zdarzeń (kto z czego wynika),
 * a nie za obliczenia domenowe — te delegujemy do ISTNIEJĄCEGO core/modelGraph
 * (nie tworzymy drugiego grafu). Reguła może w `derive` policzyć skutek przez
 * model/graf i wystawić zdarzenie potomne z `parentEventId` = zdarzenie źródłowe.
 *
 * NIE implementujemy tu żadnej domeny (flood/fire/earthquake/blackout/asteroid).
 * To dowód, że jedno prawdziwe zdarzenie może rozgałęzić się przez neutralne
 * reguły z zachowaniem provenance i łańcucha rodzic-dziecko.
 */

export interface ConsequenceRule {
  id: string;
  description: string;
  /** Czy reguła dotyczy danego zdarzenia (np. po type). */
  appliesTo(event: GenesisEvent): boolean;
  /**
   * Wyprowadza zdarzenia potomne. NIE ustawia `parentEventId`/provenance.origin
   * — robi to `applyConsequences` (spójnie i deterministycznie). Może zwrócić [].
   */
  derive(event: GenesisEvent): GenesisEventInput[];
}

/**
 * Stosuje reguły do zdarzenia, rejestrując zdarzenia potomne z poprawnym
 * `parentEventId` i provenance.origin = 'consequence-rule'. Deterministyczne:
 * kolejność reguł + kolejność `derive` decyduje o kolejności rejestracji.
 */
export function applyConsequences(
  registry: EventRegistry, event: GenesisEvent, rules: readonly ConsequenceRule[],
): GenesisEvent[] {
  const out: GenesisEvent[] = [];
  for (const rule of rules) {
    if (!rule.appliesTo(event)) continue;
    for (const derived of rule.derive(event)) {
      out.push(registry.add({
        ...derived,
        parentEventId: event.id,
        provenance: {
          ...(derived.provenance ?? { origin: 'consequence-rule' }),
          origin: 'consequence-rule',
          ruleId: rule.id,
          modelId: derived.provenance?.modelId ?? event.modelId,
          experimentId: derived.provenance?.experimentId ?? event.experimentId,
        },
      }));
    }
  }
  return out;
}
