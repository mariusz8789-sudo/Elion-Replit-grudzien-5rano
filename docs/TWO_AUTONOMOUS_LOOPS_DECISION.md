# Decision — the two autonomous loops, and which substrate a new domain goes on

**Status:** decided. No code changes follow from this document by itself.
**Verdict / Decyzja:** **KEEP BOTH. Neither is a subset of the other.**
Genesis has two loops because it has two genuinely different questions, on two
substrates with different powers. They are not a duplication, and merging them
would cost real capability. The boundary is named in §4 as a checklist so the
next person does not have to guess.

**Scope note.** This document settles *where a new domain goes*. It does not
authorize deleting, merging or rewriting either loop. If a future finding says
"merge", that is a separate task with its own brief.

---

## 1. What actually exists

Three things live in this space today. Two are loops; the third is often
mistaken for one and is not, which is part of why the picture looked
duplicated.

| | `discoveryLoop.ts` | `inquiryLoop.ts` | `hypothesisLoop.ts` |
|---|---|---|---|
| Location | `core/agent/` | `core/agent/` | `core/experimentFabric/` |
| Substrate | `WorldGraph` + `TemporalEngine` | Experiment Fabric router/executor | Experiment Fabric router/executor |
| Question | *Which declared **mechanism** controls this objective?* | *Which declared **parameter value** does this system have?* | *Of these preregistered hypotheses, which survive?* |
| A hypothesis is | a lever: `apply(graph, strength)` | a numeric assignment: `{Ea: 66, log10A: 11.9}` | a frozen, fingerprinted claim + criterion |
| An experiment is | `forkBranch` at a tick, mutate, advance to horizon | one `runExperiment` call at a chosen probe setting | one `runExperiment` call per arm |
| An observation is | a whole-world diff across every changed entity | one scalar metric | one scalar metric per arm |
| Belief is | an ordinal ladder (`ConfidenceLabel`) | numeric confidence (log-odds heuristic) | a per-hypothesis status |
| Iterates? | yes, `maxRounds` | yes, `maxRounds` | **no — one pass, by design** |
| Adapts on? | discrete **status** of the last round | continuous **predicted values** | nothing; adapting would be HARKing |

Both loops live in `core/agent/`. That is correct and worth saying out loud:
the agent layer is where the control flow lives, and the *substrate* is what
differs between them — not the layer.

### Why `hypothesisLoop.ts` is not a third duplicate

`executePreregisteredHypotheses` runs the whole frozen set once and stops.
`selectNextHypothesisExperiment` then proposes one follow-up for a caller to
run. It deliberately does **not** choose its next measurement from the last
one, because its entire value is the structural anti-HARKing guarantee: the
hypothesis set is fingerprinted before execution and re-checked after, so a
criterion edited mid-flight surfaces as a violation. A loop that adapted its
protocol from its own results would destroy exactly that property.

`inquiryLoop` is allowed to adapt without breaking that rule for a specific
reason: **its hypothesis set is fixed up front and never changes; only the
measurement point moves.** Choosing where to measure next is not HARKing.
Changing what you claimed after seeing the result is. The two loops are
adapting different things.

---

## 2. What each loop can do that the other cannot

### `discoveryLoop` only — because it has a stateful world

- **Intervene at a moment in time.** `forkBranch(decisionAtTick, …)` splits a
  branch mid-run. The Fabric has no equivalent: `runExperiment(request)` takes
  a parameter set and returns a result, and a caller cannot reach inside a run
  to change something at step 40 of 100.
- **See what else changed.** `diffWorldBranches` reports every scalar on every
  entity that moved, so a lever that fixes the objective and wrecks something
  else is visible. The Fabric returns the outputs the model declares and
  nothing more; there is no "everything else" to inspect.
- **Distinguish "did nothing" from "did the wrong thing."** `updateBelief`
  splits `REFUTED_BY_NO_EFFECT` from `REFUTED_BY_CRITERION` by asking whether
  the objective moved *at all*. This needs a world where a mechanism can change
  state without changing the measured quantity — see the chemistry mass lever.
- **Carry branch provenance into Evidence.** `compareBranches` →
  `buildWorldEvidenceBundle` → replay against an independently rebuilt
  baseline. The two arms are the same world under one declared mutation.
- **Multi-entity, cascading effects.** Coupled solvers, side effects across
  entities. There is no Fabric analogue.

### `inquiryLoop` only — because it compares predictions to a measurement

- **Discriminate between competing quantitative hypotheses.** Every
  hypothesis's prediction is a *real solver run at the same probe setting*.
  `discoveryLoop` never asks a hypothesis what it predicts; it asks whether
  applying its mechanism moved the metric in a declared direction.
- **Choose the next experiment from continuous values.** `selectNextProbe`
  picks the first candidate setting at which the top two survivors' *predicted
  numbers* are far enough apart to separate them. `discoveryLoop`'s `selectNext`
  reads only `belief.status` and `testedAtStrengths` — its adaptation is real
  but coarser, and this is a genuine difference in kind, not in polish.
- **Handle degeneracy.** Several parameter assignments that agree at one probe
  setting and disagree at another are the *reason* this loop exists. There is
  nothing in `discoveryLoop`'s vocabulary that can express "these two mechanisms
  are indistinguishable at this magnitude but not at that one."
