# Hazard Module Registry & Capability Fences

**Status:** Domain-neutral registry infrastructure only. Earthquake is the sole registered entry. No second hazard solver, no cascade engine, no UI, no City3D wiring, no GIS/live data. Builds on the earthquake vertical slice (`558aa03`).

## What this is

One small file, `core/hazard/hazardModuleRegistry.ts`, answering a question nothing in Genesis could answer explicitly before: **"what does this hazard module claim to do, and how do I know a given `HazardRun` actually came from the module I think it did?"**

It has three parts:

- **`HazardModuleDescriptor`** — a flat, frozen record per hazard type: `hazardType`, `moduleVersion`, `projectionSchemaVersion`, `scenarioOnly`, `supportedCapabilities`, `notModeled`, `requiredEvidenceFields`.
- **`getHazardModule(hazardType)` / `listHazardModules()`** — read-only lookup. An unregistered type throws `UnknownHazardModuleError` rather than returning `undefined` for a caller to forget to check.
- **`assertHazardRunCompatibleWithModule({ hazardType, run, input?, projectionSchemaVersion? })`** — the capability fence. Called before replay or projection consumes a `HazardRun`, it rejects (via `HazardModuleCompatibilityError`):
  - a `hazardType` that isn't registered,
  - a `HazardInput.hazardType` that doesn't match the expected type (when an input is supplied),
  - a `HazardRun.hazardInputId` that doesn't actually reference the supplied input,
  - a `HazardRun.hazardModuleVersion` that doesn't match the registered module version (a stale or foreign run),
  - a caller-supplied `projectionSchemaVersion` that doesn't match the registered one.

## Why this file contains no science

`hazardModuleRegistry.ts` imports exactly two things from the earthquake module: `EARTHQUAKE_MODEL_VERSION` (a version string) and `EARTHQUAKE_WORLD_PROJECTION_SCHEMA_VERSION` / `EARTHQUAKE_NOT_MODELED` (a version string and a frozen string list, both already exported by `earthquakeWorldProjection.ts` for exactly this reason — reused, not re-typed). It never imports `earthquakeModel.ts`'s attenuation function, `earthquakeEvaluator.ts`, or anything that computes a hazard result. Adding a second hazard type here should only ever mean adding one more descriptor entry pointing at that hazard's own constants — never copying science into this file.

`requiredEvidenceFields` is the one field this file does hand-author (`EARTHQUAKE_REQUIRED_EVIDENCE_FIELDS`), because `hazardEvidenceGate.ts` and `earthquakeEvidence.ts` report *missing* fields, not a canonical list of *all possible* fields. `hazardModuleRegistry.test.ts` proves this list isn't hand-waved: it deliberately breaks each category of the earthquake evidence pack (artifact, input, run — fields and status and outputFields separately, exposure, impacts) and asserts every field the registry claims as required is actually caught by the real, live `buildHazardEvidencePack()` gate.

## Immutability

Every array and object the registry exposes is `Object.freeze`d — the descriptor itself, `supportedCapabilities`, `requiredEvidenceFields`, and (newly, as part of this task) `EARTHQUAKE_NOT_MODELED` at its source in `earthquakeWorldProjection.ts`, which previously carried only a TypeScript `readonly` annotation with no runtime enforcement. `listHazardModules()` still returns an ordinary (unfrozen) array from `Object.values()` — mutating that returned array is harmless and does not affect the registry, which the test suite also proves.

## How to add the next hazard module

1. Build the hazard's own module (contracts stay in `contracts.ts` if new ones are needed, science and evidence stay in `core/hazard/<hazard>/`), exactly as the earthquake vertical slice did — including its own `moduleVersion` and projection `schemaVersion` constants and its own `notModeled` list.
2. Add one `HazardModuleDescriptor` entry to the `REGISTRY` object in `hazardModuleRegistry.ts`, importing only that hazard's version/label constants — not its science.
3. Hand-author that module's `requiredEvidenceFields` from its own evidence-gate checks, and add the same kind of deliberately-broken-record test this task added for earthquake to prove the list isn't hand-waved.
4. Call `assertHazardRunCompatibleWithModule()` wherever that hazard's replay or a future projection consumer accepts a `HazardRun` from outside — the same fence earthquake now has available (not yet wired into `hazardReplay.ts` itself in this task; see below).

## What this task deliberately did not do

- Did not wire `assertHazardRunCompatibleWithModule()` into `hazardReplay.ts`'s `replayHazardRun()` — that would change Phase 0's own replay code path for a check this task was scoped to make *available*, not to retrofit everywhere. A future task can decide whether replay itself should call it.
- Did not register or build a second hazard type (flood, fire, nuclear, radiological, chemical) — `REGISTRY` has exactly one entry.
- Did not touch `ExposureSnapshot`/`ImpactResult`, `MultiHazardWorldState`, cascades, City3D, GIS, or any UI.

## Validation

- Focused test file `hazardModuleRegistry.test.ts` — 15 tests: exact descriptor match, `scenarioOnly`/`notModeled` declaration, `listHazardModules()` contents and non-leaking mutable-array return, `UnknownHazardModuleError` for unregistered types, full immutability proof (descriptor and its nested arrays), all five `assertHazardRunCompatibleWithModule()` failure modes plus the success path, the `requiredEvidenceFields`-matches-the-real-gate cross-check, and an isolation import scan.
- Full frontend suite: 122 files / 1283 tests (up from the pre-existing 121/1268 by exactly these 15).
- `tsc --noEmit`, `eslint`, `npm run build`, `git diff --check` — all clean. `City3DWebGLScreen` bundle chunk size unchanged (121.29 kB).

**NO NEW HAZARD SOLVER / NO GIS / NO CASCADES / NO EPIDEMIC CORE CHANGE.**
