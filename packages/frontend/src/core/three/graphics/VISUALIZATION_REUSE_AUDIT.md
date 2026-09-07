# Visualization Reuse Audit — Epidemiology, Quantum, Relativity, Chemistry/Molecular

**Audited at commit `a0e3bb7` (branch `claude/genesis-graphics-engine-v1-wd0r66`), against `main` = `00ce93c`.**
**Status: audit only — no adapter, no visualization, and no domain code was written or changed for this.**

*Sections 1–3 (Quantum, Relativity, Chemistry/Molecular) were written first; §4 (Epidemiology) was
added immediately afterwards on the correct observation that it had been missed and is the most urgent
of the four, since C3's Phase 1 makes it the first domain to actually reach a live WorldGraph. §4's
findings also amended the cross-domain conclusions at the end of this document — read those in their
amended form, not as the three-domain versions.*

## Why this audit exists

C3 is working through a phased integration plan: Phase 1 (Chemistry + Epidemiology coupling), Phase 2
(Quantum), Phase 3 (Relativity), Phase 4 (Molecular/biotech — RDKit/PySCF/OpenMM/AutoDock Vina/
ADMET-AI). Several of those domains already have real, tested computational code — and some of them
**also already have real visualizations in Labs**, built years/passes before `WorldFrameRenderer`
existed and entirely independent of it.

Before anyone writes a new `WorldFrameRenderer` adapter for one of those domains (per
`ADAPTER_CONTRACT.md`), someone has to answer a question that is cheap to answer now and expensive to
get wrong later: **can the existing visualization be wrapped/reused as an adapter, or does the domain
need a structurally new one?** Building a second, parallel visualization for a domain that already has
a real one is precisely the duplicate-renderer problem this whole consolidation has been avoiding —
`graphics/infrastructure.ts` vs `waterInfrastructure.ts` was exactly that, and it cost a deletion to
resolve.

This document is that answer, per domain, with the reasoning kept attached so a future reader can
check whether the conclusion still holds rather than having to re-derive it.

## The short version

| Domain | Existing visualizations | REAL or DEMO | Verdict |
|---|---|---|---|
| **Epidemiology** (§4, C3 Phase 1) | 1× large 3D production scene (`epidemicCity3D.ts`) + instanced crowd + heatmap | REAL (agent-based SEIR) | **HYBRID** — keep the scene, add a small aggregate adapter beside the `WorldFrameRenderer` it *already hosts* |
| **Quantum** | 1× 3D (`BlochSim3D`) + 5× 2D canvas + 1 non-physics widget | REAL (except the widget) | **REWRITE** — the 3D one owns its camera/HUD/animation loop; the rest have no `Object3D` at all |
| **Relativity** | 3× 3D (`Sim3D`) + 4× 2D canvas + 3 non-rendering graphs | REAL, carefully honesty-graded | **REWRITE** — and arguably *should stay bespoke `Sim3D` forever* |
| **Chemistry/Molecular** | 2× 3D (`VseprSim`, DNA helix) + 3× 2D + DOM-only screens | REAL | **REWRITE-WHEN-READY** — blocked on data, not on architecture |

**The single most important finding is not about rendering at all**: no real chemistry/biology backend
in this repository returns per-atom coordinates to the frontend today — not RDKit, not PySCF, not
Biopython, and not even OpenMM, which genuinely runs Langevin MD on a real protein server-side and
returns only five scalars. The Chemistry/Molecular blocker is a data/API question for C3 and the
backend, not a graphics question for C2.

---

## 1. QUANTUM

### A. Visualizations found

| File | What it shows |
|---|---|
| `labs/experiments/quantum-bloch-3d.ts` (`BlochSim3D`) | The only 3D one: wireframe Bloch sphere, state-vector arrow, geodesic rotation trail, camera-attached HUD of gate buttons |
| `labs/experiments/quantum-bloch.ts` | Pure math (gate matrices, `blochVector`, `GATE_ROTATIONS`) — not a visualization |
| `labs/experiments/quantum-chsh.ts` | 2D canvas: pair source, two detectors, correlation bars, \|S\| meter vs. classical/Tsirelson bounds |
| `labs/experiments/quantum-teleport.ts` | 2D canvas: three qubit boxes, measurement flashes, fidelity, correction-operator histogram |
| `labs/experiments/quantum-tunneling.ts` | 2D canvas: barrier, wavepacket probability density, transmission/reflection percentages |
| `labs/experiments/quantum-kitaev-bulk.ts` | 2D canvas: Kitaev-chain energy bands ±E(k) with the bulk gap marked |
| `labs/quantum.ts` (`DoubleSlitSim`) | 2D canvas: per-particle double-slit interference accumulation + histogram |
| `labs/experiments/quantum-photon-consequence.ts` | No spatial rendering — a `ModelGraph` consequence chain (λ → eV → THz → kJ/mol) |
| `components/QuantumDecisionExplorer.tsx` | A "galaxy" of decision stars with Monte Carlo branch fans |