- **Refuse for the right reason.** `NO_DISCRIMINATING_PROBE` says "no offered
  experiment could decide between the survivors." `discoveryLoop` has no such
  verdict, because it never computes what an experiment *would* show.

### Is either a subset of the other?

**No, in both directions, and this is not a close call.**

- `discoveryLoop` ⊄ `inquiryLoop`: forking a stateful world at a tick and
  diffing every entity cannot be expressed as a parameter sweep over a pure
  function. The Fabric interface has no fork and no cross-entity observation.
- `inquiryLoop` ⊄ `discoveryLoop`: judging a hypothesis against *its own
  predicted value* requires running the model as that hypothesis, which
  `discoveryLoop` never does. Its criteria are directional (`less-than`,
  `greater-than`) relative to a baseline, not point predictions with a band.

The clearest evidence that they are different questions rather than two
answers to one question: **chemistry already lives on both, and they ask
different things about it.**

- `chemistryLeverCatalog.ts` (WorldGraph) asks *"does heating, catalysis or
  more mass lower the remaining fraction?"* — a search over interventions.
- `inquiryLoop.test.ts` (Fabric, `chemistry-arrhenius`) asks *"which activation
  energy does this sample have?"* — a measurement problem.

Neither answers the other's question. A single merged loop would have to answer
both, and the merge would be a union of two vocabularies rather than a
simplification.

---

## 3. What genuinely overlaps

One shape is reachable from both, and pretending otherwise would be the kind of
tidiness that hides a real decision:

> *"Does parameter X affect output Y?"* on a model that is a pure function of
> its inputs.

`chemistry-arrhenius` on the Fabric and `GENESIS_CHEMISTRY_CATALOG` on
WorldGraph can both be pointed at that. §4 resolves it: the tie-breaker is
whether you need to see anything *other than* Y.

There is no overlap at all once the model has state that evolves and can be
intervened on mid-run — the Fabric simply cannot express that — nor once the
question is about a parameter's *value* rather than its *influence* — the
WorldGraph loop has no way to state a point prediction.

---

## 4. The boundary — where a new domain goes

Run this checklist top to bottom. **The first line that matches decides.**

| # | Question | If yes |
|---|---|---|
| 1 | Does answering it need the system to **evolve** — state at tick N feeding tick N+1, where the caller can look at intermediate ticks? | **WorldGraph** |
| 2 | Is the intervention applied at **a moment**, with a before and an after (`decisionAtTick`)? | **WorldGraph** |
| 3 | Do you need to see **what else changed** — side effects on other entities, cascades, an objective fixed at another quantity's expense? | **WorldGraph** |
| 4 | Is the unknown a **number you are trying to pin down** against an observation? | **Fabric** |
| 5 | Are you choosing between competing **parameterisations or models** that predict different values for the same measurement? | **Fabric** |
| 6 | Is the model a **pure function** of its inputs, with the whole answer in its declared outputs? | **Fabric** |
| 7 | None of the above matched. | Say so, and ask. Do not pick by convenience. |

Restated in one sentence each:

- **WorldGraph is for `"which lever?"`** — causal-structure search by
  intervention in a world that has state, time and more than one thing in it.
- **Experiment Fabric is for `"what value?"`** — parameter identification and
  model discrimination against a measurement, in a model with no memory.

### Two traps that have already cost real work

**Do not offer as an objective metric a parameter the solver only READS.**
`GENESIS_CHEMISTRY_CATALOG.metricPhrases` offers only `concentrationFraction`,
the one scalar the Arrhenius solver actually computes. Temperature and
activation energy are inputs it reads. Offering either as an objective lets a
goal like "minimise temperature" build a tautological experiment whose
intervention directly sets the very quantity its criterion reads. This was hit
and removed once; it will be hit again, because on several solvers the inputs
and the outputs share one `domainState` record.

**Do not choose the horizon before measuring the trajectory.** Too far out and
every arm has decayed to an indistinguishable zero; too near and no lever has
moved anything yet. Print the real per-tick trajectory for each arm, read
`horizonTick` off that output, and only then write the assertion.

---

## 5. The gap this leaves, named rather than implied

**Nothing today runs an inquiry *on* a WorldGraph.** The composition that does
not exist is: *a stateful world whose solver has an unknown coefficient, where
Genesis chooses the next tick to measure at in order to pin that coefficient
down.* That is a real and useful capability — it is what calibrating a model
against field data looks like — and it is neither loop today.

It is also the one thing that would legitimately motivate a merge, because it
needs `discoveryLoop`'s fork-and-advance and `inquiryLoop`'s
predict-and-discriminate in the same run. Until someone asks for it, building
it would be speculative. When someone does, the honest starting point is a
third composition over the two existing loops, not a rewrite of either — and
that is a separate brief.

Two smaller gaps, for completeness:

- `discoveryLoop` cannot express a point prediction with a tolerance band; its
  criteria are directional relative to a baseline.
- `inquiryLoop` cannot report a side effect, because the Fabric has no notion
  of one.

---

## 6. Consequence for the domains added next

