import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function freshProvidersModule() {
  vi.resetModules();
  return await import("../providers");
}

describe("getRoadServiceProvider", () => {
  const originalUrl = process.env.VIGNETTE_PROVIDER_API_URL;
  const originalKey = process.env.VIGNETTE_PROVIDER_API_KEY;

  beforeEach(() => {
    delete process.env.VIGNETTE_PROVIDER_API_URL;
    delete process.env.VIGNETTE_PROVIDER_API_KEY;
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.VIGNETTE_PROVIDER_API_URL;
    else process.env.VIGNETTE_PROVIDER_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.VIGNETTE_PROVIDER_API_KEY;
    else process.env.VIGNETTE_PROVIDER_API_KEY = originalKey;
  });

  it("is not configured when no base URL/key are set", async () => {
    const { getRoadServiceProvider } = await freshProvidersModule();
    const provider = getRoadServiceProvider("vignette");
    expect(provider.isConfigured()).toBe(false);
  });

  it("is configured once both base URL and key are set", async () => {
    process.env.VIGNETTE_PROVIDER_API_URL = "https://vignette-partner.example.com";
    process.env.VIGNETTE_PROVIDER_API_KEY = "test-key";
    const { getRoadServiceProvider } = await freshProvidersModule();
    const provider = getRoadServiceProvider("vignette");
    expect(provider.isConfigured()).toBe(true);
  });

  it("rejects listProducts/purchase calls when unconfigured rather than fabricating data", async () => {
    const { getRoadServiceProvider } = await freshProvidersModule();
    const provider = getRoadServiceProvider("vignette");
    await expect(provider.listProducts({})).rejects.toThrow(/not configured/);
    await expect(provider.purchase({ externalProductId: "x", vehicleType: "van", quantity: 1 })).rejects.toThrow(/not configured/);
  });

  it("returns the same singleton instance per category", async () => {
    const { getRoadServiceProvider } = await freshProvidersModule();
    expect(getRoadServiceProvider("toll")).toBe(getRoadServiceProvider("toll"));
  });

  it("keeps categories independently configured", async () => {
    process.env.VIGNETTE_PROVIDER_API_URL = "https://vignette-partner.example.com";
    process.env.VIGNETTE_PROVIDER_API_KEY = "test-key";
    const { getRoadServiceProvider } = await freshProvidersModule();
    expect(getRoadServiceProvider("vignette").isConfigured()).toBe(true);
    expect(getRoadServiceProvider("toll").isConfigured()).toBe(false);
  });
});
