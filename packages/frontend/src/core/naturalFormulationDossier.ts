import { canonicalJson, fnv1a } from './events/hash';
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
  ranking?: CandidateRanking;
  uncertainty: string;
  missingEvidence: readonly string[];
}

export interface FormulationValidationExperiment {
  /** Czego dotyczy: pojedynczego składnika, pary, czy niepokrytego targetu. */
  scope: 'COMPONENT' | 'COMBINATION' | 'UNCOVERED_TARGET' | 'PROPERTY';
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
  uncertainty: string;
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
    computeStatus: computeRuns.length > 0 ? 'PRESENT' : 'MISSING_DATA',
    computeRuns,
    ...(report.ranking === undefined ? {} : { ranking: report.ranking }),
    uncertainty: report.uncertainty,
    missingEvidence: composition.missingEvidenceIds.filter((entry) => entry === report.candidateId),
  };
}

function validationExperimentsFor(
  composition: RankedCompositionHypothesis,
  components: readonly FormulationComponent[],
  reports: readonly CandidateDiscoveryReport[],
): FormulationValidationExperiment[] {
  const experiments: FormulationValidationExperiment[] = [];
  for (const component of components) {
    const report = reports.find((entry) => entry.candidateId === component.candidateId);
    if (report === undefined) continue;
    experiments.push({
      scope: 'COMPONENT',
      question: component.evidenceStatus === 'PRESENT'
        ? `Czy niezależny assay odtwarza zależność ${component.candidateId} → ${component.contributedTargetIds.join(', ') || 'brak zadeklarowanego targetu'}?`
        : `Czy ${component.candidateId} w ogóle wykazuje aktywność wobec ${component.contributedTargetIds.join(', ') || 'jakiegokolwiek zadeklarowanego targetu'}? Brak evidence oznacza brak podstawy, nie słabą podstawę.`,
      request: buildBiologicalValidationRequest({ hypothesisId: report.hypothesisId, candidateId: report.candidateId, targetIds: report.targetIds }),
    });
    if (component.propertyStatus !== 'PRESENT') {
      experiments.push({
        scope: 'PROPERTY',
        question: `Zmierz profil własności ${component.candidateId}; obecnie nie ma żadnego zadeklarowanego profilu.`,
        blockedReason: 'Brak danych o własnościach; wymaga pomiaru albo przypiętego źródła, nie oszacowania.',
      });
    }
  }
  experiments.push({
    scope: 'COMBINATION',
    question: `Czy działanie kompozycji ${composition.candidateIds.join(' + ')} jest addytywne? Projekt musi być prerejestrowany, a addytywność mierzona, nie wnioskowana z wiązania.`,
    blockedReason: 'W tym środowisku nie ma wykonawcy biologicznego; to żądanie eksperymentu, nie wynik.',
  });
  for (const targetId of composition.uncoveredTargetIds) {
    experiments.push({
      scope: 'UNCOVERED_TARGET',
      question: `Żaden składnik tej kompozycji nie pokrywa ${targetId}; potrzebne jest wyszukanie kolejnego kandydata albo świadoma rezygnacja z tego targetu.`,
      blockedReason: 'Niepokryty target jest luką w hipotezie, a nie polem do uzupełnienia szacunkiem.',
    });
  }
  return experiments;
}

export function buildNaturalFormulationDossier(input: {
  reports: readonly CandidateDiscoveryReport[];
  requestedTargetIds?: readonly string[];
  referenceLabel?: string;
  limit?: number;
}): NaturalFormulationDossier {
  const requestedTargetIds = input.requestedTargetIds ?? [];
  const referenceLabel = input.referenceLabel ?? 'nieokreślona referencja';
  const ranked = rankNaturalCompositionHypotheses(input.reports, requestedTargetIds, input.limit ?? 3);

  const hypotheses = ranked.map((composition) => {
    const siblings = composition.candidateIds
      .map((candidateId) => input.reports.find((report) => report.candidateId === candidateId))
      .filter((report): report is CandidateDiscoveryReport => report !== undefined);
    const components = siblings.map((report) => componentFor(report, composition, siblings, requestedTargetIds));
    const complementarity = components.some((component) => component.uniquelyCoveredTargetIds.length > 0)
      ? `Składniki są komplementarne: ${components.filter((component) => component.uniquelyCoveredTargetIds.length > 0).map((component) => `${component.candidateId} wnosi ${component.uniquelyCoveredTargetIds.join(', ')}`).join('; ')}.`
      : 'Składniki nie są komplementarne pod względem targetów — każdy pokrywa to samo co drugi.';
    const why = [...composition.rankingRationale, complementarity];
    const propertyStatus: DossierFieldStatus = components.every((component) => component.propertyStatus === 'PRESENT')
      ? 'PRESENT'
      : 'MISSING_DATA';
    const computeStatus: DossierFieldStatus = components.some((component) => component.computeStatus === 'PRESENT')
      ? 'PRESENT'
      : 'MISSING_DATA';
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
      validationExperiments: validationExperimentsFor(composition, components, input.reports),
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
    unfilledFields.push('COMPUTE — dla co najmniej jednej kompozycji żaden składnik nie ma wykonanego przebiegu obliczeniowego.');
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