By §4, epidemiology and cell biology both answer **yes at line 1** — a compartmental
ODE integrated over ticks, where a policy or a drug is applied at a moment and
the interesting question is what the intervention does to the trajectory. They
went on **WorldGraph**, as `epidemicLeverCatalog.ts` and `cellCultureLeverCatalog.ts`,
following `chemistryLeverCatalog.ts` exactly. The engine needed no change for
either: four domains now run through the same unchanged `runWorldDiscovery`.

The Fabric versions of the same sciences are not made redundant by that and are
not removed: `biology-logistic` on the Fabric answers *"what growth rate and
carrying capacity does this culture have?"*, which is line 4, not line 1. Same
science, different question, different substrate — which is the whole point of
this document.

### One finding worth carrying forward: negative results come in two kinds

Each of the four domains was required to carry a real negative result. Building
them surfaced that "a lever that does not control the objective" is not one
thing:

| Domain | Negative result (measured) | Kind |
|---|---|---|
| Flood | outlet capacity on peak depth — effect exactly 0 at horizon 40 | `REFUTED_BY_NO_EFFECT` |
| Flood | pump capacity — peak depth 1.4495 m → 1.4664 m, i.e. **worse** | `REFUTED_BY_CRITERION` |
| Chemistry | substance mass on the remaining fraction — first-order decay is defined on a fraction | `REFUTED_BY_NO_EFFECT`, exactly 0 |
| Epidemiology | treatment (IFR) on the infected count — `derivatives` computes S, E and I without reading `ifr`; the same lever cuts deaths 155.4 → 31.2 | `REFUTED_BY_NO_EFFECT`, exactly 0 |
| Cell biology | cytotoxic agent on growth — 268 524 → 54 094 cells | `REFUTED_BY_CRITERION` |
| **Cell biology** | **no exactly-inert lever exists** | see below |

Cell biology has **no exactly-inert lever, and none was invented to give it
one.** Every parameter reaches the objective through
`inhibition = 1 - total/carryingCapacityCells`, which is nonlinear in the total,
so nothing cancels exactly — not even a uniform death rate, which would cancel
out of the phase fractions exactly if the system were linear. The nearest
candidate, enlarging the vessel, is **latent rather than inert**: measured at
+0.12% (60 h), +9.0% (180 h) and +85.5% (240 h) on the same lever. Reporting
that as "no effect" would be false at every horizon.

What that domain has instead is the other kind of real negative:
`REFUTED_BY_CRITERION` — the cytotoxic lever moves the cell count decisively, in
the direction the criterion ruled out. Both are genuine refutations of genuine
hypotheses; only one of them requires the effect to be exactly zero, and a
domain that cannot produce that shape should say so rather than manufacture it.

---

## 7. First real test of the checklist — two findings for ADR-001

§4's checklist was written from two domains. It has now been run against four
new ones (epidemiology, cell biology, electrical engineering, quantum
tunnelling). It held for three and **rejected one**, which is what a useful
checklist does. Both findings below are measurements, not opinions.

### 7.1 `QuestionShape` is sufficient — but the gap C1 sensed is real, one level down

**Answer to the direct question: yes, `MECHANISM | PARAMETER` covers every
domain built so far, and no third enum is needed.** All five WorldGraph
catalogues ask MECHANISM questions; the Fabric inquiries ask PARAMETER
questions. Nothing had to be squeezed.

**On C1's specific suspicion — "when will the peak occur":** that is not a third
*question* shape, and routing it to a discovery orchestrator would be a category
error. It has no hypothesis, no competing alternatives, nothing to falsify and
no next experiment. It is a **query against one baseline trajectory** —
`TemporalEngine.scrubTo` already answers it, and a discovery strategy that
accepted it would be doing a `for` loop's job.

**But there is a real limitation, and it is not in `QuestionShape` — it is in
`discoveryLoop`'s objective.** `objectiveAt` (`discoveryLoop.ts:225`) is:

```ts
const value = collectScalars(entity)[metric];   // one scalar
// ...called only at input.horizonTick
```

So an objective is always **"the value of scalar X at tick H"**. That makes all
of these inexpressible today:

| Objective a scientist would actually state | Expressible? |
|---|---|
| infected at day 60 | yes |
| **peak** infected over the run | no — needs a max over ticks |
| **when** the peak occurs | no — needs an argmax over ticks |
| **total** infected (final size / area under the curve) | no — needs an integral |
| time until fuel drops below 20 L | no — needs a first-crossing time |

This is an **objective shape** gap, not a question shape gap: every row above is
still `MECHANISM` ("does distancing move it?"). The fix is a reducer on the
objective — `AT_HORIZON | MAX | MIN | ARGMAX | SUM | FIRST_CROSSING` — inside
`discoveryLoop`, not a third member of `QuestionShape`. That keeps the
orchestrator's routing contract at two shapes, which is where C1 wanted it.

**This already bit, and the evidence is in the repo.** `epidemicLeverCatalog.ts`
had to pick horizon day 60 and document that past day ~100 the sign of the
contact-reduction result **inverts** — a flattened curve is still climbing when
the unmitigated one has burnt out. That inversion is entirely an artefact of
being forced to score a POINT on the curve. With `MAX` (peak infected) or `SUM`
(final size) the result is monotone in the intervention and no horizon warning
would be needed at all. The epidemiology catalogue is honest about its horizon
precisely because it could not state the objective it wanted.

