# Phase 4 — Molecular: architecture gate answer

**Audience: C3. Status: design only, no code written for this document.** It answers the two things
the architecture gate asked for before any Phase 4 implementation:

1. How two incompatible time regimes (per-tick ODE vs expensive backend engine) coexist under **one**
   `DomainSolver` interface.
2. The data contract for the `atom → molecule → reaction → cell → tissue → organism` hierarchy, tier
   by tier, with an honest status for each.

It is written against `graphics/SOLVER_DATA_CONTRACT.md` (what C3 must ship), and every claim about
what exists was verified by reading the code, not by reading a previous audit.

---

## 0. One finding that changes the plan

`VISUALIZATION_REUSE_AUDIT.md` states that Phase 4 is blocked because "no real backend — RDKit,
PySCF, Biopython, or OpenMM — returns per-atom coordinates to the frontend today". **That is stale.**

- `packages/backend/src/compute/rdkit_worker.py` has an `embed3d` command that adds hydrogens, embeds
  with **ETKDGv3 at a fixed `randomSeed`**, optimises with **MMFF** (falling back to UFF), and returns
  `atoms: [{element, x, y, z}]` **in Ångström**, plus `forceField`, `seed`, `charge`, `nAtoms` and the
  canonical SMILES.
- `packages/backend/src/compute/rdkitAdapter.mjs` already exports `embed3d(smiles, seed)`.

What is genuinely missing is one hop: `embed3d` is **not registered in `compute/registry.mjs`** (so it
is not reachable over the HTTP API) and **nothing in `packages/frontend/src` calls it**.

So Phase 4's coordinate problem is **plumbing an already-real, already-deterministic capability**, not
new science and not a blocked data contract. That is the correct scope.

---

## 1. The two time regimes, and why they do NOT both belong in `DomainSolver`

Every real solver shipped so far is synchronous and cheap enough to run every tick:

| Domain | Per-tick cost | Shape |
|---|---|---|
| hydraulics | microseconds | steady-state re-solve |
| epidemiology | microseconds | RK4 ODE step |
| chemistry kinetics | microseconds | analytic decay step |
| electrical | microseconds | state machine |
| relativity (Phase 3) | microseconds | one RK4 geodesic step |
| quantum (Phase 2) | ~80 ms uncached | bounded pure function, memoised to ~2 ms |

The backend engines are a different species entirely: a subprocess or HTTP round trip, tens of
milliseconds to many seconds (Vina docking, PySCF DFT, OpenMM MD), and **inherently asynchronous**.

### The rejected option: make `DomainSolver` async

Returning `Promise<SolverResult>` looks like the obvious fix and is the wrong one. `SolverRouter.routeTick`
is called by `TemporalEngine.advance`, which is called by `scrubTo`'s replay, by `forkBranch`, and by
every scenario updater. Making one solver async makes **the entire temporal core async** — replay,
branching and determinism testing included — to accommodate a minority of domains. It would also mean a
world could not be ticked without a live backend. Rejected.

### The accepted option: an engine is a DATA SOURCE, not a solver

> **A solver advances state. An engine produces a fact.** Conflating them is what forces async into the
> engine core.

Phase 4 therefore introduces **no async solver**. It introduces a **materialiser**: an explicitly
asynchronous, out-of-tick step that calls the backend engine and writes the result into the graph
through the paths that **already exist and are already replay-safe**:

- **At construction:** `createScientificWorld`'s `augmentGraph` hook (added in an earlier phase
  precisely so entities can be genuine tick-0 state).
- **Live, mid-run:** `TemporalEngine.applyExternalPatch` / `applyInterventionWithEvent` — the same
  mechanism a human intervention uses, which records a real delta so replay stays byte-identical.

The synchronous `DomainSolver` then reads only what is already in `domainState`, exactly like every
other domain. The world never blocks on a network call, and the temporal core is untouched.

```
  async, out of tick            synchronous, per tick
  ─────────────────             ─────────────────────
  materialiseMolecule(smiles)
      → HTTP /api/compute       molecularSolver(entity, ctx)
      → rdkit embed3d               reads domainState
      → atoms[] in Å                publishes scalars/status
      → applyExternalPatch ──────►  never calls the backend
         (records a delta)
```

### Determinism and honesty rules for a materialiser

1. **Deterministic inputs only.** `embed3d` takes an explicit `seed`; that seed MUST be stored on the
   entity, so the coordinates can be regenerated and checked rather than trusted.
2. **Provenance is mandatory.** The entity records `forceField` (MMFF vs UFF actually used), `seed`,
   the canonical SMILES the backend echoed back, and the engine id. A replay can then prove which call
   produced which coordinates.
3. **Unavailable backend ⇒ `UNGROUNDED_APPROXIMATION`, never invented coordinates.** Same discipline as
   the CMS worker's `DATA_REQUIRED`: an entity with no real geometry renders as C2's honest placeholder
   (`SOLVER_DATA_CONTRACT.md` Rule 5) and is never given plausible-looking made-up positions.
4. **Materialisation is an event.** It enters the journal like any other real change, so "when did this
   molecule acquire geometry, and from what" is answerable by the existing causal-query layer.

---

## 2. The hierarchy, tier by tier

Statuses use the audit vocabulary: **REAL** / **PARTIAL** / **NOT_MODELLED**.

### ATOM — **REAL** (once the one hop is plumbed)

- Source: RDKit `embed3d`, ETKDGv3 + MMFF/UFF, deterministic seed.
- One `WorldModelEntity` per atom. `ref.kind` = **element symbol** — per Rule 4 this doubles as the
  instanced batch key, so all carbons batch together.
