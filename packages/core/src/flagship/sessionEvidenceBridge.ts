/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import type { EvidenceRecord, LedgerEntry } from '../knowledge/evidenceTypes.js';
import type { SessionEventLog } from './sessionEventLog.js';

/**
 * D-136 — EVIDENCE LEDGER ↔ SESSION EVENT LOG PROVENANCE BRIDGE.
 *
 * `agenticScienceRuntime.ts` already appends a minimal `{id, sessionId}` EVIDENCE_APPENDED event at
 * one call site. This is the general form: bound once via `EvidenceLedger.onAppend` (the ledger's own
 * existing persistence hook — see `knowledge/ledgerPersistence.ts`, not duplicated here), it fires for
 * every ledger append from anywhere in the app and carries the full provenance chain a command's
 * result needs (content hash, ledger entry index, source, epistemic status, the command/action that
 * produced it) — without creating a second evidence store. `EvidenceLedger`/`SessionEventLog` remain
 * the only two systems of record; this only links their ids.
 */
export interface EvidenceSessionLink {
  readonly sessionId: string;
  readonly commandId?: string;
  readonly actionKind?: string;
  readonly ledgerEntryIndex: number;
  readonly evidenceId: string;
  readonly contentHash: string;
  readonly sourceUrl: string;
  readonly epistemicStatus: EvidenceRecord['status'];
}

/** Explicit provenance link: agent action -> ledger entry -> evidence record, as a session event. */
export function appendEvidenceSessionLink(log: SessionEventLog, link: EvidenceSessionLink): void {
  log.append(link.sessionId, 'EVIDENCE_APPENDED', {
    id: link.evidenceId,
    contentHash: link.contentHash,
    ledgerEntryIndex: link.ledgerEntryIndex,
    sourceUrl: link.sourceUrl,
    epistemicStatus: link.epistemicStatus,
    ...(link.commandId ? { commandId: link.commandId } : {}),
    ...(link.actionKind ? { actionKind: link.actionKind } : {}),
  });
}

export function linkLedgerEntryToSession(log: SessionEventLog, sessionId: string, entry: LedgerEntry, record: EvidenceRecord, commandId?: string, actionKind?: string): EvidenceSessionLink {
  const link: EvidenceSessionLink = {
    sessionId, commandId, actionKind, ledgerEntryIndex: entry.index, evidenceId: record.id,
    contentHash: record.contentHash, sourceUrl: record.sourceUrl, epistemicStatus: record.status,
  };
  appendEvidenceSessionLink(log, link);
  return link;
}

/**
 * Bind the existing ledger append hook to the existing session log. `sessionIdOf` must return the
 * current active session; returning `null` means the ledger append is not attributed to a session
 * rather than inventing one. Returns the unsubscribe function (mirrors `EvidenceLedger.onAppend`).
 */
export function bindEvidenceLedgerToSessionLog(
  ledger: EvidenceLedger,
  log: SessionEventLog,
  sessionIdOf: () => string | null,
  contextOf: () => Pick<EvidenceSessionLink, 'commandId' | 'actionKind'> = () => ({}),
): () => void {
  return ledger.onAppend((entry, current) => {
    const sessionId = sessionIdOf();
    if (!sessionId) return;
    const record = current.getActive().find((r) => r.contentHash === entry.contentHash)
      ?? current.getProposals().map((p) => p.record).find((r) => r.contentHash === entry.contentHash);
    if (!record) return;
    const context = contextOf();
    linkLedgerEntryToSession(log, sessionId, entry, record, context.commandId, context.actionKind);
  });
}
