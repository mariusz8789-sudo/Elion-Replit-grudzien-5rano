# HUMAN WORK — the owner's principle as a number

> **Genesis takes the human's work onto itself.** If a person performs an action Genesis could do
> correctly, reproducibly, under Evidence, safely and automatically, **that is a product bug.**

This document is the measurement protocol for that principle. It states the classification of the
canonical loop's steps, each metric's definition and data source, which metrics are computable today
and which return the literal `UNKNOWN` and why, how a baseline would be measured honestly, and the
ways this measurement could be gamed with how each is detected.

**Status today, stated plainly.** `AUTOMATION_COVERAGE = 15/17 = 88.2%`, **below** the owner's 90%
target, over a denominator that is **17 of the loop's 25 steps (68%)**. Every quantity that compares
Genesis against a person working without it — hours saved, lab hours avoided, experiments avoided,
failed experiments avoided, cost — reads `UNKNOWN`, because **no "without Genesis" baseline exists
anywhere in this repository.** Nothing below is a claim of being faster, cheaper or more automatic
than anything.

---

## 1. Where the measurement lives

This extends the v17 TIME-TO-DISCOVERY instrumentation (`docs/benchmark/TIME-TO-DISCOVERY.md`); it is
not a second measurement or state system. Same module (`packages/backend/src/discoveryTiming.mjs`),
same database, same `store.mjs` migration path, schema **v18** (purely additive).

| Table | Added at | What it holds |
| --- | --- | --- |
| `discovery_stage_marks` | v17 | stage boundaries, one `OPEN` and one `CLOSE` per (scope, stage) |
| `discovery_stage_facts` | v17 | spans (`COMPUTE`, `QUEUE`, `HUMAN_WAIT`, **`LAB_INSTRUMENT`** — new), counters, members, statuses |
| `discovery_competitor_baselines` | v17 | externally measured competitor/manual *time* baselines |
| `discovery_timing_campaign_links` | v17 | which scopes belong to which campaign |
| `discovery_loop_steps` | **v18** | the step classification: one class per step, `why_human_required`, `coverage_exclusion`, justification, code reference |
| `discovery_human_touches` | **v18** | append-only; one row per thing a person actually did, with active milliseconds. The **only** source of human active time |
| `discovery_human_work_baselines` | **v18** | append-only; what a person **without** Genesis needed for the same task scope. Every provenance column `NOT NULL` and `CHECK`ed non-empty |
| `discovery_cost_rates` | **v18** | append-only; the three prices `COST_TO_DECISION` needs. No price is built into the code |

`LAB_INSTRUMENT` is a new span kind: instrument time in a physical laboratory. It is neither compute
nor waiting, and it is the only source of `LAB_HOURS_USED`.

Human **active** time and human **wait** time are never merged, for the same reason v17 refuses to
merge `queueMs` and `humanWaitMs`: a reviewer who takes a week to spend ten minutes is an
organisational problem, not a workload. Active time is a `discovery_human_touches` row; wait time is
a `HUMAN_WAIT` span.

`discovery_loop_steps` is the one table in the family that is **not** append-only, because it is not
an observation: it is a projection of the frozen `LOOP_STEPS` constant in
`discoveryTiming.mjs`, re-synchronised by `syncLoopStepClassification()` at server start. Changing
the classification is a code change under review, never a row somebody edited. The read-only report
falls back to the code declaration when the table is empty and says so in `classificationSource`, so
a `GET` never writes.

---

## 2. The step classification

Exactly one class per step. The vocabulary (`STEP_CLASSES`) is closed; an unknown class is refused by
`recordLoopStep()` **and** by a `CHECK` on the table.

| Class | Meaning |
| --- | --- |
| `AUTOMATED` | Genesis performs it end to end; no person is in the path. |
| `HUMAN_APPROVAL_ONLY` | Genesis does the work and proposes the result; a person only says yes or no. |
| `HUMAN_REQUIRED` | a person does the work. **Must** carry a non-empty `WHY_HUMAN_REQUIRED`. |
| `EXTERNAL_PHYSICAL_ACTION` | it happens in a physical room Genesis is not in. |

