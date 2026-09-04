# Genesis OS — 5-minute investor demo runbook

**Status:** LIVE product proof, not a concept mockup. This runbook uses only routes and capabilities currently present in Genesis. It is intended for a supervised demo in a clean browser profile with WebGL enabled.

## Purpose

The demo shows the central product loop rather than a collection of isolated laboratories:

> Science Chat → explicit plan → user confirmation → existing model execution → result → visualization or lab route → provenance → Evidence / Replay → A/B or series observation → next bounded experiment.

The presenter must never describe a model result as a measurement of reality, a medical recommendation, a structural damage prediction, or a causal discovery unless the current screen explicitly supports that claim.

## Minute-by-minute flow

| Time | Action | What the audience sees | What it proves | What it does not prove |
|---|---|---|---|---|
| 0:00–0:30 | Open the Genesis Observatory home / Command Center | Product shell, scientific catalog and navigation | Genesis has one product surface and shared navigation | It does not prove every catalog item is fully connected |
| 0:30–1:10 | Open Science Chat and enter `pokaż problem trzech ciał` | Deterministic model selection opens the existing laboratory | Chat can select an existing registered model | It is not an LLM-generated solver |
| 1:10–1:50 | Ask `pokaż równanie`, then change a bounded parameter | Equation/assumption response and live parameter effect | The chat is connected to the active simulation context | It does not prove an external scientific validation |
| 1:50–2:30 | Enter `uruchom pilota`, then choose `Protocol / A-B` | Existing Experiment Pilot with explicit hypothesis, sweep, metric and falsification fields | A run requires a visible plan and explicit confirmation | It does not auto-create variants or run in the background |
| 2:30–3:20 | Build and confirm a bounded protocol | Evidence chain from real arms/runs, assessment, provenance fingerprint and export controls | Evidence is derived from recorded real runs only | A strong observation is not automatically a discovery or causal result |
| 3:20–3:55 | Open `Evidence / Replay` or `#/discovery-log` | Existing Evidence & Replay surface with MATCH/DRIFT/BLOCKED/NOT_REPRODUCIBLE states | Replay and drift status are explicit | It does not make an incompatible Campaign record interoperable |
| 3:55–4:20 | Ask `pokaż Pamięć Naukową` | Local history route `#/memory` with saved records, fingerprints, reopen and JSON export | Users can return to prior local experiments | It is not cloud collaboration, account history or an Evidence Pack |
| 4:20–5:00 | Run the Earthquake command-center path | Earthquake scenario → ImpactResult → DamageAssessment → City mapping → City3D, with `NOT_MODELED` boundaries | The flagship vertical slice has a real result-to-visualization handoff | It does not model structural damage, live GIS exposure or engineering loss estimates |

## Exact presenter phrases

Use the following phrases because they correspond to existing deterministic command paths:

- `pokaż problem trzech ciał`
- `pokaż równanie`
- `założenia modelu`
- `uruchom pilota`
- `zaprojektuj protokół A/B`
- `pokaż Pamięć Naukową`
- `evidence replay`
- For model comparison: `porównaj SIR R0=1.5 z SIR R0=3`

For Earthquake, use the visible Pilot/Command Center controls rather than claiming that the generic executor is the Earthquake solver. The generic Fabric path now honestly reports a `capability_seam`; the executable Earthquake path is the existing command-center confirmation adapter.

## Proof language

Use **connected** for a route that was exercised and produced its declared output. Use **partial** when only part of the pipeline is connected. Use **NOT_MODELED** whenever the model does not provide the requested quantity. Use **PARKED** for GIS/live data, Campaign-to-Fabric interoperability, Matrix, Collider, speculative time travel, and new hazard solvers.

A safe closing statement is:

> Genesis is a deterministic scientific workflow product: it makes model choice, assumptions, execution, provenance, evidence and replay visible. It is not claiming that every scientific domain is solved, nor that a simulation result is automatically a fact about the world.

## Known demo constraints

The current product uses local browser storage for Scientific Memory. Cloud Projects and account functionality are optional and must not be implied when the presenter is not logged in. WebGL visualization depends on the browser environment. Campaign is read-only and deliberately not bridged into Fabric Evidence / RO-Crate because lossless interoperability has not been proven. Real GIS/live external data is parked. Earthquake structural damage is explicitly `NOT_MODELED`.

## Regression gates before a partner demo

The presenter should use a clean build from the current LIVE branch and verify that the latest GitHub Actions run is green. The standing gates are Earthquake, Epidemic, Minkowski, Schwarzschild, geodesics, c-Slider, Particle, Universe, Quantum Tunneling, Ising and the bounded chemistry models. The demo must be stopped if the UI displays a result that conflicts with its provenance or epistemic status.
