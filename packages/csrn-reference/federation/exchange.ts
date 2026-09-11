import type { SimulatedInstance, EvidencePack } from './instance.js';
import { auditCertificate, type AuditResult } from '../src/audit/auditor.js';

/**
 * A trivial `evidence://<instanceId>/<domain>/<packId>` URI — just enough to
 * name a pack across instance boundaries in this demo. Not a general URI
 * codec (Genesis's own `evidence://` scheme is a separate, unrelated piece
 * of work on `core/experimentFabric/evidenceUri.ts` in the frontend); this
 * one exists only so `simulateExchange` has something to parse.
 */
export function encodeEvidenceUri(instanceId: string, domain: string, packId: string): string {
  return `evidence://${instanceId}/${domain}/${packId}`;
}

function extractPackId(evidenceUri: string): string {
  const parts = evidenceUri.replace('evidence://', '').split('/');
  return parts[parts.length - 1] ?? '';
}

export interface ExchangeResult {
  readonly received: EvidencePack | null;
  readonly reason: string;
}

/** Copies one evidence pack from `sender`'s store into `receiver`'s — no mutation of the sender, no network. */
export function simulateExchange(sender: SimulatedInstance, receiver: SimulatedInstance, evidenceUri: string): ExchangeResult {
  const packId = extractPackId(evidenceUri);
  const pack = sender.packs.get(packId);
  if (!pack) return { received: null, reason: `Sender "${sender.instanceId}" has no pack "${packId}".` };
  const received: EvidencePack = { ...pack };
  receiver.packs.set(received.evidencePackId, received);
  receiver.certs.set(received.cert.certId, received.cert);
  return { received, reason: '' };
}

/** Audits a pack already in `receiver`'s own store, against `receiver`'s own trust set. */
export async function receiverAudit(receiver: SimulatedInstance, packId: string): Promise<AuditResult | null> {
  const pack = receiver.packs.get(packId);
  if (!pack) return null;
  return auditCertificate(pack.cert, receiver.trustedPublicKeys);
}
