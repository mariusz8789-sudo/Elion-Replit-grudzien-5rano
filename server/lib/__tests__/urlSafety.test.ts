import { describe, it, expect } from "vitest";
import { assertPublicHttpUrl } from "../urlSafety";

describe("assertPublicHttpUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicHttpUrl("ftp://example.com")).rejects.toThrow();
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects malformed URLs", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toThrow();
  });

  it("rejects loopback IPs directly in the URL", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/webhook")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://[::1]/webhook")).rejects.toThrow();
  });

  it("rejects private network IPs directly in the URL", async () => {
    await expect(assertPublicHttpUrl("http://10.0.0.5/webhook")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://192.168.1.1/webhook")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://172.16.0.1/webhook")).rejects.toThrow();
  });

  it("rejects the cloud metadata link-local address", async () => {
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
  });

  it("rejects the localhost hostname", async () => {
    await expect(assertPublicHttpUrl("http://localhost:3000/webhook")).rejects.toThrow();
  });

  it("accepts a plausible public https URL with a literal public IP", async () => {
    // Use a literal public IP to avoid a real DNS lookup in the test environment.
    await expect(assertPublicHttpUrl("https://8.8.8.8/webhook")).resolves.toBeUndefined();
  });
});
