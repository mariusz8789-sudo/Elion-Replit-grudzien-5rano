import { describe, it, expect, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("calendarSync providers", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    // server/env.ts freezes env vars into a validated object at import time,
    // so each test needs a fresh module graph to observe its own env changes.
    vi.resetModules();
  });

  it("reports unconfigured when no OAuth env vars are set", async () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "";
    process.env.MICROSOFT_CLIENT_ID = "";
    process.env.MICROSOFT_CLIENT_SECRET = "";
    process.env.MICROSOFT_REDIRECT_URI = "";

    const { getCalendarSyncProvider } = await import("../calendarSync");
    expect(getCalendarSyncProvider("google").isConfigured()).toBe(false);
    expect(getCalendarSyncProvider("outlook").isConfigured()).toBe(false);
  });

  it("builds a Google OAuth authorization URL containing the client id and state", async () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "https://example.com/callback";

    const { getCalendarSyncProvider } = await import("../calendarSync");
    const provider = getCalendarSyncProvider("google");
    expect(provider.isConfigured()).toBe(true);

    const url = provider.getAuthorizationUrl("state-123");
    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("state=state-123");
  });
});
