# Virtual Brain substrate + Demo Mode — design notes (not implemented)

C2 NEXT SPRINT (P2 items). Both items below are explicitly design-only per the
directive: "P2 — Virtual Brain foundation: do NOT build it yet" and "P2 — Demo
Mode: prepare the ability to walk through the flow." Nothing in this document
is wired into the app. It exists so a future build of either does not
accidentally create a second engine next to the one Genesis already has.

## 1. Virtual Brain foundation

### The seam already exists, twice

Every domain Genesis has today — flood, epidemic, chemistry, and now
cell-biology — is the same four pieces:

1. A `DomainSolver` (`worldModel/solvers/solverRouter.ts`'s `DomainSolver`
   type): a pure function `(entity, ctx) => SolverResult` that advances one
   entity's `domainState` by `ctx.dt` and returns a `grounding` tag, an
   `Observation`, and a `GenesisEvent`. `domains/cellCycle.ts`'s
   `makeCellCycleSolver()` is the reference implementation.
2. A `WorldLeverCatalog` (`core/agent/worldGoalIntent.ts`): `buildWorld()`
   wires a fresh `WorldGraph` to that solver via `SolverRouter`;
   `metricPhrases`/`entityIdForMetric` name what a goal sentence can ask
   about; `levers` are real parameter substitutions, each producing a
   `MechanisticHypothesis`. `cellCultureLeverCatalog.ts`'s
   `GENESIS_CELL_CULTURE_CATALOG` is the reference implementation — four
   levers, each a real parameter change, none invented to look symmetrical
   with the others (its own module doc explains why it has no exactly-inert
   lever, which is itself an honest finding, not a gap).
3. Registration in `WORLD_LEVER_CATALOGS` (`worldGoalIntent.ts`) — one line,
   and the catalog is reachable by every existing NL parser, the catalog
   dropdown, and the comparison engine, for free.
4. A thin visualization that reads the same `domainState`/solver output a
   generic `<WorldDiscoveryPanel defaultCatalogId={...} />` already drives —
   `CellLabScreen.tsx` (this sprint) is the second proof this recipe
   generalizes across completely different biology, after
   `GenesisScientificCityScreen.tsx`/`City3DWebGLScreen.tsx` proved it across
   completely different physics.

A neuron -> synapse -> circuit -> brain domain is domain #5 in exactly this
list, not a new architecture. The rest of this section is about picking a
solver and an entity granularity honest enough to earn the name, in stages.

### Stage 1 — one neuron, a real membrane-potential ODE

`domains/neuronCircuit.ts` (name TBD), one entity, `domainState` holding a
membrane potential and any adaptation variables. Candidate solver: a
leaky integrate-and-fire (LIF) model —

```
dV/dt = (-(V - V_rest) + R * I_input) / tau_m
```

— integrated with the same RK4 helper pattern `rk4CellCycleStep` already
uses, or exact analytic integration between spike events (LIF admits one; a
future Hodgkin-Huxley stage would not and should say so). A spike is `V`
crossing threshold, which resets `V` and increments a real spike-count
`domainState` field — the same "the discrete state is a NUMBER" rule
`cellCycle.ts` already documents as Rule 3. Honesty tier: `MODEL_ESTIMATE` at
best — `tau_m`/`R`/`V_rest`/threshold are representative textbook constants
for a generic cortical neuron, not a measured cell, exactly like
`cellCycle.ts`'s G1/S/G2M durations. This stage alone is enough for a first
lever set: `lever:input-current` (raises firing rate), `lever:membrane-tau`
(changes integration speed), `lever:threshold` (changes excitability) —
three real parameter substitutions, no invented biology.

### Stage 2 — a small circuit, entities + a real coupling term

A handful (single digits to low tens) of neuron entities plus a synapse
weight matrix. Each neuron's `derivative()` gains a coupling term from
presynaptic spikes, weighted by a real, declared synaptic-weight parameter —
structurally the same nonlinear-coupling pattern `cellCycle.ts`'s
`inhibition` term already is (one compartment's rate depends on another's
state). At this scale, **one entity per neuron** is still honest — a dozen
neurons are individually addressable and inspectable, unlike
`cellCycle.ts`'s "Rule 6" population of a million cells, so per-neuron
entities (and a small per-neuron visual, e.g. one dot per neuron colored by
firing state) do not violate that rule; they are the opposite regime it was
guarding against. Levers here become topological/synaptic:
`lever:synaptic-weight` (strengthens one connection),
`lever:inhibitory-input` (adds a real inhibitory population), each with the
same `hypothesis()`/`criterion` shape `GENESIS_CELL_CULTURE_LEVERS` already
uses.

### Stage 3 — if scale ever demands it, an aggregate rate model

