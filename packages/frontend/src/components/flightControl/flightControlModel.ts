import {
  getCognitiveState, listResearchRuns,
  type ApiResult, type CognitiveResearchRunJob, type GenesisCognitiveState, type ResearchRunControlAction,
  type ResearchRunControlResult, type ResearchRunQueueJob, type ResearchRunSummary, type ScienceFlight,
} from '../../core/backend/client';
import type { Locale } from '../../core/i18n';
import { fcCode, fcText, type Tone } from './flightControlText';

/**
 * The data side of #/flight-control. Nothing here invents a value: every field is read from
 * `GET /cognitive-state` (BYT Flight Control, the lease-queue jobs, blocked capabilities, integrity)
 * or `GET /research-runs`, and a section the server did not provide stays empty with its reason.
 */

export type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;

export interface FlightControlSnapshot {
  state: GenesisCognitiveState;
  /** null when the run list request failed; the failure is kept beside it, the rest of the screen still renders. */
  runs: ResearchRunSummary[] | null;
  runsFailure: ApiFailure | null;
  loadedAt: number;
}

/** Cognitive state is the backbone; the run list is a second request whose failure is shown, not hidden. */
export async function loadFlightControl(token: string, projectId: string, now: () => number = Date.now): Promise<{ ok: true; snapshot: FlightControlSnapshot } | ApiFailure> {
  const [state, runs] = await Promise.all([getCognitiveState(token, projectId), listResearchRuns(token, projectId)]);
  if (!state.ok) return state;
  return {
    ok: true,
    snapshot: {
      state: state.data,
      runs: runs.ok ? runs.data.researchRuns : null,
      runsFailure: runs.ok ? null : runs,
      loadedAt: now(),
    },
  };
}

const researchJobs = (rows: readonly { kind: string; id: string; [key: string]: unknown }[]): CognitiveResearchRunJob[] =>
  rows.flatMap((row) => (row.kind === 'RESEARCH_RUN_JOB' && typeof row.researchRunId === 'string' ? [row as unknown as CognitiveResearchRunJob] : []));

/** Lease-queue jobs of ResearchRuns: QUEUED rows sit in pendingExperiments, CLAIMED rows (worker + lease) in runningExperiments. */
export function researchJobsOf(state: GenesisCognitiveState): { queued: CognitiveResearchRunJob[]; claimed: CognitiveResearchRunJob[] } {
  return { queued: researchJobs(state.pendingExperiments), claimed: researchJobs(state.runningExperiments) };
}

/** true / false from the server's chain verification, or null when the server listed no integrity row for the run. */
export function runIntegrity(state: GenesisCognitiveState, researchRunId: string): boolean | null {
  const row = state.integrity.researchRuns.find((r) => r.runId === researchRunId)
    ?? state.byt.integrity.researchRuns.find((r) => r.researchRunId === researchRunId);
  return row ? row.ok === true : null;
}

export type BlockedDependency =
  | { kind: 'ENGINE_RUNTIME' | 'NO_ADAPTER'; id: string; blockedBy: string | null }
  | { kind: 'FLIGHT'; id: string; layer: string; code: string; reason: string | null; flight: ScienceFlight };

const DEPENDENCY_LAYERS = new Set(['CAPABILITY_BINDING', 'RUNTIME', 'WORKER_TRANSPORT']);

/**
 * What the data says is blocking work: engines/capabilities from the self model and flights whose failure
 * the server attributed to a dependency layer. `selfModelKnown` is false when the server answered UNKNOWN.
 */
export function blockedDependenciesOf(state: GenesisCognitiveState): { selfModelKnown: boolean; items: BlockedDependency[] } {
  const caps = state.blockedCapabilities;
  const selfModelKnown = Array.isArray(caps);
  const items: BlockedDependency[] = selfModelKnown
    ? caps.map((c) => ({ kind: c.kind === 'NO_ADAPTER' ? 'NO_ADAPTER' as const : 'ENGINE_RUNTIME' as const, id: c.id, blockedBy: c.blockedBy }))
    : [];
  for (const flight of state.byt.scienceFlightControl.flights) {
    const f = flight.failureAttribution;
    if (f && DEPENDENCY_LAYERS.has(f.layer)) {
      items.push({ kind: 'FLIGHT', id: flight.executionId ?? flight.flightFingerprint, layer: f.layer, code: f.code, reason: f.reason ?? null, flight });
    }
  }
  return { selfModelKnown, items };
}

