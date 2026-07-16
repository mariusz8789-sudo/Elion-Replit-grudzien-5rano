/**
 * assistantHistory — local "My Analyses" store for the Grounded Chemistry Assistant
 * (Stage 4). Persists finished analyses in localStorage (reuses storage.ts), scoped
 * per user so each account sees only its own history. No backend, no new endpoint.
 */
import { readJSON, writeJSON } from './storage';
import type { MoleculeProps, InterpretationNote } from './moleculeInterpretation';

const KEY = 'assistant-history/v1';

export type AnalysisStatus = 'VERIFIED' | 'INVALID' | 'BLOCKED';

export interface SavedAnalysis {
  id: string;
  ownerId: string;
  date: number;
  name: string;
  smiles: string;
  status: AnalysisStatus;
  report: {
    inchiKey: string | null;
    molecularFormula: string;
    props: MoleculeProps;
    notes: InterpretationNote[];
    alerts?: string[]; // RDKit structural-alert names (Stage 5 decision input)
  } | null;
}

function newId(): string {
  const rnd = Math.floor((Date.now() % 1e6) + Math.random() * 1e6).toString(36);
  return `an_${Date.now().toString(36)}_${rnd}`;
}

function readAll(): SavedAnalysis[] {
  const raw = readJSON<SavedAnalysis[] | null>(KEY, null);
  return Array.isArray(raw) ? raw.filter((a) => a && typeof a.id === 'string') : [];
}

/** All analyses for a user, newest first. */
export function listAnalyses(ownerId: string): SavedAnalysis[] {
  return readAll().filter((a) => a.ownerId === ownerId).sort((a, b) => b.date - a.date);
}

export function getAnalysis(ownerId: string, id: string): SavedAnalysis | null {
  return readAll().find((a) => a.ownerId === ownerId && a.id === id) ?? null;
}

/** Save a new analysis (returns the stored record). Caps history at 200 per store. */
export function saveAnalysis(entry: Omit<SavedAnalysis, 'id' | 'date'> & { id?: string; date?: number }): SavedAnalysis {
  const all = readAll();
  const record: SavedAnalysis = { ...entry, id: entry.id ?? newId(), date: entry.date ?? Date.now() };
  all.unshift(record);
  writeJSON(KEY, all.slice(0, 200));
  return record;
}

export function deleteAnalysis(ownerId: string, id: string): void {
  writeJSON(KEY, readAll().filter((a) => !(a.ownerId === ownerId && a.id === id)));
}
