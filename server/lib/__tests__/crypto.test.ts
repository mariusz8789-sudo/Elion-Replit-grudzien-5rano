import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, hashApiKey, generateApiKey, signWebhookPayload } from "../crypto";

describe("crypto", () => {
  it("round-trips a secret through encrypt/decrypt", () => {
    const plaintext = "gho_super_secret_oauth_token";
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a).not.toBe(b);
  });

  it("throws on a malformed encrypted payload", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow();
  });

  it("throws when the ciphertext has been tampered with", () => {
    const encrypted = encryptSecret("tamper-test");
    const [iv, tag, data] = encrypted.split(".");
    const tampered = [iv, tag, data.slice(0, -2) + "AA"].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("hashes API keys deterministically", () => {
    const key = "p2p_live_abc123";
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toBe(key);
  });

  it("generates unique API keys with a stable prefix relationship", () => {
    const { rawKey, prefix } = generateApiKey();
    expect(rawKey.startsWith("p2p_live_")).toBe(true);
    expect(rawKey.startsWith(prefix)).toBe(true);
    expect(generateApiKey().rawKey).not.toBe(rawKey);
  });

  it("signs webhook payloads with HMAC-SHA256 deterministically per secret", () => {
    const payload = JSON.stringify({ event: "booking.status_changed" });
    const sigA = signWebhookPayload("secret-a", payload);
    const sigB = signWebhookPayload("secret-b", payload);
    expect(sigA).toHaveLength(64);
    expect(sigA).not.toBe(sigB);
    expect(signWebhookPayload("secret-a", payload)).toBe(sigA);
  });
});
