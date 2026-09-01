import { buildSavedScenarioCounterfactual } from '../simulation/scenarioCounterfactual';
import type { SavedScenarioReplayStatus } from '../simulation/scenarioMemory';
import { SCENARIOS, type ScenarioId } from '../simulation/scenarioEngine';
import {
  multiverseBranchAsCounterfactual,
  temporalDecisionLineage,
  type TemporalDecisionLineage,
  type TemporalMultiverse,
  type TemporalMultiverseSpec,
} from '../simulation/temporalMultiverse';
import { buildCounterfactualEvidencePack, COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION, type CounterfactualEvidenceResult } from './counterfactualEvidence';
import { EVIDENCE_PACK_VERSION, type MultiverseEvidenceBranchContext } from './evidencePack';
import { buildExperimentGraph, type ExperimentGraph, type NextExperimentProposal } from './experimentGraph';
import { explainScientificEvidence, type WhyNextExperimentAdvice } from './whyNextExperiment';

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

const TIMELINE_LEVER_KEYS = ['scenarioId', 'days', 'stepsPerDay', 'nAgents', 'initialInfected', 'seed', 'interventionStartDay'] as const;
type TimelineLeverKey = (typeof TIMELINE_LEVER_KEYS)[number];

/** Siedem dźwigni TEJ gałęzi, w kształcie zgodnym z `timelineParameters` (`counterfactualEvidence.ts`). */
function currentBranchParameters(multiverse: TemporalMultiverse, branchId: string): Record<TimelineLeverKey, string | number> | null {
  const branchSpec = multiverse.spec.branches.find((entry) => entry.branchId === branchId);
  const { nAgents, initialInfected, seed } = multiverse.spec.baseParams;
  if (branchSpec === undefined || nAgents === undefined || initialInfected === undefined || seed === undefined) return null;
  return {
    scenarioId: branchSpec.scenarioId,
    days: multiverse.spec.days,
    stepsPerDay: multiverse.spec.stepsPerDay,
    nAgents, initialInfected, seed,
    interventionStartDay: branchSpec.interventionStartDay ?? 0,
  };
}

/**
 * `graph.nextExperiment` liczy niepewności PO MODELU (`scenario-timeline`),
 * łącząc runy baseline i wariantu — nie po pojedynczej gałęzi. Dlatego
 * `proposal.request` może być zrekonstruowany z parametrów DOWOLNEGO ramienia,
 * nie koniecznie tej gałęzi, o którą pytamy. Zamiast ufać całemu requestowi,
 * ta funkcja bierze z niego WYŁĄCZNIE pole, którego dotyczy nazwana reguła
 * (`seed` dla `SINGLE_SEED`, konkretny parametr dla `SINGLE_PARAMETER_POINT`)
 * i nakłada je na WŁASNE, aktualne dźwignie tej gałęzi — gwarantując dokładnie
 * jedną zmienioną dźwignię względem baseline, tak samo jak wymaga tego
 * `resolveSweptLever` (`counterfactualEvidence.ts`). Inne rodzaje propozycji
 * (np. powtórzenie identycznych wejść przy `REPRODUCIBILITY_DRIFT`) nie mają
 * jednej, jednoznacznej dźwigni do przeniesienia na nową gałąź — `null`.
 */
function singleLeverChangedByProposal(proposal: NextExperimentProposal): TimelineLeverKey | null {
  if (proposal.kind === 'SINGLE_SEED') return 'seed';
  if (proposal.kind === 'SINGLE_PARAMETER_POINT') {
    const parameterId = proposal.uncertaintyId.split(':')[3];
    return (TIMELINE_LEVER_KEYS as readonly string[]).includes(parameterId ?? '') ? (parameterId as TimelineLeverKey) : null;
  }
  return null;
}

/**
 * Buduje spec następnej gałęzi WZGLĘDEM TEJ SAMEJ gałęzi i tego samego
 * baseline: własne dźwignie gałęzi plus dokładnie jedna zmiana, którą
 * `proposal` faktycznie odkrył. `null`, gdy nie da się jej wyznaczyć
 * (patrz `singleLeverChangedByProposal`) albo gdy zaproponowana wartość nie
 * różni się od obecnej — nie ma wtedy czego proponować jako nową gałąź.
 */
function nextMultiverseSpecFromProposal(multiverse: TemporalMultiverse, branchId: string, proposal: NextExperimentProposal): { spec: TemporalMultiverseSpec; changedLever: TimelineLeverKey } | null {
  if (proposal.request === null) return null;
  const lever = singleLeverChangedByProposal(proposal);
  if (lever === null) return null;
  const current = currentBranchParameters(multiverse, branchId);
  if (current === null) return null;
  const proposedValue = proposal.request.parameters[lever];
  if (proposedValue === undefined || proposedValue === current[lever]) return null;

  const merged: Record<TimelineLeverKey, string | number> = { ...current, [lever]: proposedValue };
  const { scenarioId, days, stepsPerDay, nAgents, initialInfected, seed, interventionStartDay } = merged;
  if (typeof scenarioId !== 'string' || SCENARIOS[scenarioId as ScenarioId] === undefined) return null;
  if (typeof days !== 'number' || typeof stepsPerDay !== 'number' || typeof nAgents !== 'number' || typeof initialInfected !== 'number' || typeof seed !== 'number' || typeof interventionStartDay !== 'number') return null;

  const spec: TemporalMultiverseSpec = {
    baselineScenarioId: multiverse.spec.baselineScenarioId,
    baselineInterventionStartDay: multiverse.spec.baselineInterventionStartDay,
    days, stepsPerDay,
    baseParams: { nAgents, initialInfected, seed },
    ...(multiverse.spec.baseHospital === undefined ? {} : { baseHospital: multiverse.spec.baseHospital }),
    ...(multiverse.spec.baseCohort === undefined ? {} : { baseCohort: multiverse.spec.baseCohort }),
    branches: [{ branchId: `${branchId}→next(${lever})`, scenarioId: scenarioId as ScenarioId, interventionStartDay }],
    // Ta sama prerejestracja co rodzic — kontynuacja TEGO SAMEGO pytania,
    // skopiowana PRZED wykonaniem, nie dopisana po zobaczeniu wyniku.
    preparedness: multiverse.spec.preparedness,
  };
  return { spec, changedLever: lever };
}

