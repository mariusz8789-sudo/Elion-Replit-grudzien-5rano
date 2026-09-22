import type { EvidenceEvent, ReplayResult } from "./types.js";

export interface Reducer<T> {
  initial(): T;
  apply(state: T, event: EvidenceEvent): T;
}

export class ReplayEngine {
  replay<T>(events: readonly EvidenceEvent[], reducer: Reducer<T>): ReplayResult<T> {
    let state = reducer.initial();
    for (const event of events) state = reducer.apply(state, event);
    return { state, appliedEvents: events.length, headHash: events.at(-1)?.hash ?? null };
  }
}
