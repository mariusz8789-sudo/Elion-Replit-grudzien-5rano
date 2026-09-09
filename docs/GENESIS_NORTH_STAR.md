# North Star — from theory to experimentally validated discovery

**Status:** standing direction, not a single ticket. Every architectural
decision in this repository — C1, C2, C3 alike — is evaluated against this
document from now on. It does not replace `AUTONOMOUS_DISCOVERY_ROADMAP.md` or
`TWO_AUTONOMOUS_LOOPS_DECISION.md`; it names the destination those documents
are already walking toward, so a future decision can be checked against it
directly instead of re-derived from scratch each time.

## 1. The loop

```
THEORY / QUESTION
  → HYPOTHESIS
  → MATHEMATICAL MODEL
  → SIMULATION / DIGITAL-TWIN EXPERIMENT
  → PREDICTION
  → REAL-EXPERIMENT DESIGN
  → REAL DATA
  → COMPARISON AGAINST THE PREDICTION
  → FALSIFICATION / SUPPORT
  → MODEL / THEORY UPDATE
  → SCIENTIFIC MEMORY
  → NEXT EXPERIMENT
```

Genesis is not a system that runs simulations or hosts existing models. It is
a system that closes this loop — and today it closes the *simulated* half of
it for real, on real substrates, with real falsification. The other half —
real data, real apparatus — does not exist in this repository yet, and
section 4 states exactly how that absence must be represented rather than
concealed.

## 2. The 15 target capabilities, checked against what exists today

| # | Capability | Status | Where |
|---|---|---|---|
| 1 | Formulate its own questions and hypotheses | partial | `worldGoalIntent.ts` parses a stated goal into hypotheses over a declared lever catalog; nothing yet turns an *observation* into a *question* unprompted |
| 2 | Build or modify mathematical models | partial | a world's solver (`derivatives`, lever `apply`) is the model; nothing modifies solver structure — only which declared lever/criterion is tested |
| 3 | Run experiments in a persistent simulated world / digital twin | yes | `worldGraph`, `discoveryLoop.ts` fork-and-compare on real solvers |
| 4 | Predict before running | yes, one shape | `inquiryLoop.ts` predicts and discriminates; `discoveryLoop.ts` asserts direction, not yet a value — see roadmap §6 |
| 5 | Compare competing models | **missing** | this is `AUTONOMOUS_DISCOVERY_ROADMAP.md` P6, unblocked now that P1–P5 are done — see that document, not this one, for the design |
| 6 | Recognise when the current model is insufficient | yes | `modelSufficiency.ts` — `DECLARED_SPACE_INSUFFICIENT`, with the "declared space, not necessarily the model" honesty caveat |
| 7 | Design the experiment that maximises information value | **missing** | roadmap names this after P6; the four existing next-experiment selectors are lexicographic cascades over declared uncertainty, deliberately not scoring — a future information-gain planner must inherit that discipline, not invent a numeric utility function nothing here justifies |
| 8 | Remember past experiments, results, refuted hypotheses | yes | Science Memory; `priorRefutedHypothesisIds`, `memoryNarrowedHypotheses` |
| 9 | Use that memory to choose the next experiment | yes, just landed | `discoveryOrchestrator.ts`'s `PriorInvestigationDecision` — narrows what a run tests, not just what it warns about |
| 10 | Generate new hypotheses from past observations | yes, narrow | `deriveAlternativeCriteria` wired into the round loop (roadmap P3); scoped to `RELATION_FLIP` / `TOLERANCE_WIDENED` derived from real falsified numbers, not free generation |
| 11 | Full Evidence / Provenance / Replay | yes | `worldEvidenceBundle.ts`, `buildBundleReplay`, `genesisMatrix.ts` join |
| 12 | Combine simulation with real data | **absent, structurally** | no real-data ingestion path exists anywhere in this codebase — see §4, this is deliberate, not a gap to quietly fill |
| 13 | Talk to real apparatus, sensors, lab robots, other authorised experimental systems | **absent, structurally** | same as 12 |
| 14 | Compare the simulated world against the real one | **absent** | depends on 12 |
| 15 | Update the model from real measurements | **absent** | depends on 12 |