/**
 * PROPOZYCJA NASTĘPNEGO EKSPERYMENTU DLA GAŁĘZI MULTIVERSE.
 *
 * Domyka pętlę RESULT → PROPOSE NEXT → CONSTRUCT NEXT SPEC → PRE-REGISTER →
 * RUN. Nie jest drugim planerem: `proposal` to DOKŁADNIE ten sam
 * `graph.nextExperiment`, który `buildExperimentGraph` już wyznaczył z
 * realnych przebiegów tej gałęzi (jedna niepewność, jedna reguła, jedna
 * zmieniona dźwignia — `NEXT_EXPERIMENT_RULES`), a `advice` to DOKŁADNIE ten
 * sam `explainScientificEvidence` z `whyNextExperiment.ts` — obie funkcje są
 * tylko WYWOŁANE, nigdy przepisane.
 *
 * PREREJESTRACJA NIGDY PO FAKCIE: `nextSpec.preparedness` to dosłownie
 * `multiverse.spec.preparedness` rodzica — to samo rządzone pytanie,
 * skopiowane PRZED wykonaniem czegokolwiek następnego. Brak prerejestracji
 * na rodzicu daje `NOT_AVAILABLE`, nigdy dorobione kryterium.
 */
export type NextMultiverseExperimentStatus = 'READY_TO_RUN' | 'BLOCKED' | 'NOT_AVAILABLE';

export interface NextMultiverseExperiment {
  status: NextMultiverseExperimentStatus;
  reason: string;
  /** Tożsamość rodzica — do przejścia PARENT → CHILD bez wymyślania nowych identyfikatorów. */
  sourceMultiverseFingerprint: string;
  sourceBranchId: string;
  /** `null`, gdy rodzic nie ma prerejestrowanego pytania. */
  sourceQuestionId: string | null;
  /** Prawdziwy `NextExperimentProposal` z `experimentGraph.ts` — `null`, gdy graf nie zgłasza żadnej otwartej niepewności. */
  proposal: NextExperimentProposal | null;
  /** Prawdziwe `WhyNextExperimentAdvice` z `whyNextExperiment.ts` — `null`, gdy nie ma dowodowego łańcucha do wyjaśnienia. */
  advice: WhyNextExperimentAdvice | null;
  /** Zarejestrowany PRZED wykonaniem spec następnego multiverse — wyłącznie przy `READY_TO_RUN`. */
  nextSpec: TemporalMultiverseSpec | null;
}

export function proposeNextMultiverseExperiment(multiverse: TemporalMultiverse, branchId: string): NextMultiverseExperiment {
  const lineage = buildMultiverseBranchScientificLineage(multiverse, branchId);
  const proposal = lineage.graph?.nextExperiment ?? null;
  const advice = lineage.evidence.chain === null ? null : explainScientificEvidence(lineage.evidence.chain);
  const sourceQuestionId = multiverse.spec.preparedness?.questionId ?? null;
  const base = {
    sourceMultiverseFingerprint: multiverse.multiverseFingerprint,
    sourceBranchId: branchId,
    sourceQuestionId,
    proposal,
    advice,
  };

  if (multiverse.spec.preparedness === undefined) {
    return { ...base, status: 'NOT_AVAILABLE', reason: 'Rodzicielski multiverse nie ma prerejestrowanego pytania — bez niego następny eksperyment nie miałby czego kontynuować bez dopisania kryterium po fakcie.', nextSpec: null };
  }
  if (lineage.decision === null) {
    return { ...base, status: 'NOT_AVAILABLE', reason: `Gałąź "${branchId}" nie istnieje w tym multiverse — niekompletne pochodzenie nie ma czego kontynuować.`, nextSpec: null };
  }
  if (proposal === null) {
    return { ...base, status: 'NOT_AVAILABLE', reason: 'Graf tej gałęzi nie zgłasza żadnej otwartej niepewności — nie ma czego rozstrzygać kolejnym przebiegiem.', nextSpec: null };
  }
  if (proposal.status !== 'READY_TO_RUN' || proposal.request === null) {
    return { ...base, status: 'BLOCKED', reason: `Zaproponowany krok nie jest lokalnie wykonywalny (${proposal.status}): ${proposal.action}`, nextSpec: null };
  }

  const resolved = nextMultiverseSpecFromProposal(multiverse, branchId, proposal);
  if (resolved === null) {
    return {
      ...base,
      status: 'BLOCKED',
      reason: `Zaproponowany krok (${proposal.kind}) nie wskazuje jednej, jednoznacznej dźwigni możliwej do zastosowania na gałęzi "${branchId}" — nie da się z niego zbudować nowej, porównywalnej gałęzi bez zgadywania.`,
      nextSpec: null,
    };
  }

  return {
    ...base,
    status: 'READY_TO_RUN',
    reason: `Następny eksperyment (zmienia "${resolved.changedLever}"): ${proposal.action} (${proposal.rule})`,
    nextSpec: resolved.spec,
  };
}
