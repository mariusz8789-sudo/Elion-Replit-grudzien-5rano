import type { LabDefinition } from './types';

/**
 * Rejestr pluginów Genesis OS.
 *
 * Każde laboratorium jest niezależnym modułem (pluginem) zgodnym z
 * kontraktem LabDefinition. Aplikacja nie zna żadnego laboratorium z nazwy —
 * renderuje wyłącznie to, co zostało zarejestrowane. Dodanie nowego
 * laboratorium = nowy plik w src/labs/ + jeden wpis registerLab() w
 * src/labs/index.ts. Zero zmian w rdzeniu aplikacji.
 *
 * Granica przenośności (Unity / Unreal / natywnie):
 *  - logika fizyki (update, getStats, parametry) jest czystym TypeScriptem
 *    bez zależności od DOM/Reacta — przenosi się bez przepisywania;
 *  - render() jest cienkim adapterem na Canvas 2D (platforma Etapu 0);
 *    port na inny silnik wymaga wymiany wyłącznie tej warstwy;
 *  - UI (React) zna tylko kontrakty z core/types.ts.
 */

const labs: LabDefinition[] = [];
const byId = new Map<string, LabDefinition>();

export function registerLab(lab: LabDefinition) {
  if (byId.has(lab.id)) throw new Error(`Laboratorium "${lab.id}" jest już zarejestrowane`);
  byId.set(lab.id, lab);
  labs.push(lab);
}

export function getLabs(): readonly LabDefinition[] {
  return labs;
}

export function getLab(id: string): LabDefinition | undefined {
  return byId.get(id);
}
