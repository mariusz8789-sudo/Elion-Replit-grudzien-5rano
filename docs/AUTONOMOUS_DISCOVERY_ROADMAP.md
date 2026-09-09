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

### P6, MECHANISM-shape audit (C3) — measured, not assumed

`competingModels.test.ts` had zero MECHANISM-shape coverage until this audit,
named as an open gap in that module's own doc. The question: can a REAL lever
catalog (flood, epidemiology, chemistry, generator, cell-culture) reach
`bestSupported.length > 1` under `discoveryLoop.ts`'s current `selectNext`,
and if so, does that happen before or instead of
`LEADER_CONFIRMED_AT_TWO_MAGNITUDES`?

**Measured on all five, under a generic all-levers goal:** four of five never
reach it — `selectNext`'s consolidation-first rule (a `SUPPORTED_ONCE`
hypothesis is ALWAYS retested before the loop explores a new one) serialises
the search onto one hypothesis at a time, so two DECLARED hypotheses can never
be simultaneously mid-consolidation without help. `genesis-backup-generator`
is the exception, and the mechanism is P3 regeneration, not plain declared
competition:

- `h:fuel-efficiency` and `h:load-shedding` are both declared with a criterion
  whose expected direction the real solver contradicts at strength=1
  (baseline 40.0 L fuel remaining; observed 85.83 and 98.67 — the metric moves
  a lot, just the opposite way the criterion expected) — genuine
  `FALSIFIED_WITHIN_PROTOCOL`, not a no-effect result.
- Each derives a `RELATION_FLIP` alternative, excluding strength=1 (its
  parent's falsifying strength) from ever being retested.
- Both flipped alternatives are tested at strength=0.5 and are genuinely
  `SUPPORTED` there (62.92 and 69.33 — a real, dose-proportional effect:
  22.92 ≈ 45.83/2 and 29.33 ≈ 58.67/2, not noise).
- **Neither can ever reach `SUPPORTED_AT_TWO_MAGNITUDES`**, because their one
  remaining untested magnitude (1) is the one excluded. So
  `LEADER_CONFIRMED_AT_TWO_MAGNITUDES` never fires at all in this run — the
  loop instead runs out of testable hypotheses honestly
  (`ALL_HYPOTHESES_RESOLVED`) with **two permanently-unconsolidated
  survivors**, both reported in `bestSupported`.

Test added: `competingModels.test.ts`'s `"MECHANISM shape, a real domain that
reaches 2+ simultaneous survivors"` describe block, against this exact fixture
— `assessCompetingModels` correctly reports `COMPETING_MODELS_UNRESOLVED` with
both hypothesis ids and `stopReason: 'ALL_HYPOTHESES_RESOLVED'` carried
verbatim (not generalised into PARAMETER's `NO_DISCRIMINATING_PROBE`
vocabulary, per this module's own rule on why `stopReason` travels
unedited).

**A conceptual point this measurement surfaces, worth carrying into the next
section:** `h:fuel-efficiency~RELATION_FLIP` and `h:load-shedding~RELATION_FLIP`
are not RIVAL explanations of one phenomenon the way four Arrhenius
`(Ea, log A)` pairs are — they are claims about two DIFFERENT levers, and both
can be true at once (both really do move fuel remaining). Two survivors here
is not necessarily "Genesis is confused between two stories"; it may
legitimately be "two real, independent effects are both confirmed." Designing
what a live discriminator should DO with this state needs that distinction —
see the next section.

### P6, live discrimination for MECHANISM — architecture (C3, not implemented)

`inquiryLoop.ts`'s `checkDiscriminability`/`selectMostDiscriminatingExperiment`
(`beliefRevision.ts`) work because every PARAMETER hypothesis makes a
**prediction about the same shared observable** at a candidate probe setting —
so one measurement can be checked against every rival's own prediction, and a
setting where two predictions disagree is directly a discriminating
experiment. `discoveryLoop.ts` has no equivalent because a MECHANISM
hypothesis does not predict a value at a shared probe; it names an
**intervention**, and each hypothesis is judged against its OWN fork from a
shared baseline. There is no single number two rival mechanisms both make a
claim about the way two Arrhenius pairs both predict a rate constant at 400 K.

**Why porting `checkDiscriminability` verbatim would misdiagnose the real
case.** The measured generator fixture above is the concrete example: are
`h:fuel-efficiency~RELATION_FLIP` and `h:load-shedding~RELATION_FLIP` rivals to
discriminate between, or two independent findings to report together? They are
the latter — different levers, both genuinely effective, not two competing
stories about the same lever. A discriminator built on the PARAMETER
assumption ("exactly one of these is true") would be answering a question this
domain shape does not ask. The two situations MECHANISM can actually reach
need two different next experiments:

1. **Two DIFFERENT levers, both independently `SUPPORTED`** (the generator
   case, measured above). These are not mutually exclusive, so "discriminating
   between them" is the wrong operation. The informative next experiment is a
   **JOINT ARM**: fork one branch that applies BOTH hypotheses' `apply`
   functions together (`forkBranch`'s mutation callback already accepts
   arbitrary graph mutations — applying two levers in sequence inside one
   callback needs no new primitive), and compare the combined effect against
   the SUM of the two effects already measured individually. Worked example
   from the real numbers above: `h:fuel-efficiency~RELATION_FLIP` alone
   contributes +22.92 at strength 0.5, `h:load-shedding~RELATION_FLIP` alone
   contributes +29.33; if the two mechanisms are independent, a joint arm at
   the same two strengths should read close to `40.0 + 22.92 + 29.33 ≈ 92.25`.
   A joint reading that matches names both levers as independent contributors
   (the honest report: "two real findings," not "a discrimination"). A joint
   reading that differs materially is itself a new, real finding — an
   interaction between two declared levers neither single-lever test could
   reveal — and is worth its own criterion and its own name (`INTERACTION_DETECTED`,
   say), not silently averaged away. This is a genuinely new capability
   (`discoveryLoop.ts` never runs a multi-mechanism arm today), reuses every
   existing primitive (`forkBranch`, `compareBranches`,
   `reduceObjectiveTrajectory`), and needs no new solver, no scoring function,
   and no probability model — it is arithmetic on already-measured effects,
   checked against a fresh, real third measurement.
2. **Two hypotheses that really do claim the SAME lever, at the SAME time**
   (not observed in any real catalog today — see the audit above: a lever's
   original criterion and its own `RELATION_FLIP` alternative can never both
   be `SUPPORTED` simultaneously, because deriving the alternative requires the
   original to already be `REFUTED`). If a future catalog ever declares two
   independent hypotheses that are genuinely mutually exclusive claims about
   ONE mechanism (rather than two different levers), THAT case is the real
   `checkDiscriminability` analog, and the natural probe axis is `strength`
   itself: `selectMostDiscriminatingExperiment`'s candidate-list scan already
   generalises directly — feed it the untested strengths in
   `MechanisticHypothesis`'s own declared range (a lever already has a natural
   strength axis: 0 to 1, sampled today only at `{1, replicationStrength}`) and
   ask which untested strength would make the two hypotheses' criteria
   disagree. No real fixture demonstrates this today; it is named here so C1
   can verify the shape rather than have it invented at implementation time.

