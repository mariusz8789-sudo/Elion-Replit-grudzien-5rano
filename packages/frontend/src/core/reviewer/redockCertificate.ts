import {
  auditCertificate, computePublicKeyId, sha256Hex,
  type AuditVerdict, type Certificate, type UnsignedCertificateInput,
} from '@genesis-os/csrn';

/**
 * THE ONE CERTIFICATE BUILDER AND VERIFIER for the committed D-150 redock record
 * (`docs/evidence/finalist-falsification-2026-09-27.json`). Shared by the Reviewer
 * Room (`signedEvidence.ts`) and the offline signing script
 * (`scripts/csrn-sign.mjs`, which bundles this file), so the certificate the
 * owner signs on their own machine and the one the browser verifies are built by
 * the same code. It imports nothing Vite-specific for that reason.
 *
 * Signing and verification are the existing CSRN package (`@genesis-os/csrn`,
 * ECDSA P-256 over SHA-256). This file adds no cryptography.
 *
 * Every field below enters CSRN's signed payload:
 *   - `claim.epistemicStatus` = MODEL_ESTIMATE, the record's own wording ("Vina
 *     scores are MODEL_ESTIMATE, never measured affinity");
 *   - the evidence identity (repository path of the record);
 *   - the provenance chain: preregistered protocol fingerprint -> run body
 *     SHA-256 (as the run script computed it) -> SHA-256 of the committed
 *     file's exact bytes.
 * The fields are deterministic (issuedAt is the run's own finish time), so the
 * signed payload is the same whether or not a signature is attached.
 */

export const REDOCK_EVIDENCE_PATH = 'docs/evidence/finalist-falsification-2026-09-27.json';
export const REDOCK_CERTIFICATE_PATH = 'docs/evidence/finalist-falsification-2026-09-27.csrn-cert.json';
export const CERTIFICATE_ISSUER = 'Genesis';

export interface RedockRecord {
  readonly decision: string;
  readonly protocolFingerprint: string;
  readonly bodySha256: string;
  readonly finishedAt: string;
  readonly engines: Readonly<Record<string, string>>;
  readonly protocol: { readonly target: string; readonly pdbId: string; readonly limitations: readonly string[] };
  readonly summary: { readonly bestAffinityKcalMolRange: readonly [number, number]; readonly medianRmsdA: number; readonly configurationsDocked: number };
}

export async function redockCertificateInput(recordText: string): Promise<UnsignedCertificateInput> {
  const r = JSON.parse(recordText) as RedockRecord;
  const [best, worst] = r.summary.bestAffinityKcalMolRange;
  return {
    certId: `genesis:${r.decision}:${r.bodySha256.slice(0, 16)}`,
    issuedAt: r.finishedAt,
    issuer: CERTIFICATE_ISSUER,
    claim: {
      claimId: `${r.decision}-redock-${r.protocol.pdbId}`,
      statement: `Imatinib redocked into ABL1 (PDB ${r.protocol.pdbId}): ${r.summary.configurationsDocked} seeds/settings docked, best AutoDock Vina score ${best} to ${worst} kcal/mol, median RMSD ${r.summary.medianRmsdA} A to the crystal pose.`,
      domain: 'drug-discovery/docking',
      epistemicStatus: 'MODEL_ESTIMATE',
    },
    evidence: { evidencePackId: null, evidenceChainId: null, evidenceUri: `repo:${REDOCK_EVIDENCE_PATH}`, replayCapsuleId: null },
    provenance: {
      provenanceTrail: [
        { step: 1, action: 'preregistered-protocol->vina-run', inputFingerprint: r.protocolFingerprint, outputFingerprint: r.bodySha256, timestamp: r.finishedAt },
        { step: 2, action: 'vina-run->committed-record', inputFingerprint: r.bodySha256, outputFingerprint: await sha256Hex(recordText), timestamp: r.finishedAt },
      ],
    },
  };
}

