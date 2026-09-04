# Genesis Epidemic Digital Twin — City3D Integration

## 1. Problem and integration target

The target was to evolve the **existing `#/city3d` renderer** into a more legible epidemic digital twin without creating a parallel city, canvas, simulation, route planner, scenario engine, or WorldState. The implementation starts from the reconciled branch containing Claude’s current hotspot/cluster analytics and the previous Scenario, Hospital, High-Fidelity City View, and route-topology work.

The result remains one `EpidemicCity3DSim`, one Three.js scene, one renderer loop, one canvas, and the pre-existing OrbitControls lifecycle supplied by `useThreeLoop`.

## 2. Recovered high-fidelity rendering pieces

The City3D renderer now reuses the governed High-Fidelity Street Slice approach rather than importing an ungoverned alternative.

| Rendering concern | City3D integration | Boundary |
|---|---|---|
| PBR streets, sidewalks, terrain, façades | Governed asphalt-track, concrete-floor-01, and brick-wall-10 texture sets | `assetGovernance.ts` path approval gate remains mandatory |
| Environment lighting | Approved Braustuble Alley HDRI through `RGBELoader` and PMREM | Rendering-only environment; not geographic data |
| Modular façade | Approved Poly Haven modular urban apartment façade | Street/agent/location-focus LOD only, because the source asset is high polygon |
| Street lamp | Approved Poly Haven Street Lamp 01 | One representative visual-only lamp instance |
| City-scale performance | Shared material reuse, existing instanced crowd, street-level glTF LOD | No second scene or crowd system |

Only assets with `APPROVED` status are requested. Any unavailable or rejected asset leaves the existing material/geometry fallback in place; no `UNVERIFIED` asset is loaded.

## 3. City3D implementation

`epidemicCity3D.ts` now uses the approved PBR material bundle for the existing semantic building, road, sidewalk, and ground geometry. The original layout coordinates and CityWorld objects remain the source for streets and buildings. The renderer also applies HDRI lighting and preserves shadows, ACES tone mapping, bloom, instanced agents, transmission arcs, and the existing camera controls.

The modular façade is intentionally **LOD-gated**: it is visible in `STREET`, `AGENT`, and selected-location focus, while the aerial `CITY` and `DISTRICT` views use the approved PBR façade surfaces. This preserves useful city-scale draw-call headroom while making the approved high-detail façade available at the view where it can be inspected.

The final visual pass replaces the sparse, tabletop reading of the aerial screen with a tighter isometric City frame, a dark neutral horizon that keeps HDRI only as PBR image-based lighting, denser deterministic infill blocks, and a City-only perimeter skyline rendered through instanced PBR masses. The added blocks are explicitly `VISUAL_ONLY`; they are not WorldState locations, contacts, destinations, or epidemiological entities. The `STREET` preset uses the existing road-grid center as a camera focus point, rather than placing the shared camera inside arbitrary surrounding geometry.

## 4. Real data used in the scene

The screen creates one `projectWorldState(simulation)` projection and passes it read-only into the same City3D renderer. City3D does not compute an alternate hotspot, cluster, hospital, mobility, or transmission model.

| Signal | Source | In-world treatment |
|---|---|---|
| Semantic locations | `WorldStateView.locations` / existing CityWorld layout | Existing semantic building geometry; selectable read-only location focus |
| Hotspots | `WorldStateView.hotspots` | Animated red beacon, stacked rings, and cap per real infectious grid cell |
| Clusters | `WorldStateView.clusters` plus real `locationIndex` coordinate | Animated violet beacon only where a real location coordinate exists |
| Hospital load | `WorldStateView.hospital` | Status-colored elevated beacon and retained Hospital UI |
| Mobility | `WorldStateView.mobility` | Compact lower analytics rail, never a fabricated vehicle layer |
| Transmission | Existing EventStream / real `TransmissionEvent` | Existing A→B arc plus selectable event metadata |

Clicking a stable semantic location, hotspot, cluster, hospital marker, or live transmission marker moves the **same camera** to a read-only focus target. The renderer never writes to the simulation when a world object is selected.

