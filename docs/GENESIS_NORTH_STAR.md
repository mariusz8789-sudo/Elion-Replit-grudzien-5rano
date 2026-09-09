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

## 7. The three standing priorities — and where each actually stands

Every new feature is now judged against these three. The rule, applied before
starting anything: **does this move Genesis closer to autonomous discovery, real
validation, or product readiness?** If not, it does not outrank them.

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
