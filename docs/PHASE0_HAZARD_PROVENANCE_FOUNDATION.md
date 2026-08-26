# Phase 0 — Hazard Provenance & Replay Foundation

**Status:** Phase 0 implementation, approved scope only. This delivers a domain-neutral provenance/replay foundation for future hazards — no hazard solver, no GIS adapter, no exposure/impact/cascade model, no City3D layer, and no change to `EpidemicCitySimulation`, `resolveContacts`, Hospital Model, Scenario Engine, Discovery Engine, epidemic replay, or `WorldEngineContract`.

## Code

All new code lives in one new module, `packages/frontend/src/core/hazard/`:

| File | Contents |
|---|---|
| `contracts.ts` | `SourceArtifact`, `HazardInput`, `HazardRun`, `HazardReplayStatus` — types only, no logic |
| `fingerprint.ts` | `computeSourceArtifactContentHash`, `computeHazardInputFingerprint`, `computeHazardRunResultFingerprint` — built on the existing `canonicalJson` (`core/events/hash.ts`) and `sha256Hex` (`core/discovery/evidenceCrypto.ts`); no new hashing algorithm |
| `hazardEvidenceGate.ts` | `checkSourceArtifactAdmission`, `checkHazardInputAdmission`, `checkHazardRunAdmission` — mandatory-field completeness gates, mirroring the Discovery Engine's own `missingFields` pattern |
| `hazardProvenanceStore.ts` | `ImmutableRecordStore<T>`, `InMemoryHazardProvenanceStore`, `LocalHazardProvenanceStore` — a generalized, immutable version of the existing `EvidenceStore`/`LocalEvidenceStore` pattern |
| `hazardReplay.ts` | `replayHazardRun`, `HazardReferenceEvaluator` — the replay gate producing `MATCH` / `DRIFT` / `BLOCKED` / `NOT_REPRODUCIBLE` |
| `index.ts` | barrel export |

Tests: `packages/frontend/src/__tests__/hazardProvenance.test.ts` (20 assertions across 8 required categories — see below).

Nothing outside `core/hazard/` and this one test file was touched. No UI wiring was added — Phase 0 is a data/contract layer only, with no Command Center panel.

## Contracts

- **`SourceArtifact`** — an immutable, frozen capture of external data: `contentHash` (SHA-256 of the raw content), optional `crs`/`extent`, an opaque `rawContentRef` (never a live URL replay re-fetches), and `provenance` (`provider`, `sourceUrl`, `sourceTime`, `retrievedAt`, `license`, `adapterVersion`).
- **`HazardInput`** — canonical scientific input referencing exactly one `SourceArtifact` by id. `scientificFields` and `displayName` are kept structurally separate: `inputFingerprint` is computed only from `(hazardType, sourceArtifact.contentHash, scientificFields, seed)`, so renaming a run in a future UI can never change what replay compares (Test 2).
- **`HazardRun`** — an immutable output descriptor: `hazardModuleVersion` and `codeCommitHash` (reusing the existing build-time git provenance from `core/build/commitHash.ts`, not recomputed) are versioned independently, and `resultFingerprint` covers `(hazardInputId, hazardModuleVersion, codeCommitHash, outputFields)`.

`ExposureSnapshot`, `ImpactResult`, `CascadeEdge`, and `MultiHazardWorldState` are deliberately **not** implemented — see "Deferred" below.

## Immutability

`SourceArtifact.contentHash`, the complete canonical `HazardInput`, and `HazardRun.resultFingerprint` are fixed at creation. The store enforces this structurally: `ImmutableRecordStore.put(id, record)` compares canonical content and throws `ImmutableConflictError` if an existing record under the same id differs in any way; re-putting identical content is a harmless no-op (Test 6).

## Replay semantics

`replayHazardRun` never re-fetches a live source. It:

1. Loads the `HazardRun` by id — missing → `NOT_REPRODUCIBLE`.
2. Loads the referenced `HazardInput` — missing → `NOT_REPRODUCIBLE` (can't reconstruct the request).
3. Loads the referenced `SourceArtifact` by id — missing → `BLOCKED` (replay must not re-fetch it).
4. Recomputes the input fingerprint using the artifact's **currently stored** `contentHash` and compares it to `input.inputFingerprint` (which was computed against the artifact's content hash at input-creation time). A mismatch — meaning the artifact's content no longer matches what the input was pinned against — is `BLOCKED`, never a false `MATCH`.
5. Re-runs the supplied `HazardReferenceEvaluator` against the frozen input and artifact, recomputes the result fingerprint, and compares it to the stored run's fingerprint: equal → `MATCH`, different → `DRIFT`.

