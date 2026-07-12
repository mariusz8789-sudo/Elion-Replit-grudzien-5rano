import { ModelGraph, type PropagationStep } from '../modelGraph/graph';
import type { EngineeringValueKind } from './valueModel';
import {
  propagateProvenance,
  type EffectiveProvenance,
  type Provenance,
  type ProvenanceConfig,
} from './provenance';
import {
  measurementRecommendations,
  sensitivityRanking,
  type MeasurementRecommendation,
  type SensitivityEntry,
} from './sensitivity';

/**
 * EngineeringModel — warstwa inżynierska nad rdzennym, wykonywalnym
 * ModelGraph (core/modelGraph). NIE zastępuje grafu ani go nie kopiuje:
 * owija JEDNĄ instancję grafu i dokłada semantykę inżynierską (prowieniencja,
 * rodzaj wartości, wrażliwość, rekomendacje pomiarowe), której warstwa
 * naukowa nie potrzebowała. Fizyka i propagacja pozostają dokładnie te same
 * — dzięki temu 3 istniejące grafy fizyczne i cały Reality System działają
 * bez zmian, a to jest czysto addytywna nadbudowa.
 */
export interface EngineeringModelConfig {
  provenance: ProvenanceConfig;
  /** Rodzaj wartości węzła (scalar/range/...). Domyślnie 'scalar'. Klucz = id węzła. */
  valueKind?: Record<string, EngineeringValueKind>;
}

export class EngineeringModel {
  readonly graph: ModelGraph;
  private config: EngineeringModelConfig;
  private effProvenance: Map<string, EffectiveProvenance>;

  constructor(graph: ModelGraph, config: EngineeringModelConfig) {
    this.graph = graph;
    this.config = config;
    this.effProvenance = propagateProvenance(graph, config.provenance);
  }

  /** Id węzłów-parametrów (korzeni) — te, które użytkownik może ustawiać. */
  parameterIds(): string[] {
    return this.graph.getParameterNodeIds();
  }

  getValue(id: string): number {
    return this.graph.getValue(id);
  }

  setParameter(id: string, value: number): PropagationStep[] {
    return this.graph.setParameter(id, value);
  }

  applyParameterSnapshot(values: Record<string, number>): PropagationStep[] {
    return this.graph.applyParameterSnapshot(values);
  }

  getParameterSnapshot(): Record<string, number> {
    return this.graph.getParameterSnapshot();
  }

  valueKind(id: string): EngineeringValueKind {
    return this.config.valueKind?.[id] ?? 'scalar';
  }

  /** Efektywna prowieniencja węzła po propagacji przez zależności. */
  effectiveProvenance(id: string): EffectiveProvenance {
    const e = this.effProvenance.get(id);
    if (!e) throw new Error(`Brak prowieniencji dla węzła „${id}"`);
    return e;
  }

  /** Prowieniencja przypisana wprost węzłowi-parametrowi (nie efektywna). */
  parameterProvenance(id: string): Provenance {
    return this.config.provenance.parameterProvenance[id] ?? 'user-provided';
  }

  /** Prowieniencja modelu węzła pochodnego (typ jego wzoru). */
  modelProvenance(id: string): Provenance {
    return this.config.provenance.modelProvenance[id] ?? 'calculated';
  }

  /** Ranking wrażliwości wyjścia względem wszystkich parametrów. */
  sensitivityRanking(outputId: string): SensitivityEntry[] {
    return sensitivityRanking(this.graph, outputId, this.parameterIds());
  }

  /** Rekomendacje pomiarowe dla wyjścia — z prowieniencji + wrażliwości, nie z tekstu. */
  measurementRecommendations(outputId: string): MeasurementRecommendation[] {
    return measurementRecommendations(
      this.graph,
      outputId,
      this.parameterIds(),
      this.effProvenance,
      this.graph.getNode(outputId)?.label ?? outputId,
      (id) => this.graph.getNode(id)?.label ?? id,
    );
  }
}
