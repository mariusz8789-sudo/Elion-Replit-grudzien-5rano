import { generateKeyPair, publicKeyToString, type KeyPair } from '../crypto/signing.js';
import type { Certificate, Evidence } from '../cert/types.js';

/**
 * FEDERATION — an OFFLINE SIMULATION of independent Genesis-like instances
 * exchanging certified evidence, never a real network. There is no HTTP, no
 * IPFS, no consensus, no shared process state between instances beyond what
 * `exchange.ts::simulateExchange` explicitly copies — each `SimulatedInstance`
 * has its OWN in-memory store and its OWN keypair, exactly like two separate
 * Genesis deployments would.
 */

export interface EvidencePackRecord {
  readonly evidencePackId: string;
  readonly evidence: Evidence;
  readonly cert: Certificate;
}

export interface SimulatedInstance {
  readonly instanceId: string;
  readonly domain: string;
  readonly keyPair: KeyPair;
  readonly packs: Map<string, EvidencePackRecord>;
  readonly trustedPublicKeys: Set<string>;
}

export async function createInstance(instanceId: string, domain: string): Promise<SimulatedInstance> {
  const keyPair = await generateKeyPair();
  return { instanceId, domain, keyPair, packs: new Map(), trustedPublicKeys: new Set() };
}

export function ownPublicKey(instance: SimulatedInstance): string {
  return publicKeyToString(instance.keyPair.publicKeyJwk);
}

export function trust(instance: SimulatedInstance, publicKey: string): void {
  instance.trustedPublicKeys.add(publicKey);
}

export function storePack(instance: SimulatedInstance, record: EvidencePackRecord): void {
  instance.packs.set(record.evidencePackId, record);
}

export function lookupPack(instance: SimulatedInstance, evidencePackId: string): EvidencePackRecord | undefined {
  return instance.packs.get(evidencePackId);
}
