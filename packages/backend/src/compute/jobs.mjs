/**
 * System zadań obliczeniowych (P5) — LEKKA abstrakcja w procesie, bez Redis/
 * Kubernetes. Zadanie ma realny cykl życia: queued → running → completed/failed/
 * cancelled, z postępem, wynikiem i błędem. Kolejka = wiersze 'queued' w bazie,
 * więc przyszły osobny worker może je konsumować bez zmiany kontraktu.
 *
 * Wykonanie jest asynchroniczne (setImmediate): API zwraca natychmiast zadanie
 * 'queued', a handler liczy w tle, aktualizując postęp. Anulowanie: flaga w
 * pamięci + status 'cancelled' w bazie; handlery sprawdzają ją w bezpiecznych
 * punktach (między kandydatami) — „cancel where safe".
 */

import { getJob, updateJob, listCandidates, getTarget } from '../store.mjs';
import { buildCandidatePassport, rankCandidates } from './drugDiscovery.mjs';
import { runCampaign } from '../campaign/orchestrator.mjs';

const cancelRequested = new Set();

export function requestCancel(jobId) {
  cancelRequested.add(jobId);
}

/**
 * Rejestr handlerów zadań. Każdy: async ({ db, job, progress, cancelled }) →
 * { result, runIds }. `progress(0..1)` aktualizuje postęp; `cancelled()` mówi,
 * czy poproszono o anulowanie.
 */
export const JOB_HANDLERS = {
  /**
   * Wsadowa ocena kandydatów: buduje paszport każdego kandydata projektu
   * (opcjonalnie zawężone do celu), liczy ranking. Postęp = i/n. Wykorzystuje
   * REALNY silnik obliczeniowy (masa molowa itd.), zero fałszowania.
   */
  'batch-candidate-eval': async ({ db, job, progress, cancelled }) => {
    const projectId = job.projectId;
    const targetId = job.params?.targetId ?? null;
    const candidates = listCandidates(db, projectId, targetId);
    const passports = [];
    const runIds = [];
    for (let i = 0; i < candidates.length; i++) {
      if (cancelled()) return { cancelled: true, runIds };
      const c = candidates[i];
      const target = c.targetId ? getTarget(db, c.targetId) : null;
      const passport = buildCandidatePassport(c, target);
      passports.push(passport);
      runIds.push(...passport.runIds);
      progress(candidates.length ? (i + 1) / candidates.length : 1);
      await Promise.resolve(); // punkt ustąpienia — pozwala anulować między kandydatami
    }
    return { result: { count: passports.length, ranking: rankCandidates(passports) }, runIds };
  },

  /**
   * Wykonanie Kampanii Naukowej (Scientific Acceleration Engine). Uruchamia
   * REALNY orchestrator (RDKit) na utrwalonej kampanii; anulowanie sprawdzane
   * między generacjami. Zero fałszywego postępu — postęp = generacja/budżet.
   */
  'campaign-run': async ({ db, job, progress, cancelled }) => {
    const campaignId = job.params?.campaignId;
    if (!campaignId) throw new Error('missing_campaignId');
    const summary = runCampaign(db, campaignId, {
      shouldCancel: () => cancelled(),
      onProgress: (frac) => progress(frac),
    });
    if (summary.cancelled) return { cancelled: true, runIds: [] };
    return { result: summary, runIds: [] };
  },
};

/** Wykonuje zadanie do końca, aktualizując status/postęp/wynik w bazie. */
export async function runJob(db, jobId, handlers = JOB_HANDLERS) {
  const job = getJob(db, jobId);
  // Idempotentne: tylko zadanie 'queued' rusza. Chroni przed podwójnym
  // uruchomieniem (np. zaplanowany setImmediate + jawne wywołanie w teście).
  if (!job || job.status !== 'queued') return;
  const handler = handlers[job.type];
  if (!handler) { updateJob(db, jobId, { status: 'failed', error: `unknown_job_type: ${job.type}` }); return; }

  updateJob(db, jobId, { status: 'running' });
  try {
    const out = await handler({
      db, job,
      progress: (p) => updateJob(db, jobId, { progress: Math.max(0, Math.min(1, p)) }),
      cancelled: () => cancelRequested.has(jobId) || getJob(db, jobId)?.status === 'cancelled',
    });
    if (out?.cancelled || cancelRequested.has(jobId)) {
      updateJob(db, jobId, { status: 'cancelled', runIds: out?.runIds ?? [] });
    } else {
      updateJob(db, jobId, { status: 'completed', progress: 1, result: out.result, runIds: out.runIds ?? [] });
    }
  } catch (err) {
    updateJob(db, jobId, { status: 'failed', error: String(err?.message ?? err) });
  } finally {
    cancelRequested.delete(jobId);
  }
}

/**
 * Kolejkuje zadanie i uruchamia je asynchronicznie (setImmediate). Zwraca rekord
 * 'queued' od razu. `runNow` (dla testów) wykonuje synchronicznie i zwraca finalny.
 */
export async function enqueueJob(db, jobId, { runNow = false, handlers = JOB_HANDLERS } = {}) {
  if (runNow) {
    await runJob(db, jobId, handlers);
    return getJob(db, jobId);
  }
  setImmediate(() => { void runJob(db, jobId, handlers); });
  return getJob(db, jobId);
}