This is the same honesty guarantee the epidemic replay already has (re-execute, don't just compare stored hashes) applied to a domain where the "re-execute" step must never touch the network.

### The reference evaluator is a test fixture, not a hazard model

`HazardReferenceEvaluator` is an interface the replay gate calls; the only implementation that exists is `sumFieldsEvaluator` inside the test file — it sums the numeric `scientificFields` of a `HazardInput`. This exists solely to give the replay gate something deterministic to execute so `MATCH`/`DRIFT` can be tested honestly. **No implementation of this interface may contain earthquake/flood/fire/weather/contamination/infrastructure science until a later, separately approved phase.**

## Why a separate replay path from epidemic replay

Hazard replay (`hazardReplay.ts`) and epidemic replay (`core/discovery/discoveryReplay.ts`) are two independent code paths that share only the generic hashing primitives (`canonicalJson`, `sha256Hex`), not a call path. Overloading the existing `replayDiscoveryCase` to also understand hazards was explicitly rejected — that would have been exactly the "third parallel evidence system" this Phase 0 was told not to build, just merged into the wrong host instead of made standalone.

## Test coverage (`hazardProvenance.test.ts`, 20 assertions)

| # | Requirement | Coverage |
|---|---|---|
| 1 | Canonical serialization deterministic regardless of key order | Shuffled-key equality check across all three contracts plus nested `provenance` |
| 2 | Input fingerprint sensitivity | Changing `scientificFields` changes the fingerprint; changing only `displayName` does not |
| 3 | Honest replay — same frozen artifact + input + evaluator → `MATCH` | Full store round-trip, replay returns `MATCH` with matching fingerprints |
| 4 | Real change → `DRIFT` | A run whose stored fingerprint no longer matches what the evaluator produces |
| 5 | Missing/mutated artifact → `BLOCKED`/`NOT_REPRODUCIBLE`, never `MATCH` | Four sub-cases: missing run, missing input, missing artifact, tampered artifact content hash |
| 6 | Store rejects same id with different content | `InMemoryHazardProvenanceStore` and `LocalHazardProvenanceStore`, all three record types, plus an idempotent-same-content case |
| 7 | Missing mandatory field blocks evidence admission | One admitted case and one rejected case per contract type |
| 8 | Hazard/epidemic isolation | Static-import scan of every file in `core/hazard/` against a list of Scientific Core / `WorldEngineContract` module names — none appear |

## Validation run

- `npx vitest run src/__tests__/hazardProvenance.test.ts` — 20/20 passed.
- `npx vitest run` (full frontend suite) — 119 files / 1205 tests passed (up from the pre-existing 118 files / 1185 tests by exactly this one new file).
- `npx tsc --noEmit` — clean.
- `npx eslint src/core/hazard src/__tests__/hazardProvenance.test.ts` — clean.
- `npm run build` — production build succeeds.
- `git diff --check` — clean.

## Deferred (explicitly out of Phase 0 scope)

Not implemented, per the approved scope:

- Any hazard solver (earthquake, flood, fire, weather, contamination, infrastructure).
- Any external fetch, real-data importer, or GIS adapter.
- `ExposureSnapshot`, `ImpactResult`, `CascadeEdge`, `MultiHazardWorldState`.
- Cascade replay (a dependency-ordered, multi-run graph replay — a fundamentally different problem from this single-run replay gate).
- Any City3D hazard layer or Command Center UI.
- Any read/write boundary between hazard contracts and `EpidemicCitySimulation`/`resolveContacts`/Hospital Model/Scenario Engine/Discovery Engine/`WorldEngineContract` — none exists yet, named or otherwise, and none was needed for this scope.
- Migrating the existing epidemic `EvidenceStore` onto `ImmutableRecordStore` — left untouched; a later, separate decision.

**NO HAZARD SOLVER / NO GIS / NO CASCADES / NO EPIDEMIC CORE CHANGE.**