Recommendation: keep `QuestionShape` at two. Open a separate item for the
objective reducer. It is not blocking — three domains ship without it — but it
is the reason one of them carries a caveat it should not need.

### 7.2 Quantum tunnelling fails the substrate checklist — measured, not argued

`domains/quantumTunneling.ts` was named for the WorldGraph substrate. **It does
not belong there, and the reason is in its own module doc:** `runScenario` is
"a pure, deterministic function of four plain numbers", and the solver caches it
because it returns "a result that cannot have changed".

Measured on a real `TemporalEngine`, 40 ticks, default junction:

```
t=1   T=0.01780433287670135
t=2   T=0.01780433287670135
t=3   T=0.01780433287670135
t=10  T=0.01780433287670135
t=40  T=0.01780433287670135      bit-identical at every tick
```

Forking at tick 5 and narrowing the barrier (width 3 → 1.5) gives one step and
then a flat line forever: `T=0.0178` at t=5, `T=0.1886` at t=6, and the same
`0.1886` at t=10, 20 and 40.

Against §4's checklist: **no** at line 1 (nothing evolves — tick N does not feed
tick N+1), **no** at line 3 (one entity, no cascades), **yes** at line 6 (a pure
function of its inputs, whole answer in its declared outputs). That is a Fabric
domain, and the Fabric already declares it: `quantum-tunneling-1d`, parameters
`energy`, `barrier`, `width`.

A WorldGraph catalogue for it would run, and would produce correct numbers, and
would be a lie of structure: `decisionAtTick` and `horizonTick` would be
meaningless, the baseline "advanced to the horizon" would be identical to the
baseline at tick 1, and every round would spend thirty cached solver calls
proving it. That is exactly the "a domain pretending to be a mechanism because
there was no other option" that ADR-001 asks us to catch, so it was not built.

