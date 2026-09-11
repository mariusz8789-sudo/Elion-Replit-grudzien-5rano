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

---

# ROUND 2 — Qwen "GENESIS PARTICLE & ATOMIC PHYSICS LABORATORY"

A second, larger package arrived extending the particle domain into nuclear and
atomic physics: ionisation, decays, scattering, ion-ion, multiple reaction
channels, explicit fidelity tiers, lab environments and a
`ParticleAtomicLabOrchestrator`.

The instruction was: **do not build a second CERN, a second laboratory, a second
Simulation Engine, World Engine, Matrix, Memory, Replay, Chat or renderer**;
make Virtual CERN **one environment inside** a broader Particle & Atomic Physics
Laboratory; keep explicit fidelity; keep `MODEL_RESULT != OBSERVED != EVIDENCE`;
audit first, integrate second, test third, E2E fourth.

## 1. What the package actually was

Roughly 60% of it was the SAME stack rejected in round 1, resubmitted with new
names. `types.ts`, `kinematics.ts`, `determinism`, `detectorModel.ts`,
`experimentRunner.ts`, `virtualCernDomain.ts`, `cameraNavigation.ts`,
`sceneContract.ts`, `beamAccelerator.ts`, `eventPlayback.ts`,
`scenarioAdapter.ts`, `temporalAdapter.ts`, `nextExperimentAdapter.ts`,
`scientificMemoryAdapter.ts`, `matrixAdapter.ts`, `stateMachine.ts`,
`chatCommands.ts` and `orchestrator.ts` all duplicate infrastructure this
repository already has, and `orchestrator.ts` + `stateMachine.ts` together are
once again a parallel app state machine sitting above every existing Genesis
engine at once. Same verdict as round 1, for the same reasons — those rows are
not repeated here.

The remaining 40% contained three things that were genuinely new, and all three
were integrated.

## 2. Verdicts — the new material

| Element | Verdict | Reason |
|---|---|---|
| `FidelityTier` = EXACT_KINEMATICS / SIMPLIFIED / TOY / DEMONSTRATION | **ACCEPT** | Carries information `GroundingLevel` structurally cannot. `GroundingLevel` answers "did a real solver run, and was its update exact or approximate"; fidelity answers "the solver that ran — how faithful is the physics inside it". Three of the four tiers collapse onto `MODEL_ESTIMATE`, and that collapse is exactly the loss this axis repairs. Integrated with a single `fidelityGrounding()` mapping so the two disclosures can never contradict each other, plus `weakestFidelity()` so a run reports its weakest link rather than its best. |
| `ReactionChannel` catalogue as a concept | **ACCEPT** | The collider had exactly one channel. A laboratory needs several, and naming them explicitly is how a run can say which physics it used. |
| `EE_ANNIHILATION` (e+e- -> mu+mu-) | **ACCEPT** | Exact two-body kinematics with a real threshold at 2*m(mu). |
| `Z_RESONANCE` | **ADAPT** | Kept, rebuilt on the relativistic Breit-Wigner already integrated in round 1 instead of Qwen's second copy of it. |
| `MUON_CAPTURE` (mu- p -> n nu) | **ACCEPT** | Exact two-body with UNEQUAL daughter masses — which is what exposed a real defect, see §4. |
| `MUON_DECAY` | **ADAPT — upgraded past the proposal** | Qwen shipped flat phase space and declared in its own assumptions "no V-A matrix element (not Michel)" and "spectrum NOT physical". The real Michel spectrum is a closed form, `x^2(3-2x)`, so there was no reason to ship the toy: it is implemented, normalised, inverted by bisection, and its mean electron energy comes out at the measured 36.98 MeV **by integration in a test**. Energy and momentum are conserved exactly in the three-body final state by constructing the neutrino pair in the recoil rest frame and boosting it. |
| `PP_ELASTIC_TOY` | **ADAPT — upgraded past the proposal** | Qwen's assumptions said "uniform cos(theta) NOT Rutherford", i.e. no angular physics at all. Replaced with the MEASURED diffractive slope, `dsigma/d|t| ~ exp(-B|t|)` at B = 20 GeV^-2 (TOTEM), sampled by exact inverse CDF. Tested to be forward-peaked (max scattering angle under 1 degree at LHC momenta), which an isotropic draw could never be. Tier `SIMPLIFIED`, because the slope is an empirical parameter. |
| `ATOM_PARTICLE_IONIZATION_DEMO` | **ADAPT — upgraded past the proposal** | Qwen's version was `DEMONSTRATION`: a 1D collinear toy with a uniformly sampled energy transfer. What is real in that idea is the THRESHOLD, and the real cross-section is published: the Lotz (1967) empirical formula for atomic hydrogen. Implemented, and verified against measured data — the peak comes out at 55.1 eV and 0.65e-16 cm^2, both of which match the literature. This became the basis of a whole new environment (§3). |
| `PN_SCATTERING_TOY` | **REJECT_UNUSED** | An isotropic two-body draw with nothing distinguishing it from `pp-elastic` but the daughter masses. A channel that adds a name and no physics is a design mockup. |
| `ionIonToy` / `atomAtomElasticDemo` | **REJECT_UNUSED** | Same. Qwen's own assumptions say "NOT a real heavy-ion model", "no QGP/hydro", "hard-sphere classical", "not a real potential". Correct, and the honest response to a channel with nothing in it is not to ship it. |
| `labEnvironments.ts` — the six environments | **ADAPT** | The idea is right and is the answer to the whole directive: an environment is a NAME FOR A CONFIGURATION, not an engine. Implemented as `core/agent/particleAtomicLabEnvironments.ts`, a table of channel sets pointing at lever catalogues that already exist. What was changed is honesty — see §3. |
| `realDataBoundary.ts` — `SIMULATION_TO_EVIDENCE = { allowed: false }` | **ACCEPT as principle, already enforced** | Unchanged from round 1. `dataProvenance.ts` separates SIMULATED / REFERENCE / REAL_EXPERIMENTAL structurally, and only a real or cited measurement entered through the real-experiment path carries a non-simulated tag. No constant needed to restate it, and no `EvidencePort` needed: the domain reaches the existing Evidence layer through the discovery loop, as the E2E in §5 shows. |
| `detectorModel.ts` — per-event Gaussian smearing with a PRNG | **REJECT_DUPLICATE / structural** | Same objection as round 1's `experimentRunner.ts`, and it has not gone away: `domainState` is shared by reference between a branch and its fork, so a PRNG stream inside it would make two forks silently diverge. Detector resolution is already in the model, as a real Gaussian mass-window integral. |
| `INTEGRATION_POINT_TO_CONFIRM` markers throughout | **BLOCKED as written, resolved by integration** | Qwen stated openly that it did not know this repository's paths, types or signatures and had invented them. Every one of those points was resolved against the real contract rather than trusted: `WorldGraph`, `SolverRouter`, `TemporalUpdater`, `WorldLeverCatalog`, `Observation`, `GenesisEvent`, `GroundingLevel`, `WORLD_LEVER_CATALOGS`, `runWorldDiscoveryAndRemember`, `replaySavedWorldDiscoveryRun`. |

