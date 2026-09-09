import { readJSON, writeJSON } from './storage';
import type { HonestyLevel, SimParams } from './types';
import { biotechScientificFingerprint, buildCandidateCombinationHypothesis, rankNaturalCompositionHypotheses, type BiologicalExperimentRequest, type BiologicalExperimentRequestStatus, type BiotechEpistemicStatus, type BiotechProvenance, type CandidateCombinationHypothesis, type CandidateDiscoveryReport, type CandidateRanking, type RankedCompositionHypothesis, type TherapeuticCandidate, type TherapeuticHypothesis } from './biotechDiscoveryContract';
import type { ExperimentOutputValue, ExperimentRoute, ExperimentRun } from './experimentFabric/types';
import type { ScientificEvidencePack } from './experimentFabric/evidencePack';
import { compareAme2020Observations } from './observation/nuclearAme2020';
import { compareCandidateDiscoveryReports, type CandidateComparison } from './biotechDiscoveryContract';
import { canonicalJson, fnv1a } from './events/hash';
import type { CompositionComputeReport } from './naturalCompositionCompute';
import { buildSavedScenarioRunContext, isSavedScenarioRunContext, type SavedScenarioRunContext } from './simulation/scenarioMemory';
import type { ScenarioRun } from './simulation/scenarioEngine';
import {
  buildSavedHypothesisLoop, isSavedHypothesisLoop, replaySavedHypothesisLoopAsync, selectNextHypothesisExperiment,
  type HypothesisLoopReplay, type HypothesisLoopReplayStatus, type HypothesisLoopResult, type HypothesisStatus,
  type NextHypothesisExperiment, type SavedHypothesisLoop,
} from './experimentFabric/hypothesisLoop';
import {
  buildCrossHypothesisAnalysis, buildEvidenceChain, SCIENTIFIC_DISCOVERY_LOOP_VERSION,
  type HypothesisEvidenceChainLink, type ScientificDiscoveryLoopResult,
} from './experimentFabric/scientificDiscoveryLoop';
import type { DiscoveryAnalysis } from './experimentFabric/discovery';
import { buildSavedScenarioCounterfactual, isSavedScenarioCounterfactual, type SavedScenarioCounterfactual, type ScenarioCounterfactual } from './simulation/scenarioCounterfactual';
import { combineEvidencePackRoCrates, type DomainEvidenceEntry, type GenesisRoCrate } from './experimentFabric/evidencePackRoCrate';
import type { ReplayVerdict } from './matrixFoundation/replayVerdict';
import {
  discoveryResultFingerprint, runAutonomousDiscoveryWithEngines,
  type DiscoveryLoopExecution, type DiscoveryLoopInput, type DiscoveryLoopResult,
} from './agent/discoveryLoop';
import {
  generateJointMechanismFrom, jointMechanismResultFingerprint,
  type DerivedJointMechanism,
} from './agent/mechanismGeneration';
import type { JointInterventionAssessment } from './agent/mechanismInteraction';
import { compareWorldActions, crossActionResultFingerprint, type CrossActionComparison } from './agent/crossActionComparison';
import {
  buildWorldDiscoveryPlan, parseWorldDiscoveryGoal, resolveWorldLeverCatalog, type WorldLeverCatalog,
} from './agent/worldGoalIntent';
import {
  inquiryResultFingerprint, runAutonomousInquiry,
  type InquiryLoopInput, type InquiryLoopResult,
} from './agent/inquiryLoop';
import { buildWorldEvidenceBundle, type WorldEvidenceBundle } from './worldModel/evidence/worldEvidenceBundle';
import { compareBranches, projectToWorldState } from './worldModel/bridge/worldFrameState';
import { TemporalEngine, TemporalBranchRegistry } from './worldModel/temporal/temporalEngine';
import type { RealExperimentRequest, ReferenceMeasurementRequest } from './experimentFabric/realExperiment';
import type { FalsificationCriterion } from './experimentFabric/scientificDiscovery';
import {
  verifyPredictionAgainstRealExperiment, predictionVerificationFingerprint, type PredictionVerification,
} from './agent/predictionVerification';


/**
 * Scientific Memory (sekcja O dyrektywy CTO) — trwały, lokalny zapis
 * przeprowadzonych eksperymentów. Ten sam wzorzec co customExperiment.ts /
 * discoveryLog.ts / settings.ts: localStorage, walidacja pole-po-polu przy
 * odczycie (localStorage jest edytowalne poza aplikacją), limit globalny.
 *
 * Zapisujemy to, co czyni eksperyment ODTWARZALNYM i audytowalnym: model
 * (lab+experiment), parametry, równania, założenia, status epistemiczny,
 * poziom uczciwości, migawkę wyników ORAZ `contentHash` — deterministyczny
 * odcisk {labId, experimentId, params}. To fingerprint (nie kryptograficzny;
 * pełny sha256 z prowieniencją jest po stronie backendu), ale wystarcza, by
 * dwa identyczne eksperymenty miały ten sam identyfikator, a zmiana parametru
 * dała inny.
 *
 * Dane są lokalne dla przeglądarki użytkownika — brak współdzielenia między
 * użytkownikami (sekcja O: separacja danych).
 */
export interface SavedExperimentExecution {
  status: string;
  runId: string;
  runFingerprint: string;
  resultOrigin: string;
  /**
   * A SEPARATE axis from `resultOrigin` — see `core/dataProvenance.ts`: is
   * this output Genesis's own model/solver, an external reference source, or
   * a real laboratory measurement. Optional because it is undefined exactly
   * when the underlying run produced no output to have a provenance
   * (`capability-seam`/`engine-not-available`), never silently dropped.
   */
  dataProvenance?: string;
  summary: string;
  modelId?: string;
  engine?: string;
  modelVersion?: string;
  route?: ExperimentRoute;
}

export interface SavedExperimentAnalysisBlock {
  title: string;
  body: string;
  kind?: string;
}

export interface SavedBiotechComparison {
  comparisonId: string;
  reportIds: readonly string[];
  candidateIds: readonly string[];
  scientificFingerprint: string;
  epistemicStatus: 'PREDICTION';
  uncertainty: string;
}

export type SavedBiotechComparisonReplayStatus = 'MATCH' | 'DRIFT' | 'BLOCKED';

export interface SavedBiotechComparisonReplay {
  status: SavedBiotechComparisonReplayStatus;
  reason: string;
}

export interface SavedBiotechComputeRun {
  candidateId: string; runId: string; runFingerprint: string; status: string;
  resultOrigin: string; summary: string; outputs: Readonly<Record<string, ExperimentOutputValue>>;
}

export interface SavedBiotechSourceRecord {
  name: string; cid: number; formula: string; smiles: string; inchiKey: string;
  molecularWeight: string; source: string; sourceVersion: string; retrievedAt: string;
  atoms3d?: readonly { element: string; x: number; y: number; z: number }[];
}

export interface SavedBiotechActivityRecord {
  pubchemCid: number; compoundId: string; targetId: string; activityId: number; assayId: string;
  type: 'Ki' | 'IC50' | 'EC50'; relation: string; value: string; units: string;
  assayContext: string; assayQuality: 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  source: 'ChEMBL'; sourceVersion: string; retrievedAt: string; sourceUrl: string;
}

export interface SavedBiotechDiscoveryArtifact {
  requestId?: string; reference?: string; target?: string;
  neurobiology?: { targetId: string; receptor: string; receptorFamily: string; neurotransmitterSystem: string; pathway: { label: string; status: string; uncertainty: string }; mechanism: { label: string; status: string; uncertainty: string }; provenance: readonly { source: string; sourceId: string; sourceUrl?: string; sourceVersion?: string }[] };
  validationRequestIds: readonly string[];
  reports: readonly CandidateDiscoveryReport[];
  candidateIds: readonly string[]; sourceIds: readonly string[];
  activityIds: readonly string[]; assayIds: readonly string[];
  comparisonId?: string; rankingScores: Readonly<Record<string, number>>;
  computeRuns: readonly SavedBiotechComputeRun[]; sourceRecords?: readonly SavedBiotechSourceRecord[]; activityRecords?: readonly SavedBiotechActivityRecord[]; limitations: readonly string[];
  combinationHypothesis?: CandidateCombinationHypothesis;
  /**
   * TOP N uszeregowanych hipotez kompozycji — to, co użytkownik realnie
   * zobaczył. Bez tego zapis pamiętał jedną kompozycję, a odtworzenie nie
   * miało jak wykryć, że ranking się zmienił.
   */
  compositionHypotheses?: readonly RankedCompositionHypothesis[];
  /** Targety, względem których liczono pokrycie. Bez nich `uncoveredTargetIds` zawsze wychodzi puste. */
  requestedTargetIds?: readonly string[];
  /**
   * Per-hypothesis compute: realne przebiegi runtime'ów wykonane dla kompozycji,
   * razem z runId, wejściem, wyjściem i odciskiem. Bez tego wykonane obliczenia
   * znikały przy przeładowaniu, a dossier po powrocie mówiło MISSING_DATA o
   * czymś, co realnie policzono.
   */
  compositionCompute?: readonly CompositionComputeReport[];
  artifactFingerprint: string;
}

export interface SavedBiotechContext {
  candidateId: string;
  hypothesisId: string;
  reportId?: string;
  requestId?: string;
  hypothesisStatus: BiotechEpistemicStatus;
  experimentRequestStatus?: BiologicalExperimentRequestStatus;
  evidenceIds: readonly string[];
  safetySignalIds: readonly string[];
  provenance: readonly BiotechProvenance[];
  scientificFingerprint: string;
  activityIds?: readonly string[];
  assayIds?: readonly string[];
  ranking?: CandidateRanking;
  comparison?: SavedBiotechComparison;
  computeRuns?: readonly SavedBiotechComputeRun[];
  artifact?: SavedBiotechDiscoveryArtifact;
}

export interface SavedExperimentReplayIdentity {
  capsuleId: string;
  planId: string;
  confirmationId: string;
}

export interface SavedExperiment {
  id: string;
  createdAt: string;
  labId: string;
  experimentId: string;
  experimentName: string;
  params: SimParams;
  stats: Record<string, number>;
  /** Optional canonical Fabric observations; legacy memory rows may omit this. */
  observations?: Readonly<Record<string, ExperimentOutputValue>>;
  execution?: SavedExperimentExecution;
  evidencePackId?: string;
  evidenceChainId?: string;
  analysis?: readonly SavedExperimentAnalysisBlock[];
  biotech?: SavedBiotechContext;
  /**
   * Trwałe wejścia przebiegu Scenario Engine. Zapisujemy wejścia i odciski,
   * nie odpowiedź: po przeładowaniu seria jest liczona od nowa i dopiero
   * zgodność odcisków dopuszcza ją do świata 3D.
   */
  scenario?: SavedScenarioRunContext;
  /**
   * Zapisany kontrfaktyk: OBA ramiona plus policzona różnica. Odtworzenie
   * wykonuje oba przebiegi od nowa i przelicza różnicę — zapisane metryki są
   * porównywane, nie odczytywane jako wynik.
   */
  counterfactual?: SavedScenarioCounterfactual;
  /**
   * Prerejestrowany zbiór hipotez wraz z tym, co z niego wyszło. Zapis niesie
   * WEJŚCIA i statusy; odtworzenie wykonuje zbiór od nowa i je porównuje.
   */
  hypothesisLoop?: SavedHypothesisLoop;
  /**
   * Warstwa Obserwacja/Analiza/Znalezisko/Dowód i Następny Eksperyment NAD
   * powyższym `hypothesisLoop` (ten sam przebieg, `hypothesisLoopFingerprint`
   * wskazuje na `hypothesisLoop.loopFingerprint`) — nie drugi zapis pętli.
   */
  discoveryLoop?: SavedScientificDiscoveryLoop;
  /**
   * Jedna trwała pozycja obejmująca CAŁE dochodzenie wielodomenowe (np.
   * epidemiologia + fizyka cząstek + chemia). Niesie CAŁY skombinowany
   * RO-Crate (`combineEvidencePackRoCrates`, bez zmian) oraz wejścia
   * potrzebne do odtworzenia każdej domeny osobno przez istniejące
   * `replaySavedHypothesisLoopAsync` — nie duplikuje żadnego z tych
   * mechanizmów, tylko je zestawia.
   */
  investigation?: SavedInvestigation;
  /**
   * A run of the world-model Autonomous Discovery Loop or Cross-Action
   * Comparison (`core/agent/discoveryLoop.ts` / `crossActionComparison.ts`).
   * A different substrate from every other domain above (a `TemporalEngine`
   * world, not an `ExperimentRun`), so it gets its own field rather than
   * being squeezed into `hypothesisLoop`/`discoveryLoop` above, which are
   * specifically the Fabric-router shape.
   */
  worldDiscovery?: SavedWorldDiscoveryRun;
  /**
   * A run of the autonomous parameter inquiry (`core/agent/inquiryLoop.ts`).
   * A third shape again: many competing quantitative hypotheses about the SAME
   * system, judged over several adaptively chosen probes. `hypothesisLoop` is a
   * preregistered fixed set and `worldDiscovery` is a `TemporalEngine` world,
   * so neither can carry this without losing what makes it what it is — the
   * fact that probe N+1 was chosen because of what probe N measured.
   */
  parameterInquiry?: SavedParameterInquiry;
  /**
   * A joint-arm finding from `core/agent/mechanismGeneration.ts`: two declared
   * MECHANISM hypotheses combined into one fork because both survived
   * independently. A fourth shape again — see `SavedMechanismComposition`'s
   * own doc for why it fits none of the three above.
   */
  mechanismComposition?: SavedMechanismComposition;
  /**
   * A real, physical measurement judged against a WorldGraph prediction —
   * the fifth investigation shape. Neither `worldDiscovery` (the SIMULATED
   * prediction itself, referenced by id rather than duplicated) nor any
   * Fabric shape above fits it: this record's whole reason to exist is a
   * REAL_EXPERIMENTAL `ExperimentRun`, judged against a frozen prediction
   * from a completed `worldDiscovery` run. See `SavedRealExperimentVerification`.
   */
  realExperimentVerification?: SavedRealExperimentVerification;
  replayIdentity?: SavedExperimentReplayIdentity;
  honesty: HonestyLevel;
  honestyNote: string;
  equations: string[];
  assumptions: string[];
  epistemicStatus: string;
  contentHash: string;
}

const KEY = 'science-memory/v1';
const AUDIT_KEY = 'science-memory/admin-audit/v1';
const MAX_TOTAL = 100;

