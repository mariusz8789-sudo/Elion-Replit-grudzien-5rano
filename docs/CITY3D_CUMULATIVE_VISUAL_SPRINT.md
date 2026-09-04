# City3D Cumulative Visual Sprint

## Delivery boundary

This cumulative sprint advances the existing `EpidemicCity3DSim` toward the supplied dense professional Digital Twin reference. It retains one renderer, one City3D canvas, one OrbitControls path, the existing CityWorld, real agent positions/states, WorldState overlays, Scenario, Hospital, Evidence/Replay, Science Chat and current routing behavior.

No new scientific model, GIS world, semantic location, agent, transport model, hazard model, data source or unapproved asset was added. Every new urban element is deterministic **VISUAL_ONLY** rendering context.

## Before → after

| Area | Before | After |
|---|---|---|
| Skyline depth | Outer-city masses read mainly as roof-capped boxes. | Perimeter buildings gain instanced side-facing windows, varied warm/cool window tones and façade bands, creating a deeper city edge in City and District views. |
| Roof and street cadence | Streets and roofs had limited repeated visual rhythm. | Existing semantic geometry now drives visual-only roof units, skylights, planters, shrubs, sidewalk paver joints and intersection bollards. |
| Street coherence | The low Street view showed core façades and roads but weaker ground contact. | Ground-plane joints, bollards and real-agent ground shadows improve material depth and pedestrian scale without adding fake traffic or locations. |
| Agents | Actual agents were present but could visually float against dark ground. | One instanced shadow layer maps each existing real agent to its current model position; no agent property or state is modified. |

## Real Chromium evidence

The final 1920 × 1080 City, District and Street captures each confirm exactly one `.city-3d-canvas`, no loading/fallback state, no captured console warnings/errors, visible Scenario/Hospital/WorldState rails and a default-collapsed, rail-contained Evidence/Replay panel.

The additional real-agent Street run advanced only the existing simulation through its own 10× UI control. It reached day 3 with the model’s displayed counts (`S=253`, `E=3`, `I=4`) and two real transmission clusters. The visible people, changed WorldState information and transmission rings in that capture are therefore model-derived, not decorative or synthetic.

## Renderer benchmark

The benchmark uses the existing real `nAgents` control and three post-settle `WebGLRenderer.info` readings for each population. Browser automation reports a fixed 20 FPS / 50 ms cadence, so renderer time and renderer-info counters are the relevant comparison.

| Population | Draw calls | Triangles | Mean renderer time | Cumulative visual cost |
|---:|---:|---:|---:|---|
| 260 | 1,513 | 601,130 | 13.90 ms | +17 draw calls / +19,888 triangles versus the pre-sprint 260 baseline. |
| 500 | 1,509 | 1,096,498 | 14.67 ms | +17 draw calls / +23,728 triangles versus the pre-sprint 500 baseline. |
| 1,000 | 1,513 | 2,129,970 | 13.97 ms | +17 draw calls / +31,728 triangles versus the pre-sprint typical 1,000 reading. |

The increment is bounded and independent of agent count: the new city context uses shared materials and instanced meshes, while the agent shadow layer is one additional crowd mesh rather than per-agent geometry.

## Validation

The completed branch passed **118 frontend test files / 1,185 tests**, TypeScript no-emit, production Vite build and `git diff --check`. Existing production chunk-size warnings remain unrelated to these City3D changes.

## Evidence files

| Evidence | Path |
|---|---|
| Pre-sprint City baseline | `artifacts/screenshots/city3d-city-post-layout.png` |
| Final City | `artifacts/screenshots/city3d-city-long-sprint-final-city.png` |
| Final District | `artifacts/screenshots/city3d-district-long-sprint-final-district.png` |
| Final Street | `artifacts/screenshots/city3d-street-long-sprint-final-street.png` |
| Real-agent Street | `artifacts/screenshots/city3d-street-real-agent-street.png` |
| Final telemetry | `artifacts/city3d-live-metrics-long-sprint-final-*.json` |
| Real-agent telemetry | `artifacts/city3d-live-metrics-real-agent-street.json` |
| Population benchmark | `artifacts/city3d-benchmark-long-sprint.json` |

## Stopping rationale and remaining gap

This is the point at which the next decorative iteration would provide a smaller visual gain than its cost or would require semantic claims not supported by Genesis. Materially richer streets now require either more governed authored geometry/texture variants or additional real spatial semantics; neither should be improvised as procedural filler.

The remaining gap to a fully authored reference city is therefore honest: more façade family variation, richer real street furnishing and finer terrain/urban-block detail require approved assets and a future governed spatial-art direction. They should not be approximated by another simulation, fake mobility, unverified assets or synthetic epidemiological data.
