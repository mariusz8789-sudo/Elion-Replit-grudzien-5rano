# Earthquake Demo Execution Envelope

**Status:** Domain-only sequencing layer over existing earthquake code. No new solver, no new hazard type, no City3D, no UI, no GIS, no coordinate mapping, no cascade engine. Builds on the Hazard Module Registry (`4ff08bd`).

## What this is

One function, `buildEarthquakeDemoEnvelope(spec, codeCommitHash, store?)` in `core/hazard/earthquake/earthquakeDemoEnvelope.ts`, chaining exactly what already existed into one audit­able result:

```
registered earthquake module (hazardModuleRegistry)
  -> validated scenario spec (earthquakeScenarioValidation)
  -> existing computation (runEarthquakeScenario / earthquakeEvaluator)
  -> capability fence (assertHazardRunCompatibleWithModule)
  -> evidence completeness (buildHazardEvidencePack)
  -> replay MATCH proof (replayHazardRun)
  -> existing read-only projection (projectEarthquakeWorldState)
```

Every step is a call into code that already existed before this task. This file adds zero new science, zero new hashing, zero new storage — it only sequences and decides pass/fail, mirroring the "capability fence" pattern the previous task already established for replay.

## Why this is not UI or City3D

`buildEarthquakeDemoEnvelope` is a pure async function taking a scenario spec and a commit hash and returning a plain data object (`EarthquakeDemoEnvelope`). It imports nothing from a renderer, React, Three.js, CityWorld, routing, or epidemic code — proven by an automated import scan, not just a claim. **Manus's own, separately built and versioned coordinate mapping and read-only City3D overlay are expected to call this function and read its `projection`/`replay`/`provenance` fields** — this task does not build or touch that consumer.

## The envelope contract

```ts
interface EarthquakeDemoEnvelope {
  status: 'READY' | 'BLOCKED';
  blockCode: 'INVALID_SCENARIO_SPEC' | 'REGISTRY_INCOMPATIBLE' | 'EVIDENCE_INCOMPLETE' | 'REPLAY_NOT_MATCH' | null;
  blockReason: string | null;
  hazardType: 'earthquake';
  datasetStatus: 'SCENARIO';
  moduleDescriptor: HazardModuleDescriptor | null;
  run: HazardRun | null;
  projection: EarthquakeWorldStateView | null;
  replay: HazardReplayReport | null;
  provenance: { artifactId, hazardInputId, hazardRunId, inputFingerprint, resultFingerprint } | null;
  notModeled: readonly string[];
}
```

`buildEarthquakeDemoEnvelope` never throws for an ordinary invalid-input or gate-failure case — every failure mode this task requires is a `BLOCKED` result with a named `blockCode`, not an exception a consumer must catch. `status: 'READY'` and a non-null `projection` only ever appear together, and only after every gate below passed for that exact run.

### The four block gates, and how each is genuinely triggered (not just asserted)

| `blockCode` | Trigger | Test |
|---|---|---|
| `INVALID_SCENARIO_SPEC` | `validateEarthquakeScenarioSpec` rejects the spec (non-finite magnitude, negative/non-finite depth, non-finite epicenter/seed) — checked before any record is built | A `NaN` magnitude spec |
| `REGISTRY_INCOMPATIBLE` | Either `assertHazardRunCompatibleWithModule` throws, or the store already holds a *different* record under this scenario's deterministic id (e.g. the same `scenarioLabel` re-run with different parameters — a real, publicly-reachable provenance conflict, not a mocked failure) | Same `scenarioLabel`, different `magnitude`, same store — the second call collides with the first's persisted `HazardInput` |
| `EVIDENCE_INCOMPLETE` | `buildHazardEvidencePack`'s `missingFields` is non-empty | An empty `codeCommitHash` — a real, publicly-reachable missing-provenance case (`checkHazardRunAdmission` requires it) |
| `REPLAY_NOT_MATCH` | `replayHazardRun` returns anything other than `MATCH` (`DRIFT`, `BLOCKED`, or `NOT_REPRODUCIBLE`) | A store that accepts writes normally but returns a tampered run on read — a genuine `DRIFT` verdict flows through to this block, per the task's requirement |

## Determinism

Two independent calls with the same scenario spec (different stores, since `SourceArtifact.provenance.retrievedAt` and `HazardRun.createdAt` are real wall-clock provenance fields frozen at build time — replaying the *same* spec into the *same* store is correctly a `REGISTRY_INCOMPATIBLE` id conflict, not a silent overwrite) produce identical `provenance` (ids and fingerprints — none of which are wall-clock-derived) and identical scientific projection content (sites, epicenter, magnitude, schema version).

## Validation

- Focused test file `earthquakeDemoEnvelope.test.ts` — 8 tests: happy path with a complete bundle, cross-store determinism, and one test per required block scenario (invalid spec, registry/version conflict, evidence-incomplete, replay-DRIFT), plus two isolation-scan tests.
- Full frontend suite: 123 files / 1297 tests (up from the pre-existing 122/1289 by exactly these 8). One pre-existing isolation test in `earthquakeVerticalSlice.test.ts` had its allowed-import list extended to include `hazardModuleRegistry`/`hazardProvenanceStore` (already-legitimate Phase 0/registry primitives other earthquake files already used) — no behavior changed, only the test's own whitelist.
- `tsc --noEmit`, `eslint`, `npm run build`, `git diff --check` — all clean. `City3DWebGLScreen` bundle chunk size unchanged (121.29 kB).

## What this task deliberately did not do

- No coordinate mapping — `EarthquakeWorldStateView`'s `x`/`y` fields remain the opaque local frame they always were; translating them to a real-world or City3D coordinate system is explicitly Manus's separate task.
- No City3D or UI wiring — nothing calls `buildEarthquakeDemoEnvelope` from a screen or component.
- No second hazard type, no cascade engine, no GIS/live data.

**NO NEW SOLVER / NO CITY3D / NO GIS / NO CASCADES / NO EPIDEMIC CORE CHANGE.**
