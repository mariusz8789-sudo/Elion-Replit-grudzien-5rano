import { generateKeyPair, publicKeyId, type KeyPair, type JsonWebKey } from '../src/crypto/signing.js';
import type { Certificate, Evidence } from '../src/cert/builder.js';

/**
 * A tiny in-memory simulation of a federated instance: its own real ECDSA
 * key pair, its own store of published evidence packs/certificates, and its
 * own opinion about which OTHER signers it trusts. No network, no PKI, no
 * transport — this is a fixture for exercising the auditor across instance
 * boundaries, not a federation protocol.
 */

export interface EvidencePack {
  readonly evidencePackId: string;
  readonly evidenceChainId: string;
  readonly evidence: Evidence;
  readonly cert: Certificate;
}

export interface SimulatedInstance {
  readonly instanceId: string;
  readonly domain: string;
  readonly packs: Map<string, EvidencePack>;
  readonly certs: Map<string, Certificate>;
  readonly trustedPublicKeys: Set<string>;
  readonly keyPair: KeyPair;
}

export async function createInstance(instanceId: string, domain: string): Promise<SimulatedInstance> {
  const keyPair = await generateKeyPair();
  return { instanceId, domain, packs: new Map(), certs: new Map(), trustedPublicKeys: new Set(), keyPair };
}

/** `instance` starts trusting whoever holds `otherPublicKeyJwk` — a one-way, explicit act, never inferred from a successful exchange. */
export function trustPublicKey(instance: SimulatedInstance, otherPublicKeyJwk: JsonWebKey): void {
  instance.trustedPublicKeys.add(publicKeyId(otherPublicKeyJwk));
}

export function storeEvidencePack(instance: SimulatedInstance, pack: EvidencePack): void {
  instance.packs.set(pack.evidencePackId, pack);
  instance.certs.set(pack.cert.certId, pack.cert);
}

export function lookupPack(instance: SimulatedInstance, packId: string): EvidencePack | undefined {
  return instance.packs.get(packId);
}

export async function createDemoInstances(): Promise<{ rainfall: SimulatedInstance; biotech: SimulatedInstance; particle: SimulatedInstance }> {
  const [rainfall, biotech, particle] = await Promise.all([
    createInstance('noaa-rainfall', 'rainfall'),
    createInstance('pennington-biotech', 'biotech'),
    createInstance('cern-particle', 'particle'),
  ]);
  return { rainfall, biotech, particle };
}
