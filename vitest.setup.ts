// Ensure server/env.ts can validate successfully when test files import
// server modules that transitively require a configured environment.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
