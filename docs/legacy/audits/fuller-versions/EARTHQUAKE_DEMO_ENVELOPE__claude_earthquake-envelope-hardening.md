# Earthquake Demo Execution Envelope

**Status:** Domain-only sequencing layer over existing earthquake code. No new solver, no new hazard type, no City3D, no UI, no GIS, no coordinate mapping, no cascade engine. Builds on `287a788` (initial envelope) and the Hazard Module Registry (`4ff08bd`).

## Flow

```
registered earthquake module descriptor (hazardModuleRegistry.getHazardModule)
        │
        ▼
validated scenario spec (earthquakeScenarioValidation) ──fails──▶ BLOCKED: INVALID_SCENARIO_SPEC
        │ ok
        ▼
existing computation (runEarthquakeScenario / earthquakeEvaluator)
        │
        ▼
immutable persistence (HazardProvenanceStore.put*) ──id conflict──▶ BLOCKED: PROVENANCE_CONFLICT
        │ ok
        ▼
re-read what was ACTUALLY persisted, then capability fence
(assertHazardRunCompatibleWithModule against the re-read run/input) ──mismatch──▶ BLOCKED: REGISTRY_INCOMPATIBLE
        │ ok
        ▼
evidence completeness (buildHazardEvidencePack) ──missing fields──▶ BLOCKED: EVIDENCE_INCOMPLETE
        │ ok
        ▼
replay (replayHazardRun, hazardType-gated) ──not MATCH──▶ BLOCKED: REPLAY_NOT_MATCH
        │ MATCH
        ▼
pure projection (projectEarthquakeWorldState)
        │
        ▼
READY envelope: scenario, run, evidence, replay, projection, provenance, notModeled
```

Every box above is code that existed before this task (Phase 0, the Hazard Module Registry, or the earlier vertical slice). `earthquakeDemoEnvelope.ts` adds no solver, no hash, no store implementation, and no replay implementation — it only sequences these calls and turns their outcome into one typed result.

## Why the registry check re-reads from the store

The first version of this envelope checked `assertHazardRunCompatibleWithModule` against the freshly-computed, in-memory `result.run`/`result.input` — which, by construction, is always internally self-consistent, so the check could never genuinely fail except through contrived mocking of the error message itself. This version re-fetches the run and input from the store immediately after persisting them and validates *that* — a real defense against a non-conforming store backend that silently altered `hazardModuleVersion` or `hazardInputId` on write, and the thing `earthquakeDemoEnvelope.test.ts`'s `REGISTRY_INCOMPATIBLE` tests actually exercise (via a store that returns different data on read than what a normal implementation would have stored).

## DTO

```ts
type EarthquakeDemoEnvelopeBlockCode =
  | 'INVALID_SCENARIO_SPEC'
  | 'PROVENANCE_CONFLICT'
  | 'REGISTRY_INCOMPATIBLE'
  | 'EVIDENCE_INCOMPLETE'
  | 'REPLAY_NOT_MATCH';

interface EarthquakeDemoScenario {
  spec: EarthquakeScenarioSpec;
  artifact: SourceArtifact;
  input: HazardInput;
}

interface EarthquakeDemoEnvelope {
  status: 'READY' | 'BLOCKED';
  blockCode: EarthquakeDemoEnvelopeBlockCode | null;
  blockReason: string | null;
  hazardType: 'earthquake';
  datasetStatus: 'SCENARIO';
  moduleDescriptor: HazardModuleDescriptor | null;
  scenario: EarthquakeDemoScenario | null;
  run: HazardRun | null;
  evidence: HazardEvidencePack | null;
  replay: HazardReplayReport | null;
  projection: EarthquakeWorldStateView | null;
  provenance: { artifactId, hazardInputId, hazardRunId, inputFingerprint, resultFingerprint } | null;
  notModeled: readonly string[];
}
```

### READY vs BLOCKED

