import { canonicalJson, fnv1a } from '../events/hash';
import { InMemoryRecordStore, type KeyedRecordStore } from '../provenance/recordStore';
import { hashBytes } from './hashing';
import {
  FailClosedError,
  type ConnectorPort,
  type DriftReport,
  type FrozenArtifact,
  type IngestRecord,
  type ReplayResult,
  type SourceConfig,
} from './contracts';

/**
 * EVIDENCE CONNECTOR STORE — append-only ingest history per source, backed
 * by the existing `KeyedRecordStore` primitive (`core/provenance/recordStore.ts`,
 * the same one `core/discovery/evidenceStore.ts` and hazard provenance
 * already share) rather than a new storage mechanism. Each key holds the
 * FULL, ever-growing list of `IngestRecord`s for that source; `ingest()`
 * only ever reads the existing list and writes a strictly longer one —
 * nothing already in the list is edited or dropped.
 *
 * NAMED DELIBERATELY NOT `EvidenceStore`: `core/discovery/evidenceStore.ts`
 * already owns that name for a different job (persisting `DiscoveryCase`
 * results). Two classes named the same thing in the same codebase is a
 * readability defect even when they live in different files.
 */
export class EvidenceConnectorStore {
  constructor(private readonly backing: KeyedRecordStore<readonly IngestRecord[]> = new InMemoryRecordStore('overwrite')) {}

  private async recordsFor(sourceId: string): Promise<readonly IngestRecord[]> {
    return (await this.backing.get(sourceId)) ?? [];
  }

  private lastFrozen(records: readonly IngestRecord[]): IngestRecord | null {
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i]!.status !== 'FETCH_FAILED') return records[i]!;
    }
    return null;
  }

  /**
   * Fetches, hashes with the source's OWN declared policy, and appends one
   * `IngestRecord`. A thrown fetch never loses the attempt — it becomes a
   * real `FETCH_FAILED` record — and a hash that differs from the last
   * frozen artifact never overwrites it: the new content is frozen as a NEW
   * artifact whose record names the one it supersedes.
   */
  async ingest(source: SourceConfig, port: ConnectorPort): Promise<IngestRecord> {
    const prior = await this.recordsFor(source.sourceId);

    let bytes: Uint8Array;
    try {
      bytes = await port.fetchBytes(source);
    } catch (err) {
      const record = this.freeze('FETCH_FAILED', source.sourceId, null, null, `fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.backing.put(source.sourceId, [...prior, record]);
      return record;
    }

    const hash = await hashBytes(bytes, source.hashPolicy);
    const previousFrozen = this.lastFrozen(prior);
    const artifactId = fnv1a(canonicalJson({ sourceId: source.sourceId, hash, n: prior.length }));
    const artifact: FrozenArtifact = {
      sourceId: source.sourceId,
      artifactId,
      hash,
      hashPolicy: source.hashPolicy,
      bytesLength: bytes.length,
      retrievedFromUrl: source.url,
      fetchedAt: Date.now(),
    };

    const status = previousFrozen === null || previousFrozen.artifact === null || previousFrozen.artifact.hash === hash ? 'FROZEN' : 'HASH_MISMATCH_SUPERSEDED';
    const supersedes = status === 'HASH_MISMATCH_SUPERSEDED' ? previousFrozen!.artifact!.artifactId : null;
    const note = status === 'HASH_MISMATCH_SUPERSEDED'
      ? `content changed since artifact ${supersedes} — new artifact frozen, old one kept, not overwritten`
      : previousFrozen === null ? 'first successful ingest for this source' : 're-affirmed: hash unchanged';

    const record = this.freeze(status, source.sourceId, Object.freeze(artifact), supersedes, note);
    await this.backing.put(source.sourceId, [...prior, record]);
    return record;
  }

  private freeze(status: IngestRecord['status'], sourceId: string, artifact: FrozenArtifact | null, supersedes: string | null, note: string): IngestRecord {
    const recordedAt = Date.now();
    const record: IngestRecord = {
      sourceId,
      status,
      artifact,
      supersedes,
      note,
      recordedAt,
      fingerprint: fnv1a(canonicalJson({ sourceId, status, artifact: artifact ? { hash: artifact.hash, hashPolicy: artifact.hashPolicy, bytesLength: artifact.bytesLength } : null, supersedes, note })),
    };
    return Object.freeze(record);
  }

  /**
   * Re-fetches via `port` and re-hashes using the artifact's OWN recorded
   * `hashPolicy` — never a hardcoded algorithm. A source configured with
   * `hashPolicy: 'fnv1a-canonical'` replays with fnv1a; a source configured
   * with `'sha256'` replays with sha256. Mixing them up would silently
   * "verify" against the wrong digest for half the registry.
   */
  async replay(sourceId: string, artifactId: string, port: ConnectorPort): Promise<ReplayResult> {
    const records = await this.recordsFor(sourceId);
    const target = records.find((r) => r.artifact?.artifactId === artifactId && r.status !== 'FETCH_FAILED');
    if (target === undefined || target.artifact === null) {
      throw new FailClosedError(`no frozen artifact "${artifactId}" for source "${sourceId}" to replay`, 'NO_FROZEN_ARTIFACT');
    }
    const artifact = target.artifact;

    let bytes: Uint8Array;
    try {
      bytes = await port.fetchBytes({ sourceId, name: sourceId, url: artifact.retrievedFromUrl, hashPolicy: artifact.hashPolicy, category: 'replay' });
    } catch (err) {
      return { ok: false, sourceId, artifactId, hashPolicy: artifact.hashPolicy, expectedHash: artifact.hash, actualHash: null, note: `replay fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    const actualHash = await hashBytes(bytes, artifact.hashPolicy);
    const ok = actualHash === artifact.hash;
    return {
      ok,
      sourceId,
      artifactId,
      hashPolicy: artifact.hashPolicy,
      expectedHash: artifact.hash,
      actualHash,
      note: ok ? 'replay matches the frozen artifact' : 'replay hash differs from the frozen artifact — the source drifted since freezing, or the port returned different bytes',
    };
  }

  async allRecords(sourceId: string): Promise<readonly IngestRecord[]> {
    return this.recordsFor(sourceId);
  }

  async driftReport(sourceId: string): Promise<DriftReport> {
    const records = await this.recordsFor(sourceId);
    return {
      sourceId,
      frozenCount: records.filter((r) => r.status === 'FROZEN').length,
      driftCount: records.filter((r) => r.status === 'HASH_MISMATCH_SUPERSEDED').length,
      fetchFailedCount: records.filter((r) => r.status === 'FETCH_FAILED').length,
    };
  }

  async allSourceIds(): Promise<readonly string[]> {
    return this.backing.list();
  }
}
