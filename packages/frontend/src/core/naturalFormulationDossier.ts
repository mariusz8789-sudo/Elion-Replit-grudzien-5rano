import { canonicalJson, fnv1a } from './events/hash';
import type { CompositionComputeReport, ComponentComputeRecord } from './naturalCompositionCompute';
import {
  buildBiologicalValidationRequest,
  rankNaturalCompositionHypotheses,
  type BiologicalExperimentRequest,
  type BiotechProvenance,
  type CandidateDiscoveryReport,
  type CandidateRanking,
  type RankedCompositionHypothesis,
} from './biotechDiscoveryContract';

/**
 * NATURAL FORMULATION HYPOTHESIS — DOSSIER.
 *
 * Ranking kompozycji (`rankNaturalCompositionHypotheses`) mówił, KTÓRA para
 * jest wyżej i dlaczego według czterech kryteriów. Nie mówił natomiast tego,
 * czego naukowiec potrzebuje, żeby cokolwiek z tym zrobić: SKĄD pochodzi każdy
 * składnik, DLACZEGO akurat on jest w tej kompozycji, CO wnosi sam, jakie
 * własności są policzone, jakie obliczenie faktycznie wykonano, czego brakuje
 * i jaki eksperyment to rozstrzygnie.
 *
 * To jest ten brakujący krok — i tylko on. Dossier NIE liczy nowej chemii, nie
 * dodaje kandydatów i nie tworzy drugiego silnika: składa pola, które już
 * istnieją w raportach, i JAWNIE oznacza te, których w danych nie ma
 * (`MISSING_DATA` / `NOT_MODELED`), zamiast je dopowiadać.
 *
 * GRANICA, KTÓRA JEST STRUKTURALNA, NIE UMOWNA: kontrakt nie ma pola na
 * proporcje, dawkę, drogę podania ani procedurę wytwarzania. Nie da się ich
 * „przypadkiem" wypełnić, bo nie mają gdzie trafić. Kompozycja jest hipotezą
 * badawczą do walidacji laboratoryjnej, nie recepturą.
 */
export const FORMULATION_DOSSIER_CONTRACT_VERSION = '1.0.0';

/**
 * Czego to dossier NIE zawiera i zawierać nie będzie. Lista jest częścią
 * kontraktu, a nie komentarzem — test pilnuje, że żadne z tych pojęć nie
 * pojawia się w strukturze wyniku.
 */
export const FORMULATION_EXCLUSIONS = [
  'Brak proporcji i ilości składników — kompozycja jest zbiorem kandydatów, nie recepturą.',
  'Brak dawki, drogi podania i schematu stosowania.',
  'Brak procedury syntezy, ekstrakcji i wytwarzania.',
  'Brak twierdzenia o równoważności klinicznej z jakimkolwiek lekiem.',
] as const;

export type DossierFieldStatus = 'PRESENT' | 'MISSING_DATA' | 'NOT_MODELED';

export interface DossierPropertyMetric {
  name: string;
  value: number | string;
  units: string;
  context: string;
}

export interface DossierComputeRecord {
  runtime: string;
  version?: string;
  runId?: string;
  fingerprint?: string;
  status: string;
  resultOrigin: string;
  outputKeys: readonly string[];
}

