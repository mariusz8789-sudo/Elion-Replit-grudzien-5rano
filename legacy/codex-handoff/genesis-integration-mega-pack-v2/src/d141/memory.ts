import { fingerprint } from './hash.js';
import type { HashPort } from '../hashReplay/hashPort.js';

/**
 * Fix area 3 (AppendOnlyMetaMemory demotion). In V1 this class was a required
 * constructor dependency and every `GenesisMetaCognitionEngine.record*` method wrote to
 * it independently of, and in addition to, the canonical `EvidencePort`. That made it a
 * de facto second, self-contained, in-process "project memory" — exactly what the D-141
 * CODEX_INTEGRATION_PROMPT.md itself warns integrators not to create.
 *
 * V2 rule: this class still exists (standalone tests need a local, chain-verifiable
 * echo they can assert against without a real EvidenceLedger attached), but it is now
 * OPTIONAL, and `metaEngine.ts` only ever writes to it from inside its single `emit()`
 * choke point — as a mirror of exactly what was sent to the canonical EvidencePort, never
 * as an independent write path. It is NEVER the durable store in a real-repo
 * integration: production callers must persist through EvidencePort → the real
 * EvidenceLedger/kernelLedger, and must not read this class's snapshot() back as "the"
 * source of truth.
 */
export interface MetaMemoryEntry<T = unknown> {
  readonly index: number;
  readonly kind: string;
  readonly refId: string;
  readonly payload: T;
  readonly previousHash: string;
  readonly entryHash: string;
}

export interface MetaMemorySnapshot {
  readonly version: 1;
  readonly entries: readonly MetaMemoryEntry[];
  readonly headHash: string;
}

export class AppendOnlyMetaMemory {
  private readonly entries: MetaMemoryEntry[] = [];

  constructor(private readonly hashPort?: HashPort) {}

  public append<T>(kind: string, refId: string, payload: T): MetaMemoryEntry<T> {
    const previousHash = this.entries.at(-1)?.entryHash ?? 'GENESIS_META_GENESIS';
    const index = this.entries.length;
    const entryHash = fingerprint({ index, kind, refId, payload, previousHash }, this.hashPort);
    const entry: MetaMemoryEntry<T> = { index, kind, refId, payload, previousHash, entryHash };
    this.entries.push(entry as MetaMemoryEntry);
    return entry;
  }

  public snapshot(): MetaMemorySnapshot {
    return { version: 1, entries: this.entries.map((entry) => ({ ...entry })), headHash: this.entries.at(-1)?.entryHash ?? 'GENESIS_META_GENESIS' };
  }

  public static restore(snapshot: MetaMemorySnapshot, hashPort?: HashPort): AppendOnlyMetaMemory {
    const memory = new AppendOnlyMetaMemory(hashPort);
    let previousHash = 'GENESIS_META_GENESIS';
    snapshot.entries.forEach((entry, index) => {
      const expected = fingerprint({ index, kind: entry.kind, refId: entry.refId, payload: entry.payload, previousHash }, hashPort);
      if (entry.index !== index || entry.previousHash !== previousHash || entry.entryHash !== expected) {
        throw new Error(`Meta-memory chain verification failed at index ${index}`);
      }
      memory.entries.push({ ...entry });
      previousHash = entry.entryHash;
    });
    if (snapshot.headHash !== previousHash) throw new Error('Meta-memory head hash mismatch');
    return memory;
  }
}
