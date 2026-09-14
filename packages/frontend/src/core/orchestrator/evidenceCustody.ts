import { EvidenceConnectorStore } from '../evidenceConnectors/store';
import type { ConnectorPort, IngestRecord, ReplayResult, SourceConfig } from '../evidenceConnectors/contracts';

/**
 * EVIDENCE CUSTODY GATE for real (PRODUCTION) discovery runs
 * (docs/DECISIONS.md D-059, C2 gap 2).
 *
 * WHY THIS EXISTS. C1/D-058's PRODUCTION runs read real pinned data, but
 * nothing recorded that the exact bytes consumed were frozen, hashed, and
 * later verifiable — provenance without a custody chain is a claim, not a
 * proof, which is exactly what this repo's own evidence discipline exists
 * to refuse. This closes that gap by reusing the REAL, unmodified D-057
 * `EvidenceConnectorStore` — no second store, no second hash policy engine.
 *
 * WHY THIS RUNS BEFORE THE DECISION PIPELINE, NOT DURING IT.
 * `OrchestratorAdapters.ingestEvidence()` (contracts.ts) is SYNCHRONOUS —
 * `orchestrator.ts::runScientificDiscovery` calls every port synchronously,
 * by design, and this pass does not touch that contract (scope lock: ports/
 * adapters only). `EvidenceConnectorStore.ingest()`/`replay()` are real
 * async I/O. The only honest way to reconcile the two without inventing a
 * synchronous evidence store (a second one) is to run custody verification
 * as its own async gate BEFORE the synchronous pipeline starts: if the real
 * evidence this run is about to consume cannot be frozen and replay-
 * verified, the run never starts, and no verdict is ever computed from
 * unverified bytes. This is a stricter posture than D-057's own generic
 * `EvidenceConnectorStore`, which legitimately allows a source to
 * supersede its prior hash (a real, disclosed drift) — for a SCIENTIFIC
 * RUN specifically, this module treats any detected drift since the last
 * verified freeze as disqualifying for THIS run's integrity claim, not
 * silently accepted. The store itself is unmodified; this is a policy
 * layered on top of its honest output.
 *
 * NEVER APPLIES TO SYNTHETIC_TEST_ONLY. Synthetic evidence has no real
 * custody to verify — routing it through this gate would risk exactly the
 * blurring Part 5 of the C2 mandate forbids (synthetic evidence dressed up
 * as custody-verified real evidence). Callers must only invoke this for
 * PRODUCTION-mode runs.
 */

export interface EvidenceCustodyResult {
  readonly ok: boolean;
  readonly sourceId: string;
  readonly record: IngestRecord | null;
  readonly replay: ReplayResult | null;
  readonly reason: string;
}

/**
 * Ingests `source` via `port` into `store`, then immediately replays it
 * through the same port. Fails closed (`ok: false`) on a fetch failure, on
 * a hash drift since a prior freeze (`HASH_MISMATCH_SUPERSEDED`), or on a
 * replay mismatch. Never throws — every outcome, including failure, is a
 * real, inspectable result.
 */
export async function verifyEvidenceCustody(store: EvidenceConnectorStore, source: SourceConfig, port: ConnectorPort): Promise<EvidenceCustodyResult> {
  const record = await store.ingest(source, port);

  if (record.status === 'FETCH_FAILED') {
    return { ok: false, sourceId: source.sourceId, record, replay: null, reason: `fetch failed: ${record.note}` };
  }
  if (record.status === 'HASH_MISMATCH_SUPERSEDED') {
    return { ok: false, sourceId: source.sourceId, record, replay: null, reason: `evidence drifted since a prior freeze — refusing to run a scientific decision on unverified/changed bytes: ${record.note}` };
  }

  const artifact = record.artifact!;
  const replay = await store.replay(source.sourceId, artifact.artifactId, port);
  if (!replay.ok) {
    return { ok: false, sourceId: source.sourceId, record, replay, reason: `replay did not reproduce the just-frozen artifact: ${replay.note}` };
  }

  return { ok: true, sourceId: source.sourceId, record, replay, reason: 'FROZEN and replay-verified against the same real bytes' };
}
