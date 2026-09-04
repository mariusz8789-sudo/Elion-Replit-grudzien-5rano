import type { ModelGraph } from '../modelGraph/graph';
import type { EffectiveProvenance, Provenance } from './provenance';

/**
 * Analiza wrażliwości (Faza 0, pkt 4) — PRAWDZIWa różnica skończona na
 * wykonywalnym grafie, nie ozdobny tekst. Dla wyjścia O i parametru p
 * liczymy elastyczność E = (ΔO/O)/(Δp/p) przez faktyczne zaburzenie p o
 * mały ułamek i ponowne przeliczenie grafu. |E| rankinguje, który parametr
 * NAJMOCNIEJ steruje wynikiem. To odpowiada wprost na pytanie ze specyfikacji:
 * „jaki nieznany / słabo wsparty parametr najsilniej kontroluje ten wynik?".
 *
 * Elastyczność jest bezwymiarowa (procent na procent), więc porównywalna
 * między parametrami o różnych jednostkach — dlatego wybieramy ją zamiast
 * surowej pochodnej ∂O/∂p.
 */

export interface SensitivityEntry {
  parameterId: string;
  /** Elastyczność (ΔO/O)/(Δp/p) w otoczeniu bieżącego punktu. */
  elasticity: number;
  /** |elasticity| — do rankingu. */
  magnitude: number;
}

const REL_STEP = 1e-3; // 0,1% zaburzenie — dość małe na lokalną pochodną, dość duże na szum zmiennoprzecinkowy

/**
 * Ranking wrażliwości wyjścia `outputId` względem podanych parametrów.
 * Przywraca graf do stanu wyjściowego po każdym zaburzeniu (bez efektów
 * ubocznych na współdzielonym grafie). Zwraca listę posortowaną malejąco
 * po |elasticity|.
 */
export function sensitivityRanking(graph: ModelGraph, outputId: string, parameterIds: string[]): SensitivityEntry[] {
  const baseOutput = graph.getValue(outputId);
  const entries: SensitivityEntry[] = [];

  for (const pid of parameterIds) {
    const base = graph.getValue(pid);
    // Zaburzenie względne; dla parametru == 0 używamy małego bezwzględnego kroku.
    const dp = base !== 0 ? base * REL_STEP : REL_STEP;

    graph.setParameter(pid, base + dp);
    const up = graph.getValue(outputId);
    graph.setParameter(pid, base - dp);
    const down = graph.getValue(outputId);
    graph.setParameter(pid, base); // przywróć

    const dOutput = (up - down) / 2; // różnica centralna — dokładniejsza niż jednostronna
    let elasticity: number;
    if (baseOutput === 0 || base === 0) {
      // brak sensownej elastyczności względnej — zwróć znormalizowaną pochodną bezwzględną
      elasticity = dOutput / dp;
    } else {
      elasticity = (dOutput / baseOutput) / (dp / base);
    }
    if (!Number.isFinite(elasticity)) elasticity = 0;
    entries.push({ parameterId: pid, elasticity, magnitude: Math.abs(elasticity) });
  }

  entries.sort((a, b) => b.magnitude - a.magnitude);
  return entries;
}

export interface MeasurementRecommendation {
  parameterId: string;
  provenance: Provenance;
  elasticity: number;
  outputId: string;
  message: string;
}

const WEAK_PROVENANCE: Provenance[] = ['engineering-estimate', 'requires-validation'];
const SENSITIVITY_THRESHOLD = 0.25; // |elastyczność| powyżej której słabo wsparty parametr uznajemy za krytyczny

/**
 * Generuje rekomendacje pomiarowe (Faza 0, pkt 5) — WYŁĄCZNIE ze stanu grafu,
 * prowieniencji i wrażliwości, nie z generowanego tekstu. Rekomendacja
 * powstaje, gdy parametr JEDNOCZEŚNIE: (a) ma słabą prowieniencję
 * (oszacowanie inżynierskie lub wymaga walidacji) ORAZ (b) ma |elastyczność|
 * na wybrane wyjście powyżej progu. Czyli: „to, co jest niepewne I zarazem
 * mocno steruje wynikiem — zmierz najpierw".
 */
export function measurementRecommendations(
  graph: ModelGraph,
  outputId: string,
  parameterIds: string[],
  provenance: Map<string, EffectiveProvenance>,
  outputLabel: string,
  labelOf: (id: string) => string,
): MeasurementRecommendation[] {
  const ranking = sensitivityRanking(graph, outputId, parameterIds);
  const recs: MeasurementRecommendation[] = [];
  for (const entry of ranking) {
    const eff = provenance.get(entry.parameterId);
    if (!eff) continue;
    if (!WEAK_PROVENANCE.includes(eff.provenance)) continue;
    if (entry.magnitude < SENSITIVITY_THRESHOLD) continue;
    recs.push({
      parameterId: entry.parameterId,
      provenance: eff.provenance,
      elasticity: entry.elasticity,
      outputId,
      message:
        `Wynik „${outputLabel}" jest silnie zależny od „${labelOf(entry.parameterId)}" ` +
        `(elastyczność ${entry.elasticity.toFixed(2)}), a ten parametr ma status „${eff.provenance === 'requires-validation' ? 'wymaga walidacji fizycznej' : 'oszacowanie inżynierskie'}". ` +
        `Zmierz „${labelOf(entry.parameterId)}", zanim oprzesz decyzję na tym wyniku.`,
    });
  }
  return recs;
}
