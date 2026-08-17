# Genesis 2030 — Master Architecture, Roadmap & Backlog

> Status of this document: **DESIGN** (architecture + roadmap). It plans work;
> it does not itself claim implemented features. Every capability below is
> tagged with a real status verified against the current repository. Nothing in
> the existing Genesis is removed — the plan is strictly **additive**.

## 0. Vision (unchanged, maximal)

Genesis → an **AI Scientific Operating System**:

```
USER → SCIENCE CHAT → SCIENTIFIC INTENT → PROBLEM DECOMPOSITION → KNOWLEDGE
     → HYPOTHESES → MODEL SELECTION → EQUATIONS → EXPERIMENT DESIGN
     → COMPUTE ORCHESTRATOR (CPU/GPU/HPC/QUANTUM) → LIVE SIMULATION
     → VISUALIZATION → RESULT → VERIFICATION → ANALYSIS → SCIENTIFIC MEMORY
     → NEXT EXPERIMENT → (COLLABORATION) → SCIENTIFIC DISCOVERY
```

The epistemic layer is non-negotiable at every step:
**FACT · DATA · MODEL · ASSUMPTION · HYPOTHESIS · SIMULATION RESULT · INTERPRETATION · SPECULATION.**

## 1. Master architecture (additive, registry-based)

The core stays small; everything plugs into registries. Existing pieces reused, not rewritten:

| Layer | Contract / module (current) | Role |
|---|---|---|
| Intent | `core/scienceChat/resolveCommand.ts` (`ScientificIntent`) | TEXT → typed intent → action |
| Model graph | `core/modelGraph/*` (15 executable graphs) | equations & consequences |
| Experiments | `core/types.ts::ExperimentDef`, `registerLab/registerRecipe` | lab/experiment registry |
| Generator | `core/generator/*` | NL → recipe → engine |
| **Visual Scene Engine** | `core/simulation/`, `core/world/`, `core/agents/`, `core/interactions/`, `core/interventions/`, `core/simulationClock/`, `core/simulationRenderer/` | model↔world↔agents↔render |
| Memory | `core/scienceMemory.ts` | reproducible saved experiments |
| Provenance / Verification | research-mode modules | evidence + reproducibility |
| Sim context | `core/simContext.ts`, `core/activeSimControls.ts` | live control bridge |

**Universal seam:** `core/simulation/types.ts::VisualSimulation` — any future model
(traffic, ecosystem, cells, particles) implements it and reuses the same renderer,
camera, clock and UI. `SimAgent` already carries generic fields
(state, position, velocity, goal, behavior, age/role/gait) so `VisualAgent`
covers human/animal/vehicle/cell/particle without engine changes.

Registries to formalize next (design): `ModelRegistry`, `ExperimentRegistry`,
`SolverRegistry`, `SceneRegistry`, `ComputeAdapter`, `DataConnector`.

## 2. Roadmap — 12 phases with real status

Legend: **DONE** (code+test+build+e2e), **PARTIAL**, **NOW** (buildable next),
**LATER** (moderate dev), **INFRA** (needs external infrastructure), **FUTURE**.

| Phase | Theme | Status | Evidence / next step |
|---|---|---|---|
| 0 | Audit | **DONE** | corpus reconciled vs code; Bell/CHSH, GR lensing, relativistic clocks, E=mc², ModelGraph all EXIST |
| 1 | Scientific Chat | **DONE** | `resolveCommand` + typed `ScientificIntent` (17 intents), 663+ tests |
| 2 | Generative Experiment Engine | **DONE** | generator catalog + NL→recipe; PROPOSE_EXPERIMENT live |
| 3 | Live Visual Simulation | **DONE** | Visual Scene Engine + city ABM; acceptance test R₀ 1.5 vs 3.0 passes |
| 3b | **Visual Fidelity** | **DONE** | AgentVisual humans, camera (zoom/pan/follow), person inspect, hospital, LOD |
| 4 | Agent-based World | **PARTIAL** | city + airport ABMs exist; NOW: multi-zone → multi-place → transport (aircraft/bus) → map |
| 5 | Scientific Agent | **PARTIAL** | PROPOSE_EXPERIMENT is the seed; NOW: observe→hypothesize→run→verify loop over one parameter |
| 6 | Compute Orchestrator | **NOW (contract)** | design `ComputeJob`/`ComputeAdapter`/`LocalCPUAdapter` wrapping current engines; GPU/HPC = INFRA |
| 7 | Collaborative Science | **INFRA** | needs realtime backend (see §4); design branching/roles first |
| 8 | GPU / HPC | **INFRA** | adapter behind Compute Orchestrator |
| 9 | Quantum Cloud | **INFRA/FUTURE** | experimental adapter only; never "quantum = faster" by default |
| 10 | Scientific Discovery | **LATER** | knowledge gap → hypothesis → experiment loop; depends on 5 + knowledge graph |
| 11 | Digital Twins | **FUTURE** | real-data connectors + verified models required |
| 12 | Genesis 2030 | **VISION** | integration of all above |

