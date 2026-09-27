import { describe, expect, it } from 'vitest';
import { assertPromotionEarned } from '../core/scientificWorlds/humanLab/epistemic';
import {
  REDOCK_RECORD, REDOCK_RECORD_TEXT, recordedBestScoreText, signCommittedEvidence, verifyEvidence, withEditedBestScore,
} from '../core/reviewer/signedEvidence';

const SHA = 'a'.repeat(64);

describe('reviewer signed evidence — the committed D-150 redock record through CSRN', () => {
  it('the untouched committed file verifies, signer key named, and it is still a MODEL_ESTIMATE', async () => {
    const signed = await signCommittedEvidence();
    const v = await verifyEvidence(signed, REDOCK_RECORD_TEXT);
    expect(v.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');
    expect(v.fileMatches).toBe(true);
    expect(v.verified).toBe(true);
    expect(v.signerKeyId).toBe(signed.trustedKeyId);
    expect(v.epistemicStatus).toBe('MODEL_ESTIMATE');
  });

  it('the provenance chain runs protocol -> recorded run body -> committed bytes', async () => {
    const { certificate } = await signCommittedEvidence();
    const [run, file] = certificate.provenance.provenanceTrail;
    expect(run!.inputFingerprint).toBe(REDOCK_RECORD.protocolFingerprint);
    expect(run!.outputFingerprint).toBe(REDOCK_RECORD.bodySha256);
    expect(file!.inputFingerprint).toBe(REDOCK_RECORD.bodySha256);
  });

  it('rewriting ONE number (the best Vina score) in the file fails verification', async () => {
    const signed = await signCommittedEvidence();
    const edited = withEditedBestScore('-14.2');
    expect(edited).not.toBe(REDOCK_RECORD_TEXT);
    const v = await verifyEvidence(signed, edited);
    expect(v.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');
    expect(v.fileMatches).toBe(false);
    expect(v.verified).toBe(false);
  });

  it('writing the same value back is not a false alarm', async () => {
    const signed = await signCommittedEvidence();
    const v = await verifyEvidence(signed, withEditedBestScore(recordedBestScoreText()));
    expect(v.verified).toBe(true);
  });

  it('relabelling the signed MODEL_ESTIMATE as REAL_MEASUREMENT breaks the certificate', async () => {
    const signed = await signCommittedEvidence();
    const promoted = { ...signed.certificate, claim: { ...signed.certificate.claim, epistemicStatus: 'REAL_MEASUREMENT' } };
    const v = await verifyEvidence(signed, REDOCK_RECORD_TEXT, promoted);
    expect(v.verdict).toBe('INTEGRITY_INVALID');
    expect(v.verified).toBe(false);
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

  it('a measurement record without a content hash is refused', () => {
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
