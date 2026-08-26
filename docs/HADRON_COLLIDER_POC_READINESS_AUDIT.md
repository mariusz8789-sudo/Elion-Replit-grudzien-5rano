# Hadron Collider Educational POC — Technical Readiness Audit

**Status:** Audit only. No collider physics, no new particle models, no new solvers, no CERN data, no live experimental data, no accelerator control/communication, no operational instructions, no real-instrument calibration, no UI, no City3D, no GIS, no Matrix World, no Epidemic Core change, no Earthquake change. Nothing in this document was implemented; no existing engine was modified. `claude/matrix-foundation-sprint` @ `a16e1bb` is untouched — no merge, no further changes there.

**Baseline:** `origin/manus/high-fidelity-epidemic-digital-twin` @ `8992b19`. Audit branch: `claude/hadron-collider-capability-audit`.

**Scope of the question:** can Genesis host a future **educational/research** vertical slice — `Particle/Beam Input → Collision Event → Particle Products → Detector Response → Event Trace → Evidence → Replay → MATCH/DRIFT` — and, separately, is any of that presented or presentable as a real accelerator?

Every row cites a real file and a real exported symbol, test, or doc line. Classification: **EXISTS**, **REUSABLE** (real, needs an adapter), **MISSING**, **OUT_OF_SCOPE**.

---

## 1. What already exists in the repository

This is the single biggest finding of this audit: **Genesis already ships a "Particle Lab"** — a real, honesty-labeled, UI-integrated set of particle-physics demonstrations. It was not built for this audit and needs no new implementation to exist.

| Capability | Verdict | Evidence |
|---|---|---|
| **Particle models** (species, charge, transverse momentum) | EXISTS | `src/labs/experiments/particle-detector-3d.ts` → `SPECIES` (`e±, μ±, π±, p, γ`), `Track3D { charge, pt, ... }` |
| **Collision "events"** (a discrete fire-and-produce-tracks unit) | EXISTS (visual only) | `src/labs/experiments/particle-detector-3d.ts` → `DetectorSim3D.fire()`, `this.events++`; `src/labs/particle.ts` → `CollisionSim` (2D predecessor) |
| **Energy/momentum — single-particle relativistic kinematics** | EXISTS | `src/core/physics.ts` → `lorentzGamma()`; `src/core/modelGraph/relativisticEnergyGraph.ts` → `buildRelativisticEnergyGraph()`, `BASELINE_REST_MASS_MEV`, `BASELINE_BETA`; wired into `src/core/experimentFabric/executor.ts` `case 'particle-relativistic-energy'` (line 531) |
| **Energy/momentum — real particle-discovery method (invariant mass)** | EXISTS | `src/labs/experiments/particle-invmass.ts` → `M² = (ΣE)² − (Σp)²` implemented as a live histogram (`InvMassSim`), with **real PDG resonance data**: `RESONANCES` = J/ψ (3.097 GeV), ψ(2S) (3.686), Υ (9.46), Z⁰ (91.19, Γ=2.5) |
| **Fields** (magnetic, governing track curvature) | EXISTS (visual only) | `src/labs/experiments/particle-detector-3d.ts` doc comment + `computeTrackPath()`: curvature `= charge * CURV_K / (pt * 4)`, implementing the real relation **r = p_t/(qB)** in a solenoidal field, extended to a true 3D helix (circle in x–z, uniform drift in y) |
| **Detectors** (tracker/ECAL/HCAL layering) | EXISTS (visual only) | `src/labs/experiments/particle-detector-3d.ts` → `TRACKER_R`, `ECAL_R`, `HCAL_R` concentric shell geometry |
| **Particle tracks** | EXISTS | Same file — helical `Track3D.points`, physically exact geometry per its own doc comment ("DOKŁADNA geometria toru w jednorodnym polu solenoidalnym, nie przybliżenie") |
| **Monte Carlo / probabilistic sampling** | EXISTS (unseeded) | `particle-invmass.ts` → `sampleSynthetic()`: Breit–Wigner (Cauchy) resonance sampling + falling-exponential combinatorial background, weighted by `RESONANCES[].rate` |
| **A "lab"/experiment module system** | EXISTS | `src/core/types.ts` → `ExperimentDef`, `LabDefinition`, `Sim`, `Sim3D`; `src/labs/particle.ts` assembles `particleDetector3D`, `particleInvMass`, `particleRelativisticEnergy`, plus the base 2D `CollisionSim`, into one Particle Lab |
| **An honesty/provenance discipline for this exact domain** | EXISTS | `src/core/types.ts` → `HonestyLevel = 'exact' \| 'simplified' \| 'educational' \| 'theoretical' \| 'cinematic'`; every particle experiment declares `honesty: 'educational'` and a specific `honestyNote` string (see §3) |
| **A live real-vs-synthetic data source hook for this exact domain** | EXISTS, currently inactive | `src/core/dataSource.ts` → `registerDataSource()`/`getDataSource()`; used in `particle-invmass.ts` for id `'particle.dimuon-masses'`, citing CERN Open Data CMS DoubleMu record 545 |
| **A test asserting the honesty note matches the data state** | EXISTS | `src/__tests__/particleInvMass.test.ts` → "honestyNote jest spójna ze stanem isSynthetic tego źródła" |
| **A qualitatively similar deterministic, seeded N-body "collision" precedent (different domain: gravity, not QCD)** | EXISTS | `src/labs/experiments/universe-collision.ts` → `runCollisionScenario()`, wired via `experimentFabric/executor.ts` `case 'universe-galaxy-collision'` (line 335): seeded, tracer-particle Newtonian two-body-core collision, seed recorded in output |
| **Experiment Fabric NL request → scenario → executor pipeline** | EXISTS, REUSABLE pattern | `src/core/experimentFabric/parser.ts`, `router.ts`, `executor.ts` — 40+ `case` scenario ids already registered, each returning `{ status, outputs, units, warnings, validity, assumptions }` — a real template for how a `collision-*` scenario id would plug in |

