import { sensitivityRanking } from '../engineeringGraph/sensitivity';
import type { DomainAdapter } from './passport';

/**
 * Rynek Pomiarów (Founder Directive, Milestone 3). Pytanie: KTÓRY pomiar
 * najbardziej zmieniłby werdykt akceptacji kandydata? Odpowiadamy przez
 * WRAŻLIWOŚĆ (ta sama, przetestowana `sensitivityRanking` co w silniku
 * inżynierskim): dla każdego parametru liczymy, jak mocno steruje on
 * wielkościami, na których opierają się kryteria akceptacji. Parametr o
 * największym wpływie to ten, którego precyzja pomiaru najbardziej „kupuje"
 * pewność werdyktu — stąd metafora rynku.
 *
 * To NIE jest wyrocznia: to ranking lokalnej wrażliwości wokół konkretnego
 * kandydata, liczony deterministycznie z wykonywalnego grafu. Zero zgadywania.
 */

export interface MeasurementListing {
  parameterId: string;
  /** Suma |elastyczności| parametru po wszystkich wielkościach kryterialnych. */
  influence: number;
  /** Udział w całkowitym wpływie (0–1) — „cena rynkowa" tego pomiaru. */
  share: number;
  /** Na które wielkości kryterialne ten parametr wpływa najmocniej. */
  drivesOutputs: string[];
}

/**
 * Ranking pomiarów dla danego kandydata. Buduje świeży graf, ustawia parametry
 * kandydata i sumuje |elastyczność| każdego parametru po wszystkich wyjściach,
 * których dotyczą kryteria akceptacji. Zwraca listę malejąco po wpływie.
 */
export function measurementMarket(adapter: DomainAdapter, params: Record<string, number>): MeasurementListing[] {
  const graph = adapter.buildGraph();
  graph.applyParameterSnapshot(params);

  const parameterIds = adapter.params.map((p) => p.id);
  const criterionOutputs = [...new Set(adapter.criteria.map((c) => c.outputId))];
  if (criterionOutputs.length === 0 || parameterIds.length === 0) return [];

  // influence[param] = Σ_output |elastyczność(output, param)|
  const influence = new Map<string, number>();
  const drives = new Map<string, { outputId: string; mag: number }[]>();
  for (const pid of parameterIds) {
    influence.set(pid, 0);
    drives.set(pid, []);
  }

  for (const outputId of criterionOutputs) {
    const ranking = sensitivityRanking(graph, outputId, parameterIds);
    for (const entry of ranking) {
      influence.set(entry.parameterId, (influence.get(entry.parameterId) ?? 0) + entry.magnitude);
      drives.get(entry.parameterId)?.push({ outputId, mag: entry.magnitude });
    }
  }

  const total = [...influence.values()].reduce((a, b) => a + b, 0) || 1;
  const listings: MeasurementListing[] = parameterIds.map((pid) => {
    const infl = influence.get(pid) ?? 0;
    const topOutputs = (drives.get(pid) ?? [])
      .sort((a, b) => b.mag - a.mag)
      .slice(0, 2)
      .map((d) => d.outputId);
    return { parameterId: pid, influence: infl, share: infl / total, drivesOutputs: topOutputs };
  });

  listings.sort((a, b) => b.influence - a.influence);
  return listings;
}