/** Jeden składnik kompozycji, z pełnym rozliczeniem tego, co o nim wiadomo. */
export interface FormulationComponent {
  candidateId: string;
  materialId: string;
  compoundIds: readonly string[];
  /** SOURCE — realna prowieniencja rekordu; pusta lista oznacza brak źródła, nie „literaturę". */
  sources: readonly BiotechProvenance[];
  sourceStatus: DossierFieldStatus;
  /** WHY — dlaczego TEN składnik jest w TEJ kompozycji, wyliczone z pokrycia. */
  whyIncluded: readonly string[];
  contributedTargetIds: readonly string[];
  contributedMechanismIds: readonly string[];
  /** Targety, które w tej kompozycji pokrywa WYŁĄCZNIE ten składnik — powód jego obecności. */
  uniquelyCoveredTargetIds: readonly string[];
  /** PROPERTY COVERAGE — wyłącznie z zadeklarowanego profilu; brak profilu = MISSING_DATA. */
  propertyStatus: DossierFieldStatus;
  propertyMetrics: readonly DossierPropertyMetric[];
  propertyUncertainty: string;
  /** EVIDENCE */
  evidenceIds: readonly string[];
  evidenceStatus: DossierFieldStatus;
  /** COMPUTE — realnie wykonane przebiegi obliczeniowe, nie deklaracja możliwości. */
  computeStatus: DossierFieldStatus;
  computeRuns: readonly DossierComputeRecord[];
  /**
   * Wykonania zamówione dla TEJ hipotezy, z rozróżnieniem EXECUTED /
   * MISSING_DATA / BLOCKED / COMPUTE_NOT_AVAILABLE. Puste, gdy dla tej
   * kompozycji nie uruchomiono per-hypothesis compute.
   */
  hypothesisComputeRecords: readonly ComponentComputeRecord[];
  ranking?: CandidateRanking;
  uncertainty: string;
  missingEvidence: readonly string[];
}

/**
 * Kolejność WALIDACJI jest leksykograficzna i zadeklarowana wprost. Rozstrzyga
 * pytanie „co warto zrobić najpierw", a odpowiedź brzmi: najpierw to, bez
 * czego reszta nie ma sensu. Nie ma tu wagi ani wskaźnika informatywności,
 * bo nie ma metodologii, która by je uzasadniła.
 */
export const VALIDATION_PRIORITY = [
  // Składnik bez ŻADNEGO evidence — hipoteza nie ma podstawy, nie słabą podstawę.
  'NO_EVIDENCE_COMPONENT',
  // Żądany target, którego nie pokrywa nikt — hipoteza nie odpowiada na pytanie.
  'UNCOVERED_TARGET',
  // Runtime był dopuszczalny, ale nie policzył — luka usuwalna od razu, bez laboratorium.
  'BLOCKED_COMPUTE',
  // Brak wejścia dla dopuszczalnego runtime'u — brakuje danych, nie wykonania.
  'MISSING_COMPUTE_INPUT',
  // Brak profilu własności — ogranicza wniosek, nie unieważnia go.
  'PROPERTY',
  // Test addytywności pary — ma sens dopiero, gdy składniki się bronią.
  'COMBINATION',
] as const;

export type ValidationPriorityKind = (typeof VALIDATION_PRIORITY)[number];

export interface FormulationValidationExperiment {
  /** Czego dotyczy: pojedynczego składnika, pary, czy niepokrytego targetu. */
  scope: 'COMPONENT' | 'COMBINATION' | 'UNCOVERED_TARGET' | 'PROPERTY' | 'COMPUTE';
  priority: ValidationPriorityKind;
  /** Pozycja w kolejności walidacji, licząc od 1. */
  order: number;
  /** Co ten krok ROZSTRZYGNIE — nie co pokaże. */
  resolves: string;
  question: string;
  /** Typowane żądanie eksperymentu tam, gdzie kontrakt je definiuje. */
  request?: BiologicalExperimentRequest;
  blockedReason?: string;
}

