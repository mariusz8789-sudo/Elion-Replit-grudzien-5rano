import { readJSON, writeJSON } from './storage';
import type { HonestyLevel, SimParams } from './types';
import { biotechScientificFingerprint, buildCandidateCombinationHypothesis, rankNaturalCompositionHypotheses, type BiologicalExperimentRequest, type BiologicalExperimentRequestStatus, type BiotechEpistemicStatus, type BiotechProvenance, type CandidateCombinationHypothesis, type CandidateDiscoveryReport, type CandidateRanking, type RankedCompositionHypothesis, type TherapeuticCandidate, type TherapeuticHypothesis } from './biotechDiscoveryContract';
import type { ExperimentOutputValue, ExperimentRoute, ExperimentRun } from './experimentFabric/types';
import type { ScientificEvidencePack } from './experimentFabric/evidencePack';
import { compareAme2020Observations } from './observation/nuclearAme2020';
import { compareCandidateDiscoveryReports, type CandidateComparison } from './biotechDiscoveryContract';
import { canonicalJson, fnv1a } from './events/hash';
import { buildSavedScenarioRunContext, isSavedScenarioRunContext, type SavedScenarioRunContext } from './simulation/scenarioMemory';
import type { ScenarioRun } from './simulation/scenarioEngine';
import { buildSavedScenarioCounterfactual, isSavedScenarioCounterfactual, type SavedScenarioCounterfactual, type ScenarioCounterfactual } from './simulation/scenarioCounterfactual';

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

export function saveBiotechDiscoveryComparisonToMemory(reports: readonly CandidateDiscoveryReport[], lineage?: { activityIds?: readonly string[]; assayIds?: readonly string[]; computeRuns?: readonly SavedBiotechComputeRun[]; sourceRecords?: readonly SavedBiotechSourceRecord[]; activityRecords?: readonly SavedBiotechActivityRecord[]; neurobiology?: SavedBiotechDiscoveryArtifact['neurobiology']; requestedTargetIds?: readonly string[] }): SavedExperiment {
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
    requestedTargetIds: saved.requestedTargetIds ?? [] };
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
export function saveScenarioRunToMemory(run: ScenarioRun, execution?: SavedExperimentExecution): SavedExperiment {
  const scenario = buildSavedScenarioRunContext(run);
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
export function saveScenarioCounterfactualToMemory(counterfactual: ScenarioCounterfactual, execution?: SavedExperimentExecution): SavedExperiment {
  const saved = buildSavedScenarioCounterfactual(counterfactual);
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