**`WHY_HUMAN_REQUIRED` is enforced by the database.** `discovery_loop_steps` carries
`CHECK (step_class <> 'HUMAN_REQUIRED' OR (why_human_required IS NOT NULL AND trim(why_human_required) <> ''))`
plus `CHECK (why_human_required IS NULL OR trim(why_human_required) <> '')`. A `HUMAN_REQUIRED` row
with a null, empty or whitespace reason is refused by SQLite, not by a convention in JavaScript. The
owner's rule is the point: **without a strong reason the step gets automated instead of recorded.**
A third `CHECK` refuses a coverage exclusion on an `AUTOMATED` step — Genesis cannot claim that work
it already does is work it cannot do.

### 2.1 The 25 steps, as the code performs them today

Counts: **`AUTOMATED` 15 · `HUMAN_APPROVAL_ONLY` 4 · `HUMAN_REQUIRED` 4 · `EXTERNAL_PHYSICAL_ACTION` 2 = 25.**
Excluded from the coverage denominator: **8.** Denominator: **17.**

| # | Step | Class | Excl. | Code | What justifies the class |
| --- | --- | --- | --- | --- | --- |
| 1 | `SUBMIT_RESEARCH_QUESTION` | HUMAN_REQUIRED | — | `startResearchRun()` | The run cannot be created without a question in the body; nothing in the loop generates one. |
| 2 | `FORMALIZE_PROBLEM` | AUTOMATED | — | `startResearchRun()` → `PROBLEM_FORMALIZED` | The server writes the event in the run's own transaction. |
| 3 | `RETRIEVE_LITERATURE` | AUTOMATED | — | `retrieveResearchRunLiterature()` | Connectors fetch, hash and store the raw responses; an unreachable host is recorded as `BLOCKED` by code. |
| 4 | `GENERATE_HYPOTHESES` | AUTOMATED | — | `proposeResearchPlan()` | The reasoning provider produces the plan; the stage records it as an `AGENT`, not a person. |
| 5 | `VALIDATE_HYPOTHESIS_PROPOSALS` | AUTOMATED | — | plan validator | A proposal without a falsification criterion is thrown out before any person sees it. |
| 6 | `ATTACH_DATASET` | HUMAN_REQUIRED | — | `attachResearchRunDataset()` | Takes bytes, licence and origin URL from an editor's body; its own header says the origin is DECLARED and Genesis does not fetch it. |
| 7 | `FREEZE_PROTOCOL` | AUTOMATED | — | `PREDICTIONS_FROZEN` + `PREREGISTRATION` | Predictions, thresholds and engine are frozen to append-only Scientific Memory before the engine runs. |
| 8 | `SELECT_ENGINE_AND_CHECK_AVAILABILITY` | AUTOMATED | — | `tools.engineStatus()` | Availability, version and toolchain fingerprint read from the runtime; an unavailable engine blocks in code. |
| 9 | `EXECUTE_EXPERIMENT` | AUTOMATED | — | `executeResearchExperiment()` | The engine runs; its duration is a `COMPUTE` span and its worker a `WORKER` member. No human touch in this path. |
| 10 | `APPROVE_BIOLOGICAL_OR_WET_LAB_CLAIM` | HUMAN_APPROVAL_ONLY | LEGAL_RESPONSIBILITY | `claimProposal.mjs` `HUMAN_APPROVAL_KINDS` | The code already returns `HUMAN_APPROVAL_REQUIRED` for biological, wet-lab, clinical, animal, human-subject and synthesis work. |
| 11 | `SEAL_FALSIFICATION` | AUTOMATED | — | `SELF_FALSIFICATION` + `SESSION` | The server compares the result to the frozen predictions and seals the verdict. |
| 12 | `REPLAY_VERIFY` | AUTOMATED | — | `replayResearchExperiment()` | The verifier re-runs the sealed execution; its runtime is a `COMPUTE` span. |
| 13 | `RESOLVE_NON_REPRODUCING_RESULT` | HUMAN_REQUIRED | MANDATORY_HUMAN_REVIEW | non-`MATCH` replay → `HUMAN_REVIEW` | The fixed rule has no branch that continues past a non-`MATCH` replay. |
| 14 | `BUILD_EVIDENCE_PACK` | AUTOMATED | — | `buildResearchRunEvidencePack()` | Assembled from the run's own records and appended as a proposal, by code. |
| 15 | `APPROVE_EVIDENCE_PUBLICATION` | HUMAN_APPROVAL_ONLY | MANDATORY_HUMAN_REVIEW | `publication: REQUIRES_HUMAN_APPROVAL` | Genesis records `PROPOSED_REQUIRES_HUMAN_APPROVAL` and has no path that publishes without a person. |
| 16 | `PROPOSE_NEXT_EXPERIMENT` | AUTOMATED | — | `NEXT_EXPERIMENT` | The next action comes from the run's own recorded rule. |
| 17 | `ADVANCE_LOOP` | AUTOMATED | — | `advanceResearchRun()` | The loop walks itself until its rule has nothing executable left. |
| 18 | `RANK_CANDIDATE_POOL` | AUTOMATED | — | campaign pipeline | Filtering and ranking run as campaign code; the rejected-candidate counter is written by that code. |
| 19 | `SELECT_COMPUTATIONAL_WINNER` | AUTOMATED | — | campaign pipeline | The winner follows from a ranking rule recorded before the ranking ran. |
| 20 | `APPROVE_LABORATORY_HANDOFF` | HUMAN_APPROVAL_ONLY | LEGAL_RESPONSIBILITY | `candidateLabHandoff.mjs` `requiresHumanApproval: true` | The package is built by code and marked as needing approval; it commits money, materials and a third party's time. |
| 21 | `SYNTHESISE_AND_ASSAY_IN_LABORATORY` | EXTERNAL_PHYSICAL_ACTION | PHYSICAL_PRESENCE | `prepareLabRequest()` / `exportLabPackage()` | Making a compound happens in a building Genesis is not in; the code models it as an export plus `HUMAN_WAIT`. |
| 22 | `MEASURE_AND_TRANSCRIBE_OBSERVATION` | EXTERNAL_PHYSICAL_ACTION | REAL_MEASUREMENT | `ingestLabObservation()` | The number originates at an instrument; Genesis can only ingest and hash what it is handed. |
| 23 | `REVIEW_LAB_OBSERVATION` | HUMAN_APPROVAL_ONLY | MANDATORY_HUMAN_REVIEW | `reviewLabObservation()`, `labEvidenceBridge.mjs` | An external observation becomes usable only after a person reviews it; the bridge's header says so. |
| 24 | `COMPARE_MODEL_TO_MEASUREMENT` | AUTOMATED | — | `compareModelToMeasurement()` | Once a reviewed measurement exists, the comparison is arithmetic the server performs. |
| 25 | `RECORD_HUMAN_WORK_BASELINE` | HUMAN_REQUIRED | REAL_MEASUREMENT | `recordHumanWorkBaseline()` | The function refuses any row without measurer, time, method, source and source hash; nothing in this repository calls it. |