export interface NaturalFormulationHypothesis {
  rank: number;
  combinationId: string;
  label: string;
  components: readonly FormulationComponent[];
  coveredTargetIds: readonly string[];
  uncoveredTargetIds: readonly string[];
  coveredMechanismIds: readonly string[];
  coveredEvidenceIds: readonly string[];
  missingEvidenceIds: readonly string[];
  /** WHY całości — kryterium po kryterium z rankingu plus komplementarność składników. */
  why: readonly string[];
  propertyStatus: DossierFieldStatus;
  computeStatus: DossierFieldStatus;
  /** Pełny raport per-hypothesis compute, gdy został wykonany. */
  compute: CompositionComputeReport | null;
  uncertainty: string;
  /** Uporządkowane wg jawnych kryteriów: co blokuje najwięcej, idzie pierwsze. */
  validationExperiments: readonly FormulationValidationExperiment[];
  /** Status jest nazwany wprost i nie ma wariantu „lek". */
  status: 'NATURAL_COMPOSITION_HYPOTHESIS';
  /** Twierdzenie kliniczne nie istnieje i nie jest polem do wypełnienia. */
  clinicalClaim: 'NONE_VALIDATION_REQUIRED';
  hypothesisFingerprint: string;
}

export interface NaturalFormulationDossier {
  contractVersion: string;
  referenceLabel: string;
  requestedTargetIds: readonly string[];
  hypotheses: readonly NaturalFormulationHypothesis[];
  /** Które z wymaganych pól nie dały się wypełnić z danych — jawnie, nie po cichu. */
  unfilledFields: readonly string[];
  exclusions: readonly string[];
  dossierFingerprint: string;
}

function componentFor(
  report: CandidateDiscoveryReport,
  composition: RankedCompositionHypothesis,
  siblings: readonly CandidateDiscoveryReport[],
  requestedTargetIds: readonly string[],
  compute: CompositionComputeReport | null,
): FormulationComponent {
  const otherTargets = new Set(siblings.filter((entry) => entry.candidateId !== report.candidateId).flatMap((entry) => entry.targetIds));
  const uniquelyCoveredTargetIds = report.targetIds.filter((targetId) => !otherTargets.has(targetId));
  const requestedHere = report.targetIds.filter((targetId) => requestedTargetIds.includes(targetId));
  const computeRuns = (report.computeRuns ?? []).map((run) => ({
    runtime: run.runtime,
    ...(run.version === undefined ? {} : { version: run.version }),
    ...(run.runId === undefined ? {} : { runId: run.runId }),
    ...(run.fingerprint === undefined ? {} : { fingerprint: run.fingerprint }),
    status: run.status,
    resultOrigin: run.resultOrigin,
    outputKeys: Object.keys(run.outputs).sort(),
  }));

  const hypothesisComputeRecords = (compute?.runtimes ?? [])
    .flatMap((runtime) => runtime.componentRecords)
    .filter((record) => record.candidateId === report.candidateId);

  const whyIncluded: string[] = [];
  if (uniquelyCoveredTargetIds.length > 0) {
    whyIncluded.push(`Jako jedyny w tej kompozycji pokrywa: ${uniquelyCoveredTargetIds.join(', ')}.`);
  } else {
    whyIncluded.push('Nie wnosi żadnego targetu, którego nie pokrywa drugi składnik — obecność uzasadniona wyłącznie liczbą evidence albo oceną kandydata.');
  }
  if (requestedHere.length > 0) whyIncluded.push(`Pokrywa żądane targety: ${requestedHere.join(', ')}.`);
  whyIncluded.push(report.evidenceIds.length > 0
    ? `Stoi za nim ${report.evidenceIds.length} ${report.evidenceIds.length === 1 ? 'rekord' : 'rekordów'} evidence: ${report.evidenceIds.join(', ')}.`
    : 'Nie stoi za nim ŻADEN rekord evidence — to najsłabsze ogniwo tej kompozycji.');
  if (report.ranking) whyIncluded.push(`Ocena kandydata ${report.ranking.score} (${report.ranking.epistemicStatus}): ${report.ranking.rationale}`);

  return {
    candidateId: report.candidateId,
    materialId: report.materialId,
    compoundIds: report.compoundIds,
    sources: report.provenance,
    sourceStatus: report.provenance.length > 0 ? 'PRESENT' : 'MISSING_DATA',
    whyIncluded,
    contributedTargetIds: report.targetIds,
    contributedMechanismIds: report.mechanismIds,
    uniquelyCoveredTargetIds,
    propertyStatus: report.admeProfile === undefined ? 'MISSING_DATA' : 'PRESENT',
    propertyMetrics: report.admeProfile?.metrics ?? [],
    propertyUncertainty: report.admeProfile?.uncertainty
      ?? 'Brak zadeklarowanego profilu własności dla tego kandydata; nie wolno przyjmować żadnych wartości domyślnych.',
    evidenceIds: report.evidenceIds,
    evidenceStatus: report.evidenceIds.length > 0 ? 'PRESENT' : 'MISSING_DATA',
    computeStatus: computeRuns.length > 0 || hypothesisComputeRecords.some((record) => record.status === 'EXECUTED')
      ? 'PRESENT'
      : 'MISSING_DATA',
    computeRuns,
    hypothesisComputeRecords,
    ...(report.ranking === undefined ? {} : { ranking: report.ranking }),
    uncertainty: report.uncertainty,
    missingEvidence: composition.missingEvidenceIds.filter((entry) => entry === report.candidateId),
  };
}

