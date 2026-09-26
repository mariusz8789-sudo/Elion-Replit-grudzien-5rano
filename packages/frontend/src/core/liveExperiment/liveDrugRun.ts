import { getCampaign, getProjectJob, getScienceRun, listCampaignCandidates, listCampaignEvents, preregisterExperiment, runCampaignStage, sealExperimentSession, startCampaign, verifyScienceRun } from '../backend/client';
import { projectDrugRun, type CampaignEventRecord, type DockingRunRecord, type LiveDrugRunState } from './drugRunState';
import { evaluateDrugHypothesis, getDrugHypothesis, resolveDrugHypothesis } from './drugHypothesis';
import type { CampaignCandidate } from '../backend/client';

/**
 * LIVE DRUG RUN — drives ONE real campaign through the existing backend pipeline and publishes its
 * read model as it changes. It starts nothing the backend would not start from `#/campaign`: the
 * campaign run (RDKit generation), then the existing multi-fidelity stage (ADMET-AI, Vina, PySCF) on
 * a budget of one candidate each, docking against the vetted protein target (PDB 1IEP, chain A).
 * A docking result's Science Run is fetched once by id so the state carries the real Vina pose. Every state it publishes is `projectDrugRun` over what the backend
 * persisted; the scientist in the lab, the bench hologram and the outcome panel all subscribe here.
 */

export type LivePhase = 'IDLE' | 'RUNNING_CAMPAIGN' | 'RUNNING_STAGE' | 'DONE' | 'FAILED';

/** What the server's scientific memory answered: the record's identity, or why there is none. */
export interface MemoryStatus {
  readonly status: string;
  readonly recordId: string | null;
  readonly chainHash: string | null;
  /** SESSION records only: how the server's own check of the session against the preregistration came out. */
  readonly check: string | null;
  readonly error: string | null;
}

export interface LiveDrugRun {
  readonly campaignId: string;
  readonly projectId: string;
  readonly phase: LivePhase;
  readonly state: LiveDrugRunState;
  readonly error: string | null;
  /** Measured wall time of the whole run, set when it ends (feeds the countdown of the next run). */
  readonly durationMs: number | null;
  /** The criteria as the SERVER stored them before the first engine ran. */
  readonly preregistration: MemoryStatus | null;
  /** The sealed result as the SERVER stored it, with its verdict check. */
  readonly sealed: MemoryStatus | null;
}

export const LIVE_DOCKING_TARGET = 'ABL1_1IEP';
export const LIVE_STAGE_CONFIG = {
  admet: { enabled: true },
  docking: { enabled: true, budget: 1, targetId: LIVE_DOCKING_TARGET, receptor: { exhaustiveness: 8, nPoses: 5 } },
  quantum: { enabled: true, budget: 1 },
} as const;

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
export async function startLiveDrugRun(opts: { readonly token: string; readonly projectId: string; readonly campaignId: string; readonly subject?: string; readonly pollMs?: number }): Promise<LiveDrugRun> {
  const existing = runs.get(opts.campaignId);
  if (existing && existing.phase !== 'FAILED') return existing;
  const { token, projectId, campaignId } = opts;
  const pollMs = opts.pollMs ?? 600;
  const startedAt = performance.now();
  let preregistration: MemoryStatus | null = null;
  let events: CampaignEventRecord[] = [];
  let candidates: CampaignCandidate[] = [];
  const dockingRuns = new Map<string, DockingRunRecord>();
  let maxGenerations = 1;
  let phase: LivePhase = 'IDLE';
  const emit = (jobRunning: boolean, error: string | null = null, done = false): LiveDrugRun => {
    const run: LiveDrugRun = {
      campaignId, projectId, phase, error,
      state: projectDrugRun({ events, candidates, maxGenerations, jobRunning, dockingRuns: [...dockingRuns.values()] }),
      durationMs: done ? Math.round(performance.now() - startedAt) : null,
      preregistration, sealed: runs.get(campaignId)?.sealed ?? null,
    };
    publish(run);
    return run;
  };
  const refresh = async (): Promise<void> => {
    const after = events.length ? events[events.length - 1]!.seq : 0;
    const [e, c] = await Promise.all([listCampaignEvents(token, projectId, campaignId, after), listCampaignCandidates(token, projectId, campaignId)]);
    if (e.ok) events = [...events, ...e.data];
    if (c.ok) candidates = c.data;
    const pending = events
      .filter((x) => x.type === 'STAGE_RESULT' && x.payload.stage === 'docking' && typeof x.payload.runId === 'string' && !dockingRuns.has(x.payload.runId as string))
      .map((x) => x.payload.runId as string);
    for (const runId of pending) {
      const run = await getScienceRun(token, projectId, campaignId, runId);
      if (run.ok) dockingRuns.set(runId, { id: run.data.id, outputs: run.data.outputs, provenance: run.data.provenance });
    }
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
    // PREREGISTRATION — the criteria go to the server BEFORE the first engine runs. The server refuses
    // one for a campaign that has already executed, so this is the only moment it can be written; a
    // refusal is recorded and shown rather than hidden, and the run still proceeds.
    const hypothesis = resolveDrugHypothesis(campaignId, opts.subject ?? String((campaign.ok ? (campaign.data as { objective?: string }).objective : '') ?? ''));
    const pre = await preregisterExperiment(token, projectId, campaignId, hypothesis);
    preregistration = pre.ok
      ? { status: pre.data.status, recordId: pre.data.preregistration.id, chainHash: pre.data.preregistration.chainHash, check: null, error: null }
      : { status: 'REFUSED', recordId: null, chainHash: null, check: null, error: pre.error ?? 'preregistration_failed' };
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
    const finished = emit(false, stageError, true);
    // The run is over: seal it into the server's memory, so the result survives this browser tab.
    await sealDrugRunSession({ token, projectId, campaignId });
    return runs.get(campaignId) ?? finished;
  } catch (error) {
    phase = 'FAILED';
    return emit(false, String((error as Error)?.message ?? error), true);
  }
}