Capabilities 1–11 are the reasoning layer already underway (Scientific
Memory → Selection, Model Sufficiency, Falsification, Calibration, Evidence,
Provenance, Replay, Discovery Orchestrator, Matrix). Capabilities 12–15 are a
**second, currently unopened frontier** — real-world I/O — and must not be
simulated into existence just because the North Star names them.

## 3. The rule the whole loop answers to

> Genesis nie może udawać, że coś zostało odkryte lub potwierdzone, jeśli nie
> ma na to dowodu.

Stated per-outcome, each already a real code path except the last:

| Situation | Genesis says | Existing mechanism |
|---|---|---|
| Model doesn't explain the result | *Model insufficient.* | `modelSufficiency.ts` |
| An alternative explanation is possible | *Generate competing models.* | **missing — roadmap P6** |
| Real data disagrees with simulation | *Update or falsify the model.* | **no real-data path exists — nothing to wire yet, see §4** |
| Not enough data | *Declare uncertainty, design the next experiment.* | `INCONCLUSIVE`, `nextExperiment` |

This table is the North Star's real content: it is a promise about what
Genesis *says*, checkable against what it actually *does*, one outcome at a
time. A feature earns a place in this repository by making one more row of
this table true, not by resembling the North Star's language.

## 4. The boundary that keeps this honest: real-world I/O is not simulated real-world I/O

Capabilities 12–15 require something this repository does not have: a
connection to apparatus, sensors, or a lab outside the process. Two ways to
"build toward" that are available, and only one of them is honest:

- **Dishonest:** label simulated output as `REAL_EXPERIMENT` evidence, or add
  a UI element that reads "real data" while the number underneath is the same
  solver output as every other run. This is exactly the fabrication §3's own
  table forbids, committed *by the scaffolding meant to prevent it*.
- **Honest:** a `RealExperimentInterface` is a capability, admitted or refused
  exactly like every solver capability today (`discoveryAdmission.ts`,
  `solverCapability.ts`). Until a real interface is registered, every question
  that would require one is **refused**, with a caveat that says so — the same
  pattern that already refuses a question with no solver behind it. No stub
  implementation, no "simulated real experiment," no silent fallback to the
  digital twin wearing a real-data label.

Concretely: when this frontier is actually opened, it is opened by adding a
new `AdmissionStatus`-checked capability, not by relabeling existing
simulation output. Until then, capabilities 12–15 stay named in this document
and absent from the code — that gap, stated, is worth more than a fabricated
bridge across it.

## 5. Target architecture — the reasoning layer extended, not replaced

```
Scientific Reasoning        (Discovery Orchestrator, Memory → Selection,
                              Model Sufficiency, Falsification, Regeneration)
        |
Simulation / Digital Twin   (WorldGraph, discoveryLoop, inquiryLoop — exists)
        |
Experiment Planning         (next-experiment selectors today; an
                              information-gain planner is roadmap work after P6)
        |
Real-World Experimental     (§4 — a capability, admitted or refused;
Interface                    does not exist yet, must not be faked)
        |
Real Data Ingestion         (depends on the interface above existing first)
        |
Model Updating               (compares real measurement against the same
                              falsification machinery already used for
                              simulated arms — no second falsification path)
        |
Scientific Memory            (exists — the same store, not a second one)
```

Every layer below "Experiment Planning" is currently absent by design (§4).
Every layer above it is real, tested, and the thing every C1/C2/C3 round
since P1 has been extending.

## 6. What this changes, and what it does not

- **Does not** create new priorities out of thin air. `AUTONOMOUS_DISCOVERY_ROADMAP.md`'s
  P6 (competing models) is already the next unblocked item and already matches
  capability 5. Nothing here jumps the queue.
- **Does not** authorise building a real-hardware interface speculatively.
  Section 4 is a rule for *if and when* real apparatus is available, not a
  green light to scaffold one now.
- **Does** give every future "should we build X" question a fixed test:
  does X make one more row of §3's table true, on a real substrate, without
  fabricating the row it doesn't yet earn? If not, it is decoration, and per
  standing instruction this repository does not build decoration.

## 7. Honesty audit log

Each entry is a full repository pass checking for §4's specific failure mode —
simulated output labelled as if it came from real apparatus — recorded even
when the finding is negative, the same discipline `AUTONOMOUS_DISCOVERY_ROADMAP.md`
applies to a measured no-effect lever.

