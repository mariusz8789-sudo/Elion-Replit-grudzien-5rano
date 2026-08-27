# Genesis Master Execution Status

## Current product decision

Genesis is being advanced as one **Scientific Discovery OS**, not as a collection of disconnected demos. The execution rule is one capability at a time:

`Science Chat → StructuredExperimentRequest → confirmation → existing model/solver → result → visualization/lab/world → provenance → honest Evidence/Replay status`

Every milestone must pass tests, TypeScript, lint, production build, Chromium smoke, GitHub Actions and clean-state publication before the next milestone begins.

## Connected milestones on LIVE

| Capability | Status | Real route/model | Honest boundary |
|---|---|---|---|
| Epidemic city | DONE for current integration contract | `epidemic-city` → `#/city3d` via same-world handoff | Deterministic synthetic city; not a real-world forecast. Evidence protocol and counterfactual require explicit setup. |
| Earthquake | DONE reference vertical slice | `earthquake-scenario` → existing City3D live-world path | Scenario mapping; structural damage is `NOT_MODELED`; no real GIS or building inventory. |
| Minkowski 1+1D | DONE bounded lab flow | `spacetime-minkowski` → Space-Time Lab | Diagram and observables in bounded 1+1D; not a time machine. |
| Schwarzschild geodesic | DONE bounded lab flow | `einstein-schwarzschild-geodesic` → Einstein Lab | Photon geodesic model; no Kerr, no full ray tracer, no time travel. |
| c-Slider | DONE bounded lab flow | `spacetime-c-slider` → Space-Time Lab | Thought experiment with hypothetical c; does not alter physical constants. |
| Particle energy | DONE bounded lab flow | `particle-relativistic-energy` → Particle Lab | Free-particle E=γmc² graph; not a collider or detector experiment. |
| Stellar scaling | DONE bounded lab flow | `universe-starlife` → Universe Lab | Scaling relation with explicit simplifications; not full stellar evolution or prediction. |
| Galaxy rotation curve | DONE bounded lab flow | `universe-rotation-curve` → Universe Lab (`rotationcurve`) | Analytic exponential disk plus pseudo-isothermal halo or MOND alternative; not a fit to any named galaxy and not a CDM-vs-MOND verdict. |
| Galaxy collision | DONE bounded lab flow | `universe-galaxy-collision` → Universe Lab (`collision`) | Restricted Toomre–Toomre two-core plus test particles; not full N-body, hydrodynamics or reconstruction of a real merger. |
| Schwarzschild radius | DONE bounded analytical flow | `einstein-schwarzschild` → Einstein Lab | Non-rotating, uncharged Schwarzschild metric calculation; not Kerr, not a ray tracer and not observational inference. |

## Partial or not connected yet

| Area | Status | Decision |
|---|---|---|
| Formal Evidence Packs | PARTIAL | Current capsules honestly return `PROTOCOL_REQUIRED` unless a protocol exists. Science Chat now opens the existing Evidence & Replay panel directly; do not fabricate packs. |
| A/B and counterfactual UX | PARTIAL | Existing comparisons are available only where two real, compatible runs exist; Science Chat now exposes the Evidence/Replay surface, while missing variants remain `VARIANT_REQUIRED`. |
| Science Chat visual proof / Epidemic handoff | CONNECTED with proof boundary | Confirmed run now hands the same `EpidemicCitySimulation` reference to `#/city3d`; visual proof remains environment-dependent when WebGL is unavailable. |
| Discovery Timeline | NOT A SOLVER | Keep as narrative visualization until a separately bounded model contract exists. |
| Wormholes, grandfather paradox, physical time travel | PARKED | Unsupported or hypothetical; keep outside real solver path. |
| Kerr full 3D / 4D or 5D claims | PARKED | Add only with a separately validated model and explicit limitations. |
| Collider / Matrix / second renderer or world | PARKED | Forbidden until architecture and value case are separately approved. |
| GIS, OSM/DEM, live external data | PARKED | Requires provenance, licensing, ingestion and security design; no live fetch in current Genesis contract. |

## Current LIVE HEAD

The latest published code commit is `5154b71` on `manus/high-fidelity-epidemic-digital-twin`. The latest CI for that commit is `33051455075` and is green. The accepted Claude handoff is `a23e904` (Epidemic→City3D same-world handoff plus routing proofs), the Evidence/Replay entry point is `460c5cf`, the ontology audit and package contract are `c6f612b`, the visual language is `430a0b1`, the preregistered Protocol / A-B designer is `d4c6acd`, and the parked Navigator specification is published to the same LIVE branch.

## Next CTO gate

The visual-proof pass, Evidence/Replay entry point, ontology audit, package orchestration contract, Genesis Observatory visual refresh, preregistered Protocol / A-B designer and WHY / Next Experiment layer are complete. The Protocol UI exposes explicit hypothesis, baseline, sweep parameter, primary metric output key, repetitions and falsification relation, then calls only existing `designScientificExperiment` / `executeScientificExperiment`. WHY uses only recorded arm/run/provenance data, labels the assessment and proposes one bounded next step with `AUTO-RUN: DISABLED`; it does not invent results or variants. The Phase 3/4 Spacetime Navigator is a parked specification only; no time slider, split-screen world or future prediction is connected. Gemini proposals for bio-quantum, wildfire, grid, toxic dispersion and FEA remain PARK until independently validated.
