import { describe, it, expect, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("pubsub", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("is not distributed and delivers synchronously when REDIS_URL is unset", async () => {
    process.env.REDIS_URL = "";
    const { getPubSubProvider } = await import("../pubsub");
    const provider = getPubSubProvider();
    expect(provider.isDistributed).toBe(false);

    const received: unknown[] = [];
    provider.onMessage((message) => received.push(message));

    await provider.publish({ scope: "user", id: "user-1", payload: { hello: "world" } });

    expect(received).toEqual([{ scope: "user", id: "user-1", payload: { hello: "world" } }]);
  });

  it("returns the same singleton instance across calls", async () => {
    process.env.REDIS_URL = "";
    const { getPubSubProvider } = await import("../pubsub");
    expect(getPubSubProvider()).toBe(getPubSubProvider());
  });

  it("fans out to multiple registered handlers", async () => {
    process.env.REDIS_URL = "";
    const { getPubSubProvider } = await import("../pubsub");
    const provider = getPubSubProvider();

    const first = vi.fn();
    const second = vi.fn();
    provider.onMessage(first);
    provider.onMessage(second);

    await provider.publish({ scope: "booking", id: "booking-1", payload: { status: "delivered" } });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
