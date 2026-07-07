import type { LabDefinition, NarrationBlock, SimParams } from '../core/types';

/**
 * Warstwa Narratora AI — serce AI Discovery.
 *
 * Architektura providerów:
 *  - LocalNarrator (Etap 0, aktywny): deterministyczny silnik narracji.
 *    Każde laboratorium dostarcza funkcję narrate(params, stats), która
 *    liczy realne wielkości fizyczne z żywych parametrów symulacji i układa
 *    z nich tekst. To nie jest LLM — i celowo: działa offline, natychmiast,
 *    bez kosztów i bez halucynacji.
 *  - LLMNarrator (Etap 1, interfejs gotowy): ten sam kontrakt, ale bloki
 *    przechodzą przez model językowy (backend proxy z kluczem API), który
 *    rozwija narrację, odpowiada na pytania otwarte i proponuje eksperymenty.
 *
 * Komponenty UI znają wyłącznie funkcję narrate() — podmiana providera
 * nie dotyka żadnego laboratorium.
 */

export interface NarratorProvider {
  readonly id: string;
  narrate(lab: LabDefinition, params: SimParams, stats: Record<string, number>): NarrationBlock[];
}

const localNarrator: NarratorProvider = {
  id: 'local-v0',
  narrate(lab, params, stats) {
    return lab.narrate(params, stats);
  },
};

/**
 * Miejsce podpięcia LLM w Etapie 1: provider wywołujący POST /api/narrate
 * (backend trzyma klucz API; frontend nigdy go nie widzi). Do tego czasu
 * aktywny jest provider lokalny.
 */
let activeProvider: NarratorProvider = localNarrator;

export function setNarratorProvider(p: NarratorProvider) {
  activeProvider = p;
}

export function narrate(
  lab: LabDefinition,
  params: SimParams,
  stats: Record<string, number>,
): NarrationBlock[] {
  return activeProvider.narrate(lab, params, stats);
}
