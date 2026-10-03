import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCertificate, computePublicKeyId, generateKeyPair, publicKeyToString, signFingerprint, type Certificate } from '@genesis-os/csrn';
import { describe, expect, it } from 'vitest';
import { assertPromotionEarned } from '../core/scientificWorlds/humanLab/epistemic';
import { redockCertificateInput, type GenesisPublicKeyFile } from '../core/reviewer/redockCertificate';
import {
  COMMITTED_CERTIFICATE, GENESIS_KEY_FILE, REDOCK_RECORD, REDOCK_RECORD_TEXT,
  forgeCertificate, recordedBestScoreText, relabelled, verifyEvidence, withEditedBestScore,
} from '../core/reviewer/signedEvidence';

const REPO = resolve(__dirname, '../../../..');
const SHA = 'a'.repeat(64);

/** A throwaway key standing in for the owner's future production key: generated in memory, never written anywhere. */
async function stagedGenesisKey(): Promise<{ keyFile: GenesisPublicKeyFile; certificate: Certificate }> {
  const keys = await generateKeyPair();
  const { kty, crv, x, y } = keys.publicKeyJwk as { kty: string; crv: string; x: string; y: string };
  const keyId = await computePublicKeyId({ kty, crv, x, y });
  const keyFile: GenesisPublicKeyFile = { ...GENESIS_KEY_FILE, status: 'ACTIVE', keyId, publicKeyJwk: { kty, crv, x, y }, validFrom: '2026-09-28T00:00:00Z' };
  const input = await redockCertificateInput(REDOCK_RECORD_TEXT);
  const draft = await buildCertificate(input);
  const signatureValue = await signFingerprint(draft.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
  const certificate = await buildCertificate(input, { algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString({ kty, crv, x, y }), signatureValue, signedAt: '2026-09-28T00:00:00Z' });
  return { keyFile, certificate };
}

describe('committed state — certificate and key files as they are in the repository', () => {
  it('the committed certificate verifies against the committed file, is a MODEL_ESTIMATE, and is honestly UNSIGNED until the key exists', async () => {
    const v = await verifyEvidence(REDOCK_RECORD_TEXT);
    expect(v.epistemicStatus).toBe('MODEL_ESTIMATE');
    expect(v.unaltered).toBe(true);
    expect(v.fileMatches).toBe(true);
    const expectedSigner = GENESIS_KEY_FILE.status === 'ACTIVE' ? 'SIGNED_BY_GENESIS_KEY' : 'UNSIGNED';
    expect(v.signer).toBe(expectedSigner);
  });

  it('the committed certificate is exactly what the shared builder produces (the script and the browser agree)', async () => {
    const rebuilt = await buildCertificate(await redockCertificateInput(REDOCK_RECORD_TEXT));
    expect(COMMITTED_CERTIFICATE.integrity.signedPayloadFingerprint).toBe(rebuilt.integrity.signedPayloadFingerprint);
    const [run] = COMMITTED_CERTIFICATE.provenance.provenanceTrail;
    expect(run!.inputFingerprint).toBe(REDOCK_RECORD.protocolFingerprint);
    expect(run!.outputFingerprint).toBe(REDOCK_RECORD.bodySha256);
  });

  it('/.well-known/genesis-csrn-key.json is byte-identical to docs/keys/genesis-csrn-signing-key.json', () => {
    const published = readFileSync(resolve(REPO, 'docs/keys/genesis-csrn-signing-key.json'), 'utf8');
    const wellKnown = readFileSync(resolve(REPO, 'packages/frontend/public/.well-known/genesis-csrn-key.json'), 'utf8');
    expect(wellKnown).toBe(published);
  });

  it('no private key material is committed: the key file and the certificate carry no JWK "d"', () => {
    for (const file of ['docs/keys/genesis-csrn-signing-key.json', 'packages/frontend/public/.well-known/genesis-csrn-key.json', 'docs/evidence/finalist-falsification-2026-09-27.csrn-cert.json']) {
      expect(readFileSync(resolve(REPO, file), 'utf8')).not.toMatch(/"d"\s*:/);
    }
  });
});

describe('tampering — the same failure for a changed number and a changed label', () => {
  it('rewriting ONE number (the best Vina score) in the evidence file: altered', async () => {
    const v = await verifyEvidence(withEditedBestScore('-14.2'));
    expect(v.fileMatches).toBe(false);
    expect(v.unaltered).toBe(false);
    expect(v.signer).toBe('NOT_CHECKED');
  });

  it('writing the same value back is not a false alarm', async () => {
    expect((await verifyEvidence(withEditedBestScore(recordedBestScoreText()))).unaltered).toBe(true);
  });

  it('relabelling MODEL_ESTIMATE as REAL_MEASUREMENT: INTEGRITY_INVALID', async () => {
    const v = await verifyEvidence(REDOCK_RECORD_TEXT, relabelled(COMMITTED_CERTIFICATE, 'REAL_MEASUREMENT'));
    expect(v.auditVerdict).toBe('INTEGRITY_INVALID');
    expect(v.unaltered).toBe(false);
  });

  it('with a Genesis key in place, both tampers still fail and the untouched evidence is SIGNED_BY_GENESIS_KEY', async () => {
    const { keyFile, certificate } = await stagedGenesisKey();
    const good = await verifyEvidence(REDOCK_RECORD_TEXT, certificate, keyFile);
    expect(good.signer).toBe('SIGNED_BY_GENESIS_KEY');
    expect(good.signerKeyId).toBe(keyFile.keyId);
    expect((await verifyEvidence(withEditedBestScore('-14.2'), certificate, keyFile)).unaltered).toBe(false);
    const promoted = await verifyEvidence(REDOCK_RECORD_TEXT, relabelled(certificate, 'REAL_MEASUREMENT'), keyFile);
    expect(promoted.auditVerdict).toBe('INTEGRITY_INVALID');
    expect(promoted.signer).toBe('NOT_CHECKED');
  });
});

describe('foreign key — a valid signature from someone else is SIGNED_UNTRUSTED, never verified', () => {
  it('a forger who edits the file, rebuilds every hash and signs with their own key: unaltered by its own hashes, but SIGNED_UNTRUSTED', async () => {
    const edited = withEditedBestScore('-14.2');
    const forged = await forgeCertificate(edited);
    const v = await verifyEvidence(edited, forged);
    expect(v.unaltered).toBe(true);
    expect(v.signer).toBe('SIGNED_UNTRUSTED');
    const { keyFile } = await stagedGenesisKey();
    const vs = await verifyEvidence(edited, forged, keyFile);
    expect(vs.signer).toBe('SIGNED_UNTRUSTED');
    expect(vs.signerKeyId).not.toBe(keyFile.keyId);
  });

  it('a key file whose keyId is not the SHA-256 identity of its own JWK is not trusted', async () => {
    const { keyFile, certificate } = await stagedGenesisKey();
    const lying = { ...keyFile, keyId: 'b'.repeat(64) };
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, certificate, lying)).signer).toBe('SIGNED_UNTRUSTED');
  });

  it('a REVOKED Genesis key is not trusted', async () => {
    const { keyFile, certificate } = await stagedGenesisKey();
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, certificate, { ...keyFile, status: 'REVOKED' })).signer).toBe('SIGNED_UNTRUSTED');
  });
});