**Update — option 1 measured and built as a standalone primitive (C3, next
10h pass).** The additivity assumption in the worked example above was
EXPLICITLY FLAGGED as unverified and has now been checked against the real
solver rather than assumed: `mechanismInteraction.ts`'s `runJointIntervention`
forks one branch applying `h:fuel-efficiency` and `h:load-shedding` together
at strength 0.5 (the same `TemporalEngine.forkBranch` + `reduceObjectiveTrajectory`
`discoveryLoop.ts` already uses, nothing new). Measured: baseline 40.0 L,
individually +22.92 L and +29.33 L, naive additive sum 92.25 L — **real joint
reading 87.67 L, 4.58 L (5.0%) BELOW the naive sum.** Not noise: the solver's
`fuelRateLPerHr = loadKw × specificFuelConsumptionLPerKwh` multiplies the two
levers, so cutting both at once compounds their fractional rate reductions
rather than summing their absolute fuel-remaining effects — a real,
mechanistically-explained sub-additive interaction.

`assessJointIntervention` classifies an already-measured joint reading against
the naive additive prediction (`ADDITIVE`/`SUB_ADDITIVE`/`SUPER_ADDITIVE`/`INCONCLUSIVE`,
within a declared tolerance — the same `agreementTolerance` discipline as
`SystemUnderStudy`/`WorldParameterSystem`, no statistical test this repository
has no methodology for). Both functions are tested in
`mechanismInteraction.test.ts` against this exact real fixture plus three pure
classifier-boundary cases (additive-within-tolerance, super-additive, and the
both-effects-zero `INCONCLUSIVE` case).

**Deliberately NOT wired into `discoveryLoop.ts`'s round loop.** This is the
measurement and classification proven standalone on a real fixture — the same
order `competingModels.ts` and `worldParameterCalibration.ts` were each built
before any orchestrator wiring. Auto-triggering a joint arm whenever two
hypotheses are simultaneously `SUPPORTED` (which pairs, at which strength, how
many rounds it costs) is a real control-flow decision for whoever owns that
loop, not decided here. No scoring function, no scalar utility, no scheduling
change to `selectNext` was introduced — those remain exactly the invented
methodology this document already refuses elsewhere.

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

## 0bis. Information Gain / Experiment Planner — DONE for PARAMETER and CALIBRATION

**Status: implemented** (`228b19c`). The design below was built exactly as
audited, and the worked example at the end of this section is now a passing
test. What follows is kept as the reasoning record — including the measurement
that decided it — because the "why not a score" argument governs anything built
on top of this. MECHANISM is still open, and C3's two sections directly above
are why: its hypotheses make no prediction about a shared observable, so the
pairwise machinery widened here has nothing to widen over there.

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
a different lever, run in parallel?) is real, substrate-specific work —
answered above, under **"P6, live discrimination for MECHANISM — architecture
(C3, not implemented)"**, grounded in the real `genesis-backup-generator`
fixture measured in the section right before it rather than designed in the
abstract: MECHANISM's two survivors there are not rivals to discriminate
between the way PARAMETER's are (two different, independently-true levers,
not one hidden value with competing claims on it), so the answer is not a
strength-axis port of `checkDiscriminability` but a JOINT ARM — fork one
branch applying both currently-`SUPPORTED` mechanisms together and check the
combined effect against the sum of the two already measured individually.

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

---

## 10. The learning loop, traced end to end — measured, not argued

Asked after Information Gain landed: *does Genesis now LEARN from a result and
change its next decision, or has it only got a smarter ranking?* Answered by
running real fixtures and reading what came back, not by reading this document.
Every number below is from a temporary probe script (deleted; the behaviours it
measured are asserted by the permanent tests named).

### 10.1 Does the RESULT change the NEXT decision? — YES, measured

One fixture, four real hidden folds (`proteinFoldingInquiry`). Round 1 is
identical in all four (probe=200; the acceptance rate has a real algorithmic
floor there, 0.13 for every candidate). Round 2 is the SAME chosen experiment
in all four (probe=5000, selected to separate `h:cold`/`h:cool`). It returns
four DIFFERENT observations — and from there nothing is shared:

| hidden | observed @5000 | ruled out | what it chose NEXT |
|---|---|---|---|
| `h:cold` | 0.1728 | cool, warm, hot | nothing — `NO_CONTENDERS_LEFT`, stop |
| `h:cool` | 0.3428 | cold, hot | probe=20000, `DISCRIMINATES_TOP_TWO`, pair (cool, warm) |
| `h:warm` | 0.3796 | cold | probe=20000, `DISCRIMINATES_OTHER_PAIR`, pair (warm, cool) |
| `h:hot`  | 0.4140 | cold, cool | nothing — `NO_DISCRIMINATING_PROBE`, stop |

