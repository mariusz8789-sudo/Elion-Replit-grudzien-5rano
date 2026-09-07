# Solver Data Contract — what C3 must ship for C2 to render it

**Audience: C3 (and anyone adding a domain solver). This document is a requirement, not a
suggestion.** It is written to be *satisfied*, so it uses MUST / SHOULD / MAY in the RFC 2119 sense.

**Status: specification. No code was written to implement any of it** — deliberately, because building
a renderer for data that does not exist yet is the failure mode this whole document family exists to
prevent.

## The one-line division of labour

> **C3 owns *what exactly we are showing*. C2 owns *how it looks*.**
> C3 ships structured scientific state. C2 turns it into pixels. Neither invents the other's half.

The corollary that makes this document necessary: **C2 will never fabricate data it was not given.**
If a solver does not supply atom positions, C2 does not guess them — it renders the honest
`NOT_MODELED` placeholder instead. So every gap in what C3 ships is directly visible as a gap in what
Genesis can show. This document exists so those gaps are known in advance rather than discovered
during integration.

## Where this sits in the document family

| Document | Question it answers | Audience |
|---|---|---|
| `VISUALIZATION_REUSE_AUDIT.md` | *Which domains already have a real visualization, and can it be reused?* | C2, planning |
| **`SOLVER_DATA_CONTRACT.md`** (this one) | ***What data must a solver produce for C2 to render it at all?*** | **C3, implementing** |
| `ADAPTER_CONTRACT.md` | *Given that data, how is an honest C2 adapter written?* | C2, implementing |

Read them in that order. This document assumes `worldFrame.ts` and `worldFrameRenderer.ts` are the
rendering contract, and it does not restate them — it specifies what must arrive at their door.

---

## 1. The pipeline that already exists

This is not a proposal. All three hops are real, shipped code today:

```
C3 solver writes a WorldModelEntity          (worldModel/ecs/types.ts)
        │   components: spatial / physics / chemical / domainState / grounding / statusLabel
        ▼
getFrameState(engine, timestamp?)             (worldModel/bridge/worldFrameState.ts)
        │   → WorldFrameState { tick, simulatedTime, branchId, entities[], events[] }
        │   flattens components into `scalars`, copies transform, carries grounding
        ▼
toGraphicsWorldFrame(frame)                   (worldModel/bridge/graphicsWorldFrameAdapter.ts)
        │   → C2's WorldFrame { time, entities[] }   (three/graphics/worldFrame.ts)
        ▼
WorldFrameRenderer.sync(frame)                (three/graphics/worldFrameRenderer.ts)
        │   → per-entity resolveVisual / updateVisual, per ADAPTER_CONTRACT.md
        ▼
pixels
```

**Two ways to build the final `WorldFrame`, both legitimate:**

- **Generic:** call `toGraphicsWorldFrame()`. Field-for-field, zero decisions. Use this when the
  entity's `ref.kind` is already the right visual hint and no discrete state derivation is needed.
- **Scene-owned:** the scene hand-builds the `WorldFrame` from `getFrameState()`'s output.
  `genesisScientificCitySim.ts` does exactly this today, precisely so it can override `visualHint`
  and derive a discrete status from a numeric scalar (see Rule 3). **This is the expected path for
  any domain with real state driving appearance.**

C3's contract surface is therefore the **`WorldModelEntity`** it writes. Everything below is expressed
in those terms.

### What C3 fills, and where it surfaces

