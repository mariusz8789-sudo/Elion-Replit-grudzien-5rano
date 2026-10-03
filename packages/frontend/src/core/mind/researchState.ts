import { InMemoryRecordStore, type KeyedRecordStore } from '../provenance/recordStore';
import { canonicalJson, fnv1a } from '../events/hash';

/**
 * RESEARCH STATE LOG (docs/DECISIONS.md D-060) — append-only, hash-chained,
 * replayable.
 *
 * WHY NEW. Verified by repo-wide grep: no `ResearchState` module exists. The
 * de-facto state is split across `scienceMemory.ts` (per-artefact
 * persistence), `agent/discoveryStrategy.ts::StrategyRun` (normalized run
 * shape) and `agent/epistemicStateGraph.ts` (belief graph). This assembles a
 * transition log OVER those; it re-persists none of them and adds no storage
 * mechanism of its own — the backing store is the existing
 * `provenance/recordStore.ts::KeyedRecordStore`.
 *
 * WHAT THE CHAIN BUYS. Each event's `transitionFingerprint` covers the
 * PREVIOUS head, so history cannot be rewritten invisibly: editing,
 * reordering or dropping any event breaks `verifyChain()`. That is the
 * mechanical meaning of "state transitions must be replayable and never
 * mutated silently".
 */

export type ResearchStateEventType =
  | 'PROBLEM_FORMALIZED'
  | 'KNOWLEDGE_SNAPSHOT'
  | 'HYPOTHESES_GENERATED'
  | 'PREDICTIONS_FROZEN'
  | 'EXPERIMENT_HANDOFF'
  | 'EVIDENCE_UPDATE'
  | 'SELF_FALSIFICATION'
  | 'NEXT_EXPERIMENT'
  | 'GENERATED_ANALYSIS_PROPOSED'
  | 'GENERATED_ANALYSIS_EXECUTED'
  | 'GENERATED_ANALYSIS_REPLAYED'
  | 'TERMINAL';

export interface ResearchStateEvent {
  readonly seq: number;
  readonly type: ResearchStateEventType;
  /** Provenance only (D-040 clock rule) — supplied by the caller, never read from the system clock, and never an input to a fingerprint. */
  readonly at: string;
  /**
   * ENTITY-0: the payload itself is kept, not only its fingerprint, so a restarted process can
   * recover WHAT the Mind was working on (problem, hypotheses, frozen predictions, evidence refs,
   * next experiment, terminal) — not merely prove that something happened.
   */
  readonly payload: unknown;
  readonly payloadFingerprint: string;
  readonly transitionFingerprint: string;
}

/** Raised when a persisted log does not re-verify. Never repaired automatically. */
export class ResearchStateIntegrityError extends Error {
  readonly code = 'STATE_INTEGRITY_FAILURE' as const;
  constructor(public readonly brokenAt: number, public readonly reason: string) {
    super(`STATE_INTEGRITY_FAILURE: research state chain broken at event ${brokenAt} (${reason}).`);
    this.name = 'ResearchStateIntegrityError';
  }
}

/**
 * What a restarted Mind needs to continue: the latest payload of each kind, every evidence
 * update in order, and the chain head the next append must extend. A reconstruction of the log,
 * never a second store.
 */
export interface ResearchStateSnapshot {
  readonly eventCount: number;
  readonly head: string;
  readonly problem: unknown | null;
  readonly knowledge: unknown | null;
  readonly hypotheses: unknown | null;
  readonly frozenPredictions: unknown | null;
  readonly lastHandoff: unknown | null;
  readonly evidenceUpdates: readonly unknown[];
  readonly selfFalsification: unknown | null;
  readonly nextExperiment: unknown | null;
  readonly terminal: unknown | null;
}

/** The store key of event `seq` — shared with the backend-backed store so both address events alike. */
export function researchStateKey(seq: number): string {
  return `ev-${String(seq).padStart(6, '0')}`;
}

const GENESIS_HEAD = fnv1a(canonicalJson({ genesis: 'research-state-v1' }));

function transitionOf(previousHead: string, type: ResearchStateEventType, payloadFingerprint: string, seq: number): string {
  return fnv1a(canonicalJson({ prev: previousHead, type, payloadFingerprint, seq }));
}

export class ResearchStateLog {
  private head: string = GENESIS_HEAD;
  private appended = 0;