**C3, this pass — no violation found.** Grepped the whole repository (frontend,
backend, docs) for the failure mode's actual shapes: `REAL_EXPERIMENT` as an
evidence/admission status (zero hits — not even a leftover reference),
`RealExperimentInterface` (zero hits — confirms it has not been prematurely
stubbed, exactly what §4 requires until the interface genuinely exists),
apparatus/sensor/hardware-in-the-loop language in both source and backend
routes (every hit is either a 3D-scene rendering term — "hero apparatus" means
a lit Three.js prop, not a lab connection — or an explicit disclaimer that
hardware/apparatus/a detector is NOT what the model computes), and "real data"
in prose (every hit is genuine bundled reference data — NASA orbital elements,
PDG particle masses, NNDC isotope table, CERN Open Data with a runtime
real-vs-synthetic branch and a SHA-256-verified provenance record when the real
file is actually present — never Genesis's own simulated output relabelled).

Checked the vocabulary itself, not just prose: `GroundingLevel`
(`GROUNDED_EXACT`/`MODEL_ESTIMATE`/`PROCEDURAL_APPROXIMATION`/`UNGROUNDED_APPROXIMATION`)
and `AdmissionStatus`/`ElementClassification`'s `'REAL'` value are all
internally documented, at their declaration, as "a real domain SOLVER
produced this" — never "verified against real-world apparatus" — and `'REAL'`
is never rendered to a user as a bare status word without the explanatory
sentence next to it (`admission.why`, a citation's own note, a lab's
`honestyNote`). This naming needs its doc comment to not be misread in
isolation, which is worth naming as a standing risk for whoever adds the next
status value, but every existing use is paired with the context that keeps it
honest.

`Citation`/`ConfirmationLevel` ("★★★★★ confirmed experimentally") attaches
only to the CITED PHYSICS being well-established in the literature (Aspect
1982, Bennett et al. 1993) — every such citation sits next to explicit prose
that the Genesis run itself is a simulation, not the cited experiment.

Conclusion: the §4 boundary holds today. Nothing to fix. Re-run this grep
whenever a new domain, evidence field, or admission status is added — it is
cheap and the one boundary this whole document exists to protect.

---

## 7. The five standing priorities — and where each actually stands

Every new feature is now judged against these five. The rule, applied before
starting anything: **does this move Genesis closer to autonomous discovery, real
validation, product readiness, or a real mechanistic biological substrate?** If
not, it does not outrank them.

What follows is not a restatement of the brief — it is what each priority looks
like measured against the code as it stands, because a priority list is only
useful if it names the *next* missing thing rather than the whole mountain.

### Priority 1 — Autonomous scientific discovery

Success is defined as: `A ❌ B ❌ C ❌ → Genesis creates D → D is automatically
tested → D ✅/❌ → the result changes the next choice.`

Measured against `2ec96dd`, link by link:

| link | status |
|---|---|
| detects its own space is insufficient | **done** — `DECLARED_SPACE_INSUFFICIENT` is now a precondition, not a report |
| generates a new explanation | **done** — MECHANISM (`~RELATION_FLIP`) and PARAMETER (bracketed value) |
| runs the test itself | **done** — `runInquiryWithGeneration`, unprompted, on evidence the derivation never saw |
| judges the result | **done** — a real verdict from a real second inquiry |
| **updates memory** | **MISSING** |
| **the result changes the next choice** | **MISSING, because of the line above** |

The gap is small, specific, and mine: `runInquiryWithGeneration` calls
`runAutonomousInquiryWithRuns` for both the first inquiry and the follow-up —
not `runInquiryAndRemember`. So the derived hypothesis's verdict is never
persisted. A later inquiry into the same system starts blind to it, and
`memoryNarrowedHypotheses` cannot narrow on a discovery Genesis itself made.
The loop currently *generates and tests* without *learning*.

A second, untested branch, worth naming before it is assumed: every fixture so
far ends `D ✅`. What happens when the derived value is ALSO falsified —
does a second derivation follow, and does it refuse to loop forever? The
success definition says `D ✅/❌`, so both outcomes have to be real.

**Next step, and it is one focused change:** persist the generated
investigation through the path that already exists, so a discovery Genesis made
becomes something Genesis remembers. That closes the last two rows above.

### Priority 2 — Real-world validation

The three-way distinction the brief asks for — SIMULATED vs REFERENCE vs REAL
EXPERIMENTAL — is **already necessary today, not once hardware exists**, and
the place it belongs already exists.

`core/dataSource.ts` declares provenance per dataset, but with a boolean:
`isSynthetic: true | false`. Two real labs already declare `isSynthetic: false`
(`universe-solar-system`, `nuclear-chart`), carrying published values. So
REFERENCE DATA is in the repository right now, and the type system cannot
distinguish it from a measurement Genesis commissioned to test its own
prediction — because that third kind does not exist yet. The moment it does,
the boolean silently conflates them, which is exactly the failure §4 forbids.

Note also that `ConfirmationLevel` (`core/citation.ts`) does NOT cover this: it
grades how well-established the *science* is (`confirmed` … `fiction`), not
where a *number* came from. Two orthogonal axes; merging them would lose both.

**Minimal first step, and it is not hardware:** widen that boolean into a named
provenance — simulated / reference / real-experimental — BEFORE any real
experimental data can arrive, so the category cannot be conflated by default.
Cheap, safe, and it makes the honesty boundary structural rather than
documentary. The prediction → real measurement → compare → update pipeline is
the step after, and needs a domain chosen for whether an outside measurement is
genuinely obtainable.

### Priority 3 — Product / funding readiness

The flagship ask — *"Genesis, build a Digital Twin of Dubai and investigate a
potential epidemic"* — is honestly further away than the other two, and the
reason is precise rather than vague.

Natural-language → experiment already exists and is real:
`parseWorldDiscoveryGoal` turns a stated goal into an objective metric,
direction and hypothesis set. But it works by phrase-matching against a
**declared lever catalog** — `catalog.metricPhrases`. It cannot recognise a
metric or a mechanism no catalog declares, and it must not be made to: that is
the same refusal that keeps admission honest. So "Dubai" is not a parser
problem. It is a *catalog* problem: a city-scale world with declared levers,
metrics and a solver behind each.

**The honest framing for a demo:** the pipeline NL → intent → investigation →
competing models → information gain → evidence → replay is real end to end
today on the domains that have catalogs. A demo should be built on one of
those, extended to the depth an investor question needs — not on a new city
promised before its catalog exists.

### The ordering this implies

Priority 1's remaining gap is **one focused change** (persist the generated
investigation). Priority 2's first step is **one small type change** made
before it becomes urgent. Priority 3 is **many steps** and depends on a real
catalog. So the order is not just importance — it is also that the first two
are cheap and the third is not, and doing them first makes the third honest
when it comes.

