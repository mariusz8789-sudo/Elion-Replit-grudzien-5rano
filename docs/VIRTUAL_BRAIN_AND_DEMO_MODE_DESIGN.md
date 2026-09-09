# Virtual Brain substrate + Demo Mode — design notes

Started as a C2 next-sprint P2 pair (both design-only at the time: "do NOT
build [Virtual Brain] yet" / "prepare the ability to walk through the flow").
**Demo Mode shipped in the following sprint (C2 Master directive, P1)** — see
§2 below, now a status report on the real, built implementation rather than a
proposal. **§1, Virtual Brain, remains design-only** per every audit since
(`docs/GENESIS_NORTH_STAR.md` §7 Priority 5, `docs/MASTER_PRIORITY_GENESIS.md`):
it needs real new mechanism (no neuron/synapse solver exists anywhere in
`core/worldModel/domains/`), and should not start before Priority 4's
Experiment Fabric wire and Priority 1's remaining gap are done. Nothing in §1
is wired into the app; it exists so a future build does not accidentally
create a second engine next to the one Genesis already has.

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

### Stage ordering, per the standing audit

`docs/GENESIS_NORTH_STAR.md` §7 Priority 5 measured this slice against the
code (not assumed) and found it starts from zero mechanism — unlike Priority
4, which started from an existing solver. Its recommended first slice is
narrower than Stages 1–3 above make it sound: **one real neuron model** (LIF,
stated as `PARTIALLY_MODELLED`), **a small circuit** (2–5 neurons, not a
network), **one observable a solver actually computes** (firing rate or a
synchrony measure — never a quantity that is simultaneously an intervention's
own denominator, the same guard `cellCultureLeverCatalog.ts`'s own doc states
for withholding `occupancyFraction`), and **the falsifiable claim written
before the solver exists** ("drug X changes circuit firing rate/synchrony in
direction D"), so it cannot be fitted after the fact. That order — Priority
4's Experiment Fabric wire and Priority 1's persistence gap both closed first
— is unchanged by anything below; this section only adds the UX and
Experiment Fabric detail the North Star's own writeup left at the solver
layer.

### UX — reusing this sprint's Cell Lab shell, not a new screen shape

`CellLabScreen.tsx`'s C2-Master-sprint upgrade (flagship narrative ladder,
Demo Mode, `RealExperimentPipeline`, `ProvenanceBadge`) is not
cell-biology-specific presentation; every piece of it is generic over "two
arms of a real solver, one control, one intervention," so a future
`NeuronLabScreen.tsx` reuses it wholesale rather than re-deriving its own
version:

- **The narrative ladder** (`CellLabScreen.tsx`'s `.cell-lab-narrative`,
  `conclusionFor`/`nextExperimentFor`) is already written against
  `PanelState`/`DiscoveryLoopResult` — domain-agnostic types — so a
  `NeuronLabScreen` gets CONTROL → TREATMENT → OBSERVATION → DIFFERENCE →
  CONCLUSION → NEXT EXPERIMENT by embedding the same
  `<WorldDiscoveryPanel defaultCatalogId={...} onResult={...} />` and calling
  the same two functions with `h:${leverId}` ids from its own catalogue —
  zero narrative code duplicated, only the observable's label and unit
  change ("firing rate (Hz)" instead of "cells").
- **`ProvenanceBadge`** (`components/visual-simulation/provenance.tsx`) is
  already domain-agnostic (`SIMULATED`/`REFERENCE`/`REAL_EXPERIMENTAL`) —
  reused verbatim, no new badge component.
- **`RealExperimentPipeline`** (`components/visual-simulation/RealExperimentPipeline.tsx`)
  takes `predictionMechanism`/`predictionRationale`/`comparisonNote`/
  `evidenceBundleId` as props — a neuron circuit's own lever's
  `MechanisticHypothesis.mechanism`/`.rationale` (e.g. "raising the
  excitatory synaptic weight to W (what a glutamatergic agonist does)") slot
  straight in; the component itself needs no change, and its honest
  "Real Experiment Request/Waiting/Data" refusals stay true for the same
  structural reason (no `RealExperimentInterface` exists for ANY domain yet).
- **Rendering the circuit itself** is the one genuinely new visual: Stage
  2's "one dot per neuron, colored by firing state" is a small, bespoke
  `Sim`/`Sim3D` (a handful of shapes, well under any per-entity rendering
  budget concern `cellCycle.ts`'s Rule 6 exists to guard), not a reuse of
  `CellCultureLabSim`'s aggregate-chart rendering — the two solvers produce
  differently-shaped state (a small numbered set of individually meaningful
  neurons vs. one aggregate culture) and the honest visual follows the state
  shape, not a shared rendering function forced to fit both.

### Experiment Fabric — the PARAMETER-side wire, generalized

`docs/MASTER_PRIORITY_GENESIS.md`'s own audit of Priority 4 names the
"single highest-leverage next step" pattern: one `RouterModel` entry in
`core/experimentFabric/router.ts` plus one `case` in `executor.ts`'s
dispatch switch that calls the EXISTING solver function in a loop from t=0,
holding one declared parameter as the unknown under test — no second solver.
The identical wire applies to a neuron-circuit domain the moment its LIF
solver exists: a `RouterModel` naming its real parameters (membrane time
constant, synaptic weight, threshold), one `case` calling the neuron
solver's own step function in a loop, with (say) the synaptic-weight lever
held as the PARAMETER-shape unknown. That is what makes Competing Models,
Information Gain, and falsification→generation reachable on circuit
dynamics the same day the solver ships — exactly as it is recommended to do
for cell biology first, so the neuron-circuit version is a second proof of
the same recipe, not a new one.

`TemporalEngine.forkBranch` (the fork+compare MECHANISM primitive every
WorldGraph domain already shares, per the North Star's own audit) is the
other piece that needs no new code: a neuron-circuit `DomainSolver` registers
with `SolverRouter` exactly as `cellCycle.ts` does, and forking one arm at a
declared tick to test an intervention is `forkBranch`'s existing job,
domain-agnostic by construction.

### Reuse checklist for whoever builds this

- [ ] `worldModel/domains/neuronCircuit.ts` — `DomainSolver` + RK4/analytic
      integrator + `*_DEFAULTS` constants, exported (not private) from day
      one, exactly as `cellCultureLeverCatalog.ts` needed
      `MITOGEN_G1_DURATION_H` etc. exported this sprint to avoid a second
      copy of the same magnitudes.
- [ ] `core/agent/neuronCircuitLeverCatalog.ts` — mirrors
      `cellCultureLeverCatalog.ts` structure field-for-field.
- [ ] One line in `WORLD_LEVER_CATALOGS`.
- [ ] One `RouterModel` entry (`experimentFabric/router.ts`) + one dispatch
      `case` (`executor.ts`) — the PARAMETER-side wire above, reusing the
      exact pattern already proven for `biology-protein-folding-hp` and
      `chemistry-arrhenius`.
- [ ] A `NeuronLabScreen.tsx` that is, structurally, `CellLabScreen.tsx` with
      the solver and its bespoke circuit visual swapped in: the narrative
      ladder, `ProvenanceBadge`, and `RealExperimentPipeline` carry over
      unchanged (see "UX" above), plus
      `<WorldDiscoveryPanel defaultCatalogId={...} onResult={...} />`
      embedded exactly as this sprint embeds it.
- [ ] No new discovery UI, no new NL parser, no new comparison engine, no new
      provenance badge, no new experiment-pipeline component — all are
      already generic across every domain above.

## 2. Demo Mode — shipped, C2 Master sprint (P1)

### What actually got built, against the constraint

Item 17 of the original directive, restated: walk a viewer through Ask
Genesis -> world -> hypotheses -> experiment -> falsified hypothesis ->
competing models -> next experiment -> new evidence, via a **real execution
path**, never a scripted video or precomputed numbers. The design below (the
original proposal) predicted the shape correctly; here is what shipped and
where, so this stays a pointer to real code rather than a stale plan.

- **`WorldDiscoveryPanel.tsx`** gained two new optional props, both additive
  and backward-compatible: `initialGoal?: string` (a `useEffect` with an
  empty dependency array calls the SAME `run()` a typed submission calls,
  exactly once, on mount — never a second execution path) and
  `onResult?: (state: PanelState) => void` (fired from the same `finish()`
  helper that already sets state, whenever a run reaches NOT_ADMITTED,
  REFUSED, COMPLETE, or COMPARISON — never for IDLE/RUNNING). `PanelState` is
  now exported so a caller can type against the exact real shape.
- **`CellLabScreen.tsx`** owns the orchestration: `startDemo()` resets both
  cultures to a known scenario (mitogen, full dose), bumps a `demoKey` that
  remounts `<WorldDiscoveryPanel key={demoKey} initialGoal={DEMO_GOAL} .../>`
  (a fresh mount is what makes the mount-effect fire again), and sets a
  `speed` `SimParam` the sim already reads (`CellCultureLabSim.update`
  multiplies `HOURS_PER_REAL_SECOND` by it) — the real RK4 steps run more of
  them per real second, never a jump-cut. `DEMO_GOAL` ("Increase cell count
  using a substance, at most 2 experiments.") is plain text chosen to match
  the catalogue's own declared `metricPhrases`/direction keywords, not a
  special-cased string the parser treats differently.
- A `demoMode` banner shows the search's real live status
  (`discoveryResult?.kind`), and `DEMO_DURATION_MS` (55s) only turns the
  banner and the speed multiplier off — the underlying search and the
  flagship narrative (§ below) stay exactly as real and as visible after the
  timer as during it, so nothing about the walkthrough depends on the
  viewer watching within the window.
- The narrative ladder these props feed — `conclusionFor`/
  `nextExperimentFor` in `CellLabScreen.tsx` — reads `result.bestSupported`/
  `.failedHypotheses`/`.unresolvedQuestions` directly off the real
  `DiscoveryLoopResult` `onResult` delivers, matched by the real
  `h:${treatmentId}` hypothesis id the catalogue already declares. Neither
  function computes a verdict; both look one up.

### What Demo Mode does not do (verified, not just intended)

- Never hardcodes `bestSupported`/`failedHypotheses` content — both
  `conclusionFor`/`nextExperimentFor` are pure functions of whatever
  `PanelState` is passed, covered by `cellLabScreen.test.tsx` fixtures built
  against the real `DiscoveryLoopResult`/`HypothesisBelief` types, not a
  simplified stand-in shape.
- Never skips `CellCultureLabSim`'s own per-frame `update()` — the `speed`
  multiplier scales `dt * HOURS_PER_REAL_SECOND`, so every simulated hour on
  screen is still one real RK4 step's output.
- Behaves identically to the manual path outside pacing/narration: the same
  `run()`, the same catalogue, the same Discovery Loop, the same
  `WorldDiscoveryPanel` component — confirmed by `key={demoKey}` forcing a
  real remount rather than a demo-only branch inside the panel.
