import type { EpistemicStatus, ProvenanceRef } from "../common/types.js";

export interface EvidenceEvent {
  id: string;
  streamId: string;
  sequence: number;
  type: string;
  createdAt: string;
  epistemicStatus: EpistemicStatus;
  payload: unknown;
  provenance: ProvenanceRef[];
  previousHash: string | null;
  hash: string;
}

export interface EvidenceSnapshot {
  schemaVersion: "1";
  events: EvidenceEvent[];
  headHash: string | null;
}

export interface ReplayResult<T> {
  state: T;
  appliedEvents: number;
  headHash: string | null;
}
