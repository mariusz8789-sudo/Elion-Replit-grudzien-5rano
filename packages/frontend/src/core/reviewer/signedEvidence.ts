import { buildCertificate, generateKeyPair, publicKeyToString, signFingerprint, type Certificate } from '@genesis-os/csrn';
import redockRecordText from '../../../../../docs/evidence/finalist-falsification-2026-09-27.json?raw';
import committedCertificate from '../../../../../docs/evidence/finalist-falsification-2026-09-27.csrn-cert.json';
import genesisKeyFile from '../../../../../docs/keys/genesis-csrn-signing-key.json';
import {
  REDOCK_CERTIFICATE_PATH, REDOCK_EVIDENCE_PATH, redockCertificateInput, verifyRedockEvidence,
  type EvidenceVerification, type GenesisPublicKeyFile, type RedockRecord,
} from './redockCertificate';

/**
 * REVIEWER SIGNED EVIDENCE — the Reviewer Room side of the Genesis CSRN key.
 *
 * The browser VERIFIES; it does not sign on Genesis's behalf. It reads three
 * committed files and checks them with the existing CSRN package:
 *   - the evidence: `docs/evidence/finalist-falsification-2026-09-27.json`
 *     (D-150, real AutoDock Vina 1.2.7 + Meeko 0.8.0 runs), as exact bytes;
 *   - its certificate: `...-2026-09-27.csrn-cert.json`, produced offline by
 *     `scripts/csrn-sign.mjs` with the same builder (`redockCertificate.ts`);
 *   - the published Genesis key: `docs/keys/genesis-csrn-signing-key.json`,
 *     also served as `/.well-known/genesis-csrn-key.json`.
 *
 * Three separate facts come out: the classification (MODEL_ESTIMATE, never
 * changed by verification), whether the evidence is unaltered, and whether the
 * Genesis key signed it. Until the owner generates the key the certificate is
 * committed UNSIGNED and the page says so.
 *
 * The one key this module ever creates is the ATTACKER's, for the forged-signature
 * challenge: a mathematically valid signature from a key that is not Genesis's must
 * come out SIGNED_UNTRUSTED, never verified.
 */

export { REDOCK_CERTIFICATE_PATH, REDOCK_EVIDENCE_PATH };
export type { EvidenceVerification };

// Git stores the signed evidence with LF bytes. Windows may materialize a
// CRLF working tree, and Vite's `?raw` import preserves those local endings.
// Verify the canonical repository payload so the same committed certificate
// has the same identity on Linux and Windows.
export const REDOCK_RECORD_TEXT: string = redockRecordText.replace(/\r\n/g, '\n');
export const REDOCK_RECORD = JSON.parse(REDOCK_RECORD_TEXT) as RedockRecord;
export const COMMITTED_CERTIFICATE = committedCertificate as unknown as Certificate;
export const GENESIS_KEY_FILE = genesisKeyFile as unknown as GenesisPublicKeyFile;

const AFFINITY_FIELD = /("bestAffinityKcalMolRange":\s*\[\s*)(-?\d+(?:\.\d+)?)/;

/** The recorded best Vina score, exactly as the committed file spells it. */
export function recordedBestScoreText(): string {
  const match = AFFINITY_FIELD.exec(REDOCK_RECORD_TEXT);
  if (!match) throw new Error(`${REDOCK_EVIDENCE_PATH}: bestAffinityKcalMolRange not found`);
  return match[2]!;
}

/** The committed file with ONE value rewritten: the best Vina score. Same bytes otherwise. */
export function withEditedBestScore(value: string): string {
  return REDOCK_RECORD_TEXT.replace(AFFINITY_FIELD, (_m, head: string) => `${head}${value}`);
}

/** The committed certificate with its classification rewritten, nothing else touched. */
export function relabelled(certificate: Certificate, epistemicStatus: string): Certificate {
  return { ...certificate, claim: { ...certificate.claim, epistemicStatus } };
}

export function verifyEvidence(presentedText: string, certificate: Certificate = COMMITTED_CERTIFICATE, keyFile: GenesisPublicKeyFile = GENESIS_KEY_FILE): Promise<EvidenceVerification> {
  return verifyRedockEvidence(certificate, presentedText, keyFile);
}

/**
 * The forger: edits the file, rebuilds a consistent certificate over the edited
 * bytes (so every hash matches again) and signs it with their own fresh key.
 */
export async function forgeCertificate(editedText: string): Promise<Certificate> {
  const input = await redockCertificateInput(editedText);
  const draft = await buildCertificate(input);
  const keys = await generateKeyPair();
  const { kty, crv, x, y } = keys.publicKeyJwk;
  const signatureValue = await signFingerprint(draft.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
  return buildCertificate(input, { algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString({ kty, crv, x, y }), signatureValue, signedAt: new Date().toISOString() });
}