- **READY**: every field is populated. `projection` and `provenance` are non-null **if and only if** `status === 'READY'` — a consumer can safely gate all rendering/mapping logic on `status === 'READY'` alone.
- **BLOCKED**: `blockCode` and `blockReason` are always populated from a **real** failure (never a hand-typed placeholder string). `moduleDescriptor` is populated whenever the registry lookup itself succeeded. `scenario`/`run`/`evidence`/`replay` are populated only as far as the pipeline actually reached — useful diagnostic breadcrumbs, not a result to render. `projection` and `provenance` are **always** `null` on BLOCKED; a consumer must not treat a BLOCKED envelope as something to map or display.

### Block-code matrix (with real triggers, not mocked strings)

| `blockCode` | Real trigger | Proven by |
|---|---|---|
| `INVALID_SCENARIO_SPEC` | `validateEarthquakeScenarioSpec` rejects the spec (non-finite magnitude, negative/non-finite depth, non-finite epicenter/seed) | A `NaN` magnitude spec |
| `PROVENANCE_CONFLICT` | The real `ImmutableConflictError` from a real `HazardProvenanceStore.put*` call — the store already holds *different* content under this scenario's deterministic id | Same `scenarioLabel`, different `magnitude`, same store — the second call collides with the first's persisted `HazardInput`/`HazardRun` |
| `REGISTRY_INCOMPATIBLE` | The real `assertHazardRunCompatibleWithModule` throws when checked against what the store actually returns on re-read — never a hand-typed error string | Two tests: a store returning a stale/foreign `hazardModuleVersion` on read, and a store returning a `HazardInput` whose `hazardType` isn't `'earthquake'` |
| `EVIDENCE_INCOMPLETE` | The real `buildHazardEvidencePack`'s `missingFields` is non-empty | An empty `codeCommitHash` — `checkHazardRunAdmission` genuinely requires it |
| `REPLAY_NOT_MATCH` | The real `replayHazardRun` returns anything other than `MATCH` | A store returning a tampered `resultFingerprint` on read — a genuine `DRIFT` verdict, not a forced string |

