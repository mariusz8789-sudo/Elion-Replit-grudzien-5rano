import type { ClockPort, EpistemicStatus, ProvenanceRef } from "../common/types.js";
import { canonicalJson, type HashPort } from "../common/stable.js";
import type { EvidenceEvent, EvidenceSnapshot } from "./types.js";

export class EvidenceLedgerEngine {
  private readonly events: EvidenceEvent[] = [];

  constructor(private readonly hash: HashPort, private readonly clock: ClockPort) {}

  append(input: {
    streamId: string;
    type: string;
    epistemicStatus: EpistemicStatus;
    payload: unknown;
    provenance?: ProvenanceRef[];
  }): EvidenceEvent {
    const sequence = this.events.length;
    const previousHash = this.events.at(-1)?.hash ?? null;
    const body = {
      streamId: input.streamId,
      sequence,
      type: input.type,
      createdAt: this.clock.nowIso(),
      epistemicStatus: input.epistemicStatus,
      payload: input.payload,
      provenance: input.provenance ?? [],
      previousHash
    };
    const hash = this.hash.hash(canonicalJson(body));
    const event: EvidenceEvent = {
      id: `ev_${sequence}_${hash}`,
      ...body,
      hash
    };
    this.events.push(event);
    return structuredClone(event);
  }

  list(streamId?: string): EvidenceEvent[] {
    return this.events
      .filter((e) => streamId === undefined || e.streamId === streamId)
      .map((e) => structuredClone(e));
  }

  snapshot(): EvidenceSnapshot {
    return {
      schemaVersion: "1",
      events: this.list(),
      headHash: this.events.at(-1)?.hash ?? null
    };
  }

  verify(snapshot: EvidenceSnapshot = this.snapshot()): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    let prev: string | null = null;
    snapshot.events.forEach((event, i) => {
      if (event.sequence !== i) issues.push(`sequence mismatch at ${i}`);
      if (event.previousHash !== prev) issues.push(`previousHash mismatch at ${i}`);
      const body = {
        streamId: event.streamId,
        sequence: event.sequence,
        type: event.type,
        createdAt: event.createdAt,
        epistemicStatus: event.epistemicStatus,
        payload: event.payload,
        provenance: event.provenance,
        previousHash: event.previousHash
      };
      const expected = this.hash.hash(canonicalJson(body));
      if (event.hash !== expected) issues.push(`hash mismatch at ${i}`);
      prev = event.hash;
    });
    const expectedHead = snapshot.events.at(-1)?.hash ?? null;
    if (snapshot.headHash !== expectedHead) issues.push("headHash mismatch");
    return { valid: issues.length === 0, issues };
  }

  restore(snapshot: EvidenceSnapshot): void {
    const check = this.verify(snapshot);
    if (!check.valid) throw new Error(`Evidence snapshot verification failed: ${check.issues.join(", ")}`);
    this.events.splice(0, this.events.length, ...snapshot.events.map((e) => structuredClone(e)));
  }
}
