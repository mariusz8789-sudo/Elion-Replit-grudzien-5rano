import type { SimParams } from '../types';
import type { SavedExperiment } from '../scienceMemory';
import type { EventProvenance } from './genesisEvent';
import { fnv1a, canonicalJson } from './hash';

/**
 * PROVENANCE (adapter, NIE nowy magazyn) — buduje `EventProvenance` wskazujące
 * na ISTNIEJĄCE źródła: model (live) albo zapisany eksperyment (scienceMemory).
 * Dzięki temu na pytanie „SKĄD WZIĄŁ SIĘ TEN EVENT?" można odpowiedzieć:
 * MODEL → PARAMETRY (paramsHash) → EXPERIMENT (experimentContentHash) → EVENT.
 *
 * Nie zapisuje niczego trwale — to czysta transformacja read-only.
 */

/** Deterministyczny skrót parametrów (ten sam algorytm co scienceMemory). */
export function paramsHash(params: SimParams): string {
  return fnv1a(canonicalJson(params));
}

/** Provenance dla zdarzenia pochodzącego z żywego modelu. */
export function provenanceFromModel(input: {
  modelId: string;
  experimentId?: string;
  seed?: number | string;
  params?: SimParams;
}): EventProvenance {
  return {
    origin: 'model',
    modelId: input.modelId,
    experimentId: input.experimentId,
    seed: input.seed,
    paramsHash: input.params ? paramsHash(input.params) : undefined,
  };
}

/** Provenance powiązane z zapisanym eksperymentem (scienceMemory.SavedExperiment). */
export function provenanceFromSavedExperiment(saved: SavedExperiment, seed?: number | string): EventProvenance {
  return {
    origin: 'experiment-action',
    modelId: saved.labId,
    experimentId: saved.experimentId,
    seed,
    paramsHash: paramsHash(saved.params),
    experimentContentHash: saved.contentHash,
  };
}
