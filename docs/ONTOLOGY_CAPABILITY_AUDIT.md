# Genesis Scientific Ontology — LIVE Capability Audit

Date: 2026-08-27. Source of truth: current Genesis code on `manus/high-fidelity-epidemic-digital-twin`, LIVE HEAD `b40b914`, with CI `33036353005` green. The Gemini ontology is treated as a capability map, not as an implementation backlog.

> `MODEL_AVAILABLE` is not the same as `CONNECTED`. `NOT_MODELED` is an intentional honesty status, not a failure.

## Decision rubric

| Status | Meaning in Genesis | Required evidence |
|---|---|---|
| `FULLY_CONNECTED` | Science Chat request is parsed into the existing Fabric, confirmation executes a real deterministic model, result carries provenance, and an honest lab/world route exists | Parser + registry + executor + route + tests/proof |
| `CONNECTED` | The main request path is wired, but one product surface such as formal protocol UX or visual proof remains partial | Real run and provenance exist; remaining gap is explicit |
| `PARTIAL` | Some infrastructure or model exists, but the full chat-to-result-to-evidence path is incomplete | Registry, seam, or isolated UI only |
| `MODEL_AVAILABLE / NOT_CONNECTED` | A solver/model seam or backend contract is present, but it is not executable in the current browser product | Explicit non-executable adapter status; no fabricated output |
| `NOT_MODELED` | No admissible model/solver is available in the current contract | Parser must not invent a result; return a limitation/status |
| `EDUCATIONAL` | Visualization or thought experiment is real as a bounded model, but must not be presented as a real-world forecast or technology | Limitation shown in result and provenance |
| `VERIFY_REQUIRED` | Integration may be possible only after source, license, runtime, or scientific validation | No automatic integration |

## Connected ontology capabilities

| Ontology capability | LIVE status | Existing model/route | Boundary |
|---|---|---|---|
| Epidemics | `FULLY_CONNECTED` | `epidemic-city` → `#/hf-slice` | Deterministic synthetic agent city; not a real-world forecast |
| Earthquake | `FULLY_CONNECTED` | `earthquake-scenario` → City3D live-world path | Scenario mapping only; structural damage `NOT_MODELED`; no real GIS/building inventory |
| Relativity / Minkowski | `FULLY_CONNECTED` + `EDUCATIONAL` | `spacetime-minkowski` → Space-Time Lab | Bounded 1+1D diagram and observables; not a time machine |
| Schwarzschild radius | `FULLY_CONNECTED` | `einstein-schwarzschild` → Einstein Lab | Non-rotating, uncharged metric calculation; not observational inference |
| Schwarzschild geodesics | `FULLY_CONNECTED` + `EDUCATIONAL` | `einstein-schwarzschild-geodesic` → Einstein Lab | Bounded photon path; no Kerr or full ray tracer |
| c-Slider | `FULLY_CONNECTED` + `EDUCATIONAL` | `spacetime-c-slider` → Space-Time Lab | Hypothetical value of c; physical constants are not changed |
| Relativistic particle energy | `FULLY_CONNECTED` | `particle-relativistic-energy` → Particle Lab | Free-particle E=γmc²; not a collider or detector |
| Stellar scaling | `FULLY_CONNECTED` + `EDUCATIONAL` | `universe-starlife` → Universe Lab | Scaling relation; not full stellar evolution |
| Galaxy rotation curve | `FULLY_CONNECTED` + `EDUCATIONAL` | `universe-rotation-curve` → Universe Lab | Analytic disk + halo/MOND alternative; no named-galaxy fit or CDM-vs-MOND verdict |
| Galaxy collision | `FULLY_CONNECTED` + `EDUCATIONAL` | `universe-galaxy-collision` → Universe Lab | Restricted Toomre–Toomre model; not full N-body, hydrodynamics or real merger reconstruction |
| Tesseract geometry | `FULLY_CONNECTED` + `EDUCATIONAL` | Existing Mathematics/Universe lab route | Exact geometry visualization; does not prove physical extra dimensions |
| Chemistry / Arrhenius | `CONNECTED` for bounded local model | Existing deterministic chemistry route | Model result is not a laboratory measurement or reaction prediction |
| Discovery / experiment protocol | `CONNECTED` | Existing Experiment Fabric, scientific executor, evidence pack and counterfactual modules | UI remains partial: protocol must be explicitly designed; capsules correctly show `PROTOCOL_REQUIRED` / `VARIANT_REQUIRED` |

## Partial, model seams, and blocked ontology areas

