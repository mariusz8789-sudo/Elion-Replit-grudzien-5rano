import { readJSON, writeJSON } from './storage';
import type { SimParams } from './types';

/**
 * Zapisane presety parametrów z trybu "Stwórz eksperyment" — ten sam wzorzec
 * co discoveryLog.ts/settings.ts: localStorage, walidacja pole-po-polu przy
 * odczycie (localStorage jest edytowalne poza aplikacją).
 */
export interface CustomExperiment {
  id: string;
  labId: string;
  name: string;
  params: SimParams;
  createdAt: string;
}

const KEY = 'custom-experiments/v1';
const MAX_TOTAL = 50; // limit globalny, żeby localStorage nie rosło bez końca

function isSimParams(v: unknown): v is SimParams {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (x) => typeof x === 'number' || typeof x === 'boolean' || typeof x === 'string',
  );
}

function isCustomExperiment(v: unknown): v is CustomExperiment {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.labId === 'string' &&
    typeof o.name === 'string' &&
    typeof o.createdAt === 'string' &&
    isSimParams(o.params)
  );
}

function readAll(): CustomExperiment[] {
  const raw = readJSON<unknown[]>(KEY, []);
  return Array.isArray(raw) ? raw.filter(isCustomExperiment) : [];
}

export function saveCustomExperiment(labId: string, name: string, params: SimParams): CustomExperiment {
  const entry: CustomExperiment = {
    id: `${labId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    labId,
    name: name.trim().slice(0, 60) || 'Bez nazwy',
    params,
    createdAt: new Date().toISOString(),
  };
  const all = [...readAll(), entry].slice(-MAX_TOTAL);
  writeJSON(KEY, all);
  return entry;
}

export function listCustomExperiments(labId: string): CustomExperiment[] {
  return readAll()
    .filter((e) => e.labId === labId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteCustomExperiment(id: string): void {
  writeJSON(KEY, readAll().filter((e) => e.id !== id));
}

export function countCustomExperiments(): number {
  return readAll().length;
}
