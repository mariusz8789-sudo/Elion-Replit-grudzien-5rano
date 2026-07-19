import { describe, it, expect } from "vitest";
import { base32Encode, base32Decode, generateTotp, verifyTotp, generateTotpSecret, generateBackupCodes } from "./totp";

// RFC 6238 Appendix B test vectors: HMAC-SHA1, 8 digits, seed = ASCII "12345678901234567890".
const RFC_SEED_BASE32 = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("base32Encode/base32Decode", () => {
  it("round-trips arbitrary bytes", () => {
    const original = Buffer.from("12345678901234567890", "ascii");
    expect(base32Decode(base32Encode(original))).toEqual(original);
  });
});

describe("generateTotp against RFC 6238 Appendix B vectors", () => {
  const vectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];

  for (const [seconds, expected] of vectors) {
    it(`matches the RFC vector for T=${seconds}s`, () => {
      const code = generateTotp(RFC_SEED_BASE32, { digits: 8, forTimeMs: seconds * 1000 });
      expect(code).toBe(expected);
    });
  }
});

describe("verifyTotp", () => {
  it("accepts the exact current code", () => {
    const code = generateTotp(RFC_SEED_BASE32, { digits: 8, forTimeMs: 59_000 });
    expect(verifyTotp(code, RFC_SEED_BASE32, { digits: 8, forTimeMs: 59_000 })).toBe(true);
  });

  it("accepts a code from one step of clock drift", () => {
    const code = generateTotp(RFC_SEED_BASE32, { digits: 8, forTimeMs: 59_000 });
    // 30s later is the next time-step - within the default ±1 step window.
    expect(verifyTotp(code, RFC_SEED_BASE32, { digits: 8, forTimeMs: 59_000 + 30_000 })).toBe(true);
  });

  it("rejects a code two steps outside the window", () => {
    const code = generateTotp(RFC_SEED_BASE32, { digits: 8, forTimeMs: 59_000 });
    expect(verifyTotp(code, RFC_SEED_BASE32, { digits: 8, forTimeMs: 59_000 + 90_000 })).toBe(false);
  });

  it("rejects a wrong code", () => {
    expect(verifyTotp("00000000", RFC_SEED_BASE32, { digits: 8, forTimeMs: 59_000 })).toBe(false);
  });
});

describe("generateTotpSecret / generateBackupCodes", () => {
  it("generates a decodable, non-empty base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(0);
    expect(base32Decode(secret).length).toBe(20);
  });

  it("generates the requested number of unique backup codes", () => {
    const codes = generateBackupCodes(8);
    expect(codes.length).toBe(8);
    expect(new Set(codes).size).toBe(8);
  });
});
