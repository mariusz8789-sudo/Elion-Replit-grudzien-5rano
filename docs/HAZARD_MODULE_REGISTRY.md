# Hazard Module Registry and Capability Fence

**Status:** integrated for the existing synthetic Earthquake module only.
**Scope:** metadata, compatibility admission and replay fencing. No second hazard, solver, GIS, live data, cascade, City3D renderer, or epidemic-core change.

## Purpose

The registry provides one immutable `HazardModuleDescriptor` for `earthquake`. It records the module version, projection schema version, `SCENARIO`-only status, declared capabilities, reused `NOT_MODELED` list and required evidence-field paths. It contains no scientific calculation and does not invent a generic hazard solver.

`assertHazardRunCompatibleWithModule()` rejects a replay attempt when its hazard type is unregistered, input/run linkage is inconsistent, module version does not match the registered descriptor, or the supplied projection schema differs from the registered schema. This is an admission fence: it decides whether an existing run can be treated as compatible, not whether a hazard result is scientifically valid.

## Live Earthquake path

The delivered `executeEarthquakeCommandCenterScenario()` now supplies `hazardType: 'earthquake'` and the declared Earthquake projection schema to canonical `replayHazardRun()`. Therefore the capability fence runs before evaluator execution for every live City3D demonstrator replay. A rejected compatibility check returns the existing replay verdict `BLOCKED`; the downstream overlay gate consequently receives no `MATCH` approval and does not render the scenario projection.

The generic Phase 0 replay tests may omit `hazardType` because they intentionally exercise domain-neutral fixture records. This preserves the domain-neutral provenance contract without granting registered-module status to those fixtures.

## Deliberate deferral

The independently audited `EarthquakeDemoEnvelope` is **not** included in this integration. It sequences much of the same scenario → persistence → evidence → replay → projection work already owned by `earthquakeCommandCenter.ts`. Retaining both paths would create duplicate orchestration. A later refactor may select one upstream service and pass an explicit `LocalHazardProvenanceStore` through it, but that is a separate reviewed change.

## Boundaries

The registry does not imply observed data, calibrated models, real geospatial coordinates, infrastructure effects, casualties, evacuation, response guidance, GIS, routing, CityWorld mutation or cross-hazard cascades. The Earthquake descriptor remains explicitly `SCENARIO` only and reuses the Earthquake projection’s declared limitations verbatim.