**None of the above is fabricated for this audit.** Every symbol was read directly from the current tree; the honesty notes quoted below are copied verbatim, not paraphrased into something more favorable.

---

## 2. The Particle/Beam → Collision → Detector → Evidence → Replay flow, stage by stage

| Stage | Verdict | Evidence / gap |
|---|---|---|
| **Initial state** (what exists before a collision) | REUSABLE | `particle-detector-3d.ts` has no explicit "beam" object — species/energy are read straight from UI params (`p.energy`) at fire time. A `BeamState` type does not exist anywhere. |
| **Input energy** | EXISTS (as a UI slider, not a physical beam construct) | `particleDetector3D.params` → `{ key: 'energy', min: 5, max: 100, unit: 'j.u.' }` (`j.u.` = "jednostki umowne" — arbitrary units, not GeV). Its own `honestyNote` states outright: **"NIE odtwarzamy rzeczywistych przekrojów czynnych ani kinematyki zderzeń LHC."** |
| **Particle types** | EXISTS | `SPECIES` array, `RESONANCES` (PDG masses) — real species labels and real reference masses. |
| **Probabilistic model** | EXISTS, but **MISSING seed** | Species per event: `SPECIES[Math.floor(Math.random() * SPECIES.length)]` (`particle-detector-3d.ts:152`) — raw `Math.random`, no injectable RNG. Same in `particle-invmass.ts`'s `sampleSynthetic()`. Contrast with `core/epidemic/agents.ts`'s `makeRng(seed)`, used everywhere in the epidemic core — the collider labs never adopted that pattern. |
| **Seed / determinism** | **MISSING** | No `seed` parameter exists on any particle `ExperimentDef`. Two runs at the same energy produce different track counts, species, and curvatures every time. This is the single largest gap relative to every other "real" Genesis pipeline (epidemic, hazard, discovery), all of which are seed-first. |
| **Collision model** (what actually determines the products) | **MISSING at the physics level** | Product count is `5 + floor(Math.random() * (6 + energy/8))` (`particle-detector-3d.ts:144`) — energy nudges a *count distribution*, not a cross-section, matrix element, or conservation law. No 4-momentum conservation is enforced across an event's tracks. This is explicitly disclosed, not hidden (see §3). |
| **Particle products** | EXISTS (as track objects), not physically derived | `Track3D[]` per event — real per-track geometry, not a real per-event physics derivation. |
| **Simplified detector** | EXISTS | Concentric tracker/ECAL/HCAL shells; a track's helix is genuinely physically consistent with **being** in that field, even though the multiplicity that produced it is not. |
| **Event storage** | **MISSING** | `DetectorSim3D`/`InvMassSim` hold state only in local class fields for the lifetime of one browser session (`this.tracks`, `this.hist`). Nothing is written to `core/provenance/recordStore.ts`, `core/discovery/evidenceStore.ts`, or `core/hazard/hazardProvenanceStore.ts`. Closing the tab loses every event. |
| **Fingerprint** | **MISSING** | No `computeSourceArtifactContentHash`-style or `computeHazardInputFingerprint`-style function exists for a collision event or an event trace in the particle domain. (The Matrix Foundation Sprint just landed a domain-neutral `computeWorldStateFingerprint`/`computeEventTraceFingerprint` in `core/matrixFoundation/` and `core/events/` — see §4 for whether these actually fit.) |
| **Replay** | **MISSING** | No `replayCollisionEvent`-equivalent exists. There is nothing to replay against, because nothing is persisted (previous row) and nothing is seeded (two rows up). |
| **Visualization** | EXISTS, strong | `DetectorSim3D` is a genuinely well-built Three.js scene: physically exact helices, bloom post-processing gated by device tier (`tierAllowsBloom`), reduced-motion support, collision flash feedback. This is the strongest single piece of the whole flow. |