describe('validity window and rotation — a disposable key, never the production one', () => {
  it('a signature claimed outside the key window is not trusted; a missing signing time fails closed', async () => {
    const { keyFile, certificate } = await stagedGenesisKey();
    const expired = { ...keyFile, validUntil: '2026-09-28T00:00:00Z' };
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, certificate, expired)).signer).toBe('SIGNED_BY_GENESIS_KEY');
    const early = { ...keyFile, validFrom: '2026-09-29T00:00:00Z' };
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, certificate, early)).signer).toBe('SIGNED_UNTRUSTED');
    const ended = { ...keyFile, validUntil: '2026-09-27T23:59:59Z' };
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, certificate, ended)).signer).toBe('SIGNED_UNTRUSTED');
    const noTime = { ...certificate, signature: { ...certificate.signature!, signedAt: 'not a time' } };
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, noTime, keyFile)).signer).toBe('SIGNED_UNTRUSTED');
  });

  it('rotation: a RETIRED key still verifies what it signed inside its window; a REVOKED previous key never does; the new key verifies new signatures', async () => {
    const old = await stagedGenesisKey();
    const next = await stagedGenesisKey();
    const rotatedOut = { keyId: old.keyFile.keyId!, publicKeyJwk: old.keyFile.publicKeyJwk!, validFrom: '2026-09-28T00:00:00Z', validUntil: '2026-12-31T00:00:00Z' };
    const rotated = (status: 'RETIRED' | 'REVOKED'): GenesisPublicKeyFile => ({ ...next.keyFile, validFrom: '2027-01-01T00:00:00Z', previousKeys: [{ ...rotatedOut, status }] });
    const viaRetired = await verifyEvidence(REDOCK_RECORD_TEXT, old.certificate, rotated('RETIRED'));
    expect(viaRetired.signer).toBe('SIGNED_BY_GENESIS_KEY');
    expect(viaRetired.signerKeyId).toBe(old.keyFile.keyId);
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, old.certificate, rotated('REVOKED'))).signer).toBe('SIGNED_UNTRUSTED');
    const outsideWindow = { ...rotated('RETIRED'), previousKeys: [{ ...rotatedOut, status: 'RETIRED' as const, validUntil: '2026-09-27T00:00:00Z' }] };
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, old.certificate, outsideWindow)).signer).toBe('SIGNED_UNTRUSTED');
    const lying = { ...rotated('RETIRED'), previousKeys: [{ ...rotatedOut, status: 'RETIRED' as const, keyId: 'c'.repeat(64) }] };
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, old.certificate, lying)).signer).toBe('SIGNED_UNTRUSTED');
    const newKeyOldWindow = { ...next.keyFile, validFrom: '2026-09-28T00:00:00Z' };
    expect((await verifyEvidence(REDOCK_RECORD_TEXT, next.certificate, newKeyOldWindow)).signer).toBe('SIGNED_BY_GENESIS_KEY');
  });
});

