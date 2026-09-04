# Earthquake → City3D Read-Only Integration Seam

## Status

**Design-only and disabled by default.** No Earthquake source is merged into the active City3D branch, no Earthquake data is rendered, and no `WorldStateView` field is changed by this document.

This seam can be activated only after the independent audit blockers in `EARTHQUAKE_VERTICAL_SLICE_INDEPENDENT_AUDIT.md` are corrected and a follow-up audit accepts the corrected revision.

## Non-negotiable boundary

`WorldStateView` remains the single read-only projection of the epidemic simulation. Earthquake information must **not** be appended to it, passed to `EpidemicCity3DSim.setWorldState()`, or used to change agents, contacts, hospital utilization, routing, mobility, locations, camera behavior or Scenario Engine output.

The future renderer input is a separate immutable `EarthquakeWorldStateView` created by Claude’s `projectEarthquakeWorldState()`. It is an overlay input, not a world replacement and not a second simulation.

| Epidemic path — unchanged | Future Earthquake path — separate |
|---|---|
| `EpidemicCitySimulation` → `projectWorldState()` → `WorldStateView` → `setWorldState()` | frozen `HazardRun` + `ExposureSnapshot` + `ImpactResult[]` → `projectEarthquakeWorldState()` → disabled read-only overlay adapter |
| Real model data for the existing synthetic city | Explicitly tagged `SCENARIO` hazard prototype data only |
| Updates with the epidemic clock | Immutable per persisted hazard run; never drives the epidemic clock |

## Activation gates

Before any City3D overlay is instantiated, the adapter must reject and render nothing unless all gates pass.

1. The Earthquake revision has passed the independent audit, including portable Node-to-Chromium E2E and finite semantic input/provenance validation.
2. `schemaVersion` is explicitly supported by the adapter.
3. Every projected site carries `datasetStatus: 'SCENARIO'`; the UI must show **SCENARIO — synthetic, non-calibrated, non-operational** in the same frame.
4. A persisted Evidence Pack is complete, its replay verdict is `MATCH`, and its run/artifact/module/commit fingerprints are retained as tooltip/export provenance.
5. A future explicit coordinate-mapping artifact exists. Claude’s current local fixture coordinates are not CityWorld coordinates, not EPSG:4326 and not real facilities; they must never be placed on existing semantic buildings by label, proximity or guessed scale.

Without gate 5, the only permitted City3D behavior is **no spatial rendering** plus an optional compact command-center status reading `NOT_WIRED — coordinate mapping unavailable`.

## Future renderer ownership

After the gates pass, Manus may add one named `earthquake-scenario-overlay` group inside the existing `EpidemicCity3DSim` scene. It must use shared/instanced visual markers, be removable as a single group, and never create another renderer, canvas, camera, control loop or simulation clock.

The overlay may communicate scenario severity and uncertainty only with the `SCENARIO` label and a visible legend. It must not use “damage,” “casualties,” “evacuation,” “infrastructure outage” or operational-response language because the current vertical slice declares those fields `NOT_MODELED`.

## Required tests before wiring

| Test | Required proof |
|---|---|
| Isolation | Applying/removing the overlay cannot mutate `WorldStateView`, `EpidemicCitySimulation`, agents, contacts, Hospital Model or routing. |
| Gate rejection | Unsupported schema, non-MATCH replay, incomplete evidence, non-SCENARIO data or absent coordinate mapping yields no rendered markers. |
| Projection discipline | Fixture local coordinates cannot bind to CityWorld locations without an explicit versioned mapping artifact. |
| Renderer ownership | Exactly one `.city-3d-canvas` and one City3D renderer persist when the overlay is present. |
| Chromium | City/District/Street capture shows a compact scenario disclaimer and does not cover the city or Evidence/Replay rail. |

> **No Earthquake City3D overlay is approved or implemented by this seam. It is a guarded integration design that preserves the current Scientific Core until the source branch and data-mapping requirements are independently approved.**
