import { env } from "../env";

export type CalendarProvider = "google" | "outlook";

export interface CalendarEventInput {
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  location?: string;
}

export interface CalendarTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface CalendarSyncProvider {
  getAuthorizationUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<CalendarTokens>;
  refreshAccessToken(refreshToken: string): Promise<CalendarTokens>;
  createEvent(accessToken: string, event: CalendarEventInput): Promise<{ externalEventId: string }>;
  getBusyIntervals(accessToken: string, fromIso: string, toIso: string): Promise<Array<{ startIso: string; endIso: string }>>;
  isConfigured(): boolean;
}

class GoogleCalendarSyncProvider implements CalendarSyncProvider {
  isConfigured(): boolean {
    return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET && env.GOOGLE_CALENDAR_REDIRECT_URI);
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALENDAR_REDIRECT_URI,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<CalendarTokens> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALENDAR_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<CalendarTokens> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async createEvent(accessToken: string, event: CalendarEventInput): Promise<{ externalEventId: string }> {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: event.title,
        description: event.description,
        location: event.location,
        start: { dateTime: event.startIso },
        end: { dateTime: event.endIso },
      }),
    });
    if (!res.ok) throw new Error(`Google event creation failed: ${await res.text()}`);
    const data = await res.json();
    return { externalEventId: data.id };
  }

  async getBusyIntervals(accessToken: string, fromIso: string, toIso: string): Promise<Array<{ startIso: string; endIso: string }>> {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, items: [{ id: "primary" }] }),
    });
    if (!res.ok) throw new Error(`Google freeBusy query failed: ${await res.text()}`);
    const data = await res.json();
    const busy = data.calendars?.primary?.busy ?? [];
    return busy.map((b: any) => ({ startIso: b.start, endIso: b.end }));
  }
}

class OutlookCalendarSyncProvider implements CalendarSyncProvider {
  isConfigured(): boolean {
    return Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_REDIRECT_URI);
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      redirect_uri: env.MICROSOFT_REDIRECT_URI,
      response_type: "code",
      response_mode: "query",
      scope: "offline_access Calendars.ReadWrite",
      state,
    });
    return `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<CalendarTokens> {
    const res = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: env.MICROSOFT_REDIRECT_URI,
        grant_type: "authorization_code",
        scope: "offline_access Calendars.ReadWrite",
      }),
    });
    if (!res.ok) throw new Error(`Outlook token exchange failed: ${await res.text()}`);
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<CalendarTokens> {
    const res = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        grant_type: "refresh_token",
        scope: "offline_access Calendars.ReadWrite",
      }),
    });
    if (!res.ok) throw new Error(`Outlook token refresh failed: ${await res.text()}`);
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async createEvent(accessToken: string, event: CalendarEventInput): Promise<{ externalEventId: string }> {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: event.title,
        body: { contentType: "text", content: event.description ?? "" },
        start: { dateTime: event.startIso, timeZone: "UTC" },
        end: { dateTime: event.endIso, timeZone: "UTC" },
        location: event.location ? { displayName: event.location } : undefined,
      }),
    });
    if (!res.ok) throw new Error(`Outlook event creation failed: ${await res.text()}`);
    const data = await res.json();
    return { externalEventId: data.id };
  }

  async getBusyIntervals(accessToken: string, fromIso: string, toIso: string): Promise<Array<{ startIso: string; endIso: string }>> {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schedules: ["me"],
        startTime: { dateTime: fromIso, timeZone: "UTC" },
        endTime: { dateTime: toIso, timeZone: "UTC" },
      }),
    });
    if (!res.ok) throw new Error(`Outlook schedule query failed: ${await res.text()}`);
    const data = await res.json();
    const items = data.value?.[0]?.scheduleItems ?? [];
    return items.map((i: any) => ({ startIso: i.start.dateTime, endIso: i.end.dateTime }));
  }
}

const providers: Record<CalendarProvider, CalendarSyncProvider> = {
  google: new GoogleCalendarSyncProvider(),
  outlook: new OutlookCalendarSyncProvider(),
};

export function getCalendarSyncProvider(provider: CalendarProvider): CalendarSyncProvider {
  return providers[provider];
}
