# Qwen "Particle Physics / Virtual Collider" package — audit and integration record

Audited against the repository at the time of integration (branch
`claude/genesis-graphics-engine-v1-wd0r66`, merged with `main` at `60e3e27`).
Two packages arrived: a **Particle Physics** domain package and a **Virtual CERN
Laboratory** orchestrator package. They are judged separately, because their
verdicts are almost entirely opposite.

The rule applied throughout: a new **scientific domain** is welcome, a second
**engine** is not. Genesis already has one World Engine (`WorldGraph` +
`SolverRouter`), one Temporal Engine, one Scenario Engine, one Matrix, one
Scientific Memory, one Replay, one Chat command layer and real Three.js
renderers. Nothing in either package was allowed to grow a second one.

---

## 1. Verdicts — Particle Physics package

| Element | Verdict | Reason |
|---|---|---|
| `kinematics.ts` (four-vectors, invariant mass, two-body momentum, boost, eta/phi) | **ACCEPT** | Real relativistic kinematics. No equivalent existed anywhere in this repo. Integrated into `core/worldModel/domains/particlePhysics.ts`, with `null` returns kept for spacelike/forbidden cases rather than coerced zeros. |
| `particleData.ts` (PDG masses/widths) | **ACCEPT (trimmed)** | Published, citable constants. Only the three this domain actually uses were kept — Z mass, Z width, muon mass — rather than importing a species table nothing reads. |
| Breit-Wigner line shape | **ADAPT** | Kept, but rewritten to the standard *relativistic* form and normalised to 1 at the pole, so it is explicitly a relative weight across energies and can never be mistaken for a cross-section. Qwen's version carried a self-cancelling normalisation expression. |
| `detector.ts` (Gaussian resolution, flat efficiency, eta acceptance) | **ADAPT** | Kept as physics, dropped as a per-event stochastic pass. Resolution now enters through a real Gaussian window integral (`massWindowFraction`, A&S 7.1.26 erf) and acceptance through `tanh(etaMax)`, the closed form for an isotropic decay. |
| `experimentRunner.ts` (per-event Monte Carlo run loop) | **ADAPT → `DomainSolver`** | Replaced by a deterministic expected-yield accumulator. Reason is structural, not stylistic: `domainState` is plain numeric state that gets diffed into the delta log and **shared by reference between a branch and its fork**. A PRNG stream in domain state would make two forks silently diverge — the exact failure `quantumTunneling.ts` already documents avoiding. Same physics, no stochastic stream, forks bit-identical by construction. |
| `determinism.ts` — `fnv1a`, `canonical`, `cmpStr` | **REJECT_DUPLICATE** | `core/events/hash.ts` already exports `fnv1a` and `canonicalJson`. |
| `determinism.ts` — `mulberry32` | **REJECT_DUPLICATE** | Already in `core/worldModel/generation/worldBlueprint.ts` — and unneeded here anyway, see the row above. |
| `statistics.ts` (mean/variance/histogram/quantile) | **REJECT_UNUSED** | Nothing in the integrated domain needs them. Adding a statistics module no caller imports is dead weight, not capability. |
| `adapters.ts` — `MatrixPort` | **REJECT_DUPLICATE** | `core/agent/matrixRelations.ts` already derives relations from real saved records, and only where a concrete field proves the edge. |
| `adapters.ts` — `MemoryPort` | **REJECT_DUPLICATE** | `core/scienceMemory.ts`. The domain reaches it for free through the discovery loop. |
| `adapters.ts` — `ChatPort` / `dispatchChat` | **REJECT_DUPLICATE** | `core/scienceChat/resolveCommand.ts` is the one command layer. One branch added there, no parallel dispatcher. |
| `adapters.ts` — `RendererPort` / `ParticleEventSceneDescription` | **REJECT_DUPLICATE** | Genesis has real renderers and `graphics/ADAPTER_CONTRACT.md` for exactly this seam. The domain publishes an allowlisted `statusLabel` (`OFF_PEAK`/`NEAR_PEAK`/`ON_PEAK`) as that contract requires; it does not ship a scene format. |
| `adapters.ts` — `ScenarioPort` / `toScenarioCoordinate` | **REJECT_DUPLICATE** | `scenarioEngine.ts` (720 lines) and `temporalEngine.ts` already own scenario and time. The domain is advanced by `SolverRouter.routeTick` like every other domain, so it inherits both. |
| `adapters.ts` — `Engine01Port` / information gain | **REJECT_DUPLICATE** | The existing discovery loop already selects the next experiment; `researchChain.ts` already chooses the next question. |
| `compareThreeWays` (prediction vs simulation vs observation) | **REJECT_DUPLICATE** | `predictionVerification.ts` + `evaluateTwoArmRelation` already do this against a *preregistered* criterion, which is stricter and already wired into Evidence and Memory. |
| `parseCsvObservations` (OBSERVED provenance) | **REJECT_DUPLICATE** | `core/dataProvenance.ts` owns the provenance axis and `RealExperimentPipeline.tsx` owns real-measurement entry. |
| DESIGN-LEVEL test suite | **ADAPT** | Rewritten as 28 real vitest cases that execute. Notably the conservation claims are now *checked* (exact two-body decay, on-shell daughters, momentum summing to zero) rather than asserted in prose. |