`PROVENANCE_CONFLICT` and `REGISTRY_INCOMPATIBLE` are deliberately distinct: an immutable-store id collision is a provenance/bookkeeping problem (the caller reused an identifier), while a registry mismatch is a module/version/schema/input-run consistency problem (the persisted record doesn't match what the registered module or its own input actually says). Conflating them into one catch-all code would hide which kind of operator action is actually needed.

## Store injection policy

- `store` defaults to a **fresh, empty `InMemoryHazardProvenanceStore()`** — a domain/test convenience only. Every call with no explicit `store` argument is isolated from every other call.
- **A real UI/Command Center consumer must inject its own `LocalHazardProvenanceStore`** (or another persistent `HazardProvenanceStore` implementation) explicitly, so scenarios are actually saved across calls/sessions.
- Neither the default nor an injected store is ever silently overwritten: a same-id/different-content write is a real `ImmutableConflictError`, surfaced as `PROVENANCE_CONFLICT`, never resolved by picking a "winner."

## Determinism policy

- Two independent calls with the **same scenario spec but separate stores** produce identical `provenance` (ids and fingerprints — none of which are wall-clock-derived) and identical scientific projection content (sites, epicenter, magnitude, schema version).
- `SourceArtifact.provenance.retrievedAt` and `HazardRun.createdAt` are real wall-clock provenance fields, frozen at build time like every other Phase 0 record — they are **not** expected to match between two independent calls, and are correctly excluded from any determinism comparison.
- Replaying the **same spec into the same store a second time** is correctly a `PROVENANCE_CONFLICT` (a genuine re-run under a reused identifier), never a silent overwrite and never treated as "the same result."

## Immutability

Every object this function returns — the envelope itself, and each populated top-level field (`scenario`, `run`, `evidence`, `replay`, `projection`, `provenance`) — is `Object.freeze`d. A consumer that attempts to mutate a returned object gets a `TypeError` (strict-mode ESM), and even if it didn't, mutating the returned copy can never affect what is actually persisted in the store, since the store holds its own reference to the same (frozen) object.

## Boundaries

- **Synthetic / scenario-only / non-operational.** Every output carries `datasetStatus: 'SCENARIO'`. `notModeled` is passed through **verbatim** from the registered module descriptor — proven by reference-equality in tests, never re-typed or filtered by this envelope.
- **No coordinate mapping.** `EarthquakeWorldStateView`'s `x`/`y` fields remain the opaque local frame they always were. Translating them to a real-world or City3D coordinate system, and gating what appears in a renderer, is explicitly **Manus's** separate, already-in-progress work (versioned coordinate mapping + overlay gate + the one City3D renderer).
- **No City3D, no UI, no CSS, no screenshots.** Nothing in this task touches a screen, a component, or a renderer.
- **No GIS, no live data, no real coordinates.** `SourceArtifact.provenance.provider` remains `'genesis-synthetic-scenario-author'`.
- **No cascades, no second hazard, no epidemic coupling.** `core/hazard/earthquake/` still imports nothing from `EpidemicCitySimulation`, `resolveContacts`, Hospital Model, Scenario Engine, Discovery Engine, `WorldEngineContract`, `cityAgent.ts`, `epidemicCity.ts`, `roadNetwork.ts`, or any renderer/React/Three.js code — proven by an automated import scan, not just a claim.

## What this document's task did NOT do

- Did not build coordinate mapping, an overlay gate, or any City3D/UI work — that remains Manus's.
- Did not touch `hazardProvenanceStore.ts`, `hazardModuleRegistry.ts`, or any Scientific Core file. `hazardReplay.ts` WAS touched in a later hardening pass (see below) — a narrow, additive type-safety fix, not a semantic change.
- Did not add a second hazard type or any new solver.

## Hardening sprint addendum (`0fdbd84`…`0d453a8`, same branch)

A follow-up autonomous pass looked for real engineering gaps across the earthquake pipeline and fixed four:

1. **Shared, unfrozen, mutable global state (the most serious finding).** `SYNTHETIC_EXPOSURE_SITES` (`earthquakeExposure.ts`) was a module-level array that every `ExposureSnapshot`, across every scenario, shared by reference — TypeScript's `readonly` never enforced this at runtime, so mutating one scenario's exposure data would have silently corrupted every other scenario's for the lifetime of the process. Fixed by genuinely `Object.freeze`-ing the fixture array, each site, and every snapshot built from it; `computeImpactResults()`'s returned array/objects (`earthquakeImpact.ts`) are frozen the same way. Proven with a regression test that specifically checks the leak-across-snapshots scenario, not just "is it frozen."
2. **Duplicated, incomplete admission logic.** `ExposureSnapshot`/`ImpactResult` are domain-neutral contracts, but their completeness checks lived inside `earthquakeEvidence.ts` instead of beside `checkSourceArtifactAdmission`/`checkHazardInputAdmission`/`checkHazardRunAdmission` in `hazardEvidenceGate.ts` — meaning a future hazard would have had to duplicate them. Moved, and the move surfaced a real gap: the impact check never verified `impactResultId`/`hazardRunId`/`exposureSnapshotId`/`siteId` were present. Both are now checked, domain-neutral, and directly reusable by the next hazard.
3. **A type-level footgun in `replayHazardRun`.** `projectionSchemaVersion` was only ever checked as part of the capability fence, which itself only runs when `hazardType` is supplied — so passing `projectionSchemaVersion` without `hazardType` silently did nothing. No call site did this, but nothing prevented it. `ReplayHazardRunOptions` is now a discriminated union making that combination a compile error.
4. **An untested production-path claim.** This document and the envelope's own doc comment both say a real consumer must inject `LocalHazardProvenanceStore`, but no test had ever run the envelope against that store type — only the raw store's own persistence was tested in isolation. Two new tests now run the full envelope against a real `LocalHazardProvenanceStore`, including a simulated page-reload and a `PROVENANCE_CONFLICT` against that same persistent backend.

Net result: 123 files / 1321 tests (single-worker), up from the pre-sprint 1297; `tsc`/`eslint`/build/`git diff --check` clean throughout; `scripts/earthquake-e2e.mjs` re-verified green (25/25) after every checkpoint. No City3D, GIS, cascade, or second-hazard work at any point.

**NO CITY3D / NO GIS / NO CASCADES / NO EPIDEMIC CORE CHANGE / NO NEW HAZARD SOLVER.**