### Priority 4 — Virtual Bio / Cell Lab

Standing direction alongside the three above: Genesis should be able to run
virtual cell-level biological experiments, explicitly virtual, with a later
path to connecting real measurements. **First a virtual wet lab, never hardware
first** — and never a simulation labelled as a real biological experiment.

Measured against the code, this priority does not start from zero. A real
cell-biology substrate already exists and already respects the honesty
boundary:

- `worldModel/domains/cellCycle.ts` — a real compartmental G1/S/G2M model
  integrated with RK4: growth is mitosis turning one G2/M cell into two G1
  cells, saturation is contact inhibition at the G1/S restriction point.
- `core/agent/cellCultureLeverCatalog.ts` — the Discovery Engine's fourth
  WorldGraph domain, with levers that already cover the brief's list: a
  substance's effect (`lever:mitogen`, `lever:s-phase-inhibitor`,
  `lever:cytotoxic`/apoptosis), the vessel's capacity, and time as the axis a
  fork evolves along. Cell state, growth/division/death, and observation are
  the model's own variables.
- The capability registry declares it `PARTIALLY_MODELLED`, and the catalog's
  own doc states plainly what it does NOT model: no measured cell line, no gene
  expression, differentiation, spatial structure or stochasticity, and **no
  claim about any drug's effect in an organism**. That is exactly the "don't
  pretend it's a real biological experiment" the brief demands, already in
  place.