Only if a future circuit needs to grow past individually-addressable
neurons: switch to a population/firing-rate model (one entity per
population, analogous to `cellCycle.ts`'s one entity per whole culture) —
the same escape hatch Rule 6 already describes, reused rather than
reinvented. This stage is speculative and should not be started before
Stage 1/2 exist and are honestly load-bearing.

### What this explicitly is not, at any stage

No claim about biological neurons, no claim about cognition, learning,
memory, or "the brain" as a cognitive system — "Virtual Brain" is a naming
aspiration for the product, not a scope claim for the model. Every stage
above produces a `MODEL_ESTIMATE`-grounded circuit-dynamics toy, exactly the
tier `cellCycle.ts` and every other domain here already discloses. Nothing
about spiking dynamics implies intelligence; that gap should be stated in
the eventual module doc as plainly as `cellCycle.ts` states its own.

### Reuse checklist for whoever builds this

- [ ] `worldModel/domains/neuronCircuit.ts` — `DomainSolver` + RK4/analytic
      integrator + `*_DEFAULTS` constants, exported (not private) from day
      one, exactly as `cellCultureLeverCatalog.ts` needed
      `MITOGEN_G1_DURATION_H` etc. exported this sprint to avoid a second
      copy of the same magnitudes.
- [ ] `core/agent/neuronCircuitLeverCatalog.ts` — mirrors
      `cellCultureLeverCatalog.ts` structure field-for-field.
- [ ] One line in `WORLD_LEVER_CATALOGS`.
- [ ] A `NeuronLabScreen.tsx` that is, structurally, `CellLabScreen.tsx` with
      the solver swapped: a `Sim` (or `Sim3D`) reading `domainState` each
      frame, plus `<WorldDiscoveryPanel defaultCatalogId={...} />` embedded
      unchanged.
- [ ] No new discovery UI, no new NL parser, no new comparison engine — all
      three are already generic across every domain above.

## 2. Demo Mode — 30-60s real walkthrough, no mocked results

### Constraint restated

Item 17 of the original directive: walk a viewer through Ask Genesis ->
world -> hypotheses -> experiment -> a falsified hypothesis -> competing
models -> next experiment -> new evidence, via a **real execution path**,
never a scripted video or precomputed numbers. Demo Mode is therefore
orchestration and pacing around functions that already exist and that a
manual user's clicks already call — never a parallel "demo data" source.

### The real functions Demo Mode would call

- `core/agent/worldDiscoverySession.ts`'s `runWorldDiscovery(goal, catalog)`
  — the exact synchronous, real path `worldDiscoverySession.test.tsx`
  already exercises end to end (goal sentence in, real forked-world
  experiments out). For the cell-biology flow specifically:
  `runWorldDiscovery('...', GENESIS_CELL_CULTURE_CATALOG)`.
- `summariseDiscovery(result)` — the same honest, non-overstating summary
  string `WorldDiscoveryPanel.tsx` itself renders.
- `CellCultureLabSim` (this sprint) — already advances two real cultures
  every frame; Demo Mode does not need a second visual path, only to make
  sure the sim is running (unpaused) while the reasoning stage above plays.

### Shape of the walkthrough

A `runCellDiscoveryDemo()` orchestrator (not built this sprint) that does,
against real state only:

1. Ensure `#/cell-lab` is open and `CellCultureLabSim` is running.
2. Set a real goal sentence (e.g. "Zbadaj wpływ substancji X na wzrost
   komórek") and call `runWorldDiscovery` against
   `GENESIS_CELL_CULTURE_CATALOG` — this is the same call
   `WorldDiscoveryPanel`'s own `run()` makes, so Demo Mode either (a) drives
   `WorldDiscoveryPanel` through a small new `initialGoal`/`autoRun` prop
   pair, the same shape as this sprint's `defaultCatalogId`, or (b) calls
   `runWorldDiscovery` directly and renders its own narration panel reusing
   `summariseDiscovery` — (a) is preferred, since it means the demo is
   *provably* the same code path a person's own typing would hit, not a
   lookalike.
3. Because `decisionAtTick=2`/`horizonTick=30` on this catalog are small
   integer loops with no network I/O, the real search resolves in
   well under a second — the 30-60s budget is spent on narration pacing
   (holding each real stage on screen long enough to read), not waiting on
   compute. No stage should be held past what its own real completion
   already allows, and no artificial delay should be dressed as "the model
   thinking."
4. Narrate each stage as it actually completes, from data already on the
   result object — `result.rounds`, `result.bestSupported`,
   `result.failedHypotheses` — never a canned sentence unconnected to that
   run's real content.
5. If `GENESIS_CELL_CULTURE_CATALOG` happens to produce a
   `COMPLETE` result with only one surviving hypothesis on a given goal
   (likely, since this domain's four levers mostly separate cleanly against
   a growth objective — see that catalog's own module doc), Demo Mode should
   pick its scripted **goal sentence**, not its **result**, to land on a
   falsification moment: a goal like "minimise growth" against the mitogen
   lever is real, and really is expected to fail its own criterion, per the
   catalog's own declared levers. Choosing the sentence a user would
   plausibly type, rather than post-hoc filtering results, keeps this
   honest — the demo owns the setup, never the outcome.

### What Demo Mode must not do

- Must not hardcode `result.bestSupported`/`failedHypotheses` content
  anywhere in the orchestrator — those always come from the function call's
  actual return value that run.
- Must not skip `CellCultureLabSim`'s own per-frame `update()` to jump-cut
  the growth curve to a "nicer" endpoint — if the visual needs to reach a
  later hour for the demo's pacing, that means running more real frames
  faster (raise `HOURS_PER_REAL_SECOND` for the demo's duration), never
  interpolating a fake intermediate state.
- Must not exist as a mode that behaves differently from the manual path in
  anything but pacing and narration text — same solver calls, same catalog,
  same discovery loop.