**What was built instead:** `quantumTunnelingInquiry.ts`, the junction as a
`SystemUnderStudy` for `inquiryLoop` on the Fabric's own
`quantum-tunneling-1d` — a PARAMETER question ("what barrier width does this
junction have?"), which is what it actually is. Physics on WorldGraph is
delivered by `electricalGeneratorLeverCatalog.ts` instead, which is a genuine
state machine with a genuine trajectory.

**If C1 does want tunnelling on WorldGraph**, there is one honest route and it
is not a catalogue: make `frames` advance with the tick, so the junction really
integrates the wave packet forward as world time passes. The packet genuinely
does cross over time, so this is real physics rather than a workaround — but it
is a change to `domains/quantumTunneling.ts`, whose module doc currently states
that `frames` is "a real, explicit parameter of the experiment, never a hidden
constant". That is a decision about the domain, not about the catalogue, so it
is left to C1 rather than taken unilaterally.

---

## 8. `generateAlternativeHypotheses` — why it was dead, and what was done

C1 found that `generateAlternativeHypotheses` in `worldCounterfactual.ts` has no
caller outside its own tests, and diagnosed it correctly: it produces the
NUMERIC `Hypothesis` from `beliefRevision.ts`, while `discoveryLoop` reasons in
the ORDINAL `HypothesisBelief` and does not import `beliefRevision.ts` at all.

**The suggested repair — hand it to `inquiryLoop`, which is the numeric loop —
does not work either**, and the reasons are about the science rather than the
types:

1. An `inquiryLoop` hypothesis is a **parameter assignment**, not a criterion.
   Its criterion is regenerated every round from that hypothesis's own model
   prediction (`criterionForPrediction`), so "the same claim with a different
   relation" has nowhere to live.
2. `TOLERANCE_WIDENED` cannot be represented there at all: the agreement band is
   a property of the **system** (`SystemUnderStudy.agreementTolerance`), shared
   by every hypothesis, not something one hypothesis can widen for itself.
3. `RELATION_FLIP` is inert there too, because the only relation `inquiryLoop`
   ever uses is `equal-within-tolerance`.

And the function's input is a `WorldCounterfactualAssessment`, which only the
WorldGraph substrate produces. So **the derivation belongs to the world
substrate while its packaging belongs to the numeric loop, and those sit on
opposite sides of the substrate boundary.** That is the actual defect — not a
missing call.

**What was done.** The belief representations were NOT merged; each carries
something the other does not, and §1 is the reason. Instead the function was
split at the line where the two halves genuinely differ:

- `deriveAlternativeCriteria(criterion, assessment, rejected)` — the real
  derivation, returning `{criterion, generatedBy}` and carrying **no belief
  representation at all**. Both loops can consume it in their own model without
  importing the other's. A test asserts the returned objects have exactly the
  keys `criterion` and `generatedBy` — no confidence, no status, no history.
- `generateAlternativeHypotheses(...)` — kept, unchanged in behaviour, now only
  the numeric packaging of the above. Its existing tests pass untouched, and new
  ones hold the two forms to producing identical criteria, mechanisms and order.

The function now carries a doc block saying plainly that it has no caller, why
`inquiryLoop` is not the answer, and what connecting it would require, so the
next person reads the reason instead of hunting for the bug.

**What was deliberately NOT done, and why it is C1's call.** Wiring
`deriveAlternativeCriteria` into `discoveryLoop` is the genuinely right next
step: a flipped criterion is a claim about the **same mechanism**, so the
parent's own `apply` is reused and no mechanism has to be invented. Two real
measured cases in this repo would fire it immediately — the flood pump (peak
depth 1.4495 m → 1.4664 m, i.e. worse) and the cell-culture cytotoxic lever
(268 524 → 54 094 cells). Both are `REFUTED_BY_CRITERION` today and stop there,
where "the opposite claim is now the live one" is a real, testable follow-up.

The one non-negotiable condition: **the derived alternative must be tested at a
DIFFERENT magnitude from the one that falsified its parent.** Re-testing "the
pump raises flood depth" against the very measurement that produced that
hypothesis is circular by construction — mechanised HARKing. Confirming it at
half strength is real dose-dependent evidence, and `discoveryLoop` already
re-tests at `replicationStrength`, so the machinery is there.

It is left undone because it changes what the loop EMITS while adapters are
being written against that output. It is a contract decision, not a bug fix.

---

## 9. Task 0 answered: no third `QuestionShape`, and how deep the real gap goes

### 9.1 The answer

**`MECHANISM | PARAMETER` is sufficient. Do not add a third value. Build the
adapters on two.**

Every question worth asking in the five domains built so far lands in one of the
two. `discoveryStrategy.ts`'s own rule settles the case C1 raised, and it is the
right rule: *"a third shape must arrive with a third real loop that answers it."*

**"When will the peak occur" has no third loop, because it does not need one.**
It has no hypothesis, no competing alternatives, nothing to falsify and no next
experiment. It is a **read of one baseline trajectory** — run the world once and
scan the series. Genesis already does exactly that in several places
(`simulateEpidemic` returns `peakInfected` and `peakDay`; `scenarioEngine`
returns full series). Admitting it to `QuestionShape` would route a
non-investigation into an investigation router, and whichever loop received it
would have to answer a question it has no machinery for. That is the failure
mode C1 named, arriving from the other direction.

**The question that IS worth asking is a MECHANISM question.** Nobody
investigating an epidemic wants "when is the peak" on its own; they want *"does
distancing push the peak later?"* or *"does distancing lower the peak?"* Those
are one lever, two arms, one criterion — MECHANISM, unambiguously. What is
different is not the shape of the question but **which number the criterion is
handed**: a peak level, a peak time, a cumulative total, rather than a value at
one instant.

So the gap is real, C1 was right to smell it, and it is **one layer below
`QuestionShape`**. Naming it there would have been the wrong fix in a way that
looked like the right one.

### 9.2 How deep it actually goes — measured, by trying it

This was not left as an argument. An `ObjectiveReducer`
(`AT_HORIZON | MAX | MIN | ARGMAX | ARGMIN | SUM`) was implemented in
`discoveryLoop`, run against the real SEIRD epidemic, and then **reverted**,
because the measurement showed a half-capability that would have shipped
contradictory results.

What the run showed, on `Minimise infected by distancing`, real numbers:

| horizon | reducer | baseline | intervention | verdict |
|---|---|---|---|---|
| day 60 | AT_HORIZON | 10 194.51 | 28.50 | SUPPORTED |
| day 200 | AT_HORIZON | **0.57** | **26.39** | **FALSIFIED** |
| day 200 | MAX (peak) | 16 156.55 | 28.71 | **FALSIFIED** ← wrong |
| day 200 | ARGMAX (peak day) | 73 | 19 | **FALSIFIED** ← wrong |
| day 200 | SUM (final size) | 624 779.65 | 5 455.22 | **FALSIFIED** ← wrong |

The day-200 `AT_HORIZON` row is the inversion the epidemiology catalogue already
warns about: the unmitigated epidemic has burnt out, the flattened one is still
running, so "infected at the horizon" really is higher for the intervention.

The three rows below it are the defect. Peak, peak-day and final size all say the
intervention worked, by four orders of magnitude — and the verdict still came
back FALSIFIED. **Because `objectiveBaseline`/`objectiveObserved` on
`DiscoveryRound` are reporting only. They never reach the criterion.**

The verdict comes from `assessWorldCounterfactual`, which reads
`readMetric(diff, entityId, metric)` — a `diffWorldBranches` over a
`compareBranches(..., horizonTick)`, i.e. two branch states at ONE tick. Change
the reported objective without changing that, and a result's numbers and its
verdict disagree. That is worse than the limitation it was meant to fix, so it
was not shipped.

### 9.3 What a real fix has to touch — three places, not one

1. **`discoveryLoop.objectiveAt`** — one scalar at `horizonTick`. The easy one,
   and the only one that looks like the whole problem.
2. **`assessWorldCounterfactual`** — the verdict itself, from a two-branch diff
   at one tick. `compareBranches` compares branch STATES and has no notion of a
   window, so this cannot be fixed by passing a different tick.
3. **`metricPresence`** — the `PRESENT_AND_MOVED` / `PRESENT_BUT_UNMOVED` /
   `ABSENT` test, also horizon-tick only. A metric that differs hugely mid-run
   and coincides at the horizon reads as `PRESENT_BUT_UNMOVED` and short-circuits
   to INCONCLUSIVE before any reduced value is looked at.

All three are shared with `crossActionComparison`, `genesisAgentTools` and the
world evidence bundle. **This is a contract change, not a local one**, which is
why it is reported rather than taken while adapters are being written against
those types.

### 9.4 Recommendation

- Ship `QuestionShape` at two values now. Nothing here blocks the adapters.
- Track the objective reducer as its own item. It is not urgent — five domains
  ship without it — but it is the reason `epidemicLeverCatalog.ts` carries a
  horizon caveat that better machinery would make unnecessary, and it is the
  only reason "peak timing" looked like a third shape.
- When it is done, the honest order is bottom-up: window-aware metric presence
  and verdict first, reported objective last. Doing the visible half first is
  exactly the mistake this section is a record of.

---

## 10. Molecular scale — one real system declared, and an honest ladder gap

The owner's brief named a real gap: Genesis has no PARAMETER inquiry at
molecular scale. Five already-registered router models were suggested as
candidates. **None of the five has the shape `inquiryLoop.ts` requires.**
Checked against the code, not memory (`router.ts`, `structuredRequestBuilder.ts`):

| Model | Parameters | Why it fails |
|---|---|---|
| `chem-rdkit-descriptors` | `smiles` (text) | Zero numeric parameters. A pure function of molecular identity, no hidden axis at all. |
| `biology-depmap-crispr-senescence-panel` | none | Zero parameters of any kind. |
| `biology-hiv-10e8-pdb-structural-comparison` | `referencePdb`, `mobilePdb` (both text) | Zero numeric parameters. |
| `biology-openmm-md-1vii-reference` | `steps` (numeric) | Exactly ONE numeric axis — a convergence control, not a second physical unknown. |
| `quantum-chemistry-pyscf-h2-rhf` | `bondLengthAngstrom` (numeric), `basis` (text) | Exactly ONE numeric axis; `basis` is text and cannot be searched. |

`SystemUnderStudy` needs TWO independent numeric axes — `hiddenParameters` and
`probeParameterId` — because `runAt` builds every request as
`{...fixed, ...hidden, [probeParameterId]: probeValue}`: the probe value always
overwrites the same key in the hidden map, so one numeric knob cannot be both
"a fact I don't know" and "a setting I dial" at once. `hiddenParameters` and
`fixedParameters` are also `Record<string, number>` — a text parameter can
never be searched, only left at its declared default (`biology-dna-helix`
fails for the same reason: `sequence` text + `temperatureC` numeric is again
only one numeric axis). Every one of the five fails on this structural point
before any question of scientific interest is even asked — exactly the "atrapa
eksperymentu" (fake experiment) the brief warned against manufacturing.

### What was declared instead: `proteinFoldingInquiry.ts`

`biology-protein-folding-hp` — the HP lattice protein-folding model (Dill
1985), already registered, already real, and genuinely molecular scale (a
folding polymer, not an atom or a population) — has THREE numeric parameters:
`temperature`, `steps`, `seed`. That is room for a real hidden axis
(`temperature`, a fact about an unmeasured fold) and a real, different probe
axis (`steps`, how long the agent watches before reading out a measurement).

The observable chosen is `acceptanceRate`, not the more obvious `bestEnergy`:
measured first, `bestEnergy` is a small integer dominated by which local
minimum ONE seeded trajectory happens to fall into (genuinely noisy between
candidates), while `acceptanceRate` is a frequency accumulated over the whole
run and is far better behaved. MEASURED, fixed seed and sequence:

```
steps=200                    every candidate temperature reads 0.1300 — IDENTICAL
steps=50000  T=0.3:0.116  T=0.7:0.298  T=1.2:0.382  T=2.0:0.398
```

The opening degeneracy is a real algorithmic floor (at few steps, every
proposed move from a straight starting chain is downhill or neutral, and the
Metropolis rule accepts those unconditionally regardless of temperature), not
a coincidence — the molecular counterpart of the compensation line
`chemistry-arrhenius` already uses this loop for.

**Checked and disclosed rather than hidden:** this signal comes from ONE
realised Monte Carlo trajectory. Re-measured across six seeds, the ORDERING
(0.3 < 0.7 < 1.2 < 2.0) held every time, but the 1.2-vs-2.0 gap stayed small
(0.01–0.06) in every seed — a real saturation of this observable at higher
temperature, not a fluke of the one pinned seed. The test suite
(`proteinFoldingInquiry.test.ts`) proves the loop reports that saturation
honestly: cold and cool converge to a single survivor; warm and hot correctly
end in `NO_DISCRIMINATING_PROBE` rather than a manufactured preference. `seed`
itself was checked as a possible second probe axis and rejected: it selects
which stochastic trajectory is realised, not a physically meaningful
measurement setting, so it is held fixed rather than searched.

Wired through the orchestrator with no new plumbing: `runDiscovery({shape:
'PARAMETER', input: proteinFoldingInquiry(...)})` — untouched
`discoveryOrchestrator.ts`, untouched `parameterStrategy` — produces the exact
`StrategyRun` calling `parameterStrategy.run` directly does, and it runs
through the existing Science Memory / Replay pipeline unchanged.

### 10.1 The scale ladder — checked, and the honest answer is no bridge exists

The owner's target is a ladder: DNA → molecule → cell → organism → population
→ environment. Genesis has cells (`cellCycle.ts`, WorldGraph) and now has a
real molecular PARAMETER inquiry (this section, Experiment Fabric). **Is there
a real "molecular change → cellular effect" rung connecting them? No — checked
by code, not asserted.**

`grep` for every file that declares a `CrossDomainCoupling`
(`crossDomainCoupling.ts`, `wildfireSpread.ts`, `rainfallRunoff.ts`,
`seismicShaking.ts`, `genesisScientificCity3/4.ts`, `quantumTunneling.ts`,
`drought.ts`, `floodInundation.ts`) turns up **zero** mentions of `cellCycle`
or `cell-biology` anywhere. `cascadeRules.ts` has none either. This is not "the
bridge is weak" — it is structural: `CrossDomainCoupling` fires on a
`triggerEventType`, a `GenesisEvent` that only a `TemporalEngine` tick emits.
The Fabric substrate (`runExperiment`) is a one-shot, stateless computation
with no `WorldGraph` entity and no event stream — there is no mechanism by
which a Fabric result could trigger a coupling even in principle, and no
WorldGraph-side molecular domain (`chemistryKinetics.ts` included) is coupled
to `cellCycle.ts` either.

**Building this bridge now would mean inventing new glue** — reading a
Fabric number and hand-feeding it into a WorldGraph entity's construction
parameters — which is exactly the kind of invented rung the brief said to name
rather than build. So it is named here, not built: **the ladder has a real gap
between the molecular rung and the cellular rung**, and closing it is a real
design decision (a new coupling mechanism able to span both substrates, or a
convention for one substrate handing a value to the other at world-build time)
that belongs to whoever owns that call, not something to improvise inside a
single inquiry declaration.

### 10.2 The negative-result finding, and why this domain's shape doesn't have one to give

Every MECHANISM catalogue built this session carries a real inert-or-limited
lever found by comparing several declared mechanisms against ONE objective
(chemistry's mass, epidemiology's IFR, the generator's nameplate and tank).
**A PARAMETER inquiry has no equivalent slot for that comparison, and this is
structural, not an oversight:** `SystemUnderStudy` declares exactly ONE hidden
axis and ONE probe axis by construction — there is no second, alternative
"lever" being tested against a fixed objective to find inert.

The nearest analogue that WAS found and IS reported: `seed`, a real declared
numeric parameter of this very model, checked directly (§10 above) and shown
to carry no discriminating information about the hidden temperature — not
because it has literally zero effect on the observed metric (it does shift
sampled values, see the six-seed table), but because that effect is
*undirected noise* rather than a *systematic, discriminable relationship*,
which is the property a probe axis actually needs. It is declared as a fixed
nuisance parameter rather than searched, and the module doc says why, in place
of a fabricated "this domain also has an inert lever" that would not be true
in the same sense the others are.

---

## 11. §5's gap, closed — one real domain, checked before building

§5 named the gap and deliberately did not build it: *"a stateful world whose
solver has an unknown coefficient, where Genesis chooses the next tick to
measure at in order to pin that coefficient down."* This section is that
composition, done the way §5 said it should be if anyone ever did it: **as a
third composition over the two existing loops, not a rewrite of either** — and
only after checking a real domain has the shape at all.

### 11.1 The domain audit — what was checked, and why each other candidate lost

The requirement, read literally out of §5: a WorldGraph solver reading a
genuinely uncertain INPUT CONSTANT (not a lever anyone would switch — a fixed
value nobody currently knows), plus a time-evolving metric that separates
differently at different ticks. Domains checked, by reading the solver code,
not by guessing:

| Domain | Candidate constant | Verdict |
|---|---|---|
| `chemistryKinetics.ts` | activation energy / pre-exponential | **Ruled out.** Both are already MECHANISM levers in `chemistryLeverCatalog.ts`; at fixed temperature the rate constant `k` is time-invariant, so no tick-probing scheme can separate compensation-line pairs at one fixed T — that degeneracy needs a temperature sweep, which is exactly the SETTING-based probe `inquiryLoop.ts` already runs for this same Arrhenius physics on the Fabric (`inquiryLoop.test.ts`'s own compensation-line system), not a tick-based one. |
| `electricalGeneratorLeverCatalog.ts` | `startupDelayS` | **Ruled out.** The catalog's declared world always starts already RUNNING; there is no "unknown startup delay" to calibrate because the delay is never exercised in the world this catalog builds. |
| `cellCultureLeverCatalog.ts` | `g2mDurationH` | **Not pursued.** A real unexploited numeric input (phase-duration constant, not a lever), structurally the same shape as `infectiousDays` below — noted as a second real candidate for a future declaration, not built here because one clean, fully-measured domain is what this brief asked to design, not an exhaustive catalogue. |
| `floodInundation.ts` / `rainfallRunoff.ts` | — | **Ruled out.** Every real constant these solvers read (outlet capacity, pump capacity, rainfall intensity) is already exposed as a MECHANISM lever; nothing left over is both unswitched and genuinely unknown. |
| `epidemicSEIR.ts` | `infectiousDays` / `incubationDays` | **Chosen.** Both are read by the real RK4 solver, both are declared in `epidemicLeverCatalog.ts`'s own doc comment as inputs the solver only ever *reads* (never a lever `r0`, `interventionEffect` and `ifr` already are), and the mean infectious period is exactly the kind of pathogen property real epidemiology estimates from case-count curves rather than sets. |

No artificial uncertainty was invented anywhere in this table: every ruled-out
row is ruled out because the constant is either already a lever (switchable,
not calibratable) or structurally inert in the world as built, checked against
the actual solver code, not assumed.

### 11.2 Why the tick has to be chosen, not just read at the end — measured

Declared in `epidemicInfectiousDaysCalibration.ts` and measured on the real
solver (fixed r0=2.5, incubationDays=3, ifr=0.01, population=100 000), five
candidate infectious periods spanning 6–8 days:

```
day=2                    all five candidates read within ~2.5% of each other
day=30   d=6:623   d=6.5:528   d=7:454   d=7.5:397   d=8:350   — cleanly separated
day=80   d=6:9081  d=6.5:11869 d=7:14279 d=7.5:15976 d=8:16801 — REVERSED
```

`betaAt` computes β = r0 / infectiousDays: R0 fixed, so a SHORTER infectious
period means HIGHER transmission — that epidemic runs hotter and peaks
earlier. By day 80 the short-period run has already peaked and receded below
the still-climbing long-period one, flipping the day-30 ranking. A calibration
that always read at the horizon would misjudge this domain in a way that gets
*worse* the longer it waits, not better — choosing the tick adaptively, from
real per-hypothesis predictions the same way `inquiryLoop.ts` chooses a probe
setting, is what keeps the answer correct at all, not a refinement on top of a
"good enough" default.

### 11.3 What was built, and what was reused unchanged

**New:** `worldParameterCalibration.ts` (the composition engine) and
`epidemicInfectiousDaysCalibration.ts` (the one domain declared on it so far).
Together these are the WorldGraph-side counterpart of `SystemUnderStudy` /
`runAutonomousInquiry`: `WorldParameterSystem` plays `SystemUnderStudy`'s role
(`hiddenValue` is read exactly once, to build the one hidden world every
candidate is judged against, and never handed to any reasoning step below that
point — the same boundary `ObservableSystem` enforces by type erasure on the
Fabric side, here enforced by construction instead, since a WorldGraph world
has no flat parameter record to erase a field from).

**Reused, unmodified:** `createHypothesis`, `updateConfidence`,
`rankHypotheses`, `checkDiscriminability`, `evidenceMagnitudeWithinTolerance`
(`beliefRevision.ts`); `evaluateTwoArmRelation` (`falsificationRelation.ts`);
`reduceObjectiveTrajectory` with the `AT_HORIZON` reducer (`objectiveTrajectory.ts`,
used exactly as designed — read one tick off an already-advanced trajectory).
`discoveryLoop.ts`, `inquiryLoop.ts`, `discoveryOrchestrator.ts`,
`objectiveReducer.ts` and `objectiveTrajectory.ts` itself were **not modified**
— an audit of each (reading the actual code, per the brief) found no forcing
need to touch any of them; `inquiryLoop.ts`'s own control flow
(`inContention`, `snapshot`, `selectNextProbe`'s double-direction
discriminability check) is mirrored rather than imported, because it is
hard-wired to Fabric-specific calls (`runExperiment`, `getRouterModel`) a
WorldGraph world has no use for.

Measured end-to-end (`epidemicInfectiousDaysCalibration.test.ts`): every one
of the five declared candidates resolves to the correct single survivor in
exactly two rounds, and — proof the loop is genuinely driven by what it
measures rather than a fixed schedule — **which second tick it picks depends
on which truth is hidden**: 30 for short/brief/typical, 45 for extended/long,
because the pair of top contenders surviving round one shifts with the
observation, and different pairs need different ticks to separate. A
tightly-spaced control case (three candidates 0.1 day apart, a tenth of this
domain's own default) never separates within the declared ±12% band at any of
the six candidate ticks and correctly reports `NO_DISCRIMINATING_PROBE` rather
than guessing — the honest tie this domain's own real candidate spacing does
not otherwise produce.

### 11.4 Left open, deliberately: orchestrator wiring

`WorldParameterCalibrationInput` is not `InquiryLoopInput` and
`WorldParameterCalibrationResult` is not `StrategyRun` — wiring this
composition into `discoveryOrchestrator.ts`'s `DiscoveryRequest` union would
mean editing a file this brief listed as untouchable absent an audited need,
and no such need was found: nothing downstream (Science Memory, Replay, the UI
screens) currently calls this composition, so there is nothing forcing the
union to grow yet. Whether it should — a third `DiscoveryRequest.shape`, or a
variant of `PARAMETER` that branches on substrate — is a real design decision
for whoever first needs to call this from the orchestrator rather than
directly, the same kind of call §5 itself deferred. Left open here rather than
guessed at.
