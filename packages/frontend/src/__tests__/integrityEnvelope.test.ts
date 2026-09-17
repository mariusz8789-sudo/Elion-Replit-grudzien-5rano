import { describe, expect, it } from 'vitest';
import {
  buildIntegrityEnvelope, computeIntegrityHash, verifyIntegrityEnvelope,
  generateSigningKeyPair, exportPublicKeySpki, importPublicKeySpki,
  signIntegrityEnvelope, verifySignedEnvelope,
  type ExportableRecord, type IntegrityEnvelope, type SignedIntegrityEnvelope,
} from '../core/integrity';

describe('Integrity Envelope — (a) determinism', () => {
  it('produces the identical hash for the identical record across repeated calls', async () => {
    const record: ExportableRecord = { hypothesisId: 'hyp-1', statement: 'Temperature increases reaction rate', evidence: { count: 5, score: 0.85 } };
    const hashes = await Promise.all([1, 2, 3, 4, 5].map(() => computeIntegrityHash(record)));
    expect(new Set(hashes).size).toBe(1);
    expect(hashes[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces the same hash for a shallow clone of the same record', async () => {
    const record: ExportableRecord = { id: 'r-1', value: 42, label: 'test' };
    expect(await computeIntegrityHash(record)).toBe(await computeIntegrityHash({ ...record }));
  });
});

describe('Integrity Envelope — (b) key-order independence', () => {
  it('produces the same hash for flat objects differing only in key insertion order', async () => {
    const hashes = await Promise.all([
      computeIntegrityHash({ x: 1, y: 2, z: 3 }),
      computeIntegrityHash({ z: 3, y: 2, x: 1 }),
      computeIntegrityHash({ y: 2, x: 1, z: 3 }),
    ]);
    expect(new Set(hashes).size).toBe(1);
  });

  it('produces the same hash for deeply nested objects differing only in key order, at every level', async () => {
    const a: ExportableRecord = { level1: { level2: { z: 26, a: 1, m: 13 }, beta: 2, alpha: 1 }, topB: 1, topA: 2 };
    const b: ExportableRecord = { topA: 2, topB: 1, level1: { alpha: 1, beta: 2, level2: { a: 1, m: 13, z: 26 } } };
    expect(await computeIntegrityHash(a)).toBe(await computeIntegrityHash(b));
  });

  it('produces DIFFERENT hashes when array element order differs (arrays are ordered, never sorted)', async () => {
    expect(await computeIntegrityHash({ items: [1, 2, 3] })).not.toBe(await computeIntegrityHash({ items: [3, 2, 1] }));
  });
});

describe('Integrity Envelope — (c) tamper detection', () => {
  it('detects a one-character change in a string value', async () => {
    const original: ExportableRecord = { id: 'exp-123', result: 'success' };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    expect((await verifyIntegrityEnvelope(envelope)).valid).toBe(true);

    const tampered: IntegrityEnvelope = { ...envelope, record: { ...original, result: 'succesx' } };
    const result = await verifyIntegrityEnvelope(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Hash mismatch');
  });

  it('detects a field added, a field removed, and a value changed after export', async () => {
    const original: ExportableRecord = { id: 'exp-1', value: 100, extra: 'data' };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());

    expect((await verifyIntegrityEnvelope({ ...envelope, record: { ...original, injected: true } })).valid).toBe(false);
    const { extra: _removed, ...stripped } = original;
    expect((await verifyIntegrityEnvelope({ ...envelope, record: stripped })).valid).toBe(false);
    expect((await verifyIntegrityEnvelope({ ...envelope, record: { ...original, value: 999 } })).valid).toBe(false);
  });

  it('detects tampering even when the attacker re-orders keys to try to hide it', async () => {
    const original: ExportableRecord = { a: 1, b: 2, c: 3 };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    const tampered: IntegrityEnvelope = { ...envelope, record: { c: 3, a: 999, b: 2 } };
    expect((await verifyIntegrityEnvelope(tampered)).valid).toBe(false);
  });
});

describe('Integrity Envelope — (d) nested structure affects the hash', () => {
  it('detects a change at arbitrary nesting depth', async () => {
    const original: ExportableRecord = { level1: { level2: { level3: { level4: { value: 'deep' } } } } };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    const tampered: IntegrityEnvelope = { ...envelope, record: { level1: { level2: { level3: { level4: { value: 'changed' } } } } } };
    expect((await verifyIntegrityEnvelope(tampered)).valid).toBe(false);
  });

  it('detects a change to one element of an object nested inside an array', async () => {
    const original: ExportableRecord = { experiments: [{ id: 'e1', value: 10 }, { id: 'e2', value: 20 }] };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    const tampered: IntegrityEnvelope = { ...envelope, record: { experiments: [{ id: 'e1', value: 10 }, { id: 'e2', value: 999 }] } };
    expect((await verifyIntegrityEnvelope(tampered)).valid).toBe(false);
  });
});

describe('Integrity Envelope — normalization matches what actually gets downloaded', () => {
  it('a record with undefined-valued fields verifies cleanly after a real JSON round-trip (no false DRIFT)', async () => {
    // The exact failure mode this guards against: without normalizing before
    // hashing, {a: undefined} would hash as though "a" were present (null),
    // but JSON.stringify (what the real download does) DROPS the key
    // entirely — so re-opening the downloaded file would recompute a
    // different hash and falsely report tampering on an untouched file.
    const original = { id: 'exp-1', maybeField: undefined, value: 42 } as unknown as ExportableRecord;
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());

    // Simulate the real download -> reopen cycle: serialize, then parse back.
    const downloaded = JSON.parse(JSON.stringify(envelope)) as IntegrityEnvelope;
    const result = await verifyIntegrityEnvelope(downloaded);
    expect(result.valid).toBe(true);
  });

  it('normalizes Date objects the same way JSON.stringify does, rather than silently dropping them', async () => {
    const date = new Date('2026-09-10T12:00:00.000Z');
    const withDate: ExportableRecord = { recordedAt: date };
    const withEquivalentString: ExportableRecord = { recordedAt: date.toISOString() };
    expect(await computeIntegrityHash(withDate)).toBe(await computeIntegrityHash(withEquivalentString));
  });
});

describe('Integrity Envelope — build and structural validation', () => {
  it('builds a well-formed envelope carrying an explicit non-signature disclaimer', async () => {
    const record: ExportableRecord = { id: 'test-123', value: 42 };
    const exportedAt = '2026-09-10T12:00:00.000Z';
    const envelope = await buildIntegrityEnvelope(record, exportedAt);
    expect(envelope.record).toBe(record);
    expect(envelope.exportedAt).toBe(exportedAt);
    expect(envelope.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.verificationInstructions).toContain('NOT a cryptographic signature');
    expect(envelope.verificationInstructions).toContain('SHA-256');
  });

  it('rejects an envelope with a malformed hash', async () => {
    const envelope: IntegrityEnvelope = { record: { test: 'data' }, integrityHash: 'not-a-hash', exportedAt: new Date().toISOString(), verificationInstructions: '' };
    const result = await verifyIntegrityEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid envelope');
  });

  it('rejects an envelope with no record', async () => {
    const envelope = { record: null, integrityHash: 'a'.repeat(64), exportedAt: '', verificationInstructions: '' } as unknown as IntegrityEnvelope;
    expect((await verifyIntegrityEnvelope(envelope)).valid).toBe(false);
  });
});

describe('Integrity Envelope — edge cases', () => {
  it('handles null values, empty objects, and empty arrays without throwing', async () => {
    await expect(computeIntegrityHash({ value: null, nested: { inner: null } })).resolves.toMatch(/^[a-f0-9]{64}$/);
    const emptyObjHash = await computeIntegrityHash({});
    const emptyArrHash = await computeIntegrityHash({ items: [] });
    expect(emptyObjHash).not.toBe(emptyArrHash);
  });

  it('handles unicode text', async () => {
    await expect(computeIntegrityHash({ text: 'Unicode: 你好 世界 🌍 αβγδ' })).resolves.toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Signed Integrity Envelope — real ECDSA signatures, zero dependencies', () => {
  it('signs and verifies a real envelope end to end', async () => {
    const record: ExportableRecord = { hypothesisId: 'hyp-1', assessment: 'SUPPORTED_WITHIN_PROTOCOL' };
    const envelope = await buildIntegrityEnvelope(record, new Date().toISOString());
    const keyPair = await generateSigningKeyPair();
    const signed = await signIntegrityEnvelope(envelope, keyPair);

    expect(signed.signatureAlgorithm).toBe('ECDSA-P256-SHA256');
    expect(signed.signature.length).toBeGreaterThan(0);
    expect(signed.publicKeySpki.length).toBeGreaterThan(0);

    const result = await verifySignedEnvelope(signed);
    expect(result.valid).toBe(true);
  });

  it('rejects a signature produced by a DIFFERENT key pair (not the one embedded)', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const realKeyPair = await generateSigningKeyPair();
    const attackerKeyPair = await generateSigningKeyPair();
    const signed = await signIntegrityEnvelope(envelope, realKeyPair);

    // An attacker who tampers the payload and re-signs with their OWN key still
    // fails verification once the record no longer matches the original hash —
    // but even re-signing an UNCHANGED hash with a different key must fail,
    // because the signature bytes themselves would differ.
    const forged: SignedIntegrityEnvelope = { ...signed, signature: (await signIntegrityEnvelope(envelope, attackerKeyPair)).signature };
    const result = await verifySignedEnvelope(forged);
    expect(result.valid).toBe(false);
  });

  it('detects tampering of the record even when the signature field itself is untouched', async () => {
    const original = { balance: 100 };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    const keyPair = await generateSigningKeyPair();
    const signed = await signIntegrityEnvelope(envelope, keyPair);

    const tampered: SignedIntegrityEnvelope = { ...signed, record: { balance: 999999 } };
    const result = await verifySignedEnvelope(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Hash mismatch');
  });

  it('expectedPublicKeySpki: accepts the real signer\'s key and rejects an impostor\'s, even though the impostor\'s own signature verifies against ITS OWN embedded key', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const realSigner = await generateSigningKeyPair();
    const impostor = await generateSigningKeyPair();

    const signedByRealSigner = await signIntegrityEnvelope(envelope, realSigner);
    const signedByImpostor = await signIntegrityEnvelope(envelope, impostor);

    const realSignerFingerprint = await exportPublicKeySpki(realSigner.publicKey);

    // Without an expected key, both verify — each is internally self-consistent.
    expect((await verifySignedEnvelope(signedByRealSigner)).valid).toBe(true);
    expect((await verifySignedEnvelope(signedByImpostor)).valid).toBe(true);

    // With the real signer's known fingerprint, only the real signer's envelope passes.
    expect((await verifySignedEnvelope(signedByRealSigner, realSignerFingerprint)).valid).toBe(true);
    const impostorResult = await verifySignedEnvelope(signedByImpostor, realSignerFingerprint);
    expect(impostorResult.valid).toBe(false);
    expect(impostorResult.reason).toContain('does not match the expected signer');
  });

  it('importPublicKeySpki round-trips exportPublicKeySpki into a usable verification key', async () => {
    const keyPair = await generateSigningKeyPair();
    const exported = await exportPublicKeySpki(keyPair.publicKey);
    const reimported = await importPublicKeySpki(exported);
    expect(await exportPublicKeySpki(reimported)).toBe(exported);
  });

  it('rejects a signed envelope missing its signature or public key', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const keyPair = await generateSigningKeyPair();
    const signed = await signIntegrityEnvelope(envelope, keyPair);

    expect((await verifySignedEnvelope({ ...signed, signature: '' })).valid).toBe(false);
    expect((await verifySignedEnvelope({ ...signed, publicKeySpki: '' })).valid).toBe(false);
    expect((await verifySignedEnvelope({ ...signed, signatureAlgorithm: 'RSA-FAKE' as SignedIntegrityEnvelope['signatureAlgorithm'] })).valid).toBe(false);
  });

  it('the same envelope signed twice by the same key produces two DIFFERENT signature bytes (ECDSA is randomized) but both verify', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const keyPair = await generateSigningKeyPair();
    const first = await signIntegrityEnvelope(envelope, keyPair);
    const second = await signIntegrityEnvelope(envelope, keyPair);
    expect(first.signature).not.toBe(second.signature);
    expect((await verifySignedEnvelope(first)).valid).toBe(true);
    expect((await verifySignedEnvelope(second)).valid).toBe(true);
  });

  it('signIntegrityEnvelope stamps signedAt with an ISO timestamp by default, distinct from the underlying exportedAt', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, '2020-01-01T00:00:00.000Z');
    const keyPair = await generateSigningKeyPair();
    const before = new Date();
    const signed = await signIntegrityEnvelope(envelope, keyPair);
    const after = new Date();

    expect(signed.signedAt).not.toBe(envelope.exportedAt);
    const signedAtMs = new Date(signed.signedAt).getTime();
    expect(signedAtMs).toBeGreaterThanOrEqual(before.getTime());
    expect(signedAtMs).toBeLessThanOrEqual(after.getTime());
  });

  it('signIntegrityEnvelope accepts an explicit signedAt override', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const keyPair = await generateSigningKeyPair();
    const fixedSignedAt = '2026-01-01T00:00:00.000Z';
    const signed = await signIntegrityEnvelope(envelope, keyPair, fixedSignedAt);
    expect(signed.signedAt).toBe(fixedSignedAt);
    expect((await verifySignedEnvelope(signed)).valid).toBe(true);
  });

  it('rejects a signed envelope missing signedAt', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const keyPair = await generateSigningKeyPair();
    const signed = await signIntegrityEnvelope(envelope, keyPair);
    const { signedAt: _dropped, ...withoutSignedAt } = signed;
    const result = await verifySignedEnvelope(withoutSignedAt as unknown as SignedIntegrityEnvelope);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('STRUCTURALLY_INVALID');
  });
});