| C3 writes | Reaches C2 as | Notes |
|---|---|---|
| `spatial.position` | `entity.position` | **Absolute.** See Rule 1 |
| `spatial.rotation` | `entity.rotation` | Euler radians |
| `spatial.scale` | `entity.scale` | **`.x` only** — collapsed to one scalar, see Rule 1 |
| `spatial.boundingRadius` | *(not forwarded today)* | Used by C3/C1; see §7 gaps |
| `physics.*`, `chemical.*` | merged into `entity.scalars` | Fixed key names, see Rule 2 |
| `domainState` (`Record<string, number>`) | merged into `entity.scalars` **verbatim** | The main channel. Rule 3 |
| `grounding` | `entity.grounding` (3-tier) | Mapped, see Rule 5 |
| `statusLabel` | `entity.status` | **Prose. Not a machine-readable state.** Rule 3 |
| `ref.kind` | `entity.visualHint` | **Also the instanced batch key.** Rule 4 |
| `scale.parentEntityId` | `entity.parentId` | Hierarchy |
| relationships (`from`,`to`,`kind`) | **nothing — no channel exists** | See §C, a real gap |

---

## 2. Universal rules

These apply to **every** data type below. A solver that violates one of these produces something C2
either cannot render or can only render dishonestly.

### Rule 1 — Positions are ABSOLUTE (in the parent's space); geometry is local-origin

`WorldFrameRenderer.applyTransform()` runs on **every** `sync()` and does, unconditionally:

```ts
object.position.set(...entity.position);
if (entity.rotation) object.rotation.set(...entity.rotation);
object.scale.setScalar(entity.scale ?? 1);
```

Consequences C3 must respect:

- **C3 MUST supply the entity's real position every frame it wants it to be there.** There is no
  "unchanged" or delta encoding. C2 does not remember a previous position; it overwrites from the
  frame every time.
- **Positions are absolute within the parent's coordinate space** (world space for a root entity;
  the parent's local space when `parentId` is set). They are not offsets from a previous frame.
- **`scale` collapses to a single scalar.** `graphicsWorldFrameAdapter.ts` takes `scale.x` and
  documents this: C3's `SpatialComponent.scale` is a `Vector3`, but no real domain sets it
  non-uniformly today. **A genuinely anisotropic entity is NOT expressible** through this contract —
  if a solver needs one, that is a contract change on both sides (§7), not something to approximate.
- C2's side of this: an adapter builds its geometry at **local origin `[0,0,0]`** and never bakes in
  an absolute position (`ADAPTER_CONTRACT.md` rule 4). C3 does not need to do anything for this; it
  is stated here so both sides can see why the position channel is the single source of truth.

**Hazard C3 MUST avoid: a missing `spatial` component is silently rendered at the world origin.**
`worldFrameState.ts` does `position: entity.spatial?.position ?? ZERO`. An entity with no spatial
component and an entity genuinely located at `{0,0,0}` are **indistinguishable** downstream. If an
entity has no meaningful position, C3 MUST NOT leave `spatial` absent and hope — it MUST either omit
the entity from the frame, or mark it `UNGROUNDED_APPROXIMATION` so it renders as an honest
placeholder rather than as a real object sitting at the origin. (This is not hypothetical:
`epidemicSEIR.ts`'s population entity is at `{0,0,0}` today precisely because a compartmental model
has no position — see `VISUALIZATION_REUSE_AUDIT.md` §4.)

### Rule 2 — Units are explicit, in the field name. Always.

The existing convention, already established across `collectScalars()`, is **the unit suffix is part
of the key**: `massKg`, `densityKgM3`, `temperatureK`, `pressurePa`, `viscosityPaS`, `speedMS`,
`energyStateEv`, `activationEnergyKJ`.

- **C3 MUST name every scalar with its unit suffix** unless the quantity is genuinely dimensionless
  (`concentrationFraction`, `charge`, a probability, a count).
- **C3 MUST NOT** ship a bare `temperature`, `energy`, `distance`, or `time`. There is no implicit
  unit and C2 will not assume one.
- **SI is the default.** Where a domain has an overwhelming conventional non-SI unit (ångströms for
  atomic coordinates, electronvolts for orbital energies, picoseconds for MD time), that unit MAY be
  used — but the name MUST say so (`positionAngstrom`, `energyEv`, `timePs`).
