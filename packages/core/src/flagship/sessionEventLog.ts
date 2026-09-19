/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256hex, stableStringify } from '../knowledge/EvidenceLedger.js';

/**
 * SESSION EVENT LOG (D-130) — the delivered flagship pack's append-only,
 * hash-chained per-session trace, on the canonical SHA-256 (the same
 * `sha256hex`/`stableStringify` the EvidenceLedger chains with) instead of
 * the pack's reference FNV hash. Deterministic: with an injected clock and
 * id source, the same inputs produce the same chain; `replaySessionEvents`
 * folds the events into the session state and `verifySessionChain` proves
 * nobody edited a line. This is a trace of what happened in the session,
 * not a second Evidence Ledger: evidence goes to the ledger, the log keeps
 * the ledger's ids.
 */
export type FlagshipEventType =
  | 'SESSION_STARTED' | 'WORLD_CREATED' | 'MIRROR_STATE' | 'PORTAL_STATE' | 'TIME_MACHINE_CONFIGURED' | 'COSMOS_UPDATED'
  | 'EXPERIMENT_PLANNED' | 'EXPERIMENT_EXECUTED' | 'EVIDENCE_APPENDED' | 'TRUTH_ANSWERED' | 'CAPTURE_CREATED'
  | 'PERCEPTION_OBSERVED' | 'WORLD_MODEL_UPDATED' | 'REASONING_COMPLETED' | 'PLAN_CREATED' | 'ACTION_EXECUTED' | 'FALSIFICATION_COMPLETED' | 'AGENTIC_TRACE_COMMITTED';

export interface FlagshipEvent<T = unknown> { readonly seq: number; readonly sessionId: string; readonly type: FlagshipEventType; readonly at: number; readonly payload: T; readonly previousHash: string; readonly hash: string; }

export const EVENT_CHAIN_GENESIS = 'GENESIS';
export function eventHash(e: Omit<FlagshipEvent, 'hash'>): string { return sha256hex(stableStringify({ seq: e.seq, sessionId: e.sessionId, type: e.type, at: e.at, payload: e.payload, previousHash: e.previousHash })); }

export class SessionEventLog {
  private readonly streams = new Map<string, FlagshipEvent[]>();
  private readonly listeners = new Set<(e: FlagshipEvent) => void>();
  constructor(private readonly clock: { now(): number }) {}
  append<T>(sessionId: string, type: FlagshipEventType, payload: T): FlagshipEvent<T> {
    const stream = this.streams.get(sessionId) ?? [];
    const base = { seq: stream.length + 1, sessionId, type, at: this.clock.now(), payload: JSON.parse(JSON.stringify(payload ?? null)) as T, previousHash: stream.at(-1)?.hash ?? EVENT_CHAIN_GENESIS };
    const event: FlagshipEvent<T> = Object.freeze({ ...base, hash: eventHash(base) });
    stream.push(event); this.streams.set(sessionId, stream);
    for (const fn of this.listeners) fn(event);
    return event;
  }
  read(sessionId: string): readonly FlagshipEvent[] { return [...(this.streams.get(sessionId) ?? [])]; }
  sessions(): readonly string[] { return [...this.streams.keys()]; }
  onAppend(fn: (e: FlagshipEvent) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  /** Rebuild from persisted events (verified first; a broken chain is refused). */
  static fromEvents(clock: { now(): number }, events: readonly FlagshipEvent[]): SessionEventLog {
    const log = new SessionEventLog(clock);
    const bySession = new Map<string, FlagshipEvent[]>();
    for (const e of events) { const s = bySession.get(e.sessionId) ?? []; s.push(e); bySession.set(e.sessionId, s); }
    for (const [sessionId, stream] of bySession) { const v = verifySessionChain(stream); if (!v.ok) throw new Error(`SESSION_LOG_REJECTED:${sessionId}:${v.errors.join(',')}`); log.streams.set(sessionId, stream.map((e) => Object.freeze({ ...e }))); }
    return log;
  }
}

export function verifySessionChain(events: readonly FlagshipEvent[]): { ok: boolean; errors: readonly string[] } {
  const errors: string[] = []; let prev = EVENT_CHAIN_GENESIS;
  events.forEach((e, i) => {
    if (e.seq !== i + 1) errors.push(`SEQ_GAP@${i}`);
    if (e.previousHash !== prev) errors.push(`CHAIN_BREAK@${i}`);
    if (eventHash(e) !== e.hash) errors.push(`HASH_MISMATCH@${i}`);
    prev = e.hash;
  });
  return { ok: errors.length === 0, errors };
}

export interface FlagshipSessionState {
  readonly sessionId: string;
  readonly world: unknown | null; readonly mirror: unknown | null; readonly portal: unknown | null; readonly timeMachine: unknown | null;
  readonly cosmosUpdates: readonly unknown[]; readonly experiments: readonly unknown[]; readonly evidenceIds: readonly string[]; readonly captureIds: readonly string[];
  readonly lastAnswer: unknown | null; readonly agenticTrace: unknown | null; readonly route: readonly FlagshipEventType[]; readonly headHash: string;
}

/** Fold a session's events into its state; `route` is the ordered list of event types, `headHash` the chain head — two replays of the same log are equal by value. */
export function replaySessionEvents(events: readonly FlagshipEvent[]): FlagshipSessionState {
  let state: FlagshipSessionState = { sessionId: events[0]?.sessionId ?? 'unknown', world: null, mirror: null, portal: null, timeMachine: null, cosmosUpdates: [], experiments: [], evidenceIds: [], captureIds: [], lastAnswer: null, agenticTrace: null, route: [], headHash: EVENT_CHAIN_GENESIS };
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    switch (e.type) {
      case 'WORLD_CREATED': state = { ...state, world: e.payload }; break;
      case 'MIRROR_STATE': state = { ...state, mirror: e.payload }; break;
      case 'PORTAL_STATE': state = { ...state, portal: e.payload }; break;
      case 'TIME_MACHINE_CONFIGURED': state = { ...state, timeMachine: e.payload }; break;
      case 'COSMOS_UPDATED': state = { ...state, cosmosUpdates: [...state.cosmosUpdates, e.payload] }; break;
      case 'EXPERIMENT_EXECUTED': state = { ...state, experiments: [...state.experiments, e.payload] }; break;
      case 'EVIDENCE_APPENDED': state = { ...state, evidenceIds: [...state.evidenceIds, String(p?.id ?? p?.recordId ?? '')] }; break;
      case 'TRUTH_ANSWERED': state = { ...state, lastAnswer: e.payload }; break;
      case 'CAPTURE_CREATED': state = { ...state, captureIds: [...state.captureIds, String(p?.captureId ?? '')] }; break;
      case 'AGENTIC_TRACE_COMMITTED': state = { ...state, agenticTrace: e.payload }; break;
      default: break;
    }
    state = { ...state, route: [...state.route, e.type], headHash: e.hash };
  }
  return state;
}
