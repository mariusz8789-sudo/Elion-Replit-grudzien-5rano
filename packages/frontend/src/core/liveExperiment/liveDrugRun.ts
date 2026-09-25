import { getCampaign, getProjectJob, listCampaignCandidates, listCampaignEvents, runCampaignStage, startCampaign } from '../backend/client';
import { projectDrugRun, type CampaignEventRecord, type LiveDrugRunState } from './drugRunState';
import type { CampaignCandidate } from '../backend/client';

/**
 * LIVE DRUG RUN — drives ONE real campaign through the existing backend pipeline and publishes its
 * read model as it changes. It starts nothing the backend would not start from `#/campaign`: the
 * campaign run (RDKit generation), then the existing multi-fidelity stage (ADMET-AI, Vina, PySCF) on
 * a budget of one candidate each. Every state it publishes is `projectDrugRun` over what the backend
 * persisted; the scientist in the lab, the bench hologram and the outcome panel all subscribe here.
 */

export type LivePhase = 'IDLE' | 'RUNNING_CAMPAIGN' | 'RUNNING_STAGE' | 'DONE' | 'FAILED';

export interface LiveDrugRun {
  readonly campaignId: string;
  readonly projectId: string;
  readonly phase: LivePhase;
  readonly state: LiveDrugRunState;
  readonly error: string | null;
  /** Measured wall time of the whole run, set when it ends (feeds the countdown of the next run). */
  readonly durationMs: number | null;
}

export const LIVE_STAGE_CONFIG = { admet: { enabled: true }, docking: { enabled: true, budget: 1 }, quantum: { enabled: true, budget: 1 } } as const;

const runs = new Map<string, LiveDrugRun>();
const listeners = new Set<(run: LiveDrugRun) => void>();

export function getLiveDrugRun(campaignId: string): LiveDrugRun | null { return runs.get(campaignId) ?? null; }
export function subscribeLiveDrugRuns(listener: (run: LiveDrugRun) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
function publish(run: LiveDrugRun): void { runs.set(run.campaignId, run); for (const l of listeners) l(run); }

/** The scientist's gate: the bench keeps EXECUTING until the real run has finished (or failed). */
export function liveDrugRunGate(campaignId: string): { readonly ready: boolean; readonly progress: number } {
  const run = runs.get(campaignId);
  if (!run || run.phase === 'IDLE') return { ready: false, progress: 0 };
  if (run.phase === 'DONE' || run.phase === 'FAILED') return { ready: true, progress: 1 };
  const p = run.state.progress;
  const units = [p.generation, p.admet, p.docking, p.quantum];
  const planned = units.reduce((a, u) => a + u.planned, 0);
  const done = units.reduce((a, u) => a + u.done, 0);
  return { ready: false, progress: planned > 0 ? Math.min(0.99, done / planned) : 0 };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs the campaign and its stage, polling persisted state every `pollMs`. Idempotent per campaign:
 * a second call while a run exists returns the existing one.
 */
export async function startLiveDrugRun(opts: { readonly token: string; readonly projectId: string; readonly campaignId: string; readonly pollMs?: number }): Promise<LiveDrugRun> {
  const existing = runs.get(opts.campaignId);
  if (existing && existing.phase !== 'FAILED') return existing;
  const { token, projectId, campaignId } = opts;
  const pollMs = opts.pollMs ?? 600;
  const startedAt = performance.now();
  let events: CampaignEventRecord[] = [];
  let candidates: CampaignCandidate[] = [];
  let maxGenerations = 1;
  let phase: LivePhase = 'IDLE';
  const emit = (jobRunning: boolean, error: string | null = null, done = false): LiveDrugRun => {
    const run: LiveDrugRun = {
      campaignId, projectId, phase, error,
      state: projectDrugRun({ events, candidates, maxGenerations, jobRunning }),
      durationMs: done ? Math.round(performance.now() - startedAt) : null,
    };
    publish(run);
    return run;
  };
  const refresh = async (): Promise<void> => {
    const after = events.length ? events[events.length - 1]!.seq : 0;
    const [e, c] = await Promise.all([listCampaignEvents(token, projectId, campaignId, after), listCampaignCandidates(token, projectId, campaignId)]);
    if (e.ok) events = [...events, ...e.data];
    if (c.ok) candidates = c.data;
  };
  const follow = async (jobId: string): Promise<string | null> => {
    for (;;) {
      await wait(pollMs);
      const job = await getProjectJob(token, projectId, jobId);
      await refresh();
      if (!job.ok) return `job_unreadable:${job.error ?? 'unknown'}`;
      if (job.data.status === 'completed') return null;
      if (job.data.status === 'failed' || job.data.status === 'cancelled') return `${job.data.status}:${job.data.error ?? ''}`;
      emit(true);
    }
  };
  // Published synchronously, so a caller polling every frame never starts the same run twice.
  phase = 'RUNNING_CAMPAIGN'; emit(true);
  try {
    const campaign = await getCampaign(token, projectId, campaignId);
    if (campaign.ok) maxGenerations = Number((campaign.data as { budget?: { maxGenerations?: number } }).budget?.maxGenerations ?? 1);
    emit(true);
    const started = await startCampaign(token, projectId, campaignId);
    if (!started.ok) { phase = 'FAILED'; return emit(false, `start_failed:${started.error ?? ''}`, true); }
    const campaignError = await follow(started.data.jobId);
    if (campaignError) { phase = 'FAILED'; return emit(false, campaignError, true); }
    phase = 'RUNNING_STAGE'; emit(true);
    const stage = await runCampaignStage(token, projectId, campaignId, LIVE_STAGE_CONFIG);
    if (!stage.ok) { phase = 'FAILED'; return emit(false, `stage_failed:${stage.error ?? ''}`, true); }
    const stageError = await follow(stage.data.jobId);
    await refresh();
    phase = stageError ? 'FAILED' : 'DONE';
    return emit(false, stageError, true);
  } catch (error) {
    phase = 'FAILED';
    return emit(false, String((error as Error)?.message ?? error), true);
  }
}

/** Test seam: forget every run (the store is module state). */
export function resetLiveDrugRunsForTest(): void { runs.clear(); }
