# TIME-TO-DISCOVERY — the benchmark protocol for the 2x KPI

**Status today: `TARGET_2X_NOT_YET_BENCHMARKED`.**

This document says how a "2x faster than a comparable competitor workflow" claim would be proved
honestly, what the repository can measure today, and what it cannot claim. It is a protocol, not a
result. No number in it is a measured competitor time.

---

## 1. The definition this is built against

The owner's definition, and the only one the code implements:

> 2x faster means Genesis needs **at most 50%** of the competitor benchmark time for the **same task
> scope** under a **comparable evidence standard**.

Written as the indicator:

```
GENESIS SPEEDUP = competitor_time / genesis_time
GREEN            only when speedup >= 2.0 AND the task scope matches AND the evidence standard matches
```

A speedup that comes from any of the following is not a speedup. It is a different, smaller task:

- skipping falsification,
- skipping Replay,
- lowering what counts as Evidence,
- skipping provenance,
- shrinking the task scope while keeping the old baseline,
- swapping in an easier benchmark.

Section 6 lists these again as the cheating list, with how each one is detected.

---

## 2. What is measured, and where it comes from

The instrumentation lives in `packages/backend/src/discoveryTiming.mjs` and is written **from inside
the canonical ResearchRun loop** (`researchRun.mjs`, `researchRunExecution.mjs`), in the loop's own
write transactions, on the same SQLite database, through the same `store.mjs` migration path
(schema **v17**). There is no second clock and no second state system: a loop step that rolls back
leaves no timing behind, because the timing was part of the step.

Tables (all append-only, enforced by triggers):

| Table | What it holds |
| --- | --- |
| `discovery_stage_marks` | stage boundaries only, one `OPEN` and one `CLOSE` per (scope, stage), enforced by a UNIQUE index |
| `discovery_stage_facts` | everything that accumulates inside a stage: spans, counters, members, statuses |
| `discovery_competitor_baselines` | externally measured baselines, every provenance column `NOT NULL` and `CHECK`ed non-empty |
| `discovery_timing_campaign_links` | which runs belong to which campaign |

### 2.1 The ten stages

| Stage | Opens | Closes |
| --- | --- | --- |
| `QUESTION_TO_HYPOTHESES` | the question is formalised (`PROBLEM_FORMALIZED`) | the plan is stored (`HYPOTHESES_GENERATED`) |
| `HYPOTHESES_TO_FROZEN_PROTOCOLS` | the plan is stored | the first protocol is preregistered (`PREDICTIONS_FROZEN`) |
| `PROTOCOLS_TO_COMPLETED_EXPERIMENTS` | the first protocol is frozen | the first engine execution is sealed |
| `EXPERIMENT_TO_FALSIFICATION` | the result exists | the result is sealed against its preregistration (`SELF_FALSIFICATION`) |
| `RESULT_TO_REPLAY` | the result exists | the replay verifier has returned a verdict |
| `RESULT_TO_EVIDENCE_PACK` | the result exists | the Evidence Pack proposal is appended (`EVIDENCE_UPDATE`) |
| `CANDIDATE_POOL_TO_RANKED_CANDIDATE` | the candidate pipeline calls `openStage` | the pipeline calls `closeStage` |
| `RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER` | as above | as above |
| `WINNER_TO_LABORATORY_HANDOFF` | as above | as above |
| `QUESTION_TO_VERIFIED_RESEARCH_OUTCOME` | the question is formalised | the run's fixed rule has no further executable experiment |

The last three stages belong to the candidate pipeline, which owns candidate selection, ranking and
the chemistry handoff. `discoveryTiming.mjs` only provides the substrate they call; it decides
nothing about a candidate. A stage nobody entered is **absent** from the report, never reported as
zero.

**Boundaries are recorded once each.** A re-entered stage keeps its original start and its original
end. For a stage a run traverses repeatedly (protocol after protocol) the per-stage wall clock
therefore measures the **first** traversal; the repetition is visible in the `EXPERIMENTS` and
`RETRIES` counters, the whole journey in `QUESTION_TO_VERIFIED_RESEARCH_OUTCOME`, and each
individual experiment on its own `EXPERIMENT` scope. The alternative — letting `CLOSE` move — would
make a stage's duration depend on how often it was re-entered, which is not a measurement.

### 2.2 The four clocks, and why `queueMs` is not `humanWaitMs`

| Field | Meaning |
| --- | --- |
| `wallClockMs` | `CLOSE` minus `OPEN`. What a stopwatch in a room would see. |
| `computeMs` | machine time actually spent executing (engine runtime, replay verification). |
| `queueMs` | time a unit of work waited **for a machine**: a free worker, a lease, a scheduler. |
| `humanWaitMs` | time **blocked on a person**: a review, a decision, a laboratory turnaround. |