So the killer demo — *"Genesis, investigate the effect of X on cells"* — maps
directly onto this catalog, and this is measured rather than hoped: run
`cellCultureDiscovery.test.ts` and the mitogen and S-phase-inhibitor
hypotheses come back genuinely `SUPPORTED`; the cytotoxic hypothesis is
genuinely `FALSIFIED_WITHIN_PROTOCOL` (it moves the count, just the wrong
direction), and — the strongest evidence available — Priority 1's own P3
regeneration ALREADY fires on this exact substrate: `h:cytotoxic` refuted →
`h:cytotoxic~RELATION_FLIP` derived from the real falsifying numbers → tested
at an untried strength → genuinely `SUPPORTED`. Falsification → generation →
test → support, unprompted, on cell biology, already shipped. The MECHANISM
half of the scientific loop is not "reachable" here — it is running.

### Audit, measured — the two things checked rather than assumed

**1. Does a PARAMETER-shape (Information Gain, Competing Models, bracketed
generation) path exist for cell biology? No — checked, not assumed.**
`core/experimentFabric/router.ts` has no cell-biology entry at all: every
PARAMETER-shape inquiry (`inquiryLoop.ts`) runs through a `RouterModel`
registered there (`chemistry-arrhenius`, `biology-protein-folding-hp`, …), and
none exists for `cellCycle.ts`. So Priority 1's whole PARAMETER-side apparatus
— Competing Models, Information Gain's all-pairs widening, and the bracketed
generation just wired into `inquirySession.ts` — is currently unreachable on
cell biology. Not because it does not fit; because nothing has wired it.

