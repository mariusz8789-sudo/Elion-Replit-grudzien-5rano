import { describe, expect, it } from 'vitest';
import { sha256Hex, computeFingerprint, bytesToHex, hexToBytes } from '../src/crypto/fingerprint.js';

describe('sha256Hex — real SHA-256 via Web Crypto, not a placeholder', () => {
  it('matches the NIST test vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches the known digest of the empty string', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('is 64 hex characters (32 bytes) regardless of input length', async () => {
    expect((await sha256Hex('a')).length).toBe(64);
    expect((await sha256Hex('a'.repeat(10_000))).length).toBe(64);
  });

  it('a single-bit change in the input produces a completely different digest', async () => {
    const a = await sha256Hex('genesis');
    const b = await sha256Hex('genesie');
    expect(a).not.toBe(b);
  });
});

describe('computeFingerprint — SHA-256 of canonical JSON', () => {
  it('is stable across key reordering (canonicalization applied before hashing)', async () => {
    const a = await computeFingerprint({ b: 1, a: 2 });
    const b = await computeFingerprint({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('changes when any field value changes', async () => {
    const a = await computeFingerprint({ claim: 'X is true' });
    const b = await computeFingerprint({ claim: 'X is false' });
    expect(a).not.toBe(b);
  });
});

describe('bytesToHex / hexToBytes — round trip', () => {
  it('round-trips arbitrary byte sequences', () => {
    const bytes = new Uint8Array([0, 1, 255, 16, 128, 7]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('hexToBytes rejects malformed hex', () => {
    expect(() => hexToBytes('zz')).toThrow();
    expect(() => hexToBytes('abc')).toThrow(); // odd length
  });
});
