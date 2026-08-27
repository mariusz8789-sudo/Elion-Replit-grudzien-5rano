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
| Galaxy rotation curve | DONE bounded lab flow | `universe-rotation-curve` → Universe Lab (`rotationcurve`) | Analytic exponential disk plus pseudo-isothermal halo or MOND alternative; not a fit to any named galaxy and not a CDM-vs-MOND verdict. |
| Galaxy collision | DONE bounded lab flow | `universe-galaxy-collision` → Universe Lab (`collision`) | Restricted Toomre–Toomre two-core plus test particles; not full N-body, hydrodynamics or reconstruction of a real merger. |
| Schwarzschild radius | DONE bounded analytical flow | `einstein-schwarzschild` → Einstein Lab | Non-rotating, uncharged Schwarzschild metric calculation; not Kerr, not a ray tracer and not observational inference. |

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

The latest published code commit is `62ab2a1` on `manus/high-fidelity-epidemic-digital-twin`. The latest CI for that commit is `33036646311` and is green. The preceding visual-proof report is `b40b914`; bounded capability commits include `39ebcf3` (Schwarzschild radius), `b3dbe3e` (galaxy rotation curve), and `cd7087f` (galaxy collision), all published to the same LIVE branch with green CI. Subsequent docs and bounded capability commits must update this section when published.

## Next CTO gate

The visual-proof pass is complete for the current LIVE build. The next work item is the smallest real product gap: protocol UX for formal Evidence Packs and explicit A/B variants over existing real runs. Do not add another solver until this shared discovery path is easier to execute and inspect. Any further scientific integration must again answer: Does an existing real model already exist? Does the parser and router expose it? Does confirmation preserve one result and provenance? Is there an honest visualization or lab route? Can the limitations be shown to the user? If any answer is no, document the blocker rather than creating a parallel framework.
