/**
 * Generator symulacji — punkt wejścia. Import tego modułu rejestruje startowy
 * katalog przepisów (jak `labs/index.ts` rejestruje laboratoria). Ekran
 * generatora importuje ten plik, więc resolver ma pełny katalog.
 */
import { registerCatalog } from './catalog';

let initialized = false;
export function ensureGeneratorReady(): void {
  if (initialized) return;
  initialized = true;
  registerCatalog();
}

export { resolveQuery, normalize, type ResolveResult, type ResolveMatch } from './resolve';
export {
  getRecipes, getRecipe, epistemicStatusOf, EPISTEMIC_LABELS,
  type SimulationRecipe, type EpistemicStatus,
} from './recipe';