## 5. Visual-only context

Additional city atmosphere, façade presentation, lamps, HDRI, PBR texture maps, lighting, shadows, and camera presets are **visual-only**. They have no model IDs, no contact effects, no destination effect, and do not change agent movement, infection, hospital status, scenario results, or replay semantics.

## 6. Declared non-modelled boundaries

The compact rail explicitly renders **`ROUTES — NOT_MODELED`** for contact-to-segment attribution. The retained route topology panel still displays the read-only road topology, but no agent route assignment or contact-to-road-segment result is implied. Other WorldState `notModeled` declarations remain authoritative, including vehicle traffic, public transport flow, weather, and resource-stock dynamics.

## 7. Performance measurements

The benchmark harness changes the real `nAgents` control, waits for the current scene, and reads `WebGLRenderer.info` values exposed by the existing observability panel. It uses the final City camera configuration. The browser was driven through a development-server Chromium session; its 20 FPS / 50 ms frame cadence is a browser automation throttle, so **`renderMs` is the meaningful renderer timing** and the 50 ms frame number is not a production-GPU claim.

| Agents | Draw calls, median | Triangles, median | Render time samples (ms) | Render median (ms) | Notes |
|---:|---:|---:|---|---:|---|
| 260 | 1,496 | 581,242 | 14.5, 15.3, 16.0 | 15.3 | One City3D canvas |
| 500 | 1,492 | 1,072,770 | 14.2, 13.1, 13.3 | 13.3 | One City3D canvas |
| 1,000 | 1,496–1,503 | 2,098,242–2,159,798 | 15.1, 15.1, 439.5 | 15.1 | One isolated 439.5 ms outlier retained, not discarded |

The raw samples are retained in `artifacts/city3d-benchmark.json`. The final City camera stays within one renderer/canvas and avoids a high-detail glTF draw burden in the aerial view. The additional visual-only skyline and real-beacon hierarchy raise the City budget by roughly one hundred draw calls relative to the earlier baseline; the render median remains approximately 15 ms in the automated Chromium setup.

## 8. Validation results

| Check | Result |
|---|---|
| TypeScript and Vite production build | Passed |
| `git diff --check` | Passed |
| Focused City3D WorldState boundary, hotspot, scenario tests | 12/12 passed |
| Full frontend regression suite | 113 files / 1,162 tests passed |
| Browser runtime DOM check | City3D canvas, Hospital UI, Scenario UI, lower analytics rail present; no console errors in the final captured tab |
| Camera smoke | `CITY`, `DISTRICT`, and corrected `STREET` captured from the existing shared camera controller |

The runtime capture evidence is in `artifacts/screenshots/`; `city3d-city-final.png`, `city3d-district-final.png`, and `city3d-street-final.png` are 1920×1080 captures from the final renderer. A previous browser-screenshot transport issue was isolated from the application by direct Chromium DevTools capture; the final captured tab reported no WebGL failure and no console errors.

## 9. Preserved systems

No changes were made to `EpidemicCitySimulation`, `resolveContacts`, Hospital Model behavior, Scenario Engine behavior, Discovery Engine behavior, replay semantics, `WorldEngineContract`, or road-routing behavior. Scenario and Hospital panels remain mounted in `City3DWebGLScreen.tsx`; Claude’s hotspot/cluster panel and the route-topology panel remain present.

## 10. Delivery assets

| Artifact | Purpose |
|---|---|
| `artifacts/city3d-benchmark.json` | Raw final benchmark samples |
| `artifacts/screenshots/city3d-city-final.png` | Final 1920×1080 City camera capture with real hotspots |
| `artifacts/screenshots/city3d-district-final.png` | Final 1920×1080 District camera capture |
| `artifacts/screenshots/city3d-street-final.png` | Final 1920×1080 Street camera capture |
| `screenshots/city3d-before-1920x1080.png` | Earlier baseline comparison capture |

## 11. Next step

The recommended next step is a controlled visual-art pass that improves texture readability and façade composition at City scale without raising the City camera draw-call budget. It should remain renderer-only and retain the existing contract boundaries.
