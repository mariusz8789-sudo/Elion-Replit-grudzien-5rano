/**
 * EVIDENCE CONNECTORS — contracts (docs/DECISIONS.md D-057, "DOBUDOWANIE
 * RESZTY MASZYNY" pass, item A).
 *
 * WHAT THIS IS. A frozen-artifact ingest/replay layer for EXTERNAL data
 * sources (regulatory datasets, trial registries, literature indices). It
 * answers one question honestly: "is the artifact this campaign is reading
 * today byte-identical to the one it read before, and if not, what changed
 * and when?" It computes nothing scientific — no ranking, no adjudication,
 * no evidence-class inference. That stays in `core/agent/evidenceProvenance.ts`
 * and the campaigns that already use it.
 *
 * HASH POLICY IS PER SOURCE, NOT GLOBAL. This repo already has two real hash
 * providers, not one: `core/events/hash.ts::fnv1a` (non-cryptographic,
 * internal replay/fingerprinting — used by every module built this session)
 * and `core/discovery/evidenceCrypto.ts::sha256Hex` (the browser's real
 * Web Crypto SHA-256, used where a digest has to be handed to someone
 * outside the app as tamper evidence). Neither is "the" provider; a source
 * config declares which one its artifacts are hashed with
 * (`SourceConfig.hashPolicy`), and every frozen artifact carries that same
 * policy forward. `EvidenceConnectorStore.replay()` reads the artifact's OWN
 * recorded policy and re-hashes with it — hardcoding one algorithm there
 * would silently break replay for every source configured with the other.
 *
 * FAIL-CLOSED. A fetch failure is a `FETCH_FAILED` ingest record, never a
 * thrown exception that loses the attempt, and never a frozen artifact with
 * fabricated content. There is no "REAL_RUN" status — an ingest either
 * produced a real frozen artifact from real bytes returned by its
 * `ConnectorPort`, or it didn't, and the record says which.
 */

export type HashPolicy = 'sha256' | 'fnv1a-canonical';

export interface SourceConfig {
  readonly sourceId: string;
  readonly name: string;
  readonly url: string;
  readonly hashPolicy: HashPolicy;
  readonly category: string;
}

/** A byte-identical snapshot of one fetch, frozen the moment it was hashed. Never mutated after creation. */
export interface FrozenArtifact {
  readonly sourceId: string;
  readonly artifactId: string;
  readonly hash: string;
  readonly hashPolicy: HashPolicy;
  readonly bytesLength: number;
  readonly retrievedFromUrl: string;
  /** Provenance only (D-040 clock rule) — never an input to `hash`. */
  readonly fetchedAt: number;
}

export type IngestStatus = 'FROZEN' | 'HASH_MISMATCH_SUPERSEDED' | 'FETCH_FAILED';

/** One append-only ingest attempt. Prior records for the same sourceId are never edited or removed. */
export interface IngestRecord {
  readonly sourceId: string;
  readonly status: IngestStatus;
  /** Non-null only when status !== 'FETCH_FAILED'. */
  readonly artifact: FrozenArtifact | null;
  /** artifactId of the FROZEN record this one supersedes — set only for HASH_MISMATCH_SUPERSEDED. */
  readonly supersedes: string | null;
  readonly note: string;
  readonly recordedAt: number;
  readonly fingerprint: string;
}

/**
 * The only place bytes actually move. `fetchBytes` is real network I/O
 * (or, in a test, a real in-memory fixture) — never a function that returns
 * a fabricated "success" without having produced actual bytes.
 */
export interface ConnectorPort {
  fetchBytes(source: SourceConfig): Promise<Uint8Array>;
}

export interface ReplayResult {
  readonly ok: boolean;
  readonly sourceId: string;
  readonly artifactId: string;
  readonly hashPolicy: HashPolicy;
  readonly expectedHash: string;
  readonly actualHash: string | null;
  readonly note: string;
}

export interface DriftReport {
  readonly sourceId: string;
  readonly frozenCount: number;
  readonly driftCount: number;
  readonly fetchFailedCount: number;
}

export class FailClosedError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNKNOWN_SOURCE' | 'NO_FROZEN_ARTIFACT' | 'FETCH_FAILED' | 'REPLAY_UNAVAILABLE',
  ) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'FailClosedError';
  }
}
