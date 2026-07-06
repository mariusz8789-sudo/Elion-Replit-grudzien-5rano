import "dotenv/config";
import { cleanEnv, str, port, makeValidator } from "envalid";

const optionalStr = makeValidator((x: string) => x);

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ["development", "production", "test"], default: "development" }),
  PORT: port({ default: 5000 }),
  DATABASE_URL: str(),
  SESSION_SECRET: str({ default: "point2point-secret-key" }),
  STRIPE_SECRET_KEY: optionalStr({ default: "" }),
  STRIPE_WEBHOOK_SECRET: optionalStr({ default: "" }),
  MAPBOX_TOKEN: optionalStr({ default: "" }),
  ALLOWED_ORIGINS: optionalStr({ default: "" }),

  // AI features (cargo recognition, chat translation) - optional, degrade gracefully if unset
  ANTHROPIC_API_KEY: optionalStr({ default: "" }),

  // Google Calendar sync (driver availability) - optional
  GOOGLE_CALENDAR_CLIENT_ID: optionalStr({ default: "" }),
  GOOGLE_CALENDAR_CLIENT_SECRET: optionalStr({ default: "" }),
  GOOGLE_CALENDAR_REDIRECT_URI: optionalStr({ default: "" }),

  // Microsoft Outlook / Graph calendar sync - optional
  MICROSOFT_CLIENT_ID: optionalStr({ default: "" }),
  MICROSOFT_CLIENT_SECRET: optionalStr({ default: "" }),
  MICROSOFT_TENANT_ID: optionalStr({ default: "common" }),
  MICROSOFT_REDIRECT_URI: optionalStr({ default: "" }),

  // WebRTC TURN relay (recommended for production NAT traversal) - optional,
  // falls back to public STUN-only if unset
  TURN_SERVER_URL: optionalStr({ default: "" }),
  TURN_SERVER_USERNAME: optionalStr({ default: "" }),
  TURN_SERVER_CREDENTIAL: optionalStr({ default: "" }),

  // Public Partner API
  PARTNER_JWT_SECRET: optionalStr({ default: "" }),

  // Cross-instance WebSocket broadcast fanout (server/services/pubsub.ts) - optional,
  // required only once running more than one server instance/worker; falls back to a
  // same-process-only no-op when unset.
  REDIS_URL: optionalStr({ default: "" }),
});