| Ontology capability | LIVE status | Evidence in code | CTO decision |
|---|---|---|---|
| Formal Evidence Pack UX | `PARTIAL` | `ScientificEvidencePack`, RO-Crate and protocol executor exist; ordinary confirmed capsules remain honest | Improve protocol UX before adding another science domain |
| A/B and counterfactual UX | `PARTIAL` | Deterministic comparison exists for compatible real runs | Require explicit second variant; never synthesize one automatically |
| Discovery Timeline | `EDUCATIONAL` / `NOT A SOLVER` | Narrative visualization exists | Keep outside solver and evidence claims |
| Flood | `NOT_MODELED` or `MODEL_AVAILABLE / NOT_CONNECTED` | No admitted connected flood solver in LIVE route registry | Do not fake flood impacts; only add after a validated deterministic model exists |
| Wildfire | `NOT_MODELED` | No connected scientific model and no approved data contract | Park |
| Water quality / environmental chemistry | `MODEL_AVAILABLE / NOT_CONNECTED` | Possible chemistry/backend seams do not constitute an environmental solver | Require data schema, source, timestamp, license and provenance first; no operational toxic-release guidance |
| Structural engineering / FEA | `MODEL_AVAILABLE / NOT_CONNECTED` | External solver seams are non-executable without validated runtime | Do not claim structural damage in Earthquake |
| Chemical kinetics beyond existing bounded route | `PARTIAL` / `VERIFY_REQUIRED` | Existing local models and external seams have different evidence levels | Keep claims model-bounded; no laboratory or industrial prediction |
| CFD / energy systems / radiation / climate | `MODEL_AVAILABLE / NOT_CONNECTED` | External adapters and manifests exist but do not execute locally | Keep as explicit non-executable seams |
| Drug discovery / aging biology | `MODEL_AVAILABLE / NOT_CONNECTED` | Data-backed DepMap seam and backend contracts exist | Require validated data artifacts and backend execution; no patient/therapeutic claims and no automatic molecular design |
| Kerr full 3D/4D | `NOT_MODELED` | No admitted connected Kerr renderer/solver | Park |
| Collider / Matrix / second renderer/world | `VERIFY_REQUIRED` / `PARKED` | Conflicts with one-renderer/one-world architecture | Forbidden until separately approved |
| GIS, OSM/DEM, live external data | `VERIFY_REQUIRED` / `PARKED` | Import seams require complete provenance/licensing/security design | No live fetch in current Genesis contract |
| Wormholes, grandfather paradox, physical time travel | `EDUCATIONAL` only if later bounded | No physical solver or evidence basis | Keep hypothetical and outside real solver path |

## Newly supplied Gemini capability proposals

| Proposal | LIVE classification | Minimum admissibility gate | Decision |
|---|---|---|---|
| Singlet-oxygen / photochemistry | `MODEL_AVAILABLE / NOT_CONNECTED` | Validated molecular input, quantum-chemistry runtime, solvent/photophysics assumptions, provenance and non-operational safety review | Park; do not add a parser card as if it were a solver |
| QM/MM drug docking / binding affinity | `MODEL_AVAILABLE / NOT_CONNECTED` | Licensed protein/ligand inputs, validated structure preparation, reproducible runtime, uncertainty and scientific review | Park; negative ΔG is not equivalent to “the drug works” |
| CRISPR off-target / DNA thermodynamics | `MODEL_AVAILABLE / NOT_CONNECTED` | Explicit sequence scope, validated reference/guide data, safe computational contract and review | Park; no wet-lab protocol or biological efficacy claim |
| Wildfire / Rothermel or front propagation | `MODEL_AVAILABLE / NOT_CONNECTED` | DEM and fuel-model licensing, weather provenance, validated solver runtime, uncertainty and no live GIS fetch | Park until data and solver are independently admitted |
| Power-grid cascading failure | `NOT_MODELED` / `MODEL_AVAILABLE` only as seam | Operator-approved topology, secure data boundary, power-flow/cascade solver, validation and threat model | Park; never invent grid topology or outages |
| Atmospheric toxic dispersion | `NOT_MODELED` / `MODEL_AVAILABLE` only as seam | Validated meteorology and substance schema, safety review, controlled non-operational scope and provenance | Park; do not expose operational release instructions |
| Structural FEA | `MODEL_AVAILABLE / NOT_CONNECTED` | Geometry/mesh/material licensing, validated CalculiX/Code_Aster runtime, boundary-condition review | Park; Earthquake structural damage remains `NOT_MODELED` |

The proposals are useful as ontology and future package requirements, but none is an ACCEPT candidate for the current browser LIVE. They must enter later as a small, isolated handoff package with full source/solver/data metadata, tests and an explicit `ACCEPT` or `ADAPT` decision. The package itself must never be auto-merged.

## Priority decision

The ontology audit finds no justification for implementing another disconnected solver immediately. Genesis already has the shared Science Chat → Fabric → confirmation → real run → provenance → lab/world path across multiple domains. The highest-value gap is **protocol UX and repeatable Evidence/A-B proof**, followed by visual regression proof of the connected routes. A new environmental or engineering domain should be considered only after its model, input data, solver runtime, uncertainty, route, and evidence contract are all independently admissible.

## Non-negotiable execution order

`AUDIT → reuse existing model → minimal integration → tests → TypeScript → lint → production build → Chromium proof → CI → clean branch → update roadmap`.

No ontology entry may be upgraded from `MODEL_AVAILABLE / NOT_CONNECTED` to `CONNECTED` merely because a parser phrase or marketing card exists. The upgrade requires a real executed result, provenance, honest limitations, and a verified visualization or lab route.
