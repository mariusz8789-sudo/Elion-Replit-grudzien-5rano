import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Explicit pool cap: once running multiple instances (see server/services/pubsub.ts for the
// matching WebSocket-fanout change), each instance opens its own pool, and Neon's connection
// limit is shared across all of them — an unbounded default per-instance pool risks
// exhausting it. If DATABASE_URL isn't already a Neon pooled ("-pooler") endpoint, prefer
// switching to one in production so pool connections are multiplexed server-side too.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
export const db = drizzle({ client: pool, schema });