### 2.2 The two human steps that are **not** excused

`SUBMIT_RESEARCH_QUESTION` and `ATTACH_DATASET` are `HUMAN_REQUIRED` for reasons that are **not** in
the admitted exclusion set, so they stay in the denominator and are the whole of the 88.2% shortfall.
That is deliberate, and by the owner's principle both are standing product bugs or hard limits that
must be argued, not hidden:

- **The question** is the person's intent. A question Genesis invented for itself would make every
  later measurement a measurement of its own preference. This may be a real limit; it is still
  counted against the number until someone shows otherwise.
- **The dataset** is the weaker case. Genesis verifies the hash it is handed but cannot acquire the
  file, cannot read a licence it was not shown, and must not decide on its own authority which
  external data a claim rests on. Fetching a dataset from a declared, licensed source **is**
  automatable, so this one is a product bug by the owner's definition.

---

## 3. `AUTOMATION_COVERAGE` and its denominator

```
denominator = classified steps whose coverage_exclusion IS NULL
            = every step that does NOT require physical presence, legal responsibility,
              a real measurement, or mandatory human review
numerator   = those steps classified AUTOMATED
AUTOMATION_COVERAGE = numerator / denominator        target: >= 0.90
```

The exclusion set is `COVERAGE_EXCLUSIONS` in the code and **nothing else**: exactly
`PHYSICAL_PRESENCE`, `LEGAL_RESPONSIBILITY`, `REAL_MEASUREMENT`, `MANDATORY_HUMAN_REVIEW`. Every
excluded step names which one removed it; nothing is excluded implicitly. An `AUTOMATED` step cannot
be excluded (a table `CHECK` refuses it), so the numerator is always a subset of the denominator.