- **Positions are the one exception, and it is a strict one**: `spatial.position` is a typed
  `Vector3` with no room for a suffix, so **world-space positions MUST be in the scene's world units**
  (see §B). A solver working in ångströms MUST convert, and MUST also expose the raw value and its
  scale factor as named scalars so the conversion is auditable.

### Rule 3 — `scalars` is the machine-readable channel. `statusLabel` is prose and MUST NOT be relied on for state.

**This is the most important rule in this document, and the one most likely to be got wrong.**

`ADAPTER_CONTRACT.md`'s honesty gate is an allowlist over discrete tokens:

```ts
KNOWN_STATES.has(entity.status ?? '')     // e.g. 'NORMAL' | 'WARNING' | 'FAILED' | 'OFFLINE'
```

But `entity.status` is fed from C3's `statusLabel`, and **every real C3 solver today writes
human-readable prose there**:

| Solver | Actual `statusLabel` value |
|---|---|
| `genesisScientificCity3.ts` | `'Pump tripped (overload protection)'` |
| `hydraulicsPumpPipe.ts` | `` `Q=${…}m³/s, ${…}W shaft power` `` |
| `epidemicSEIR.ts` | `` `I=42 R=13 D=2 (day 7.5)` `` |
| `chemistryKinetics.ts` | `` `${stateLabel} (${…}%)` `` |
| `electricalGenerator.ts` | `generatorStatusLabel(status)` |

**None of these can ever match a discrete allowlist.** An adapter written naively against
`ADAPTER_CONTRACT.md` and fed by a real solver would classify every entity as `notModeled`, forever,
silently. That is a real mismatch between the two contracts, and this rule is how it is resolved:

- **C3 MUST expose the discriminating quantity as a NUMBER in `domainState`**, which reaches C2
  verbatim in `scalars`. Example, already live: the pump's `volumetricFlow`.
- **C3 MUST document each such scalar's semantics** — its unit, its range, and what threshold means
  what — in the solver's own module doc. C2 cannot invent thresholds.
- **The frame builder (C2 scene layer) derives the discrete token from that number**, and this
  derivation is a reviewable rule, not a fabrication. The production pattern, from
  `genesisScientificCitySim.ts`:

  ```ts
  const status = isPump
    ? (entity.scalars.volumetricFlow === 0 ? 'FAILED' : 'NORMAL')
    : entity.statusLabel;
  ```

  Its own comment states the principle exactly: *"a real domain fact (WHAT changed, C1's job)
  computed here from the pump's own real solver output, never a fabricated label."*
- **`statusLabel` MAY still be shipped** — it is genuinely useful for panels, tooltips and C1
  narration. It simply MUST NOT be the channel an adapter gates appearance on.
- **C3 MAY additionally ship a discrete code as a number** (e.g. `generatorStatusCode: 0|1|2`) when a
  domain really has an enumerated state. This is the cleanest option and SHOULD be preferred for any
  domain with genuinely discrete modes. If C3 does this, it MUST document the code↔meaning mapping
  next to the solver.

`domainState` is typed `Record<string, number>` — **numbers only**. There is no string channel into
`scalars`, and that is deliberate.

### Rule 4 — Entity order MUST be stable across frames

`WorldFrameRenderer` has an incremental fast path for instanced populations (atoms, particles,
agents). It reuses the existing `InstancedMesh` and retunes transforms in place — **but only when the
batch's membership is unchanged**, which it tests as:

```ts
existing.geometry === firstSpec.geometry
  && existing.material === firstSpec.material
  && existing.order.length === entities.length
  && existing.order.every((id, i) => id === entities[i].id)   // SAME SET *AND* SAME ORDER
```

If that check fails, the entire batch is torn down and rebuilt from scratch: a full GPU buffer
reallocation, every frame.

