import { describe, it, expect } from "vitest";
import { validateDataUrl } from "../dataUrl";

const smallJpeg = `data:image/jpeg;base64,${Buffer.from("x".repeat(100)).toString("base64")}`;

describe("validateDataUrl", () => {
  it("accepts a well-formed data URL within the size and MIME allowlist", () => {
    const result = validateDataUrl(smallJpeg, { allowedMimeTypes: ["image/jpeg"], maxBytes: 1024 });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("rejects a malformed (non-data-URL) string", () => {
    expect(() => validateDataUrl("not-a-data-url", { allowedMimeTypes: ["image/jpeg"], maxBytes: 1024 })).toThrow();
    expect(() => validateDataUrl("https://example.com/x.jpg", { allowedMimeTypes: ["image/jpeg"], maxBytes: 1024 })).toThrow();
  });

  it("rejects a MIME type outside the allowlist", () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`;
    expect(() => validateDataUrl(svg, { allowedMimeTypes: ["image/jpeg", "image/png"], maxBytes: 1024 })).toThrow();
  });

  it("rejects a file larger than maxBytes", () => {
    const bigPayload = Buffer.from("x".repeat(2000)).toString("base64");
    const bigDataUrl = `data:image/jpeg;base64,${bigPayload}`;
    expect(() => validateDataUrl(bigDataUrl, { allowedMimeTypes: ["image/jpeg"], maxBytes: 1024 })).toThrow();
  });
});