function validationExperimentsFor(
  composition: RankedCompositionHypothesis,
  components: readonly FormulationComponent[],
  reports: readonly CandidateDiscoveryReport[],
  compute: CompositionComputeReport | null,
): FormulationValidationExperiment[] {
  const draft: Omit<FormulationValidationExperiment, 'order'>[] = [];

  for (const component of components) {
    const report = reports.find((entry) => entry.candidateId === component.candidateId);
    if (report === undefined) continue;
    const noEvidence = component.evidenceStatus !== 'PRESENT';
    draft.push({
      scope: 'COMPONENT',
      priority: noEvidence ? 'NO_EVIDENCE_COMPONENT' : 'COMBINATION',
      resolves: noEvidence
        ? 'Rozstrzygnie, czy ten składnik ma jakąkolwiek podstawę w tej hipotezie — bez tego reszta kroków jest przedwczesna.'
        : 'Rozstrzygnie, czy niezależny assay odtwarza zależność, na której opiera się obecność tego składnika.',
      question: noEvidence
        ? `Czy ${component.candidateId} w ogóle wykazuje aktywność wobec ${component.contributedTargetIds.join(', ') || 'jakiegokolwiek zadeklarowanego targetu'}? Brak evidence oznacza brak podstawy, nie słabą podstawę.`
        : `Czy niezależny assay odtwarza zależność ${component.candidateId} → ${component.contributedTargetIds.join(', ') || 'brak zadeklarowanego targetu'}?`,
      request: buildBiologicalValidationRequest({ hypothesisId: report.hypothesisId, candidateId: report.candidateId, targetIds: report.targetIds }),
    });
    if (component.propertyStatus !== 'PRESENT') {
      draft.push({
        scope: 'PROPERTY',
        priority: 'PROPERTY',
        resolves: 'Rozstrzygnie zakres, w jakim wolno o tym składniku cokolwiek twierdzić poza tożsamością.',
        question: `Zmierz profil własności ${component.candidateId}; obecnie nie ma żadnego zadeklarowanego profilu.`,
        blockedReason: 'Brak danych o własnościach; wymaga pomiaru albo przypiętego źródła, nie oszacowania.',
      });
    }
  }

  // Luki obliczeniowe pochodzą z REALNEGO wyniku planowania i wykonania, nie z
  // założenia „compute pewnie się nie udał".
  for (const runtime of compute?.runtimes ?? []) {
    for (const record of runtime.componentRecords) {
      if (record.status === 'BLOCKED') {
        draft.push({
          scope: 'COMPUTE',
          priority: 'BLOCKED_COMPUTE',
          resolves: `Rozstrzygnie, czy ${record.runtimeModelId} jest w ogóle dostępny w tym środowisku — to luka konfiguracyjna, nie naukowa.`,
          question: `Uruchom ${record.runtimeModelId} dla ${record.candidateId}: wejście istnieje, a runtime odmówił. ${record.reason}`,
          blockedReason: record.reason,
        });
      }
      if (record.status === 'MISSING_DATA') {
        draft.push({
          scope: 'COMPUTE',
          priority: 'MISSING_COMPUTE_INPUT',
          resolves: `Rozstrzygnie, czy ${record.candidateId} da się w ogóle policzyć runtime'em ${record.runtimeModelId}.`,
          question: `Uzupełnij przypięte wejście dla ${record.candidateId} wymagane przez ${record.runtimeModelId}. ${record.reason}`,
          blockedReason: record.reason,
        });
      }
    }
  }

  draft.push({
    scope: 'COMBINATION',
    priority: 'COMBINATION',
    resolves: 'Rozstrzygnie, czy zestawienie tych składników wnosi cokolwiek ponad ich osobne działanie.',
    question: `Czy działanie kompozycji ${composition.candidateIds.join(' + ')} jest addytywne? Projekt musi być prerejestrowany, a addytywność mierzona, nie wnioskowana z wiązania.`,
    blockedReason: 'W tym środowisku nie ma wykonawcy biologicznego; to żądanie eksperymentu, nie wynik.',
  });

  for (const targetId of composition.uncoveredTargetIds) {
    draft.push({
      scope: 'UNCOVERED_TARGET',
      priority: 'UNCOVERED_TARGET',
      resolves: 'Rozstrzygnie, czy hipoteza w ogóle odpowiada na postawione pytanie o ten target.',
      question: `Żaden składnik tej kompozycji nie pokrywa ${targetId}; potrzebne jest wyszukanie kolejnego kandydata albo świadoma rezygnacja z tego targetu.`,
      blockedReason: 'Niepokryty target jest luką w hipotezie, a nie polem do uzupełnienia szacunkiem.',
    });
  }

  return draft
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) =>
      VALIDATION_PRIORITY.indexOf(a.entry.priority) - VALIDATION_PRIORITY.indexOf(b.entry.priority)
      || a.index - b.index)
    .map(({ entry }, position) => ({ ...entry, order: position + 1 }));
}