`queueMs` and `humanWaitMs` are separate kinds in the schema (`SPAN_KINDS`) and are never summed into
one number. They answer different questions and are fixed by different means — queue time is
capacity, human-wait time is organisation. A benchmark that merged them could manufacture a 2x by
comparing against a slow reviewer, or bury a real 2x behind one. This is the distinction the
competitor measurement in section 4 must also honour: **active human time is recorded separately
from compute time on both sides.**

### 2.3 The rest of the per-stage record

| Field | Meaning |
| --- | --- |
| `experiments` | completed experiments counted in the stage |
| `rejectedCandidates` | proposals thrown out (plan proposals the validator refused; candidates the pipeline refused) |
| `retries` | attempts beyond the first; an engine that refused its input counts as one failed attempt |
| `agents` / `workers` | distinct agents and distinct workers that took part (one worker named twice is one worker) |
| `evidenceStatuses` / `replayStatuses` | every Evidence and Replay status reached in the stage, with its reference |

The statuses sit next to the timings on purpose, so a stage's duration can never be read apart from
whether the result reproduced and what the Evidence actually is. Today a ResearchRun's Evidence
status is `PROPOSED_REQUIRES_HUMAN_APPROVAL`: publishing it remains a human decision.

### 2.4 How to read it

```
GET /api/projects/:projectId/research-runs/:runId/time-to-discovery
GET /api/projects/:projectId/campaigns/:campaignId/time-to-discovery
```

Both are read-only and return `{ timeToDiscovery, genesisSpeedup }`. In code:
`stageTimings`, `discoveryTimingReport`, `campaignCycleTiming`, `genesisSpeedup`.

---

## 3. Task scope definition

A benchmark comparison is only meaningful between two pieces of work of the same size. A **task
scope** is a declared object; its canonical SHA-256 (`taskScopeHash`) is what the indicator compares.
Two sides are the same scope only if that hash matches exactly, so a scope quietly made smaller can
never be divided by the old baseline.

A task scope must state at least:

1. **The question**, written out, with the target and the readout named.
2. **The deliverable** — exactly what has to exist at the end (for example: one computational
   candidate, with a preregistered protocol, a falsification verdict, a Replay verdict and an
   Evidence Pack proposal).
3. **The inputs both sides may use** — structures, datasets, literature, their versions and licences.
   Access to a dataset one side does not have is a scope difference, not a speed difference.
4. **The engines or methods permitted**, if the comparison constrains them.
5. **The stopping rule** — what makes the task finished, decided in advance.
6. **What is explicitly out of scope** (synthesis, assay execution, regulatory work).

Write the task scope down and hash it **before** either side starts. A scope written afterwards is
a description of what happened, not a benchmark.

---

## 4. How a competitor or manual baseline would be measured

**There is no such measurement in this repository.** This section is the method for making one.

The baseline is a human one: **an external computational chemist performing the same task by hand,
against a stopwatch.** It is not an estimate, not a literature figure and not a vendor's published
cycle time.

Protocol:

1. **Recruit someone outside the project.** Not the owner, not a contributor. They have no interest
   in the result.
2. **Hand them the frozen task scope** from section 3, and nothing else about Genesis.
3. **Hand them the same evidence standard** (section 5). They must deliver the same artefacts, not a
   quicker approximation of them.
4. **Record three clocks separately:**
   - **wall clock** — start to finish, including every wait;
   - **active human time** — time the person was actually working, logged by them as they go
     (a stopwatch started and stopped, or a timesheet at a granularity they state);
   - **compute time** — time their machines spent running, measured on the machine, not estimated.
   Waiting for a colleague, a review or a laboratory is **human-wait time**, logged as such, not as
   compute.
5. **Record provenance with the numbers.** Every one of these is required and the database refuses a
   baseline without it: `measuredBy`, `measuredAt`, `measurementMethod`, `sourceUri`,
   `sourceSha256`. The source is the raw log, hashed, not a summary.
6. **Repeat with more than one person** if the claim is to survive. One person's afternoon is an
   anecdote. Report each baseline separately; the indicator uses the **smallest** recorded competitor
   time, so adding a slower person can never raise the reported speedup.
7. **Record it** with `recordCompetitorBaseline(db, { ... })`. The row is append-only: it cannot be
   edited into a better number afterwards.

If a vendor or published workflow is ever used instead of a person, it is subject to exactly the same
requirements, and `measurementMethod` must say who ran it and on what.

---

## 5. The comparable evidence standard

Both sides must deliver the same thing to the same standard. For a ResearchRun-shaped task the
standard is Genesis's own, stated as a string both sides are held to and which the indicator compares
verbatim:

