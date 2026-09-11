import { auditCertificate, type AuditResult } from '../cert/auditor.js';
import { storePack, type EvidencePackRecord, type SimulatedInstance } from './instance.js';

/**
 * Copies ONE evidence pack from `sender`'s store into `receiver`'s store.
 * The deep clone (`structuredClone`) is deliberate: it proves the two
 * instances hold genuinely INDEPENDENT copies — mutating the sender's
 * record afterward (e.g. in a tamper test) must never silently affect what
 * the receiver already stored, exactly as it wouldn't across a real network.
 */
export function simulateExchange(sender: SimulatedInstance, receiver: SimulatedInstance, evidencePackId: string): EvidencePackRecord | null {
  const record = sender.packs.get(evidencePackId);
  if (record === undefined) return null;
  const received = structuredClone(record);
  storePack(receiver, received);
  return received;
}

/** Audits a pack ALREADY in `instance`'s own store, against `instance`'s OWN trust store — a receiver decides trust independently, never inherits the sender's opinion of itself. */
export async function receiverAudit(instance: SimulatedInstance, evidencePackId: string): Promise<AuditResult | null> {
  const record = instance.packs.get(evidencePackId);
  if (record === undefined) return null;
  return auditCertificate(record.cert, instance.trustedPublicKeys);
}
