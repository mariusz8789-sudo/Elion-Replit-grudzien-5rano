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
