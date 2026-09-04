import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import type { CohortProfile } from '../agents/cohortModel';
import type { EpidemicCityParams } from '../simulation/epidemicCity';
import type { HospitalCapacityParams } from '../simulation/hospitalResource';
import type { ScenarioId, ScenarioRun, ScenarioSummary } from '../simulation/scenarioEngine';

/**
 * DISCOVERY CASE — schemat i bramki jakości pełnej ścieżki odkrycia:
 * PYTANIE → HIPOTEZA → EKSPERYMENT → PARAMETRY → WYKONANIE → WYNIK →
 * PORÓWNANIE → DOWÓD → REPLAY → WNIOSEK → NASTĘPNY EKSPERYMENT.
 *
 * DLACZEGO ISTNIEJE
 * Elementy tej ścieżki istniały osobno — Scenario Engine potrafił uruchomić i
 * porównać przebiegi, Experiment Fabric miał łańcuch dowodowy nad silnikami
 * backendowymi — ale nic nie spinało ich w jedną, audytowalną sprawę i nic nie
 * pilnowało, żeby wniosek nie wyprzedził dowodu.
 *
 * CO JEST TU NOWE, A CO POŻYCZONE
 *  - `FalsificationCriterion` pochodzi z `experimentFabric/scientificDiscovery`
 *    — nie definiujemy drugiego pojęcia falsyfikacji.
 *  - Wykonanie, porównanie i replay to Scenario Engine. Discovery Engine nie ma
 *    własnej mechaniki epidemii ani drugiego Scenario Engine.
 *  - Nowe jest wyłącznie spięcie w sprawę i BRAMKI JAKOŚCI: status nie da się
 *    podnieść bez dowodu, którego ten status wymaga.
 *
 * Ten plik zawiera wyłącznie typy i bramki — logika wykonania, porównania,
 * dowodu, wniosku i follow-upu mieszka w osobnych modułach, żeby nie powstał
 * cykl importów.
 */

export const DISCOVERY_ENGINE_VERSION = '1.0.0';

/**
 * Bramki jakości. Statusu nie nadaje autor sprawy — nadaje go zgromadzony
 * dowód, a `evaluateGate` odmawia awansu, gdy dowodu brakuje.
 */
export type DiscoveryCaseStatus =
  | 'DRAFT'
  | 'RUNNING'
  | 'COMPLETED'
  | 'REPLAY_VERIFIED'
  | 'EVIDENCE_VERIFIED'
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'BLOCKED'
  | 'NOT_MODELED';

/** Warunki początkowe wspólne dla obu ramion — fundament porównywalności. */
export interface DiscoveryInitialConditions {
  nAgents: number;
  initialInfected: number;
  seed: number;
  days: number;
  stepsPerDay: number;
}

export interface DiscoveryHypothesis {
  statement: string;
  /** Prerejestrowane kryterium — deklarowane PRZED wykonaniem. */
  falsification: FalsificationCriterion;
  /** Dodatkowe oczekiwania; niespełnione dają PARTIALLY_SUPPORTED. */
  supportingCriteria?: readonly FalsificationCriterion[];
  assumptions: readonly string[];
}

/** Kompletny, wykonywalny opis sprawy. Nic tu nie jest wynikiem. */
export interface DiscoveryCaseSpec {
  question: string;
  hypothesis: DiscoveryHypothesis;
  baselineScenario: ScenarioId;
  variantScenario: ScenarioId;
  initialConditions: DiscoveryInitialConditions;
  /** Parametry modelu wspólne dla obu ramion, przed nadpisaniem scenariuszem. */
  baseParams?: Partial<EpidemicCityParams>;
  hospitalCapacity?: HospitalCapacityParams;
  /**
   * Profil kohortowy wspólny dla obu ramion. Domyślnie neutralny — wiek nie
   * wpływa wtedy na dynamikę, a jedynie na rozbicie wyników na grupy.
   */
  cohort?: CohortProfile;
  /**
   * Dopuszczalna rozbieżność metryki przy odtworzeniu. Model jest
   * deterministyczny, więc domyślnie 0 — każda różnica to DRIFT.
   */
  replayTolerance?: number;
}

