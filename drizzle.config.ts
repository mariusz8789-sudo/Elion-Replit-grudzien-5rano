import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // "session" is created and managed at runtime by connect-pg-simple (server/index.ts), not
  // by this Drizzle schema. Without this exclusion, `drizzle-kit push` treats it as an unknown
  // table and offers to DROP it - which would delete every logged-in user's session.
  tablesFilter: ["!session"],
});
