import { buildSavedScenarioCounterfactual } from '../simulation/scenarioCounterfactual';
import type { SavedScenarioReplayStatus } from '../simulation/scenarioMemory';
import {
  multiverseBranchAsCounterfactual,
  temporalDecisionLineage,
  type TemporalDecisionLineage,
  type TemporalMultiverse,
} from '../simulation/temporalMultiverse';
import { buildCounterfactualEvidencePack, COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION, type CounterfactualEvidenceResult } from './counterfactualEvidence';
import { EVIDENCE_PACK_VERSION, type MultiverseEvidenceBranchContext } from './evidencePack';
import { buildExperimentGraph, type ExperimentGraph } from './experimentGraph';

/**
 * Kontekst pochodzenia z gałęzi multiverse dla Evidence Pack (FAZA 5 —
 * BRANCH-BY-BRANCH EVIDENCE). Każde pole jest PRZENIESIONE z `multiverse`/
 * `decision`, które multiverse już policzył — nic tu nie jest liczone drugi
 * raz ani zgadywane.
 */
function multiverseBranchContext(
  multiverse: TemporalMultiverse,
  branchId: string,
  decision: TemporalDecisionLineage,
  replayVerdict: SavedScenarioReplayStatus,
): MultiverseEvidenceBranchContext {
  return {
    contractVersion: EVIDENCE_PACK_VERSION,
    sourceMultiverseFingerprint: multiverse.multiverseFingerprint,
    branchId,
    declaredInterventionStartDay: decision.declaredInterventionStartDay,
    decisionState: decision.decisionState === null ? null : {
      logicalDay: decision.decisionState.logicalDay,
      timelineId: decision.decisionState.timelineId,
      stateFingerprint: decision.decisionState.stateFingerprint,
      branchRole: decision.decisionState.branchRole,
    },
    firstDivergentDayFromBaseline: decision.firstDivergentDayFromBaseline,
    branchState: decision.branchState === null ? null : {
      logicalDay: decision.branchState.logicalDay,
      temporalStateId: decision.branchState.temporalStateId,
      stateFingerprint: decision.branchState.stateFingerprint,
      branchRole: decision.branchState.branchRole,
    },
    replayVerdict,
  };
}

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
  const result = buildCounterfactualEvidencePack(saved);
  if (result.status !== 'CREATED' || result.pack === null || result.replay === null) return result;

  // FAZA 5: paczka z gałęzi multiverse musi wskazywać źródłowy multiverse,
  // deklarowaną decyzję, zmierzony rozjazd i werdykt odtworzenia — nie tylko
  // sam wynik dwuramiennego porównania. `decision` istnieje z definicji, bo
  // `multiverseBranchAsCounterfactual` już zweryfikował, że ta gałąź istnieje.
  const decision = temporalDecisionLineage(multiverse).find((entry) => entry.branchId === branchId)!;
  const context = multiverseBranchContext(multiverse, branchId, decision, result.replay.status);
  return { ...result, pack: { ...result.pack, multiverseBranchContext: context } };
}

/**
 * ŁAŃCUCH NAUKOWY JEDNEJ GAŁĘZI MULTIVERSE.
 *
 * Łączy pod jednym `branchId` trzy JUŻ ISTNIEJĄCE, niezależnie testowane
 * odczyty — bez liczenia czegokolwiek drugi raz i bez nowego kontraktu grafu:
 *
 *  - `decision` — decyzyjne pochodzenie z `temporalDecisionLineage`:
 *    deklarowany dzień decyzji, zmierzony dzień rozjazdu, oba stany czasowe;
 *  - `evidence` — ocena dowodowa z `buildMultiverseBranchEvidencePack`:
 *    replay obu ramion, prerejestrowane kryterium, paczka;
 *  - `graph`    — PEŁNY graf pytanie→hipoteza→eksperyment→wynik→niepewność→
 *    następny krok, zbudowany ISTNIEJĄCYM `buildExperimentGraph` z
 *    DOKŁADNIE tego samego `chain`/`chain.allRuns`, jaki właśnie ocenił
 *    Evidence Pack. `null`, gdy `evidence.chain` jest `null` — bez paczki nie
 *    ma prerejestrowanej hipotezy do pokazania, więc graf by ją dorabiał.
 *
 * `graph.nextExperiment` (gdy graf istnieje) pochodzi z ISTNIEJĄCEGO
 * `proposeNext`/`executeNextExperiment` wewnątrz `buildExperimentGraph` —
 * ta funkcja nie dodaje drugiego planera, tylko podaje mu dokładnie te
 * przebiegi, które już wykonała ta gałąź.
 */
export interface MultiverseBranchScientificLineage {
  branchId: string;
  /** `null`, gdy gałąź o tym `branchId` nie istnieje w tym multiverse. */
  decision: TemporalDecisionLineage | null;
  evidence: CounterfactualEvidenceResult;
  graph: ExperimentGraph | null;
}

export function buildMultiverseBranchScientificLineage(multiverse: TemporalMultiverse, branchId: string): MultiverseBranchScientificLineage {
  const decision = temporalDecisionLineage(multiverse).find((entry) => entry.branchId === branchId) ?? null;
  const evidence = buildMultiverseBranchEvidencePack(multiverse, branchId);
  const graph = evidence.chain === null ? null : buildExperimentGraph({
    question: multiverse.spec.preparedness?.askedText ?? `Gałąź "${branchId}" multiverse względem wspólnego baseline.`,
    runs: evidence.chain.allRuns,
    evidenceChains: [evidence.chain],
  });
  return { branchId, decision, evidence, graph };
}