### B. REAL or DEMO

**REAL** for every physics experiment, and the math is genuinely good: exact SU(2) gate matrices with
algebraically-derived SO(3) rotations (Bloch), exact singlet correlation `E(a,b) = −cos(a−b)` plus a
real local-hidden-variable model (CHSH), a genuine 3-qubit full-state-vector simulation with Born-rule
projective measurement and verified fidelity = 1 (teleportation), a real split-step Fourier
Schrödinger solver (tunneling), an exact closed-form BdG bulk dispersion (Kitaev), exact `|ψ|²`
double-slit intensity with correct which-path decoherence (double slit).

**DEMO — flag explicitly.** `components/QuantumDecisionExplorer.tsx` uses real Monte Carlo machinery
(Box–Muller, Euler–Maruyama over a Wiener process) but its inputs are the **user's own subjective
sliders** (`Decision.weight`, `Branch.tone`), and the component says so itself: *"an interactive
simulation of alternative scenarios... inspired visually by physics... not a predictive model."* It is
a decision-journaling tool wearing quantum imagery. **It is not a quantum visualization and must never
be mistaken for one when scoping Phase 2.**

### C. REUSE or REWRITE → **REWRITE**

Three independent reasons, any one of which is sufficient:

1. **The only 3D quantum visualization is the named counter-example to this pattern.** `BlochSim3D`
   does `scene.add(camera)`, parents its gate-button HUD to the camera (`camera.add(this.hud)`), and
   raycasts against those HUD meshes in `pointer()` to mutate its own quantum state. It owns its
   camera framing, its own sub-tick animation clock (`this.anim`, `this.displayVec`, the trail), and
   its bloom/intro fade. `WorldFrameRenderer` never touches the camera and expects
   `resolveVisual`/`updateVisual` to be pure "given this entity, build/update this object" functions.
   There is exactly one qubit, always at its own local origin, framed by its own camera — "position in
   world space" is a category error for this widget.
2. **The other five have no `Object3D` whatsoever.** They are 2D `CanvasRenderingContext2D` `Sim`s.
   They aren't structurally incompatible with `WorldFrameRenderer` so much as orthogonal to it —
   there is simply nothing for `resolveVisual`/`applyTransform` to act on.
3. **The `isReallyModeled()` gate solves a problem this domain does not have.** That gate exists for
   "real spatial entity, dynamic state not yet backed by a solver." Quantum is the opposite case:
   every experiment already computes full, exact state every tick. `ADAPTER_CONTRACT.md` says this
   explicitly — if a domain ships full real state, skip the honest-adapter pattern entirely.

There is one further, subtler mismatch worth recording: `quantum-bloch-3d.ts`'s honesty claim depends
on **continuous** Rodrigues interpolation between discrete gate applications (the arrow must not jump,
because SU(2)→SO(3) makes every gate a literal continuous rotation). A `sync(frame)`-per-tick
reconciliation model has no hook for sub-tick animation owned by the visual itself.

### D. What a REUSE would actually require (i.e. why it isn't one)

Define what a quantum entity *is* as a `WorldFrameEntity` (e.g. one qubit = `scalars: {bx, by, bz}`),
write a fresh `resolveVisual` that builds a Bloch-sphere `Object3D` at local origin with no camera/
HUD/pointer logic baked in, and re-home camera framing, gate-button interaction, and continuous-
rotation animation into whatever owns the renderer. That is a new presentation layer, not a wrap.

The **pure math is fully reusable as-is either way**: `quantum-bloch.ts`, `core/quantumState.ts`,
`core/physics.ts`'s CHSH functions, `core/compute/kitaevBulk.ts`, `core/quantum/tunnelingRunner.ts`.

*(Minor, unrelated cleanup opportunity noticed in passing: `quantum-bloch.ts`'s `GATES` and
`quantumState.ts`'s `H_GATE`/`X_GATE`/`Z_GATE` are two independent definitions of the same single-qubit
gate matrices. Both are independently verified correct, so this is not a bug — just a duplication a
future pass could unify. Out of scope here.)*

### E. Integration size

**Not estimable yet, and that is the honest answer.** There is nothing to integrate until C3's Phase 2
defines what a queryable quantum WorldGraph entity even is. Once that exists: **small-to-medium** for a
purpose-built Bloch-sphere adapter (all the math is done; only a thin new render layer is needed),
assuming C3 ships one-qubit-at-a-time state rather than a full circuit model.

---

## 2. RELATIVITY (Schwarzschild/Kerr, gravitational waves)

### A. Visualizations found

