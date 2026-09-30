/**
 * ENTITY-1 — GENESIS IDENTITY. A thin record, not a system.
 *
 * It holds only what cannot be derived from anything else: which entity this is, what it is for,
 * which constitution binds it, and the shape of this record. Everything that CAN be derived is only
 * referenced, never copied, so there is exactly one place each fact lives:
 *
 *   build / version  → buildInfo.mjs, served at GET /api/health (commit, builtAt)
 *   environment      → GET /api/health (db durability, runtime) and each toolchain entry's environment
 *   engines          → campaign/toolchain.mjs (validated against a real reference case)
 *   runtime blockers → compute/scientificRuntimeStatus.mjs (worker health + a persisted real run)
 *
 * The entityId is a constant written once into this file, not generated at boot and not stored in
 * the database, so a restart, a new container or a restored backup is still the same Genesis.
 *
 * No scientific code may import this module (a test enforces it): the mission describes what Genesis
 * is for, and must never be an input that changes a measurement, a gate or a verdict.
 */

export const IDENTITY_SCHEMA_VERSION = 1;

export const GENESIS_IDENTITY = Object.freeze({
  entityId: 'genesis-entity:cb89b9c0-192d-47cf-ae44-19a28ffa9cf4',
  // Quoted from docs/GENESIS_CONSTITUTION.md §0, the owner's adopted constitution.
  mission: 'Od pytania człowieka, przez zdobycie wiedzy, hipotezy, projekt eksperymentu, wykonanie, obserwację, falsyfikację, dowody i powtórkę, aż do następnego eksperymentu.',
  constitutionVersion: 'GENESIS_CONSTITUTION@70ac0ef79363e118',
  identitySchemaVersion: IDENTITY_SCHEMA_VERSION,
});

/** Where each derived fact actually lives. Pointers only; the values are read from these sources. */
export const IDENTITY_REFERENCES = Object.freeze({
  constitution: 'docs/GENESIS_CONSTITUTION.md',
  build: 'GET /api/health → commit, commitShort, builtAt (buildInfo.mjs)',
  environment: 'GET /api/health → db, persistence, uptime; per-engine environment in each toolchain entry',
  engines: 'campaign/toolchain.mjs → listToolchain()',
  runtimeBlockers: 'compute/scientificRuntimeStatus.mjs → buildScientificRuntimeStatus()',
});
