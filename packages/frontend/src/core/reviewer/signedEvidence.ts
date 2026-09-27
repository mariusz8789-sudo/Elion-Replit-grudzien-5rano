import {
  auditCertificate, buildCertificate, computePublicKeyId, generateKeyPair, publicKeyToString, sha256Hex, signFingerprint,
  type AuditVerdict, type Certificate, type UnsignedCertificateInput,
} from '@genesis-os/csrn';
import redockRecordText from '../../../../../docs/evidence/finalist-falsification-2026-09-27.json?raw';

/**
 * REVIEWER SIGNED EVIDENCE — the committed imatinib/ABL1 redock record
 * (`docs/evidence/finalist-falsification-2026-09-27.json`, D-150: real AutoDock
 * Vina 1.2.7 + Meeko 0.8.0 runs), certified and signed with the existing CSRN
 * package (ECDSA P-256 / SHA-256), then audited. No second signing system: this
 * module only feeds a real record into `@genesis-os/csrn`.
 *
 * What the certificate binds (every field enters the signed payload):
 *   - the claim, with its epistemic status MODEL_ESTIMATE (the record's own
 *     wording: "Vina scores are MODEL_ESTIMATE, never measured affinity");
 *   - the evidence identity (repository path of the record);
 *   - a two-step provenance chain: the preregistered protocol fingerprint ->
 *     the run body's SHA-256 (as the run script computed it) -> the SHA-256 of
 *     the committed file's exact bytes.
 *
 * Verification is two checks, both required: the CSRN audit of the
 * certificate (fingerprints + ECDSA signature + trusted key id), and the
 * SHA-256 of the evidence file as presented against the fingerprint the
 * certificate signed. Changing one number in the file breaks the second;
 * changing the certificate (e.g. relabelling MODEL_ESTIMATE as
 * REAL_MEASUREMENT) breaks the first.
 *
 * KEY, STATED HONESTLY: the key pair is generated in the reviewer's browser
 * for this check. A valid signature here proves the evidence was not altered
 * after signing; it does not prove who produced it (no published Genesis key
 * yet), and it never proves the result was validated in a laboratory.
 */

export const SIGNED_EVIDENCE_PATH = 'docs/evidence/finalist-falsification-2026-09-27.json';
export const REDOCK_RECORD_TEXT: string = redockRecordText;

interface RedockRecord {
  readonly decision: string;
  readonly protocolFingerprint: string;
  readonly bodySha256: string;
  readonly finishedAt: string;
  readonly engines: Readonly<Record<string, string>>;
  readonly protocol: { readonly target: string; readonly pdbId: string; readonly limitations: readonly string[] };
  readonly summary: { readonly bestAffinityKcalMolRange: readonly [number, number]; readonly medianRmsdA: number; readonly configurationsDocked: number };
}

export const REDOCK_RECORD = JSON.parse(REDOCK_RECORD_TEXT) as RedockRecord;

const AFFINITY_FIELD = /("bestAffinityKcalMolRange":\s*\[\s*)(-?\d+(?:\.\d+)?)/;

/** The recorded best Vina score, exactly as the committed file spells it. */
export function recordedBestScoreText(): string {
  const match = AFFINITY_FIELD.exec(REDOCK_RECORD_TEXT);
  if (!match) throw new Error(`${SIGNED_EVIDENCE_PATH}: bestAffinityKcalMolRange not found`);
  return match[2]!;
}

/** The committed file with ONE value rewritten: the best Vina score. Same text otherwise, byte for byte. */
export function withEditedBestScore(value: string): string {
  return REDOCK_RECORD_TEXT.replace(AFFINITY_FIELD, (_m, head: string) => `${head}${value}`);
}

export async function certificateInputFor(recordText: string): Promise<UnsignedCertificateInput> {
  const r = REDOCK_RECORD;
  const [best, worst] = r.summary.bestAffinityKcalMolRange;
  return {
    certId: `genesis-reviewer:${r.decision}:${r.bodySha256.slice(0, 16)}`,
    issuedAt: r.finishedAt,
    issuer: 'genesis-reviewer-room (key generated in this browser)',
    claim: {
      claimId: `${r.decision}-redock-${r.protocol.pdbId}`,
      statement: `Imatinib redocked into ABL1 (PDB ${r.protocol.pdbId}): ${r.summary.configurationsDocked} seeds/settings docked, best AutoDock Vina score ${best} to ${worst} kcal/mol, median RMSD ${r.summary.medianRmsdA} A to the crystal pose.`,
      domain: 'drug-discovery/docking',
      epistemicStatus: 'MODEL_ESTIMATE',
    },
    evidence: { evidencePackId: null, evidenceChainId: null, evidenceUri: `repo:${SIGNED_EVIDENCE_PATH}`, replayCapsuleId: null },
    provenance: {
      provenanceTrail: [
        { step: 1, action: 'preregistered-protocol->vina-run', inputFingerprint: r.protocolFingerprint, outputFingerprint: r.bodySha256, timestamp: r.finishedAt },
        { step: 2, action: 'vina-run->committed-record', inputFingerprint: r.bodySha256, outputFingerprint: await sha256Hex(recordText), timestamp: r.finishedAt },
      ],
    },
  };
}

export interface SignedEvidence {
  readonly certificate: Certificate;
  readonly trustedKeyId: string;
}

export async function signCommittedEvidence(): Promise<SignedEvidence> {
  const input = await certificateInputFor(REDOCK_RECORD_TEXT);
  const unsigned = await buildCertificate(input);
  const keys = await generateKeyPair();
  const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
  const certificate = await buildCertificate(input, { algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(keys.publicKeyJwk), signatureValue, signedAt: input.issuedAt });
  return { certificate, trustedKeyId: await computePublicKeyId(keys.publicKeyJwk) };
}

export interface EvidenceVerification {
  readonly verdict: AuditVerdict;
  readonly signerKeyId: string | null;
  readonly signedFileSha256: string;
  readonly presentedFileSha256: string;
  readonly fileMatches: boolean;
  /** Both checks hold: certificate verified against the trusted key AND the file is the one it signed. */
  readonly verified: boolean;
  readonly errors: readonly string[];
  /** Copied from the certificate; verification never changes it. */
  readonly epistemicStatus: string | null;
}

export async function verifyEvidence(signed: SignedEvidence, presentedText: string, certificate: Certificate = signed.certificate): Promise<EvidenceVerification> {
  const audit = await auditCertificate(certificate, new Set([signed.trustedKeyId]));
  const trail = certificate.provenance.provenanceTrail;
  const signedFileSha256 = trail[trail.length - 1]?.outputFingerprint ?? '';
  const presentedFileSha256 = await sha256Hex(presentedText);
  const fileMatches = presentedFileSha256 === signedFileSha256;
  const errors = [...audit.errors];
  if (!fileMatches) errors.push(`evidence file SHA-256 ${presentedFileSha256} does not match the signed ${signedFileSha256}`);
  return {
    verdict: audit.verdict,
    signerKeyId: audit.signerKeyId ?? null,
    signedFileSha256,
    presentedFileSha256,
    fileMatches,
    verified: audit.verdict === 'INTEGRITY_VALID_SIGNED_VERIFIED' && fileMatches,
    errors,
    epistemicStatus: certificate.claim.epistemicStatus ?? null,
  };
}
