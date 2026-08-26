# City3D Urban Cadence Sprint

## Scope and scientific boundary

This sprint refines the existing `EpidemicCity3DSim` only. It retains one WebGL renderer, one canvas, one camera/OrbitControls path, the existing CityWorld semantic locations, real `WorldStateView` overlays and current agent/contact/transmission behavior.

The new roof units, skylights, intersection planters and shrubs are deterministic **VISUAL_ONLY** meshes. They derive their placement from existing semantic building geometry and the existing street grid, carry no location ID, create no agent target, make no claim about infrastructure, environmental state or resources, and do not alter CityWorld, routing, agents, contacts or outcomes.

## Implemented composition changes

| Layer | Refinement | Purpose |
|---|---|---|
| Roofscape | Instanced mechanical roof modules and skylights positioned from stable building geometry. | Breaks repetitive flat roof silhouettes in City and District views. |
| Streetscape | Instanced concrete planters and shrubs at deterministic alternating street intersections. | Adds pedestrian-scale green rhythm and stronger street edges without synthetic traffic or mobility claims. |
| Rendering discipline | All new context is held in one named `visual-only-urban-cadence` group and uses instanced meshes. | Maintains one renderer and a small, bounded draw-call increase. |

## Chromium runtime evidence

All captures use the live Chromium DevTools target at **1920 × 1080**.

| View | Runtime status | Visual result |
|---|---|---|
| City | One `.city-3d-canvas`; no loading/fallback/console entries; Evidence/Replay collapsed. | Dense, legible central city with roof and streetscape rhythm visible beneath real WorldState markers. |
| District | One `.city-3d-canvas`; no loading/fallback/console entries; Evidence/Replay collapsed. | Medium-scale roof texture, façades, lights and sidewalk rhythm retain semantic labels and hotspot visibility. |
| Street | One `.city-3d-canvas`; no loading/fallback/console entries; Evidence/Replay collapsed. | Low street view retains approved façade language, road geometry, greenery, real hotspot markers and semantic labels. |

The first Street capture occurred during governed high-detail façade loading and reported a **478.30 ms** cold-render outlier. Two warm Street samples immediately afterward reported **16.00 ms** and **14.40 ms**. The cold reading is retained as evidence but is not used as a stable performance conclusion.

## Renderer benchmark

The benchmark uses the existing real `nAgents` control and three post-settle `WebGLRenderer.info` readings per population. Browser automation reports a fixed 20 FPS / 50 ms cadence, so renderer time and renderer-info counters are the meaningful comparison points.

| Population | Draw calls | Triangles | Mean renderer time | Baseline comparison |
|---:|---:|---:|---:|---|
| 260 | 1,504 | 583,018 | 13.20 ms | +8 calls; +1,776 triangles; baseline mean 15.27 ms. |
| 500 | 1,500 | 1,074,546 | 13.50 ms | +8 calls; +1,776 triangles; baseline mean 13.53 ms. |
| 1,000 | 1,504 | 2,100,018 | 13.33 ms | Stable +5–8 calls; +1,776 triangles; no cold outlier in three samples. |

The fixed geometry increment is independent of agent population, consistent with the visual-only meshes being instanced rather than per-agent work.

## Validation

The final active branch passed **118 frontend test files / 1,185 tests**, TypeScript no-emit, production Vite build and `git diff --check`. The existing production chunk-size warning remains unrelated to this sprint.

## Evidence files

| Artifact | Path |
|---|---|
| City capture | `artifacts/screenshots/city3d-city-urban-cadence-city.png` |
| District capture | `artifacts/screenshots/city3d-district-urban-cadence-district.png` |
| Street capture | `artifacts/screenshots/city3d-street-urban-cadence-street.png` |
| Runtime metrics | `artifacts/city3d-live-metrics-urban-cadence-*.json` |
| Population benchmark | `artifacts/city3d-benchmark-urban-cadence.json` |

## Remaining gap to the visual reference

The scene has a stronger roof/street hierarchy and city-scale depth, but it still remains a governed CityWorld visualization rather than a fully authored production city. The most valuable later work is additional governed façade variation and carefully budgeted side-facing building detail; it should remain visual-only and must not replace real semantic locations or introduce synthetic epidemiological signals.