export interface Notice {
  tone: Tone;
  lines: string[];
  /** Server codes and ids, shown under Technical details. */
  technical: string[];
}

/** What a pause, resume or cancel did, in plain words. Pause ALWAYS says that a job already executing finishes. */
export function describeControl(action: ResearchRunControlAction, result: ResearchRunControlResult, locale: Locale): Notice {
  const q = result.queue ?? { withdrawn: [], inFlight: [], requeued: [], refused: [] };
  const lines: string[] = [];
  if (action === 'pause') lines.push(fcText('pausedDone', locale), fcText('pausedInFlight', locale));
  if (action === 'resume') lines.push(fcText('resumedDone', locale));
  if (action === 'cancel') lines.push(fcText('cancelledDone', locale));
  if (q.withdrawn.length) lines.push(`${fcText('qWithdrawn', locale)}: ${q.withdrawn.length}`);
  if (q.inFlight.length) lines.push(`${fcText('qInFlight', locale)}: ${q.inFlight.length}`);
  if (q.requeued.length) lines.push(`${fcText('qRequeued', locale)}: ${q.requeued.length}`);
  if (q.refused.length) lines.push(`${fcText('qRefused', locale)}: ${q.refused.length}`);
  return {
    tone: q.refused.length ? 'warn' : 'good',
    lines,
    technical: [
      `status: ${result.status}`,
      ...q.withdrawn.map((id) => `withdrawn: ${id}`),
      ...q.inFlight.map((id) => `inFlight: ${id}`),
      ...q.requeued.map((id) => `requeued: ${id}`),
      ...q.refused.map((id) => `refused: ${id}`),
    ],
  };
}

/** A single job withdrawn from the lease queue. The new state is the server's, not assumed. */
export function describeJobCancel(job: ResearchRunQueueJob, locale: Locale): Notice {
  return {
    tone: job.state === 'CANCELLED' ? 'good' : 'warn',
    lines: [job.state === 'CANCELLED' ? fcText('jobCancelledDone', locale) : `${fcText('laneFinished', locale)}: ${fcCode('jobState', job.state, locale)}`],
    technical: [`jobId: ${job.jobId}`, `state: ${job.state}`, ...(job.cancelReason ? [`cancelReason: ${job.cancelReason}`] : [])],
  };
}

/** A refusal or transport failure, told as it is: the reason in words, the raw code under Technical details. */
export function describeFailure(failure: ApiFailure, locale: Locale): Notice {
  const body = (failure.responseBody ?? null) as { from?: unknown; reason?: unknown } | null;
  let line: string;
  if (failure.status === 0) line = fcText('errOffline', locale);
  else if (failure.status === 401) line = fcText('errSignedOut', locale);
  else if (failure.status === 403) line = fcText('errForbidden', locale);
  else if (failure.status === 404) line = fcText('errNotFound', locale);
  else if (failure.error === 'INVALID_CONTROL_TRANSITION' && typeof body?.from === 'string') line = `${fcText('errTransition', locale)} „${fcCode('runStatus', body.from, locale)}”.`;
  else line = fcText('errOther', locale);
  const technical = [`${fcText('errCode', locale)}: ${failure.status || '—'} · ${failure.error}`];
  if (typeof body?.reason === 'string' && body.reason) technical.push(`reason: ${body.reason}`);
  return { tone: 'bad', lines: [line], technical };
}

/** Lease time in plain words, against a `now` captured at load time so the render stays pure. */
export function leaseText(leaseExpiresAt: number | null | undefined, now: number, locale: Locale): { text: string; expired: boolean } {
  if (typeof leaseExpiresAt !== 'number') return { text: fcText('noLease', locale), expired: false };
  const time = new Date(leaseExpiresAt).toLocaleTimeString(locale === 'pl' ? 'pl-PL' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return leaseExpiresAt <= now ? { text: `${time} · ${fcText('leaseExpired', locale)}`, expired: true } : { text: time, expired: false };
}

export function formatDateTime(ms: number | string | null | undefined, locale: Locale): string {
  if (ms === null || ms === undefined) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  return d.toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