## 2. Verdicts — Virtual CERN Laboratory package

| Element | Verdict | Reason |
|---|---|---|
| `world.ts` — facility hierarchy, entities, ring model | **REJECT_DUPLICATE** | A second world builder with its own entity type. Genesis has `WorldGraph` + `WorldModelEntity`. |
| `world.ts` — `cameraAnchors`, `navigationPath` | **REJECT_DUPLICATE** | `graphics/cameraRig.ts` and `graphics/cinematicCamera.ts` already exist and are used by the production scenes. |
| `world.ts` — `VirtualCernSceneDescription` | **REJECT_DUPLICATE** | A third scene format. See the renderer row above. |
| `accelerator.ts` — beam state machine | **REJECT_SCOPE** | Not physics: an operational state machine (`OFF → INJECTION → ... → COLLIDING`) with no measurable consequence in the model. It would be UI state pretending to be a domain. |
| `event.ts` — `PlaybackController` | **REJECT_DUPLICATE** | Playback/scrubbing belongs to the Time transport over `temporalEngine.ts`, which is C2's own assigned lane. |
| `timeScenario.ts` — `TimeState`, `ScenarioSpec` | **REJECT_DUPLICATE** | `temporalEngine.ts` (336 lines) and `scenarioEngine.ts` (720 lines). |
| `orchestrator.ts` — `VirtualCernLabOrchestrator` + `TRANSITIONS` | **REJECT_DUPLICATE** | The single largest duplication in the package: a parallel app state machine, command dispatcher and port-wiring layer sitting above every existing Genesis engine at once. |
| `SIMULATION_TO_EVIDENCE = { allowed: false }` | **ACCEPT (as principle, already enforced)** | The rule is right and Genesis already enforces it structurally: `dataProvenance` separates `SIMULATED`/`REFERENCE`/`REAL_EXPERIMENTAL`, and only a real or cited measurement entered through the real-experiment path can carry the non-simulated tag. No constant needed to restate it. |

## 3. What was actually integrated

Two files, plus one line in the catalogue registry and one chat branch:

- **`core/worldModel/domains/particlePhysics.ts`** — a real collider-run domain
  on the existing WorldGraph: relativistic kinematics, exact two-body decay,
  relativistic Breit-Wigner, Gaussian mass-window integral, `tanh(etaMax)`
  acceptance, and a `DomainSolver` that accumulates deterministic expected
  yields, publishing `signalCandidates`, `backgroundCandidates`,
  `signalToBackground` and `significance` as real observations at
  `MODEL_ESTIMATE`.
- **`core/agent/particlePhysicsLeverCatalog.ts`** — four levers (beam energy,
  momentum resolution, acceptance, luminosity) so the **existing** Discovery
  Loop can run real searches on it.
- **`core/agent/worldGoalIntent.ts`** — one entry in `WORLD_LEVER_CATALOGS`.
  The Discovery panel's world dropdown is rendered from that registry, so the
  collider appears in the existing UI with **no UI change at all**.
- **`core/scienceChat/resolveCommand.ts`** — one NL branch routing to the
  existing screen that hosts the panel.

### The science this makes discoverable

The four levers deliberately do not all move the same figure of merit, and that
asymmetry is the real content:

| Lever | Signal | Background | S/B | S/√B |
|---|---|---|---|---|
| Tune onto the Z pole | ↑↑ (line shape) | unchanged | **↑↑** | ↑↑ |
| Sharpen momentum resolution | ↑ (more peak in window) | unchanged | **↑** | ↑ |
| Widen |eta| acceptance | ↑ | ↑ by the same factor | **exactly unchanged** | ↑ |
| Raise luminosity ×4 | ×4 | ×4 | **exactly unchanged** | ×2 |

So a goal phrased about *purity* and a goal phrased about *significance* have
genuinely different answers on the same apparatus, and two of the four levers
are provably inert against a ratio — for a stated statistical reason, not a
modelling gap. This is verified by test, not asserted.

## 4. Honest limits, carried in the domain and in the catalogue

- Yields are **arbitrary normalised units, not picobarns**. Only ratios between
  arms are meaningful. Nothing here may be reported as a cross-section.
- Background is a **declared flat continuum**, never fitted to data.
- Z mass and width are **PDG published values (REFERENCE)**, not measured here.
- No initial-state radiation, beam energy spread, pile-up or trigger model; one
  Gaussian resolution and one flat efficiency inside a hard `|eta|` edge.
- Significance is the simple `S/√B` counting form, valid for `B >> 1` — not the
  Asimov formula, which would imply a calibration this model does not have.
- Every verdict is statistical only; systematic uncertainties are declared
  `notModelled`.

## 5. Status

`ACCEPT` for the physics core, `ADAPT` for the runner and detector,
`REJECT_DUPLICATE` for the entire orchestrator/world/camera/time/port stack.
No element is `BLOCKED`: everything the integrated domain needed already
existed in Genesis.