## 3. Domain backlog (from Kimi/Manus corpus — additive labs)

Each is an `ExperimentDef`/`VisualSimulation` plugin; **NONE overrides existing labs.**

- **Epidemiology 2030** (PARTIAL): SIR/SEIR/SEIRD (done), agent-based city+airport (done).
  NOW → SIRS, AGE-SEIR, hospital-load/resources; LATER → network, metapopulation, island→country→world map.
- **Physics** (PARTIAL): three-body, lensing, relativistic clocks, E=mc² exist. NOW → N-body world scene, thermodynamics.
- **Quantum** (PARTIAL): CHSH, tunneling, bloch exist. NOW → full 2D double-slit + decoherence (Crank–Nicolson).
- **Chemistry** (PARTIAL): kinetics, Ising exist. LATER → molecular dynamics scene.
- **Cellular Rejuvenation / Aging Lab** (FUTURE, design below).
- **Climate / Crisis** (FUTURE): map + agents + resources; reuse Visual Scene Engine.

### Cellular Rejuvenation / Aging Lab (design only — FUTURE)

`CELL → GENOME → GENE EXPRESSION → EPIGENOME → CELLULAR STATE → TISSUE → ORGAN → ORGANISM`.
Model family: epigenetic-clock trajectory + partial-reprogramming (OSK) state transitions
as a **compartmental/ODE + agent (cells)** hybrid, rendered via the Visual Scene Engine
(cells as agents changing color/marker with expression state). **Epistemic tag: HYPOTHESIS /
MODEL — not medical advice, not a prediction of any real intervention.** Requires curated,
sourced biomarker data before any quantitative claim; until then it is an educational sandbox.

## 4. What needs infrastructure (honest)

- **Collaborative Lab (Phase 7)** — real-time shared state, roles, branching, conflict
  resolution: **WYMAGA INFRASTRUKTURY** (backend with auth + a sync channel, e.g. WS/CRDT).
  Recommended path on current stack (node http + node:sqlite backend): server-authoritative
  operation log + optimistic version checks; branching reuses `scienceMemory` content hashes.
- **GPU/HPC/Quantum (Phases 8–9)** — external compute; only the `ComputeAdapter` contract is
  buildable now.

## 5. Implementation discipline (every phase)

`AUDIT → DESIGN → IMPLEMENT → TEST → BUILD → E2E → DEMO → DOC`.
No feature is "DONE" without code + tests + build + e2e + a real demo. Mocks and
placeholders are labelled **PLACEHOLDER**, missing capability **BRAK**, partial **CZĘŚCIOWO**,
infrastructure-blocked **WYMAGA INFRASTRUKTURY**.

## 6. Immediate next steps (CTO pick)

1. **Phase 4 — transport & multi-place:** agents move city → station/airport → vehicle → city
   (reuse `VisualSimulation`, add `VisualVehicle`). Buildable now, high "wow", model-linked.
2. **Phase 6 contract — Compute Orchestrator:** `ComputeJob`/`ComputeAdapter`/`LocalCPUAdapter`
   wrapping `simulateEpidemic`/city sim; foundation for GPU/HPC/Quantum later.
3. **Model-vs-Model visual (P1):** two parallel worlds A/B (R₀ 1.5 vs 3.0) side by side.