## 3. What was actually built

**One new domain, one new lever catalogue, one environment table, one chat
branch. No new engine, orchestrator, workflow, screen, renderer or route.**

- **`core/worldModel/domains/particlePhysics.ts`** (extended) — the fidelity
  vocabulary, a generalised `twoBodyFinalState` for unequal masses, a general
  `boostFourVector`, the Michel spectrum with its CDF and inverse, the Lotz
  cross-section, and the six-channel `REACTION_CHANNELS` catalogue.
- **`core/worldModel/domains/atomicIonization.ts`** (new) — **the Atomic Lab**:
  an electron-impact ionisation chamber on the same WorldGraph, with real
  Beer-Lambert attenuation `1 - exp(-n*sigma*L)` and the real Lotz
  cross-section. It is the twenty-third domain on the one existing substrate,
  not a second engine.
- **`core/agent/atomicIonizationLeverCatalog.ts`** (new) — four levers, so the
  **existing** Discovery Loop runs real searches on it.
- **`core/agent/worldGoalIntent.ts`** — one more entry in `WORLD_LEVER_CATALOGS`.
  The Discovery panel's world dropdown renders from that registry, so the Atomic
  Lab appears in the existing UI with **no UI change at all**.
- **`core/agent/particleAtomicLabEnvironments.ts`** (new) — the environment
  table. Virtual CERN is one row in it.
- **`core/scienceChat/resolveCommand.ts`** — one NL branch, routing to the
  existing screen that hosts the existing panel.

### The environments, and why `status` is not decoration

Qwen's table declared all six environments equally real. Two of them are. The
registry therefore carries a `status` field, which is the field that stops the
table from being a brochure:

| Environment | Status | What is behind it |
|---|---|---|
| `VIRTUAL_CERN_LHC_LIKE` | **RUNNABLE** | The collider catalogue from round 1. Its epistemic note says plainly that it is *not* a model of the real LHC. |
| `COLLIDER_LAB` | **RUNNABLE** | The same apparatus without the CERN framing — the honest description, since nothing in the model was ever CERN-specific. |
| `ATOMIC_LAB` | **RUNNABLE** | The new ionisation chamber. |
| `NUCLEAR_LAB` | **CHANNELS_ONLY** | Muon capture and Michel decay are real, exact and tested, but no apparatus is wired: a final state can be computed, an experiment cannot yet be run. |
| `CUSTOM_EXPERIMENT_LAB` | **CHANNELS_ONLY** | Every executable channel, no fixed apparatus. |
| `PLASMA_LAB` | **NOT_BUILT** | Reserved and empty. Qwen backed it with one unfitted toy ion-ion channel; that channel was rejected, so the environment says it does not exist rather than listing itself as available. |

So **Virtual CERN is one row among six, and is no longer the boundary** — which
is what the directive asked for — without anything pretending to work.

### The science the Atomic Lab makes discoverable

The collider taught a monotone lesson: tune onto the resonance and everything
improves. This environment deliberately teaches the opposite one, and that is
the reason it exists rather than being a relabelled collider. The Lotz
cross-section is **non-monotonic** — zero below 13.606 eV, peaking near 55 eV,
then falling like ln(E)/E — so two arms that both "raise the beam energy" reach
opposite verdicts:

| Lever | Ion yield | S/B | Why |
|---|---|---|---|
| Tune to the 55 eV cross-section peak | **up** | up slightly | More of the measured cross-section |
| Naively drive the beam to 300 eV | **down** | down | Past the peak the cross-section halves — a real, common experimental mistake |
| Raise target density x100 | **up, saturating** | **up strongly** | Beer-Lambert: `1 - exp(-n*sigma*L)`, and residual-gas background does not scale with target density |
| Improve ion collection to 98% | up | up weakly | Scales signal and residual background alike; only the fixed dark rate does not |

A loop that learned "more energy is better" from the collider gets that
hypothesis **falsified here by real published physics**, not by a modelling gap.
Density and path length are also provably the same knob — they enter only
through the product `n*sigma*L` — which is checked by test rather than claimed.

## 4. A real defect this integration found and fixed

`twoBodyMomentumMeV`, integrated in round 1, checked only the sign of the Kallen
product. For EQUAL daughter masses that is correct. For UNEQUAL masses — muon
capture, `p -> n + nu` — the second factor stays positive, so the product stays
positive and a **kinematically forbidden reaction came back as a perfectly
plausible positive momentum**. The threshold is now checked directly
(`M >= m1 + m2`), and a test covers it. Round 1's 28 tests still pass unchanged.

## 5. Verification actually run

- `tsc --noEmit`: clean.
- `eslint .`: clean.
- `vitest run`: **437 files, 4563 passed, 1 skipped, 0 failed.** 48 of those are
  the new `__tests__/particleAtomicLab.test.ts`; round 1's 28 are untouched.
- `vite build`: succeeds.
- **Chromium on the production preview build**, desktop 1440x900 and mobile
  390x844, real user path through the existing Discovery panel:
  - the Atomic Lab appears in the world dropdown as
    `atomic-physics — genesis-atomic-ionization`, with no UI change;
  - a real search on "Maximise ion yield" returned
    `h:tune-to-cross-section-peak — SUPPORTED_AT_TWO_MAGNITUDES` and
    `h:raise-beam-energy — REFUTED_BY_CRITERION`
    (`FALSIFIED_WITHIN_PROTOCOL, effect -52412.5`) — the naive hypothesis
    genuinely falsified by the real cross-section;
  - Evidence Bundle `world-discovery:genesis-atomic-ionization:dlf_977fbad0`
    written to the existing Scientific Memory;
  - replay of the saved run: **MATCH**;
  - zero console errors, zero horizontal overflow on both viewports.

## 6. Status

`ACCEPT` for the fidelity vocabulary, the channel catalogue and four channels;
`ADAPT` — with three of them upgraded past what the proposal shipped — for
muon decay, pp elastic and ionisation; `ADAPT` for the environment table;
`REJECT_UNUSED` for three physics-free toy channels; `REJECT_DUPLICATE` for the
entire orchestrator / state-machine / adapter / scene / camera / detector stack,
for the second time. `BLOCKED` applies only to Qwen's own
`INTEGRATION_POINT_TO_CONFIRM` markers, each of which was resolved against the
real contract rather than trusted.

One laboratory. One WorldGraph. One SolverRouter. One Discovery Loop. One
Scientific Memory. One Replay. One chat layer. Two runnable environments inside
it, and an honest table saying what the other four are.