**Today:** 15 / 17 = **0.8824 → 88.2%**, `meetsTarget: false`. Excluded: 8 steps —
`PHYSICAL_PRESENCE` 1, `LEGAL_RESPONSIBILITY` 2, `REAL_MEASUREMENT` 2, `MANDATORY_HUMAN_REVIEW` 3.
The report always carries `denominatorShareOfLoop` (**0.68**) in the same object, so the coverage
figure cannot be quoted without the fraction of the loop it actually covers.

**It is never reported as an achievement against the target unless the classification covers the
whole loop.** If any of the ten stages carries no classified step, `targetComparable` is `false`,
`meetsTarget` is `null`, and `unclassifiedStageCount` says **how many** stages are unclassified. The
arithmetic over the classified part is still shown — it is just not an achievement.

---

## 4. The metrics: definition, source, and what is `UNKNOWN`

`GET .../human-work` returns one object per metric: `{ metric, value, unit, computable, source,
definition, reason }`. A metric that cannot be computed has `value: "UNKNOWN"` — the literal string,
**never 0 and never an estimate** — and a `reason`.

### 4.1 Computable from Genesis's own records

| Metric | Definition | Source | `UNKNOWN` when |
| --- | --- | --- | --- |
| `HUMAN_TOUCH_COUNT` | how many times a person had to touch this scope at all | row count of `discovery_human_touches` | never (a count of rows is always known) |
| `SCIENTIST_ACTIVE_TIME` | time a person actually spent working, not waiting | sum of `active_ms` | no touch row recorded |
| `SCIENTIST_WAIT_TIME` | time the scope was blocked on a person | `HUMAN_WAIT` spans | no `HUMAN_WAIT` span recorded |
| `GENESIS_ACTIVE_TIME` | machine time spent executing | `COMPUTE` spans | no `COMPUTE` span recorded |
| `LAB_HOURS_USED` | physical instrument time consumed | `LAB_INSTRUMENT` spans | no `LAB_INSTRUMENT` span recorded |
| `TIME_TO_DECISION` | wall clock from the question being formalised to the loop having no further justified experiment | `OPEN`/`CLOSE` of `QUESTION_TO_VERIFIED_RESEARCH_OUTCOME` | that stage is not closed |
| `AUTOMATED_WORK_RATIO` | share of recorded **active** work time that is machine compute | `COMPUTE` spans and touch rows | no touch row recorded, or no active time on either side |
| `HUMAN_WORK_RATIO` | share of recorded **active** work time that is human | same | same |
| `AUTOMATION_COVERAGE` | section 3 | `discovery_loop_steps` (or the code declaration) | no classification at all |

Two rules deserve naming, because both refuse a flattering number:

- **A sum of zero with no source row is `UNKNOWN`, not 0.** "No laboratory time was spent" and "no
  laboratory time was measured" are different facts; the span **count** is kept next to the sum
  precisely so the two can be told apart. A scope that genuinely used no laboratory time has to
  record that explicitly.
- **No human touch means the ratios are `UNKNOWN`, not 100% automation.** Otherwise the easiest way
  to report full automation would be to stop instrumenting people.

Waiting is excluded from both ratios, on both sides: waiting is not work.

### 4.2 Not computable from Genesis's own data — `UNKNOWN` today

| Metric | Needs | Status |
| --- | --- | --- |
| `SCIENTIST_HOURS_SAVED` | baseline active human time for the same task scope | `UNKNOWN` — `NO_HUMAN_WORK_BASELINE_RECORDED` |
| `LAB_HOURS_AVOIDED` | baseline laboratory instrument time | `UNKNOWN` — same |
| `EXPERIMENTS_AVOIDED` | baseline experiment count | `UNKNOWN` — same |
| `FAILED_EXPERIMENTS_AVOIDED` | baseline failed-experiment count | `UNKNOWN` — same |
| `COST_TO_DECISION` | recorded, provenanced scientist / compute / laboratory rates | `UNKNOWN` — `NO_COST_RATE_RECORDED` |

Each is a difference against what a person would have needed **without** Genesis. Genesis cannot
observe work done outside itself, **and no "without Genesis" measurement exists anywhere in this
repository** — an earlier audit established that, and `discovery_human_work_baselines` and
`discovery_cost_rates` both ship empty. The only source of such a number is a row in those tables.
There is no function in the module that accepts a baseline value, a saved-hours number or a rate as
an argument, so a caller cannot supply its own: a caller may only *declare* a task scope and an
evidence standard so a **recorded** baseline can be matched to it.

