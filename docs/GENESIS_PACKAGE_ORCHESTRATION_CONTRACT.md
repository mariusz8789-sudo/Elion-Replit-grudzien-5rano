# Genesis Scientific Knowledge + Code Package Orchestration Contract

## Purpose

External agent material is a **handoff package**, never a source of truth. The current LIVE Genesis branch remains authoritative. A package can supply ontology, specifications, solver metadata, dataset metadata, or a small isolated code candidate, but it cannot silently redefine Genesis architecture or scientific claims.

## Intake rule

Every future ZIP is processed in this order:

`ZIP → inventory → compatibility review → duplicate detection → scientific review → security review → package ranking → ACCEPT / ADAPT / PARK / REJECT`

No package is merged automatically. The package must preserve the existing `Science Chat → StructuredExperimentRequest → confirmation → existing model/solver → result → visualization/lab/world → provenance → Evidence/Replay` path.

## Required package sections

| Section | Required content | Integration rule |
|---|---|---|
| `01_CURRENT_GENESIS` | Current capability statuses: `FULLY_CONNECTED`, `CONNECTED`, `PARTIAL`, `MODEL_AVAILABLE / NOT_CONNECTED`, `NOT_MODELED`, `EDUCATIONAL`, `PARKED` | Must be compared with LIVE; stale claims are not authoritative |
| `02_SCIENTIFIC_ONTOLOGY` | Domain, specialization, problem, model, equations, parameters, units, data, solver, output, uncertainty, limitations, visualization, Evidence, Replay, Science Chat prompt | Missing equations, units, assumptions, or limitations means `VERIFY_REQUIRED` |
| `03_SOLVER_CATALOG` | Name, purpose, input/output, license, runtime, hardware, maturity, validation, Genesis fit, difficulty, limitations | A solver name alone never makes a capability connected |
| `04_DATASET_CATALOG` | Source URL, license, format, version, update rate, coverage, size, access, provenance, validation and fit | No live data or GIS integration without a separate approved data contract |
| `05_CODE_PACKAGES` | Minimal isolated diff, dependencies, complete files, tests, command, expected result, integration, rollback and risk | Reuse/adapt existing Fabric; never add a second router, Evidence, Replay, provenance, WorldState or renderer |
| `06_GENESIS_CHAT_CAPABILITIES` | User language → domain → specialization → problem → model → parameters → solver → visualization | Status must be honest and testable; marketing text is not routing proof |
| `07_FUTURE_SCIENTIFIC_CAPABILITIES` | Future domain map with explicit model/data/runtime gaps | `MODEL_AVAILABLE ≠ CONNECTED` |
| `08_SPACETIME_LABS` | Established, model, educational, hypothetical and not-modeled labels | No claims of physical time travel or experimental proof |
| `09_DISCOVERY` | Question → hypothesis → experiment → result → compare → Evidence → Replay → why → next experiment | Evidence requires real runs and explicit protocol/variant inputs |
| `10_MARKET_AND_PRODUCT` | Problem, buyer, use case, data, solver, value, competition, monetization, pilot/grant potential and risk | Product value cannot upgrade scientific or runtime status |

## Code and science gates

A package is an `ACCEPT` candidate only when it reuses the existing architecture, has a deterministic or explicitly bounded execution contract, carries provenance, exposes limitations, has tests, and does not introduce unsafe operational guidance. It is `ADAPT` when the underlying value is valid but the interface, types, route, or evidence contract must be changed. It is `PARK` when the idea is valuable but data, solver runtime, validation, licensing, or product integration is not ready. It is `REJECT` when it conflicts with safety, provenance, licensing, scientific honesty, or the one-renderer/one-world constraint.

For bio, chemistry, quantum, and environmental proposals, Genesis may store a future capability specification, but must not imply therapeutic efficacy, wet-lab success, structural safety, environmental safety, or real-world prediction. Toxic-release, pathogen, toxin, and dangerous-material content remains non-operational and requires an additional safety review before any implementation consideration.

## Current decision for the newly supplied Gemini proposals

| Proposal | Decision | Reason |
|---|---|---|
| Singlet oxygen / photochemistry | `PARK` | Useful ontology only; no admitted local quantum-photochemistry runtime or validated input contract |
| QM/MM drug docking | `PARK` | Requires licensed protein/ligand data, structure preparation, solver execution, uncertainty and scientific review; binding score is not drug efficacy |
| CRISPR off-target / DNA thermodynamics | `PARK` | Requires bounded sequence/data contract and safe computational review; no biological efficacy claim |
| Wildfire propagation | `PARK` | Requires licensed DEM/fuel data, weather provenance and validated front solver; no live GIS |
| Power-grid cascade | `PARK` | Requires operator-approved topology, secure infrastructure data and a validated power-flow/cascade solver |
| Atmospheric toxic dispersion | `PARK` | Requires controlled safety scope and validated meteorological/substance inputs; no operational release instructions |
| Structural FEA | `PARK` | Requires geometry/mesh/material evidence and validated runtime; Earthquake structural damage remains `NOT_MODELED` |

## Genesis source-of-truth hierarchy

`LIVE code + green CI > verified local tests and Chromium proof > repository roadmap and capability registry > reviewed handoff package > agent narrative or marketing proposal`.

The only route from a future package to LIVE is:

`ACCEPT / ADAPT → minimal isolated implementation → tests → TypeScript → lint → production build → Chromium proof → CI → commit → roadmap update`.

Until every gate passes, the package remains reference material and cannot be presented as a Genesis feature.