export type DiscoveryComparisonStatus = 'COMPLETED' | 'COMPARISON_BLOCKED';

export type ComparisonBlockReason =
  | 'SEED_MISMATCH'
  | 'POPULATION_MISMATCH'
  | 'INITIAL_CONDITIONS_MISMATCH'
  | 'NO_CONTROLLED_DIFFERENCE'
  | 'CONFOUNDED_MULTIPLE_DIFFERENCES'
  | 'ARM_NOT_EXECUTED';

export interface DiscoveryMetricDelta {
  key: string;
  baseline: number;
  variant: number;
  absoluteDelta: number;
  relativeDeltaPercent: number | null;
}

export interface DiscoveryComparison {
  status: DiscoveryComparisonStatus;
  /** Jedyna kontrolowana różnica między ramionami. */
  controlledDifference: string | null;
  /** Wszystko, co faktycznie różni ramiona — dowód, że jest tylko jedna zmiana. */
  observedDifferences: readonly string[];
  metrics: readonly DiscoveryMetricDelta[];
  blockedReason?: ComparisonBlockReason;
  message: string;
}

export type DiscoveryReplayStatus = 'MATCH' | 'WITHIN_TOLERANCE' | 'DRIFT' | 'BLOCKED' | 'NOT_REPRODUCIBLE';

/** Konkretna rozbieżność przy odtworzeniu — DRIFT musi pokazać, co się różni. */
export interface DiscoveryReplayDifference {
  field: string;
  expected: number | string | null;
  actual: number | string | null;
}

export interface DiscoveryReplay {
  status: DiscoveryReplayStatus;
  tolerance: number;
  arms: readonly {
    armId: string;
    expectedRunFingerprint: string | null;
    actualRunFingerprint: string | null;
    differences: readonly DiscoveryReplayDifference[];
  }[];
  message: string;
}

export type DiscoveryVerdict = 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'NOT_SUPPORTED' | 'INSUFFICIENT_EVIDENCE';

export interface DiscoveryCriterionCheck {
  criterion: FalsificationCriterion;
  metricKey: string;
  baseline: number | null;
  variant: number | null;
  met: boolean;
  explanation: string;
}

export interface DiscoveryConclusion {
  verdict: DiscoveryVerdict;
  /** Sprawdzenie kryterium prerejestrowanego. */
  primary: DiscoveryCriterionCheck | null;
  supporting: readonly DiscoveryCriterionCheck[];
  /** Z czego wniosek wynika — same fakty, nie narracja. */
  basis: readonly string[];
  /** Granice ważności wniosku. */
  limitations: readonly string[];
  message: string;
}

/** Ramię eksperymentu: nazwa + realny przebieg modelu. */
export interface DiscoveryArm {
  armId: string;
  scenario: ScenarioId;
  role: 'baseline' | 'variant';
  run: ScenarioRun;
  summary: ScenarioSummary | null;
}

export interface DiscoveryModelIdentity {
  modelId: string;
  modelVersion: string;
  engine: string;
  domainId: string;
}

/** Wejście sweepu jednego parametru — kontrakt wejściowy, nie wynik. */
export interface SweepSpec {
  question: string;
  scenario: ScenarioId;
  parameter: string;
  values: readonly number[];
  initialConditions: DiscoveryInitialConditions;
  baseParams?: Partial<EpidemicCityParams>;
  hospitalCapacity?: HospitalCapacityParams;
}

/** Wejście sweepu momentu wejścia interwencji w życie. */
export interface TimingSweepSpec {
  question: string;
  scenario: ScenarioId;
  startDays: readonly number[];
  initialConditions: DiscoveryInitialConditions;
  baseParams?: Partial<EpidemicCityParams>;
  hospitalCapacity?: HospitalCapacityParams;
}