describe('assertPromotionEarned — no promotion to a measured/validated/confirmed status without a real record', () => {
  it('MODEL_ESTIMATE -> REAL_MEASUREMENT with nothing attached is refused', () => {
    expect(() => assertPromotionEarned('MODEL_ESTIMATE', 'REAL_MEASUREMENT', null)).toThrow(/EPISTEMIC_PROMOTION_UNEARNED/);
  });

  it('SIMULATION -> REAL_MEASUREMENT on a replay MATCH is refused: reproduced is not true', () => {
    expect(() => assertPromotionEarned('SIMULATION', 'REAL_MEASUREMENT', { kind: 'REPLAY_MATCH' })).toThrow(/computation reproduced, not that the claim is true/);
  });

  it('NOT_VALIDATED -> VALIDATED on a valid signature is refused: unaltered is not lab-validated', () => {
    expect(() => assertPromotionEarned('NOT_VALIDATED', 'VALIDATED', { kind: 'VALID_SIGNATURE' })).toThrow(/not that it was validated in a laboratory/);
  });

  it('UNKNOWN -> CONFIRMED on model agreement is refused', () => {
    expect(() => assertPromotionEarned('UNKNOWN', 'CONFIRMED', { kind: 'MODEL_AGREEMENT' })).toThrow(/EPISTEMIC_PROMOTION_UNEARNED/);
  });

  it('a measurement record without a content hash or source is refused', () => {
    expect(() => assertPromotionEarned('MODEL_ESTIMATE', 'REAL_MEASUREMENT', { kind: 'EXTERNAL_MEASUREMENT', sourceId: 'lab-assay-1', sha256: 'not-a-hash' })).toThrow(/SHA-256/);
    expect(() => assertPromotionEarned('MODEL_ESTIMATE', 'REAL_MEASUREMENT', { kind: 'EXTERNAL_MEASUREMENT', sourceId: ' ', sha256: SHA })).toThrow(/source id/);
  });

  it('a real, hashed measurement or laboratory record is a qualifying basis', () => {
    expect(() => assertPromotionEarned('MODEL_ESTIMATE', 'REAL_MEASUREMENT', { kind: 'EXTERNAL_MEASUREMENT', sourceId: 'lab-assay-1', sha256: SHA })).not.toThrow();
    expect(() => assertPromotionEarned('NOT_VALIDATED', 'VALIDATED', { kind: 'LABORATORY_VALIDATION', sourceId: 'lab-report-7', sha256: SHA })).not.toThrow();
  });

  it('downgrades and moves between non-measured statuses need no basis', () => {
    expect(() => assertPromotionEarned('REAL_MEASUREMENT', 'MODEL_ESTIMATE', null)).not.toThrow();
    expect(() => assertPromotionEarned('SIMULATION', 'NOT_VALIDATED', null)).not.toThrow();
    expect(() => assertPromotionEarned('MODEL_ESTIMATE', 'MODEL_ESTIMATE', null)).not.toThrow();
  });
});