/**
 * The published Genesis CSRN public key (`docs/keys/genesis-csrn-signing-key.json`,
 * served as `/.well-known/genesis-csrn-key.json`). Before the owner generates the
 * production key, `status` is NOT_YET_GENERATED and nothing is trusted.
 */
export interface GenesisPublicKeyFile {
  readonly kind: 'GENESIS_CSRN_PUBLIC_KEY';
  readonly version: 1;
  readonly status: 'NOT_YET_GENERATED' | 'ACTIVE' | 'REVOKED';
  readonly algorithm: 'ECDSA-P256-SHA256';
  readonly keyId: string | null;
  readonly publicKeyJwk: { readonly kty: string; readonly crv: string; readonly x: string; readonly y: string } | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly keyIdMethod: string;
  readonly notice: string;
}

/**
 * The trust store: the published key id, but only if the file is ACTIVE and its
 * keyId really is the SHA-256 identity of the JWK it publishes (recomputed here,
 * never taken on the file's word).
 */
export async function genesisTrustStore(keyFile: GenesisPublicKeyFile): Promise<ReadonlySet<string>> {
  if (keyFile.status !== 'ACTIVE' || keyFile.publicKeyJwk === null || keyFile.keyId === null) return new Set();
  const recomputed = await computePublicKeyId(keyFile.publicKeyJwk as JsonWebKey);
  return recomputed === keyFile.keyId ? new Set([keyFile.keyId]) : new Set();
}

export type SignerStatus = 'SIGNED_BY_GENESIS_KEY' | 'SIGNED_UNTRUSTED' | 'UNSIGNED' | 'NOT_CHECKED';

export interface EvidenceVerification {
  /** Fact 1: the classification the certificate carries; verification never changes it. */
  readonly epistemicStatus: string | null;
  /** Fact 2: the certificate's own fingerprints hold AND the evidence file is the one it names. */
  readonly unaltered: boolean;
  readonly auditVerdict: AuditVerdict;
  readonly fileMatches: boolean;
  readonly certifiedFileSha256: string;
  readonly presentedFileSha256: string;
  /** Fact 3: who signed. NOT_CHECKED when fact 2 already failed. */
  readonly signer: SignerStatus;
  readonly signerKeyId: string | null;
  readonly genesisKeyId: string | null;
  readonly errors: readonly string[];
}

export async function verifyRedockEvidence(certificate: Certificate, presentedText: string, keyFile: GenesisPublicKeyFile): Promise<EvidenceVerification> {
  const trust = await genesisTrustStore(keyFile);
  const audit = await auditCertificate(certificate, trust);
  const trail = certificate.provenance?.provenanceTrail ?? [];
  const certifiedFileSha256 = trail[trail.length - 1]?.outputFingerprint ?? '';
  const presentedFileSha256 = await sha256Hex(presentedText);
  const fileMatches = presentedFileSha256 === certifiedFileSha256;
  const certificateIntact = audit.verdict !== 'STRUCTURALLY_INVALID' && audit.verdict !== 'INTEGRITY_INVALID';
  const unaltered = certificateIntact && fileMatches;
  const errors = [...audit.errors];
  if (!fileMatches) errors.push(`evidence file SHA-256 ${presentedFileSha256} is not the certified ${certifiedFileSha256}`);
  let signer: SignerStatus = 'NOT_CHECKED';
  if (unaltered) {
    signer = audit.verdict === 'INTEGRITY_VALID_SIGNED_VERIFIED' ? 'SIGNED_BY_GENESIS_KEY'
      : audit.verdict === 'INTEGRITY_VALID_SIGNED_UNTRUSTED' ? 'SIGNED_UNTRUSTED'
        : 'UNSIGNED';
  }
  return {
    epistemicStatus: certificate.claim?.epistemicStatus ?? null,
    unaltered,
    auditVerdict: audit.verdict,
    fileMatches,
    certifiedFileSha256,
    presentedFileSha256,
    signer,
    signerKeyId: audit.signerKeyId ?? null,
    genesisKeyId: trust.size > 0 ? keyFile.keyId : null,
    errors,
  };
}