/** Wejście przebiegu wielokrotnego po ziarnach. */
export interface MultiRunSpec {
  question: string;
  scenario: ScenarioId;
  seeds: readonly number[];
  initialConditions: Omit<DiscoveryInitialConditions, 'seed'>;
  baseParams?: Partial<EpidemicCityParams>;
  hospitalCapacity?: HospitalCapacityParams;
}

/**
 * Wykonywalne wejście kolejnego eksperymentu. Follow-up nie jest zdaniem do
 * przeczytania — jest kompletnym wsadem, który da się od razu uruchomić.
 */
export type DiscoveryFollowUpPlan =
  | { kind: 'scenario-comparison'; spec: DiscoveryCaseSpec }
  | { kind: 'parameter-sweep'; spec: SweepSpec }
  | { kind: 'intervention-timing'; spec: TimingSweepSpec }
  | { kind: 'multi-seed'; spec: MultiRunSpec };

/** Propozycja kolejnego eksperymentu — wykonywalna, nie opisowa. */
export interface DiscoveryFollowUp {
  question: string;
  /** Co w TEJ sprawie uzasadnia akurat ten następny krok. */
  rationale: string;
  /** Wypełnione, gdy follow-up da się uruchomić na tym modelu. */
  plan: DiscoveryFollowUpPlan | null;
  /** Wypełnione, gdy modelowi brakuje dźwigni. */
  notModeledReason?: string;
}

export interface DiscoveryEvidencePack {
  contractVersion: string;
  evidencePackId: string;
  caseId: string;
  model: DiscoveryModelIdentity;
  parameters: Readonly<Record<string, number | boolean>>;
  seed: number;
  initialConditions: DiscoveryInitialConditions;
  scenarios: { baseline: ScenarioId; variant: ScenarioId };
  inputFingerprints: Readonly<Record<string, string>>;
  runFingerprints: Readonly<Record<string, string | null>>;
  result: Readonly<Record<string, ScenarioSummary | null>>;
  comparison: DiscoveryComparison;
  replay: DiscoveryReplay;
  limitations: readonly string[];
  conclusion: DiscoveryConclusion;
  /** Puste dopiero czyni pakiet kompletnym; każdy brak jest wymieniony. */
  missingFields: readonly string[];
  disclaimer: string;
}

export interface DiscoveryCase {
  contractVersion: string;
  caseId: string;
  status: DiscoveryCaseStatus;
  question: string;
  hypothesis: DiscoveryHypothesis;
  model: DiscoveryModelIdentity;
  parameters: Readonly<Record<string, number | boolean>>;
  seed: number;
  initialConditions: DiscoveryInitialConditions;
  scenarios: { baseline: ScenarioId; variant: ScenarioId };
  inputFingerprint: string;
  runFingerprint: string | null;
  /** Dopuszczalna rozbieżność metryki przy odtworzeniu; 0 = wymagana zgodność. */
  replayTolerance: number;
  arms: readonly DiscoveryArm[];
  comparison: DiscoveryComparison | null;
  replay: DiscoveryReplay | null;
  evidence: DiscoveryEvidencePack | null;
  conclusion: DiscoveryConclusion | null;
  followUp: readonly DiscoveryFollowUp[];
  limitations: readonly string[];
  blockedReason?: string;
  notModeledReason?: string;
}

/** Wynik bramki: awans dozwolony albo jawna lista brakujących dowodów. */
export interface DiscoveryGateResult {
  allowed: boolean;
  target: DiscoveryCaseStatus;
  missing: readonly string[];
}

function armsExecuted(record: DiscoveryCase): boolean {
  return (
    record.arms.length === 2 &&
    record.arms.every((a) => a.run.status === 'COMPLETED' && a.run.resultFingerprint !== null && a.run.series.length > 0)
  );
}

function replayVerified(record: DiscoveryCase): boolean {
  return record.replay !== null && (record.replay.status === 'MATCH' || record.replay.status === 'WITHIN_TOLERANCE');
}