export interface BiotechAdminAuditEntry {
  requestId: string;
  timestamp: string;
  userId: string;
  action: string;
  provenance: string;
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function recordBiotechAdminAudit(input: { userId: string; action: string; provenance: string }): BiotechAdminAuditEntry {
  const entry: BiotechAdminAuditEntry = { requestId: newRequestId(), timestamp: new Date().toISOString(), ...input };
  const existing = readJSON<BiotechAdminAuditEntry[]>(AUDIT_KEY, []);
  writeJSON(AUDIT_KEY, [...(Array.isArray(existing) ? existing : []), entry].slice(-MAX_TOTAL));
  return entry;
}

export function listBiotechAdminAudit(): readonly BiotechAdminAuditEntry[] {
  const entries = readJSON<BiotechAdminAuditEntry[]>(AUDIT_KEY, []);
  return Array.isArray(entries) ? entries.filter((entry) => nonEmptyString(entry.requestId) && nonEmptyString(entry.timestamp) && nonEmptyString(entry.userId) && nonEmptyString(entry.action) && nonEmptyString(entry.provenance)) : [];
}

/** Deterministyczny, synchroniczny odcisk treści (FNV-1a 32-bit → hex). Nie kryptograficzny. */
export function contentHash(input: { labId: string; experimentId: string; params: SimParams }): string {
  const canonical = JSON.stringify({
    labId: input.labId,
    experimentId: input.experimentId,
    params: Object.fromEntries(Object.entries(input.params).sort(([a], [b]) => a.localeCompare(b))),
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function validParams(value: unknown): value is SimParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((entry) =>
    (typeof entry === 'number' && Number.isFinite(entry)) || typeof entry === 'string' || typeof entry === 'boolean',
  );
}

function validStats(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function validObservations(value: unknown): value is Readonly<Record<string, ExperimentOutputValue>> {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.values(value as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.every((entry) => {
    if (typeof entry === 'number' || typeof entry === 'string' || typeof entry === 'boolean') return true;
    return Array.isArray(entry) && entry.length > 0 && entry.every((sample) => typeof sample === 'number' && Number.isFinite(sample));
  });
}

function validExecution(value: unknown): value is SavedExperimentExecution | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const execution = value as SavedExperimentExecution;
  const required = [execution.status, execution.runId, execution.runFingerprint, execution.resultOrigin, execution.summary];
  if (required.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) return false;
  return execution.status !== 'completed' || execution.resultOrigin === 'real-engine';
}

function validContentHash(o: Record<string, unknown>): boolean {
  if (typeof o.labId !== 'string' || typeof o.experimentId !== 'string' || typeof o.contentHash !== 'string' || !validParams(o.params)) return false;
  return contentHash({ labId: o.labId, experimentId: o.experimentId, params: o.params }) === o.contentHash;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validAnalysis(value: unknown): value is readonly SavedExperimentAnalysisBlock[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((block) => Boolean(block) && typeof block === 'object' && nonEmptyString((block as SavedExperimentAnalysisBlock).title) && nonEmptyString((block as SavedExperimentAnalysisBlock).body) && ((block as SavedExperimentAnalysisBlock).kind === undefined || typeof (block as SavedExperimentAnalysisBlock).kind === 'string'));
}

function validBiotechContext(value: unknown): value is SavedBiotechContext | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as SavedBiotechContext;
  const statuses: readonly BiotechEpistemicStatus[] = ['FACT', 'OBSERVED', 'LITERATURE_SUPPORTED', 'PREDICTION', 'INFERENCE', 'HYPOTHESIS', 'UNKNOWN', 'BLOCKED'];
  const requestStatuses: readonly BiologicalExperimentRequestStatus[] = ['NOT_EXECUTED', 'BLOCKED'];
  const validIds = (ids: unknown): ids is readonly string[] => Array.isArray(ids) && ids.every((id) => nonEmptyString(id));
  const validProvenance = Array.isArray(context.provenance) && context.provenance.every((item) => item && typeof item === 'object' && nonEmptyString(item.source) && nonEmptyString(item.sourceId) && nonEmptyString(item.evidenceType) && statuses.includes(item.status));
  const validRanking = context.ranking === undefined || (context.ranking && typeof context.ranking === 'object' && nonEmptyString(context.ranking.candidateId) && Number.isFinite(context.ranking.score) && Number.isFinite(context.ranking.components.evidenceQuality) && Number.isFinite(context.ranking.components.targetRelevance) && Number.isFinite(context.ranking.components.safetyPenalty) && Number.isFinite(context.ranking.components.uncertaintyPenalty) && nonEmptyString(context.ranking.rationale) && nonEmptyString(context.ranking.uncertainty) && ['UNKNOWN', 'PREDICTION'].includes(context.ranking.epistemicStatus));
  const comparison = context.comparison;
  const validComparison = comparison === undefined || (comparison && typeof comparison === 'object' && nonEmptyString(comparison.comparisonId) && Array.isArray(comparison.reportIds) && comparison.reportIds.length >= 2 && comparison.reportIds.every(nonEmptyString) && Array.isArray(comparison.candidateIds) && comparison.candidateIds.length === comparison.reportIds.length && comparison.candidateIds.every(nonEmptyString) && nonEmptyString(comparison.scientificFingerprint) && comparison.epistemicStatus === 'PREDICTION' && nonEmptyString(comparison.uncertainty));
  return nonEmptyString(context.candidateId)
    && nonEmptyString(context.hypothesisId)
    && (context.reportId === undefined || nonEmptyString(context.reportId))
    && (context.requestId === undefined || nonEmptyString(context.requestId))
    && statuses.includes(context.hypothesisStatus)
    && (context.experimentRequestStatus === undefined || requestStatuses.includes(context.experimentRequestStatus))
    && validIds(context.evidenceIds)
    && validIds(context.safetySignalIds)
    && (context.activityIds === undefined || validIds(context.activityIds))
    && (context.assayIds === undefined || validIds(context.assayIds))
    && validProvenance
    && validRanking
    && validComparison
    && nonEmptyString(context.scientificFingerprint);
}

function validReplayIdentity(value: unknown): value is SavedExperimentReplayIdentity | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as SavedExperimentReplayIdentity;
  return nonEmptyString(identity.capsuleId) && nonEmptyString(identity.planId) && nonEmptyString(identity.confirmationId);
}

function isSavedExperiment(v: unknown): v is SavedExperiment {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.labId === 'string' &&
    typeof o.experimentId === 'string' &&
    typeof o.experimentName === 'string' &&
    validContentHash(o) &&
    validStats(o.stats) &&
    validParams(o.params) &&
    validObservations(o.observations) &&
    validExecution(o.execution) &&
    (o.evidencePackId === undefined || nonEmptyString(o.evidencePackId)) &&
    (o.evidenceChainId === undefined || nonEmptyString(o.evidenceChainId)) &&
    validAnalysis(o.analysis) &&
    validBiotechContext(o.biotech) &&
    (o.scenario === undefined || isSavedScenarioRunContext(o.scenario)) &&
    (o.counterfactual === undefined || isSavedScenarioCounterfactual(o.counterfactual)) &&
    (o.hypothesisLoop === undefined || isSavedHypothesisLoop(o.hypothesisLoop)) &&
    (o.discoveryLoop === undefined || isSavedScientificDiscoveryLoop(o.discoveryLoop)) &&
    (o.investigation === undefined || isSavedInvestigation(o.investigation)) &&
    validReplayIdentity(o.replayIdentity)
  );
}

function readAll(): SavedExperiment[] {
  const raw = readJSON<unknown[]>(KEY, []);
  return Array.isArray(raw) ? raw.filter(isSavedExperiment) : [];
}

export function saveBiotechDiscoveryReportToMemory(report: CandidateDiscoveryReport, comparison?: CandidateComparison, lineage?: { activityIds?: readonly string[]; assayIds?: readonly string[]; computeRuns?: readonly SavedBiotechComputeRun[]; artifact?: SavedBiotechDiscoveryArtifact }): SavedExperiment {
  const biotech: SavedBiotechContext = {
    candidateId: report.candidateId,
    hypothesisId: report.hypothesisId,
    reportId: report.reportId,
    ...(report.experimentRequestId === undefined ? {} : { requestId: report.experimentRequestId }),
    hypothesisStatus: report.epistemicStatus,
    evidenceIds: report.evidenceIds,
    safetySignalIds: report.safetySignalIds,
    provenance: report.provenance,
    scientificFingerprint: report.scientificFingerprint,
    ...(lineage?.activityIds?.length ? { activityIds: lineage.activityIds } : {}),
    ...(lineage?.assayIds?.length ? { assayIds: lineage.assayIds } : {}),
    ...(lineage?.computeRuns?.length ? { computeRuns: lineage.computeRuns } : {}),
    ...(lineage?.artifact === undefined ? {} : { artifact: lineage.artifact }),
    ...(report.ranking === undefined ? {} : { ranking: report.ranking }),
    ...(comparison === undefined ? {} : { comparison: { comparisonId: comparison.comparisonId, reportIds: comparison.reportIds, candidateIds: comparison.rows.map((row) => row.candidateId), scientificFingerprint: comparison.scientificFingerprint, epistemicStatus: comparison.epistemicStatus, uncertainty: comparison.uncertainty } }),
  };
  return saveExperiment({
    labId: 'biotechnology', experimentId: `report:${report.reportId}`, experimentName: `Candidate Discovery Report — ${report.candidateId}`,
    params: {}, stats: {}, biotech, honesty: 'simplified', honestyNote: 'Scientific context only; no biological execution performed.',
    assumptions: [], epistemicStatus: report.epistemicStatus,
  });
}

export function saveBiotechDiscoveryComparisonToMemory(reports: readonly CandidateDiscoveryReport[], lineage?: { activityIds?: readonly string[]; assayIds?: readonly string[]; computeRuns?: readonly SavedBiotechComputeRun[]; sourceRecords?: readonly SavedBiotechSourceRecord[]; activityRecords?: readonly SavedBiotechActivityRecord[]; neurobiology?: SavedBiotechDiscoveryArtifact['neurobiology']; requestedTargetIds?: readonly string[]; compositionCompute?: readonly CompositionComputeReport[] }): SavedExperiment {
  if (reports.length < 2) throw new Error('Porównanie kandydatów do pamięci wymaga co najmniej dwóch raportów.');
  const requestedTargetIds = lineage?.requestedTargetIds ?? [];
  const comparison = compareCandidateDiscoveryReports(reports);
  const computeRuns = lineage?.computeRuns ?? [];
  const artifactBase = {
    reports, validationRequestIds: reports.flatMap((report) => report.experimentRequestId ? [report.experimentRequestId] : []),
    candidateIds: reports.map((report) => report.candidateId),
    sourceIds: [...new Set(reports.flatMap((report) => report.provenance.map((item) => item.sourceId)))],
    activityIds: lineage?.activityIds ?? [], assayIds: lineage?.assayIds ?? [],
    comparisonId: comparison.comparisonId,
    rankingScores: Object.fromEntries(reports.map((report) => [report.candidateId, report.ranking?.score ?? 0])),
    computeRuns, ...(lineage?.sourceRecords === undefined ? {} : { sourceRecords: lineage.sourceRecords }), ...(lineage?.activityRecords === undefined ? {} : { activityRecords: lineage.activityRecords }), ...(lineage?.neurobiology === undefined ? {} : { neurobiology: lineage.neurobiology }), limitations: ['Binding is not efficacy.', 'No biological executor or clinical validation was executed.'],
    // Żądane targety wchodzą do obu wyliczeń, więc zapisana kompozycja niesie
    // realne `uncoveredTargetIds`, a nie pustą listę z braku argumentu.
    combinationHypothesis: buildCandidateCombinationHypothesis(reports, requestedTargetIds),
    compositionHypotheses: rankNaturalCompositionHypotheses(reports, requestedTargetIds, 3),
    requestedTargetIds,
    // Wykonane obliczenia są DANYMI, nie funkcją raportów: nie da się ich
    // przeliczyć z raportów, więc wchodzą do odcisku jako zapisana treść.
    ...(lineage?.compositionCompute === undefined ? {} : { compositionCompute: lineage.compositionCompute }),
  };
  const artifact: SavedBiotechDiscoveryArtifact = { ...artifactBase, artifactFingerprint: fnv1a(canonicalJson(artifactBase)) };
  return saveBiotechDiscoveryReportToMemory(reports[0]!, comparison, { ...lineage, computeRuns, artifact });
}

/**
 * Replays only the deterministic, source-backed comparison calculation from a
 * saved record. This verifies persisted comparison identity; it is not a
 * biological rerun, fresh assay, efficacy claim, or source refresh.
 */
export function replaySavedBiotechComparison(
  saved: SavedBiotechComparison | undefined,
  reports: readonly CandidateDiscoveryReport[],
): SavedBiotechComparisonReplay {
  if (!saved || reports.length < 2) {
    return { status: 'BLOCKED', reason: 'Brak kompletnego zapisanego comparison albo mniej niż dwóch raportów.' };
  }
  try {
    const current = compareCandidateDiscoveryReports(reports);
    const sameIdentity = current.comparisonId === saved.comparisonId
      && current.scientificFingerprint === saved.scientificFingerprint
      && current.reportIds.length === saved.reportIds.length
      && current.reportIds.every((id, index) => id === saved.reportIds[index])
      && current.rows.length === saved.candidateIds.length
      && current.rows.every((row, index) => row.candidateId === saved.candidateIds[index]);
    return sameIdentity
      ? { status: 'MATCH', reason: 'Deterministyczny comparison i jego fingerprint odtworzyły się identycznie.' }
      : { status: 'DRIFT', reason: 'Odtworzony comparison różni się od zapisanego ID, fingerprintu albo kolejności kandydatów.' };
  } catch (error) {
    return { status: 'BLOCKED', reason: `Nie można odtworzyć comparison: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function replaySavedBiotechDiscoveryArtifact(saved: SavedBiotechDiscoveryArtifact | undefined, reports: readonly CandidateDiscoveryReport[], lineage: { activityIds?: readonly string[]; assayIds?: readonly string[]; computeRuns?: readonly SavedBiotechComputeRun[]; sourceRecords?: readonly SavedBiotechSourceRecord[]; activityRecords?: readonly SavedBiotechActivityRecord[]; neurobiology?: SavedBiotechDiscoveryArtifact['neurobiology'] } = {}): SavedBiotechComparisonReplay {
  if (!saved || reports.length < 2) return { status: 'BLOCKED', reason: 'Brak kompletnego discovery artifact albo raportów do odtworzenia.' };
  const comparison = compareCandidateDiscoveryReports(reports);
  const sourceRecords = lineage.sourceRecords ?? saved.sourceRecords;
  const activityRecords = lineage.activityRecords ?? saved.activityRecords;
  const base = { reports, validationRequestIds: reports.flatMap((report) => report.experimentRequestId ? [report.experimentRequestId] : []), candidateIds: reports.map((report) => report.candidateId), sourceIds: [...new Set(reports.flatMap((report) => report.provenance.map((item) => item.sourceId)))], activityIds: lineage.activityIds ?? [], assayIds: lineage.assayIds ?? [], comparisonId: comparison.comparisonId, rankingScores: Object.fromEntries(reports.map((report) => [report.candidateId, report.ranking?.score ?? 0])), computeRuns: lineage.computeRuns ?? [], ...(sourceRecords === undefined ? {} : { sourceRecords }), ...(activityRecords === undefined ? {} : { activityRecords }), ...(lineage.neurobiology === undefined ? {} : { neurobiology: lineage.neurobiology }), limitations: ['Binding is not efficacy.', 'No biological executor or clinical validation was executed.'],
    // Odtworzenie musi policzyć DOKŁADNIE to, co zapis — łącznie z rankingiem
    // kompozycji i żądanymi targetami, które zapis niesie ze sobą. Inaczej
    // fingerprint rozjeżdża się bez żadnej realnej zmiany naukowej.
    combinationHypothesis: buildCandidateCombinationHypothesis(reports, saved.requestedTargetIds ?? []),
    compositionHypotheses: rankNaturalCompositionHypotheses(reports, saved.requestedTargetIds ?? [], 3),
    requestedTargetIds: saved.requestedTargetIds ?? [],
    // Compute nie jest przeliczalny z raportów — jego integralność sprawdza
    // osobno `replaySavedCompositionCompute`. Tutaj przechodzi jako zapisana
    // treść, żeby odcisk artefaktu obejmował również ją.
    ...(saved.compositionCompute === undefined ? {} : { compositionCompute: saved.compositionCompute }) };
  // Sam zgodny fingerprint nie wystarcza: rekord z pamięci może mieć podmienioną
  // TREŚĆ przy nienaruszonym odcisku. Porównujemy więc również to, co zapis
  // deklaruje, z tym, co przeliczenie daje — inaczej podmieniony ranking
  // kompozycji przechodziłby jako MATCH.
  const storedMatchesRecomputed =
    canonicalJson(saved.compositionHypotheses ?? []) === canonicalJson(base.compositionHypotheses)
    && canonicalJson(saved.requestedTargetIds ?? []) === canonicalJson(base.requestedTargetIds)
    && canonicalJson(saved.combinationHypothesis ?? null) === canonicalJson(base.combinationHypothesis ?? null);
  if (fnv1a(canonicalJson(base)) !== saved.artifactFingerprint) {
    return { status: 'DRIFT', reason: 'Odtworzony discovery artifact ma inny fingerprint niż zapisany.' };
  }
  if (!storedMatchesRecomputed) {
    return { status: 'DRIFT', reason: 'Zapisane hipotezy kompozycji lub żądane targety różnią się od przeliczonych z tych samych raportów.' };
  }
  return { status: 'MATCH', reason: 'Cały deterministyczny discovery artifact odtworzył identyczny fingerprint i identyczne hipotezy kompozycji.' };
}

export interface SaveExperimentInput {
  labId: string;
  experimentId: string;
  experimentName: string;
  params: SimParams;
  stats?: Record<string, number>;
  observations?: Readonly<Record<string, ExperimentOutputValue>>;
  honesty: HonestyLevel;
  honestyNote: string;
  equations?: string[];
  assumptions?: string[];
  epistemicStatus?: string;
  execution?: SavedExperimentExecution;
  evidencePackId?: string;
  evidenceChainId?: string;
  analysis?: readonly SavedExperimentAnalysisBlock[];
  biotech?: SavedBiotechContext;
  scenario?: SavedScenarioRunContext;
  counterfactual?: SavedScenarioCounterfactual;
  hypothesisLoop?: SavedHypothesisLoop;
  discoveryLoop?: SavedScientificDiscoveryLoop;
  investigation?: SavedInvestigation;
  worldDiscovery?: SavedWorldDiscoveryRun;
  parameterInquiry?: SavedParameterInquiry;
  mechanismComposition?: SavedMechanismComposition;
  realExperimentVerification?: SavedRealExperimentVerification;
  replayIdentity?: SavedExperimentReplayIdentity;
}

export interface SaveBiotechHypothesisInput {
  candidate: TherapeuticCandidate;
  hypothesis: TherapeuticHypothesis;
  experimentRequest?: BiologicalExperimentRequest;
  honestyNote?: string;
}

export function saveBiotechHypothesisToMemory(input: SaveBiotechHypothesisInput): SavedExperiment {
  if (input.hypothesis.candidateId !== input.candidate.id) throw new Error('Hipoteza musi wskazywać ten sam candidateId co zapisany kandydat.');
  const biotech: SavedBiotechContext = {
    candidateId: input.candidate.id,
    hypothesisId: input.hypothesis.id,
    ...(input.experimentRequest === undefined ? {} : { requestId: input.experimentRequest.requestId, experimentRequestStatus: input.experimentRequest.status }),
    hypothesisStatus: input.hypothesis.status,
    evidenceIds: input.hypothesis.supportingEvidenceIds,
    safetySignalIds: input.hypothesis.safetySignalIds,
    provenance: [...input.candidate.provenance, ...input.hypothesis.provenance],
    scientificFingerprint: biotechScientificFingerprint(input.hypothesis),
  };
  return saveExperiment({
    labId: 'biotechnology', experimentId: `hypothesis:${input.hypothesis.id}`, experimentName: input.hypothesis.label,
    params: {}, stats: {}, biotech, honesty: 'simplified', honestyNote: input.honestyNote ?? 'Scientific context only; no biological execution performed.',
    assumptions: [], epistemicStatus: input.hypothesis.status,
  });
}

export function saveExperiment(input: SaveExperimentInput): SavedExperiment {
  if (!validParams(input.params)) throw new Error('Parametry muszą zawierać wyłącznie skończone liczby, teksty lub wartości logiczne.');
  if (!validStats(input.stats ?? {})) throw new Error('Statystyki muszą zawierać wyłącznie skończone liczby.');
  if (!validObservations(input.observations)) throw new Error('Obserwacje muszą zawierać wyłącznie skończone wartości lub serie liczbowe.');
  if (!validExecution(input.execution)) throw new Error('Execution musi mieć kompletne provenance; status completed wymaga resultOrigin real-engine.');
  if (input.evidencePackId !== undefined && !nonEmptyString(input.evidencePackId)) throw new Error('Evidence Pack musi mieć niepusty identyfikator.');
  if (input.evidenceChainId !== undefined && !nonEmptyString(input.evidenceChainId)) throw new Error('Evidence chain musi mieć niepusty identyfikator.');
  if (!validReplayIdentity(input.replayIdentity)) throw new Error('Replay identity musi mieć niepuste identyfikatory.');
  if (!validBiotechContext(input.biotech)) throw new Error('Biotech context musi mieć kompletne identity, status i provenance.');
  if (input.scenario !== undefined && !isSavedScenarioRunContext(input.scenario)) throw new Error('Kontekst scenariusza musi zawierać komplet wejść i odcisków wystarczających do odtworzenia.');
  if (input.counterfactual !== undefined && !isSavedScenarioCounterfactual(input.counterfactual)) throw new Error('Kontrfaktyk musi zawierać komplet obu ramion i policzoną, porównywalną różnicę.');
  if (input.hypothesisLoop !== undefined && !isSavedHypothesisLoop(input.hypothesisLoop)) throw new Error('Zapis pętli hipotez musi zawierać prerejestrację, hipotezy i komplet wyników.');
  if (input.discoveryLoop !== undefined) {
    if (!isSavedScientificDiscoveryLoop(input.discoveryLoop)) throw new Error('Zapis pętli odkrycia naukowego musi zawierać pytanie, łańcuch dowodowy i następny eksperyment.');
    if (input.hypothesisLoop === undefined || input.discoveryLoop.hypothesisLoopFingerprint !== input.hypothesisLoop.loopFingerprint) {
      throw new Error('Pętla odkrycia naukowego musi wskazywać ten sam loopFingerprint co zapisana pętla hipotez.');
    }
  }
  if (input.investigation !== undefined && !isSavedInvestigation(input.investigation)) throw new Error('Zapis dochodzenia wielodomenowego musi zawierać co najmniej jedną domenę z kompletną pętlą hipotez oraz RO-Crate.');
  if (input.worldDiscovery !== undefined && !isSavedWorldDiscoveryRun(input.worldDiscovery)) throw new Error('Zapis odkrycia world-model musi zawierać cel, katalog, wynik i odcisk treści.');
  if (input.parameterInquiry !== undefined && !isSavedParameterInquiry(input.parameterInquiry)) throw new Error('Zapis dochodzenia parametrycznego musi zawierać wejścia, wynik i odcisk treści.');
  if (input.mechanismComposition !== undefined && !isSavedMechanismComposition(input.mechanismComposition)) throw new Error('Zapis kompozycji mechanizmów musi zawierać katalog, cel, wynik i odcisk treści.');
  if (input.realExperimentVerification !== undefined && !isSavedRealExperimentVerification(input.realExperimentVerification)) throw new Error('Zapis weryfikacji realnym eksperymentem musi zawierać źródło predykcji, request, realny przebieg REAL_EXPERIMENTAL i wynik porównania.');
  if (!validAnalysis(input.analysis)) throw new Error('Analiza musi zawierać niepuste bloki.');
  const hash = contentHash(input);
  const entry: SavedExperiment = {
    id: `${input.labId}:${input.experimentId}:${hash}:${Date.now()}`,
    createdAt: new Date().toISOString(),
    labId: input.labId,
    experimentId: input.experimentId,
    experimentName: input.experimentName,
    params: input.params,
    stats: input.stats ?? {},
    ...(input.observations === undefined ? {} : { observations: input.observations }),
    ...(input.execution === undefined ? {} : { execution: input.execution }),
    ...(input.evidencePackId === undefined ? {} : { evidencePackId: input.evidencePackId }),
    ...(input.evidenceChainId === undefined ? {} : { evidenceChainId: input.evidenceChainId }),
    ...(input.analysis === undefined ? {} : { analysis: input.analysis }),
    ...(input.biotech === undefined ? {} : { biotech: input.biotech }),
    ...(input.scenario === undefined ? {} : { scenario: input.scenario }),
    ...(input.counterfactual === undefined ? {} : { counterfactual: input.counterfactual }),
    ...(input.hypothesisLoop === undefined ? {} : { hypothesisLoop: input.hypothesisLoop }),
    ...(input.discoveryLoop === undefined ? {} : { discoveryLoop: input.discoveryLoop }),
    ...(input.investigation === undefined ? {} : { investigation: input.investigation }),
    ...(input.worldDiscovery === undefined ? {} : { worldDiscovery: input.worldDiscovery }),
    ...(input.parameterInquiry === undefined ? {} : { parameterInquiry: input.parameterInquiry }),
    ...(input.mechanismComposition === undefined ? {} : { mechanismComposition: input.mechanismComposition }),
    ...(input.realExperimentVerification === undefined ? {} : { realExperimentVerification: input.realExperimentVerification }),
    ...(input.replayIdentity === undefined ? {} : { replayIdentity: input.replayIdentity }),
    honesty: input.honesty,
    honestyNote: input.honestyNote,
    equations: input.equations ?? [],
    assumptions: input.assumptions ?? [],
    epistemicStatus: input.epistemicStatus ?? '',
    contentHash: hash,
  };
  const all = [...readAll(), entry].slice(-MAX_TOTAL);
  writeJSON(KEY, all);
  return entry;
}

/** Najnowsze pierwsze. */
/**
 * Persists a Fabric run without upgrading its scientific status. Numeric outputs are
 * retained as observations; every run status and provenance origin remains explicit.
 */
export function saveExperimentRunToMemory(run: ExperimentRun): SavedExperiment {
  const observations = Object.fromEntries(Object.entries(run.result.outputs).filter(([, value]) => {
    if (typeof value === 'number') return Number.isFinite(value);
    return Array.isArray(value) && value.length > 0 && value.every((sample) => Number.isFinite(sample));
  })) as Readonly<Record<string, ExperimentOutputValue>>;
  const stats: Record<string, number> = Object.fromEntries(Object.entries(run.result.outputs)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
  const output = run.result.outputs as Record<string, ExperimentOutputValue>;
  const outputString = (key: string): string | undefined => typeof output[key] === 'string' ? output[key] : undefined;
  const biotech = run.request.domainId === 'biotechnology' && run.result.biologicalEvidence
    && outputString('candidateId') && outputString('hypothesisId')
    ? {
        candidateId: outputString('candidateId')!,
        hypothesisId: outputString('hypothesisId')!,
        ...(outputString('reportId') ? { reportId: outputString('reportId') } : {}),
        hypothesisStatus: (outputString('hypothesisStatus') === 'HYPOTHESIS' ? 'HYPOTHESIS' : 'UNKNOWN') as BiotechEpistemicStatus,
        evidenceIds: [run.result.biologicalEvidence.id],
        safetySignalIds: [],
        provenance: [...(run.result.biologicalTarget?.provenance ?? []), ...run.result.biologicalEvidence.provenance],
        scientificFingerprint: run.provenance.runFingerprint,
      } satisfies SavedBiotechContext
    : undefined;
  const biotechAnalysis = biotech
    ? [{ title: 'Discovery chain', body: `Candidate ${biotech.candidateId} → ranking ${outputString('rankingStatus') ?? 'UNKNOWN'} (${outputString('rankingScore') ?? 'unknown'}): ${outputString('rankingRationale') ?? 'brak rationale'}. Hypothesis ${biotech.hypothesisId}; validation ${outputString('validationPath') ?? 'UNKNOWN'}.`, kind: 'biotech-discovery' }]
    : [];
  const observationAnalysis = run.request.modelId === 'nuclear-semf'
    ? (() => {
        const comparison = compareAme2020Observations();
        return [{
          title: 'Independent observation comparison',
          body: `AME2020: ${comparison.comparisons.map((item) => `${item.nuclide}=${item.status}`).join(', ')}; MAE=${comparison.meanAbsoluteError.toPrecision(5)} MeV/nucleon; RMSE=${comparison.rootMeanSquareError.toPrecision(5)} MeV/nucleon; calibration=${comparison.calibration.status}; source=${comparison.provenance.sourceUrl}; raw SHA-256=${comparison.provenance.rawPayloadSha256}.`,
          kind: 'external-observation-comparison',
        }];
      })()
    : [];
  return saveExperiment({
    labId: run.request.domainId,
    experimentId: run.request.modelId ?? run.request.domainId,
    experimentName: run.request.modelId ?? `Science Chat — ${run.request.domainId}`,
    params: { ...run.request.parameters },
    stats,
    observations,
    execution: {
      status: run.result.status,
      runId: run.runId,
      runFingerprint: run.provenance.runFingerprint,
      resultOrigin: run.provenance.resultOrigin,
      ...(run.provenance.dataProvenance === undefined ? {} : { dataProvenance: run.provenance.dataProvenance }),
      summary: run.result.summary,
      modelId: run.request.modelId,
      engine: run.plan.engine ?? undefined,
      modelVersion: run.plan.modelVersion ?? undefined,
      route: run.result.route,
    },
    analysis: [
      { title: 'Genesis result', body: run.result.summary, kind: 'fabric-result' },
      ...observationAnalysis,
      ...biotechAnalysis,
      ...(run.result.warnings.length === 0 ? [] : [{ title: 'Jawne ostrzeżenia', body: run.result.warnings.join(' '), kind: 'fabric-warning' }]),
    ],
    honesty: run.result.status === 'completed' ? 'exact' : 'simplified',
    honestyNote: `Fabric status=${run.result.status}; resultOrigin=${run.provenance.resultOrigin}.`,
    assumptions: [...run.result.assumptions],
    epistemicStatus: run.result.status === 'completed' ? 'OBSERVED' : 'UNKNOWN',
    ...(biotech === undefined ? {} : { biotech }),
  });
}

/**
 * Persists a faithful Memory index for a completed Scientific Evidence Pack.
 * The full typed result remains in the Evidence Pack store; Memory keeps the
 * canonical IDs plus finite numeric observations needed for local analysis.
 */
export function saveScientificEvidencePackToMemory(pack: ScientificEvidencePack): SavedExperiment {
  const firstRun = pack.runs[0];
  if (!firstRun) throw new Error('Nie można zapisać pustego Evidence Pack w Scientific Memory.');
  const keys = [...new Set(pack.runs.flatMap((run) => Object.keys(run.result.outputs)))];
  const observations = Object.fromEntries(keys.flatMap((key) => {
    const values = pack.runs
      .map((run) => run.result.outputs[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) return [];
    return [[key, values.length === 1 ? values[0] : values] as const];
  }));
  const stats: Record<string, number> = Object.fromEntries(Object.entries(firstRun.result.outputs)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
  const assumptions = [...new Set(pack.runs.flatMap((run) => run.result.assumptions))];
  return saveExperiment({
    labId: pack.protocol.hypothesis.domainId,
    experimentId: pack.protocol.hypothesis.modelId,
    experimentName: `Protocol Evidence — ${pack.protocol.hypothesis.statement}`,
    params: firstRun.parameters,
    stats,
    observations,
    execution: {
      status: firstRun.status,
      runId: firstRun.runId,
      runFingerprint: firstRun.provenance.runFingerprint,
      resultOrigin: firstRun.provenance.resultOrigin,
      ...(firstRun.provenance.dataProvenance === undefined ? {} : { dataProvenance: firstRun.provenance.dataProvenance }),
      summary: firstRun.result.summary,
      modelId: firstRun.modelId,
      engine: firstRun.engine ?? undefined,
      modelVersion: firstRun.modelVersion,
    },
    evidencePackId: pack.evidencePackId,
    evidenceChainId: pack.evidenceChainId,
    analysis: [
      { title: 'Ocena Evidence Pack', body: pack.hypothesisAssessment.message, kind: 'protocol-assessment' },
      { title: 'Reprodukowalność armów', body: `allArmsMatched=${pack.reproducibility.allArmsMatched}; drift=${pack.reproducibility.armsWithDrift.length}; notExecuted=${pack.reproducibility.armsNotExecuted.length}.`, kind: 'reproducibility' },
    ],
    honesty: 'simplified',
    honestyNote: pack.disclaimer,
    equations: [],
    assumptions,
    epistemicStatus: pack.hypothesisAssessment.assessment,
  });
}

/**
 * Utrwala przebieg Scenario Engine w istniejącej Pamięci Naukowej.
 *
 * Świadomie NIE zapisujemy serii dobowej jako źródła prawdy. `observations`
 * niosą krzywe wyłącznie do podglądu; po przeładowaniu świat 3D bierze serię
 * z ponownego przeliczenia (`replaySavedScenarioRun`), a nie z tego zapisu.
 * Dzięki temu podmieniona zawartość localStorage nie ma jak stać się światem.
 *
 * `params` to płaskie, jawne dźwignie przebiegu — wchodzą do `contentHash`,
 * więc zmiana którejkolwiek daje inny rekord, a nie cichą nadpiskę.
 */
export function saveScenarioRunToMemory(run: ScenarioRun, execution?: SavedExperimentExecution, preparedness?: { questionId: string; askedText: string; resolutionFingerprint: string }): SavedExperiment {
  const scenario = buildSavedScenarioRunContext(run, preparedness);
  const summary = run.summary!;
  const series = run.series;
  const observations: Record<string, ExperimentOutputValue> = {
    seriesInfectious: series.map((sample) => sample.infectious),
    seriesDeceased: series.map((sample) => sample.deceased),
    seriesRecovered: series.map((sample) => sample.recovered),
    seriesHospitalized: series.map((sample) => sample.hospitalized),
    seriesBedOccupancy: series.map((sample) => Number(sample.hospital.bedOccupancy.toFixed(6))),
  };
  return saveExperiment({
    labId: 'biology',
    experimentId: `scenario:${scenario.scenarioId}`,
    experimentName: `Scenario Engine — ${scenario.label}`,
    params: {
      scenarioId: scenario.scenarioId,
      days: scenario.days,
      stepsPerDay: scenario.stepsPerDay,
      interventionStartDay: scenario.interventionStartDay,
      nAgents: scenario.params.nAgents,
      initialInfected: scenario.params.initialInfected,
      seed: scenario.params.seed,
      r0: scenario.params.r0,
      restrictions: scenario.params.restrictions,
      mobility: scenario.params.mobility,
      isolate: scenario.params.isolate,
      closeSchools: scenario.params.closeSchools,
      transmissionScale: scenario.params.transmissionScale,
      householdTransmissionScale: scenario.params.householdTransmissionScale,
      severeRate: scenario.params.severeRate,
      ifr: scenario.params.ifr,
      totalBeds: scenario.hospitalCapacity.totalBeds,
      icuBeds: scenario.hospitalCapacity.icuBeds,
    },
    stats: {
      peakInfectious: summary.peakInfectious,
      peakInfectiousDay: summary.peakInfectiousDay,
      totalDeaths: summary.totalDeaths,
      attackRate: summary.attackRate,
      peakBedOccupancy: summary.peakBedOccupancy,
      peakIcuOccupancy: summary.peakIcuOccupancy,
      totalUnmetCareDays: summary.totalUnmetCareDays,
      totalTransmissions: summary.totalTransmissions,
      daysSimulated: series.length,
    },
    observations,
    scenario,
    ...(execution === undefined ? {} : { execution }),
    analysis: [
      { title: 'Przebieg scenariusza', body: `${scenario.label}: ${scenario.days} dni x ${scenario.stepsPerDay} krokow/dobe, interwencja od dnia ${scenario.interventionStartDay}. Szczyt zakazen ${summary.peakInfectious} w dniu ${summary.peakInfectiousDay}; zgony ${summary.totalDeaths}.`, kind: 'scenario-run' },
      { title: 'Jak dziala odtworzenie', body: 'Pamiec przechowuje wejscia i odciski, nie wynik. Ponowne otwarcie przelicza model od nowa i porownuje odciski: MATCH dopuszcza serie do swiata 3D, DRIFT i BLOCKED jej nie udostepniaja.', kind: 'scenario-replay-contract' },
      { title: 'Granice modelu', body: 'Model nie jest skalibrowany do zadnej rzeczywistej epidemii. To przebieg scenariuszowy (SIMULATION), nie prognoza i nie obserwacja.', kind: 'scenario-boundary' },
    ],
    honesty: 'simplified',
    honestyNote: `Scenario Engine ${scenario.engineVersion}; deterministyczny przy zadanym seedzie. Wynik nie jest skalibrowana prognoza.`,
    assumptions: [
      `Scenariusz "${scenario.label}" ze zdefiniowanej biblioteki scenariuszy.`,
      'Seria dobowa pochodzi z realnego przebiegu modelu, nie z osobnego timera.',
      'Profil kohortowy i pojemnosc szpitala sa czescia zapisanych wejsc.',
    ],
    epistemicStatus: 'SIMULATION',
  });
}

/**
 * Utrwala kontrfaktyk: oba ramiona i policzoną różnicę. Zapisane metryki nie
 * są odpowiedzią — przy odtworzeniu oba przebiegi liczone są od nowa, a różnica
 * przeliczana, więc podmieniona liczba w rekordzie kończy się DRIFT-em.
 */
export function saveScenarioCounterfactualToMemory(counterfactual: ScenarioCounterfactual, execution?: SavedExperimentExecution, preparedness?: { questionId: string; askedText: string; resolutionFingerprint: string }): SavedExperiment {
  const saved = buildSavedScenarioCounterfactual(counterfactual, preparedness);
  const metricStats: Record<string, number> = {};
  for (const metric of saved.metrics) {
    metricStats[`baseline_${metric.key}`] = metric.baseline;
    metricStats[`variant_${metric.key}`] = metric.variant;
    metricStats[`delta_${metric.key}`] = metric.absoluteDelta;
  }
  return saveExperiment({
    labId: 'biology',
    experimentId: `counterfactual:${saved.baseline.scenarioId}->${saved.variant.scenarioId}`,
    experimentName: `Kontrfaktyk — ${saved.baseline.label} (dzień ${saved.baseline.interventionStartDay}) vs ${saved.variant.label} (dzień ${saved.variant.interventionStartDay})`,
    params: {
      baselineScenarioId: saved.baseline.scenarioId,
      variantScenarioId: saved.variant.scenarioId,
      baselineInterventionStartDay: saved.baseline.interventionStartDay,
      variantInterventionStartDay: saved.variant.interventionStartDay,
      days: saved.baseline.days,
      stepsPerDay: saved.baseline.stepsPerDay,
      nAgents: saved.baseline.params.nAgents,
      initialInfected: saved.baseline.params.initialInfected,
      seed: saved.baseline.params.seed,
    },
    stats: { ...metricStats, firstDivergentDay: saved.firstDivergentDay ?? -1, daysSimulated: saved.baseline.seriesLength },
    counterfactual: saved,
    ...(execution === undefined ? {} : { execution }),
    analysis: [
      { title: 'Skad bierze sie roznica', body: `Dwa wykonane przebiegi o wspolnym ziarnie ${saved.baseline.params.seed}, populacji ${saved.baseline.params.nAgents} i horyzoncie ${saved.baseline.days} dni. Zmienione wymiary: parametry [${saved.changedParameters.join(', ') || 'brak'}], czas [${saved.changedTiming.join(', ') || 'brak'}], pojemnosc [${saved.changedCapacity.join(', ') || 'brak'}].`, kind: 'counterfactual-basis' },
      { title: 'Dzien rozjazdu', body: saved.firstDivergentDay === null ? 'Przebiegi epidemiczne nie rozeszly sie ani razu — roznica wyniku pochodzi wylacznie z warstwy szpitalnej.' : `Swiaty rozeszly sie po raz pierwszy w dniu ${saved.firstDivergentDay}. To pomiar na seriach obu przebiegow, nie dzien wejscia interwencji.`, kind: 'counterfactual-divergence' },
      { title: 'Granice modelu', body: 'Model nie jest skalibrowany do zadnej rzeczywistej epidemii. Roznica jest roznica dwoch symulacji (SIMULATION), nie zmierzonym efektem polityki w swiecie rzeczywistym.', kind: 'counterfactual-boundary' },
    ],
    honesty: 'simplified',
    honestyNote: `Kontrfaktyk na Scenario Engine; odcisk ${saved.counterfactualFingerprint}. Roznica dwoch symulacji, nie obserwacja.`,
    assumptions: [
      'Oba ramiona dziela warunki startowe; jedyne roznice to scenariusz i moment jego wejscia.',
      'Porownanie zostaloby zablokowane przy roznym ziarnie, populacji albo horyzoncie.',
    ],
    epistemicStatus: 'SIMULATION',
  });
}

/**
 * Utrwala prerejestrowaną pętlę hipotez w istniejącej Pamięci Naukowej.
 * Zapisujemy prerejestrację i statusy; przy odtworzeniu zbiór jest wykonywany
 * od nowa, a zapisane liczby są porównywane, nie odczytywane jako wynik.
 */
export function saveHypothesisLoopToMemory(result: HypothesisLoopResult): SavedExperiment {
  const loop = buildSavedHypothesisLoop(result);
  const supported = loop.outcomes.filter((entry) => entry.status === 'SUPPORTED').length;
  const falsified = loop.outcomes.filter((entry) => entry.status === 'FALSIFIED').length;
  return saveExperiment({
    labId: loop.problem.domainId,
    experimentId: `hypothesis-loop:${loop.problem.problemId}`,
    experimentName: `Pętla hipotez — ${loop.problem.statement}`,
    params: {
      problemId: loop.problem.problemId,
      modelId: loop.problem.modelId,
      primaryMetric: loop.problem.primaryMetric,
      candidateVariable: loop.problem.candidateVariable,
      hypotheses: loop.hypotheses.length,
      ...Object.fromEntries(Object.entries(loop.problem.sharedLevers)),
    },
    stats: {
      hypotheses: loop.hypotheses.length,
      supported,
      falsified,
      realRuns: result.allRuns.length,
      evidencePacks: result.packs.length,
    },
    hypothesisLoop: loop,
    analysis: [
      { title: 'Prerejestracja', body: `Zbiór ${loop.preregistrationId} zamrozono odciskiem ${loop.preregistrationFingerprint} PRZED wykonaniem. Kazda pozniejsza zmiana twierdzenia, przewidywania lub kryterium jest wykrywalna.`, kind: 'hypothesis-preregistration' },
      { title: 'Rozstrzygniecie', body: loop.discrimination.decisive ? `Uporzadkowanie ${loop.problem.primaryMetric}: ${loop.discrimination.ranking.map((entry) => `${entry.candidate}=${entry.metric}`).join(' < ')}. Zwyciezca: ${loop.discrimination.winnerHypothesisId}.` : 'Uporzadkowanie nie wylonilo zwyciezcy; zaden kandydat nie moze sie na nie powolac.', kind: 'hypothesis-discrimination' },
      { title: 'Granice', body: 'Genesis wygenerowal prerejestrowane hipotezy, wykonal istniejacy model obliczeniowy i porownal realne wyniki modelu w zadeklarowanym zakresie. To nie jest odkrycie naukowe, obserwacja swiata ani wskazowka operacyjna.', kind: 'hypothesis-boundary' },
    ],
    honesty: 'simplified',
    honestyNote: `Model ${loop.problem.modelId}; wynik SIMULATION, nieskalibrowany. ${supported} hipotez wspartych, ${falsified} sfalsyfikowanych w granicach protokolu.`,
    assumptions: [...loop.hypotheses[0]!.assumptions],
    epistemicStatus: 'SIMULATION',
  });
}

/**
 * Jeden ogniwo łańcucha dowodowego (Hipoteza -> Eksperyment -> Run ->
 * Obserwacja -> Analiza -> Znalezisko -> Dowód) w postaci nadającej się do
 * zapisu: nie kopiuje wszystkich obserwacji/znalezisk, tylko ich liczbę i
 * JEDEN reprezentatywny dowód (resultFingerprint + dzień) — wystarczający,
 * by wskazać palcem konkretny realny przebieg bez duplikowania Evidence Pack.
 */
export interface SavedDiscoveryEvidenceLink {
  hypothesisId: string;
  status: HypothesisStatus;
  evidenceChainId: string | null;
  evidencePackId: string | null;
  findingsCount: number;
  representativeFinding: { id: string; metric: string; resultFingerprint: string; day: number } | null;
  notModeled?: string;
}

export interface SavedNextExperiment {
  status: NextHypothesisExperiment['status'];
  why: string;
  resolves: string;
  rule: string;
  aboutHypothesisIds: readonly string[];
}

/**
 * Warstwa Obserwacja/Analiza/Dowód + Następny Eksperyment NAD prerejestrowaną
 * pętlą hipotez. `hypothesisLoopFingerprint` wiąże ją do DOKŁADNIE tej pętli
 * (`SavedHypothesisLoop.loopFingerprint`) — to nie jest niezależny zapis,
 * tylko rozszerzenie tego samego przebiegu o to, co zbudował
 * `scientificDiscoveryLoop.ts` NAD istniejącą pętlą (obserwacje/analiza z PR
 * Manusa + `selectNextHypothesisExperiment`).
 */
export interface SavedScientificDiscoveryLoop {
  contractVersion: string;
  problemId: string;
  statement: string;
  hypothesisLoopFingerprint: string;
  evidenceChain: readonly SavedDiscoveryEvidenceLink[];
  nextExperiment: SavedNextExperiment;
  /** Domain-agnostic Observation/Analysis over the whole run set — real for every domain, not only Scenario Engine timelines. See `scientificDiscoveryLoop.ts`. */
  crossHypothesisAnalysis: DiscoveryAnalysis;
  /** Odcisk TYLKO tej warstwy (dowody + następny eksperyment) — wykrywa dryf niezależnie od loopFingerprint. */
  discoveryLoopFingerprint: string;
}

function savedDiscoveryEvidenceLink(link: HypothesisEvidenceChainLink): SavedDiscoveryEvidenceLink {
  const first = link.findings[0];
  return {
    hypothesisId: link.hypothesisId,
    status: link.status,
    evidenceChainId: link.evidenceChainId,
    evidencePackId: link.evidencePackId,
    findingsCount: link.findings.length,
    representativeFinding: first === undefined ? null : {
      id: first.id, metric: first.metric, resultFingerprint: first.sourceSnapshot.resultFingerprint, day: first.sourceSnapshot.day,
    },
    ...(link.notModeled === undefined ? {} : { notModeled: link.notModeled }),
  };
}

function savedNextExperiment(next: NextHypothesisExperiment): SavedNextExperiment {
  return { status: next.status, why: next.why, resolves: next.resolves, rule: next.rule, aboutHypothesisIds: next.aboutHypothesisIds };
}

/**
 * Buduje zapisywalną postać `ScientificDiscoveryLoopResult`. Ponownie używa
 * `buildSavedHypothesisLoop` (dziedziczy jego walidację nienaruszonej
 * prerejestracji) wyłącznie po `loopFingerprint` — reszta pętli hipotez jest
 * już zapisana osobno w `hypothesisLoop`, więc tu nie jest duplikowana.
 */
export function buildSavedScientificDiscoveryLoop(result: ScientificDiscoveryLoopResult): SavedScientificDiscoveryLoop {
  const loop = buildSavedHypothesisLoop(result.loop);
  const base = {
    contractVersion: SCIENTIFIC_DISCOVERY_LOOP_VERSION,
    problemId: result.problem.problemId,
    statement: result.problem.statement,
    hypothesisLoopFingerprint: loop.loopFingerprint,
    evidenceChain: result.evidenceChain.map(savedDiscoveryEvidenceLink),
    nextExperiment: savedNextExperiment(result.nextExperiment),
    crossHypothesisAnalysis: result.crossHypothesisAnalysis,
  };
  return { ...base, discoveryLoopFingerprint: fnv1a(canonicalJson(base)) };
}

function isSavedDiscoveryEvidenceLink(value: unknown): value is SavedDiscoveryEvidenceLink {
  if (!isRecordLike(value)) return false;
  if (typeof value.hypothesisId !== 'string' || typeof value.status !== 'string') return false;
  if (typeof value.findingsCount !== 'number') return false;
  if (value.representativeFinding !== null) {
    if (!isRecordLike(value.representativeFinding)) return false;
    if (typeof value.representativeFinding.resultFingerprint !== 'string') return false;
    if (typeof value.representativeFinding.day !== 'number') return false;
  }
  return true;
}

/** localStorage jest edytowalne poza aplikacją — rekord walidujemy pole po polu. */
export function isSavedScientificDiscoveryLoop(value: unknown): value is SavedScientificDiscoveryLoop {
  if (!isRecordLike(value)) return false;
  if (typeof value.contractVersion !== 'string' || typeof value.problemId !== 'string') return false;
  if (typeof value.hypothesisLoopFingerprint !== 'string' || typeof value.discoveryLoopFingerprint !== 'string') return false;
  if (!Array.isArray(value.evidenceChain) || !value.evidenceChain.every(isSavedDiscoveryEvidenceLink)) return false;
  if (!isRecordLike(value.nextExperiment) || typeof value.nextExperiment.status !== 'string') return false;
  if (!isRecordLike(value.crossHypothesisAnalysis) || !Array.isArray(value.crossHypothesisAnalysis.findings)) return false;
  return true;
}

/**
 * Utrwala PEŁNĄ Pętlę Odkrycia Naukowego (Pytanie -> Konkurencyjne Hipotezy ->
 * Projekt Eksperymentu -> Wykonanie -> Obserwacja -> Analiza -> Falsyfikacja ->
 * Porównanie -> Następny Eksperyment) w istniejącej Pamięci Naukowej.
 * Ponownie używa `saveExperiment` i `buildSavedHypothesisLoop` — jedyna nowa
 * treść to warstwa Obserwacja/Analiza/Dowód + Następny Eksperyment, której
 * `saveHypothesisLoopToMemory` nie niosło.
 */
export function saveScientificDiscoveryLoopToMemory(result: ScientificDiscoveryLoopResult): SavedExperiment {
  const loop = buildSavedHypothesisLoop(result.loop);
  const discoveryLoop = buildSavedScientificDiscoveryLoop(result);
  const supported = loop.outcomes.filter((entry) => entry.status === 'SUPPORTED').length;
  const falsified = loop.outcomes.filter((entry) => entry.status === 'FALSIFIED').length;
  const totalFindings = discoveryLoop.evidenceChain.reduce((sum, link) => sum + link.findingsCount, 0);
  return saveExperiment({
    labId: loop.problem.domainId,
    experimentId: `discovery-loop:${loop.problem.problemId}`,
    experimentName: `Pętla odkrycia naukowego — ${loop.problem.statement}`,
    params: {
      problemId: loop.problem.problemId,
      modelId: loop.problem.modelId,
      primaryMetric: loop.problem.primaryMetric,
      candidateVariable: loop.problem.candidateVariable,
      hypotheses: loop.hypotheses.length,
      ...Object.fromEntries(Object.entries(loop.problem.sharedLevers)),
    },
    stats: {
      hypotheses: loop.hypotheses.length,
      supported,
      falsified,
      realRuns: result.loop.allRuns.length,
      evidencePacks: result.loop.packs.length,
      findings: totalFindings,
    },
    hypothesisLoop: loop,
    discoveryLoop,
    analysis: [
      { title: 'Prerejestracja', body: `Zbiór ${loop.preregistrationId} zamrozono odciskiem ${loop.preregistrationFingerprint} PRZED wykonaniem.`, kind: 'hypothesis-preregistration' },
      { title: 'Rozstrzygniecie', body: loop.discrimination.decisive ? `Uporzadkowanie ${loop.problem.primaryMetric}: ${loop.discrimination.ranking.map((entry) => `${entry.candidate}=${entry.metric}`).join(' < ')}. Zwyciezca: ${loop.discrimination.winnerHypothesisId}.` : 'Uporzadkowanie nie wylonilo zwyciezcy.', kind: 'hypothesis-discrimination' },
      { title: 'Dowod', body: `${totalFindings} znalezisk z ${discoveryLoop.evidenceChain.filter((link) => link.evidenceChainId !== null).length} wykonanych hipotez, kazde z realnym resultFingerprint i dniem.`, kind: 'discovery-evidence' },
      { title: 'Nastepny eksperyment', body: `${discoveryLoop.nextExperiment.status}: ${discoveryLoop.nextExperiment.why}`, kind: 'discovery-next-experiment' },
      { title: 'Granice', body: 'Genesis wygenerowal prerejestrowane hipotezy, wykonal istniejacy model obliczeniowy, powiazal realne obserwacje/analize i porownal wyniki w zadeklarowanym zakresie. To nie jest odkrycie naukowe, obserwacja swiata ani wskazowka operacyjna.', kind: 'hypothesis-boundary' },
    ],
    honesty: 'simplified',
    honestyNote: `Model ${loop.problem.modelId}; wynik SIMULATION, nieskalibrowany. ${supported} hipotez wspartych, ${falsified} sfalsyfikowanych, ${totalFindings} znalezisk dowodowych.`,
    assumptions: [...loop.hypotheses[0]!.assumptions],
    epistemicStatus: 'SIMULATION',
  });
}

export type SavedScientificDiscoveryLoopReplayStatus = 'MATCH' | 'DRIFT' | 'BLOCKED';

export interface SavedScientificDiscoveryLoopReplay {
  status: SavedScientificDiscoveryLoopReplayStatus;
  reason: string;
}

/**
 * Odtwarza zapisaną Pętlę Odkrycia Naukowego, WYKONUJĄC ją od nowa — ponownie
 * używa `replaySavedHypothesisLoopAsync` (realne przebiegi, nie odczyt
 * zapisanych statusów) i dopiero na jego realnym, świeżym wyniku ponownie
 * liczy `buildEvidenceChain`/`selectNextHypothesisExperiment` (te same
 * funkcje co `runScientificDiscoveryLoopAsync`), porównując świeży
 * `discoveryLoopFingerprint` z zapisanym.
 */
export async function replaySavedScientificDiscoveryLoop(saved: SavedExperiment): Promise<SavedScientificDiscoveryLoopReplay> {
  if (saved.hypothesisLoop === undefined || saved.discoveryLoop === undefined) {
    return { status: 'BLOCKED', reason: 'Zapis nie zawiera pętli hipotez i pętli odkrycia naukowego.' };
  }
  if (!isSavedScientificDiscoveryLoop(saved.discoveryLoop)) {
    return { status: 'BLOCKED', reason: 'Zapisana pętla odkrycia naukowego jest niekompletna albo uszkodzona.' };
  }
  // Samospójność NAJPIERW: czy zapisana treść wciąż odpowiada WŁASNEMU zapisanemu
  // odciskowi? To wykrywa podmianę pola (np. statusu następnego eksperymentu) PO
  // zapisie, zanim w ogóle dojdzie do realnego ponownego wykonania.
  const { discoveryLoopFingerprint, ...storedBase } = saved.discoveryLoop;
  if (fnv1a(canonicalJson(storedBase)) !== discoveryLoopFingerprint) {
    return { status: 'DRIFT', reason: 'Zapisana pętla odkrycia naukowego została zmieniona po zapisie: jej treść nie odpowiada już własnemu zapisanemu odciskowi.' };
  }
  if (saved.discoveryLoop.hypothesisLoopFingerprint !== saved.hypothesisLoop.loopFingerprint) {
    return { status: 'BLOCKED', reason: 'Pętla odkrycia naukowego wskazuje na inny loopFingerprint niż zapisana pętla hipotez.' };
  }
  const replayed = await replaySavedHypothesisLoopAsync(saved.hypothesisLoop);
  if (replayed.status !== 'MATCH' || replayed.result === null) {
    return { status: replayed.status, reason: replayed.reason };
  }
  const freshResult: ScientificDiscoveryLoopResult = {
    contractVersion: SCIENTIFIC_DISCOVERY_LOOP_VERSION,
    problem: saved.hypothesisLoop.problem,
    loop: replayed.result,
    evidenceChain: buildEvidenceChain(replayed.result),
    nextExperiment: selectNextHypothesisExperiment(replayed.result),
    crossHypothesisAnalysis: buildCrossHypothesisAnalysis(saved.hypothesisLoop.problem, replayed.result),
  };
  const fresh = buildSavedScientificDiscoveryLoop(freshResult);
  if (fresh.discoveryLoopFingerprint !== saved.discoveryLoop.discoveryLoopFingerprint) {
    return { status: 'DRIFT', reason: `Odtworzona warstwa dowodowa różni się od zapisanej (odcisk ${saved.discoveryLoop.discoveryLoopFingerprint} → ${fresh.discoveryLoopFingerprint}).` };
  }
  return { status: 'MATCH', reason: 'Pętla hipotez i warstwa Obserwacja/Analiza/Dowód/Następny Eksperyment odtworzyły się identycznie po realnym ponownym wykonaniu.' };
}

export const INVESTIGATION_CONTRACT_VERSION = '1.0.0';

/**
 * Jedna domena wewnątrz zapisanego dochodzenia wielodomenowego. Niesie
 * dokładnie to, co niósłby samodzielny `SavedHypothesisLoop` tej domeny
 * (żadna nowa ontologia) plus opcjonalne, dostarczone przez wywołującego
 * odniesienia (pytanie, odciski WorldState, status odtworzenia, listę
 * NOT_MODELED) — dokładnie te same pola co `DomainEvidenceEntry` w
 * `evidencePackRoCrate.ts`, bez duplikowania ich znaczenia.
 */
export interface SavedInvestigationDomain {
  domainId: string;
  question?: string;
  notModeled?: readonly string[];
  worldStateFingerprints?: readonly string[];
  replayStatus?: string;
  hypothesisLoop: SavedHypothesisLoop;
}

/**
 * JEDNA trwała pozycja obejmująca CAŁE dochodzenie wielodomenowe. `roCrate`
 * to dokładnie to, co zwraca istniejący `combineEvidencePackRoCrates`
 * (wołany raz, tu, z tych samych domen) — nie osobno zrekonstruowana kopia.
 * Odtworzenie każdej domeny idzie przez istniejący, niezmieniony
 * `replaySavedHypothesisLoopAsync`; ten plik nie dodaje drugiego silnika
 * odtwarzania.
 */
export interface SavedInvestigation {
  contractVersion: string;
  domains: readonly SavedInvestigationDomain[];
  roCrate: GenesisRoCrate;
  investigationFingerprint: string;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSavedInvestigationDomain(value: unknown): value is SavedInvestigationDomain {
  if (!isRecordLike(value)) return false;
  if (typeof value.domainId !== 'string' || value.domainId.length === 0) return false;
  if (value.question !== undefined && typeof value.question !== 'string') return false;
  if (value.notModeled !== undefined && !(Array.isArray(value.notModeled) && value.notModeled.every((entry) => typeof entry === 'string'))) return false;
  if (value.worldStateFingerprints !== undefined && !(Array.isArray(value.worldStateFingerprints) && value.worldStateFingerprints.every((entry) => typeof entry === 'string'))) return false;
  if (value.replayStatus !== undefined && typeof value.replayStatus !== 'string') return false;
  return isSavedHypothesisLoop(value.hypothesisLoop);
}

/** localStorage jest edytowalne poza aplikacją — rekord walidujemy pole po polu. */
export function isSavedInvestigation(value: unknown): value is SavedInvestigation {
  if (!isRecordLike(value)) return false;
  if (typeof value.contractVersion !== 'string' || typeof value.investigationFingerprint !== 'string') return false;
  if (!Array.isArray(value.domains) || value.domains.length === 0) return false;
  if (!value.domains.every(isSavedInvestigationDomain)) return false;
  const roCrate = value.roCrate as GenesisRoCrate | undefined;
  return isRecordLike(roCrate) && Array.isArray(roCrate['@context']) && Array.isArray(roCrate['@graph']);
}

export interface SavedInvestigationDomainInput {
  domainId: string;
  loopResult: HypothesisLoopResult;
  question?: string;
  notModeled?: readonly string[];
  worldStateFingerprints?: readonly string[];
  replayStatus?: string;
}

/**
 * Buduje `SavedInvestigation` z realnych, już wykonanych pętli hipotez —
 * po jednej na domenę. RO-Crate powstaje JEDNYM wołaniem istniejącego,
 * niezmienionego `combineEvidencePackRoCrates` (dokładnie tych samych
 * wejść), więc to, co trafia do Pamięci Naukowej, jest tym samym bytem,
 * który dochodzenie już wyeksportowało — nie osobno przeliczoną kopią.
 */
export function buildSavedInvestigation(domains: readonly SavedInvestigationDomainInput[]): SavedInvestigation {
  if (domains.length === 0) throw new Error('Dochodzenie wielodomenowe musi zawierać co najmniej jedną domenę.');
  const entries: DomainEvidenceEntry[] = domains.map((domain) => {
    const pack = domain.loopResult.packs[0];
    if (pack === undefined) throw new Error(`Domena ${domain.domainId} nie wyprodukowała żadnej paczki dowodowej — pętla hipotez musi zawierać co najmniej jeden realny przebieg.`);
    return {
      domainId: domain.domainId,
      pack,
      ...(domain.question === undefined ? {} : { question: domain.question }),
      ...(domain.worldStateFingerprints === undefined ? {} : { worldStateFingerprints: domain.worldStateFingerprints }),
      ...(domain.replayStatus === undefined ? {} : { replayStatus: domain.replayStatus }),
      ...(domain.notModeled === undefined ? {} : { notModeled: domain.notModeled }),
    };
  });
  const roCrate = combineEvidencePackRoCrates(entries);
  const savedDomains: SavedInvestigationDomain[] = domains.map((domain) => ({
    domainId: domain.domainId,
    ...(domain.question === undefined ? {} : { question: domain.question }),
    ...(domain.notModeled === undefined ? {} : { notModeled: domain.notModeled }),
    ...(domain.worldStateFingerprints === undefined ? {} : { worldStateFingerprints: domain.worldStateFingerprints }),
    ...(domain.replayStatus === undefined ? {} : { replayStatus: domain.replayStatus }),
    hypothesisLoop: buildSavedHypothesisLoop(domain.loopResult),
  }));
  const base = { contractVersion: INVESTIGATION_CONTRACT_VERSION, domains: savedDomains, roCrate };
  return { ...base, investigationFingerprint: fnv1a(canonicalJson(base)) };
}

/**
 * Utrwala CAŁE dochodzenie wielodomenowe jako JEDEN rekord w istniejącej
 * Pamięci Naukowej — dokładnie ten sam mechanizm zapisu co
 * `saveHypothesisLoopToMemory`, tylko na poziomie całego dochodzenia.
 */
export function saveInvestigationToMemory(domains: readonly SavedInvestigationDomainInput[], investigationName?: string): SavedExperiment {
  const investigation = buildSavedInvestigation(domains);
  const domainIds = investigation.domains.map((domain) => domain.domainId);
  return saveExperiment({
    labId: 'cross-domain-investigation',
    experimentId: `investigation:${investigation.investigationFingerprint}`,
    experimentName: investigationName ?? `Dochodzenie wielodomenowe — ${domainIds.join(' + ')}`,
    params: { domains: domainIds.join(','), domainCount: domainIds.length },
    stats: {
      domainCount: domainIds.length,
      totalHypotheses: investigation.domains.reduce((sum, domain) => sum + domain.hypothesisLoop.hypotheses.length, 0),
    },
    investigation,
    analysis: [
      { title: 'Domeny', body: `Jedno dochodzenie obejmuje ${domainIds.length} niezależnie wykonanych domen: ${domainIds.join(', ')}. Każda niesie własną prerejestrację, własne realne przebiegi i własny odcisk pętli.`, kind: 'investigation-domains' },
      { title: 'Granice', body: 'RO-Crate zapisany tu jest tym samym bytem, który wyeksportował istniejący combineEvidencePackRoCrates — Pamięć Naukowa go przechowuje, nie przelicza od nowa.', kind: 'investigation-boundary' },
    ],
    honesty: 'simplified',
    honestyNote: `Dochodzenie wielodomenowe (${domainIds.join(' + ')}); odcisk ${investigation.investigationFingerprint}. Każda domena to osobny, realny wynik obliczeniowy — nie jest to jedno zunifikowane odkrycie.`,
    assumptions: ['Każda domena zachowuje własne założenia zapisane w swojej pętli hipotez; to pole je nie scala.'],
    epistemicStatus: 'SIMULATION',
  });
}

export interface SavedInvestigationReplay {
  status: HypothesisLoopReplayStatus;
  domains: readonly { domainId: string; replay: HypothesisLoopReplay }[];
}

/**
 * Odtwarza CAŁE dochodzenie wielodomenowe: dla każdej domeny WYKONUJE od
 * nowa jej prerejestrowany zbiór przez istniejący, niezmieniony
 * `replaySavedHypothesisLoopAsync` (wspiera modele lokalne i
 * BACKEND_REAL_ENGINE) i zestawia statusy. Całość jest MATCH tylko, gdy
 * KAŻDA domena jest MATCH; jedna zablokowana domena blokuje całość, jedna
 * rozjechana — rozjeżdża całość. Żaden status nie jest tu liczony od nowa
 * inną logiką niż już istniejąca.
 */
export async function replaySavedInvestigation(saved: SavedInvestigation): Promise<SavedInvestigationReplay> {
  const domainReplays = await Promise.all(saved.domains.map(async (domain) => ({
    domainId: domain.domainId,
    replay: await replaySavedHypothesisLoopAsync(domain.hypothesisLoop),
  })));
  const status: HypothesisLoopReplayStatus = domainReplays.some((entry) => entry.replay.status === 'BLOCKED')
    ? 'BLOCKED'
    : domainReplays.some((entry) => entry.replay.status === 'DRIFT') ? 'DRIFT' : 'MATCH';
  return { status, domains: domainReplays };
}


// ---------------------------------------------------------------------------
// World-model discovery (Autonomous Discovery Loop / Cross-Action Comparison)
// ---------------------------------------------------------------------------

/**
 * Closes the loop the world-model discovery engine did not have: HYPOTHESIS
 * -> EXPERIMENT -> RESULT -> DECISION -> memory -> EVIDENCE BUNDLE -> REPLAY
 * -> next experiment. Nothing here re-executes physics or re-derives a
 * verdict; every field is read from a `DiscoveryLoopResult` or
 * `CrossActionComparison` that already ran, or from an evidence bundle that
 * `buildWorldEvidenceBundle` already assembled. The one thing genuinely new
 * is persistence and the "read prior runs before acting" behaviour — see
 * `core/agent/worldDiscoveryMemory.ts`, the orchestrator that calls this.
 *
 * `resultKind` distinguishes the loop's two real outcomes (testing ONE
 * mechanism vs. RANKING several) rather than collapsing them into one shape:
 * a caller reading this record needs to know which question was actually
 * asked. Exactly one of `loopResult`/`comparisonResult` is ever present.
 */
export const WORLD_DISCOVERY_MEMORY_CONTRACT_VERSION = '1.0.0';

export type WorldDiscoveryResultKind = 'HYPOTHESIS_LOOP' | 'ACTION_COMPARISON';

/**
 * The Evidence Bundle this run produced, identified rather than embedded
 * whole: the full RO-Crate is large and already serialisable on its own
 * (`serializeWorldEvidenceBundleRoCrate`), so Science Memory keeps the
 * fingerprint and replay verdict that make the bundle's identity checkable,
 * not a second copy of its contents.
 */
export interface SavedWorldDiscoveryEvidence {
  bundleId: string;
  scientificContentFingerprint: string;
  replayVerdict: ReplayVerdict;
  replayMessage: string;
}

/**
 * What memory changed about THIS run, stated plainly rather than left
 * implicit. Null means memory had nothing to contribute (first run for this
 * catalog, or nothing was previously refuted) — a real, common, honest case.
 */
export interface SavedWorldDiscoveryMemoryUse {
  skippedHypothesisIds: readonly string[];
  reason: string;
}

export interface SavedWorldDiscoveryRun {
  contractVersion: string;
  resultKind: WorldDiscoveryResultKind;
  goal: string;
  catalogId: string;
  worldId: string;
  domainId: string;
  objectiveMetric: string | null;
  objectiveDirection: 'minimize' | 'maximize' | null;
  loopResult?: DiscoveryLoopResult;
  comparisonResult?: CrossActionComparison;
  evidence: SavedWorldDiscoveryEvidence | null;
  resumedFromMemory: SavedWorldDiscoveryMemoryUse | null;
  /** Content fingerprint of `loopResult`/`comparisonResult` — see `discoveryResultFingerprint`/`crossActionResultFingerprint`. */
  resultFingerprint: string;
}

export interface BuildSavedWorldDiscoveryRunInput {
  resultKind: WorldDiscoveryResultKind;
  goal: string;
  catalogId: string;
  worldId: string;
  domainId: string;
  objectiveMetric: string | null;
  objectiveDirection: 'minimize' | 'maximize' | null;
  loopResult?: DiscoveryLoopResult;
  comparisonResult?: CrossActionComparison;
  evidence: SavedWorldDiscoveryEvidence | null;
  resumedFromMemory: SavedWorldDiscoveryMemoryUse | null;
}

export function buildSavedWorldDiscoveryRun(input: BuildSavedWorldDiscoveryRunInput): SavedWorldDiscoveryRun {
  if (input.resultKind === 'HYPOTHESIS_LOOP' && input.loopResult === undefined) {
    throw new Error('HYPOTHESIS_LOOP musi nieść loopResult.');
  }
  if (input.resultKind === 'ACTION_COMPARISON' && input.comparisonResult === undefined) {
    throw new Error('ACTION_COMPARISON musi nieść comparisonResult.');
  }
  const resultFingerprint = input.resultKind === 'HYPOTHESIS_LOOP'
    ? discoveryResultFingerprint(input.loopResult!)
    : crossActionResultFingerprint(input.comparisonResult!);
  return { contractVersion: WORLD_DISCOVERY_MEMORY_CONTRACT_VERSION, ...input, resultFingerprint };
}

/** localStorage jest edytowalne poza aplikacją — rekord walidujemy pole po polu. */
export function isSavedWorldDiscoveryRun(value: unknown): value is SavedWorldDiscoveryRun {
  if (!isRecordLike(value)) return false;
  if (typeof value.contractVersion !== 'string') return false;
  if (value.resultKind !== 'HYPOTHESIS_LOOP' && value.resultKind !== 'ACTION_COMPARISON') return false;
  if (!nonEmptyString(value.goal) || !nonEmptyString(value.catalogId)) return false;
  if (!nonEmptyString(value.worldId) || !nonEmptyString(value.domainId)) return false;
  if (!nonEmptyString(value.resultFingerprint)) return false;
  if (value.resultKind === 'HYPOTHESIS_LOOP' && !isRecordLike(value.loopResult)) return false;
  if (value.resultKind === 'ACTION_COMPARISON' && !isRecordLike(value.comparisonResult)) return false;
  return true;
}

function lastRound(loopResult: DiscoveryLoopResult): DiscoveryLoopResult['rounds'][number] | undefined {
  return loopResult.rounds[loopResult.rounds.length - 1];
}

/**
 * The eight things the brief asked Genesis to remember about an experiment,
 * built from fields the engine already computed — nothing here re-derives a
 * verdict or invents a next step; the "next experiment" text for a
 * HYPOTHESIS_LOOP run is literally the dispatcher's own `nextAction` from the
 * last executed round, read verbatim.
 */
function worldDiscoveryAnalysis(saved: SavedWorldDiscoveryRun): SavedExperimentAnalysisBlock[] {
  if (saved.resultKind === 'HYPOTHESIS_LOOP') {
    const loop = saved.loopResult!;
    const decided = loop.beliefs.filter((b) => b.status === 'SUPPORTED' || b.status === 'REFUTED');
    const final = lastRound(loop);
    return [
      { title: 'Pytanie', body: loop.question, kind: 'world-discovery-question' },
      { title: 'Hipotezy testowane', body: loop.beliefs.map((b) => `${b.hypothesisId}: ${b.status} (${b.confidence})`).join('; ') || 'Żadna hipoteza nie została jeszcze wykonana.', kind: 'world-discovery-hypotheses' },
      { title: 'Model / świat', body: `worldId=${saved.worldId} domainId=${saved.domainId} catalogId=${saved.catalogId}; ${loop.rounds.length} realnych eksperymentów (fork + advance) wykonanych.`, kind: 'world-discovery-model' },
      { title: 'Dlaczego wsparta lub odrzucona', body: decided.length > 0 ? decided.map((b) => `${b.hypothesisId}: ${b.reason}`).join(' | ') : 'Żadna hipoteza nie została jeszcze rozstrzygnięta.', kind: 'world-discovery-reasons' },
      { title: 'Czego jeszcze nie wiemy', body: loop.unresolvedQuestions.join(' | ') || 'Brak nierozwiązanych pytań w tym przebiegu.', kind: 'world-discovery-unresolved' },
      { title: 'Następny eksperyment', body: final ? `${final.nextAction.selectorId}: ${final.nextAction.action} — ${final.nextAction.why}` : 'Żaden eksperyment jeszcze się nie wykonał.', kind: 'world-discovery-next' },
      ...(saved.resumedFromMemory ? [{ title: 'Wykorzystanie pamięci', body: saved.resumedFromMemory.reason, kind: 'world-discovery-memory' }] : []),
    ];
  }
  const comparison = saved.comparisonResult!;
  const ranked = comparison.status === 'RANKED' || comparison.status === 'TIED';
  const notComparable = comparison.candidates.filter((c) => c.availability !== 'AVAILABLE');
  return [
    { title: 'Pytanie', body: comparison.goal, kind: 'world-discovery-question' },
    { title: 'Akcje porównane', body: comparison.candidates.map((c) => `${c.actionId}[${c.availability}]`).join('; '), kind: 'world-discovery-hypotheses' },
    { title: 'Model / świat', body: `worldId=${saved.worldId} domainId=${saved.domainId} catalogId=${saved.catalogId}; status=${comparison.status}.`, kind: 'world-discovery-model' },
    { title: 'Dlaczego wsparta lub odrzucona', body: ranked ? comparison.ranking.map((r) => `${r.actionId}: ${r.explanation}`).join(' | ') : (comparison.refusalReason ?? 'Brak.'), kind: 'world-discovery-reasons' },
    { title: 'Czego jeszcze nie wiemy', body: [...comparison.notModelledFactors, ...notComparable.map((c) => `${c.actionId}: ${c.reason}`)].join(' | ') || 'Brak.', kind: 'world-discovery-unresolved' },
    {
      title: 'Następny eksperyment',
      body: ranked
        ? `To porównanie nie proponuje własnego następnego eksperymentu. Aby wzmocnić dowód na "${comparison.bestActionIds.join(', ')}", uruchom pojedynczą pętlę hipotez (Autonomous Discovery Loop) na tym mechanizmie przy innej sile interwencji.`
        : `Porównanie nie zostało rozstrzygnięte (${comparison.status}): ${comparison.refusalReason ?? 'brak przyczyny.'}`,
      kind: 'world-discovery-next',
    },
  ];
}

/**
 * Builds the Evidence Bundle for a hypothesis-loop run, from the LIVE engines
 * `runAutonomousDiscoveryWithEngines` produced — no re-execution here. The
 * bundle's own replay verdict is made REAL (not NOT_VERIFIED) by handing it
 * an independently rebuilt baseline as `verifyEngine`, which is exactly what
 * `buildWorldEvidenceBundle`/`computeReplayVerdict` already know how to do
 * with — this module invents no second replay mechanism.
 *
 * The intervention arm shown is the LAST executed round: the most decisive
 * one this run produced (either it triggered consolidation, or the loop ran
 * out of budget on it). A documented, deterministic choice, not a search for
 * "the best" round.
 */
export function buildWorldDiscoveryEvidenceBundle(
  catalog: WorldLeverCatalog,
  execution: DiscoveryLoopExecution,
  goal: string,
): WorldEvidenceBundle {
  const { result, registry, baseline, lastArm } = execution;
  const baselineWorldState = projectToWorldState(baseline.graph, catalog.worldId, catalog.domainId, baseline.tick, baseline.journal.upToTick(baseline.tick));
  const final = lastRound(result);
  const intervention = lastArm && final
    ? {
        engine: lastArm,
        worldState: projectToWorldState(lastArm.graph, catalog.worldId, catalog.domainId, lastArm.tick, lastArm.journal.upToTick(lastArm.tick)),
        description: `${final.hypothesisId} at strength ${final.strength}`,
      }
    : undefined;
  const comparison = lastArm ? compareBranches(registry, baseline.branchId, lastArm.branchId, baseline.tick) : undefined;
  const verifyEngine = buildIndependentBaseline(catalog);
  return buildWorldEvidenceBundle({
    bundleId: `world-discovery:${catalog.catalogId}:${discoveryResultFingerprint(result)}`,
    question: goal,
    worldId: catalog.worldId,
    domainId: catalog.domainId,
    baseline: { engine: baseline, worldState: baselineWorldState },
    intervention,
    comparison,
    verifyEngine,
    assessment: final?.assessment,
    limitations: [...catalog.declaredAssumptions, ...catalog.notModelledFactors],
    seed: null,
  });
}

/** An independently rebuilt, freshly advanced baseline — the real rebuild `computeReplayVerdict` compares against. */
function buildIndependentBaseline(catalog: WorldLeverCatalog): TemporalEngine {
  const world = catalog.buildWorld();
  const engine = new TemporalEngine(world.graph, { registry: new TemporalBranchRegistry(), label: 'verify' });
  for (let i = 0; i < catalog.horizonTick; i++) engine.advance(catalog.dt, world.updater);
  return engine;
}

/**
 * Builds the Evidence Bundle for a cross-action comparison. Unlike the loop
 * path, `compareWorldActions` does not expose its live engines (ranking stays
 * `evaluateDecision`'s alone), so the winning arm is rebuilt here — a second,
 * independent fork of the SAME declared lever at the SAME strength
 * `compareWorldActions` used, which is a deterministic replay of one arm, not
 * a second ranking mechanism. When the comparison has no single winner (a
 * tie, a refusal, or "do nothing" itself won), the bundle carries the control
 * alone rather than guessing which action to feature.
 */
export function buildActionComparisonEvidenceBundle(
  catalog: WorldLeverCatalog,
  comparison: CrossActionComparison,
  goal: string,
): WorldEvidenceBundle {
  const world = catalog.buildWorld();
  const registry = new TemporalBranchRegistry();
  const baseline = new TemporalEngine(world.graph, { registry, label: 'baseline' });
  for (let i = 0; i < catalog.horizonTick; i++) baseline.advance(catalog.dt, world.updater);
  const baselineWorldState = projectToWorldState(baseline.graph, catalog.worldId, catalog.domainId, baseline.tick, baseline.journal.upToTick(baseline.tick));

  const rankable = comparison.status === 'RANKED' || comparison.status === 'TIED';
  const soleWinnerId = rankable && comparison.bestActionIds.length === 1 ? comparison.bestActionIds[0] : null;
  const winningLever = soleWinnerId ? catalog.levers.find((lever) => lever.leverId === soleWinnerId) : undefined;

  let intervention: { engine: TemporalEngine; worldState: ReturnType<typeof projectToWorldState>; description: string } | undefined;
  let branchComparison: ReturnType<typeof compareBranches> | undefined;
  if (winningLever && comparison.objective) {
    const hypothesis = winningLever.hypothesis(comparison.objective.metric, comparison.objective.direction);
    const arm = baseline.forkBranch(catalog.decisionAtTick, `${winningLever.leverId}@1`, (graph) => hypothesis.apply(graph, 1));
    for (let tick = catalog.decisionAtTick; tick < catalog.horizonTick; tick++) arm.advance(catalog.dt, world.updater);
    intervention = {
      engine: arm,
      worldState: projectToWorldState(arm.graph, catalog.worldId, catalog.domainId, arm.tick, arm.journal.upToTick(arm.tick)),
      description: hypothesis.mechanism,
    };
    branchComparison = compareBranches(registry, baseline.branchId, arm.branchId, catalog.horizonTick);
  }

  return buildWorldEvidenceBundle({
    bundleId: `action-comparison:${catalog.catalogId}:${crossActionResultFingerprint(comparison)}`,
    question: goal,
    worldId: catalog.worldId,
    domainId: catalog.domainId,
    baseline: { engine: baseline, worldState: baselineWorldState },
    intervention,
    comparison: branchComparison,
    verifyEngine: buildIndependentBaseline(catalog),
    decision: comparison.decision ?? undefined,
    limitations: [...catalog.declaredAssumptions, ...catalog.notModelledFactors],
    seed: null,
  });
}

/**
 * Persists a REAL executed run of the world-model discovery engine — either
 * the single-hypothesis loop or the cross-action comparison — as one Science
 * Memory record, using `saveExperiment` unchanged.
 */
export function saveWorldDiscoveryRunToMemory(saved: SavedWorldDiscoveryRun): SavedExperiment {
  const stats: Record<string, number> = saved.resultKind === 'HYPOTHESIS_LOOP'
    ? {
        rounds: saved.loopResult!.rounds.length,
        supported: saved.loopResult!.bestSupported.length,
        refuted: saved.loopResult!.failedHypotheses.length,
        unresolved: saved.loopResult!.unresolvedQuestions.length,
      }
    : {
        actionsCompared: saved.comparisonResult!.ranking.length,
        candidatesNotModelled: saved.comparisonResult!.candidates.filter((c) => c.availability === 'NOT_MODELLED').length,
        bestActionCount: saved.comparisonResult!.bestActionIds.length,
      };
  return saveExperiment({
    labId: saved.worldId,
    experimentId: `world-discovery:${saved.catalogId}:${saved.resultKind}:${saved.resultFingerprint}`,
    experimentName: saved.resultKind === 'HYPOTHESIS_LOOP' ? `Autonomiczne odkrycie — ${saved.loopResult!.question}` : `Porównanie akcji — ${saved.comparisonResult!.goal}`,
    params: {
      catalogId: saved.catalogId,
      resultKind: saved.resultKind,
      objectiveMetric: saved.objectiveMetric ?? '',
      objectiveDirection: saved.objectiveDirection ?? '',
    },
    stats,
    worldDiscovery: saved,
    ...(saved.evidence ? { evidencePackId: saved.evidence.bundleId } : {}),
    analysis: worldDiscoveryAnalysis(saved),
    honesty: 'simplified',
    honestyNote: saved.resultKind === 'HYPOTHESIS_LOOP'
      ? `${saved.loopResult!.rounds.length} realnych eksperymentów na world-model; werdykty są wewnątrz-modelowe (patrz disclaimer w każdej ocenie), nie odkryciem o świecie.`
      : `Porównanie ${saved.comparisonResult!.candidates.length} zadeklarowanych akcji względem wspólnej kontroli; to nie jest rekomendacja.`,
    assumptions: saved.resultKind === 'HYPOTHESIS_LOOP' ? [...saved.loopResult!.declaredAssumptions] : [...saved.comparisonResult!.declaredAssumptions],
    epistemicStatus: 'SIMULATION',
  });
}

export interface SavedWorldDiscoveryReplay {
  status: ReplayVerdict;
  reason: string;
}

/**
 * Replays a saved world-discovery run by RE-EXECUTING it from its stored
 * inputs (goal + catalogId, looked up via `resolveWorldLeverCatalog`), never
 * by reading the stored numbers back — the same discipline as every other
 * replay in this file. Two things are re-verified independently:
 *
 *   1. The result itself: same goal, same catalog (and, for a hypothesis
 *      loop, the SAME memory-driven exclusion that actually ran — replaying
 *      what memory currently suggests would compare against a moving target)
 *      must reproduce the same `resultFingerprint`.
 *   2. The Evidence Bundle: rebuilt fresh from the replayed run and compared
 *      by `scientificContentFingerprint` to the one recorded at save time.
 *
 * A catalog Genesis no longer declares is NOT_REPRODUCIBLE, matching this
 * codebase's existing vocabulary for "we have nothing to re-execute against"
 * rather than inventing a fourth synonym for the same idea.
 */
export function replaySavedWorldDiscoveryRun(saved: SavedExperiment): SavedWorldDiscoveryReplay {
  const record = saved.worldDiscovery;
  if (record === undefined || !isSavedWorldDiscoveryRun(record)) {
    return { status: 'BLOCKED', reason: 'Zapis nie zawiera przebiegu odkrycia world-model.' };
  }
  // Self-consistency FIRST: does the stored payload still match its OWN stored
  // fingerprint? This catches a field edited after save (`loopResult`/
  // `comparisonResult` tampered without recomputing `resultFingerprint`)
  // before any re-execution is even attempted — the same defensive order
  // `replaySavedScientificDiscoveryLoop` already uses in this file.
  const selfCheckFingerprint = record.resultKind === 'HYPOTHESIS_LOOP'
    ? discoveryResultFingerprint(record.loopResult!)
    : crossActionResultFingerprint(record.comparisonResult!);
  if (selfCheckFingerprint !== record.resultFingerprint) {
    return { status: 'DRIFT', reason: `Zapisany przebieg został zmieniony po zapisie: jego treść nie odpowiada już własnemu zapisanemu odciskowi (${record.resultFingerprint} → ${selfCheckFingerprint}).` };
  }
  const catalog = resolveWorldLeverCatalog(record.catalogId);
  if (!catalog) {
    return { status: 'NOT_REPRODUCIBLE', reason: `Katalog "${record.catalogId}" nie jest już zadeklarowany w Genesis.` };
  }

  if (record.resultKind === 'ACTION_COMPARISON') {
    const fresh = compareWorldActions({ goal: record.goal, catalog });
    const freshFingerprint = crossActionResultFingerprint(fresh);
    if (freshFingerprint !== record.resultFingerprint) {
      return { status: 'DRIFT', reason: `Odtworzone porównanie różni się od zapisanego (${record.resultFingerprint} → ${freshFingerprint}).` };
    }
    if (record.evidence) {
      const freshBundle = buildActionComparisonEvidenceBundle(catalog, fresh, record.goal);
      if (freshBundle.scientificContentFingerprint !== record.evidence.scientificContentFingerprint) {
        return { status: 'DRIFT', reason: 'Porównanie odtworzyło się identycznie, ale Evidence Bundle zbudowany od nowa różni się od zapisanego.' };
      }
    }
    return { status: 'MATCH', reason: 'Porównanie akcji odtworzyło się identycznie po realnym ponownym wykonaniu.' };
  }

  const intent = parseWorldDiscoveryGoal(record.goal, catalog);
  const plan = buildWorldDiscoveryPlan(intent, catalog);
  if ('error' in plan) {
    return { status: 'BLOCKED', reason: `Cel przestał być czytelny dla tego katalogu: ${plan.error}` };
  }
  // Re-apply the SAME memory exclusion that actually ran, not whatever memory
  // would suggest today — replaying today's memory state would compare this
  // record against a moving target instead of verifying what it recorded.
  const excluded = new Set(record.resumedFromMemory?.skippedHypothesisIds ?? []);
  const filteredHypotheses = excluded.size === 0
    ? plan.hypotheses
    : plan.hypotheses.filter((h) => !excluded.has(h.hypothesisId));
  const rerunInput: DiscoveryLoopInput = {
    ...plan,
    hypotheses: filteredHypotheses.length > 0 ? filteredHypotheses : plan.hypotheses,
  };
  const execution = runAutonomousDiscoveryWithEngines(rerunInput);
  const freshFingerprint = discoveryResultFingerprint(execution.result);
  if (freshFingerprint !== record.resultFingerprint) {
    return { status: 'DRIFT', reason: `Odtworzony przebieg różni się od zapisanego (${record.resultFingerprint} → ${freshFingerprint}).` };
  }
  if (record.evidence) {
    const bundle = buildWorldDiscoveryEvidenceBundle(catalog, execution, record.goal);
    if (bundle.scientificContentFingerprint !== record.evidence.scientificContentFingerprint) {
      return { status: 'DRIFT', reason: 'Pętla odkrycia odtworzyła się identycznie, ale Evidence Bundle zbudowany od nowa różni się od zapisanego.' };
    }
  }
  return { status: 'MATCH', reason: 'Pętla odkrycia odtworzyła się identycznie po realnym ponownym wykonaniu.' };
}

// ---------------------------------------------------------------------------
// Autonomous parameter inquiry (`core/agent/inquiryLoop.ts`).
// ---------------------------------------------------------------------------

export const PARAMETER_INQUIRY_MEMORY_CONTRACT_VERSION = '1.0.0';

/**
 * What memory contributed to THIS inquiry, stated plainly. Null means memory
 * had nothing to offer — the first inquiry into this system, or no earlier
 * inquiry falsified anything — which is a real and common case, not a failure.
 */
/**
 * The evidence behind ONE skip, recovered from the stored inquiry that produced
 * it rather than restated.
 *
 * Memory has always held this — a `SavedParameterInquiry` carries the whole
 * `InquiryLoopResult`, so every round's observation and every hypothesis's own
 * prediction and reason are in the record. Nothing read them. The narrowing
 * step took `falsifiedHypothesisIds` and dropped the rest, which made memory a
 * list of names when it was already a body of evidence.
 *
 * Carrying the grounds is what lets a later reader ask the question that
 * matters — "was it refuted because it genuinely disagreed, and by how much?"
 * — without re-running anything, and it is the minimum a context-aware reuse
 * would need.
 */
export interface ParameterSkipGrounds {
  hypothesisId: string;
  /** The setting the refuting measurement was taken at. */
  probeValue: number;
  /** What this hypothesis's own claimed values predicted there, through the same solver. */
  predicted: number | null;
  /** What the system actually measured there. */
  observed: number | null;
  /** The loop's own sentence for the verdict, verbatim. */
  reason: string;
}

export interface SavedParameterInquiryMemoryUse {
  /** Hypotheses an EARLIER inquiry into the same system already falsified. */
  skippedHypothesisIds: readonly string[];
  reason: string;
  /**
   * Why each skipped hypothesis was refuted, from the stored inquiry itself.
   * Optional because records written before this existed do not have it — an
   * absent field is "this record predates the grounds", never "there were none".
   */
  grounds?: readonly ParameterSkipGrounds[];
}

/**
 * One executed inquiry. Carries the complete INPUT (system, hypotheses,
 * opening probe, round budget) so replay can re-execute it, plus the result
 * and its content fingerprint so replay can check that the re-execution
 * agrees. The stored numbers are never read back as an answer.
 */
export interface SavedParameterInquiry {
  contractVersion: string;
  /** Everything needed to run the inquiry again, verbatim. */
  input: InquiryLoopInput;
  result: InquiryLoopResult;
  resumedFromMemory: SavedParameterInquiryMemoryUse | null;
  resultFingerprint: string;
}

/**
 * The identity of the SYSTEM an inquiry was about, independent of which
 * hypotheses happened to be offered. Two inquiries share a key exactly when a
 * hypothesis falsified in one is genuinely falsified in the other: same
 * sample, same solver, same measured quantity, same agreement band, same probe
 * axis. Change any of those and an earlier falsification no longer transfers,
 * so the key changes and memory correctly declines to carry it over.
 */
export function parameterInquirySystemKey(system: InquiryLoopInput['system']): string {
  return `inquiry-system_${fnv1a(canonicalJson({
    systemId: system.systemId,
    modelId: system.modelId,
    probeParameterId: system.probeParameterId,
    observedMetric: system.observedMetric,
    agreementTolerance: system.agreementTolerance,
    fixedParameters: system.fixedParameters,
    hiddenParameters: system.hiddenParameters,
  }))}`;
}

export interface BuildSavedParameterInquiryInput {
  input: InquiryLoopInput;
  result: InquiryLoopResult;
  resumedFromMemory: SavedParameterInquiryMemoryUse | null;
}

export function buildSavedParameterInquiry(build: BuildSavedParameterInquiryInput): SavedParameterInquiry {
  if (build.input.system.systemId !== build.result.systemId) {
    throw new Error('Zapis dochodzenia musi dotyczyć tego samego systemu, który został zbadany.');
  }
  return {
    contractVersion: PARAMETER_INQUIRY_MEMORY_CONTRACT_VERSION,
    input: build.input,
    result: build.result,
    resumedFromMemory: build.resumedFromMemory,
    resultFingerprint: inquiryResultFingerprint(build.result),
  };
}

/** localStorage jest edytowalne poza aplikacją — rekord walidujemy pole po polu. */
export function isSavedParameterInquiry(value: unknown): value is SavedParameterInquiry {
  if (!isRecordLike(value)) return false;
  if (typeof value.contractVersion !== 'string') return false;
  if (!nonEmptyString(value.resultFingerprint)) return false;
  if (!isRecordLike(value.input) || !isRecordLike(value.result)) return false;
  const input = value.input as unknown as InquiryLoopInput;
  if (!nonEmptyString(input.question) || !isRecordLike(input.system)) return false;
  if (!nonEmptyString(input.system.systemId) || !nonEmptyString(input.system.modelId)) return false;
  if (!Array.isArray(input.hypotheses) || input.hypotheses.length === 0) return false;
  if (typeof input.openingProbeValue !== 'number' || typeof input.maxRounds !== 'number') return false;
  return true;
}

/**
 * The eight things the brief asked Genesis to remember, every one of them read
 * from a field the loop already computed. Nothing here re-derives a verdict,
 * and the "next experiment" block is the loop's own `nextExperiment`, verbatim.
 */
function parameterInquiryAnalysis(saved: SavedParameterInquiry): SavedExperimentAnalysisBlock[] {
  const { input, result } = saved;
  const decided = result.rounds.flatMap((round) => round.outcomes.filter((o) => o.assessment !== 'INCONCLUSIVE'));
  const lastRoundRun = result.rounds[result.rounds.length - 1];
  return [
    { title: 'Pytanie', body: result.question, kind: 'parameter-inquiry-question' },
    {
      title: 'Hipotezy testowane',
      body: input.hypotheses.map((h) => `${h.hypothesisId}: ${h.statement}`).join('; '),
      kind: 'parameter-inquiry-hypotheses',
    },
    {
      title: 'Model / solver',
      body: `modelId=${result.modelId} domainId=${result.domainId} engine=${lastRoundRun?.engine ?? 'nie wykonano'}; `
        + `${result.rounds.length} realnych pomiarów na ${input.system.label}.`,
      kind: 'parameter-inquiry-model',
    },
    {
      title: 'Parametry',
      body: `Sonda ${input.system.probeParameterId} kolejno na ${result.rounds.map((r) => r.probeValue).join(', ') || '(brak)'}; `
        + `mierzona wielkość ${input.system.observedMetric}; pasmo zgodności ±${input.system.agreementTolerance * 100}%.`,
      kind: 'parameter-inquiry-parameters',
    },
    {
      title: 'Wynik',
      body: result.rounds.map((r) => `${input.system.probeParameterId}=${r.probeValue} → ${input.system.observedMetric}=${r.observed}`).join('; ')
        || 'Nie wykonano żadnego pomiaru.',
      kind: 'parameter-inquiry-result',
    },
    {
      title: 'Dlaczego wsparta lub odrzucona',
      body: decided.length > 0
        ? decided.map((o) => `${o.hypothesisId} [${o.assessment}]: ${o.reason}`).join(' | ')
        : 'Żadna hipoteza nie została rozstrzygnięta.',
      kind: 'parameter-inquiry-reasons',
    },
    {
      title: 'Czego jeszcze nie wiemy',
      body: [...result.openQuestions, ...result.limitations].join(' | '),
      kind: 'parameter-inquiry-unresolved',
    },
    {
      title: 'Następny eksperyment',
      body: result.nextExperiment.probeValue === null
        ? `Brak: ${result.nextExperiment.rule} — ${result.nextExperiment.why}`
        : `${input.system.probeParameterId}=${result.nextExperiment.probeValue} (${result.nextExperiment.rule}) — ${result.nextExperiment.why}`,
      kind: 'parameter-inquiry-next',
    },
    ...(saved.resumedFromMemory
      ? [{ title: 'Wykorzystanie pamięci', body: saved.resumedFromMemory.reason, kind: 'parameter-inquiry-memory' }]
      : []),
  ];
}

/**
 * Persists a REAL executed inquiry as one Science Memory record, through
 * `saveExperiment` unchanged.
 *
 * `execution` carries the provenance of the LAST measurement actually taken —
 * a real `ExperimentRun` from the Fabric executor, with its own runId and
 * fingerprint. It is attached only when that run really completed on a real
 * engine, so `validExecution`'s "completed implies real-engine" rule holds by
 * construction rather than by assertion.
 *
 * HONESTY, stated here rather than left to be noticed: this record is NOT a
 * `ScientificEvidencePack`. That pack projects a preregistered TWO-ARM design
 * with ONE falsification criterion (`createScientificEvidencePack`), and an
 * inquiry is N hypotheses judged against N criteria over several adaptively
 * chosen probes. Packaging it as a pack would require inventing a chain the
 * executor never produced, so the run's real per-round provenance is recorded
 * instead and the gap is named in the honesty note.
 */
export function saveParameterInquiryToMemory(saved: SavedParameterInquiry, measurement?: ExperimentRun): SavedExperiment {
  const { input, result } = saved;
  const execution: SavedExperimentExecution | undefined = measurement && measurement.provenance.resultOrigin === 'real-engine'
    ? {
        status: measurement.result.status,
        runId: measurement.runId,
        runFingerprint: measurement.provenance.runFingerprint,
        resultOrigin: measurement.provenance.resultOrigin,
        ...(measurement.provenance.dataProvenance === undefined ? {} : { dataProvenance: measurement.provenance.dataProvenance }),
        summary: measurement.result.summary,
        modelId: measurement.provenance.modelId,
        ...(measurement.provenance.engine === null ? {} : { engine: measurement.provenance.engine }),
        modelVersion: measurement.provenance.modelVersion,
      }
    : undefined;
  return saveExperiment({
    labId: result.domainId,
    experimentId: `parameter-inquiry:${input.system.systemId}:${saved.resultFingerprint}`,
    experimentName: `Autonomiczne dochodzenie — ${result.question}`,
    params: {
      systemId: input.system.systemId,
      modelId: result.modelId,
      probeParameterId: input.system.probeParameterId,
      observedMetric: input.system.observedMetric,
      openingProbeValue: input.openingProbeValue,
      agreementTolerance: input.system.agreementTolerance,
    },
    stats: {
      rounds: result.rounds.length,
      hypothesesOffered: input.hypotheses.length,
      surviving: result.survivingHypothesisIds.length,
      falsified: result.falsifiedHypothesisIds.length,
      untested: result.untestedHypothesisIds.length,
    },
    ...(execution === undefined ? {} : { execution }),
    parameterInquiry: saved,
    analysis: parameterInquiryAnalysis(saved),
    honesty: 'simplified',
    honestyNote: `${result.rounds.length} realnych przebiegów ${result.modelId}; werdykty dotyczą hipotez wobec TEGO modelu, nie prawdy o realnej substancji. `
      + 'Ten zapis nie jest Evidence Packiem: pack rzutuje prerejestrowany projekt dwuramienny z jednym kryterium, a dochodzenie testuje wiele hipotez wieloma kryteriami na kolejno wybieranych sondach.',
    assumptions: [...result.limitations],
    epistemicStatus: 'SIMULATION',
  });
}

export interface SavedParameterInquiryReplay {
  status: ReplayVerdict;
  reason: string;
}

/**
 * Replays a saved inquiry by RE-EXECUTING it from its stored input — the same
 * discipline as every other replay in this file, never reading the stored
 * numbers back as the answer.
 *
 * Self-consistency is checked FIRST (does the stored result still match its
 * own stored fingerprint), so a payload edited after save is reported as DRIFT
 * before any re-execution is attempted. A model Genesis no longer declares is
 * NOT_REPRODUCIBLE: there is nothing left to re-execute against.
 */
export function replaySavedParameterInquiry(saved: SavedExperiment): SavedParameterInquiryReplay {
  const record = saved.parameterInquiry;
  if (record === undefined || !isSavedParameterInquiry(record)) {
    return { status: 'BLOCKED', reason: 'Zapis nie zawiera dochodzenia parametrycznego.' };
  }
  const selfCheck = inquiryResultFingerprint(record.result);
  if (selfCheck !== record.resultFingerprint) {
    return { status: 'DRIFT', reason: `Zapisane dochodzenie zostało zmienione po zapisie: jego treść nie odpowiada już własnemu zapisanemu odciskowi (${record.resultFingerprint} → ${selfCheck}).` };
  }
  const fresh = runAutonomousInquiry(record.input);
  if (fresh.rounds.length === 0 && fresh.stopReason === 'MEASUREMENT_FAILED') {
    return { status: 'NOT_REPRODUCIBLE', reason: `Model "${record.input.system.modelId}" nie jest już wykonywalny w tym Genesis, więc nie ma czego odtworzyć.` };
  }
  const freshFingerprint = inquiryResultFingerprint(fresh);
  if (freshFingerprint !== record.resultFingerprint) {
    return { status: 'DRIFT', reason: `Odtworzone dochodzenie różni się od zapisanego (${record.resultFingerprint} → ${freshFingerprint}).` };
  }
  return { status: 'MATCH', reason: `Dochodzenie odtworzyło się identycznie po realnym ponownym wykonaniu ${fresh.rounds.length} pomiarów.` };
}

/**
 * Every earlier inquiry in memory that was about the SAME system — the input
 * a new inquiry reads before deciding what is still worth testing.
 */
export function listParameterInquiriesForSystem(system: InquiryLoopInput['system']): readonly SavedParameterInquiry[] {
  const key = parameterInquirySystemKey(system);
  return listExperiments()
    .map((entry) => entry.parameterInquiry)
    .filter((record): record is SavedParameterInquiry => record !== undefined && isSavedParameterInquiry(record))
    .filter((record) => parameterInquirySystemKey(record.input.system) === key);
}

// ---------------------------------------------------------------------------
// MECHANISM COMPOSITION — the joint-arm finding, remembered.
// ---------------------------------------------------------------------------

/**
 * A COMPOSED MECHANISM — two declared levers Genesis combined into one fork,
 * because both survived independently and composing them is the informative
 * next experiment (`mechanismGeneration.ts`), remembered.
 *
 * A fourth investigation shape, alongside `hypothesisLoop`, `worldDiscovery`
 * and `parameterInquiry`: it is neither a preregistered fixed pair (one arm
 * per hypothesis) nor an adaptively-probed inquiry, but a SINGLE fork applying
 * TWO declared hypotheses' `apply` functions together, judged against their
 * own naive-additive sum. That is a genuinely different shape and gets its own
 * field for the same reason `worldDiscovery` and `parameterInquiry` do: fitting
 * it into either would lose what makes it what it is.
 *
 * `catalogId`/`goal` — not the raw `DiscoveryLoopInput` — are what is stored,
 * the same choice `SavedWorldDiscoveryRun` already makes: `buildWorld` is a
 * closure and cannot survive `localStorage`, so identity plus the parser this
 * catalog already has is what makes replay possible.
 */
export interface SavedMechanismComposition {
  contractVersion: string;
  catalogId: string;
  goal: string;
  worldId: string;
  domainId: string;
  /** The SAME memory-exclusion record the base run actually used — replay re-applies it, never today's memory. */
  resumedFromMemory: SavedWorldDiscoveryMemoryUse | null;
  derived: DerivedJointMechanism;
  assessment: JointInterventionAssessment;
  betterThanBestSingle: boolean;
  resultFingerprint: string;
}

export const MECHANISM_COMPOSITION_MEMORY_CONTRACT_VERSION = '1.0.0';

export interface BuildSavedMechanismCompositionInput {
  catalogId: string;
  goal: string;
  worldId: string;
  domainId: string;
  resumedFromMemory: SavedWorldDiscoveryMemoryUse | null;
  derived: DerivedJointMechanism;
  assessment: JointInterventionAssessment;
  betterThanBestSingle: boolean;
}

export function buildSavedMechanismComposition(input: BuildSavedMechanismCompositionInput): SavedMechanismComposition {
  return {
    contractVersion: MECHANISM_COMPOSITION_MEMORY_CONTRACT_VERSION,
    ...input,
    resultFingerprint: jointMechanismResultFingerprint(input.derived, input.assessment),
  };
}

export function isSavedMechanismComposition(value: unknown): value is SavedMechanismComposition {
  if (!isRecordLike(value)) return false;
  if (typeof value.contractVersion !== 'string') return false;
  if (!nonEmptyString(value.catalogId) || !nonEmptyString(value.goal)) return false;
  if (!nonEmptyString(value.worldId) || !nonEmptyString(value.domainId)) return false;
  if (!nonEmptyString(value.resultFingerprint)) return false;
  if (!isRecordLike(value.derived) || !nonEmptyString(value.derived.hypothesisId)) return false;
  if (!isRecordLike(value.assessment) || typeof value.assessment.jointObserved !== 'number') return false;
  return true;
}

function mechanismCompositionAnalysis(saved: SavedMechanismComposition): SavedExperimentAnalysisBlock[] {
  const { derived, assessment } = saved;
  return [
    { title: 'Pytanie', body: derived.statement, kind: 'mechanism-composition-question' },
    {
      title: 'Dlaczego skomponowane',
      body: derived.why,
      kind: 'mechanism-composition-why',
    },
    {
      title: 'Wynik',
      body: `baseline=${assessment.baseline}, effect A=${assessment.effectA}, effect B=${assessment.effectB}, ` +
        `suma naiwna=${assessment.naiveAdditivePrediction}, zmierzono wspólnie=${assessment.jointObserved} ` +
        `(${assessment.interaction}, odchylenie ${(assessment.relativeDeviation ?? 0) * 100}%).`,
      kind: 'mechanism-composition-result',
    },
    {
      title: 'Czy warto robić oba naraz',
      body: saved.betterThanBestSingle
        ? 'Tak: wspólny wynik przewyższa lepszą z pojedynczych dźwigni, niezależnie od tego, czy się addytywnie sumują.'
        : 'Nie: wspólny wynik nie przewyższa lepszej z pojedynczych dźwigni.',
      kind: 'mechanism-composition-worth-it',
    },
    ...(saved.resumedFromMemory
      ? [{ title: 'Wykorzystanie pamięci', body: saved.resumedFromMemory.reason, kind: 'mechanism-composition-memory' }]
      : []),
  ];
}

/**
 * Persists a REAL joint-arm finding as one Science Memory record, through
 * `saveExperiment` unchanged — the same seam `saveParameterInquiryToMemory`
 * and `saveWorldDiscoveryRunToMemory` already use.
 *
 * No `execution`/`ExperimentRun` is attached: the joint arm is a WorldGraph
 * fork, not a Fabric run, the same substrate `worldDiscovery` records already
 * report without one.
 */
export function saveMechanismCompositionToMemory(saved: SavedMechanismComposition): SavedExperiment {
  const { derived, assessment } = saved;
  return saveExperiment({
    labId: saved.domainId,
    experimentId: `mechanism-composition:${saved.catalogId}:${saved.resultFingerprint}`,
    experimentName: `Kompozycja mechanizmów — ${derived.hypothesisId}`,
    params: {
      catalogId: saved.catalogId,
      goal: saved.goal,
      parentA: derived.parentHypothesisIds[0],
      parentB: derived.parentHypothesisIds[1],
      strength: derived.strength,
      metric: derived.metric,
    },
    stats: {
      baseline: assessment.baseline,
      effectA: assessment.effectA,
      effectB: assessment.effectB,
      naiveAdditivePrediction: assessment.naiveAdditivePrediction,
      jointObserved: assessment.jointObserved,
      deviation: assessment.deviation,
    },
    mechanismComposition: saved,
    analysis: mechanismCompositionAnalysis(saved),
    honesty: 'simplified',
    honestyNote: `Realny fork WorldGraph łączący dwa zadeklarowane dźwignie (${derived.parentHypothesisIds.join(', ')}); ` +
      `werdykt (${assessment.interaction}) dotyczy TEGO modelu i tego jednego wypróbowanego natężenia (${derived.strength}), nie ogólnego prawa fizycznego.`,
    assumptions: [],
    epistemicStatus: 'SIMULATION',
  });
}

export interface SavedMechanismCompositionReplay {
  status: ReplayVerdict;
  reason: string;
}

/**
 * Replays a saved composition by RE-EXECUTING the base investigation and the
 * joint arm from stored identity — the same discipline as every other replay
 * in this file, never reading the stored numbers back as the answer.
 *
 * Re-applies the SAME `resumedFromMemory` exclusion the original run used
 * (`replaySavedWorldDiscoveryRun`'s own precedent), so this compares the
 * record against what actually produced it rather than against today's memory
 * state, which may have narrowed further since.
 */
export function replaySavedMechanismComposition(saved: SavedExperiment): SavedMechanismCompositionReplay {
  const record = saved.mechanismComposition;
  if (record === undefined || !isSavedMechanismComposition(record)) {
    return { status: 'BLOCKED', reason: 'Zapis nie zawiera kompozycji mechanizmów.' };
  }
  const selfCheck = jointMechanismResultFingerprint(record.derived, record.assessment);
  if (selfCheck !== record.resultFingerprint) {
    return { status: 'DRIFT', reason: `Zapisana kompozycja została zmieniona po zapisie: jej treść nie odpowiada już własnemu zapisanemu odciskowi (${record.resultFingerprint} → ${selfCheck}).` };
  }
  const catalog = resolveWorldLeverCatalog(record.catalogId);
  if (!catalog) {
    return { status: 'NOT_REPRODUCIBLE', reason: `Katalog "${record.catalogId}" nie jest już zadeklarowany w Genesis.` };
  }
  const intent = parseWorldDiscoveryGoal(record.goal, catalog);
  const plan = buildWorldDiscoveryPlan(intent, catalog);
  if ('error' in plan) {
    return { status: 'BLOCKED', reason: `Cel przestał być czytelny dla tego katalogu: ${plan.error}` };
  }
  const excluded = new Set(record.resumedFromMemory?.skippedHypothesisIds ?? []);
  const filteredHypotheses = excluded.size === 0
    ? plan.hypotheses
    : plan.hypotheses.filter((h) => !excluded.has(h.hypothesisId));
  const rerunInput: DiscoveryLoopInput = {
    ...plan,
    hypotheses: filteredHypotheses.length > 0 ? filteredHypotheses : plan.hypotheses,
  };
  const fresh = generateJointMechanismFrom(runAutonomousDiscoveryWithEngines(rerunInput), rerunInput);
  if (fresh.generated === null) {
    return { status: 'NOT_REPRODUCIBLE', reason: `Ponowne wykonanie nie odtworzyło kompozycji: ${fresh.noGenerationReason}` };
  }
  const freshFingerprint = jointMechanismResultFingerprint(fresh.generated.derived, fresh.generated.assessment);
  if (freshFingerprint !== record.resultFingerprint) {
    return { status: 'DRIFT', reason: `Odtworzona kompozycja różni się od zapisanej (${record.resultFingerprint} → ${freshFingerprint}).` };
  }
  return { status: 'MATCH', reason: 'Kompozycja mechanizmów odtworzyła się identycznie po realnym ponownym wykonaniu obu ramion.' };
}

// ---------------------------------------------------------------------------
// REAL EXPERIMENT VERIFICATION — a real, physical measurement judged against
// a WorldGraph prediction Genesis already produced and saved.
// ---------------------------------------------------------------------------

export const REAL_EXPERIMENT_VERIFICATION_CONTRACT_VERSION = '1.0.0';

/**
 * An externally-sourced measurement (REAL_EXPERIMENTAL or REFERENCE), judged
 * against a WorldGraph prediction — the fifth investigation shape, alongside
 * `hypothesisLoop`, `worldDiscovery`, `parameterInquiry` and
 * `mechanismComposition`.
 *
 * `request` is a union rather than two separate saved shapes: a physical
 * measurement's request (`physicalProtocolRef`) and a cited reference's
 * request (`citation`) both PRODUCE the same `ExperimentRun` shape and are
 * judged by the exact same `verifyPredictionAgainstRealExperiment` — only
 * the origin of the number differs, and `realRun.provenance.dataProvenance`
 * already says which. Splitting this into two saved shapes would duplicate
 * everything below `request` for no real difference in behavior.
 *
 * The prediction itself is NOT duplicated here: `predictionSourceExperimentId`
 * links back to the existing `SavedWorldDiscoveryRun` (saved through the
 * unmodified `saveWorldDiscoveryRunToMemory`) that produced it, the same
 * choice `mechanismComposition` already makes for `resumedFromMemory`.
 * `predictedRoundIndex` is always that run's LAST executed round — the same
 * "decisive round" convention `worldDiscoveryAnalysis`/
 * `buildWorldDiscoveryEvidenceBundle` already use — so replay can relocate it
 * deterministically without guessing which round the prediction came from.
 *
 * `realRun` is frozen exactly as entered: nothing in this file, including
 * replay, ever re-executes or edits it. Only the prediction side is ever
 * re-run.
 */
export interface SavedRealExperimentVerification {
  contractVersion: string;
  predictionSourceExperimentId: string;
  predictedRoundIndex: number;
  hypothesisId: string;
  request: RealExperimentRequest | ReferenceMeasurementRequest;
  realRun: ExperimentRun;
  verification: PredictionVerification;
  resultFingerprint: string;
}

/** A single human-readable label for either request shape — never branch on this twice in two places. */
function requestSourceLabel(request: RealExperimentRequest | ReferenceMeasurementRequest): string {
  return 'physicalProtocolRef' in request ? request.physicalProtocolRef : request.citation.sourceRef;
}

export interface BuildSavedRealExperimentVerificationInput {
  predictionSourceExperimentId: string;
  loopResult: DiscoveryLoopResult;
  /**
   * PREREGISTERED SEPARATELY from the original hypothesis's own criterion,
   * and declared BEFORE the real measurement is entered. The original
   * hypothesis's `criterion` judges baseline-vs-intervention WITHIN the
   * simulation — a different question from "does the real measurement match
   * what was predicted." Reusing it here would silently ask the wrong
   * question. This criterion is instead supplied explicitly by whoever
   * requests the real experiment — typically `equal-within-tolerance` with a
   * human-declared `tolerance`, reusing the SAME `FalsificationCriterion` /
   * `evaluateTwoArmRelation` machinery every other protocol in this codebase
   * already uses, never a fabricated universal threshold invented here.
   */
  verificationCriterion: FalsificationCriterion;
  request: RealExperimentRequest | ReferenceMeasurementRequest;
  realRun: ExperimentRun;
}

/**
 * Builds a verification from an ALREADY-COMPLETED WorldGraph prediction (the
 * loop's own last round) and an already-assembled real measurement
 * (`createRealExperimentRun`, called by the caller — this function executes
 * nothing). The comparison itself is `verifyPredictionAgainstRealExperiment`,
 * unchanged.
 */
export function buildSavedRealExperimentVerification(input: BuildSavedRealExperimentVerificationInput): SavedRealExperimentVerification {
  const { loopResult } = input;
  const predictedRoundIndex = loopResult.rounds.length - 1;
  const round = loopResult.rounds[predictedRoundIndex];
  if (round === undefined) throw new Error('Cannot verify a prediction against a discovery run with zero executed rounds.');
  if (round.objectiveObserved === null) throw new Error('The predicted round has no numeric objectiveObserved to compare a real measurement against.');
  const verification = verifyPredictionAgainstRealExperiment({
    predictedValue: round.objectiveObserved,
    criterion: input.verificationCriterion,
    realRun: input.realRun,
  });
  return {
    contractVersion: REAL_EXPERIMENT_VERIFICATION_CONTRACT_VERSION,
    predictionSourceExperimentId: input.predictionSourceExperimentId,
    predictedRoundIndex,
    hypothesisId: round.hypothesisId,
    request: input.request,
    realRun: input.realRun,
    verification,
    resultFingerprint: predictionVerificationFingerprint(verification),
  };
}

const EXTERNAL_VERIFICATION_PROVENANCE = new Set(['REAL_EXPERIMENTAL', 'REFERENCE']);

/** localStorage jest edytowalne poza aplikacją — rekord walidujemy pole po polu. */
export function isSavedRealExperimentVerification(value: unknown): value is SavedRealExperimentVerification {
  if (!isRecordLike(value)) return false;
  if (typeof value.contractVersion !== 'string') return false;
  if (!nonEmptyString(value.predictionSourceExperimentId)) return false;
  if (typeof value.predictedRoundIndex !== 'number' || !Number.isInteger(value.predictedRoundIndex) || value.predictedRoundIndex < 0) return false;
  if (!nonEmptyString(value.hypothesisId)) return false;
  if (!nonEmptyString(value.resultFingerprint)) return false;
  if (!isRecordLike(value.request)) return false;
  const hasPhysicalProtocol = nonEmptyString(value.request.physicalProtocolRef);
  const citation = value.request.citation;
  const hasCitation = isRecordLike(citation) && nonEmptyString(citation.citationText) && nonEmptyString(citation.sourceRef);
  if (!hasPhysicalProtocol && !hasCitation) return false;
  if (!isRecordLike(value.realRun)) return false;
  const provenance = value.realRun.provenance;
  if (!isRecordLike(provenance) || typeof provenance.dataProvenance !== 'string' || !EXTERNAL_VERIFICATION_PROVENANCE.has(provenance.dataProvenance)) return false;
  if (!isRecordLike(value.verification) || typeof value.verification.predictedValue !== 'number' || typeof value.verification.assessment !== 'string') return false;
  return true;
}

function realExperimentVerificationAnalysis(saved: SavedRealExperimentVerification): SavedExperimentAnalysisBlock[] {
  const { verification, request } = saved;
  return [
    {
      title: 'Protokół',
      body: `${requestSourceLabel(request)}${request.hypothesisId ? ` (hipoteza ${request.hypothesisId})` : ''}`,
      kind: 'real-experiment-protocol',
    },
    {
      title: 'Predykcja vs realny pomiar',
      body: `Genesis przewidział ${verification.predictedValue} dla "${verification.criterion.metric}"; realny pomiar dał ${verification.observedValue ?? 'brak wartości liczbowej dla tej metryki'}.`,
      kind: 'real-experiment-comparison',
    },
    { title: 'Werdykt', body: verification.message, kind: 'real-experiment-verdict' },
  ];
}

/**
 * Persists a REAL comparison between a WorldGraph prediction and a real,
 * physical measurement, through `saveExperiment` unchanged — the same seam
 * every other investigation shape in this file already uses.
 */
export function saveRealExperimentVerificationToMemory(saved: SavedRealExperimentVerification): SavedExperiment {
  const { verification, request } = saved;
  const provenance = saved.realRun.provenance.dataProvenance ?? 'REAL_EXPERIMENTAL';
  const sourceLabel = requestSourceLabel(request);
  const sourceKind = provenance === 'REFERENCE' ? 'cytowaną wartość referencyjną' : 'realny pomiar fizyczny (protokół)';
  return saveExperiment({
    labId: 'real-experiment',
    experimentId: `real-experiment-verification:${saved.predictionSourceExperimentId}:${saved.resultFingerprint}`,
    experimentName: `Weryfikacja ${provenance === 'REFERENCE' ? 'danymi referencyjnymi' : 'realnym pomiarem'} — ${saved.hypothesisId}`,
    params: {
      predictionSourceExperimentId: saved.predictionSourceExperimentId,
      predictedRoundIndex: saved.predictedRoundIndex,
      hypothesisId: saved.hypothesisId,
      physicalProtocolRef: sourceLabel,
      metric: verification.criterion.metric,
    },
    stats: {
      predictedValue: verification.predictedValue,
      ...(verification.observedValue === null ? {} : { observedValue: verification.observedValue }),
    },
    realExperimentVerification: saved,
    analysis: realExperimentVerificationAnalysis(saved),
    honesty: 'simplified',
    honestyNote: `${sourceKind} (${sourceLabel}) porównana z predykcją Genesis dla "${verification.criterion.metric}"; `
      + `werdykt (${verification.assessment}) dotyczy TEGO jednego pomiaru/cytowania i TEGO modelu, nie ogólnej prawdy o świecie.`,
    assumptions: [],
    epistemicStatus: provenance,
  });
}

export interface SavedRealExperimentVerificationReplay {
  status: ReplayVerdict;
  reason: string;
}

/**
 * Replays a saved Real Experiment verification WITHOUT ever re-executing the
 * physical measurement — `record.realRun` is reused exactly as stored,
 * everywhere below. Only the SIMULATED half (the WorldGraph prediction this
 * verification was originally checked against) is genuinely re-run, through
 * the same `runAutonomousDiscoveryWithEngines` every other WorldGraph replay
 * in this file already uses — no second replay mechanism invented for real
 * data.
 *
 * Self-consistency is checked FIRST (own stored fingerprint), then the
 * prediction's OWN reproducibility (does the base discovery run still
 * reproduce the fingerprint it was saved with — a prediction that does not
 * even reproduce itself cannot support a verification), and only then is the
 * comparison recomputed against the frozen real measurement.
 */
export function replaySavedRealExperimentVerification(saved: SavedExperiment): SavedRealExperimentVerificationReplay {
  const record = saved.realExperimentVerification;
  if (record === undefined || !isSavedRealExperimentVerification(record)) {
    return { status: 'BLOCKED', reason: 'Zapis nie zawiera weryfikacji realnym eksperymentem.' };
  }
  const selfCheck = predictionVerificationFingerprint(record.verification);
  if (selfCheck !== record.resultFingerprint) {
    return { status: 'DRIFT', reason: `Zapisana weryfikacja została zmieniona po zapisie: jej treść nie odpowiada już własnemu zapisanemu odciskowi (${record.resultFingerprint} → ${selfCheck}).` };
  }
  const storedProvenance = record.realRun.provenance.dataProvenance;
  if (storedProvenance === undefined || !EXTERNAL_VERIFICATION_PROVENANCE.has(storedProvenance)) {
    return { status: 'BLOCKED', reason: 'Zapisany przebieg nie jest oznaczony REAL_EXPERIMENTAL ani REFERENCE — odtworzenie odmawia potraktowania go jako danych zewnętrznych.' };
  }
  const source = getExperiment(record.predictionSourceExperimentId);
  const sourceRecord = source?.worldDiscovery;
  if (source === undefined || sourceRecord === undefined || !isSavedWorldDiscoveryRun(sourceRecord)) {
    return { status: 'NOT_REPRODUCIBLE', reason: `Źródłowy przebieg predykcji "${record.predictionSourceExperimentId}" nie jest już dostępny w pamięci.` };
  }
  if (sourceRecord.resultKind !== 'HYPOTHESIS_LOOP' || sourceRecord.loopResult === undefined) {
    return { status: 'BLOCKED', reason: 'Źródłowy przebieg predykcji nie jest pętlą hipotez world-model.' };
  }
  const catalog = resolveWorldLeverCatalog(sourceRecord.catalogId);
  if (!catalog) {
    return { status: 'NOT_REPRODUCIBLE', reason: `Katalog "${sourceRecord.catalogId}" nie jest już zadeklarowany w Genesis.` };
  }
  const intent = parseWorldDiscoveryGoal(sourceRecord.goal, catalog);
  const plan = buildWorldDiscoveryPlan(intent, catalog);
  if ('error' in plan) {
    return { status: 'BLOCKED', reason: `Cel przestał być czytelny dla tego katalogu: ${plan.error}` };
  }
  const excluded = new Set(sourceRecord.resumedFromMemory?.skippedHypothesisIds ?? []);
  const filteredHypotheses = excluded.size === 0
    ? plan.hypotheses
    : plan.hypotheses.filter((h) => !excluded.has(h.hypothesisId));
  const rerunInput: DiscoveryLoopInput = {
    ...plan,
    hypotheses: filteredHypotheses.length > 0 ? filteredHypotheses : plan.hypotheses,
  };
  const freshResult = runAutonomousDiscoveryWithEngines(rerunInput).result;
  const freshResultFingerprint = discoveryResultFingerprint(freshResult);
  if (freshResultFingerprint !== sourceRecord.resultFingerprint) {
    return { status: 'DRIFT', reason: `Predykcja bazowa nie odtworzyła się identycznie (${sourceRecord.resultFingerprint} → ${freshResultFingerprint}) — weryfikacja realnym pomiarem opierałaby się na predykcji, która się nie odtwarza.` };
  }
  const freshRound = freshResult.rounds[record.predictedRoundIndex];
  if (freshRound === undefined || freshRound.objectiveObserved === null) {
    return { status: 'NOT_REPRODUCIBLE', reason: 'Odtworzona pętla nie ma już rundy o tym indeksie z liczbową wartością przewidzianą.' };
  }
  // NEVER re-executed: the same stored `record.realRun`, unchanged, is what the
  // fresh prediction is compared against below — and the SAME preregistered
  // `record.verification.criterion`, never re-derived from anything that
  // could have changed since save.
  const freshVerification = verifyPredictionAgainstRealExperiment({
    predictedValue: freshRound.objectiveObserved,
    criterion: record.verification.criterion,
    realRun: record.realRun,
  });
  const freshFingerprint = predictionVerificationFingerprint(freshVerification);
  if (freshFingerprint !== record.resultFingerprint) {
    return { status: 'DRIFT', reason: `Odtworzona weryfikacja różni się od zapisanej (${record.resultFingerprint} → ${freshFingerprint}): ${freshVerification.message}` };
  }
  return { status: 'MATCH', reason: 'Predykcja odtworzyła się identycznie, a porównanie z tym samym, nietkniętym realnym pomiarem dało ten sam werdykt.' };
}

export function listExperiments(): SavedExperiment[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getExperiment(id: string): SavedExperiment | undefined {
  return readAll().find((e) => e.id === id);
}

export function deleteExperiment(id: string): void {
  writeJSON(KEY, readAll().filter((e) => e.id !== id));
}

export function countExperiments(): number {
  return readAll().length;
}