| File | What it shows |
|---|---|
| `labs/experiments/einstein-blackhole-3d.ts` | Flagship Schwarzschild black hole: horizon, photon ring, Doppler-beamed accretion disk + corona, RK4 photon trails, and **screen-space gravitational lensing as a post-processing `ShaderPass`** |
| `labs/experiments/einstein-kerr3d.ts` | Kerr (rotating) black hole: outer horizon, ergosphere (per-frame vertex-rewritten), prograde/retrograde photon-orbit rings, equatorial photon trails |
| `labs/experiments/spacetime-lightcone-3d.ts` | 3D light cone, two twin worldlines, expanding light-front ring, event markers |
| `labs/experiments/einstein-chirp.ts` | 2D canvas: inspiralling binary + live chirp waveform + real-frequency sonification |
| `labs/experiments/einstein-geodesics.ts` | 2D canvas: top-down Schwarzschild photon trajectories (the precursor prototype to the 3D scene) |
| `labs/experiments/einstein-lensing.ts` | 2D canvas: weak-field point-lens (θ±, magnification, Einstein ring) |
| `labs/experiments/spacetime-minkowski.ts` | 2D canvas: Minkowski diagram, boosted axes, relativity of simultaneity |
| `einstein-astro-consequence.ts`, `spacetime-cslider.ts`, `spacetime-relativity-consequence.ts` | `ModelGraph` consequence panels — no scene at all |
| `core/modelGraph/relativisticAstroGraph.ts`, `specialRelativityGraph.ts` | Headless, per-node honesty-graded physics graphs feeding those panels |
| `core/three/starfield.ts` | Shared decorative particle-field builder (Einstein + Universe labs) |

### B. REAL or DEMO

**REAL throughout, and this domain's internal honesty bookkeeping is the most mature in the repo.**
Exact RK4 Schwarzschild null-geodesics (`d²u/dφ² = −u + 1.5·r_s·u²`) shared as one source of truth
between the 2D and 3D scenes; exact Kerr equatorial geodesics in Boyer–Lindquist form (Carter 1968),
cross-validated against the Schwarzschild case at spin = 0 to 13 digits; exact closed-form horizon/
ergosphere/photon-orbit radii (Bardeen 1972 / Teo 2003); real quadrupole-formula GW chirp physics —
the same method used for GW150914 — with merger/ringdown explicitly excluded; exact Lorentz transforms
for the light-cone and Minkowski scenes.

Each file already grades itself per-layer (`exact` vs. `physically informed` vs. `illustrative`): e.g.
photon paths exact, disk kinematics/Doppler beaming physically informed, the lensing shader and
photon-ring glow illustrative approximations, cosmic backdrop purely decorative. Kerr honestly
declares its reduced domain of validity (equatorial only, Carter constant Q = 0).

### C. REUSE or REWRITE → **REWRITE — and these should probably stay bespoke `Sim3D` permanently**

1. **Screen-space shader lensing is a hard disqualifier.** `einstein-blackhole-3d.ts` renders a
   background scene, then warps that *rendered image* with a fragment shader (`LENS_WARP_FRAGMENT`)
   whose uniforms are recomputed every frame from live camera projection math (`updateLensUniforms()`).
   `WorldFrameRenderer` creates and positions per-entity `Object3D`s; it does not own, and cannot
   reach, `EffectComposer`/`ShaderPass`/camera projection (that's `Sim3D.setupPostProcessing`,
   entirely outside its contract). There is no entity whose `Object3D` this shader could attach to —
   it operates on the composited output of thousands of stars and disk particles at once.
2. **Geometry *is* the state here, which `updateVisual` may never rebuild.** A photon's trail is a
   `BufferGeometry` whose position attribute is rewritten every frame from an ongoing RK4 integration;
   the Kerr ergosphere's sphere vertices are individually reprojected each `syncScene()` to a live,
   polar-angle-dependent radius. `ADAPTER_CONTRACT.md` rule 4 and the `updateVisual`-never-rebuilds-
   geometry rule both forbid exactly this.
3. **No stable entity identity.** Photons are a continuously spawning/dying pool (~0.2 s spawn
   interval) — ids would have to be minted and retired constantly, which is possible but is forcing
   the pattern rather than using it.
4. **`isReallyModeled()` again doesn't apply** — full real state every tick, nothing pending to gate.
   This domain's honesty axis (exact vs. informed vs. illustrative, per rendering layer) is a
   *different* axis from entity grounding, and it is already solved per-file.

`spacetime-lightcone-3d.ts` is the least-bad fit (no custom shader, ~5 long-lived objects), but its
worldline and ring geometries are still reshaped from live state every frame rather than merely
repositioned. If anyone ever wants to prototype this pattern in the relativity domain, start there —
not with the black holes.

### D. What a REUSE would require