- **C3 MUST emit entities of the same `ref.kind` in a stable, deterministic order across frames.**
  For atoms, the natural stable key is the atom index from the source structure — and it MUST NOT be
  reordered by any sort, filter, `Map` iteration accident, or parallel-worker completion order.
- **C3 MUST keep entity `id`s stable across frames** for anything persistent. A regenerated id makes
  the renderer dispose and rebuild the object, losing any per-entity state (and, for individually
  tracked objects, causing a visible pop).
- Membership changes (an atom appearing/leaving, a population growing) are fully supported — they just
  cost a rebuild, which is correct and expected for a genuine structural change. The rule exists to
  prevent paying that cost **every frame for no reason**.
- `ref.kind` doubles as the instanced **batch key** (it becomes `visualHint`). Entities that should
  batch together MUST share a `ref.kind`; entities that must be visually distinct in geometry MUST
  NOT. For atoms, the element symbol is the natural batch key (all carbons in one batch).

### Rule 5 — Grounding: four C3 tiers, three C2 tiers, one honest fallback

`graphicsWorldFrameAdapter.ts` already defines the mapping, and C3 MUST set `grounding` truthfully
because it is what makes the honest-placeholder path work:

| C3 `GroundingLevel` | → C2 `EntityGrounding` | What C2 renders |
|---|---|---|
| `GROUNDED_EXACT` | `MODELED` | Real geometry, real state |
| `MODEL_ESTIMATE` | `MODELED` | Real geometry, real state |
| `PROCEDURAL_APPROXIMATION` | `DERIVED` | Real geometry, real state |
| `UNGROUNDED_APPROXIMATION` | `NOT_MODELED` | **Generic wireframe placeholder — never reaches the domain adapter at all** |

`UNGROUNDED_APPROXIMATION` is not a failure state to be avoided; **it is the correct, honest answer
whenever a solver has no real backing for an entity.** Using it is always preferable to shipping a
plausible-looking invented value. C2 handles it entirely inside `WorldFrameRenderer` — the domain
adapter never even sees the entity.

### Rule 6 — Render at the aggregation level you were given; never disaggregate

An entity at `MACRO_CITY` scale whose model is homogeneous-mixing by construction MUST NOT be
rendered as N individuals at invented positions — even though every individual field would pass the
`isReallyModeled()` gate. This is a second, orthogonal honesty axis to state-realness, surfaced by
epidemiology (`VISUALIZATION_REUSE_AUDIT.md` §4).

- **C3 MUST set `scale.level`** (`ScaleDomain`) truthfully — it is how C2 knows what aggregation level
  it is looking at. `MICRO_MOLECULAR` and `NANO_ATOMIC` already exist in that enum for Phase 4.
- **C3 SHOULD split an aggregate into sub-entities when, and only when, the model genuinely resolves
  them** (e.g. per-district sub-populations from a metapopulation model). Splitting an aggregate that
  the model does not resolve is fabrication.
- **C2 MUST NOT disaggregate.** One entity in, one visual out.

### Rule 7 — C3 MUST NOT ship appearance

No colours, no hex values, no material names, no opacity, no "render this as a red sphere". C2 owns
appearance entirely (`materials.ts`, `visualState.ts`, the kits). C3 ships *quantities and identity*;
the mapping from quantity to colour is a C2 design decision that must stay changeable without touching
a solver.

The one thing C3 legitimately ships that *influences* appearance is **identity**: `ref.kind`, and for
molecules the element symbol / `chemical.formula` / `chemical.smiles`. Those are facts, not styling.

---

## 3. Per data type

Each type below states **MINIMUM** (what MUST be present for C2 to render anything at all),
**OPTIONAL** (what MAY be added, and what C2 will do with it), and **IF MISSING** (the honest fallback
— never fabrication).

### §A. Scalars — energy, temperature, descriptors, compartment counts

**These need no geometry adapter at all.** This is the cheapest, most immediately useful thing a
solver can ship, and for several domains it is *all* that is needed.