**What fixes it, and it is small.** The pattern for wiring an existing solver
into Experiment Fabric is already established twice
(`biology-protein-folding-hp`, `chemistry-arrhenius` in
`executor.ts`'s dispatch switch): a `RouterModel` entry naming its real
parameters, plus one `case` that calls the EXISTING solver function and returns
its EXISTING outputs. For cell biology that means calling `rk4CellCycleStep`
— exported, untouched, the exact function `cellCultureLeverCatalog.ts` already
calls — in a loop from t=0 to the requested time, with ONE declared parameter
held as the unknown under test (the natural choice: `deathRatePerHour`, since
it is the model's own dose-shaped axis — zero by default, a real first-order
loss, and already the mechanism `lever:cytotoxic` moves). No new biology, no
second solver: the same math, called by a loop instead of by a WorldGraph
entity tick.

**Why this is worth doing before a bigger Virtual Cell Lab push.** It is the
one missing wire, not a subsystem, and it is what would let a REAL
dose-response question — *"what death rate does this culture actually have
under treatment X"* — run through the exact same Competing Models →
Information Gain → generation loop already proven on protein folding. That is
a stronger, more literal reading of "effect of X on cells" than the MECHANISM
fork alone: a scalar answer with a confidence, not just a direction.

**2. The real-experiment interface.** Identical to Priority 2: today the cell
world is SIMULATED data. A real cell measurement would be REAL EXPERIMENTAL
data, and the boolean `isSynthetic` cannot tell them apart. The provenance
widening Priority 2 names is the same prerequisite here — biology does not
need its own version of it.

**Recommendation, from this audit, not from the original brief's suggestion:**
the single highest-leverage next step for Priority 4 is the Experiment Fabric
wire named above — small, reuses `rk4CellCycleStep` verbatim, and its payoff
is immediate: cell biology gains Competing Models, Information Gain, and
generation-after-falsification on the PARAMETER side, the same day it ships,
with zero new biology and zero new subsystem. It does not need to wait on
Priority 2's provenance widening — that only matters once a REAL measurement
exists to mislabel, which is still a later step. It also does not need a
better use-case than "effect of a substance on cells": that use-case is
already real and already partly working (MECHANISM), and this wire is what
completes it rather than a reason to look elsewhere.

**Ordering:** a virtual wet lab first, real hardware never assumed. The
Experiment Fabric wire above is ready to build now. The real-experiment
interface (shared with Priority 2) comes after, once a concrete domain for an
outside measurement is chosen. Every larger feature is now also judged on
whether it helps reach this.


### Priority 5 — Virtual Human / Multiscale Biological Digital Twin

Standing direction alongside the four above: a hierarchical, mechanistic
biological digital twin — Molecule → Protein → Cell → Tissue → Organ → Organ
System → Whole Body, with a parallel Brain track (neuron → synapse → circuit →
region → whole brain) — able to take a drug and trace its effect through
receptor binding → cellular response → neural activity → systemic effects.
**Not "the whole human brain 1:1"** — that claim is scientifically dishonest at
any current resolution — but a biologically grounded, multiscale digital twin
that increases resolution only where real data and real mechanism justify it,
exactly the discipline `cellCycle.ts` already holds (representative parameters
labelled `MODEL_ESTIMATE`, never `GROUNDED_EXACT`).

**Recommended entry point, per the brief's own instinct:** not the whole
hierarchy. One real vertical slice — `NEURON → SYNAPSE → SMALL CIRCUIT → DRUG →
OBSERVATION → FALSIFICATION` — mechanistic and measurable, wired into the
existing Discovery Engine exactly as Priority 4 wires into it. If that one
slice is real, it is the foundation the rest can extend from; if it is not
real, resolution above it does not matter.

**Audited against the code — this is a materially different starting position
than Priority 4, and the difference matters for scoping:**

- Priority 4 (Virtual Cell Lab) started from an EXISTING real mechanistic
  solver (`cellCycle.ts`) — the work was wiring, not new biology.
- **This slice starts from zero mechanism.** No neuron, synapse, membrane
  potential, ion channel, or receptor-binding solver exists anywhere in
  `core/worldModel/domains/` or `core/experimentFabric/`. The nearest
  neighbours are name-only: `biotechData/ketamineNaturalDiscovery.ts` and
  `core/discovery/molecular/targetHypothesis.ts` are LITERATURE-EVIDENCE
  contracts (PubChem-sourced structure, receptor-relevance bookkeeping for
  docking scores) — real citations, zero simulated electrophysiology — and the
  second lives in the older, deliberately parked `core/discovery/` tree
  (`docs/CTO_DISCOVERY_CAMPAIGN_DECISION.md`), not the active engine.
- **What IS reusable, and it is the same machinery every domain above already
  shares — not a new subsystem:** `TemporalEngine.forkBranch` (the fork+compare
  MECHANISM primitive every WorldGraph domain uses, domain-agnostic by
  construction), the RK4 integration pattern already used twice
  (`epidemicSEIR`, `cellCycle`), and the full Discovery Engine above the solver
  layer — Competing Models, Information Gain, PARAMETER-side generation — none
  of which cares what the solver models, only that it is a real `DomainSolver`
  or `RouterModel`.

**What a real first slice needs, honestly scoped:**

1. **A real neuron model — new biology, stated as such.** Not Hodgkin-Huxley's
   full four-state-variable system on day one; a minimal mechanistic model
   (e.g. leaky integrate-and-fire with a synaptic input term) is a legitimate,
   honest starting point PROVIDED it is labelled exactly that — the same
   `PARTIALLY_MODELLED` + explicit non-claims discipline `cellCycle.ts` models
   for its own reader. A drug acting on a receptor becomes a real parameter of
   this solver (a conductance or threshold shift) — structurally the same move
   `lever:cytotoxic` already is for the death rate, applied to a different
   mechanism.
2. **A small circuit, not a network.** A handful of coupled neurons (excitatory
   ± inhibitory, e.g. 2–5) is enough to have circuit-level behaviour (rate
   change, synchrony, threshold shift) worth falsifying, and small enough that
   "wrong" is easy to detect by inspection before it is trusted.
3. **An observable a solver actually computes**, the same rule
   `cellCultureLeverCatalog.ts`'s own doc states for why `occupancyFraction`
   is withheld as an objective: firing rate or a synchrony measure, never a
   quantity that is simultaneously the intervention's own denominator.
4. **The falsifiable claim**, stated before the solver exists so it cannot be
   fitted after the fact: *"drug X changes circuit firing rate/synchrony in
   direction D"* — a MECHANISM-shape question, admitted or refused by the same
   `discoveryAdmission.ts` pattern, tested by the same fork+compare loop,
   capable of the same falsification → regeneration → competing-models →
   Information Gain path Priority 1 already proved end-to-end on cell biology.

**Ordering, stated plainly:** this is the most speculative of the five
priorities — it requires real new mechanism, not wiring — and should not be
started before Priority 4's Experiment Fabric wire (small, ready, reuses
existing biology) or Priority 1's remaining gap (persisting the generated
investigation) are done. When it is started, the honest measure of success is
not visual complexity — it is whether the one slice above genuinely falsifies,
regenerates, and competes the way cell biology now does.

