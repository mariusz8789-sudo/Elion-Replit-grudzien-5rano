/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger, NewEvidenceInput } from './EvidenceLedger.js';

/**
 * ENTITY-0 — TRUTH FIREWALL FOR GENERATED CONTENT.
 *
 * Visualisation and synthetic-scene engines (World Director, temporal
 * cinematic capture, the CERN collider / black-hole / materials engines and
 * the quantum collider) used to call `ledger.addRecord`, which puts
 * a record straight into the ACTIVE evidence base. A generated picture of a
 * world is a MODEL or a SIMULATION; it may be recorded for provenance, but it
 * must never publish itself as evidence.
 *
 * This helper routes such records through the ledger's own existing
 * `propose → publish(approver)` gate instead. `EvidenceLedger` itself is
 * unchanged. The returned value is the same `contentHash` `addRecord` used to
 * return (both come from `ledger.contentHashOf`), so every provenance link and
 * seed derived from it is byte-identical — only the record's admission status
 * changes: it waits as a pending proposal until a human publishes it.
 *
 * Re-recording identical content does not stack up duplicate proposals: if the
 * same content is already pending, approved or active, nothing new is written.
 */
export function proposeGeneratedRecord(ledger: EvidenceLedger, input: NewEvidenceInput): string {
  const contentHash = ledger.contentHashOf(input);
  const alreadyActive = ledger.getActive().some((record) => record.contentHash === contentHash);
  const alreadyProposed = ledger.getProposals().some((p) => p.record.contentHash === contentHash && p.status !== 'discarded');
  if (!alreadyActive && !alreadyProposed) ledger.propose(input);
  return contentHash;
}