function evidenceComplete(record: DiscoveryCase): boolean {
  return record.evidence !== null && record.evidence.missingFields.length === 0;
}

/**
 * Sprawdza, czy sprawa ma dowód wymagany przez docelowy status.
 *
 * To jest miejsce, w którym UI i API tracą możliwość ogłoszenia wyniku za
 * wcześnie: bez przebiegów nie ma COMPLETED, bez odtworzenia nie ma
 * REPLAY_VERIFIED, bez kompletnego pakietu dowodowego nie ma EVIDENCE_VERIFIED,
 * a bez tego wszystkiego nie ma SUPPORTED.
 */
export function evaluateGate(record: DiscoveryCase, target: DiscoveryCaseStatus): DiscoveryGateResult {
  const missing: string[] = [];
  const needExecuted = () => { if (!armsExecuted(record)) missing.push('two completed scenario runs with result fingerprints'); };
  const needComparison = () => { if (record.comparison === null) missing.push('comparison'); };
  const needReplay = () => { if (!replayVerified(record)) missing.push('replay verdict MATCH or WITHIN_TOLERANCE'); };
  const needEvidence = () => { if (!evidenceComplete(record)) missing.push('complete evidence pack'); };
  const needConclusion = (verdict: DiscoveryVerdict) => {
    if (record.conclusion === null) missing.push('conclusion');
    else if (record.conclusion.verdict !== verdict) missing.push(`conclusion verdict ${verdict} (actual: ${record.conclusion.verdict})`);
  };

  switch (target) {
    case 'DRAFT':
      if (record.question.trim() === '') missing.push('question');
      if (record.hypothesis.statement.trim() === '') missing.push('hypothesis statement');
      break;
    case 'RUNNING':
      if (record.arms.length === 0) missing.push('at least one started arm');
      break;
    case 'COMPLETED':
      needExecuted();
      needComparison();
      break;
    case 'REPLAY_VERIFIED':
      needExecuted();
      needComparison();
      needReplay();
      break;
    case 'EVIDENCE_VERIFIED':
      needExecuted();
      needComparison();
      needReplay();
      needEvidence();
      break;
    case 'SUPPORTED':
      needExecuted();
      needComparison();
      needReplay();
      needEvidence();
      needConclusion('SUPPORTED');
      break;
    case 'PARTIALLY_SUPPORTED':
      needExecuted();
      needComparison();
      needReplay();
      needEvidence();
      needConclusion('PARTIALLY_SUPPORTED');
      break;
    case 'BLOCKED':
      if (!record.blockedReason) missing.push('blockedReason');
      break;
    case 'NOT_MODELED':
      if (!record.notModeledReason) missing.push('notModeledReason');
      break;
  }
  return { allowed: missing.length === 0, target, missing };
}

/**
 * Nadaje status TYLKO wtedy, gdy bramka przepuszcza. Odmowa zwraca sprawę
 * nietkniętą wraz z listą braków — nigdy nie podnosi statusu „prawie".
 */
export function promoteCase(
  record: DiscoveryCase,
  target: DiscoveryCaseStatus,
): { case: DiscoveryCase; gate: DiscoveryGateResult } {
  const gate = evaluateGate(record, target);
  if (!gate.allowed) return { case: record, gate };
  return { case: { ...record, status: target }, gate };
}

/** Najwyższy status, na jaki sprawa faktycznie zasłużyła zgromadzonym dowodem. */
export function highestEarnedStatus(record: DiscoveryCase): DiscoveryCaseStatus {
  if (record.notModeledReason) return 'NOT_MODELED';
  if (record.blockedReason) return 'BLOCKED';
  for (const target of ['SUPPORTED', 'PARTIALLY_SUPPORTED', 'EVIDENCE_VERIFIED', 'REPLAY_VERIFIED', 'COMPLETED', 'RUNNING'] as const) {
    if (evaluateGate(record, target).allowed) return target;
  }
  return 'DRAFT';
}