**Bottom line for this section:** the *rendering and single-event physics* (track geometry, invariant-mass method, PDG data) are real and good. The *pipeline infrastructure* (seed → deterministic collision → persisted event → fingerprint → replay verdict) that would make this a genuine "vertical slice" in the same sense as the Earthquake or Epidemic Discovery work simply does not exist yet for this domain. This mirrors exactly the shape of finding in `docs/MATRIX_WORLD_POC_READINESS_AUDIT.md`: strong domain content, missing determinism spine.

---

## 3. Educational model vs. real accelerator/experiment — the boundary as it exists today

The repository already draws this line explicitly, and draws it correctly. Quoted verbatim (Polish original, as written in the source):

- `particle-detector-3d.ts` → `honestyNote`: *"Wizualizacja poglądowa inspirowana detektorami CERN... Rodzaje i liczba cząstek na zdarzenie są losowane — NIE odtwarzamy rzeczywistych przekrojów czynnych ani kinematyki zderzeń LHC."*
- `particle-invmass.ts` → `dimuonHonestyNote` (synthetic branch, the one actually active in this build): *"Dane ZDARZEŃ w tym wdrożeniu są SYNTETYCZNE... to NIE są prawdziwe zderzenia."*
- `README.md:241`: *"Dane w laboratorium cząstek są syntetyczne, nie realnymi zderzeniami CERN."*
- `README.md:244` / `scripts/fetch-real-data.mjs`: the build network **blocks** `opendata.cern.ch` — the real-data path is coded (`registerDataSource`, `src/data/dimuon-real.ts` glob) but inert in this environment, and the code path itself detects and reports which state it's in (`realMasses ? ... : ...`), rather than asserting realism unconditionally.

**Verdict: the boundary is already sound.** No file claims calibration to a real accelerator; no file claims the event data is real; the one real-data hook that exists degrades honestly and observably when the network path is unavailable, and a test (`particleInvMass.test.ts`) enforces that the honesty note cannot drift out of sync with the actual data state. **This audit adds no new boundary — it confirms the existing one and recommends nothing be relaxed.**

What a future POC must **not** do, stated as a hard rule this audit is not inventing but making explicit: never let a `seed`/`fingerprint`/`Evidence`/`Replay` layer (all of which imply "this is a trustworthy, reproducible result") attach itself to the *current* Monte Carlo (raw `Math.random`, no cross-section, no conservation law) in a way that reads as "this is now a validated physics result." Determinism is a software property (same seed → same output); it is not, by itself, physical accuracy. Landing a seed does not entitle a claim of realism.

---

## 4. Does the existing architecture fit a future collider POC?

