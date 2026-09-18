/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Bytes, sha256HexSync } from './sha256.js';
import { sha256hex } from './EvidenceLedger.js';

const nodeHex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

/**
 * The ledger's hash moved from node:crypto to the pure implementation so the
 * engines can run in the browser. Every hash the ledger ever wrote must stay
 * valid, so this is a bit-identity check against node:crypto, not a smoke test.
 */
describe('sha256 — bit-identical to node:crypto', () => {
  it('matches the FIPS 180-4 known-answer vectors', () => {
    expect(sha256HexSync('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256HexSync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256HexSync('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches node:crypto across every padding boundary (0..130 bytes) and for a 1 MiB input', () => {
    for (let n = 0; n <= 130; n++) {
      const s = 'x'.repeat(n);
      expect(sha256HexSync(s)).toBe(nodeHex(s));
    }
    const big = 'genesis'.repeat(150000);
    expect(sha256HexSync(big)).toBe(nodeHex(big));
  });

  it('matches node:crypto on non-ASCII (multi-byte UTF-8) and on the ledger JSON shape', () => {
    for (const s of ['zażółć gęślą jaźń', '漢字とカタカナ', '🧬🔬', '{"a":1,"b":[1,2,3],"c":"ś"}']) {
      expect(sha256HexSync(s)).toBe(nodeHex(s));
      expect(sha256hex(s)).toBe(nodeHex(s));
    }
  });

  it('digests raw bytes deterministically (same input, same 32 bytes)', () => {
    const a = sha256Bytes(new Uint8Array([0, 1, 2, 255]));
    const b = sha256Bytes(new Uint8Array([0, 1, 2, 255]));
    expect(a.length).toBe(32);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(sha256Bytes(new Uint8Array([0, 1, 2, 254]))));
  });
});
