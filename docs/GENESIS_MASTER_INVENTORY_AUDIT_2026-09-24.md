# Genesis master inventory audit — 2026-09-24

Audit base: `78af89156166ae7b32c5e9537876874ff811e8ac` on `codex/genesis-final-integration`.

## Executive verdict

Genesis already contains a substantial set of deterministic scientific models, 2D/3D visualizations, Evidence/Replay infrastructure and several complete product routes. The master inventory must not be read as a list of finished user-facing features. It mixes four different states:

1. product-connected capability;
2. tested engine or scene that is not reachable through the main product journey;
3. prototype/proposal with an honest epistemic label;
4. concept or external dependency.

The highest-value next change is not another solver or world. It is one admitted Physics Universe catalogue and a thin orchestration seam from the existing Science Chat to the existing Experiment Fabric, lab scene, Evidence and Replay. This removes the false impression of dozens of unrelated demonstrations without duplicating the kernel, renderer, registry, ledger or replay system.

## Repository checkpoint (§8)

| Check | Result | Evidence / action |
|---|---|---|
| Package barrels | PARTIAL | Root barrels exist for `core` and `csrn`. They do not exist for `ui`, `frontend`, `backend` or `e2e`. App packages do not necessarily need public barrels, but `ui` does if it is meant to be consumed as a package. |
| `genesis-packages.manifest.json` | PARTIAL | `node scripts/verifyGenesisPackages.mjs` reports `ALL_PACKAGE_FILES_PRESENT` and `MANUS_VERIFY: FILES_OK`. Its `targetBranch` still points to `claude/genesis-winner-gate-audit-qgf90v`, so it is not a current integration manifest. |
| `@genesis/core` / `@genesis/ui` aliases | PARTIAL | Frontend TypeScript and Vite define `@genesis/core`; no `@genesis/ui` alias exists. Some UI code is imported through relative paths. |
| Required scripts | PARTIAL | Root `validate:e2e` exists. Root `check:secrets` and `inject:headers` scripts do not. |
| Proprietary headers | FAIL as a repository-wide invariant | About 160 of roughly 2301 TS/TSX/JS/MJS files contain a recognizable copyright/SPDX/proprietary header. There is no repository-wide enforcement proving complete coverage. |
| Single `/cyber` kernel | PASS for the audited canonical paths | Existing decisions and integrity tests explicitly prevent a second kernel/ledger for the integrated routes. Isolated lab simulations still own local render/update loops; they are not a second scientific kernel. |
| Approval gates | PASS where declared | `ActionGateSynthesizer` has no execute path; learning/publication and governed assets require explicit approval. |
| Epistemic labels | PARTIAL | Strong labels exist on audited CERN, speculative physics, human and experiment paths. There is no single admission matrix proving every route uses the same vocabulary. |
| Playwright / artifacts | PASS, with hygiene caveat | Playwright E2E and artifacts exist. Generated artifact directories are present locally and must remain outside release commits unless explicitly admitted. |
| Standard `NOT_IMPLEMENTED` report section | FAIL | The concept appears in prose, but there is no enforced report schema across capabilities. |

## Physics Universe coverage

Status meanings:

- **CONNECTED** — parsed/routed through the canonical Experiment Fabric or an explicit public route.
- **EXISTS** — tested model or visualization exists, but the one-Chat/product journey is incomplete.
- **THEORETICAL/PROTOTYPE** — intentionally bounded theoretical or proposal code; it must not be presented as demonstrated technology.
- **MISSING** — no product-grade implementation was established by this audit.
- **EXTERNAL** — requires a runtime, dataset or hardware not currently admitted.