- **MINIMUM:** a numeric value in `domainState` (or a recognised `physics`/`chemical` field), keyed
  with its unit per Rule 2. That is the whole requirement. It flows through `collectScalars()` into
  `entity.scalars` verbatim and is available to any panel, any `updateVisual`, and C1 narration.
- **OPTIONAL:** a `statusLabel` prose summary for human display (Rule 3); a discrete numeric status
  code; documented thresholds so C2 can map ranges to visual states.
- **IF MISSING:** the key is simply absent from `scalars`. C2 MUST NOT substitute a default, a zero,
  or a last-known value. An adapter that needs a scalar it did not get MUST take the `notModeled`
  path per `ADAPTER_CONTRACT.md`.

**Phase applicability:** PySCF orbital energies, RDKit descriptors, ADMET predictions, MD potential
energies, SEIR compartments, Kerr spin parameter — **all of these are already fully expressible today
with zero contract changes.** If a domain's visualization need is "show me the numbers", it is not
blocked on anything.

### §B. Positions — atoms, particles, discrete bodies

- **MINIMUM (per rendered object):**
  - a stable `id` (stable across frames — Rule 4),
  - `spatial.position` as a real `Vector3` in **scene world units** (Rule 1, Rule 2),
  - `ref.kind` — the visual hint and instanced batch key (Rule 4),
  - truthful `grounding` (Rule 5),
  - truthful `scale.level` (Rule 6).
- **OPTIONAL:**
  - `spatial.rotation` (Euler radians) — omit for spherical things like atoms; it costs nothing but
    means nothing for a sphere,
  - `spatial.scale` — **uniform only** in practice (Rule 1); for atoms this is the natural channel for
    van der Waals radius *if* the solver has a real one,
  - per-object `scalars` (partial charge, per-atom energy, B-factor) — drives colour/emphasis via a
    documented C2 mapping,
  - `parentId` to nest atoms under a molecule root entity, which then lets the whole molecule be moved
    or framed as one unit.

**Units and coordinate frame — C3 MUST state all four of these explicitly for any coordinate-producing
solver:**

1. **The source unit** (ångström, nanometre, Bohr radius…).
2. **The conversion factor applied** to reach scene world units, exposed as a named scalar on the
   molecule root entity (e.g. `angstromPerWorldUnit`) so the scaling is auditable rather than folded
   silently into the numbers.
3. **The origin convention** — centre of mass, first atom, box corner, or the source file's own frame.
   C2 will not re-centre; what arrives is what is drawn.
4. **The handedness / axis convention** if it is anything other than the scene's own right-handed
   Y-up. C2 does not detect or correct this; a mirrored molecule renders mirrored and looks entirely
   plausible, which makes this failure mode particularly expensive to catch late.

**Scale guidance (informational, not a requirement):** the existing city scene uses
`CITY_WORLD_SCALE = 0.018` world units per simulation unit, and typical scene objects are ~0.2–20
world units. A 596-atom protein at 1 Å = 1 world unit would be ~50 units across — usable, but the
molecule root SHOULD carry a scale factor rather than every atom being pre-scaled, so the choice stays
adjustable.

- **IF MISSING:** no `spatial.position` means the entity lands at the world origin, indistinguishable
  from a real origin position (Rule 1's hazard). C3 MUST NOT rely on that. If positions genuinely do
  not exist, the entity MUST be `UNGROUNDED_APPROXIMATION` (honest placeholder) or omitted.

**Phase applicability:** this is the **blocking gap for Phase 4** (`VISUALIZATION_REUSE_AUDIT.md` §3):
no real backend — RDKit, PySCF, Biopython, or OpenMM — returns per-atom coordinates to the frontend
today, even though OpenMM genuinely computes them server-side. Everything in this section is ready and
waiting; nothing can use it until coordinates cross the API boundary.

### §C. Bonds and edges — **a real gap: no channel exists today**

**C3 already models edges**: `WorldGraph.addRelationship(from, to, kind)` →
`EntityRelationship { from, to, kind }`, with a `RelationshipCategory` taxonomy
(`hierarchy`/`spatial`/`functional`/`dependency`/`causal`).

**But `WorldFrameState` has no relationships channel.** Its shape is
`{ tick, simulatedTime, branchId, entities, events }` — edges are exposed only via
`scientificWorldState.ts`'s `WorldState`/`WorldRelation` (the non-spatial evidence model, and a
documented false friend — `VISUALIZATION_REUSE_AUDIT.md` §3). **Relationships therefore cannot reach
C2 through the frame contract at all today.**