Not recommended anywhere in this domain. The physics layer is already cleanly separable and fully
reusable as-is — `core/physics.ts`'s geodesic steppers plus the side-effect-free scenario runners
(`runSchwarzschildGeodesicScenario`, `runKerrScenario`, `runChirpInspiralScenario`,
`runLightConeScenario`, `runMinkowskiScenario`, `runPointLensScenario`). Only the rendering half would
need reinventing, and that half is exactly where the shader/geometry/camera coupling lives.

### E. Integration size

**Large, and lowest priority of the three.** A `WorldFrameRenderer`-shaped black hole would need a
fundamentally different lensing approach, and there may not be a good one — shader-based lensing may
simply never fit a per-entity `Object3D` model. Recommendation: when C3's Phase 3 ships real
relativity entities, treat them as input to a *new, separate bespoke `Sim3D` scene*, not as an adapter
target. Forcing this domain through `WorldFrameRenderer` would cost more than it returns.

---

## 3. CHEMISTRY / MOLECULAR

### A. Visualizations found

| File | What it shows |
|---|---|
| `labs/experiments/chemistry-vsepr.ts` (`VseprSim`) | 3D ball-and-stick molecular geometry, 13 real AXₙEₘ shapes with lone-pair clouds |
| `labs/experiments/biology-dnahelix.ts` | 3D B-DNA double helix; base-pair rungs separate as temperature crosses Tm |
| `labs/experiments/biology-proteinfolding.ts` | 2D canvas: HP-lattice chain folding under Metropolis Monte Carlo |
| `labs/experiments/chemistry-ising.ts` | 2D canvas: Ising spin lattice |
| `labs/experiments/chemistry-titration.ts` | 2D canvas: acid/base titration curve |
| `labs/chemistry.ts` (`BondSim`) | 2D canvas: bond-polarity electron-cloud skew |
| `labs/experiments/chemistry-kinetics-consequence.ts` | No rendering — Arrhenius `ModelGraph` consequence panel |
| `components/DrugDiscoveryScreen.tsx` and the dossier/discovery/precision screens | Plain React/DOM: forms, tables, text panels. **No canvas, no SVG, no THREE — nothing to adapt** |

### B. REAL or DEMO

**REAL, and VSEPR is the most rigorously grounded chemistry visual in the repo**: zero-lone-pair
geometries use exact polyhedron vertices, and NH₃ (106.8°) / H₂O (104.5°) use *measured* NIST/CCCBDB
bond angles rather than idealizations, with the idealized cases disclosed in `honestyNote`. The DNA
helix uses real crystallographic B-DNA constants (1.0 nm radius, 0.34 nm rise, ~10.5 bp/turn) and the
real empirical Wallace Tm rule, with the denaturation-curve width honestly labelled illustrative.
Protein folding is a real Metropolis HP-model (Dill 1985) on a deliberately simplified 2D lattice,
explicitly disclosed as unrelated to real 3D protein structure.

### The finding that actually matters: **no real backend returns atom coordinates**