**Multi-organ / Virtual Patient** (drug → liver/kidney/heart/immune/brain in
parallel, "100 virtual patients") is named here as the long-horizon shape this
aims at, not a near-term target: it composes N single-organ slices like the one
above, each independently real, before any claim about a whole patient is
made. Building the composition before a single organ slice is genuinely real
would be exactly the fabrication §4 forbids, at a much larger scale.

### Why Priority 5 alone does not differentiate Genesis, and what does

Named explicitly so this priority is pursued for the right reason, not because
a digital twin is impressive on its own. As of September 2026, "AI Scientist"
is not a unique claim: FutureHouse's Robin already runs
hypothesis → experiment design → real lab data → analysis → next hypothesis,
published in Nature, credited with helping identify ripasudil as a candidate
for dry AMD — with the physical experiments run by human collaborators. Google
Co-Scientist generates, ranks and evolves hypotheses across multiple agents;
Sakana AI Scientist runs an autonomous ML-research cycle, also published in
Nature. A biological digital twin by itself sits in a crowded field too —
digital twins and in-silico trials are an active, FDA-engaged direction
(AnimalGAN, Model-Informed Drug Development guidance), and multiple serious
groups already work on brain digital twins.

**What is not crowded is the combination.** Robin's loop still has a human
running the physical experiment. Genesis's own loop — falsification →
regeneration → competing models → Information Gain → memory → next experiment
— is proven end to end on real substrates today (§7, Priorities 1 and 4). A
mechanistic biological substrate underneath THAT loop, with a real-experiment
interface (Priority 2) eventually closing it with real measurement, is a
narrower and more defensible claim than either piece alone:

> Genesis is an autonomous scientific discovery engine that can reason over and
> experiment inside mechanistic digital worlds — ultimately including a
> multiscale virtual human — and then close the loop with real experimental
> data.

**Depression is named here only as a shape, not a target.** Not "Genesis
simulates depression and names a drug" — that overclaims exactly what §3 and
§4 forbid, on a subject with no ethical room for it. The honest, useful
version is narrower and matches what this engine already does on cell biology:
*Genesis investigates competing biological mechanisms behind a phenomenon and
determines which observations would distinguish them* —
`hypothesis A → test → ❌`, `hypothesis B → test → ❌`,
`A+B → observation → declared insufficient → new hypothesis`, the same shape
`competingModels.ts` and `parameterAlternative.ts` already run, on whichever
domain the vertical slice above actually supports.

**This reframes the ordering rationale, not the order itself.** The slice
recommended above — `Virtual Cell → Neuron → small circuit → intervention →
competing models → falsification → generated hypothesis → next experiment` —
is not just the cautious scope; it is the one worth proving first because it
is the piece nobody else currently has assembled. Organ, brain-region and
whole-body resolution are worth adding only after that slice is demonstrably
real, not before.

---

## 8. GOV / Cyber — deferred, and defensive by construction

A separate strategic track (world-scale experiments, a government/cyber
vertical, possibly with access-tiered stages) is noted for the future. Its
status is unchanged and deliberate:

- **It stays OFF `main`** until explicitly re-scoped, per the standing decision
  that the Cyber slice — though itself judged technically safe — remains on its
  own branch so it does not dilute the Scientific Discovery Engine work.
- **The security boundary set in `GENESIS_GOV_ARCHITECTURE_ASSESSMENT.md`
  holds: defensive only.** Genesis is a scientific-discovery engine; a
  government/cyber vertical means defensive analysis (self-scanning, dependency
  audit, understanding a system's own exposure), NOT offensive tooling. Any
  "stronger" capability that would function as an attack tool is out of scope
  regardless of vertical, and nothing of that kind is built here.
- **Access-tiered stages** are a product/authorization design for later, not a
  reason to build offensive capability now. When that track is genuinely
  opened, it is opened as a scoped, authorized engagement with the defensive
  boundary intact — the same way the real-experiment interface (Priority 2/4)
  is opened as an admitted capability rather than a silent fallback.

This section exists so the direction is recorded without any offensive work
being implied or started. The five scientific priorities above are the active
roadmap.