/**
 * SEALING THE RUN INTO SERVER-SIDE MEMORY — the record that makes the experiment outlive the browser
 * tab. The body is derived from the canonical state and the frozen hypothesis: the verdict (computed
 * by the same pure rule the lab shows), the per-criterion observations, the state hash, the receptor
 * and pose checksums, the Science Run ids. The SERVER then checks it against the preregistration and
 * re-derives the verdict itself, so what comes back is verified, not echoed.
 *
 * Called once when the run ends, and again after an engine replay — a new record linked to the same
 * preregistration, never an edit of the first one (past evidence is immutable, §7).
 */
export async function sealDrugRunSession(opts: {
  readonly token: string; readonly projectId: string; readonly campaignId: string;
  readonly engineReplay?: EngineReplayVerdict | null;
}): Promise<MemoryStatus | null> {
  const run = runs.get(opts.campaignId);
  if (!run) return null;
  const hypothesis = getDrugHypothesis(opts.campaignId);
  if (!hypothesis) return null;
  const state = run.state;
  const focus = state.candidates.find((c) => c.pose) ?? state.candidates.find((c) => c.status === 'retained') ?? state.candidates[0] ?? null;
  const result = evaluateDrugHypothesis(hypothesis, state, focus);
  const runIds = [...new Set(state.candidates.flatMap((c) => Object.values(c.stages).map((m) => m?.runId).filter((id): id is string => Boolean(id))))];
  const target = state.target;
  const session = {
    subject: hypothesis.subject,
    hypothesisFingerprint: result.hypothesisFingerprint,
    verdict: result.verdict,
    rule: result.rule,
    stateHash: state.stateHash,
    criteria: result.criteria,
    target: target ? { targetId: target.targetId, pdbId: target.pdbId, chain: target.chain, sourceSha256: target.sourceSha256, receptorPdbqtSha256: target.receptorPdbqtSha256, center: target.center, boxSize: target.boxSize } : null,
    candidate: focus ? { smiles: focus.smiles, status: focus.status, poseSha256: focus.pose?.poseSha256 ?? null, dockingScore: focus.stages.docking?.value ?? null, endpoints: focus.stages.admet?.endpoints ?? null } : null,
    engines: hypothesis.plan.map((p) => ({ stage: p.stage, engine: p.engine, evidence: p.evidence })),
    evidence: [
      ...runIds.map((id) => ({ id: 'science-run', label: 'ScienceRun', detail: id, epistemic: 'REAL_ENGINE_OUTPUT' })),
      ...(target ? [{ id: 'receptor', label: 'Przygotowany receptor PDBQT (sha256)', detail: target.receptorPdbqtSha256, epistemic: 'REAL_ENGINE_OUTPUT' }] : []),
      ...(focus?.pose ? [{ id: 'pose', label: 'Poza dokowania (sha256)', detail: focus.pose.poseSha256, epistemic: 'REAL_ENGINE_OUTPUT' }] : []),
    ],
    blocked: state.blocked.map((b) => ({ stage: b.stage, blocker: b.blocker })),
    engineReplay: opts.engineReplay ?? null,
    durationMs: run.durationMs,
  };
  const sealed = await sealExperimentSession(opts.token, opts.projectId, opts.campaignId, session);
  const status: MemoryStatus = sealed.ok
    ? { status: sealed.data.status, recordId: sealed.data.session.id, chainHash: sealed.data.session.chainHash, check: sealed.data.session.preregCheck, error: null }
    : { status: 'REFUSED', recordId: null, chainHash: null, check: null, error: sealed.error ?? 'seal_failed' };
  const current = runs.get(opts.campaignId);
  if (current) publish({ ...current, sealed: status });
  return status;
}

/**
 * ENGINE REPLAY — re-executes the real docking engine for this run's persisted Science Run and
 * compares it with what was stored (backend `verifyScienceRun`: same receptor preparation, same
 * ligand, same seed). This is the strong replay: reproducing the projection only proves the read
 * model is pure, while this proves the ENGINE reproduces the pose and the score.
 */
export interface EngineReplayVerdict {
  readonly runId: string;
  readonly verdict: string;
  readonly engine: string;
  readonly originalHash: string | null;
  readonly replayHash: string | null;
}

export async function replayDrugRunEngines(opts: { readonly token: string; readonly projectId: string; readonly campaignId: string }): Promise<EngineReplayVerdict | { readonly error: string }> {
  const run = runs.get(opts.campaignId);
  const runId = run?.state.candidates.map((c) => c.stages.docking?.runId).find((id): id is string => Boolean(id));
  if (!runId) return { error: 'no_docking_run' };
  const r = await verifyScienceRun(opts.token, opts.projectId, opts.campaignId, runId);
  if (!r.ok) return { error: r.error ?? 'verify_failed' };
  const verdict: EngineReplayVerdict = {
    runId,
    verdict: r.data.verdict,
    engine: `${r.data.originalEngineVersion ?? '?'} → ${r.data.replayEngineVersion ?? '?'}`,
    originalHash: r.data.originalOutputHash,
    replayHash: r.data.replayOutputHash,
  };
  // The replay is new evidence about the same run: it is sealed as its own record, linked to the same
  // preregistration, rather than rewriting the record sealed when the run finished.
  await sealDrugRunSession({ ...opts, engineReplay: verdict });
  return verdict;
}

/** Test seam: forget every run (the store is module state). */
export function resetLiveDrugRunsForTest(): void { runs.clear(); }