  constructor(private readonly store: KeyedRecordStore<ResearchStateEvent> = new InMemoryRecordStore<ResearchStateEvent>()) {}

  async append(type: ResearchStateEventType, at: string, payload: unknown): Promise<ResearchStateEvent> {
    const payloadFingerprint = fnv1a(canonicalJson(payload));
    const seq = this.appended;
    const transitionFingerprint = transitionOf(this.head, type, payloadFingerprint, seq);
    const stored = JSON.parse(canonicalJson(payload)) as unknown;
    const event: ResearchStateEvent = Object.freeze({ seq, type, at, payload: stored, payloadFingerprint, transitionFingerprint });
    await this.store.put(researchStateKey(seq), event);
    this.head = transitionFingerprint;
    this.appended += 1;
    return event;
  }

  /**
   * Re-opens a log from a store that may already hold events (a restart). The whole chain is
   * re-verified, payloads included, before the log accepts a single new event; any break throws
   * `ResearchStateIntegrityError` and nothing is written.
   */
  static async open(store: KeyedRecordStore<ResearchStateEvent>): Promise<ResearchStateLog> {
    const log = new ResearchStateLog(store);
    const events = await log.events();
    const check = checkChain(events);
    if (!check.ok) throw new ResearchStateIntegrityError(check.brokenAt, check.reason);
    log.head = check.head;
    log.appended = events.length;
    return log;
  }

  headFingerprint(): string {
    return this.head;
  }

  async events(): Promise<readonly ResearchStateEvent[]> {
    const keys = await this.store.list();
    const loaded = await Promise.all(keys.map((key) => this.store.get(key)));
    return loaded.filter((event): event is ResearchStateEvent => event !== null).sort((a, b) => a.seq - b.seq);
  }

  /** Recomputes the whole chain from the genesis head. False if any event was edited, reordered, dropped, or if the head no longer matches. */
  async verifyChain(): Promise<boolean> {
    const check = checkChain(await this.events());
    return check.ok && check.head === this.head;
  }

  /** Verifies the chain, then rebuilds what the Mind was working on. Throws on a broken chain. */
  async snapshot(): Promise<ResearchStateSnapshot> {
    const events = await this.events();
    const check = checkChain(events);
    if (!check.ok) throw new ResearchStateIntegrityError(check.brokenAt, check.reason);
    const last = (type: ResearchStateEventType): unknown | null => {
      for (let i = events.length - 1; i >= 0; i -= 1) if (events[i]!.type === type) return events[i]!.payload;
      return null;
    };
    return {
      eventCount: events.length,
      head: check.head,
      problem: last('PROBLEM_FORMALIZED'),
      knowledge: last('KNOWLEDGE_SNAPSHOT'),
      hypotheses: last('HYPOTHESES_GENERATED'),
      frozenPredictions: last('PREDICTIONS_FROZEN'),
      lastHandoff: last('EXPERIMENT_HANDOFF'),
      evidenceUpdates: events.filter((event) => event.type === 'EVIDENCE_UPDATE').map((event) => event.payload),
      selfFalsification: last('SELF_FALSIFICATION'),
      nextExperiment: last('NEXT_EXPERIMENT'),
      terminal: last('TERMINAL'),
    };
  }
}

type ChainCheck = { readonly ok: true; readonly head: string } | { readonly ok: false; readonly brokenAt: number; readonly reason: string };

/** The one chain rule, shared by `verifyChain`, `open` and `snapshot` (and mirrored by backend `agentRun.mjs`). */
function checkChain(events: readonly ResearchStateEvent[]): ChainCheck {
  let previous = GENESIS_HEAD;
  for (const [index, event] of events.entries()) {
    if (event.seq !== index) return { ok: false, brokenAt: index, reason: 'sequence_gap' };
    if ('payload' in event && fnv1a(canonicalJson(event.payload)) !== event.payloadFingerprint) return { ok: false, brokenAt: index, reason: 'payload_fingerprint_mismatch' };
    if (transitionOf(previous, event.type, event.payloadFingerprint, event.seq) !== event.transitionFingerprint) return { ok: false, brokenAt: index, reason: 'transition_fingerprint_mismatch' };
    previous = event.transitionFingerprint;
  }
  return { ok: true, head: previous };
}
