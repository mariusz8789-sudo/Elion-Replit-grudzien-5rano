import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { env } from "./env";

// Standard `pg` driver over plain TCP/SSL: works against Neon (fully wire-compatible
// standard Postgres) as well as any self-hosted Postgres, unlike @neondatabase/serverless's
// WebSocket-only driver, which only ever reaches Neon's own proxy and cannot connect to a
// self-hosted instance at all - a real portability bug for a codebase whose own .replit
// config provisions a plain postgresql-16 module. There's no serverless/edge runtime here to
// justify the WebSocket driver's tradeoffs; this is a long-lived Express process.
//
// Explicit pool cap: once running multiple instances (see server/services/pubsub.ts for the
// matching WebSocket-fanout change), each instance opens its own pool, and Postgres's
// connection limit (or Neon's pooled endpoint limit) is shared across all of them - an
// unbounded default per-instance pool risks exhausting it.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  ssl: env.DATABASE_URL.includes("sslmode=require") || env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});
export const db = drizzle({ client: pool, schema });