Traced every real chemistry/biology backend model to its actual output shape (verified against real
fixtures in `src/__tests__/backendEvidenceExecution.test.ts`, corroborated by `router.ts`'s catalogue):

| Backend model | What it really returns to the browser |
|---|---|
| `chem-rdkit-descriptors` (real RDKit) | `molWt`, `crippenLogP`, `hbd`, `tpsa`, … — topological descriptors, **no 3D conformation** |
| `quantum-chemistry-pyscf-h2-rhf` (real PySCF) | `energyHartree`, `homoHartree`, `lumoHartree`, `dipoleDebye`, `nElectrons` — energies/orbitals only |
| `biology-openmm-md-1vii-reference` (real OpenMM 8.6, AMBER14 + OBC2, genuine Langevin MD on protein 1VII) | `atomCountAfterHydrogenAddition: 596`, three potential energies, `simulatedPicoseconds: 0.2` — **five scalars, including an atom *count*, and zero atom *coordinates*** |
| `biology-hiv-10e8-pdb-structural-comparison` (real Biopython, real PDB 5GHW/4G6F/5WDF) | `fab10e8RmsdAngstrom`, `fabMatchedCaAtoms` (a count) — RMSD scalars, not coordinate arrays |
| AutoDock Vina, ADMET-AI | **No implementation exists at all**, real or fake — mentioned only inside negative disclaimers |

So the optimistic premise ("the code probably already has an array of atoms with xyz per frame") is
false today for every real molecular backend — including the one case where a genuine trajectory *is*
computed server-side.

### The false friend: `moleculeWorldAdapter.ts` / `cellWorldAdapter.ts`

**Flagging this prominently because the naming makes it look like a shortcut to REUSE, and it is not.**
`core/world/moleculeWorldAdapter.ts` and `cellWorldAdapter.ts` adapt real backend runs into
`core/world/scientificWorldState.ts`'s `WorldState`/`WorldEntity` — a completely different,
**non-spatial** evidence/epistemic read model (`{ ref, label, properties: ScientificProperty[] }` plus
event/replay/provenance bookkeeping). `WorldEntity` has **no `position`, `rotation`, `scale`, or
`parentId` field at all**, and `moleculeWorldAdapter.ts` explicitly lists `'3d-conformation'` in its own
`CHEMISTRY_NOT_MODELED` disclosure array.

That is a different pipeline from the graphics one (whose real producer is
`core/worldModel/bridge/graphicsWorldFrameAdapter.ts`). These two files answer *"what evidence does
this run's molecule carry"*; `WorldFrameRenderer` needs *"where is this atom right now."* They cannot
be wrapped, because they carry no spatial payload to hand a `resolveVisual` in the first place.

### C. REUSE or REWRITE → **REWRITE-WHEN-READY (blocked on data, not architecture)**

Architecturally this is the one domain where the pattern *would* fit — an atom maps onto a
`WorldFrameEntity` almost perfectly, and the renderer's instanced lifecycle is well suited to hundreds
or thousands of them. But:

1. **The precondition doesn't exist** (see the table above). `WorldFrameRenderer`'s entire value is
   diffing a stream of frames from an external producer; there is no such producer for molecular
   coordinates today.
2. **VSEPR — the closest structural fit — has a static, discrete-selection population** (≤ 11 objects,
   rebuilt wholesale on shape change, no live solver streaming positions). Retrofitting diffing/
   instancing/honest-boundary machinery there solves problems it doesn't have.
3. **The DNA helix's rungs are connectors between two entities' positions**, which
   `ADAPTER_CONTRACT.md` §4 explicitly places *out of scope* for `resolveVisual`, directing exactly
   this case to stay as direct, hand-built geometry — which is what it already does. Converting it
   would fight the contract rather than honour it.
4. Protein folding, Ising, titration, bond-polarity, the kinetics consequence panel, and all four
   drug-discovery DOM screens are not 3D/spatial visualizations at all, so the question doesn't arise.

Also noted: `core/worldModel/domains/chemistryKinetics.ts` is the one real C3 chemistry domain already
on the spatial ECS, but it advances a single bulk "beaker" concentration entity — no atom-level
geometry — and isn't wired into any production scene. It would map onto exactly one `WorldFrameEntity`
(same trivial shape as the existing water-pump case) and tells us nothing either way about atoms.

### D. What a REUSE would require — the concrete trigger condition

The day a real backend returns per-atom coordinates per frame (most plausibly OpenMM, which already
computes the trajectory server-side and would "only" need to emit it), this becomes a strong, natural
fit: atom index → `WorldFrameEntity.id`, real per-frame xyz → `position`, element → `visualHint` (the
instanced batch key), per-atom real scalars → `scalars`, `grounding: 'MODELED'`. Bonds get built once,
directly, outside the adapter — the same treatment the pump-to-hospital pipe gets, and for the same
reason (`resolveVisual` only ever sees one entity at a time).

The exact data shape C2 needs in order to render that the day it arrives is specified in
**`SOLVER_DATA_CONTRACT.md`** (this document's companion). That contract is written so C3 can produce
conformant frames without guessing what C2 wants, and so C2 never has to invent a coordinate.

### E. Integration size

**The C2 side is medium-at-most, and it is not the bottleneck.** The adapter itself would be small —
the `waterInfrastructureBridge.ts` pattern transfers almost directly, plus a molecular geometry kit
(`createAtom`/`createBond`, which does not exist yet — VSEPR and the DNA helix each hand-roll their own
inline and share nothing). The real work is backend/C3-side: making a real solver emit coordinate
frames at all.

**Recommendation for Phase 4 scoping**: the question to put to C3/backend is *"can
`biology-openmm-md-*` (or a successor) return per-frame atom coordinates, and at what decimation?"* —
not *"how long will C2 need to build the renderer."* Until that is answered yes, there is nothing for
C2 to build here that wouldn't be guessing.

---

## 4. EPIDEMIOLOGY (C3 Phase 1 — the most urgent of the four)

*Added after the first three domains, because Phase 1 (Chemistry + Epidemiology coupling) makes this
the **first** domain that actually lands in a live WorldGraph — not one of the later phases. It is also
the only domain of the four whose verdict is not a straight REWRITE.*

### A. Visualizations found

| File | What it shows |
|---|---|
| `core/three/epidemicCity3D.ts` (2345 lines, `EpidemicCity3DSim`) | The flagship production city scene: streets/buildings, a live agent population, an analysis heatmap, transmission markers, hospital state, plus all the Visual World Build kits |
| `core/three/humanoidAgentVisual.ts` (386 lines) | `InstancedHumanoidCrowd` (the population at city scale) + `HumanoidAgentVisual` (an individually-detailed rig for a few close-up agents) + `mapSimAgentToHumanoid` |
| `core/three/characterRig.ts` (205 lines) | Shared humanoid rig geometry |
| `core/simulation/epidemicCity.ts` | The real agent-based epidemic model driving all of the above |
| `core/simulation/analysis.ts` (`computeField`, `heatColor`) | The density/risk/immunity heatmap field |
| `core/three/epidemicCity3D.ts`'s `analysisMesh` | One `InstancedMesh` of `PlaneGeometry` cells (36×24 grid) coloured per-cell from that field |
| `public/assets/genesis-procedural/ambulance/ambulance.glb` + `graphics/vehicleKit.ts` | The hospital ambulance (real GLB asset swapped in over a procedural fallback) |
| `core/world/epidemiologyWorldAdapter.ts`, `epidemicVirtualLabAdapter.ts` | **False friends** — same non-spatial evidence/`scientificWorldState.ts` family as `moleculeWorldAdapter.ts` in §3. No position field, not part of the graphics pipeline |

### B. REAL or DEMO

**REAL, and one of the strongest models in the repo.** `EpidemicCitySimulation` is a genuine
spatially-explicit agent-based SEIR process, not an animation of a precomputed curve. Per tick, in
order: interventions → agent movement toward real destinations (home/shop/school/park) → spatial
contact detection → exposure/transmission with **β = R0/D_infectious** and **P = 1 − e^(−β·Δt)** →
state transitions E→I→R/D driven by real incubation/infectious durations and IFR → isolation of
detected cases → statistics. It layers a real cohort model (age bands with their own susceptibility/
severity/fatality multipliers) and a real contact network with household-structure classification.
Deterministic under a fixed seed. Its own module doc is careful and correct: *"To PRAWDZIWY proces,
nie animacja wyniku"*, disclosed as educational, with an abstract "Pathogen X" — not a forecast.

The heatmap is equally real: `computeField(agents, …)` bins the **actual agent positions** into a
36×24 grid. The rendered colour is a real function of real per-agent state.

Decorative context is already correctly separated and tagged (`visualOnlyContext` /
`visualOnlyVehicle` / `visualOnlyInfrastructure`): the ambulance, street furniture, rooftop equipment,
signage, and the electrical cabinets are explicitly **not** presented as model entities. The
placeholder water pump is likewise already tagged `notModeled` through the §-2.0 water seam.

### C. REUSE / REWRITE / HYBRID → **HYBRID**

Three findings drive this, and the second one is the decisive one.

#### Finding 1 — this scene *already hosts a live `WorldFrameRenderer`*, in production, today

`epidemicCity3D.ts` imports `WorldFrameRenderer` and keeps one as
`private infrastructureRenderer: WorldFrameRenderer | null`, created in `initWaterInfrastructureSeam()`
and fed by `syncWaterInfrastructureSeam()` — running **alongside** its own bespoke `syncScene()`
without conflict. Unlike every other domain in this audit, the question "can a `WorldFrameRenderer`
coexist with this scene's own renderer?" is not hypothetical here: it has already shipped and is
covered by `epidemicCity3DWaterInfrastructureSeam.test.ts`.

That single fact is what makes HYBRID available for epidemiology and unavailable for quantum/
relativity. The integration mechanism does not need to be invented — it needs to be repeated.

#### Finding 2 (decisive) — C3's Phase 1 population entity carries **no spatial distribution at all**

Reading C3's own `worldModel/domains/epidemicSEIR.ts` (read-only, for context): `addPopulation()`
creates **exactly one** entity —

```
ref:          { kind: 'population', id: 'city-1' }
scale:        { level: 'MACRO_CITY' }
spatial:      { position: { x: 0, y: 0, z: 0 } }
domainState:  { S, E, I, R, D, t, beta }
grounding:    'MODEL_ESTIMATE'
```

— bound to the `epidemic-seir-rk4` solver, which RK4-integrates the compartmental ODE system in
`core/epidemic/sir.ts`. Its own doc discloses the model honestly: exact RK4 integration of a
**homogeneous-mixing** compartmental model.

So the two epidemiologies in this repo are **two different real models at different levels of
abstraction**, not one model rendered two ways:

| | `epidemicCity3D.ts`'s model | C3's `epidemicSEIR.ts` |
|---|---|---|
| Type | Agent-based, spatially explicit | Compartmental ODE (RK4) |
| Population | ~260 individually-positioned agents | 1 aggregate entity |
| Mixing | Real spatial contacts + contact network | Homogeneous by construction |
| Spatial data | Real per-agent x/z every tick | `{0, 0, 0}` — a placeholder |
| Output | Per-agent state + emergent statistics | 5 compartment scalars |

**The consequence is the core finding of this section:** you cannot drive the 260-agent crowd — or the
heatmap, which is computed *from agent positions* — from C3's five-number compartment vector. Doing so
would require inventing a spatial distribution that the compartmental model **explicitly does not
have** (homogeneous mixing means "no spatial structure" is a property of the model, not a gap in it).
That is fabrication of exactly the kind forbidden throughout this engine — the same class of error as
inventing atom coordinates in §3, and it would be *more* dangerous here because the result would look
completely plausible on screen.

What C3's entity **can** honestly drive: an aggregate, `MACRO_CITY`-scale readout — compartment
magnitudes, a single city-level marker/state, an epidemic-phase indication. Not individuals, not a
spatial field.

#### Finding 3 — the crowd is structurally un-adaptable anyway, independent of Finding 2

Even if C3 shipped per-agent positions tomorrow, `InstancedHumanoidCrowd` could not be wrapped as-is.
One agent occupies **one instance slot across eleven separate `InstancedMesh`es** (torso, head, hair,
2× arm, 2× leg, status, plus aura/ground-shadow), each with its own per-part offset, per-part colour
(shirt/skin/hair/pants tinted by health state), age-derived scaling, deterministic per-agent build
variation, and a **per-part animated gait** (`stride`/`armSwing` derived from speed and a continuous
gait phase).

`WorldFrameRenderer`'s `'instanced'` lifecycle offers, per entity: one instance in **one**
`InstancedMesh` per `batchKey`, positioned by `setInstanceTransform(position, rotation, scale)` where
scale is a **single uniform scalar** (`scale.setScalar()` — non-uniform scale is not expressible at
all), plus optionally one `setInstanceColor`. There is no way to express an eleven-part rig, per-part
colours, or a sub-tick walk cycle through that contract. (Also worth recording:
`getObjectForEntity()` returns `null` for instanced entities by design, so the existing per-agent
click-picking — `crowd.pickTargets()` / `agentIdForInstance()` — would have to be rebuilt against
`setInstanceColor` and batch-index bookkeeping.)

The crowd should therefore stay exactly as it is. It is not deficient; it is doing something the
generic renderer was explicitly not built to do.

### D. What to change, concretely

**Keep, untouched:** the agent crowd, the heatmap, transmission markers, `SimulationClock`-driven
`syncScene()`, and the whole agent-based model. None of it is a duplicate renderer to be consolidated
away — it renders a *different real model* from the one C3 Phase 1 ships.

**Add, when C3's Phase 1 coupling lands, following the water-seam pattern already in this file:**

1. A small `epidemiologyBridge.ts` in `graphics/`, built per `ADAPTER_CONTRACT.md`: a
   `resolveVisual`/`updateVisual`/`dispose` triple for `visualHint: 'population'`, geometry built at
   local origin, `KNOWN_STATES` allowlist over whatever discrete epidemic phase C3 exposes (if it
   exposes one at all — if it only exposes continuous compartments, drive appearance from `scalars`
   and skip the status gate entirely).
2. A second `WorldFrameRenderer` instance in `epidemicCity3D.ts` — or a shared one — fed by a small
   `syncEpidemiologySeam()`, exactly mirroring `initWaterInfrastructureSeam()`/
   `syncWaterInfrastructureSeam()`.
3. A frame builder mapping C3's population entity → one `WorldFrameEntity` with
   `scalars: { S, E, I, R, D }`, `grounding` carried through from C3's `MODEL_ESTIMATE`, and a **real**
   position chosen by the scene (e.g. the city centroid or the hospital), *not* `{0,0,0}` reinterpreted
   as a world coordinate.
4. Tests in the mould of `epidemicCity3DWaterInfrastructureSeam.test.ts`: the aggregate entity renders,
   carries no `worldSelection`, never drives per-agent visuals, and stays neutral when C3 supplies no
   recognised state.

**A contract gap this domain exposes — worth folding into `ADAPTER_CONTRACT.md` later.**
That document's honesty axis is *state realness* (`isReallyModeled()`: is this reading backed by a
solver?). Epidemiology surfaces a **second, orthogonal axis: aggregation level.** An entity at
`MACRO_CITY` scale, whose model is homogeneous-mixing by construction, must never be rendered as N
individuals at invented positions — even though every individual field involved would pass the
existing `isReallyModeled()` gate. Proposed rule, for whoever next edits that contract: *an adapter
must render at the aggregation level of the entity it was given, and never disaggregate.* This is not
written down anywhere today, and epidemiology is the first domain where it bites.

**Integration hazard to flag for Phase 1 (UI-level, not rendering-level).** Once both models run in the
same scene, there will be two different, both-real infection counts on screen — the agent-based one and
C3's compartmental one. They **will** diverge (different models, different assumptions). Whoever wires
the panels must label which number comes from which model rather than presenting them as one figure;
silently showing both as "infected" would be a genuine scientific-honesty failure that no amount of
correct rendering would fix.

### E. Estimated work

| Piece | Size | Notes |
|---|---|---|
| `epidemiologyBridge.ts` + seam wiring + tests | **Small** | The water seam is a direct template; the scene already hosts a `WorldFrameRenderer`. Realistically a single focused session. |
| Aggregate `MACRO_CITY` visual for the population entity | **Small–medium** | Depends entirely on what C3 exposes; a compartment readout/marker is small, anything richer grows. Needs a design decision, not new architecture. |
| Driving the existing agent crowd from C3 | **Not possible** | Blocked on C3 shipping spatially-resolved sub-populations (a metapopulation / per-district compartment model). That is a C3 modelling decision, **not** C2 work, and must not be worked around. |
| Rewriting `epidemicCity3D.ts` onto `WorldFrameRenderer` wholesale | **Large — and not recommended** | Would delete a working, real, tested renderer to gain nothing; Findings 2 and 3 both argue against it. |

**Bottom line for Phase 1 sequencing:** C2 is ready. The seam pattern is proven in this exact file, the
adapter is small, and nothing needs to be built before C3's coupling exists. The one question worth
putting to C3 now — the epidemiology equivalent of the OpenMM coordinates question in §3 — is:
***will the Phase 1 population entity stay a single `MACRO_CITY` aggregate, or will it be
spatially resolved into per-district sub-populations?*** The answer decides whether C2 renders one
city-level marker or a real spatial field, and it is much cheaper to answer now than after the coupling
ships.

## Cross-domain findings

Four things came out of the four audits, and all are worth carrying forward:

1. **Almost every existing 3D visualization in this repo is a bespoke, self-contained `Sim3D`** that
   owns its camera, its full geometry lifecycle, and its own animation clock. That is exactly the "one
   bespoke world, one bespoke renderer" case `graphics/README.md` §13 already contrasts with
   `WorldFrameRenderer`'s actual target ("rendering a world whose entities the ENGINE never
   hand-authored"). Almost none was built with an external per-tick frame producer in mind, so almost
   none offers a seam to wrap. This is not a defect in those scenes — it is the correct design for
   what they are.
2. **The one exception is `epidemicCity3D.ts`, and it is the important one** (§4): it already hosts a
   live `WorldFrameRenderer` beside its own bespoke `syncScene()`, shipped and tested via the water
   seam. Coexistence is therefore a *demonstrated* property of this codebase, not a hope — which is
   precisely why epidemiology gets a HYBRID verdict while the other three do not. **A bespoke `Sim3D`
   and a `WorldFrameRenderer` in the same scene is a supported, proven arrangement.** Nobody needs to
   choose between them.
3. **For Chemistry and Epidemiology alike, the blocker is data shape, not rendering architecture** —
   in mirror-image forms. Chemistry has a renderer-friendly shape in principle but *no coordinates at
   all* reaching the frontend (§3). Epidemiology has a real solver already producing real state, but
   at an *aggregation level* (one homogeneous-mixing `MACRO_CITY` entity) that cannot legitimately
   drive the per-agent spatial visuals the scene already has (§4). In both cases the tempting move —
   synthesising the missing detail — is the forbidden one. (Note the distinction
   `waterInfrastructureBridge.ts` draws: building a *seam* ahead of real data is the blessed pattern;
   fabricating the *entity* — an invented id, a guessed position, a state with no model behind it — is
   the forbidden one.)
4. **A gap in `ADAPTER_CONTRACT.md`, surfaced by epidemiology**: that document's honesty axis is
   *state realness* (`isReallyModeled()`). Epidemiology exposes a second, orthogonal axis —
   **aggregation level**. An aggregate entity must never be rendered as N individuals at invented
   positions, even when every field involved would pass the existing gate. Proposed rule for whoever
   next edits the contract: *an adapter renders at the aggregation level of the entity it was given,
   and never disaggregates.* See §4.D.

## Sequencing recommendation

- **Do not pre-build any of these four adapters.** Three are blocked on data that does not exist yet;
  the fourth (epidemiology) is small enough that it is cheaper to build once C3's coupling is real
  than to guess at its shape now.
- **Epidemiology (Phase 1, now)** is the live one. C2 is ready: the seam pattern is proven inside the
  target file itself and the adapter is small. The one question to put to C3 *before* the coupling
  ships: **will the population entity stay a single `MACRO_CITY` aggregate, or be spatially resolved
  into per-district sub-populations?** That answer decides what C2 can honestly render. Also flag the
  two-models hazard in §4.D to whoever wires the panels.
- **Chemistry/Molecular (Phase 4)**: raise the coordinate-output question with C3/backend while Phase 4
  is being scoped — *"can `biology-openmm-md-*` return per-frame atom coordinates, and at what
  decimation?"* That is the only other near-term legitimate REUSE opportunity.
- **Quantum and Relativity (Phases 2–3)**: treat as "will need new, purpose-built scenes when their
  real WorldGraph data ships" — not adapter candidates, regardless of when those phases land. For
  Relativity specifically, staying bespoke is very likely the *right permanent answer*, not a
  temporary one.
