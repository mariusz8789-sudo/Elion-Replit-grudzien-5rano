import { readJSON, writeJSON } from './storage';
import type { HonestyLevel, SimParams } from './types';
import type { ExperimentOutputValue } from './experimentFabric/types';
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

function isSavedExperiment(v: unknown): v is SavedExperiment {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.labId === 'string' &&
    typeof o.experimentId === 'string' &&
    typeof o.experimentName === 'string' &&
    typeof o.contentHash === 'string' &&
    validStats(o.stats) &&
    validParams(o.params) &&
    validObservations(o.observations) &&
    validExecution(o.execution) &&
    (o.evidencePackId === undefined || typeof o.evidencePackId === 'string') &&
    (o.evidenceChainId === undefined || typeof o.evidenceChainId === 'string') &&
    (o.analysis === undefined || (Array.isArray(o.analysis) && o.analysis.every((block) => typeof block === 'object' && typeof (block as SavedExperimentAnalysisBlock).title === 'string' && typeof (block as SavedExperimentAnalysisBlock).body === 'string'))) &&
    (o.replayIdentity === undefined || (typeof o.replayIdentity === 'object' && typeof (o.replayIdentity as SavedExperimentReplayIdentity).capsuleId === 'string' && typeof (o.replayIdentity as SavedExperimentReplayIdentity).planId === 'string' && typeof (o.replayIdentity as SavedExperimentReplayIdentity).confirmationId === 'string'))
  );
}

function readAll(): SavedExperiment[] {
  const raw = readJSON<unknown[]>(KEY, []);
  return Array.isArray(raw) ? raw.filter(isSavedExperiment) : [];
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
  replayIdentity?: SavedExperimentReplayIdentity;
}

export function saveExperiment(input: SaveExperimentInput): SavedExperiment {
  if (!validParams(input.params)) throw new Error('Parametry muszą zawierać wyłącznie skończone liczby, teksty lub wartości logiczne.');
  if (!validStats(input.stats ?? {})) throw new Error('Statystyki muszą zawierać wyłącznie skończone liczby.');
  if (!validObservations(input.observations)) throw new Error('Obserwacje muszą zawierać wyłącznie skończone wartości lub serie liczbowe.');
  if (!validExecution(input.execution)) throw new Error('Execution musi mieć kompletne provenance; status completed wymaga resultOrigin real-engine.');
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