A baseline that does not describe the same work is not a baseline for this work. Matching requires an
exact `taskScopeHash` match **and** an exact evidence-standard match, the same discipline
`genesisSpeedup` already applies; otherwise the reason is
`BASELINE_NOT_COMPARABLE_SCOPE_OR_EVIDENCE_STANDARD` and the metrics stay `UNKNOWN`. Where several
comparable baselines exist, the one with the **smallest** human effort is used, so adding a more
wasteful baseline can never raise a saving.

`COST_TO_DECISION = scientist_active_hours × scientist_rate + compute_hours × compute_rate +
lab_hours × lab_rate`, in currency minor units, at rates read from `discovery_cost_rates`. **No price
is hardcoded anywhere in the module.** With rates present but an input unmeasured, the reason is
`COST_INPUT_NOT_MEASURED` and the inputs are named.

### 4.3 How to read it

```
GET /api/projects/:projectId/research-runs/:runId/human-work
GET /api/projects/:projectId/campaigns/:campaignId/human-work
```

Both are `GET`-only (any other method is `405`) and read-only: they write no row, not even the
classification. Optional query parameters `taskScopeId`, `taskScope` (JSON) and `evidenceStandard`
only declare which recorded baseline could be compared. In code: `humanWorkReport`,
`campaignHumanWorkReport`, `automationCoverage`, `recordHumanTouch`, `recordHumanWorkBaseline`,
`recordCostRates`.

---

## 5. How a baseline would be measured honestly

A baseline is a measurement of a person doing the **same task scope** to the **same evidence
standard** without Genesis. It cannot be reconstructed afterwards, and it cannot be estimated.

1. **Freeze the task scope first**, as section 3 of `docs/benchmark/TIME-TO-DISCOVERY.md` defines it:
   the question with its target and readout, the deliverable, the inputs and their versions and
   licences, the permitted methods, and the stopping rule. Its canonical SHA-256 is what both sides
   are compared on. Freezing it *after* either side has run is not a baseline.
2. **An external scientist does the same task**, not a Genesis operator and not the team that built
   it. Someone with the relevant skill who is not invested in the outcome.
3. **Active human time is logged separately from machine time**, by stopwatch, at the task level:
   time spent working, with waiting recorded separately, exactly as `discovery_human_touches` and
   `HUMAN_WAIT` spans separate them on the Genesis side. One number for "elapsed" measures the
   scientist's calendar, not their work.
4. **Count experiments and failed experiments** as they happen, by the task scope's own definition of
   an experiment, not afterwards from memory.
5. **Record laboratory instrument hours** separately from human hours.
6. **Record cost at paid rates**, from invoices, in one currency's minor units, with the rate's own
   provenance in `discovery_cost_rates`.
7. **Hash the raw log.** The log file is the source; its SHA-256 goes in `source_sha256` and the file
   is kept. A baseline whose log cannot be re-read is not auditable.
8. **Insert it once.** `discovery_human_work_baselines` is append-only by trigger: a recorded
   baseline cannot be edited into a better number later, and every provenance column — who measured
   it, when, by what method, from what source, and that source's hash — is `NOT NULL` and `CHECK`ed
   non-empty, so an incomplete baseline is refused by the database.

Until step 8 has happened for a given task scope, the correct report is `UNKNOWN`.

---

## 6. How this measurement could be gamed, and how each is detected

