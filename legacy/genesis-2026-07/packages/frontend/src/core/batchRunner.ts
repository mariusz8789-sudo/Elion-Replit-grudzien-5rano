/**
 * batchRunner — THE single molecule-analysis pipeline (introduced in Stage 6, extracted
 * in Stage 7). Bounded concurrency (default 4 workers), fault-tolerant: an invalid
 * SMILES is marked Invalid with its validation error and excluded, never aborting the
 * batch. Supports progress reporting, per-item callbacks (so a caller can persist as it
 * goes), and cancellation via AbortSignal (partial completion).
 *
 * Reused by BOTH Compare (Stage 6) and Research Campaigns (Stage 7) — there is no
 * second execution engine and descriptors are never recomputed elsewhere.
 */
import { buildLabReadiness } from './backend/client';
import { propsFromDossier } from './dossierProps';
import type { Candidate } from './moleculeComparison';

export interface BatchEntry { id?: string; name: string; smiles: string }
export interface BatchFail { id: string; name: string; smiles: string; reason: string }
export interface BatchProgress { done: number; total: number; ok: number; invalid: number }
export type BatchItemResult =
  | { ok: true; id: string; candidate: Candidate }
  | { ok: false; id: string; entry: BatchEntry; reason: string };

export interface RunBatchOptions {
  concurrency?: number;
  idPrefix?: string;
  signal?: AbortSignal;
  onProgress?: (p: BatchProgress) => void;
  onResult?: (r: BatchItemResult, index: number) => void;
}

/** Bounded-concurrency map that stops launching new work once `signal` aborts. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, signal?: AbortSignal): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      if (signal?.aborted) return;
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

/** Analyse ONE entry via the existing RDKit lab-readiness. Classifies ok / invalid. */
export async function analyzeEntry(entry: BatchEntry, id: string): Promise<BatchItemResult> {
  const r = await buildLabReadiness(entry.smiles);
  if (!r.ok) return { ok: false, id, entry, reason: r.message };
  const rd = r.data;
  if (rd.status !== 'COMPLETED' || !rd.dossier) {
    return { ok: false, id, entry, reason: rd.status === 'BLOCKED_BY_RUNTIME' ? 'Silnik RDKit niedostępny (BLOCKED_BY_RUNTIME)' : 'Nieprawidłowy SMILES — nie udało się sparsować struktury' };
  }
  const d = rd.dossier;
  const candidate: Candidate = { id, name: entry.name, smiles: d.identity.smiles, props: propsFromDossier(d), alerts: (d.structuralAlerts ?? []).map((a) => a.name).filter(Boolean) };
  return { ok: true, id, candidate };
}

export interface RunBatchResult { candidates: Candidate[]; failed: BatchFail[]; aborted: boolean }

/**
 * Run a whole batch through the single pipeline. Never rejects on a bad molecule; a
 * caller gets `onResult` per item (to persist incrementally) and a summary at the end.
 */
export async function runBatch(entries: BatchEntry[], opts: RunBatchOptions = {}): Promise<RunBatchResult> {
  const { concurrency = 4, idPrefix = 'm', signal, onProgress, onResult } = opts;
  const total = entries.length;
  let done = 0, ok = 0, invalid = 0;
  const candidates: Candidate[] = [];
  const failed: BatchFail[] = [];

  await mapLimit(entries, concurrency, async (entry, i) => {
    const id = entry.id ?? `${idPrefix}${i}`;
    const res = await analyzeEntry(entry, id);
    done += 1;
    if (res.ok) { ok += 1; candidates.push(res.candidate); }
    else { invalid += 1; failed.push({ id, name: entry.name, smiles: entry.smiles, reason: res.reason }); }
    onResult?.(res, i);
    onProgress?.({ done, total, ok, invalid });
  }, signal);

  return { candidates, failed, aborted: Boolean(signal?.aborted) };
}