export function buildNaturalFormulationDossier(input: {
  reports: readonly CandidateDiscoveryReport[];
  requestedTargetIds?: readonly string[];
  referenceLabel?: string;
  limit?: number;
  /**
   * Wyniki per-hypothesis compute, po jednym na kompozycję (dopasowywane po
   * `combinationId`). Pominięte = compute nie był uruchamiany; dossier mówi
   * wtedy MISSING_DATA, a nie „nie da się policzyć".
   */
  computeReports?: readonly CompositionComputeReport[];
}): NaturalFormulationDossier {
  const requestedTargetIds = input.requestedTargetIds ?? [];
  const referenceLabel = input.referenceLabel ?? 'nieokreślona referencja';
  const ranked = rankNaturalCompositionHypotheses(input.reports, requestedTargetIds, input.limit ?? 3);

  const hypotheses = ranked.map((composition) => {
    const siblings = composition.candidateIds
      .map((candidateId) => input.reports.find((report) => report.candidateId === candidateId))
      .filter((report): report is CandidateDiscoveryReport => report !== undefined);
    const compute = input.computeReports?.find((entry) => entry.combinationId === composition.combinationId) ?? null;
    const components = siblings.map((report) => componentFor(report, composition, siblings, requestedTargetIds, compute));
    const complementarity = components.some((component) => component.uniquelyCoveredTargetIds.length > 0)
      ? `Składniki są komplementarne: ${components.filter((component) => component.uniquelyCoveredTargetIds.length > 0).map((component) => `${component.candidateId} wnosi ${component.uniquelyCoveredTargetIds.join(', ')}`).join('; ')}.`
      : 'Składniki nie są komplementarne pod względem targetów — każdy pokrywa to samo co drugi.';
    const why = [...composition.rankingRationale, complementarity];
    const propertyStatus: DossierFieldStatus = components.every((component) => component.propertyStatus === 'PRESENT')
      ? 'PRESENT'
      : 'MISSING_DATA';
    const computeStatus: DossierFieldStatus = compute === null
      ? (components.some((component) => component.computeStatus === 'PRESENT') ? 'PRESENT' : 'MISSING_DATA')
      : compute.coverage === 'COMPLETE' ? 'PRESENT'
        : compute.coverage === 'PARTIAL' ? 'MISSING_DATA' : 'NOT_MODELED';
    const fingerprintBase = {
      combinationId: composition.combinationId,
      rank: composition.rank,
      components: components.map((component) => ({
        candidateId: component.candidateId,
        sources: component.sources.map((source) => `${source.source}:${source.sourceId}`),
        targets: component.contributedTargetIds,
        unique: component.uniquelyCoveredTargetIds,
        evidence: component.evidenceIds,
        compute: component.computeRuns.map((run) => run.fingerprint ?? run.runtime),
        hypothesisCompute: component.hypothesisComputeRecords.map((record) => `${record.runtimeModelId}:${record.status}:${record.fingerprint ?? 'brak'}`),
      })),
      why,
    };
    return {
      rank: composition.rank,
      combinationId: composition.combinationId,
      label: `Hipoteza kompozycji naturalnej #${composition.rank}: ${composition.candidateIds.join(' + ')}`,
      components,
      coveredTargetIds: composition.coveredTargetIds,
      uncoveredTargetIds: composition.uncoveredTargetIds,
      coveredMechanismIds: composition.coveredMechanismIds,
      coveredEvidenceIds: composition.coveredEvidenceIds,
      missingEvidenceIds: composition.missingEvidenceIds,
      why,
      propertyStatus,
      computeStatus,
      uncertainty: composition.uncertainty,
      compute,
      validationExperiments: validationExperimentsFor(composition, components, input.reports, compute),
      status: 'NATURAL_COMPOSITION_HYPOTHESIS' as const,
      clinicalClaim: 'NONE_VALIDATION_REQUIRED' as const,
      hypothesisFingerprint: fnv1a(canonicalJson(fingerprintBase)),
    };
  });

  const unfilledFields: string[] = [];
  if (hypotheses.some((hypothesis) => hypothesis.propertyStatus !== 'PRESENT')) {
    unfilledFields.push('PROPERTY COVERAGE — co najmniej jeden składnik nie ma zadeklarowanego profilu własności.');
  }
  if (hypotheses.some((hypothesis) => hypothesis.computeStatus !== 'PRESENT')) {
    unfilledFields.push('COMPUTE — co najmniej jedna kompozycja nie ma runtime\'u, który policzyłby WSZYSTKIE jej składniki; wyniku częściowego nie wolno zestawiać między składnikami.');
  }
  if (hypotheses.some((hypothesis) => hypothesis.missingEvidenceIds.length > 0)) {
    unfilledFields.push('EVIDENCE — co najmniej jeden składnik nie ma żadnego rekordu evidence.');
  }
  if (hypotheses.some((hypothesis) => hypothesis.uncoveredTargetIds.length > 0)) {
    unfilledFields.push('TARGET COVERAGE — co najmniej jeden żądany target pozostaje niepokryty.');
  }

  return {
    contractVersion: FORMULATION_DOSSIER_CONTRACT_VERSION,
    referenceLabel,
    requestedTargetIds,
    hypotheses,
    unfilledFields,
    exclusions: [...FORMULATION_EXCLUSIONS],
    dossierFingerprint: fnv1a(canonicalJson({
      contractVersion: FORMULATION_DOSSIER_CONTRACT_VERSION,
      referenceLabel, requestedTargetIds,
      hypotheses: hypotheses.map((hypothesis) => hypothesis.hypothesisFingerprint),
    })),
  };
}
