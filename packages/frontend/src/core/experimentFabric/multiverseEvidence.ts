import { buildSavedScenarioCounterfactual } from '../simulation/scenarioCounterfactual';
import { multiverseBranchAsCounterfactual, type TemporalMultiverse } from '../simulation/temporalMultiverse';
import { buildCounterfactualEvidencePack, COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION, type CounterfactualEvidenceResult } from './counterfactualEvidence';

/**
 * MULTIVERSE → EVIDENCE PACK, PRZEZ ISTNIEJĄCY MOST KONTRFAKTYCZNY.
 *
 * Multiverse ma nośnik prerejestracji (`preparedness` na specu, dodany w
 * `e016fe7`), ale wciąż nie miał drogi do Evidence Pack, bo Evidence Pack
 * rozumie wyłącznie dwuramienny `SavedScenarioCounterfactual`
 * (`counterfactualEvidence.ts`). Ta funkcja NIE jest drugim systemem
 * dowodowym: projektuje wybraną gałąź względem wspólnego baseline jako
 * dokładnie taki kontrfaktyk (`multiverseBranchAsCounterfactual`), zapisuje
 * go ISTNIEJĄCYM `buildSavedScenarioCounterfactual` i przekazuje
 * ISTNIEJĄCEMU `buildCounterfactualEvidencePack`. Te same cztery bramki
 * fail-closed obowiązują bez żadnej zmiany: oba ramiona muszą się odtworzyć,
 * różnica musi być jednoparametrowa, kryterium musi pochodzić z rządzonego
 * pytania, a realne runy muszą zgadzać się z zapisem.
 *
 * Multiverse z N gałęziami daje N NIEZALEŻNYCH paczek dowodowych — po jednej
 * na porównanie gałąź-kontra-baseline — nie jedną paczkę "za cały
 * multiverse": Evidence Pack rozstrzyga dokładnie jedną sprawdzalną różnicę
 * naraz, tak samo jak dla zwykłego kontrfaktyku.
 */
export function buildMultiverseBranchEvidencePack(multiverse: TemporalMultiverse, branchId: string): CounterfactualEvidenceResult {
  const counterfactual = multiverseBranchAsCounterfactual(multiverse, branchId);
  if (counterfactual === null) {
    return {
      contractVersion: COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION,
      status: 'BLOCKED_NOT_COMPARABLE',
      reason: `Gałąź "${branchId}" nie istnieje w tym multiverse albo jej porównanie z baseline nie jest COMPLETED — nie ma z czego zbudować kontrfaktyku.`,
      pack: null,
      chain: null,
      replay: null,
      sweptLever: null,
      differences: [],
    };
  }
  const saved = buildSavedScenarioCounterfactual(counterfactual, multiverse.spec.preparedness);
  return buildCounterfactualEvidencePack(saved);
}
