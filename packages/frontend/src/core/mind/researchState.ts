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
  | 'TERMINAL';

export interface ResearchStateEvent {
  readonly seq: number;
  readonly type: ResearchStateEventType;
  /** Provenance only (D-040 clock rule) — supplied by the caller, never read from the system clock, and never an input to a fingerprint. */
  readonly at: string;
  readonly payloadFingerprint: string;
  readonly transitionFingerprint: string;
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
    const event: ResearchStateEvent = Object.freeze({ seq, type, at, payloadFingerprint, transitionFingerprint });
    await this.store.put(`ev-${String(seq).padStart(6, '0')}`, event);
    this.head = transitionFingerprint;
    this.appended += 1;
    return event;
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
    const events = await this.events();
    let previous = GENESIS_HEAD;
    for (const [index, event] of events.entries()) {
      if (event.seq !== index) return false;
      if (transitionOf(previous, event.type, event.payloadFingerprint, event.seq) !== event.transitionFingerprint) return false;
      previous = event.transitionFingerprint;
    }
    return previous === this.head;
  }
}
