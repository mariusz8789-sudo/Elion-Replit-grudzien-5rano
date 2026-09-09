# Roadmap — from adaptive experimental reasoning to autonomous scientific discovery

**Status:** architecture and plan. No implementation follows from this document by itself.
**Owner:** C1 (architecture/integration).
**Measure of progress:** not the solver count. *How much of a scientific investigation Genesis performs without being handed the hypotheses.*
**Destination:** `GENESIS_NORTH_STAR.md` — this document is P1–P7 of that
destination's reasoning layer (its §5, "Scientific Reasoning"). Read that
document for why the layer stops where it stops (§4's honesty boundary on
real-world I/O) and for the full 15-capability checklist this roadmap is
walking through.

**P1–P5 status as of the memory→selection landing (`b6634b1`):**

| | Item | Status |
|---|---|---|
| P1 | Discovery Orchestrator | **done** |
| P2 | ObjectiveReducer verdict pipeline | **done** |
| P3 | `deriveAlternativeCriteria` wired into the round loop | **done** |
| P4/P5 | Model insufficiency as a first-class outcome | **done** (`modelSufficiency.ts`) |
| P1 (memory) | Scientific Memory → Selection — narrowing, not just a warning | **done** (`discoveryOrchestrator.ts`'s `PriorInvestigationDecision`) |
| **P6** | **Model-class proposal + discriminating experiment between models ("Competing Models")** | **first increment done** (`competingModels.ts` — see below); the harder second increment is open |
| P7 | World ↔ inquiry calibration | **done** (`CALIBRATION` `QuestionShape`, see `TWO_AUTONOMOUS_LOOPS_DECISION.md` §12) |

**P6, first increment — `competingModels.ts`.** A pure `StrategyRun` reader,
same discipline as `modelSufficiency.ts`: when a run ends with more than one
surviving hypothesis, that state now has a name
(`COMPETING_MODELS_UNRESOLVED`), is joined into the Matrix
(`GenesisMatrixView.competingModels`), and is voiced by narration — instead of
being buried in `inquiryLoop.ts`'s own `openQuestions` prose (PARAMETER only)
or entirely unreported (MECHANISM/CALIBRATION). Grounded in a real degeneracy
already proven elsewhere in the suite: four Arrhenius kinetics hypotheses on
the same compensation line, genuinely indistinguishable at the one probe
offered (`inquiryLoop.test.ts`'s `NO_DISCRIMINATING_PROBE` fixture, reused
rather than re-derived in `competingModels.test.ts`).

**What it deliberately does not do yet — the open second increment.** It does
not propose a new hypothesis, a new model class, or design a NEW
discriminating experiment. `inquiryLoop.ts` already designs a discriminating
probe LIVE, mid-run, for the top two contenders
(`checkDiscriminability`/`DISCRIMINATES_TOP_TWO`); `COMPETING_MODELS_UNRESOLVED`
only fires for what survives AFTER that already failed or was never
attempted (MECHANISM has no equivalent live-discrimination step at all — it
stops the instant any ONE hypothesis reaches
`SUPPORTED_AT_TWO_MAGNITUDES`, so it never tries to separate two independently-
supported ones). Designing that — a probe/strength/tick outside what the run
already tried, specifically chosen to separate the NAMED survivors this
verdict lists — is the genuinely hard part the roadmap always meant by P6, and
remains open.

P6 is the next real priority: every earlier item it depended on is done, and
it is the one row of the North Star's §3 table ("generate competing models")
still missing.

## 0bis. Information Gain / Experiment Planner — DONE for PARAMETER and CALIBRATION

**Status: implemented.** The design below was built exactly as audited, and the
worked example at the end of this section is now a passing test. What follows
is kept as the reasoning record — including the measurement that decided it —
because the "why not a score" argument governs anything built on top of this.
MECHANISM is still open; see the end of the section.


The user's third named priority, after Memory→Selection and Competing Models.
**"Information gain" cannot mean a numeric utility function here** — nothing
in this codebase justifies weighting one uncertainty above another
numerically (§5's existing four next-experiment selectors are lexicographic
cascades for exactly this reason, and `checkDiscriminability` itself is a
deterministic yes/no band check, never a score). Inventing one now would be
the overclaim this repository refuses everywhere else. The honest reading:
**prefer any experiment PROVEN to change the belief state over one proven not
to**, using machinery that already exists.

### What already IS an information-gain planner, found by reading

`inquiryLoop.ts`'s `selectNextProbe` and `worldParameterCalibration.ts`'s own
copy of it already do real discriminating-experiment selection — LIVE,
mid-run — but only between the **top two** contenders by confidence rank
(`rankHypotheses`, then `[first, second]`). When `competingModels.ts` reports
`COMPETING_MODELS_UNRESOLVED` with **more than two** survivors, this is
incomplete: a probe that cannot separate the top two might still separate a
THIRD contender from either of them, at an untried candidate value — real
progress (one fewer live rival) that today's `NO_DISCRIMINATING_PROBE` gives
up on without checking.

### The minimal honest increment — built

**Widen the search from "the top-two pair" to "every pair among the current
contenders", only as a fallback AFTER the existing top-two check fails.**
Still the exact same deterministic `checkDiscriminability` band check, no new
ranking invented — just applied to more pairs before giving up. A new
`ProbeSelectionRule` value (e.g. `DISCRIMINATES_OTHER_PAIR`) reports honestly
that this measurement narrows the field WITHOUT settling the top-ranked
disagreement, rather than reusing `DISCRIMINATES_TOP_TWO`'s wording for a
different, weaker claim.

**Why it was audited before being written.** `selectNextProbe` and its
`worldParameterCalibration.ts` twin are live, tested, in-production loops —
`NO_DISCRIMINATING_PROBE` is asserted by name in at least 12 files across the
test suite. A fallback that only activates when the existing check already
failed cannot change a test where EVERY pair is genuinely indistinguishable,
and three of the real fixtures checked are exactly that (safe, confirmed by
reading, not assumed — and all still green after the change):

- Arrhenius compensation-line (`inquiryLoop.test.ts`): exactly one candidate
  probe, already tried — nothing left to widen into.
- `h:a`/`h:b`/`h:c` tightly-spaced CALIBRATION fixture
  (`discoveryOrchestrator.test.ts`, `discoveryStrategies.test.ts`,
  `epidemicInfectiousDaysCalibration.test.ts`): documented "never separate
  beyond the declared ±12% band at any of the six candidate ticks — MEASURED,
  not assumed" for all three pairs, not just the top two.

**One real fixture is NOT safe, and this is now MEASURED, not open.**
`proteinFoldingInquiry.test.ts`'s WARM case ends with THREE survivors
(`h:cool`, `h:hot`, `h:warm` — only `h:cold` falsified) and
`NO_DISCRIMINATING_PROBE` after 2 rounds (probes 200, 5000 tried; candidates
are `[200, 1000, 5000, 20000, 50000]` steps). Checked by actually running the
real solver at every candidate (temporary probe script, deleted after — not
guessed):

- Confidence after round 2: `h:warm` 0.953, `h:hot` 0.897, `h:cool` 0.873 — so
  the loop's real top-two is warm/hot, and at EVERY untried step count
  (1000/20000/50000) their predicted `acceptanceRate` differs by only
  2.3%–10.1%, under the declared ±15% band — confirms the module doc's claim,
  this pair genuinely never separates.
- But `h:cool` vs. either of them, at steps=20000: cool predicts 0.29865,
  warm 0.36675 (18.6% apart), hot 0.40795 (26.8% apart) — BOTH exceed the 15%
  band. A widened search checking pairs beyond top-two WOULD select
  steps=20000 (the first untried candidate where any pair separates) and
  eliminate `h:cool`, changing this fixture from "3 survive, stop after 2
  rounds" to "2 survive (`h:warm`/`h:hot`), stop after 3 rounds" — a real,
  correct, MORE complete answer than what ships today, not a regression.

This is exactly the worked example the implementation was built against, and
it is now the `INFORMATION GAIN: runs the experiment that narrows the field
when none settles the top two` test in `proteinFoldingInquiry.test.ts`: round
3 exists, runs at steps=20000 under `DISCRIMINATES_OTHER_PAIR`, and moves
`h:cool` from standing to `FALSIFIED_WITHIN_PROTOCOL`. The fixture's other
assertions were updated to the REAL new result (falsified `h:cold`+`h:cool`,
surviving `h:warm`+`h:hot`) — no fixture or solver was touched to make
anything pass. All 11 other dependent files stayed green.

**One cost note, since it is load-bearing.** The widened search puts the same
hypothesis in several pairs, and successive rounds re-scan the same untried
settings; on the protein-folding solver that was enough to blow the default
5s timeout of the determinism test. The fix is a prediction cache keyed by
(hypothesis, setting), shared across rounds — behaviour-neutral, because a
prediction depends only on the hypothesis's claimed values and the setting
(neither moves as beliefs update), and because those runs, unlike
measurements, are never collected. With it, the file is faster than before
the change. The timeout was never raised.

**MECHANISM has no equivalent at all**, live or dead — this is the same gap
P6 §"open second increment" names. Designing what a discriminating
intervention would even mean on a forked `WorldGraph` (a different strength?
a different lever, run in parallel?) is real, substrate-specific work — see
the C3 prompt asking for exactly this, grounded in real declared catalogs
rather than designed in the abstract.

---

## 0. The finding that reframes this

The capability this roadmap is named after — *"that hypothesis does not explain
the observation, so derive the next testable one"* — **is already built, already
tested, and has zero production call sites.**

`worldCounterfactual.ts::deriveAlternativeCriteria(criterion, assessment, rejectedFingerprints)`:

- derives an alternative **from the real measured numbers** of the falsification
  it is reacting to — `RELATION_FLIP` when the data moved the opposite way,
  `TOLERANCE_WIDENED` to exactly the tolerance the observed difference would
  satisfy, and no further;
- refuses to generate anything from a run that was not a clean, evaluable
  falsification (returns `[]`);
- filters candidates against `rejectedFingerprints`, so a criterion this
  investigation already judged cannot silently reappear as new;
- carries no belief representation at all, so **both** loops can consume it —
  the ordinal `HypothesisBelief` ladder and the numeric `Hypothesis` alike.

Grep confirms: referenced only by `worldCounterfactual.test.ts`. Nothing in
`discoveryLoop.ts` calls it.

So the honest summary of where Genesis stands is not "autonomous hypothesis
generation must be built". It is: **the first real increment of it exists and is
one call site away from being live**, and the work ahead is wiring, then
widening — not a new subsystem.

---

## 1. A — what Genesis already does

| Capability | Where | Real? |
|---|---|---|
| Refuse a question with no solver behind it | `discoveryAdmission.ts` + `solverCapability.ts` (34 scenario kinds, compiler-exhaustive) | yes — this is point 5 of the brief, already shipped |
| Investigate a MECHANISM question | `discoveryLoop.ts` — fork, intervene, compare arms | yes, on 5 domains |
| Investigate a PARAMETER question | `inquiryLoop.ts` — predict, measure, discriminate under degeneracy | yes |
| One reporting contract over both | `discoveryStrategy.ts` + `discoveryStrategies.ts` adapters | yes, equivalence-tested over the whole catalog registry |
| Falsify against a criterion fixed before the run | `preregisterWorldCounterfactual` + `verifyWorldPreregistrationIntact` | yes — fingerprint mismatch ends the assessment |
| Measure an outcome as peak/argmax/total/first-crossing, not only at the horizon | `objectiveReducer.ts` + `objectiveTrajectory.ts` | yes (C1 layer landed; `discoveryLoop` wiring is C3's) |
| Derive the next criterion after a falsification | `deriveAlternativeCriteria` | **built and tested, not wired** |
| Graded belief with full history | `beliefRevision.ts` — log-odds, `ConfidenceUpdateRecord[]` | yes |
| Provenance of a generated hypothesis | `Hypothesis.generatedBy` / `parentHypothesisId` | yes |
| Evidence bundle + independent replay | `worldEvidenceBundle.ts`, `buildBundleReplay` | yes |
| Persist and replay a whole investigation | Science Memory | yes |

## 2. B — partially there

- **Hypothesis record.** `Hypothesis` carries id, criterion, confidence, status,
  `generatedBy`, `parentHypothesisId`, history; `criterionFingerprint` exists.
  Missing from the record: **declared assumptions** and **required capabilities**
  (point 10). Both are additive fields, not a redesign.
- **Two hypothesis kinds, not five.** `MechanisticHypothesis` (a lever with an
  `apply`) and `ParameterHypothesis` (a claimed assignment) are real and in use.
  The other three the brief names — relationship, competing-model, emergent —
  have no real experiment behind them yet, and per the standing rule are **not**
  to be added as enum values in advance.
- **Next-experiment selection.** Four selectors already exist
  (`hypothesisLoop`, `experimentGraph`, `discoveryFollowUp`, `whyNextExperiment`),
  all lexicographic cascades over declared uncertainty, none scoring. A
  generation layer must reuse this discipline rather than introduce ranking.
- **Orchestrator.** Not built. Deliberately deferred until the adapters proved
  both engines report into one contract without information loss — which they now do.

## 3. C — genuinely missing

1. **A generation stage anywhere in the control flow.** No loop ever asks for a
   new hypothesis; both consume the set they were handed.
2. **A search space a generator may draw from, per domain.** The lever catalogs
   declare mechanisms, but nothing declares *"these are the candidate criteria a
   generator may propose over this metric"*.
3. **Model insufficiency as a reportable outcome.** When every declared
   hypothesis is falsified and no alternative can be derived, Genesis has no way
   to say *"the declared space does not explain this observation"*. Today the run
   simply ends with everything refuted, which reads as a weaker claim than it is.
4. **Model-class proposal and a discriminating experiment between models**
   (point 8). Nothing exists. This is the genuinely hard part and it is last.

---

## 4. Architecture — a stage, not a third loop

**Decision: hypothesis generation, model selection and experiment proposal are a
layer ABOVE the two strategies, and there is no third investigation loop.**

The strategies answer *"given hypotheses H, investigate"*. The layer above
answers *"what is H, and which strategy should hold it"*. Investigation itself
never moves.

```
                broad question
                      |
              [ ADMISSION ]  discoveryAdmission.ts  ── "no model for this" ──► stop, honestly
                      |
              [ GENERATION ]  candidate hypotheses, each with a criterion,
                      |        an origin, and the capabilities it needs
                      |
              [ SHAPE + ROUTING ]  QuestionShape → mechanismStrategy | parameterStrategy
                      |
              [ EXISTING STRATEGY RUNS ]  ← untouched: discoveryLoop / inquiryLoop
                      |
              [ RESULT → StrategyRun ]  ← untouched contract
                      |
              [ REGENERATION ]  deriveAlternativeCriteria on each falsification,
                      |          filtered by fingerprints already judged
                      |
              ── new candidates? ──► loop back to ROUTING
                      |
                   none left
                      |
              [ INSUFFICIENCY ]  "the declared space does not explain this"
                      |
              Evidence + Replay  ← untouched
```

Two properties make this a stage and not a loop: it owns **no experiment
execution** and **no belief representation**. It produces criteria and consumes
`StrategyRun`s. Everything scientific stays where it already is.

### The honesty boundary this layer must state and never cross

Genesis generates hypotheses **within a declared search space** — the levers a
world declares, the candidate values an inquiry declares, and the mechanical
derivations `deriveAlternativeCriteria` supports. **It cannot invent a mechanism
the world does not model**, and it must never appear to. When the space is
exhausted, the correct output is *model insufficiency*, which is a real
scientific result — not a failure to be papered over with a generated-sounding
hypothesis nobody can test.

---

## 5. Guardrails (brief point 9)

| Risk | Guard | Status |
|---|---|---|
| HARKing | Every criterion is fingerprinted at preregistration and re-verified before assessment; the reducer is inside the criterion, so *how it is measured* is covered too | exists |
| Post-hoc fitting | A generated criterion is preregistered **before** its own run, exactly like a declared one — a generator gets no privileged path | must be enforced in the new layer |
| Circular reasoning | A derived criterion is filtered against `rejectedFingerprints`; a hypothesis already judged cannot return as new | exists in `deriveAlternativeCriteria`, must be threaded across rounds |
| Tautological objectives | Only metrics a solver **computes** may be objectives; inputs it merely reads are refused | rule documented and enforced per catalog; the generator must inherit it |
| Hidden-parameter leakage | `ObservableSystem = Omit<SystemUnderStudy, 'hiddenParameters'>` — compiler-enforced | exists; generation must run on the observable projection only |
| Fake discovery | A generated hypothesis with no capability behind it is refused by admission before it can be "tested" | exists; must be applied per generated hypothesis, not once per question |

## 6. The hypothesis record (brief point 10)

Additive to `Hypothesis`, not a new type:

| Field | Have it? |
|---|---|
| identifier | yes (`id`) |
| origin | yes (`generatedBy`, `parentHypothesisId`) |
| falsification | yes (`criterion`) |
| status | yes |
| provenance / fingerprint | yes (`criterionFingerprint`, evidence bundle) |
| predictions | partially — real in `inquiryLoop` (`HypothesisOutcome.predicted`), absent in the mechanism path, which asserts a direction rather than a value |
| declared assumptions | **missing** |
| required capabilities | **missing** |

## 7. Priorities

| | Item | Depends on | Note |
|---|---|---|---|
| **P1** | Discovery Orchestrator | adapters (done) | The routing/regeneration host. Everything below plugs into it. |
| **P2** | ObjectiveReducer verdict pipeline | — | C1 layer landed; `discoveryLoop` wiring outstanding (C3). |
| **P3** | Wire `deriveAlternativeCriteria` into the round loop | P1, P2 | **Smallest real step to autonomy in the whole roadmap.** The code exists; it needs a call site, cross-round fingerprint accumulation, and preregistration of the derived criterion. |
| **P4** | Declared generation space per domain + capability-gated candidate admission | P3 | Lets a generator propose beyond relation-flip without inventing anything. |
| **P5** | Model insufficiency as a first-class outcome | P3, P4 | **DONE** (`modelSufficiency.ts`) — `DECLARED_SPACE_INSUFFICIENT`, with the declared-space-not-the-model caveat; threaded through the Matrix and voiced by narration. Note: the user's numbering calls this "P4"; it is the same capability. |
| **P6** | Model-class proposal + discriminating experiment between models | P5 | The genuinely hard part. Do not start early. |
| **P7** | World ↔ inquiry calibration (the composition named in `TWO_AUTONOMOUS_LOOPS_DECISION.md` §5) | P1 | Unlocks parameter identification *on a stateful world*. |

P3 is deliberately placed before P4: it converts an existing, tested, unused
capability into live behaviour, and it will teach us what a wider generator
actually needs before we design one.

### The constraint that decides HOW P3 is wired — found by thinking it through

A derived alternative **cannot be judged against the run that produced it.**

`RELATION_FLIP` says: *we predicted the lever lowers X; it raised it; so propose
that it raises it.* That alternative is, by construction, satisfied by the exact
numbers that falsified the original. And these worlds are deterministic — re-running
the same lever at the same strength returns identical values. So "testing" the
flipped criterion against that run, or against a re-run of it, is confirming a
hypothesis with the data that generated it. Textbook HARKing, arrived at through
a mechanically honest derivation, which is precisely what makes it dangerous.

The alternative must therefore face evidence it did not see: it has to be
**scheduled at a strength (or probe setting) not yet used**, and preregistered
before that arm runs.

Two consequences, and they are not negotiable:

1. **P3 belongs in the round loop, not above it.** Only the loop can schedule a
   hypothesis at an untested magnitude — it already does exactly this for
   surviving hypotheses via `replicationStrength`. An orchestrator-level
   "regenerate and re-run" would either repeat the identical run or need its own
   scheduler, which is a second loop by another name.
2. **A derived hypothesis with no untested magnitude left is not testable**, and
   the honest outcome is to report it as an untested proposal rather than to
   confirm it cheaply. That is the same discipline as INCONCLUSIVE: failing to
   test something is not the same as testing it.

## 8. Test strategy

Non-negotiable, and the same discipline the adapters were held to:

1. **Real substrates only.** Epidemiology, chemistry, flood, cell biology,
   generator, quantum inquiry. No synthetic hypothesis objects.
2. **Measure before asserting.** Probe the trajectory, read the numbers, then
   write the assertion. Delete the probe.
3. **The regeneration property, on a real falsification:** a hypothesis the loop
   really refuted yields a derived alternative whose criterion is *not* fingerprint-
   identical to anything already judged in that run — asserted across rounds, not
   within one call.
4. **The anti-HARKing property:** a derived criterion's fingerprint is registered
   before its run and verified after; a test must show that mutating it
   mid-flight produces INCONCLUSIVE, not a verdict.
5. **The insufficiency property:** a world whose declared levers genuinely cannot
   move the objective ends with a named insufficiency, not with a generated
   hypothesis. Chemistry's mass lever and epidemiology's treatment lever are real
   `REFUTED_BY_NO_EFFECT` cases already available for this.
6. **Equivalence, again:** the orchestrator running a single-strategy question
   must produce the same `StrategyRun` as calling that strategy directly.
7. **No regression gate:** full suite green with byte-identical results for every
   path that does not opt into generation.

## 9. First demonstrable version — on domains that already exist

**Epidemiology, `lever:treatment`.** It is a real, measured
`REFUTED_BY_NO_EFFECT`: `derivatives` computes S, E and I without reading `ifr`,
so treatment cannot move the infected count — while the same lever cuts deaths
from 155.4 to 31.2. A first autonomous demonstration:

1. question: *"what reduces the infected count?"*
2. admission passes (epidemiology is modelled)
3. treatment is tested and genuinely refuted — no effect on `I`
4. regeneration correctly derives **nothing** from a no-effect refutation
   (`deriveAlternativeCriteria` returns `[]` for anything that is not a clean
   evaluable falsification) — so the system must move to the next declared lever
   rather than invent one
5. distancing is tested and, **with the P2 reducer measuring the peak**,
   supported
6. the run ends with a real finding, a real negative result, and an Evidence
   bundle that replays

That sequence uses no new domain, no new solver, and no fabricated state — and it
is a genuine autonomous investigation of a question nobody handed hypotheses for.
