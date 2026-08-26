# Earthquake Vertical Slice

**Status:** First complete Multi-Hazard vertical slice. Research/architecture-proof prototype, explicitly non-operational, no domain (seismology) review performed. Built entirely on a synthetic fixture — no real geography, no real earthquake catalog, no claim of scientific validity. Builds on Phase 0 / 0.1 / 0.2 (`cf96410`, `cd02484`, `bf4831e`).

## What this is, in one sentence

A complete, working, tested, replay-honest pipeline — `SourceArtifact → HazardInput → HazardRun → ExposureSnapshot → ImpactResult → Evidence Pack → Replay (MATCH/DRIFT/BLOCKED/NOT_REPRODUCIBLE) → a read-only projection contract` — for one synthetic earthquake scenario, with every scientific computation happening outside any renderer.

## What this explicitly is NOT

- **Not a calibrated seismological model.** The ground-motion attenuation function (`earthquakeModel.ts`) is a synthetic, illustrative, hand-written formula. It has the right qualitative shape (magnitude increases shaking, distance attenuates it, depth reduces surface intensity) but is not fit to any observed earthquake catalog and has not been reviewed by a seismologist.
- **Not real data.** `SourceArtifact` freezes a scenario author's own chosen numbers (magnitude, depth, epicenter), not a USGS feed or any other real provider. Its `provenance.provider` reads `'genesis-synthetic-scenario-author'`.
- **Not real geography.** Exposure sites and the epicenter live in an opaque local coordinate frame (kilometers on a flat plane), not any real city or real lat/lon.
- **Not wired to any UI.** No City3D file was touched. `earthquakeWorldProjection.ts` produces a pure, read-only data structure a future renderer could consume — nothing calls it from a screen or component.
- **Not reviewed by a domain expert.** Per the user's own explicit decision for this slice: solo prototype, non-operational, no seismology review performed.