The `cool` and `warm` rows are the sharp ones: **the same probe value, chosen
under a different rule, for a different reason.** For `cool` the top two really
are (cool, warm) and 20000 separates them. For `warm` the top two are
(warm, hot) and nothing separates them, so the widened search picks 20000 to
rule out `cool` instead. The observation writes the belief state; the belief
state picks the rule; the rule picks the experiment. No branch of that is
scripted.

### 10.2 Is memory KNOWLEDGE or just HISTORY? — knowledge, measured

Memory's product is a narrowed hypothesis set. The question is whether a
narrowed set changes WHICH EXPERIMENT RUNS, or only which verdicts get
reported. Same hidden fold (`h:warm`), full set vs. the set memory would hand
over if `h:cold` had been refuted in an earlier session:

| set | round 2 | pair | rounds | outcome |
|---|---|---|---|---|
| all four | probe=**5000** | (cold, cool) | 3 | warm, hot survive |
| without `h:cold` | probe=**20000** | (cool, warm) | 2 | warm, hot survive |

Dropping one remembered-refuted hypothesis changes the next experiment from
5000 to 20000 and saves a whole round. Memory is not a log being replayed —
it reaches the selector through `rankHypotheses`, and the selector runs a
different experiment because of it. Execution path, all real:
`scienceMemory` → `memoryNarrowedHypotheses` → `executedInput.hypotheses` →
`inContention` → `rankHypotheses` → pair choice → probe choice.

### 10.3 Model UPDATE vs. model ELIMINATION — the paths differ, and this is the finding

