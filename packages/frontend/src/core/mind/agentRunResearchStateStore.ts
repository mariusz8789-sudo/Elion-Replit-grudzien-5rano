import type { KeyedRecordStore } from '../provenance/recordStore';
import { appendPersistedResearchStateEvent, getPersistedResearchState, type PersistedResearchState } from '../backend/client';
import { ResearchStateIntegrityError, researchStateKey, type ResearchStateEvent } from './researchState';

/**
 * ENTITY-0 — the durable home of `ResearchStateLog`: the backend's existing agent-run steps
 * (`backend/src/agentRun.mjs`, `/api/projects/:id/agent-runs/:rid/research-state`). This is a
 * `KeyedRecordStore` like any other, so the log itself is unchanged; it only stops living in RAM.
 *
 * Append-only end to end: `put` can only extend the log (the server refuses a rewrite or a gap),
 * `delete` always throws, and a read whose chain the server could not re-verify fails closed
 * with `STATE_INTEGRITY_FAILURE` before the client even looks at the events.
 */
export interface ResearchStateTransport {
  read(): Promise<PersistedResearchState>;
  append(event: ResearchStateEvent): Promise<void>;
}

export class ResearchStateAppendOnlyError extends Error {
  constructor(id: string) {
    super(`Research state is append-only: event "${id}" cannot be deleted.`);
    this.name = 'ResearchStateAppendOnlyError';
  }
}

export class ResearchStatePersistenceError extends Error {
  constructor(operation: 'read' | 'append', public readonly status: number, public readonly error: string) {
    super(`Research state ${operation} failed (${status} ${error}); nothing was assumed saved.`);
    this.name = 'ResearchStatePersistenceError';
  }
}

export class AgentRunResearchStateStore implements KeyedRecordStore<ResearchStateEvent> {
  constructor(private readonly transport: ResearchStateTransport) {}

  private async readEvents(): Promise<readonly ResearchStateEvent[]> {
    const state = await this.transport.read();
    if (!state.chain.ok) throw new ResearchStateIntegrityError(state.chain.brokenAt ?? -1, state.chain.reason ?? 'server_chain_check_failed');
    return state.events as readonly ResearchStateEvent[];
  }

  async put(id: string, record: ResearchStateEvent): Promise<void> {
    if (id !== researchStateKey(record.seq)) throw new Error(`Research state key "${id}" does not match event seq ${record.seq}.`);
    await this.transport.append(record);
  }

  async get(id: string): Promise<ResearchStateEvent | null> {
    return (await this.readEvents()).find((event) => researchStateKey(event.seq) === id) ?? null;
  }

  async list(): Promise<readonly string[]> {
    return (await this.readEvents()).map((event) => researchStateKey(event.seq));
  }

  async delete(id: string): Promise<void> {
    throw new ResearchStateAppendOnlyError(id);
  }
}

/** The real transport: the signed-in user's project, one agent run. */
export function backendResearchStateTransport(token: string, projectId: string, runId: string): ResearchStateTransport {
  return {
    async read() {
      const r = await getPersistedResearchState(token, projectId, runId);
      if (!r.ok) throw new ResearchStatePersistenceError('read', r.status, r.error);
      return r.data;
    },
    async append(event) {
      const r = await appendPersistedResearchStateEvent(token, projectId, runId, event);
      if (!r.ok) {
        if (r.error === 'state_integrity_failure') throw new ResearchStateIntegrityError(-1, 'server_refused_append');
        throw new ResearchStatePersistenceError('append', r.status, r.error);
      }
    },
  };
}