1. **A preregistered protocol.** The predictions, criteria and criticality are frozen and hashed
   before the engine runs. A result produced without one does not count.
2. **A falsification verdict against that preregistration.** `SUPPORTED_WITHIN_PROTOCOL`,
   `FALSIFIED_WITHIN_PROTOCOL` or `INCONCLUSIVE` — each of which describes only that frozen
   hypothesis under that protocol, never scientific truth.
3. **A Replay verdict.** The result is re-run and the output hashes compared. `MATCH` or the verdict
   it actually got, recorded either way; `UNAVAILABLE` is reported, not hidden.
4. **An Evidence Pack**, as a proposal that still requires a human decision.
5. **Provenance throughout**: input and output hashes, engine identity and version, environment, and
   for the human side the raw log and its hash.

If the human side was not asked to produce all five, the comparison is between different deliverables
and the indicator reports `NOT_COMPARABLE_SCOPE_OR_EVIDENCE_STANDARD` rather than a ratio.

---

## 6. What counts as cheating

Each of these makes the speedup meaningless. Each is listed with how it is caught.

| Cheat | How it is caught |
| --- | --- |
| **Skipping falsification** | `EXPERIMENT_TO_FALSIFICATION` is absent from the stage report, and the Evidence/Replay statuses sitting next to the timings are empty. |
| **Skipping Replay** | `RESULT_TO_REPLAY` has no recorded status, or its status is not a replay verdict. |
| **Lowering the Evidence requirement** | the declared evidence standard no longer matches the baseline's, so the status is `NOT_COMPARABLE_SCOPE_OR_EVIDENCE_STANDARD`, not a number. |
| **Skipping provenance** | a baseline without full provenance cannot be inserted at all; the columns are `NOT NULL` and `CHECK`ed non-empty. |
| **Falsely shrinking the task scope** | `taskScopeHash` stops matching the baseline's, so the status is `NOT_COMPARABLE_...`. |
| **Using an easier benchmark** | the comparison is per `taskScopeId` and per stage; a baseline for another task is simply not a baseline for this one. |
| **Counting human wait as compute** (or the reverse) | the two are separate span kinds on both sides, and the human protocol requires active human time to be logged by the person. |
| **Comparing against the slowest person you can find** | the indicator uses the smallest recorded competitor time, and every baseline is kept (append-only), so a slow one cannot be swapped in. |
| **Hand-editing a measured timing** | both timing tables are append-only; `UPDATE` and `DELETE` are refused by triggers. |
| **Re-opening a stage to reset its clock** | a boundary can be recorded only once; a UNIQUE index refuses the second. |
| **Hard-coding a number or a status** | there is no competitor number anywhere in the code, and the no-competitor-data invariant is a test. |

---

## 7. What this repository can and cannot claim today

**Can claim.** Genesis measures its own time-to-discovery, per stage, per experiment, per run and per
campaign: wall clock, compute, queue and human-wait time, with experiment, rejected-candidate, retry,
agent and worker counts and the Evidence and Replay statuses they were obtained under. These timings
are persisted, survive a restart and cannot be edited afterwards.

**Cannot claim.** Anything about being faster than anything else. There is **no "without Genesis"
baseline anywhere in this repository** — an earlier audit established that, and nothing has changed
it. Therefore:

- `genesisSpeedup()` reports the literal string **`TARGET_2X_NOT_YET_BENCHMARKED`**, with
  `speedup: null` and `green: false`, for **every** stage;
- it does so even when the Genesis side is fully measured and even when a caller hands it its own
  Genesis number, a task scope and an evidence standard;
- there is no code path from an empty `discovery_competitor_baselines` to a speedup number, to
  `GREEN`, or to any statement that the 2x target has been met. `packages/backend/src/discoveryTiming.test.mjs`
  fails if one is ever introduced.

The first honest 2x claim becomes possible on the day someone outside the project runs section 4 and
the resulting row, with its provenance, is recorded. Until then the status string above **is** the
answer, and it is a measured absence, not a placeholder.

---

## 8. Files

- `packages/backend/src/discoveryTiming.mjs` — the stages, the four clocks, the counters, the
  baselines and the indicator.
- `packages/backend/src/store.mjs` — schema v17, the four tables and the migration.
- `packages/backend/src/researchRun.mjs`, `packages/backend/src/researchRunExecution.mjs` — the
  instrumentation inside the canonical loop.
- `packages/backend/src/api.mjs` — the two read-only routes.
- `packages/backend/src/discoveryTiming.test.mjs` — the tests, including the no-competitor-data
  invariant.
- `docs/DECISIONS.md` — D-162.