| Architecture piece | Fit | Why |
|---|---|---|
| **Evidence/Replay vocabulary** (`'MATCH' \| 'DRIFT' \| 'BLOCKED' \| 'NOT_REPRODUCIBLE'`) | REUSABLE | Already domain-neutral in `core/matrixFoundation/replayVerdict.ts`'s `ReplayVerdict` (landed in the Matrix Foundation Sprint) and in `core/hazard/hazardReplay.ts`'s `HazardReplayStatus`. A collision-replay function could reuse the vocabulary without duplicating either file. |
| **Canonical fingerprinting** (`canonicalJson` + `sha256Hex`) | REUSABLE | Same two primitives (`core/events/hash.ts`, `core/discovery/evidenceCrypto.ts`) every other fingerprint uses. A `computeCollisionEventFingerprint()` would be a small, new, additive file mirroring `core/hazard/fingerprint.ts` — not a new hashing scheme. |
| **Provenance/persistence** (`KeyedRecordStore`, `LocalRecordStore`, `DuplicateIdPolicy`) | REUSABLE | `core/provenance/recordStore.ts` is exactly the primitive `core/hazard/hazardProvenanceStore.ts` builds on; a `CollisionEventStore` would be a third domain-specific wrapper around the same store, not a new persistence mechanism. |
| **Event contracts** (`GenesisEvent`, `EventRegistry`) | REUSABLE | `parameters: P` is generic; a `particle.collision` event type could be emitted with zero core change, exactly as documented for Matrix World in `docs/MATRIX_WORLD_POC_READINESS_AUDIT.md` §3. |
| **Scenario infrastructure** (named, reproducible, A/B) | REUSABLE, but NOT `ScenarioEngine` directly | `core/simulation/scenarioEngine.ts` is epidemic-shaped (`EpidemicCityParams`, `HospitalCapacityParams` are non-optional fields of `ScenarioRun`). A collider POC should follow **Experiment Fabric**'s pattern instead — a new `case 'collision-*'` in `executor.ts`'s existing dispatch, matching how `particle-relativistic-energy` and `universe-galaxy-collision` already work — not duplicate or widen `ScenarioEngine`. |
| **Deterministic execution** | **MISMATCH today, fixable** | The particle labs are the one demonstration domain in the repository that never adopted the `makeRng(seed)` pattern every other domain (epidemic, hazard/earthquake, `universe-collision`'s galaxy scenario) already uses. This is a real, concrete, and narrow gap — not an architectural incompatibility. |
| **`Sim`/`Sim3D`/`ExperimentDef` (the Labs system itself)** | OUT_OF_SCOPE to change | This is a live, per-frame, UI-driven interactive-demo contract (`init/update/render` each frame) — a different and older lineage than `GenesisEvent`/`EventRegistry`/Evidence. It should stay exactly what it is (a renderer), with a future deterministic collision *model* feeding it, not the reverse. |

**No existing engine needs to change.** A future POC's honest options are: (a) add a new, additive, seeded collision-event module beside the existing Particle Lab, wired to the existing fingerprint/provenance/replay primitives the same way Hazard/Earthquake was; or (b) leave the Particle Lab exactly as an honesty-labeled interactive demo and build the deterministic slice as a wholly separate, non-UI, testable module first (mirroring how Discovery Engine and Hazard Provenance were built before any renderer touched them). Both are legitimate; neither requires modifying `scenarioEngine.ts`, `hazardReplay.ts`, `discoveryReplay.ts`, `recordStore.ts`, or the Labs contract itself.

---

## 5. Top gaps, in priority order (recommendation is `NEEDS_FOUNDATION`, capped at 10)

1. **No seed anywhere in the particle domain.** Every other Genesis simulation domain seeds first; this one does not. Blocks everything downstream.
2. **No collision model with a conservation law.** Product multiplicity is a random count nudged by an energy slider, not derived from any cross-section or 4-momentum balance — explicitly disclosed, but still the physics core a real vertical slice would need.
3. **No event persistence.** A collision event lives and dies inside one `DetectorSim3D` instance; nothing survives a page refresh.
4. **No event/collision fingerprint.** Nothing hashes a collision event's inputs or outputs — no analogue to `HazardInput`/`HazardRun`.
5. **No replay function.** There is nothing to compare a recomputed event against, because 1–4 don't exist yet.
6. **No `BeamState`/`CollisionInput` contract.** Energy is a bare number on a UI slider, not a typed, fingerprintable input record.
7. **The invariant-mass method and the 3D detector are two separate, unconnected demos.** A real vertical slice needs one event to flow through generation → detector response → invariant-mass reconstruction as one pipeline, not two independent `ExperimentDef`s.
8. **No test asserts determinism for anything particle-related** (contrast: `agents.test.ts`'s "same seed → identical stream"). `particleInvMass.test.ts` only checks the honesty-note/data-state consistency, which is real but does not touch physics reproducibility.
9. **No declared unit system.** `energy` is `j.u.` ("arbitrary units") in the detector, GeV in the invariant-mass histogram, and MeV in the relativistic-energy graph — three different unit conventions across one nominal "Particle Lab" with no conversion or reconciliation layer.
10. **No named-scenario/A-B structure for collisions**, unlike epidemic (`SCENARIOS`) or hazard (registered modules) — every run today is a live, unnamed, unrepeatable UI interaction.

---

## 6. Feasibility scores

Scored against what is actually in the repository, not market framing.

| Dimension | Score /10 | Justification |
|---|---|---|
| **Scientific feasibility** | 6 | The physics that *does* exist (helix geometry from r=p_t/qB, invariant-mass reconstruction, real PDG resonance values) is genuinely correct and is literally the textbook method for particle discovery. What's missing (a real collision/cross-section model) is a hard, open research-simulation problem in general, but an *educational* slice does not need a real cross-section to be honest — it needs to say so, which the repo already does. Capped below 8 because "Collision Event" today has no physics model at all, only a disclosed randomizer. |
| **Technical feasibility** | 7 | Every piece needed to wire this into Genesis's real infrastructure (fingerprint pair, record store, event contract, replay vocabulary) already exists and is proven elsewhere. The gap is integration work (§5), not new invention — the same shape of gap the Matrix World audit found, and that audit's own foundation sprint proved this class of gap is closeable in a single session. |
| **Educational value** | 8 | The invariant-mass "discover a particle" mechanic is an unusually strong educational artifact already — it is *the actual historical method* (J/ψ 1974, Z⁰ 1983, Higgs 2012), not a simplified metaphor, and the repo's own narration text says so accurately. |
| **Commercial potential** | 4 | No evidence in the repository speaks to this — no monetization hooks, no usage analytics tied to the Particle Lab specifically, no positioning documents referencing a collider product. This score reflects "no repository evidence either way," not a judgment on the idea. |
| **Competition risk** | 5 | Likewise not something the codebase can answer. Numerous particle-physics education tools exist publicly (PhET, CERN's own outreach visualizations); Genesis's differentiator would be the same one the Matrix World audit identified for that domain — an actually-deterministic, evidence/replay-backed version of a demo that usually isn't. No repository evidence quantifies risk beyond that structural observation. |

---

## 7. Recommendation

# NEEDS_FOUNDATION

Not `PARK`: the domain content is unusually strong for a "gap" verdict — real PDG data, a physically exact detector geometry, and an honesty/citation discipline that already correctly separates "educational" from "real accelerator" without this audit needing to invent that boundary.

Not `READY_FOR_EDUCATIONAL_POC`: the entire determinism-and-evidence spine (seed, persisted event, fingerprint, replay) that every other Genesis domain has is absent here specifically. Wiring a `MATCH`/`DRIFT` replay verdict onto an unseeded `Math.random()` collision generator today would be building exactly the "dishonest green" the rest of this codebase is built to prevent.

The path to `READY_FOR_EDUCATIONAL_POC` is narrow and concrete: adopt `makeRng(seed)`-style determinism in the collision generator, persist one collision event as a typed, fingerprintable record, and prove a replay `MATCH`/`DRIFT` against it — three of the ten gaps above, in the order listed. That is a small, independently reviewable, additive piece of work, not a new engine.

---

**Branch:** `claude/hadron-collider-capability-audit`
**Commit:** `e92f2cf78eb9fa2fd3eaf7b33a77df4a24170bc3`
**Changed files:** `docs/HADRON_COLLIDER_POC_READINESS_AUDIT.md` only. No code file was created, modified, or deleted.

**Summary — EXISTS:** Particle Lab (species, tracks, detector shells, invariant-mass histogram, real PDG data), honesty/citation discipline, real-vs-synthetic data hook, Experiment Fabric dispatch pattern, a seeded gravitational N-body collision precedent (different domain).
**REUSABLE:** fingerprint pair, record-store primitive, `GenesisEvent`/`EventRegistry`, replay-verdict vocabulary, Experiment Fabric `case` pattern.
**MISSING:** seed/determinism, a collision model with any conservation law, event persistence, event/collision fingerprint, replay function, unified `BeamState`/unit system, named collision scenarios, determinism tests.
**OUT_OF_SCOPE:** the `Sim`/`Sim3D`/`ExperimentDef` renderer contract itself (correctly a renderer, not a science core); `ScenarioEngine` (epidemic-shaped, must not be widened or duplicated); anything resembling real accelerator control, live CERN data activation, or operational/calibration claims.

**Recommendation:** `NEEDS_FOUNDATION`.

**Remaining blockers:** none technical beyond the ten gaps listed in §5 — this is a scoping/prioritization decision for the user, not an unresolved technical question. No merge performed; waiting on Manus's independent review.

**NO COLLIDER PHYSICS IMPLEMENTED / NO NEW PARTICLE MODELS / NO NEW SOLVERS / NO CERN DATA ACTIVATED / NO LIVE EXPERIMENTAL DATA / NO ACCELERATOR CONTROL OR COMMUNICATION / NO OPERATIONAL INSTRUCTIONS / NO REAL-INSTRUMENT CALIBRATION / NO UI CHANGE / NO CITY3D / NO GIS / NO MATRIX WORLD CHANGE / NO EPIDEMIC CORE CHANGE / NO EARTHQUAKE CHANGE.**
