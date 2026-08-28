import { readJSON, writeJSON } from './storage';
import type { HonestyLevel, SimParams } from './types';
import { biotechScientificFingerprint, type BiologicalExperimentRequest, type BiologicalExperimentRequestStatus, type BiotechEpistemicStatus, type BiotechProvenance, type CandidateDiscoveryReport, type CandidateRanking, type TherapeuticCandidate, type TherapeuticHypothesis } from './biotechDiscoveryContract';
import type { ExperimentOutputValue, ExperimentRun } from './experimentFabric/types';
import type { ScientificEvidencePack } from './experimentFabric/evidencePack';

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
}

export interface SavedExperimentAnalysisBlock {
  title: string;
  body: string;
  kind?: string;
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
  ranking?: CandidateRanking;
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
  replayIdentity?: SavedExperimentReplayIdentity;
  honesty: HonestyLevel;
  honestyNote: string;
  equations: string[];
  assumptions: string[];
  epistemicStatus: string;
  contentHash: string;
}

const KEY = 'science-memory/v1';
const MAX_TOTAL = 100;

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
  return nonEmptyString(context.candidateId)
    && nonEmptyString(context.hypothesisId)
    && (context.reportId === undefined || nonEmptyString(context.reportId))
    && (context.requestId === undefined || nonEmptyString(context.requestId))
    && statuses.includes(context.hypothesisStatus)
    && (context.experimentRequestStatus === undefined || requestStatuses.includes(context.experimentRequestStatus))
    && validIds(context.evidenceIds)
    && validIds(context.safetySignalIds)
    && validProvenance
    && validRanking
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
    validReplayIdentity(o.replayIdentity)
  );
}

function readAll(): SavedExperiment[] {
  const raw = readJSON<unknown[]>(KEY, []);
  return Array.isArray(raw) ? raw.filter(isSavedExperiment) : [];
}

export function saveBiotechDiscoveryReportToMemory(report: CandidateDiscoveryReport): SavedExperiment {
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
    ...(report.ranking === undefined ? {} : { ranking: report.ranking }),
  };
  return saveExperiment({
    labId: 'biotechnology', experimentId: `report:${report.reportId}`, experimentName: `Candidate Discovery Report — ${report.candidateId}`,
    params: {}, stats: {}, biotech, honesty: 'simplified', honestyNote: 'Scientific context only; no biological execution performed.',
    assumptions: [], epistemicStatus: report.epistemicStatus,
  });
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
    },
    analysis: [
      { title: 'Genesis result', body: run.result.summary, kind: 'fabric-result' },
      ...(run.result.warnings.length === 0 ? [] : [{ title: 'Jawne ostrzeżenia', body: run.result.warnings.join(' '), kind: 'fabric-warning' }]),
    ],
    honesty: run.result.status === 'completed' ? 'exact' : 'simplified',
    honestyNote: `Fabric status=${run.result.status}; resultOrigin=${run.provenance.resultOrigin}.`,
    assumptions: [...run.result.assumptions],
    epistemicStatus: run.result.status === 'completed' ? 'OBSERVED' : 'UNKNOWN',
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