- `id` = molecule id + the atom's index **from the source order**, never re-sorted (Rule 4: stable set
  AND stable order across frames).
- `scale.level` = `NANO_ATOMIC` (already in the enum).
- `spatial.position` = Å converted to scene world units. Per §B the conversion factor
  (`angstromPerWorldUnit`) is published **on the molecule root**, not folded silently into each atom.
- Grounding: `MODEL_ESTIMATE` — a force-field-optimised conformer is a real computed geometry, but it
  is one low-energy conformer from a stochastic embedding, not a measured crystal structure. Never
  `GROUNDED_EXACT`.
- No per-tick solver is required or appropriate: a static optimised conformer does not evolve. Atoms
  are materialised once and then simply exist. (An MD trajectory would be a different, later thing —
  see Reaction/§D.)

### MOLECULE — **REAL**

- Root entity, `scale.level` = `MICRO_MOLECULAR`, parent of its atoms via `parentId`.
- Carries the real RDKit descriptors already exposed today (MW, logP, TPSA, HBD/HBA, rotatable bonds,
  Lipinski) as unit-suffixed scalars per Rule 2, plus `angstromPerWorldUnit`, `nAtoms`, `seed`.
- This is the aggregation level Rule 6 cares about: a molecule with no materialised geometry stays ONE
  entity with descriptors and no atoms — it MUST NOT be split into invented atom positions.

### REACTION — **PARTIAL**

Two genuinely different things live under this word, and they must not be merged:

- **Kinetics — REAL, already shipped.** `chemistryKinetics.ts` (Arrhenius + analytic first-order decay)
  is a real per-tick solver and stays exactly as is.
- **Structural transformation — REAL but not a solver.** RDKit's SMARTS `transform` turns reactant
  SMILES into product SMILES. That is a discrete graph edit, not a time evolution: it belongs as an
  **event + re-materialisation**, never as a per-tick entity update.
- **Bonds — NOT_MODELLED, and blocked by C2's own contract.** `SOLVER_DATA_CONTRACT.md` §C states
  plainly that no channel exists for edges: C3 models relationships, but nothing forwards them to C2.
  So bond geometry is not shippable today regardless of what C3 computes. Atoms will render; the sticks
  between them will not. Stated here rather than discovered during integration.

### CELL — **PARTIAL** (real model, honestly narrow)

`core/world/cellWorldAdapter.ts` is backed by a real model: the **exact closed-form logistic growth**
solution N(t) = K/(1+((K−N₀)/N₀)e^(−rt)) from `core/modelGraph/logisticGrowthGraph.ts`.

- What is REAL: unstructured population count over time.
- What is explicitly NOT: age structure, delay, predation, stochasticity, organelles, cell cycle,
  division mechanism, or any measured cell line. The adapter already declares this in its own
  `notModeled` list, and that honesty is preserved, not quietly upgraded.
- A `CELL` tier in C3 would therefore be a population-count entity, `MESO_LAB` scale, `MODEL_ESTIMATE`
  — and MUST NOT be rendered as N individual cells at invented positions (Rule 6, the same trap
  epidemiology already documents).

### TISSUE — **NOT_MODELLED**

Nothing in either package computes tissue mechanics, morphogenesis, diffusion through tissue, or
anything else at this tier. There is no code to wrap. It is not shipped, and no placeholder entity will
be created to make the hierarchy look complete.

### ORGANISM — **NOT_MODELLED**

Same. Physiology, whole-body pharmacokinetics and organ-system coupling do not exist here. ADMET-AI
predicts organism-level *properties* from structure, but a property prediction is not an organism
model, and presenting it as one would be exactly the fabrication this consolidation exists to prevent.

### Summary

| Tier | Status | Backing |
|---|---|---|
| Atom | REAL | RDKit ETKDGv3 + MMFF/UFF, deterministic seed |
| Molecule | REAL | RDKit descriptors (already exposed) |
| Reaction | PARTIAL | kinetics REAL (shipped); transforms REAL but event-shaped; **bonds NOT_MODELLED — C2 §C gap** |
| Cell | PARTIAL | exact logistic growth; population count only |
| Tissue | NOT_MODELLED | nothing exists |
| Organism | NOT_MODELLED | nothing exists |

---

## 3. Safety boundary (unchanged, restated because this phase touches biology)

Genesis may model consequences, exposure, population effects and interventions. It must **never** be
used for pathogen design or optimisation, or to make any organism more harmful. Nothing in this
contract creates such a capability: the molecular tier ships geometry and physicochemical descriptors
of user-supplied structures, and the biology tiers above `CELL` are explicitly NOT_MODELLED. Existing
`SafetyClass`/weapon-development regression tests remain untouched and must keep passing.

---

## 4. Implementation order for Phase 4

1. Register `embed3d` as a model in `compute/registry.mjs` (the one missing hop), with provenance
   fields matching the existing external-engine models.
2. Frontend transport + a `materialiseMolecule` step that writes molecule + atom entities through
   `augmentGraph` / `applyExternalPatch`, honouring rules 1–4 of §1.
3. A synchronous molecular `DomainSolver` that publishes descriptor scalars and a numeric status code
   (Rule 3), and that never calls the backend.
4. Tests: determinism (same seed ⇒ identical coordinates), backend-unavailable ⇒
   `UNGROUNDED_APPROXIMATION` and no invented atoms, replay byte-identity, Rule 2/4/5 compliance.

**Self-assessment against the gate:** the contract keeps one synchronous solver interface, adds no
second engine, no async temporal core, no fabricated tier, and states two real gaps (bonds have no C2
channel; tissue/organism do not exist) rather than papering over them. On that basis it is
self-approved and implementation proceeds.
