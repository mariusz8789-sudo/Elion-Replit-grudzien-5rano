import { readJSON, writeJSON } from './storage';
import type { HonestyLevel, SimParams } from './types';
import type { ExperimentOutputValue } from './experimentFabric/types';

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
    (o.execution === undefined || (typeof o.execution === 'object' && typeof (o.execution as SavedExperimentExecution).status === 'string' && typeof (o.execution as SavedExperimentExecution).runId === 'string' && typeof (o.execution as SavedExperimentExecution).runFingerprint === 'string' && typeof (o.execution as SavedExperimentExecution).resultOrigin === 'string' && typeof (o.execution as SavedExperimentExecution).summary === 'string')) &&
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
  replayIdentity?: SavedExperimentReplayIdentity;
}

export function saveExperiment(input: SaveExperimentInput): SavedExperiment {
  if (!validParams(input.params)) throw new Error('Parametry muszą zawierać wyłącznie skończone liczby, teksty lub wartości logiczne.');
  if (!validStats(input.stats ?? {})) throw new Error('Statystyki muszą zawierać wyłącznie skończone liczby.');
  if (!validObservations(input.observations)) throw new Error('Obserwacje muszą zawierać wyłącznie skończone wartości lub serie liczbowe.');
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
