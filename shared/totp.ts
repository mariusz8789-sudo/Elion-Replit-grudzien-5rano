import { createHmac, randomBytes } from "crypto";

// RFC 6238 TOTP (HMAC-SHA1, the algorithm every authenticator app - Google Authenticator, Authy,
// 1Password - implements) built on Node's built-in crypto rather than a third-party MFA library,
// so there's no new runtime dependency for something this small and security-critical to get
// exactly right. Verified against the official RFC 6238 Appendix B test vectors in totp.test.ts.
export const TOTP_METHODOLOGY = "movex-mfa-totp-v1";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  // Time-step counters here are far below Number.MAX_SAFE_INTEGER, so splitting into two
  // 32-bit big-endian halves is safe without needing BigInt.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** digits).padStart(digits, "0");
}

export interface TotpOptions {
  digits?: number;
  stepSeconds?: number;
  forTimeMs?: number;
}

export function generateTotp(secretBase32: string, opts: TotpOptions = {}): string {
  const digits = opts.digits ?? 6;
  const stepSeconds = opts.stepSeconds ?? 30;
  const time = opts.forTimeMs ?? Date.now();
  const counter = Math.floor(time / 1000 / stepSeconds);
  return hotp(base32Decode(secretBase32), counter, digits);
}

// Accepts a code from one step before/after "now" (± `window` steps) to tolerate normal clock
// drift between the server and the user's phone - the same tolerance every TOTP implementation
// applies, not a security weakening.
export function verifyTotp(token: string, secretBase32: string, opts: TotpOptions & { window?: number } = {}): boolean {
  const window = opts.window ?? 1;
  const stepSeconds = opts.stepSeconds ?? 30;
  const digits = opts.digits ?? 6;
  const time = opts.forTimeMs ?? Date.now();
  const secret = base32Decode(secretBase32);
  const currentCounter = Math.floor(time / 1000 / stepSeconds);
  const cleanToken = token.replace(/\s/g, "");
  for (let delta = -window; delta <= window; delta++) {
    if (hotp(secret, currentCounter + delta, digits) === cleanToken) return true;
  }
  return false;
}

export function buildOtpAuthUri(secretBase32: string, accountLabel: string, issuer = "MoveX"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomBytes(5).toString("hex"));
}