| Roadmap area | What is present now | Honest status |
|---|---|---|
| Time and relativity | Lorentz/time dilation, twin/light-cone 3D, Minkowski, Schwarzschild radius and RK4 null geodesics, point lensing, Kerr 3D/equatorial model, gravitational chirp, relativistic particle energy | Mostly **CONNECTED**. Some scenes still own separate HUD/camera loops and do not yet enter one shared Physics Station experience. |
| Time machine / extreme spacetime | Alcubierre is described as a hypothesis; wormhole language routes to a scenario/Reality Navigator or claim classifier. Speculative warp/torsion/retrocausal solvers and mathematical/cinematic time-machine code exist | **THEORETICAL/PROTOTYPE**. No physical time machine, experimentally validated wormhole transport, CTC apparatus, Tipler cylinder, chronology protection simulator or grandfather-paradox engine is established. |
| Black holes | Schwarzschild and Kerr visuals, photon paths/geodesics, point lensing, event-horizon shader, accretion image treatment, observer/camera views | Core subset **CONNECTED/EXISTS**. Black-hole mergers and a fully observer-relative infall experience are not established as one canonical end-to-end experiment. |
| Classical mechanics and chaos | Three-body, double pendulum, Lorenz, Kepler/solar system, planet stability, collisions and orbital consequence models | Mostly **CONNECTED**, but presentation is split among lab cards and dedicated scenes. General N-body and broad planetary-system evolution are not established as admitted product capabilities. |
| Space and cosmology | Expansion/Hubble law, Hubble tension, galaxy collision, rotation curves/dark-matter comparison, star-life scaling, solar system, atmospheric escape, alternative-star scenarios | Mixed **CONNECTED/EXISTS**. Big Bang evolution, general galaxy formation, supernova dynamics and a predictive dark-energy engine are not established. Alternative civilizations remain scenarios/models. |
| CERN / particles | Toy Monte Carlo collider with explicit label, detector/tracks, invariant mass, relativistic energy, CERN 3D complex, checksum-pinned CMS 2011 Z→μμ Open Data route and replay | **CONNECTED** for toy/CMS scope. PYTHIA, Geant4, live LHC, full ATLAS/ALICE/LHCb, precision QCD, Higgs/QGP/BSM searches and detector-grade anomaly detection are **EXTERNAL/MISSING**. |
| Quantum mechanics | Double slit, tunnelling via split-step FFT, Bloch sphere/circuits, CHSH, teleportation, Kitaev bulk, entanglement measures, deterministic local OpenQASM simulator and optional fail-closed cloud QPU adapter | Mixed **CONNECTED/EXISTS**. Decoherence as a full admitted experiment, Schrödinger-cat product experience, dedicated no-cloning/no-communication experiments and configured hardware QPU are incomplete or **EXTERNAL**. |
| Nuclear physics | Nuclide chart, decay, SEMF/binding energy, chain reaction visualization, Lawson/tokamak model and consequence graph | Mostly **CONNECTED/EXISTS**. It is educational/computational, not reactor or fusion-hardware telemetry. |
| Electromagnetism | Photon energy plus registered PyMeep FDTD transmission/reflection models | FDTD execution may exist through an external runtime, but both routes have `route: none`; fields, coils, induction, resonance, antennas and a coherent 3D EM station are **MISSING** as a product journey. |
| Multidimensional / multiverse | Tesseract, alternative-star scenarios, Multiverse Nexus/Reality Navigator and branching scenarios | **CONNECTED** as mathematics/scenario exploration. Physical multiverse travel is not claimed. |
| Earth physics / disasters | Earthquake vertical slice, seismic/city consequence route, flood/weather/city-domain infrastructure and resilience work | Earthquake and selected city paths **CONNECTED**; a general geophysics universe is not complete. |
| Water / environment | Pump-pipe model, hydraulics/world-model bridge, water rendering and selected flood/infrastructure domains | **EXISTS/PARTIAL**. Dissolved oxygen, aeration, contaminant transport, mixing, thermal water model and general CFD are not a finished product path. |

## Other master-inventory claims

### Confirmed as real code, but not automatically a finished product

- Supreme, 9D, cognitive, native orchestration, knowledge, evidence and safety packages have substantive code and tests.
- CERN engines and visual modules exist, with explicit toy/speculative/real-data boundaries.
- Human Explorer is now materially stronger: the BodyParts3D pilot provides governed CC BY 4.0 heart, liver, left/right lung and aorta GLBs with desktop/mobile LOD, picking, isolation, GHOST and provenance.
- Chemistry has a large data/model surface and current lab experiments; `LIVE_VERIFIED` for every dataset or claim is not proven by the inventory alone.
- Candidate Discovery, Virtual Lab, Evidence and Replay have canonical implementations. Their unified investor journey has improved, but not every domain shares the same end-to-end UI.

### Names that were not verified as current canonical modules