describe('Integrity Envelope — IntegrityCertificateStatus (five-value verdict)', () => {
  it('verifyIntegrityEnvelope reports INTEGRITY_VALID_UNSIGNED for a valid unsigned envelope', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const result = await verifyIntegrityEnvelope(envelope);
    expect(result.status).toBe('INTEGRITY_VALID_UNSIGNED');
  });

  it('verifyIntegrityEnvelope reports INTEGRITY_INVALID for a tampered record', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const result = await verifyIntegrityEnvelope({ ...envelope, record: { a: 2 } });
    expect(result.status).toBe('INTEGRITY_INVALID');
  });

  it('verifyIntegrityEnvelope reports STRUCTURALLY_INVALID for a malformed envelope', async () => {
    const result = await verifyIntegrityEnvelope({ record: null } as unknown as IntegrityEnvelope);
    expect(result.status).toBe('STRUCTURALLY_INVALID');
  });

  it('verifySignedEnvelope reports INTEGRITY_SIGNED_VERIFIED for a validly signed, trusted envelope', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const keyPair = await generateSigningKeyPair();
    const signed = await signIntegrityEnvelope(envelope, keyPair);
    const result = await verifySignedEnvelope(signed);
    expect(result.status).toBe('INTEGRITY_SIGNED_VERIFIED');
  });

  it('verifySignedEnvelope reports INTEGRITY_SIGNED_UNTRUSTED when the signer is not the expected one', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const realSigner = await generateSigningKeyPair();
    const impostor = await generateSigningKeyPair();
    const signedByImpostor = await signIntegrityEnvelope(envelope, impostor);
    const realSignerFingerprint = await exportPublicKeySpki(realSigner.publicKey);

    const result = await verifySignedEnvelope(signedByImpostor, realSignerFingerprint);
    expect(result.status).toBe('INTEGRITY_SIGNED_UNTRUSTED');
  });

  it('verifySignedEnvelope reports INTEGRITY_INVALID when the signature bytes do not verify', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const realKeyPair = await generateSigningKeyPair();
    const attackerKeyPair = await generateSigningKeyPair();
    const signed = await signIntegrityEnvelope(envelope, realKeyPair);
    const forged: SignedIntegrityEnvelope = { ...signed, signature: (await signIntegrityEnvelope(envelope, attackerKeyPair)).signature };

    const result = await verifySignedEnvelope(forged);
    expect(result.status).toBe('INTEGRITY_INVALID');
  });

  it('verifySignedEnvelope reports STRUCTURALLY_INVALID for a signed envelope missing its signature field', async () => {
    const envelope = await buildIntegrityEnvelope({ a: 1 }, new Date().toISOString());
    const keyPair = await generateSigningKeyPair();
    const signed = await signIntegrityEnvelope(envelope, keyPair);
    const result = await verifySignedEnvelope({ ...signed, signature: '' });
    expect(result.status).toBe('STRUCTURALLY_INVALID');
  });

  it('verifySignedEnvelope propagates STRUCTURALLY_INVALID from the underlying hash check on a malformed envelope', async () => {
    const result = await verifySignedEnvelope({ record: null } as unknown as SignedIntegrityEnvelope);
    expect(result.status).toBe('STRUCTURALLY_INVALID');
  });
});
