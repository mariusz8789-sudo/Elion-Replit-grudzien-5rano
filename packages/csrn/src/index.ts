export { canonicalJson } from './crypto/canonicalJson.js';
export { sha256Hex, computeFingerprint, bytesToHex, hexToBytes } from './crypto/fingerprint.js';
export { generateKeyPair, publicKeyToString, computePublicKeyId, signFingerprint, verifySignature, type KeyPair } from './crypto/signing.js';
export {
  buildUnsignedCertificate, buildCertificate, computeSignedPayloadFingerprint, computeCertificateFingerprint,
} from './cert/builder.js';
export { auditCertificate, type AuditVerdict, type AuditResult } from './cert/auditor.js';
export type { Claim, Evidence, Provenance, ProvenanceStep, Integrity, Signature, Certificate, UnsignedCertificateInput } from './cert/types.js';
export {
  createInstance, ownPublicKeyId, trust, storePack, lookupPack, type SimulatedInstance, type EvidencePackRecord,
} from './federation/instance.js';
export { simulateExchange, receiverAudit } from './federation/exchange.js';