**MECHANISM revises.** Measured on the flood catalog: declared
`[h:pump-capacity]`, and after the run the belief set contains
`[h:pump-capacity, h:pump-capacity~RELATION_FLIP]`. That second id was
**created during the run**, from the real measured direction of the
falsification (P3's `deriveAlternativeCriteria`). C3's generator audit
(§ above) carries this further: on `genesis-backup-generator` both declared
hypotheses are falsified, both derive flipped alternatives, and both
alternatives are then genuinely SUPPORTED. That is `A ❌ → create C`, running
today, on a real substrate.

**PARAMETER does not.** Measured across every fold including total failure
(hidden T=0.5 falsifies all four candidates): the set of hypothesis ids that
ever appears is exactly the set declared. **Novel ids created: none, ever.**
When everything is falsified the loop reports
*"the system's real value is not among the values anyone proposed"* — correct,
honest, and terminal. It cannot propose a value.

So the honest answer to "can Genesis modify a model, or only discard one":
**it depends which loop is asking.** MECHANISM modifies. PARAMETER only
eliminates. That asymmetry is the single most important gap this trace found,
and it is bigger than anything left in the planner.

### 10.4 The DISCOVERY THRESHOLD exists — as a sensor with no actuator

`modelSufficiency.ts` already computes exactly the transition asked about:
`DECLARED_SPACE_INSUFFICIENT` means *"none of the declared mechanisms explains
this; a next step must go outside the declared space."* Grep for who consumes
it:

- `genesisMatrix.ts` — puts it in a projection.
- `genesisNarration.ts` — reads it aloud.

**That is all.** No loop, no orchestrator, no next-experiment selector reads it.
Genesis can SAY "my models are insufficient" and cannot ACT on having said it.
The threshold is detected and then dropped.

### 10.5 First missing element, and the next best step

Not the planner. The first missing element is that **the PARAMETER path has no
generation primitive at all**, and the one component that knows generation is
needed (10.4) is wired to nothing that could do it.

The minimal primitive — deliberately NOT implemented here, because it is a new
generation capability on a live loop and needs the same care P3 got:
a PARAMETER-side analogue of `deriveAlternativeCriteria` that proposes a new
claimed VALUE derived from the real measured numbers (the obvious honest
derivation: bracket between the two nearest falsified predictions, since the
measurement lies between them by construction). Two constraints are
non-negotiable and both already have precedent:

1. **Anti-HARKing, exactly as P3 handles it.** A value derived from the
   measurement that falsified everything cannot be judged against that same
   measurement. It must be preregistered and tested at an untried probe —
   which is precisely what `excludedStrengths` does on the MECHANISM side.
2. **It must refuse when it cannot derive.** `deriveAlternativeCriteria`
   returns `[]` from a no-effect refutation rather than inventing something.
   The PARAMETER analogue must return nothing when the falsified predictions
   do not bracket the observation — a value nobody can justify is worse than
   an honest stop.

Wiring 10.4's verdict into that primitive is what turns "I know my space is
insufficient" into "so here is the hypothesis that isn't in it" — and that,
not a better ranking, is the step that makes the loop
*experiment → knowledge → model change → next experiment* rather than
*experiment → knowledge → next experiment*.

### 10.6 The gap in 10.5, closed — `parameterAlternative.ts`

Built exactly as 10.5 specified, and no larger. `deriveAlternativeParameterValue`
is a pure derivation over a finished inquiry — the same shape as its MECHANISM
sibling `deriveAlternativeCriteria`, which was likewise a pure function long
before P3 gave it a call site. It runs no solver and touches no loop.

**It is also the first ACTUATOR on the insufficiency sensor.** 10.4 found
`DECLARED_SPACE_INSUFFICIENT` being computed, announced by narration, and acted
on by nothing. It is now the precondition for deriving at all: "my declared
space is insufficient" finally leads somewhere.

**How the value is derived — bracketing.** At a probe where the measurement came
back, every hypothesis has a real prediction from a real solver run. If one
prediction sits below the observation and another above it, a value between
those two claims is what the data points at. Nothing is fitted, searched or
randomised.

**Measured, on the real fixture 10.5 asked for.** A fold at temperature 0.5 is
one nobody declared (candidates: 0.3, 0.7, 1.2, 2.0). A real run refutes all
four — `DECLARED_SPACE_INSUFFICIENT`, `openQuestions` carrying *"not among the
values anyone proposed"*. At 5000 steps the observed acceptance rate 0.2576
sits between `h:cold`'s 0.1728 (T=0.3) and `h:cool`'s 0.3428 (T=0.7). Midpoint:
**0.5 — the true hidden value, derived from the failure rather than guessed.**

**And it survives being tested.** The derived hypothesis was run in a genuinely
new inquiry against the two claims that bracketed it, opened at 20000 steps —
untried in the first inquiry, and NOT the 5000 that produced the derivation.
Result: `h:derived-temperature-0.5` is the sole survivor; `h:cold` and `h:cool`
are refuted again, on measurements neither the derivation nor the original run
had seen. That is `A ❌ B ❌ C ❌ D ❌ → derive E → test E on evidence it did not
author → E stands`.

**Anti-HARKing is carried, not trusted.** The probe that produced the
derivation is returned as `excludedProbeValues`, so a caller scheduling the
test cannot silently reuse it — the same failure mode `excludedStrengths`
guards against on the MECHANISM side.

**Three refusals, each asserted on a real case:** something still survives (the
space is not exhausted, and testing between survivors is the loop's own job);
hypotheses claim two coupled parameters rather than one scalar (a 1-D bracket
cannot locate a point in the Arrhenius compensation plane, so it refuses rather
than approximates); and no bracket exists (at 200 steps every candidate
predicts the identical 0.13 — a real algorithmic floor — and extrapolating past
the declared range would be inventing, so it declines).

**Honest limits, stated rather than implied.** Bracketing assumes the metric
moves monotonically with the parameter between the two bracketing claims; that
is not verified, and does not need to be, because the candidate faces a real
experiment before it is believed — the same measurement shows the midpoint
landing well away from the truth on other folds. When several rounds bracket,
only the last is used; intervals are not intersected and a contradiction
between rounds is not yet detected.

**Not yet wired into a loop.** Deriving is now possible and proven; deciding
that an inquiry should automatically continue with the derived candidate is a
control-flow change to a live loop, and gets its own pass — exactly the
sequencing P3 followed.

### 10.7 The bridge closed — generation now fires by itself

10.6 left one thing open, and it was the whole difference between a capability
and a behaviour: Genesis COULD derive a value nobody declared, but nothing asked
it to. `runInquiryWithGeneration` (`inquirySession.ts`) is that call site — the
same sequencing P3 followed, pure derivation first, wiring second, once the
derivation had been measured on a real fixture.

The flow, unprompted, one call:

```
declared hypotheses → inquiry → every one falsified
  → DECLARED_SPACE_INSUFFICIENT        (modelSufficiency.ts)
  → derive a bracketed value            (parameterAlternative.ts)
  → a FRESH inquiry, opened on a setting the derivation never saw
  → a real verdict on the derived hypothesis
```

**Why `inquirySession.ts` and not the loop itself.** That module already
describes itself as "the wiring, not a second engine", which is exactly this
job. Putting it inside `inquiryLoop.ts` would also have created a real import
cycle (`inquiryLoop` → `parameterAlternative` → `discoveryStrategies` →
`inquiryLoop`), and would have meant rewriting a live loop's control flow to
get a behaviour that composes cleanly outside it.

**Why a FRESH inquiry rather than more rounds of the first.** The derived value
is a different claim from the ones the first inquiry was handed, and it has to
be judged on evidence that inquiry did not already spend. Continuing the
original run would judge it partly on the measurements that produced it.

**Anti-HARKing is now ENFORCED, not merely reported.** 10.6 returned
`excludedProbeValues` and trusted the caller. This is the caller, and it honours
the exclusion by construction: the follow-up opens at the first candidate
setting that is BOTH untried in the first inquiry AND not excluded — strictly
stronger than the contract requires.

**Measured, unprompted, on the real fixture** (`inquiryGenerationLoop.test.ts`):
a fold at temperature 0.5 falsifies all four declared candidates; Genesis
derives `h:derived-temperature-0.5` on its own; a second investigation opens at
a step count neither the first inquiry nor the derivation used; the derived
hypothesis is the **sole survivor**, and `h:cold`/`h:cool` are refuted again.
`A ❌ B ❌ C ❌ D ❌ → E → TEST → E ✅`, with nobody asking for E.

**One new refusal, and it matters.** When a value IS derivable but every
candidate setting was already spent by the inquiry that produced it, this
declines to continue and reports the candidate as an untested proposal —
rather than confirming it on the data that authored it. Asserted on a real
case (the same fixture with its probe list cut to the two settings the first
inquiry actually uses).

**Deliberately untouched:** `runDiscovery`'s contract. It returns ONE
`StrategyRun`, and representing "two runs, the second derived from the first"
through it is a contract decision worth taking on its own.

**Next gap, named while implementing this** (and unchanged by it): bracketing
uses only the LAST round that brackets. It does not intersect the intervals
several rounds imply, and does not detect a contradiction between them — which
would itself be a real signal that the metric is not monotonic in the parameter,
the one assumption bracketing rests on.
### 10.8 The OUTER loop, confirmed independently — then one narrow exception landed

§10.1–10.2 measured that the loop is genuinely adaptive ROUND to ROUND, within
one investigation. A separate question — does anything decide WHICH question
to investigate NEXT, once one run ends? — was checked directly (C3, this
pass, read-only trace, not inferred from this document, and BEFORE §10.6-10.7
landed): grepped every call site of `runDiscovery`, `runAutonomousDiscovery`,
`runAutonomousInquiry`, `runWorldDiscoveryAndRemember`, `runInquiryAndRemember`.
At that moment, none was ever called more than once in a loop where run N's
output fed run N+1's input.

**§10.6-10.7 is now a real, if narrow, exception, and this section is revised
to say so rather than stand as overtaken.** `runInquiryWithGeneration` DOES
call `runAutonomousInquiryWithRuns` twice, with the second call's hypotheses
and opening probe DERIVED from the first call's result
(`deriveAlternativeParameterValue`) — output N genuinely feeding input N+1,
autonomously, on a real fixture, with the derived hypothesis surviving
evidence neither run had seen. So "no exception found anywhere" no longer
holds as stated. What still holds, checked again after that landing: the
exception is BOUNDED to one single generate-and-retest cycle triggered by one
specific verdict (`DECLARED_SPACE_INSUFFICIENT` on a single-scalar PARAMETER
space) — it does not choose a domain, a catalog, or a goal, and
`runInquiryWithGeneration` is not yet called from `discoveryOrchestrator.ts`
or any UI path (`grep` confirms zero call sites outside `inquirySession.ts`
and its own test), so today's actual front doors
(`WorldDiscoveryPanel.tsx`, `discoveryOrchestrator.runDiscovery`) still stop
at one investigation per human-supplied question.

- `hypothesisLoop.ts`'s five next-experiment selectors (unified in
  `nextAction.ts`) are pure functions that PROPOSE a next experiment for a
  caller to run; none is wired to any auto-execution call site
  (`grep` for their names under `packages/frontend/src/components` returns
  nothing).
- The backend's `campaign/orchestrator.mjs` loops over GENERATIONS toward one
  fixed, human-supplied objective (drug-candidate search) — the same kind of
  inner-loop autonomy `discoveryLoop.ts` already has, for a different
  substrate. It never changes the objective or domain itself, and no code
  creates a second campaign from a first campaign's result.
- The exact break point: `WorldDiscoveryPanel.tsx`, function `run(text,
  forCatalogId)` — a human types a goal, clicks submit, `runWorldDiscoveryAndRemember`
  runs ONCE, and the result is rendered for the human to read. Nothing in that
  file or its callers reads the result back into a new goal and re-invokes
  `run`. `rerunSaved` re-runs the SAME stored goal verbatim — it derives
  nothing new.

So the honest, complete answer to "is autonomous discovery really
autonomous": **within one investigation, yes — genuinely, measured in §10.1–
10.2. Choosing to run a SECOND investigation from the first one's result: yes,
in the one narrow case §10.6-10.7 built and proved. Choosing WHAT to
investigate in any open-ended sense — a new domain, a new goal nobody
phrased, a new catalog — no exception found anywhere, still.** The honest
boundary moved rather than dissolved: it used to sit at the edge of every
investigation; it now sits at the edge of every investigation UNLESS a
PARAMETER run's declared space is exhausted, in which case it sits one
generate-and-retest cycle later. Extending that boundary further (MECHANISM's
own generation loop, or wiring `runInquiryWithGeneration` into
`discoveryOrchestrator.ts` so it is reachable from the actual front door) is
real, well-scoped next work — not decided here.

### 10.9 Competing-models UI fidelity, checked against real code — no eureka-on-unresolved found

Checked directly (C3, this pass) against the specific failure mode named for
this audit: does the Matrix/narration UI ever show a confident "eureka" for a
result the run itself reports as unresolved?

`GenesisWorldScreen.tsx`'s `updateObserverScientist()` gates the observer
scientist's pose explicitly: the confident `'gesture'` pose requires BOTH
`sufficiency.status === 'SUPPORTED_MECHANISM_FOUND'` AND
`competingModels.status === 'SINGLE_EXPLANATION'`, checked on the LAST round
only. When `competingModels.status === 'COMPETING_MODELS_UNRESOLVED'` instead,
the pose stays `'idle'` and the facing genuinely oscillates between the beacon
and the player — the module's own comment states the reason: *"a false
'eureka' here would misrepresent an unresolved result."* The rendered rival
hypothesis list (`{view.competingModels.competingHypothesisIds.map((id) =>
<li key={id}>{id}</li>)}`) maps directly over the REAL verdict's ids, no
placeholder text. `genesisMatrix.ts` wires `competingModels:
assessCompetingModels(run)` directly — no UI-layer reimplementation of the
verdict. No violation found.

### 10.10 §10.7's own gap, closed — generation now LEARNS, not just fires

Found while auditing Priority 5 in `GENESIS_NORTH_STAR.md`, by re-reading
§10.7's own code rather than trusting its "bridge closed" title: both calls
inside `runInquiryWithGeneration` went through the bare
`runAutonomousInquiryWithRuns`, not `runInquiryAndRemember`. So the function
generated a hypothesis nobody declared and tested it — real, proven — but
never narrowed against prior memory, and never left anything behind for a
LATER inquiry into the same system to narrow against. Genesis generated and
tested without learning; the loop's last link (§10.5's own
`experiment → knowledge → model change → NEXT experiment`) was still open.