This is compounded by a rule on C2's side: **a connector between two entities is explicitly out of
scope for `resolveVisual`**, which only ever receives *one* entity at a time and cannot know the other
endpoint (`ADAPTER_CONTRACT.md` §4). Connectors are built directly by the scene, once, when both
endpoints are known — which is exactly what `genesisScientificCitySim.ts` does for the pump→hospital
pipe.

**Required to close this, when a domain actually needs bonds:**

- **MINIMUM:** a bond list reaching the frame as `{ fromEntityId, toEntityId, kind }` — pairs of
  **entity ids**, not array indices (indices break the moment membership changes; ids are the stable
  key per Rule 4). This requires **adding a relationships channel to `WorldFrameState`** — a real,
  small contract change on C3's side, which MUST be agreed before Phase 4 rather than worked around.
- **OPTIONAL:** bond order (`1`/`1.5`/`2`/`3`) as a number; aromaticity flag as `0|1`; per-bond
  scalars (length, computed strength) — all numeric, per Rule 2.
- **IF MISSING:** C2 renders atoms **without bonds**. It MUST NOT infer bonds from interatomic
  distance — distance-based bond inference is a cheminformatics decision with real failure modes, it
  belongs in RDKit on C3's side, and a wrong inferred bond is indistinguishable from a real one on
  screen. Unbonded atoms are honest; guessed bonds are not.

**Interim option that needs no contract change:** if a molecule is static for a scene's lifetime, the
bond list MAY be delivered once, out-of-band, alongside the structure (as part of the same payload
that carries coordinates), and the scene builds the bond geometry directly — the pump→hospital pipe
pattern. This works for a fixed structure; it does not work for bonds that form or break during a
simulation.

### §D. Trajectories — who holds the frames, who interpolates

- **MINIMUM:** **one frame per `sync()`.** C2's contract is `sync(frame)` — a single instantaneous
  snapshot. C3 MUST NOT hand C2 a whole trajectory blob and expect it to play it back; there is no
  playback machinery in `WorldFrameRenderer`, by design.
- **C3 owns time.** The engine already provides exactly this: `getFrameState(engine, timestamp?)` takes
  an optional timestamp and scrubs via the real `TemporalEngine.scrubTo`. Replay and scrubbing are
  therefore **already solved on C3's side** and MUST be used rather than reimplemented in C2 —
  `genesisScientificCitySim.ts` already renders historical state this way.
- **Interpolation: neither side, by default.** C2 renders the frame it is given. It MUST NOT
  interpolate between two solver frames to smooth motion, because an interpolated position is an
  invented position — the same class of error as inventing coordinates outright. If smooth motion is
  wanted:
  - the honest option is **C3 supplies frames at a rate that already looks smooth**, or
  - a scene-level, explicitly-labelled visual smoothing MAY be applied to *decorative* motion only,
    never to a value read as a measurement, and never in a way that makes an interpolated frame
    indistinguishable from a solved one.