The audit did not establish the exact listed modules `cityEngine/Renderer/Controller`, `matrixStatus`, `armLabelMapping`, `paycheckEngine`, `HardwareVizScene`, `PaycheckMachineView`, `TaxVatIntelligenceEngine`, `AssetLicenseRegistry`, or the named D-135 adapter suite. Related functionality may exist under different current modules. These names must remain **UNVERIFIED/PROPOSED** until a source path and product route are supplied.

### Known correctness and product limits

- The five BodyParts3D pilot structures are aligned correctly. The remaining legacy procedural organ proxies are rotated relative to the bodies; this must be corrected or hidden before presenting mixed anatomy as accurate.
- Many mature lab simulations use their own canvas, camera, controls and HUD. Their science can be reused, but visually placing all of them into the main laboratory requires adapters rather than merely linking routes.
- A generated cinematic or attractive shader is not a scientific solver. A solver result must remain the state source for every “live experiment” label.
- Runway/Sora-style video can support explanatory films, not replace replayable solver-driven visualization or count as experiment evidence.

## Highest-value work now

1. Add one machine-readable Physics Universe capability catalogue. It must point only to existing router model IDs/routes and expose epistemic class, visual mode, Evidence/Replay support and readiness.
2. Make Science Chat use that catalogue for the investor reference prompts instead of bespoke text/link branches.
3. Bind four existing reference flows to the main Physics Station: Schwarzschild photon/geodesic, three-body chaos, theoretical wormhole scenario and CMS Open Data.
4. Show one compact status card and one primary action. Keep parameters/graphs/provenance under expanded/research controls.
5. Add a capability-admission test that fails when a Chat claim says “available” but the catalogued model has no executable route.

Do not build more speculative time-machine solvers, another renderer, another event bus, another Evidence system, or dozens of new scene buttons in this pass.

## Recommended Claude assignment

Claude should implement one bounded integration package on top of the current integration branch. The requested output is a branch and commits, not pasted “PROPOSED” files.

### Scope

Create **Physics Universe Orchestration V1** using the existing Experiment Fabric, Science Chat, Laboratory/Physics Station, World routes, Evidence and Replay.

Reference journeys:

1. “Pokaż tor fotonu wokół czarnej dziury” → `einstein-schwarzschild-geodesic` → existing Einstein scene.
2. “Pokaż problem trzech ciał i przyspiesz czas 100×” → `universe-three-body` → existing Universe scene; speed is presentation control and must not change solver semantics silently.
3. “Pokaż przejście przez wormhole” → existing Reality Navigator/scenario route with a prominent `THEORETICAL MODEL` label; never claim a physical machine.
4. “Pokaż prawdziwe dane CERN” → existing checksum-pinned CMS Z→μμ route, clearly `EXTERNAL / REAL OBSERVATION DATA` and offline.

Deliverables:

- one canonical catalogue, for example `physicsUniverseCatalog.ts`, mapping intent aliases to existing model/route IDs, epistemic label, execution status, visual adapter status, Evidence/Replay availability and limitations;
- a thin Science Chat resolver that consumes the catalogue;
- one compact Physics Station contextual UI in the existing main laboratory;
- no new solver, renderer, registry, ledger, replay service or world;
- a fail-closed `NOT_IMPLEMENTED` result for roadmap prompts without an admitted model;
- focused unit tests for catalogue truth and routing;
- one screenshot-free Chromium E2E proving Chat → Physics Station/scene → result → Evidence/Replay for an executable case, plus theoretical and unsupported classification checks at desktop and one mobile viewport;
- report exact reused modules, changed files, base/final SHA, tests and remaining unsupported roadmap items.

### Acceptance rule

The work is accepted only if every “available” capability resolves to an existing registered model or explicit current route, and no theoretical scenario is labelled as a real experiment or technology.

## Work that should not consume more credits now

- Full BodyParts3D atlas beyond the validated five-structure pilot.
- More standalone physics demos before orchestration exists.
- Physical time-machine claims or detailed “machine construction” UI.
- Full PYTHIA/Geant4/LHC stack without admitted runtimes and datasets.
- Broad UI polishing of hidden government, cyber, tax or prototype screens.
- Rewriting working solvers merely to move them into a new folder.
