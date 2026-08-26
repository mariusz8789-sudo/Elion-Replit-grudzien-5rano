# Post-Integration City3D Runtime QA

**Scope.** This record covers the reconciled `City3D + Scenario Command Center + Hospital + WorldState + Evidence/Replay` screen on `manus/high-fidelity-epidemic-digital-twin`. It is a runtime/layout verification only. It does not change the epidemic model, World Engine contract, routing, Scenario Engine, Hospital Model, Discovery Engine, evidence semantics, renderer ownership, or asset-governance policy.

## Runtime evidence

The post-integration capture was taken from the live Chromium DevTools target at **1920 × 1080**. The initial capture confirmed one `.city-3d-canvas`, no WebGL fallback/empty state, no captured console warnings/errors, the Scenario panel, Hospital panel, WorldState rail, and the Evidence/Replay panel. Evidence/Replay was correctly default-collapsed (`aria-expanded="false"`) and horizontally contained within the right rail.

| Check | Observed result |
|---|---|
| City3D canvas ownership | Exactly one `.city-3d-canvas` managed by the existing City3D path. A separate `1 × 1` `reality-canvas` belongs to the existing application-wide Reality feature and is not a second City3D renderer. |
| Evidence/Replay default state | Collapsed, so it does not cover the City3D viewport on entry. |
| Right rail behavior | Independently scrollable with `overflow-y: auto`; long panel content does not widen over the scene. |
| Required panels | Scenario, Hospital, WorldState rail and Evidence/Replay present. |
| Runtime failure state | No `.route-loading`, no `.empty-state`, no DevTools-captured console warning/error. |
| Render snapshot | 1,503 draw calls, 642,798 triangles and 14.30 ms renderer time in the post-layout capture. |

## Observed regression and narrow fix

The first 1920-pixel capture exposed a real desktop composition defect: the inherited `margin: 0 auto` on `.city-world-shell` made the flex child shrink to its content width (**1,242 px** inside a **1,920 px** viewport). This left large unused black margins and reduced the City3D scene despite the screen’s city-first design contract.

The desktop-only override now applies `width: 100%`, `margin: 0`, and `align-self: stretch` alongside the existing no-cap rule. This does not alter any renderer, simulation, panel data, camera control, routing, or scientific behavior. The corrected capture shows the single existing city canvas using the full command-center width, with both side rails contained and the city visibly dominant.

| Evidence | File |
|---|---|
| Pre-fix post-integration capture | `artifacts/screenshots/city3d-city-post-evidence.png` |
| Corrected 1920 × 1080 capture | `artifacts/screenshots/city3d-city-post-layout.png` |
| Corrected runtime assertions | `artifacts/city3d-live-metrics-post-layout.json` |

## Local validation

The active branch passed the direct installed frontend validation after the layout change: **118 test files / 1,185 tests**, TypeScript no-emit, production Vite build, and `git diff --check`. The production build retains the pre-existing chunk-size warning only.

## Independent Claude Phase 0 audit — not merged

Claude’s reported `cd02484` was fetched and audited in a separate detached worktree. Its actual range from this branch’s `8e58a13` touches 12 files limited to `core/hazard`, the domain-neutral `core/provenance/recordStore.ts`, `core/discovery/evidenceStore.ts`, dedicated tests, and documentation. It does not modify the epidemic scientific core, routing, City3D, World Engine contract, asset governance, live data/GIS wiring, solver code, cascades, or hazard UI.

The isolated checkout passed the focused provenance/convergence tests and its full frontend suite (**120 files / 1,217 tests**), TypeScript no-emit, production build, and range `git diff --check`. The report’s shared storage extraction is therefore real, not merely claimed.

However, this is **not merge-approved yet**. The actual evidence admission implementation does not reject an empty `SourceArtifact.artifactId`, and the run admission check does not validate `createdAt` or `outputFields`. These are small but material evidence-completeness gaps: Phase 0 should reject incomplete provenance before it can participate in replay. They require a narrow corrective commit plus tests before any merge decision.

> **Audit verdict: Phase 0 scope and validation evidence are credible; merge remains blocked on the admission-gate completeness correction.**
