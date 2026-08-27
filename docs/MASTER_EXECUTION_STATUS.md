# Genesis Master Execution Status

## Current product decision

Genesis is being advanced as one **Scientific Discovery OS**, not as a collection of disconnected demos. The execution rule is one capability at a time:

`Science Chat → StructuredExperimentRequest → confirmation → existing model/solver → result → visualization/lab/world → provenance → honest Evidence/Replay status`

Every milestone must pass tests, TypeScript, lint, production build, Chromium smoke, GitHub Actions and clean-state publication before the next milestone begins.

## Connected milestones on LIVE

| Capability | Status | Real route/model | Honest boundary |
|---|---|---|---|
| Epidemic city | DONE for current integration contract | `epidemic-city` → `#/hf-slice` | Deterministic synthetic city; not a real-world forecast. Evidence protocol and counterfactual require explicit setup. |
| Earthquake | DONE reference vertical slice | `earthquake-scenario` → existing City3D live-world path | Scenario mapping; structural damage is `NOT_MODELED`; no real GIS or building inventory. |
| Minkowski 1+1D | DONE bounded lab flow | `spacetime-minkowski` → Space-Time Lab | Diagram and observables in bounded 1+1D; not a time machine. |
| Schwarzschild geodesic | DONE bounded lab flow | `einstein-schwarzschild-geodesic` → Einstein Lab | Photon geodesic model; no Kerr, no full ray tracer, no time travel. |
| c-Slider | DONE bounded lab flow | `spacetime-c-slider` → Space-Time Lab | Thought experiment with hypothetical c; does not alter physical constants. |
| Particle energy | DONE bounded lab flow | `particle-relativistic-energy` → Particle Lab | Free-particle E=γmc² graph; not a collider or detector experiment. |
| Stellar scaling | DONE bounded lab flow | `universe-starlife` → Universe Lab | Scaling relation with explicit simplifications; not full stellar evolution or prediction. |

## Partial or not connected yet

| Area | Status | Decision |
|---|---|---|
| Formal Evidence Packs | PARTIAL | Current capsules honestly return `PROTOCOL_REQUIRED` unless a protocol exists. Do not fabricate packs. |
| A/B and counterfactual UX | PARTIAL | Available only where two real, compatible runs exist; otherwise `VARIANT_REQUIRED`. |
| Science Chat visual proof for `#/hf-slice` | PARTIAL | Parser, confirmation and handoff are tested; one browser session lost its document during navigation. Repository smoke passes route sweep, but no screenshot claim is made from that session. |
| Discovery Timeline | NOT A SOLVER | Keep as narrative visualization until a separately bounded model contract exists. |
| Wormholes, grandfather paradox, physical time travel | PARKED | Unsupported or hypothetical; keep outside real solver path. |
| Kerr full 3D / 4D or 5D claims | PARKED | Add only with a separately validated model and explicit limitations. |
| Collider / Matrix / second renderer or world | PARKED | Forbidden until architecture and value case are separately approved. |
| GIS, OSM/DEM, live external data | PARKED | Requires provenance, licensing, ingestion and security design; no live fetch in current Genesis contract. |

## Current LIVE HEAD

The latest published code commit is `3faa004` on `manus/high-fidelity-epidemic-digital-twin`. The latest CI for that commit is `33035127921` and is green. Subsequent docs and bounded capability commits must update this section when published.

## Next CTO gate

Before implementing a new domain, perform a repository audit and answer: Does an existing real model already exist? Does the parser and router expose it? Does confirmation preserve one result and provenance? Is there an honest visualization or lab route? Can the limitations be shown to the user? If any answer is no, document the blocker rather than creating a parallel framework.