| # | The move | How it is detected |
| --- | --- | --- |
| G1 | **Stop recording human touches** so `AUTOMATED_WORK_RATIO` reads 100%. | It reads `UNKNOWN`, not 1.0: with zero touch rows both ratios refuse to compute (`NO_HUMAN_TIME_RECORDED`). A report that claims full automation with `HUMAN_TOUCH_COUNT: 0` is unmeasured, and says so. |
| G2 | **Classify a manual step as `AUTOMATED`** to raise the numerator. | Every row carries a `code_ref` and a `justification`; the claim is checkable against the named function. `recordLoopStep` refuses an unknown class, and the test suite asserts that every stage of the loop is covered, so a step cannot simply be deleted either. |
| G3 | **Move an inconvenient manual step into the exclusions** to shrink the denominator. | Only four exclusion reasons exist, enforced by a `CHECK`; each excluded step must name which one, and `excludedBy` reports the count per reason. `denominatorShareOfLoop` (0.68 today) is in the same object, so a denominator that shrank is visible in the number next to the coverage. |
| G4 | **Mark a `HUMAN_REQUIRED` step without a reason**, leaving it unexplained. | SQLite refuses the row. `why_human_required` must be non-empty for every `HUMAN_REQUIRED` row, by table `CHECK`. |
| G5 | **Declare a step `AUTOMATED` and also exclude it**, taking it out of the denominator while keeping credit. | A `CHECK` refuses an `AUTOMATED` row with a coverage exclusion. |
| G6 | **Quote `AUTOMATION_COVERAGE` from a partial classification**, where only the easy stages are classified. | `targetComparable: false`, `meetsTarget: null`, and `unclassifiedStageCount` names how many stages carry no step. |
| G7 | **Invent a baseline**, or estimate one "conservatively". | A baseline exists only as a row with a measurer, a timestamp, a method, a source URI and that source's SHA-256, every one `NOT NULL` and non-empty. No code path in the repository writes such a row, and no function accepts baseline numbers as arguments. |
| G8 | **Pick the most wasteful baseline** to maximise hours saved. | The **smallest** recorded human effort among comparable baselines is used. Adding a worse baseline cannot raise a saving (asserted in the test suite). |
| G9 | **Compare against a baseline for a different, larger task**, or a lower evidence standard. | The `taskScopeHash` must match exactly and the evidence standard must match exactly, or the reason is `BASELINE_NOT_COMPARABLE_SCOPE_OR_EVIDENCE_STANDARD` and the metrics stay `UNKNOWN`. |
| G10 | **Edit a recorded baseline or rate upward** after seeing the Genesis side. | Both tables refuse `UPDATE` and `DELETE` by trigger. |
| G11 | **Report a flattering 0** — "zero lab hours used", "zero human time". | A sum of zero with no source span or touch row is `UNKNOWN`. The span counts are stored next to the sums specifically so the two cannot be confused. |
| G12 | **Count waiting as work**, inflating the human side or hiding a slow machine. | Four separate clocks: `COMPUTE`, `QUEUE` (waiting for a machine), `HUMAN_WAIT` (waiting for a person) and `LAB_INSTRUMENT`, never summed into one; active human time is a different table again. |
| G13 | **Re-enter a stage** to reset or stretch a measured boundary. | A UNIQUE index allows one `OPEN` and one `CLOSE` per (scope, stage); both mark and fact tables refuse `UPDATE` and `DELETE` (v17). |
| G14 | **Smuggle numbers in through the API** query string or body. | The routes are `GET`-only; only `taskScopeId`, `taskScope` and `evidenceStandard` are read, and they select a recorded baseline rather than supplying values. Asserted directly in the test suite. |
| G15 | **Hand-edit the classification table** in a deployed database to a better set of rows. | The table is a projection of the frozen `LOOP_STEPS` constant, re-synchronised at server start, so an edit is overwritten at the next boot; `classificationSource` says whether the report came from the database or from the code declaration. |

---

## 7. Tests

`packages/backend/src/humanWork.test.mjs` — the classification vocabulary and the refusal of an
unknown class; `WHY_HUMAN_REQUIRED` enforced by the database; the metrics on a seeded run through the
real loop; the `UNKNOWN` invariant for every baseline-dependent metric at every stage; the
no-code-path assertion including a caller supplying its own numbers; a non-vacuous positive case
where a recorded, comparable baseline does produce numbers; persistence across a restart; and the
v17 → v18 migration with existing rows intact and the database still writable.

## 8. Files

- `packages/backend/src/discoveryTiming.mjs` — `LOOP_STEPS`, the classification writers and readers,
  human touches, human-work baselines, cost rates, the metrics, both reports.
- `packages/backend/src/store.mjs` — schema v18, the four tables and the migration.
- `packages/backend/src/api.mjs` — the two read-only routes.
- `packages/backend/src/server.mjs` — the boot-time classification sync.
- `docs/benchmark/TIME-TO-DISCOVERY.md` — the v17 substrate, the task scope definition and the
  competitor-time protocol this builds on.