- **Decimation is C3's decision and MUST be stated.** MD integrates at femtosecond timesteps; nothing
  should render at that rate. C3 MUST document the emitted frame interval (e.g. "one frame per 1 ps,
  from 2 fs steps") and SHOULD expose it as a scalar (`frameIntervalPs`) so the UI can label the
  timeline truthfully rather than implying continuous observation.
- **OPTIONAL:** per-frame aggregate scalars (potential energy, temperature, RMSD) alongside positions
  — these ride the ordinary `scalars` channel (§A) and are useful even when coordinates are absent.
- **IF MISSING (only aggregate scalars, no per-frame coordinates):** exactly the OpenMM situation
  today. C2 renders the scalars (a real, honest plot/readout) and **no molecular geometry**. This is a
  legitimate, shippable state — not a degraded one.

### §E. Fields — volumetric and gridded data — **not expressible today**

Scalar/vector fields (electron density, orbital isosurfaces, temperature or concentration fields,
spacetime curvature) have **no representation in the current contract**. `WorldFrameEntity` carries a
transform plus flat named scalars; there is no array, grid, or texture channel, and adding one is a
real contract change on both sides.

**If a domain needs a field, C3 MUST specify all of these before any C2 work starts:**

- **Discretisation:** regular grid, adaptive/octree, or unstructured point cloud.
- **Resolution:** explicit dimensions (e.g. `64×64×64`), and the physical extent those cells span —
  with units (Rule 2).
- **Layout:** array ordering (x-fastest vs z-fastest), and the origin corner. An off-by-one axis
  convention produces a transposed field that still looks like a plausible field.
- **Value semantics:** what the number *is* (density in e/Å³, temperature in K…), its expected range,
  and whether it is signed.
- **Transport format:** a typed array (`Float32Array`) is the only sane option at any real resolution;
  JSON numbers are not viable for 262k cells.
- **Update rate:** static per structure, or per trajectory frame — this changes the design completely.

**Interim, available today with no contract change:** a field MAY be reduced by C3 to something the
existing contract already carries — e.g. an **isosurface extracted on C3's side and delivered as
geometry**, or a coarse grid expressed as N discrete entities (the existing city heatmap is exactly
this: a 36×24 `InstancedMesh` grid). Reduction is C3's call because it is a scientific decision about
what the field means, not a rendering decision.

**IF MISSING:** no field is rendered. C2 MUST NOT synthesise one by interpolating between point values
— a smooth invented field is the most convincing-looking fabrication available, and therefore the most
dangerous.

### §F. Identity and material inputs

- **MINIMUM:** `ref.kind` (Rule 4 — routing and batching).
- **OPTIONAL, and genuinely useful:** `chemical.formula`, `chemical.smiles` (already in the schema);
  element symbol per atom — which SHOULD be the `ref.kind` itself so that batching falls out
  naturally; `label` for UI.
- **C3 MUST NOT ship** colours, materials, opacity, or any styling (Rule 7).
- **IF MISSING:** with no `ref.kind`, `visualHint` is undefined and no adapter can route the entity;
  `WorldFrameRenderer`'s built-in default (a plain grey sphere) renders instead. That default is
  usable but anonymous — it is a fallback, not a design.

---

## 4. Per-phase checklist

### Phase 2 — Quantum

`VISUALIZATION_REUSE_AUDIT.md` §1 concluded the existing quantum visualizations cannot be wrapped, so
a new C2 scene will be needed. What C3 must decide first:

- [ ] **What is a quantum WorldGraph entity?** One qubit? A register? A device? This is the blocking
      question; everything else follows from it.
- [ ] If a Bloch-vector visual is wanted: ship `bx`, `by`, `bz` as **numeric scalars** (§A) — this is
      sufficient and needs no new contract machinery.
- [ ] `scale.level` — likely `NANO_ATOMIC`, or a new level if none fits.
- [ ] Grounding: exact state-vector simulation is `GROUNDED_EXACT`; anything phenomenological
      (decoherence models) is `MODEL_ESTIMATE`.
- [ ] Do **not** attempt to ship a full state vector as scalars — 2ⁿ complex amplitudes do not belong
      in a flat `Record<string, number>`; that is a field-class problem (§E).

### Phase 3 — Relativity

The audit recommends these scenes stay bespoke (§2), so C3 should not expect an adapter. Still useful:

- [ ] Ship derived observables as scalars (§A): γ, Doppler factor, ISCO frequency, chirp mass, horizon
      radius. These are immediately renderable in panels today.
- [ ] Geodesic paths are a **trajectory-of-one-particle** problem (§D) — one frame per sync, C3 owns
      time, no C2 interpolation.
- [ ] Spacetime curvature as a visual field is §E and needs the field contract first.

### Phase 4 — Molecular / biotech

This is where the contract bites hardest, because everything is ready except the data:

- [ ] **The blocking question: can a real backend return per-atom coordinates?** Most plausibly OpenMM,
      which already computes them server-side and currently returns only five scalars.
- [ ] If yes → §B in full: stable ids, absolute positions, stated units/origin/handedness/conversion,
      `ref.kind` = element symbol, stable ordering.
- [ ] Decide the decimation and state it (§D): frames per picosecond, from what integration timestep.
- [ ] Bonds → §C, which **requires adding a relationships channel to `WorldFrameState`** (or the
      out-of-band interim). Agree this before implementation starts.
- [ ] Orbitals/density → §E; expect to reduce to an isosurface on C3's side.
- [ ] Descriptors/ADMET/energies → §A, **already fully supported today, no blockers.**

---

## 5. What C2 commits to in return

So this is a contract and not a list of demands:

- **C2 will render whatever satisfies the minimums above, without asking C3 to change shape again.**
  The pipeline is built and proven end to end (the water seam runs in production today).
- **C2 will never fabricate a missing value** — no default positions, no inferred bonds, no
  interpolated frames presented as solved ones, no invented state. Missing data renders as the honest
  `NOT_MODELED` placeholder or not at all.
- **C2 owns appearance and will keep it changeable** without requiring a solver edit.
- **C2 will state its derivations.** Where a scene maps a numeric scalar to a discrete visual state
  (Rule 3), that mapping lives in reviewable code with a comment naming the real quantity it reads —
  the `volumetricFlow === 0 → 'FAILED'` pattern.
- **C2 will not build an adapter before its data exists.** Building against imagined data is how
  parallel duplicate renderers get created, which is the problem this document family exists to
  prevent.

## 6. Known gaps requiring a contract change

Summarised so they can be scheduled rather than discovered:

| # | Gap | Blocks | Change needed | Size |
|---|---|---|---|---|
| 1 | No per-atom coordinates cross the backend API | Phase 4, all molecular geometry | Backend/C3: return coordinate frames (OpenMM first) | The real Phase-4 blocker |
| 2 | `WorldFrameState` has no relationships channel | Bonds, any edge-drawn structure | C3: add relationships to the frame shape | Small, but needed before Phase 4 |
| 3 | No field/grid/volumetric channel | Orbitals, density, curvature fields | Both sides: new contract per §E | Large — reduce on C3's side instead where possible |
| 4 | `statusLabel` is prose; allowlist gate can never match it | Any state-driven appearance | C3: expose discriminating quantity as a number (Rule 3) | None if Rule 3 followed; already the live pattern |
| 5 | `scale` collapses to one scalar | Genuinely anisotropic entities | Both sides, if a real case appears | None today — no domain needs it yet |
| 6 | Missing `spatial` is indistinguishable from origin | Silent mis-placement | C3: discipline per Rule 1, or a real optional-position contract | None if Rule 1 followed |
| 7 | `boundingRadius` is not forwarded to C2 | Camera framing of odd-sized entities | C3/C2: forward it in the adapter | Trivial, do it when first needed |

Gaps 4 and 6 need no code change at all — only discipline, which is why they are stated as rules
rather than filed as work.