Every output the pipeline produces carries `datasetStatus: 'SCENARIO'` for exactly this reason (the audit doc's mandatory status vocabulary — never `'OBSERVED'`).

## Architecture

```
SourceArtifact (frozen scenario spec)
        │  buildEarthquakeSourceArtifact()
        ▼
HazardInput (canonical scientific fields: magnitude, depthKm, epicenter, seed)
        │  buildEarthquakeHazardInput()  — Phase 0's computeHazardInputFingerprint()
        ▼
HazardRun (peakGroundAccelerationAtEpicenterG, uncertaintyBandPercent)
        │  runEarthquakeHazardRun()  — earthquakeEvaluator implements Phase 0's HazardReferenceEvaluator
        ▼                                    │
        │                                    └─► replayHazardRun() (Phase 0, unmodified) → MATCH/DRIFT/BLOCKED/NOT_REPRODUCIBLE
        ▼
ExposureSnapshot (5 synthetic fixture sites, independent of any run)
        │  buildSyntheticExposureSnapshot()
        ▼
ImpactResult[] (severity + uncertainty band per site)
        │  computeImpactResults()
        ├─► buildHazardEvidencePack()  — Phase 0's checkSourceArtifactAdmission/checkHazardInputAdmission/checkHazardRunAdmission + sha256Hex/canonicalJson
        └─► projectEarthquakeWorldState()  — pure, read-only, versioned view for a FUTURE City3D layer (not wired)
```

All of `SourceArtifact`/`HazardInput`/`HazardRun`/replay/evidence infrastructure is Phase 0's own code, unmodified except for two additive contracts (`ExposureSnapshot`, `ImpactResult` in `contracts.ts` — pure additions, no existing field changed). Nothing here is a second Evidence/Replay system: `earthquakeEvaluator` is a real implementation of Phase 0's `HazardReferenceEvaluator` interface, so `replayHazardRun` — the exact function Phase 0 shipped — is what produces this slice's MATCH/DRIFT/BLOCKED/NOT_REPRODUCIBLE verdicts.

## Files

| File | Role |
|---|---|
| `core/hazard/contracts.ts` (extended) | + `HazardDatasetStatus`, `ExposureSite`, `ExposureSnapshot`, `ImpactSeverityClass`, `ImpactResult` |
| `core/hazard/earthquake/rng.ts` | Isolated seeded PRNG (mulberry32) — deliberately not shared with epidemic's `makeRng` |
| `core/hazard/earthquake/earthquakeModel.ts` | The synthetic attenuation function, distance calculation, severity classification, vulnerability multiplier |
| `core/hazard/earthquake/earthquakeExposure.ts` | Fixed 5-site synthetic fixture registry |
| `core/hazard/earthquake/earthquakeImpact.ts` | Projects a `HazardRun` onto an `ExposureSnapshot`, producing `ImpactResult[]` |
| `core/hazard/earthquake/earthquakeEvaluator.ts` | The `HazardReferenceEvaluator` implementation Phase 0's `replayHazardRun` calls |
| `core/hazard/earthquake/earthquakeScenario.ts` | End-to-end orchestration: builds the full artifact→input→run→exposure→impact chain |
| `core/hazard/earthquake/earthquakeEvidence.ts` | `HazardEvidencePack` — reuses `sha256Hex`/`canonicalJson`/Phase 0's admission checks |
| `core/hazard/earthquake/earthquakeWorldProjection.ts` | The read-only Digital Twin projection contract — no rendering code, not called from any UI |
| `__tests__/earthquakeVerticalSlice.test.ts` | 23 unit/integration tests |
| `scripts/earthquake-e2e.mjs` | Real-Chromium end-to-end proof |

## Determinism and honesty guarantees

- **Same scenario spec → identical fingerprints and impact values**, proven directly (no wall-clock/network dependence in the scientific computation).
- **Different magnitude → different `inputFingerprint`, different `resultFingerprint`, different impact severities** — a real, sensitive computation, not a fixed stub.
- **Replay never re-fetches a live source** — it reuses Phase 0's `replayHazardRun`, which reads only the frozen `SourceArtifact` by id.
- **MATCH / DRIFT / BLOCKED / NOT_REPRODUCIBLE are all proven**, both in the fast Node test suite and in a real Chromium browser (see below) — including the critical case that a missing or tampered artifact returns `BLOCKED`, never a false `MATCH`.
- **The Evidence Pack is admissible under Phase 0's own completeness gate** (`checkSourceArtifactAdmission`/`checkHazardInputAdmission`/`checkHazardRunAdmission`) with zero new admission concepts invented; two new checks (`exposure`/`impacts` completeness) were added only because Phase 0 didn't need them yet.
- **Isolation is proven, not asserted**: a static-import scan of every file under `core/hazard/earthquake/` confirms none import Scientific Core, `WorldEngineContract`, or any rendering library, and that every import escaping the directory targets one of a named, reviewed list of Phase 0/shared primitives.

## Two real bugs the Chromium E2E caught (and fixed)

Both are documented in code comments at their fix sites, not just here:

1. **Cross-engine floating-point drift.** `Math.pow`/`Math.log10` are not required by the ECMAScript spec to be bit-identical across engines (unlike `Math.sqrt`, which is). Running the identical scenario in Node and in real Chromium produced a one-ULP difference in one site's impact severity. Fixed by rounding `syntheticPeakGroundAcceleration`'s output to 9 decimal places — far below this model's meaningful precision (it is explicitly non-calibrated), and enough to collapse the drift everywhere.
2. **A non-reproducible evidence digest.** `HazardEvidencePack`'s SHA-256 was hashing a `generatedAt` wall-clock timestamp, so hashing the exact same content twice produced two different digests — defeating its purpose as tamper evidence. Fixed by excluding it from the hashed payload, matching the existing `computeEvidencePackSha256` convention (`StoredEvidence.savedAt`-style metadata stays outside the hash). Proven with a same-fixed-input, hash-twice test in both the Node suite and the Chromium E2E.

Neither would have been caught by Node-only `vitest` — this is the entire reason `scripts/earthquake-e2e.mjs` exists, following the exact pattern `scripts/discovery-e2e.mjs` already established for the epidemic Discovery Engine.

## Test coverage

`earthquakeVerticalSlice.test.ts` — **23 tests**: full pipeline construction and traceability, admissibility under Phase 0's gate, near-field-vs-far-field severity ordering, determinism (identical spec twice, changed magnitude), seeded uncertainty band determinism, all four replay verdicts, evidence pack completeness and hash idempotency, a missing-exposure rejection case, the read-only projection contract (purity + versioning + explicit `datasetStatus`), pure physics helper unit tests, and two isolation-scan tests.

`scripts/earthquake-e2e.mjs` — **25 checks in real Chromium**: no runtime errors, real Web Crypto SHA-256 (not a Node-only illusion — required navigating to a real `http://127.0.0.1` origin, since `crypto.subtle` is unavailable on an opaque `about:blank` page), every dataset-status label correct, all four replay verdicts, Phase 0 admission gate passing, evidence pack completeness and hash idempotency, projection contract shape, and byte-identical fingerprints/severities/verdicts between Node and Chromium.

## Validation run

- `npx vitest run src/__tests__/earthquakeVerticalSlice.test.ts` — 23/23 passed.
- `npx vitest run` (full frontend suite) — 121 files / 1250 tests passed (up from the pre-existing 120/1227 by exactly this slice's 23 tests).
- `npx tsc --noEmit` — clean.
- `npx eslint src/core/hazard src/__tests__/earthquakeVerticalSlice.test.ts` — clean.
- `npm run build` — production build succeeds; the `City3DWebGLScreen` bundle chunk size is byte-for-byte unchanged (121.29 kB), confirming nothing in this slice reached the visual layer.
- `git diff --check` — clean.
- `node scripts/earthquake-e2e.mjs` — 25/25 checks passed in real Chromium.

## Boundaries preserved

Not touched, not imported, not referenced, anywhere in this slice: `EpidemicCitySimulation`, `resolveContacts`, Hospital Model (`hospitalResource.ts`), Scenario Engine (`scenarioEngine.ts`), Discovery Engine (`discoveryCase.ts`/`discoveryEngine.ts`/`discoveryEvidence.ts`/`discoveryExecution.ts`), epidemic replay (`discoveryReplay.ts`), `WorldEngineContract`, `cityAgent.ts`, `epidemicCity.ts`, `roadNetwork.ts`, City3D renderer files, asset governance. Confirmed both by code review and by an automated import scan in the test suite.

## What Kimi and Manus pick up next (not built here)

- **Kimi**: replacing the synthetic `SourceArtifact` with a real, licensed, provenance-complete data adapter (e.g. observed USGS event records) — the contract (`SourceArtifact`) and the "never re-fetch a live source, freeze and pin by content hash" replay rule are already proven; only the adapter is missing.
- **Manus**: wiring `projectEarthquakeWorldState()`'s output into a City3D read-only layer, exactly the way `projectWorldState(simulation)` already feeds the epidemic view — the contract is stable, versioned (`schemaVersion: '1.0.0'`), and lists what it deliberately does not model (`notModeled`).
- **Domain review**: before any of this is used for anything beyond an architecture demonstration, a seismologist needs to review (or replace) `earthquakeModel.ts`'s attenuation function, and a product decision is needed on real target geography, licensing, and intended use — exactly as `docs/MULTI_HAZARD_ARCHITECTURE_AUDIT.md` §9 already specifies.

## Independent-audit remediation

An independent audit of `c048592` (recorded as `d4b60ca` on `manus/high-fidelity-epidemic-digital-twin`) confirmed the slice was scope-clean but found three merge blockers, all fixed in the follow-up commit on this branch:

| Blocker | Fix |
|---|---|
| `scripts/earthquake-e2e.mjs` imported a hard-coded `/opt/node22/lib/node_modules/playwright/index.js` and launched a hard-coded `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, neither of which exists outside this one sandbox's exact Node version/browser revision. | `playwright` is now a declared devDependency (`package.json`), resolved via normal module resolution. The Chromium executable is resolved through a fallback chain: an explicit `PLAYWRIGHT_CHROMIUM_EXECUTABLE` env var, then Playwright's own `chromium.executablePath()` if that file exists, then this environment's revision-independent `$PLAYWRIGHT_BROWSERS_PATH/chromium` symlink, then no override (Playwright's own actionable install error). Re-run: still 25/25 in this sandbox. |
| `runEarthquakeScenario()` performed no runtime rejection of non-finite magnitude, negative/non-finite depth, non-finite epicenter coordinates, or non-finite seed. | New `earthquakeScenarioValidation.ts`: `validateEarthquakeScenarioSpec()` / `assertValidEarthquakeScenarioSpec()`, called at the top of `buildEarthquakeSourceArtifact()` (the earliest spec-consuming entry point, so it protects the whole pipeline). Explicitly a scenario-contract guard, not a calibration claim — 14 new tests. |
| `checkSourceArtifactAdmission()` accepted `NaN`/`Infinity` for `provenance.retrievedAt` (only checked `typeof === 'number'`). | Now requires finite and `>= 0`, the same pattern already used for `HazardRun.createdAt` since Phase 0.2 — 4 new regression tests. |

No UI, City3D, GIS, real-data adapter, cascade, or second hazard solver was added — this was a bounded correction of exactly the three findings above. Full suite after remediation: 121 files / 1268 tests (up from 1250 by exactly the 18 new regression tests); `tsc`/`eslint`/build/`git diff --check` all clean; `scripts/earthquake-e2e.mjs` 25/25 in this sandbox using the new portable resolution.

**NO EPIDEMIC CORE CHANGE. City3D untouched. Non-operational research prototype only.**