**The fix reuses the existing session pipeline verbatim, no second memory
store.** Both the first inquiry and the generated follow-up now go through
`runInquiryAndRemember` — the same function every other PARAMETER caller
already uses. `InquiryWithGenerationResult` and `GeneratedContinuation` gained
the fields that pipeline already produces (`firstResumedFromMemory`,
`firstSaved`, `firstReplay`, `followUpSaved`, `followUpReplay`) rather than
inventing new bookkeeping.

**Measured, two ways, on the real exhausted-space fixture** (a fold at
temperature 0.5 that falsifies all four declared candidates,
`inquirySession.test.ts`):

1. Calling the SAME full four-candidate request a second time (fresh modules,
   same persisted storage — a real process restart) now returns
   `firstResumedFromMemory` non-null with the honest "would leave nothing to
   test" reason and the full set re-tested — the same never-narrow-to-empty
   fallback `runInquiryAndRemember` already holds for every other caller,
   now reachable here because a record finally exists to trigger it.
2. A genuinely partial declared set — one already-falsified candidate
   (`h:cold`) alongside round 1's OWN generated hypothesis
   (`h:derived-temperature-0.5`, which survived and so is never carried
   forward as settled, per the existing "never carries a SUPPORTED verdict
   forward" rule) — shows real, executable narrowing: `h:cold` is skipped,
   the generated hypothesis is not. The generated hypothesis behaves exactly
   like any declared one under memory's own rules, because it now goes
   through the identical path.

The generated follow-up is also independently confirmed as a real, queryable
Science Memory record (`getExperiment` returns it, `followUpReplay.status`
is `MATCH` from a real re-execution) — not merely returned to the caller and
discarded.

This closes the last open item §10.7 itself named ("Not yet wired into a
loop" no longer applies to persistence — deciding whether an inquiry should
COMBINE the first and generated runs into one caller-visible investigation,
versus reporting two, remains the deliberate `runDiscovery`-contract decision
§10.7 always deferred, and still is).

### 10.11 C3 closed the same gap independently, with a better shape — reconciled, not duplicated

C3 reached the identical finding from the Priority-5 audit side by side with
this one, in the same working window, and built a genuinely better fix: rather
than mutating `runInquiryWithGeneration` in place (10.10's approach), it left
that function pure — no storage, same signature, same seam for callers and
tests that want the engine alone — and added a separate
`runInquiryWithGenerationAndRemember` that banks both investigations. Cleaner
separation of concerns, and it does something 10.10 did not attempt: it
answers the `runDiscovery`-contract deferral 10.10 explicitly left open. The
PARAMETER path in `discoveryOrchestrator.ts` now runs the generation
continuation itself and reports it as a SECOND `StrategyRun` beside the first
— never merged into it, since a flattened run cannot express "these later
rounds tested a value derived from the earlier ones, at a setting the earlier
run never used," and that provenance is the entire reason a derived value is
worth reporting. `run` stays byte-for-byte what a direct strategy call
produces (`DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION` 1.2.0, additive over
1.1.0), so an existing reader sees an unchanged finding and only a caller that
looks for `generated` sees the second one.

Reconciling the two on merge into `main`: C3's `inquirySession.ts` was taken
as authoritative (commit `fcc2032`) over 10.10's in-place mutation, since it
is the strict superset — same memory fix, plus the front-door wiring, plus an
honesty fix 10.10's version did not have (see below). The two new tests 10.10
added directly against `runInquiryWithGeneration` were removed as redundant:
`generationMemoryChain.test.ts` (C3) proves the same restart-survives-memory
chain more thoroughly, through `runInquiryWithGenerationAndRemember` and the
real `runDiscovery` front door, including a cross-system non-leak case 10.10
did not cover.

**The honesty fix, found by C3 while measuring, not by inspection:**
`survived: true` was overclaiming. On the real seeded HP-lattice fold, four
different true temperatures (0.40, 0.50, 0.55, 0.65) all produce the identical
surviving derived value 0.5 — at a true 0.65 the follow-up ends
`NO_CONTENDERS_LEFT` with no open questions left over a value that is wrong by
23%, because the declared ±15% agreement band cannot separate them at the
settings tried. Nothing in the loop lied; the summary did. This is exactly the
kind of gap 10.10's own fixture (T=0.5 only) was not built to surface — one
honest measurement is not enough to catch a claim that is only false at a
DIFFERENT true value, which is the same lesson §10.2 draws about a single
supporting measurement settling nothing.

C3's paired MECHANISM-side finding, cherry-picked alongside this one (commit
`1c079ad`): `discoveryLoop.ts` stopped the whole investigation on the FIRST
lever to reach `SUPPORTED_AT_TWO_MAGNITUDES`, not the best one — measured on
the generator catalog, it ran 2 of a 12-round budget, tested 1 of 4 declared
levers, and reported the weaker one (85.83 L) while a stronger untested lever
(`h:load-shedding`, 98.67 L) sat unexamined.
`LEADER_CONFIRMED_AT_TWO_MAGNITUDES` now means every testable mechanism was
tested AND one replicated at two magnitudes — strictly stronger than before.
This is what makes `COMPETING_MODELS_UNRESOLVED` reachable at all, which is
what `mechanismGeneration.ts` (also cherry-picked) needed to compose two
declared levers into one forked run: on the real solver, fuel-efficiency alone
+45.83 L and load-shedding alone +58.67 L predict 144.5 L under independence,
but the real joint arm measures 126.17 L — SUB_ADDITIVE by 17.5%, because
`fuelRateLPerHr` multiplies the two factors. Doing both still beats either
alone, and the loop reports both facts rather than collapsing them.

### 10.12 §10.11's headline number was itself a symptom — the anti-HARKing leak behind it

**Correction first.** §10.11 records that four different true temperatures
(0.40, 0.50, 0.55, 0.65) all left the derived 0.5 standing. That measurement
was real, and its cause was not degeneracy. It was a leak.

`runInquiryWithGeneration` enforced `excludedProbeValues` on the follow-up's
OPENING probe and then handed the loop the full candidate list. `selectNextProbe`
was therefore free to choose the excluded setting on a later round — and it did.
Measured on the fold at 0.5: the follow-up opened at `steps=1000` and its SECOND
round ran at `steps=5000`, the exact measurement the value had been bracketed
from, recording the derived hypothesis SUPPORTED there. Bracketing picks a
midpoint *precisely because* it lies between two predictions straddling that
observation, so confirming it at that setting is very nearly circular. Guarding
the opening probe is not guarding the run.

The fix is one line of intent: remove the excluded settings from the candidate
list the follow-up runs against. The loop cannot select what it is not offered.

Corrected measurements, same solver, same seed:

| true T | before the fix | after |
| --- | --- | --- |
| 0.40 | 0.5 survives | 0.5 **REFUTED** |
| 0.50 | 0.5 survives | 0.5 survives |
| 0.55 | 0.5 survives | 0.5 survives |
| 0.65 | 0.5 survives | 0.5 **REFUTED** |

So a wrong derived value now gets refuted by its own follow-up. What remains —
0.50 and 0.55 both leaving 0.5 standing — is genuine degeneracy and not a bug:
those two are not separable by this instrument at a declared ±15% band.
`derivedValueStanding` is kept for exactly that residue, and its recorded
numbers were updated rather than left stale.

The general lesson is worth more than the fix: an exclusion that is *carried*
in a result and *checked once at the boundary* is not enforced. Genesis has
several such guards. Each is worth re-reading with the question "what stops
this being violated on round two?"

### 10.13 Two more defects at the loop's termini, and one that was left as a finding

Audited every way a PARAMETER investigation can end, asking whether Genesis has
a correct next action there or simply stops.

**A failed measurement was reported as a ready-to-run repeat of itself.** When
the solver returned nothing, `inquiryLoop.ts` broke out while `selection` still
held the selection that had CHOSEN the failed probe, so `nextExperiment` came
out `READY_TO_RUN` with an executable request to re-run the measurement that
had just failed — and `openQuestions` said nothing about the failure, leaving
four bare "Never tested" lines with no reason attached. Reproduced with no
mocking by probing `steps=999999`, outside the HP runner's validated
[1, 50000]: zero rounds, and "Measure acceptanceRate at steps=999999" proposed
as ready to run. A consumer routing on that status retries forever. Now a
`MEASUREMENT_FAILED` probe rule with `probeValue: null`, so the shared contract
reports RESOLVED with `request: null` exactly as the other two refusals do, and
the failure is named as an open question about the apparatus.

**Bracketing assumed monotonicity and never checked it.** The midpoint
localises the truth only if the metric moves monotonically with the parameter
across the two claims. `parameterAlternative.ts` said so and left it unverified.
The check is free — the round already ran every candidate through the solver —
and the assumption is really violated on this substrate: same solver, same seed,
same four temperatures, judged by `bestEnergy` at 1000 steps they predict
-3, -2, -3, -3. Now a fourth refusal, recording `MONOTONIC` (confirmed on 3+
points) or `TOO_FEW_POINTS` (two contenders, so a violation is undetectable
rather than absent — said rather than silently passed).

**Reported, not fixed — the answer is readable from the run's own output.**
`nextAction.ts:322` spreads `system.hiddenParameters` into the executable
request, so `StrategyRun.nextExperiment.request.parameters` carries the very
value the inquiry is trying to determine: a run seeking temperature 0.5 emits
`temperature: 0.5` in its own proposed next experiment. The request must contain
them to be executable against the solver, and `ObservableSystem` still keeps the
value out of every reasoning path, so this is a design trade-off rather than an
obvious bug. But `StrategyRun` is serialised into Science Memory and rendered in
the UI, and any benchmark requiring that the answer not be readable from the
run's own output is defeated by it today. Whoever owns the benchmark should
decide; C3 did not change it unilaterally.

### 10.14 Question selection, and the first chain Genesis drives itself

Genesis had five next-EXPERIMENT selectors and no next-QUESTION selector. Every
one of them answers "how do I best answer THIS question?"; none ever asks
whether this investigation is still the right one to be running. Conflating the
two is how a discovery engine becomes one large `selectNext()` — excellent at
finishing whatever it was pointed at, incapable of noticing it should be
pointed elsewhere. `EXPERIMENT SELECTION` and `QUESTION SELECTION` are now
separate in the architecture, not just in prose.

`nextQuestion.ts` is a pure reader over a finished `DiscoveryOutcome`. It
proposes only questions the run ITSELF raised, ranked by the declared
lexicographic cascade this codebase already uses everywhere (no scoring). It
reports two answers because they are two different facts: `selected` is the most
important question, `nextExecutable` the most important one Genesis can actually
run. They differ exactly where the science says one thing and the machinery
cannot do it — measured on a failed-measurement run, the top question is the
apparatus (not runnable) while four untested hypotheses remain (runnable), so
the loop still has a move instead of dead-ending.

Running it immediately produced an uncomfortable answer, which is the point of
building it: after Genesis's own generation SUCCEEDS, it was blocked.
`blockedOnHuman: true`. Generation is gated on an EXHAUSTED space, and after a
successful generation the space has a survivor — so the one mechanism that can
propose a value nobody declared could never propose a second one. Genesis had
just invented a hypothesis and had nowhere to go with it.

`intervalNarrowing.ts` closes that. What licenses it is not "0.5 is probably
about right" but that the follow-up REFUTED both bracket ends: the interval is
earned while the point inside it is not. Two interior candidates, one either
side of the survivor. `researchChain.ts` then asks `nextQuestion.ts` what to do
and does it — question selection had been a reader nobody read, the same shape
as `DECLARED_SPACE_INSUFFICIENT` before `parameterAlternative.ts` gave it an
actuator, and the same fix.

`autonomousDiscoveryChain.test.ts` is the whole loop as one executable test on
the real solver at a true 0.5: A/B/C/D refuted → `DECLARED_SPACE_INSUFFICIENT`
→ E derived → E tested on evidence it did not author (asserted against its own
`excludedProbeValues`) → E survives as an INTERVAL → all of it remembered →
next research question chosen by the selector → run → [0.3, 0.7] narrowed to
[0.4, 0.6], truth still inside. **No step after the first is named by the test.**

Two honest limits, both load-bearing:

1. This is not open-ended research. The chain runs only question kinds it has an
   actuator for and NAMES the kind that stopped it — that name is the next thing
   worth building. It never changes domain and never invents a subject.
2. Support is not always an interval. At a true 0.55 the narrowing step refutes
   the derived 0.5 while 0.4 and 0.6 both survive: the supported set has a hole
   in the middle and no interval describes it. `assessNarrowing` first reported
   that as "nothing new was refuted" — an honesty bug in the new code, found by
   running it rather than by inspection — and now names the disconnection
   explicitly while still refusing to report a narrower range, because there
   isn't one.

### 10.15 MODEL UPDATE — audited, and deliberately NOT built as a contract

The brief asked for a minimal formal `Model Update` contract:
`prediction ≠ observation → hypothesis falsified → model update candidate →
new model → test`. Audited against the substrate, and the honest answer is that
three of those five arrows exist and the fourth cannot.

What Genesis really updates after a falsification:

| level | can it revise? | how |
| --- | --- | --- |
| belief in a hypothesis | yes | `updateConfidence` / `HypothesisBelief`, both loops |
| a parameter VALUE | yes | `parameterAlternative.ts` derives one nobody declared |
| that value's PRECISION | yes | `intervalNarrowing.ts` shrinks an earned interval |
| a mechanism's CRITERION | yes | `deriveAlternativeCriteria` → `~RELATION_FLIP` |
| which MECHANISM to apply | yes, since this sprint | `mechanismGeneration.ts` composes two declared levers |
| the MODEL itself | **no** | — |

The last row is the whole finding. A "model" here is a registered router model
(`biology-protein-folding-hp`, `chemistry-arrhenius`, …) or a WorldGraph domain
updater — compiled code with a fixed structural form. Genesis can vary what it
*claims about* a model's parameters and levers; it cannot change the model's
equations, add a term, or propose a different functional form. There is no
representation in this repository in which a structural change to a model is a
value that could be produced, tested, or stored.

So a `ModelUpdate` contract would be a type with no substrate behind it — the
exact "fake abstraction" the brief's own rule 4 rules out. Writing one would
also do real damage: `modelSufficiency.ts` is careful to say that an exhausted
declared space is insufficiency *of the declared space*, **never** proof that
the model is wrong, and a `ModelUpdate` type sitting next to
`DECLARED_SPACE_INSUFFICIENT` would quietly invite exactly the inference that
verdict exists to refuse.

What would be needed, stated so the gap is actionable rather than vague: a model
would have to be a VALUE — a declared structure (terms, couplings, functional
form) that a solver can be built FROM at runtime — before "propose a different
model" could be a step Genesis takes rather than a sentence it prints. That is a
substrate change to the Experiment Fabric, not an agent feature, and it is the
honest prerequisite for structural discovery. Until then the reachable frontier
is what the table above already shows: richer hypotheses over fixed models.

### 10.16 INFORMATION GAIN AT THE QUESTION LEVEL — measured as not yet computable

The brief asked whether Genesis could rank several candidate research questions
by how much each would reduce uncertainty ("Q1: is the pump the mechanism?
Q2: does pipe length matter? Q3: does population change the result?"), and
explicitly asked for a fixture and a measurement before any planner.

Measured on the real candidates `nextQuestion.ts` actually produces. The
question kinds a finished run raises are:

| kind | its uncertainty, concretely | unit |
| --- | --- | --- |
| `TEST_UNTESTED_HYPOTHESIS` | how many declared hypotheses were never measured | a count |
| `SEPARATE_SURVIVORS` | how many rivals remain consistent | a count |
| `NARROW_A_DERIVED_INTERVAL` | the width of the earned interval | the parameter's own units |
| `RESOLVE_APPARATUS_FAILURE` | whether the instrument works at all | not a quantity |
| `GO_OUTSIDE_THE_DECLARED_SPACE` | unbounded — the space is by definition not enumerated | none |

These do not share a scale. "An interval 0.4 wide" and "two unseparated rivals"
and "the instrument returned nothing" cannot be ordered by a common measure of
information without declaring an exchange rate between them, and this repository
has no methodology that would justify one — the same reason every existing
selector here is a declared lexicographic cascade and none of them scores
(`worldCounterfactual.ts` says so in as many words). Inventing a score to rank
them would be the overclaim, not the feature.

Two things ARE computable today, and both are already used:

1. **Within the PARAMETER experiment level**, information gain is real and
   implemented: `selectNextProbe` checks which untried settings actually
   separate contenders, using real solver predictions, and widens past the top
   two when they cannot be separated (`§0bis`). That is discriminability, not a
   score, and it is genuine.
2. **Within one question kind**, comparison is meaningful because the unit is
   shared: of two intervals the wider one is more uncertain; of two untested
   sets the larger one has more to settle. `nextQuestion.ts` does not need this
   yet because a finished run raises at most one question of each kind.

So the honest state is: question-level ranking exists and is a declared cascade
with each position justified; question-level *information gain* is not
computable and will not be until candidate questions carry a declared
uncertainty measure with units. Recording that as a measured negative rather
than shipping a scorer that looks quantitative.

### 10.17 §10.15 was half wrong — SELECTING a structure needs no Fabric change

§10.15 concluded that Genesis cannot revise a MODEL, and that the prerequisite
is making a model "a VALUE a solver can be built from at runtime" — a Fabric
change. Audited properly against the substrate, that conflates two different
things, and only one of them is out of reach.

A WorldGraph model IS already a value. `SolverRouter` holds
`Map<string, DomainSolver>` and registers at runtime
(`solvers/solverRouter.ts:49-53`); every entity selects its solver by a string
on itself, `domainBinding.solverId` (`:87`). Rebinding an entity to a different
solver is a one-line mutation of exactly the kind `TemporalEngine.forkBranch`
already applies.

So:

- **CHOOSING among structures somebody wrote** — no Fabric change. The registry
  is runtime, the binding is a value, and a structural comparison is a
  MECHANISM-shaped fork-and-compare, the same machinery `mechanismGeneration.ts`
  uses for two levers.
- **INVENTING a structure nobody wrote** — this is what needs a runtime-built
  solver, and §10.15's prerequisite is right for this case alone.

What actually blocks the first is not the substrate but the absence of a claim:
all eighteen registered solvers cover eighteen DIFFERENT quantities, so no
quantity has a competitor and "which structure?" has never been askable.

Prior art exists and must not be duplicated: `domains/seismicFragility.ts`'s
`FragilityRegistry` (`:255`) already holds several models for the same quantity
and can enumerate those applicable to one hazard (`:279`), with registration
that REJECTS a model lacking a citation or licence (`:265-271`) — "once a number
is in the code an uncited one is indistinguishable from an invented one". That
discipline is what a structural-alternative registry has to inherit, for the
stronger reason that a structure is a bigger claim than a number.

The full contract, the test path, and the honest cost of a first demonstration
are in `RUNTIME_CONFIGURABLE_MODEL_CONTRACT.md`. The short version of the cost:
a domain must declare a second REAL, CITED structure for a quantity it already
computes. Writing one purely so that there are two would be fabricating physics
to have something to discriminate, which is why that document stops at the
contract.
