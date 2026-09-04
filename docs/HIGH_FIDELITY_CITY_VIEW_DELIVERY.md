# High-Fidelity City View delivery

## Purpose

This delivery upgrades the existing `#/city3d` Command Center view into a denser, city-first district composition. It is a **renderer-only visual pass** on `manus/high-fidelity-city-view`; it does not alter `EpidemicCitySimulation`, `resolveContacts`, Hospital Model, Scenario Engine, Discovery Engine, replay, cohort logic, transmission semantics, `WorldEngineContract`, or the routing topology contract.

## What changed

The default shared `OrbitControls` camera now uses a tighter elevated overview and a narrower field of view, so the three-by-three road grid and several blocks occupy the primary canvas. The camera remains the same camera system used by CITY, DISTRICT, STREET, and AGENT modes; no separate cinematic scene was introduced.

The existing city assets were extended rather than replaced. Roads keep the same source street coordinates but receive asphalt, sidewalks, curbs, lane markings, crossings, street lamps, and shadow reception. Existing CityWorld buildings retain their positions, labels, and simulation meaning. Deterministic visual-only context buildings fill selected frontage gaps with varied massing, roofs, windows, balcony-scale details, and rooftop units. They do not have location IDs, are never returned by `simulation.objects()`, cannot be selected as destinations, and do not contribute to contacts.

Vegetation has been reduced from a central cluster of large cones to a smaller, distributed set of shadow-casting park trees. The city uses a directional key light, hemisphere/ambient fill, soft shadows, ACES tone mapping, restrained bloom, and fog. Crowd and focus-rig dimensions were reduced so agents read as population-scale elements rather than the central subject of the City View.

| Area | Existing asset or data reused | Visual treatment | Model boundary |
| --- | --- | --- | --- |
| Streets | `CityLayout.streetsH`, `streetsV` and `WorldStateView.routing` | Asphalt, curbs, sidewalks, markings, crossings, lamps | No topology or routing change |
| City objects | `simulation.objects()` / CityWorld buildings | Existing facade assets plus shadow and material improvements | Real objects retain full existing meaning |
| Context frontage | Renderer-only deterministic geometry | Compact mixed-height infill blocks | Never a model location, destination, or contact source |
| Park | Existing park object | Smaller dodecahedral canopies and trunks | No park geometry or contact change |
| Population | Existing `SimAgent` mapping | Smaller instanced crowd and focus rig | No agent, movement, or health-state change |
| Hospital/topology panels | Existing Command Center data | Preserved unchanged | Same values and `NOT_MODELED` boundary |

## Before and after

The requested same-view captures are stored at exactly **1920×1080**:

| Capture | File | Observation |
| --- | --- | --- |
| Before | `screenshots/city3d-before-1920x1080.png` | Sparse block layout, broad unused parcels, flatter road hierarchy |
| After | `screenshots/city3d-after-1920x1080.png` | Closer city overview, denser frontage, stronger road hierarchy, smaller vegetation, preserved data panels |

## Validation and benchmark observation

The full frontend suite passed: **110 test files and 1,153 tests**. The production build ran TypeScript project checking through `tsc -b` and then Vite successfully. `git diff --check` passed. The frontend package does not define an ESLint script or ESLint dependency, so no repository-configured lint command was available. No backend code was modified.

Chromium verification loaded `#/city3d`, started and paused a real run, advanced real epidemic state from day 0 to day 2, displayed a real transmission event, retained the hospital accounting panel, retained `SIEĆ MIEJSKA` topology values of 6 roads, 12 sidewalks, and 18 crossings, and activated the transmission-risk overlay. The browser console contained no application errors.

The runtime observability panel showed approximately **1,383–1,387 draw calls** and about **10.3–10.5 ms** renderer time on the validation runtime at 260 displayed agents. This is an observation from the current sandbox browser, not a portable performance guarantee. The visual infill increases draw calls; future district expansion should move repeated facade modules to instancing before increasing city breadth.

## Limits and future extension

The current pass intentionally serves one dense representative district. To extend it to additional blocks, add deterministic renderer-only zones keyed to the immutable map fingerprint, keep all model-owned structures separate, and convert repeated context facades/windows to instanced meshes. Do not convert visual context geometry into CityWorld locations without a separate data-contract and Scientific Core review.

The City View still does not assign agents to route segments. The Command Center retains the explicit `NOT_MODELED` label for per-agent route assignment and contact-to-segment attribution. A future routing integration must be feature-flagged and validated separately because changing movement can change contact and transmission outcomes.
