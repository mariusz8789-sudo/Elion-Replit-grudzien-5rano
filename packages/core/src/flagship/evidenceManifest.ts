/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import { verifySessionChain, type FlagshipEvent } from './sessionEventLog.js';

/**
 * D-136 — EVIDENCE MANIFEST: a real, deterministic REPORT over the two existing systems of record
 * (`EvidenceLedger`, `SessionEventLog`). It creates no third store: every field here is read straight
 * off a session's real event chain and the ledger's real entries, and two manifests built from the
 * same session/ledger state are equal by value (`generateEvidenceManifest` takes no clock and reads
 * no wall-clock time). It answers, for one session: what commands ran, what evidence they produced,
 * from what source, at what ledger index, with what epistemic status, and whether the two chains
 * (session log, evidence ledger) are both intact — i.e. is this session's evidence chain reproducible.
 */
export interface EvidenceManifestEntry {
  readonly seq: number;
  readonly commandId: string | null;
  readonly actionKind: string | null;
  readonly evidenceId: string;
  readonly contentHash: string;
  readonly ledgerEntryIndex: number;
  readonly sourceUrl: string;
  readonly epistemicStatus: string;
  /** True only if the ledger itself (not just the session log's claim) still holds a live entry at
   * `ledgerEntryIndex` with this exact `contentHash` — a session log claim the ledger no longer backs
   * (a tampered or truncated ledger) is flagged, never silently trusted. */
  readonly ledgerBacked: boolean;
}

export interface EvidenceManifest {
  readonly schema: 'genesis-d136-evidence-manifest/1';
  readonly sessionId: string;
  readonly sessionChainIntact: boolean;
  readonly sessionChainErrors: readonly string[];
  readonly ledgerChainIntact: boolean;
  readonly ledgerChainErrors: readonly string[];
  readonly entries: readonly EvidenceManifestEntry[];
  readonly commandCount: number;
  readonly eventTypeCounts: Readonly<Record<string, number>>;
  /** Reproducible only when both chains verify AND every entry is ledger-backed. */
  readonly reproducible: boolean;
}

function eventTypeCounts(events: readonly FlagshipEvent[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.type] = (out[e.type] ?? 0) + 1;
  return out;
}

/** Pure projection: `events` must be one session's real event stream (e.g. `log.read(sessionId)`); `ledger` is read via its own public getters, never mutated. */
export function generateEvidenceManifest(sessionId: string, events: readonly FlagshipEvent[], ledger: EvidenceLedger): EvidenceManifest {
  const chain = verifySessionChain(events);
  const ledgerCheck = ledger.verifyLedger();
  const ledgerEntriesByHash = new Map(ledger.getEntries().map((e) => [`${e.index}:${e.contentHash}`, e]));

  const entries: EvidenceManifestEntry[] = events
    .filter((e) => e.type === 'EVIDENCE_APPENDED')
    .map((e) => {
      const p = e.payload as { id?: unknown; contentHash?: unknown; ledgerEntryIndex?: unknown; sourceUrl?: unknown; epistemicStatus?: unknown; commandId?: unknown; actionKind?: unknown };
      const contentHash = String(p.contentHash ?? '');
      const ledgerEntryIndex = typeof p.ledgerEntryIndex === 'number' ? p.ledgerEntryIndex : -1;
      return {
        seq: e.seq,
        commandId: typeof p.commandId === 'string' ? p.commandId : null,
        actionKind: typeof p.actionKind === 'string' ? p.actionKind : null,
        evidenceId: String(p.id ?? ''),
        contentHash,
        ledgerEntryIndex,
        sourceUrl: String(p.sourceUrl ?? ''),
        epistemicStatus: String(p.epistemicStatus ?? ''),
        ledgerBacked: ledgerEntriesByHash.has(`${ledgerEntryIndex}:${contentHash}`),
      };
    });

  return {
    schema: 'genesis-d136-evidence-manifest/1',
    sessionId,
    sessionChainIntact: chain.ok,
    sessionChainErrors: chain.errors,
    ledgerChainIntact: ledgerCheck.ok,
    ledgerChainErrors: ledgerCheck.errors,
    entries,
    commandCount: new Set(entries.map((e) => e.commandId).filter((id): id is string => id !== null)).size,
    eventTypeCounts: eventTypeCounts(events),
    reproducible: chain.ok && ledgerCheck.ok && entries.every((e) => e.ledgerBacked),
  };
}
