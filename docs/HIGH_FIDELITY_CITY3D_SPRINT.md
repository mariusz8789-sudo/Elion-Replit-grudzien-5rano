# High-Fidelity City3D Sprint

## Boundary retained

This sprint changes only the existing `EpidemicCity3DSim` renderer and its runtime-evidence helpers. It retains one City3D renderer, one `.city-3d-canvas`, one OrbitControls path, the existing CityWorld semantic locations, real agent positions/states and the existing read-only `WorldStateView` projection.

No `EpidemicCitySimulation`, contacts, Hospital Model, Scenario Engine, Discovery Engine, routing, World Engine contract, CityWorld geometry or asset-governance decision changed. New urban meshes are deterministic `VISUAL_ONLY` context with no semantic location ID, no agent target and no model effect.

## Cumulative visual work

| Layer | Delivered change | Performance discipline |
|---|---|---|
| Façade families | Semantic buildings gained articulated plinths, recessed ground glazing, entry canopies/frames, balcony rhythm and optimized side-light bands. | Side window loops were reduced to two bands per building after the live benchmark exposed excess draw calls. |
| Street composition | Existing streets now drive crossings, bay ticks, benches, bins, planters, shrubs, curbs and existing lamp rhythm. | Crossings, bay marks and furniture use instancing/shared materials; there is no synthetic traffic or transport claim. |
| Skyline depth | One shared far-city backdrop provides low-detail perimeter mass/window bands and hides only in the existing Street preset. | Two instanced meshes, no new scene/camera/world. |
| Materials / lighting | Governed PBR materials use controlled IBL, fill/rim balance, fog and exposure to retain façade/ground separation without neon treatment. | No unapproved material, texture or external asset is loaded. |
| City framing | The existing City camera was tightened modestly to improve city-first occupancy while District/Street presets remain unchanged. | The same camera ownership and controls remain in use. |

## Chromium evidence

Final 1920 × 1080 City, District and Street captures confirm one City3D canvas, no WebGL fallback, no captured console warning/error, live Scenario/Hospital/WorldState panels and default-collapsed Evidence/Replay contained in the right rail.

| Evidence | Path |
|---|---|
| Earlier City baseline | `artifacts/screenshots/city3d-city-post-layout.png` |
| Final City | `artifacts/screenshots/city3d-city-final-hf-sprint-city.png` |
| Final District | `artifacts/screenshots/city3d-district-final-hf-sprint-district.png` |
| Final Street | `artifacts/screenshots/city3d-street-final-hf-sprint-street.png` |
| Final renderer telemetry | `artifacts/city3d-live-metrics-final-hf-sprint-*.json` |

## Renderer benchmark

The benchmark controls the existing real `nAgents` input and records three post-settle `WebGLRenderer.info` samples. Browser automation remains fixed at 20 FPS / 50 ms and is not interpreted as production FPS; draw calls, triangles and renderer time are the valid comparison.

| Real agent population | Draw calls | Triangles | Mean renderer time |
|---:|---:|---:|---:|
| 260 | 1,950 | 671,624 | 15.03 ms |
| 500 | 1,946 | 1,166,992 | 15.47 ms |
| 1,000 | 1,950 | 2,200,464 | 16.07 ms |

After the side-band optimization, draw-call growth remains nearly population-independent (1,946–1,950), and the 1,000-agent renderer mean remains below 17 ms in the recorded samples. The runner restores the UI to 260 agents after the benchmark.

## Stopping rationale

The city now has a stronger architectural hierarchy, connected street cadence and legible city edge than the pre-sprint command-center composition. Further ungoverned procedural decoration would produce diminishing visual return relative to draw-call cost and risks implying unsupported semantic locations, mobility or infrastructure. The honest remaining gap to a fully authored reference city is additional **approved** façade families, governed street-furniture assets and a future spatial-art direction—not another simulation or fabricated urban data layer.
