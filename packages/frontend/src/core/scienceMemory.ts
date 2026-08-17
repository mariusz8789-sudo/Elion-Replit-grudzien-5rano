import { readJSON, writeJSON } from './storage';
import type { HonestyLevel, SimParams } from './types';

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
export interface SavedExperiment {
  id: string;
  createdAt: string;
  labId: string;
  experimentId: string;
  experimentName: string;
  params: SimParams;
  stats: Record<string, number>;
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
    o.params != null && typeof o.params === 'object'
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
  honesty: HonestyLevel;
  honestyNote: string;
  equations?: string[];
  assumptions?: string[];
  epistemicStatus?: string;
}

export function saveExperiment(input: SaveExperimentInput): SavedExperiment {
  const hash = contentHash(input);
  const entry: SavedExperiment = {
    id: `${input.labId}:${input.experimentId}:${hash}:${Date.now()}`,
    createdAt: new Date().toISOString(),
    labId: input.labId,
    experimentId: input.experimentId,
    experimentName: input.experimentName,
    params: input.params,
    stats: input.stats ?? {},
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
