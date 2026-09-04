import type { HonestyLevel, ParamDef, SimParams } from './types';

/**
 * Most KONTEKSTU aktualnej symulacji — rozszerzenie idei activeSimControls.ts
 * (pauza/reset) o pełny kontekst: metadane eksperymentu, definicje parametrów,
 * odczyt bieżących wartości i statystyk ORAZ zapis parametru. Dzięki temu
 * Science Chat (components/ScienceChat.tsx) może „rozmawiać" z otwartym
 * eksperymentem i sterować nim — bez nowego, równoległego systemu parametrów.
 *
 * Rejestruje go LabShell (useExperimentShell) przy montażu eksperymentu i
 * wyrejestrowuje przy odmontowaniu. Gdy nic nie jest otwarte, kontekst = null
 * (czat mówi to wprost, nie udaje).
 */
export interface SimContext {
  labId: string;
  experimentId: string;
  experimentName: string;
  honesty: HonestyLevel;
  honestyNote: string;
  paramDefs: ParamDef[];
  /** Bieżące wartości parametrów (przez ref — zawsze aktualne). */
  getParams: () => SimParams;
  /** Bieżące statystyki żywej symulacji (getStats sim). */
  getStats: () => Record<string, number>;
  /** Ustawia jeden parameter otwartego eksperymentu (ten sam setParams co kontrolki). */
  setParam: (key: string, value: number | boolean | string) => void;
}

let active: SimContext | null = null;
const listeners = new Set<(ctx: SimContext | null) => void>();

export function registerSimContext(ctx: SimContext): () => void {
  active = ctx;
  listeners.forEach((fn) => fn(active));
  return () => {
    if (active === ctx) {
      active = null;
      listeners.forEach((fn) => fn(active));
    }
  };
}

export function getSimContext(): SimContext | null {
  return active;
}

export function subscribeSimContext(fn: (ctx: SimContext | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
