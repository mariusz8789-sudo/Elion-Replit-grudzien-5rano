import type { GenesisEvent, GenesisEventInput } from './genesisEvent';
import type { EventRegistry } from './eventRegistry';

/**
 * CONSEQUENCE ENGINE — neutralna warstwa PRZYCZYNOWOŚCI zdarzeń.
 *
 * Łańcuch: Event → Rule → Secondary Event → (Model) → Result.
 * Ta warstwa NIE liczy fizyki domenowej — obliczenia deleguje do istniejącego
 * core/modelGraph (nie tworzymy drugiego grafu). Reguła jedynie DECYDUJE, jakie
 * zdarzenie potomne powstaje z jakiego zdarzenia źródłowego i z jakim
 * ładunkiem/entities/provenance.
 */

/** Kontekst przekazywany regule (opcjonalny; domena może dołożyć swoje pola). */
export interface RuleContext {
  [key: string]: unknown;
}

/**
 * GenesisRule — deklaratywna reguła konsekwencji. Neutralna domenowo.
 *  - `trigger.type`: typ zdarzenia wyzwalającego (kropkowany),
 *  - `when`: dodatkowe warunki (opcjonalne),
 *  - `emit`: wyprowadza zdarzenia potomne (bez ustawiania parentEventId/origin —
 *    robi to silnik, spójnie).
 */
export interface GenesisRule {
  id: string;
  description: string;
  trigger: { type: string };
  when?(event: GenesisEvent, ctx: RuleContext): boolean;
  emit(event: GenesisEvent, ctx: RuleContext): GenesisEventInput[];
}

/** Zgodność wsteczna z pierwotnym interfejsem (Etap F). */
export type ConsequenceRule = GenesisRule;

function ruleApplies(rule: GenesisRule, event: GenesisEvent, ctx: RuleContext): boolean {
  if (rule.trigger.type !== event.type) return false;
  return rule.when ? rule.when(event, ctx) : true;
}

/**
 * Uruchamia reguły dla POJEDYNCZEGO zdarzenia, rejestrując potomne z poprawnym
 * `parentEventId` i provenance.origin='consequence-rule'. Deterministyczne:
 * kolejność reguł × kolejność `emit` = kolejność rejestracji.
 */
export function runRules(
  registry: EventRegistry, event: GenesisEvent, rules: readonly GenesisRule[], ctx: RuleContext = {},
): GenesisEvent[] {
  const out: GenesisEvent[] = [];
  for (const rule of rules) {
    if (!ruleApplies(rule, event, ctx)) continue;
    for (const derived of rule.emit(event, ctx)) {
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

/** Zgodność wsteczna — nazwa z Etapu F (single-event). */
export const applyConsequences = runRules;

/**
 * Uruchamia reguły dla WSZYSTKICH zdarzeń w rejestrze (jednoprzebiegowo, po
 * migawce bieżących zdarzeń — nie kaskaduje w nieskończoność w jednym wywołaniu).
 */
export function runRulesOverRegistry(
  registry: EventRegistry, rules: readonly GenesisRule[], ctx: RuleContext = {},
): GenesisEvent[] {
  const snapshot = [...registry.all()];
  const out: GenesisEvent[] = [];
  for (const e of snapshot) out.push(...runRules(registry, e, rules, ctx));
  return out;
}
