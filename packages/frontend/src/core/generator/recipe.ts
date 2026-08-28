import type { SimParams, HonestyLevel } from '../types';

/**
 * Status epistemiczny (Universal Scientific Experiment Engine) — ODRĘBNY od
 * `honesty` (która mówi „jak dokładny jest model matematycznie"). Ten wymiar
 * mówi „jak bardzo świat naukowy to popiera". Fundamentalne dla wizji: Genesis
 * może symulować nawet kontrowersyjny model, ale MUSI jawnie powiedzieć, że
 * symuluje ZAŁOŻENIA modelu, nie prawdę o rzeczywistości.
 */
export interface SimulationRecipeSource {
  /** Źródło może być wewnętrzną implementacją albo zewnętrzną referencją. */
  kind: 'INTERNAL_MODEL' | 'EXTERNAL_REFERENCE';
  label: string;
  locator: string;
  note?: string;
}

export type EpistemicStatus =
  | 'ESTABLISHED_SCIENCE'
  | 'WELL_SUPPORTED_MODEL'
  | 'THEORETICAL_MODEL'
  | 'HYPOTHESIS'
  | 'THOUGHT_EXPERIMENT'
  | 'SPECULATIVE_MODEL'
  | 'UNSUPPORTED_CLAIM';

export const EPISTEMIC_LABELS: Record<EpistemicStatus, string> = {
  ESTABLISHED_SCIENCE: 'Nauka ustalona',
  WELL_SUPPORTED_MODEL: 'Model dobrze potwierdzony',
  THEORETICAL_MODEL: 'Model teoretyczny',
  HYPOTHESIS: 'Hipoteza',
  THOUGHT_EXPERIMENT: 'Eksperyment myślowy',
  SPECULATIVE_MODEL: 'Model spekulatywny',
  UNSUPPORTED_CLAIM: 'Twierdzenie bez poparcia',
};

/**
 * Generator symulacji (NL → Model → Silnik). Przepis (recipe) wiąże frazę w
 * języku naturalnym z ISTNIEJĄCYM eksperymentem Genesis (przez labId +
 * experimentId) i presetem parametrów. To NIE jest nowy silnik fizyki —
 * uruchomienie deleguje do istniejącego `LabShell`/`Sim` przez
 * `core/scenarioBridge.ts`. Przepisy rejestruje się jak laboratoria
 * (`registerRecipe`, analogicznie do `registerLab`), więc kolejne typy
 * symulacji dodaje się jako pluginy bez zmian w rdzeniu.
 */
export interface SimulationRecipe {
  /** Stabilny identyfikator przepisu (np. 'orbit-star-mass'). */
  id: string;
  /** Ludzka nazwa zjawiska pokazywana w UI. */
  title: string;
  /** Kategoria dla grupowania w bibliotece demo. */
  category: 'physics' | 'cosmology' | 'math' | 'chemistry' | 'quantum' | 'alternative';
  /**
   * Frazy wyzwalające w języku naturalnym (małe litery, bez diakrytyków po
   * normalizacji resolvera). Polskie + kilka angielskich synonimów. Dopasowanie
   * jest po słowach/frazach — patrz resolve.ts.
   */
  aliases: string[];
  /** Istniejące laboratorium, do którego generator nawiguje. */
  labId: string;
  /**
   * Id konkretnego ExperimentDef w tym labie. Jeśli pominięte lub niedopasowane,
   * LabShell łagodnie wraca do eksperymentu bazowego (ten sam temat, realny
   * silnik) — patrz LabShell.tsx.
   */
  experimentId?: string;
  /** Preset parametrów nakładany przez scenarioBridge (SimParams istniejącego eksperymentu). */
  params?: Partial<SimParams>;
  /** Etykieta uczciwości (dokładność matematyczna) — musi odzwierciedlać docelowy eksperyment. */
  honesty: HonestyLevel;
  /**
   * Status epistemiczny (poparcie naukowe). Opcjonalny — gdy pominięty,
   * wyprowadzany z `honesty` przez `epistemicStatusOf()`. Jawnie ustawiany dla
   * modeli spornych/alternatywnych (płaska Ziemia → UNSUPPORTED_CLAIM) i
   * eksperymentów myślowych (paradoks dziadka → THOUGHT_EXPERIMENT).
   */
  epistemicStatus?: EpistemicStatus;
  /** Jedno zdanie: co pokazuje symulacja. */
  summary: string;
  /** Kluczowe równania do wyświetlenia (tekst, nie LaTeX — spójnie z resztą UI). */
  equations?: string[];
  /** Co model upraszcza / zakłada. */
  assumptions?: string[];
  /** Jawne źródła recepty; brak oznacza tylko internal registry provenance. */
  sources?: readonly SimulationRecipeSource[];
}

const recipes: SimulationRecipe[] = [];
const byId = new Map<string, SimulationRecipe>();

export function registerRecipe(r: SimulationRecipe): void {
  if (byId.has(r.id)) throw new Error(`Przepis symulacji "${r.id}" jest już zarejestrowany`);
  byId.set(r.id, r);
  recipes.push(r);
}

export function getRecipes(): readonly SimulationRecipe[] {
  return recipes;
}

export function getRecipe(id: string): SimulationRecipe | undefined {
  return byId.get(id);
}

/**
 * Status epistemiczny przepisu — jawny, a jeśli brak, wyprowadzony z `honesty`.
 * Mapowanie jest zachowawcze: `exact` → nauka ustalona; `simplified`/
 * `educational` → model dobrze potwierdzony (upraszcza, ale opiera się na
 * ustalonej fizyce); `theoretical` → model teoretyczny; `cinematic` → model
 * spekulatywny. Modele sporne MUSZĄ ustawić `epistemicStatus` jawnie.
 */
export function epistemicStatusOf(recipe: SimulationRecipe): EpistemicStatus {
  if (recipe.epistemicStatus) return recipe.epistemicStatus;
  switch (recipe.honesty) {
    case 'exact': return 'ESTABLISHED_SCIENCE';
    case 'simplified': return 'WELL_SUPPORTED_MODEL';
    case 'educational': return 'WELL_SUPPORTED_MODEL';
    case 'theoretical': return 'THEORETICAL_MODEL';
    case 'cinematic': return 'SPECULATIVE_MODEL';
    default: return 'THEORETICAL_MODEL';
  }
}

/** Wyłącznie testy — czyści rejestr między przypadkami. */
export function _resetRecipes(): void {
  recipes.length = 0;
  byId.clear();
}
