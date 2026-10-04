# Genesis — grant readiness evidence bundle

**Date:** 2026-10-04 · **Branch:** `g1/monetization-grant` from `286822e7` ·
**Production serves:** `37197555` (`origin/railway-production-ready`, 3 Oct 23:09 UTC) ·
**Whether the live site is reachable: UNVERIFIED** — the domain points at a parking page and
`production-smoke.yml` has 0 runs.

Companion documents: the commercial map is `docs/monetization/MONETIZATION-READINESS.md` §9; the
public-safe version of this story is `docs/public/PUBLIC-PROOF-PACK.md`. The September Polish-language
report `docs/GRANT_READINESS_REPORT.md` is kept as the earlier baseline and is not deleted; this file
supersedes it for anything dated after 2026-09-12.

---

## 0. How to read this document

A funder should be able to tell, without interpretation, which of five things any claim is. Every
section below is split into exactly these five columns or headings, and nothing is allowed to drift
between them:

| Label | Meaning |
|---|---|
| **WORKS** | Real code runs it, here, today. A reader can execute it. |
| **TESTED** | A named passing test or a committed evidence file proves it, including the failure modes. |
| **HYPOTHESIS** | Stated intent or expectation. No measurement exists. Never presented as a result. |
| **NEEDS LABORATORY** | Cannot be settled by computation at all. Requires physical experiment or an external measuring party. |
| **NEEDS FUNDING** | Known, specified, and blocked only by money, hardware, a licence or a person who must be hired. |

**Evidence rule.** Every claim here comes from this repository or a cited source. **Where a number
does not exist, this document writes `UNKNOWN`.** It never estimates in place of a number, and the
UNKNOWNs are collected in §15 so they cannot be lost.

**Claims that this document does not make, anywhere, for reasons given in §16:** that Genesis is
faster than anything else; that a drug, a candidate or a lead exists; that anything is validated,
clinically proven or signed; that any engine is Genesis's own or open source.

---

## 1. Architecture

### WORKS

One backend process (Node, `node:sqlite`), one SQLite database, one local content-addressed artifact
store, one durable lease queue, one frontend PWA. There is no second state system anywhere in the
science path:

| Layer | Where | Durable form |
|---|---|---|
| Research run identity and state | `packages/backend/src/agentRun.mjs`, `researchRun.mjs` | `agent_runs` + hash-chained `agent_run_steps` |
| Scientific memory | `packages/backend/src/experimentMemory.mjs` | `experiment_records`, append-only by DB trigger, hash-chained per key |
| Engine output and replays | `packages/backend/src/store.mjs`, `campaign/verify.mjs` | `science_runs`, `science_run_verifications` |
| Evidence ledger | `packages/backend/src/knowledgeApi.mjs` | `evidence_ledger_entries`, schema V16, append-only and chained by DB trigger, in the same SQLite file |
| Job queue | `packages/backend/src/researchRunJobs.mjs`, `compute/workerInfrastructureContract.mjs` | `jobs`, V15 lease columns |
| Evidence Pack | `packages/backend/src/researchRunEvidencePack.mjs` | derived; every hash recomputable |
| Audit chain | `packages/backend/src/security/auditChain.mjs` | append-only |

Architecture of record: `docs/GENESIS_MASTER_ARCHITECTURE.md`, `docs/BYT_CANONICAL_CONSOLIDATION.md`.

### TESTED

`researchStatePersistence.test.mjs` and `bytProjectionRestart.test.mjs` fail **closed** on a corrupted
or truncated chain rather than degrading silently. `knowledgeLedgerMultiInstance.test.mjs` proves two
backend instances on one database do not corrupt the ledger. `dbPreMigrationSnapshot.test.mjs` proves a
snapshot is taken before a schema migration.

### HYPOTHESIS

That this architecture scales past one host without a redesign. Not demonstrated.

### NEEDS FUNDING

A managed database with a real backup/restore drill, shared object storage, a multi-replica queue and
a secret manager — the P0 list in `docs/GENESIS_SAAS_ENTERPRISE_READINESS.md`. Today:
single-node SQLite, local files, **no backup/restore drill**, labelled `BLOCKED_EXTERNAL_OBJECT_STORAGE`
in `docs/evidence/consolidation/completion-matrix-2026-10-03.md`.

---

## 2. The one-brain result

The design claim is that Genesis has **one brain, not several**: BYT is a *materialised projection of
verified canonical records*, it owns no rows of its own, and it may not write scientific truth.
Model-generated text stays `PROPOSED` or `NOT_EVIDENCE`; only an existing evidence or execution path
may change a scientific status (`docs/BYT_CANONICAL_CONSOLIDATION.md`).

### WORKS

`packages/backend/src/bytProjection.mjs` and `cognitiveState.mjs` rebuild the projection from runs,
campaigns, jobs, experiment records, the knowledge registry and the self model. BYT owns no second
memory, no second ResearchRun, no second evidence ledger, no second replay and no second toolchain.

### TESTED

`docs/genesis1/BYT-VERIFICATION.md` records **12 requirements PASS** with real RDKit 2026.03.6 and a
real `SIGKILL`: identity, durable state, lineage, no duplicate execution, idempotency,
truncation and tamper detection, the v14→v15 migration, **six processes racing for one job**, and
**two backend instances on one database**. Tests: `bytVerification.test.mjs` (in-process),
`bytRecovery.e2e.test.mjs` (child processes, real SIGKILL). Without RDKit both are **skipped with
`ENGINE_UNAVAILABLE (BLOCKED_BY_RUNTIME)`, never passed**; `GENESIS_REQUIRE_ENGINES=rdkit` turns the
skip into a failure, so a missing engine cannot look like a pass.

### HYPOTHESIS

That one coherent projection makes the system's self-assessment of its own capability trustworthy.
`/api/genesis/self` reports engine availability only when a reference case or a persisted real remote
run backs it, which is the mechanism; whether the resulting self-assessment is *correct* is not
measured.

### NEEDS FUNDING

Two residual splits are known and unresolved: **two separate lab memories** (`kernelLedger` and
`scienceMemory`) and roughly **15 unmapped epistemic vocabularies**; the frontend and backend
hash-chain primitives are not one shared library
(`docs/evidence/consolidation/completion-matrix-2026-10-03.md`: `PARTIAL_IN_REPO`).

### Explicitly not claimed

Nothing here is a consciousness claim. BYT is a scientific self-model and a control loop.

---

## 3. The scientific workflow

### WORKS

One canonical loop, in this order, with the freeze before the execution:

```
question → formalised problem → plan and hypotheses → PREDICTIONS FROZEN (preregistration)
        → engine execution → sealed verdict within protocol → Evidence PROPOSED
        → Replay → justified next experiment → human review
```

Code: `researchRun.mjs` (`startResearchRun`, `proposeResearchPlan`), `researchRunLiterature.mjs`
(Europe PMC and PubMed, fail-closed, one allowlisted origin), `researchRunExecution.mjs`
(`executeResearchExperiment` → preregister → engine → `sealExperimentSession` → evidence proposal →
replay → `nextExperimentProposal`), `researchRunJobs.mjs` (durable lease queue),
`researchRunEvidencePack.mjs`.

The verdict vocabulary is deliberately narrow: `SUPPORTED_WITHIN_PROTOCOL`,
`FALSIFIED_WITHIN_PROTOCOL`, `INCONCLUSIVE`. **A verdict is about one frozen protocol. It is not a
statement that something is true.** Frozen criteria are immutable once a result exists.

### TESTED

`goldenResearchRun.e2e.test.mjs` — one run from question to memory recall with a real engine, a worker
crash, a restart and a recovery, ending with the **same frozen fingerprint and the same experiment id**,
two executions, two artifacts and replay MATCH after restart. `researchRunSteering.test.mjs`,
`researchRunImmutability.test.mjs`, `researchRunExecution.test.mjs`, `researchRunFanOut.test.mjs`
(one parent, 32 child jobs, 4 concurrent workers, one poisoned child isolated to `DEAD_LETTER`),
`researchRunAdvance.test.mjs` (executes the recorded next step, links it `EXPERIMENT_CONTINUED`, and
**stops at human review**), `researchRunControl.test.mjs` (pause → restart → resume → cancel on one
verified chain).

### HYPOTHESIS

That a loop which freezes its prediction before it computes produces fewer false positives than one
that does not. This is the project's core methodological bet. **It has not been measured against any
alternative.**

### NEEDS FUNDING

No real language model is in the loop in **any** test — the plan is always a frozen model answer, served
by a local fake OpenAI-compatible endpoint. A run carries **at most 6 hypotheses**. There is no
multi-hypothesis loop without a human, and uncertainty is deliberately left uncalibrated. Literature is
**metadata only**: no full text, no passage review, no source-quality scoring at scale.

---

## 4. Deterministic and reproducible execution

### WORKS

A preregistration is a JSON protocol with a fingerprint computed as
`sha256(json.dumps(protocol, sort_keys=True))`; the benchmark scripts recompute it and **refuse to run
on drift**. Engine executions are content-addressed: inputs and outputs are canonicalised and hashed,
and the artifact store is content-addressed with custody events (`ARTIFACT_PERSISTED`).

### TESTED

`researchRunArtifacts.test.mjs` — an artifact is stored, verified, survives a restart, and a truncated
or deleted artifact is **rejected**; a failed store is retried **without a second execution**; a
cancelled run stores nothing. Phase D of the Run 9 development work recorded
`"determinism": "two independent runs with different worker counts, byte-identical output"`
(`docs/evidence/run9/run9-seal-b.json`) and reproduced Run 8's published numbers exactly
(C0 204 = 204, VINA 202 = 202). An independent one-command reproducibility check exists:
`node scripts/repro-demo.mjs`, twelve checks against values committed in the repository, exit code 1 on
any divergence, and `docs/REPRODUCIBILITY_PACK.md` documents that it **can** fail (a silent edit of
pinned data → refusal and exit 1).

### HYPOTHESIS

That determinism holds across machines and across engine-version upgrades. Only same-host determinism
has been demonstrated. **Cross-machine bit-for-bit reproducibility: UNKNOWN.**

### NEEDS FUNDING

Pinned, hash-verified distributions of every shipped engine, which is also the condition
`docs/astra/COMMERCIAL_LICENSE_GATE.md` puts on RDKit, Vina and PySCF before commercial use.

---

## 5. Evidence and Replay

### WORKS

Two separate things, and the difference matters to a funder:

- **Evidence** — a canonical Evidence Pack built over the records a run already persists
  (`researchRunEvidencePack.mjs`): builder, verifier and route. It rejects mutated parameters, mutated
  data, mutated artifacts, a mutated verdict, a changed engine identity, and missing provenance.
- **Replay** — re-executing the recorded computation and comparing
  (`campaign/verify.mjs · replayCapabilityInputs`, extracted from `replayScienceRun`, with shared
  `REPLAYERS` and `TOLERANCE`). Verdicts: **MATCH / DRIFT / TAMPERED**.

On top of both sits **Genesis Verify** (`genesisVerify.mjs · verifySubmittedRecord`,
`renderVerifyReportHtml`, screen `#/verify`): six checks — readability, file sha256 against the hash the
holder was given, required provenance, recomputed canonical input and output hashes, a field-by-field
comparison against the copy in the hash-chained research state, and a real replay — rendered as one
self-contained HTML page with the verdict, the hashes, **what was NOT checked**, and the **UNSIGNED**
status.

**Replay says whether a computation reproduces. It does not say whether the computation is right.**

### TESTED

`genesisVerify.test.mjs` with real RDKit: a valid bundle → MATCH with all six checks PASS and replay
output hash equal to the recorded one; the same record in the `EXPERIMENT_HANDOFF` shape → MATCH; an
unanchored record → MATCH **plus a statement of what could not be seen**; one edited number → TAMPERED
with no replay attempted; a forgery whose hash was recomputed → TAMPERED via the file hash and the
ledger anchor, and DRIFT when unanchored (the honest boundary is stated rather than hidden); a record
missing engine and preregistration → BLOCKED; garbage → BLOCKED. Also
`researchRunEvidencePack.test.mjs`, `campaignVerify.test.mjs`, `campaignScienceRunReplay.test.mjs`,
`verifyScreen.test.tsx`, and the Reviewer Room tamper challenge `reviewerTamperChallenge.test.ts`,
which runs the real D-063 claim audit against pinned bytes, a forged copy and an unanchored forgery.

### HYPOTHESIS

That buyers and reviewers will pay for this layer. No customer has been asked. **No LOI, no paid pilot,
no revenue.**

### NEEDS FUNDING

**There is no signing key.** The CSRN production key has not been generated
(`docs/keys/OWNER-CSRN-KEY-COMMANDS.md`), so every certificate and every Verify report is **UNSIGNED**.
The only correct phrase is **"fingerprints and replay"** — never "signed evidence". Replay exists for
four engines (RDKit, PySCF, Vina, ADMET-AI); **OpenMM has no replayer and none is claimed**. Verify
accepts only Genesis-produced records: a customer's own pipeline output must be re-run inside Genesis
first. There is no PDF export.

---

## 6. Resilience

### WORKS

A durable lease queue with retries, timeouts, dead-lettering and cancel propagation; a hash-chained
state that detects truncation and tampering; artifact custody that reports a storage failure as
`artifactCustody FAILED` and recovers from it.

### TESTED

`bytRecovery.e2e.test.mjs` — child processes, a real `SIGKILL`, real RDKit, recovery with no duplicate
execution. `scientificWorkerRuntime.test.mjs` and `workerInfrastructureContract.mjs` — lease queue,
retries, dead-letter, timeout, cancel, restart. `scientificFanOut.test.mjs` — 32 child jobs, 4
concurrent workers: 31 `SUCCEEDED`, 1 `DEAD_LETTER`, each executed exactly once, distinct record hashes.
`researchStatePersistence.test.mjs` — a corrupted chain fails closed.

### HYPOTHESIS

That the same guarantees hold across hosts. Every proof above is **single-node**: the fan-out workers
share one process and one SQLite file, so this is **not multi-replica proof**.

### NEEDS FUNDING

Multi-replica queue, shared object storage, a real backup/restore drill, high availability. Marked
`BLOCKED_EXTERNAL` with the owner action named: provision a shared queue backend and object storage.

---

## 7. Remote compute

### WORKS

A remote ResearchRun worker over HTTP: a lease-queue claim filter, a worker API, and a separate worker
process. Files: `remoteWorker.mjs`, `remoteWorkerApi.mjs`, `remoteWorkerMain.mjs`,
`remoteEngineChild.mjs`, plus the claim filter in `researchRunJobs.mjs` and
`compute/workerInfrastructureContract.mjs`. Worker container images exist for chem-light, structural
and admet behind the gate `railway-scientific-workers.yml`
(`docs/RAILWAY_SCIENTIFIC_WORKERS.md`, `docs/GENESIS_RAILWAY_STAGING.md`).

### TESTED

`remoteWorker.e2e.test.mjs` — a separate worker process claims leases and takes over; `remoteWorkerApi.test.mjs`.
The container gate has **3 green manual runs**.

### HYPOTHESIS

That the same worker runs unchanged on rented infrastructure. **It has never been deployed.**

### NEEDS FUNDING

**There is no GPU and no HPC anywhere in this project.** The owner's decision of 29 September fixes the
wording as "private compute / dedicated workers" and forbids "GPU/HPC". Cost per CPU-hour is
**UNKNOWN**: no hosting invoice exists in the repository. The measurement is specified and unstarted —
the bill for one worker container divided by its CPU-hours, and per-job durations from the `jobs` table
(claim → completion).

---

## 8. The candidate campaign

### WORKS

A campaign machinery exists end to end as software: ranking, self-falsification batteries, a governed
laboratory-handoff request, and sealed decision artefacts with frozen predictions written before the
first number is computed. The GLP-1R work is recorded across D-150 to D-162 in `docs/DECISIONS.md` and
in the sealed artefacts under `packages/backend/src/campaign/`.

### TESTED

`candidateProtocol.test.mjs`, `candidateLabHandoff.test.mjs` (a governed handoff request that survives a
database reopen), `apiLabClosedLoop.test.mjs` and `retrosynthesisHandoff.test.mjs` — the closed loop is
proven **on simulation**, not on a laboratory.

### The measured result, which is negative and is not softened

**D-162** asked whether the GLP-1R functional-agonism model can judge chemistry outside its own series.
Under a **preregistered** distant leader-cluster holdout (Tanimoto cutoff 0.60; maximum test-to-train
nearest-neighbour Tanimoto 0.5991; median 0.4930; compound- and scaffold-disjoint; 28 distinct test
assays; largest single test assay 31.8% of rows):

| Quantity | Value |
|---|---|
| n (test rows) | 88 |
| MAE | 3.4847 |
| RMSE | 3.6454 |
| **R²** | **−13.0013** |
| Conformal half-width | 3.4084 |
| Negative control, train-mean baseline on the same rows | MAE 2.2171, R² −4.9723 |
| Outcome | **`EXTRAPOLATION_NOT_SUPPORTED`** |

The model is **worse than predicting the training mean** on those rows. Source:
`packages/backend/src/campaign/glp1r-d162-applicability-domain.sealed.json` (branch
`g1/candidate-pipeline-2`), preregistration fingerprint `bd0b4a99387913a6`, frozen at `9e5ce31c`.
The artefact states of itself that this is **not** a gate verdict and must never be quoted as
`MODEL_GATE_PASS` or `MODEL_GATE_FAILED`, because the frozen gate names a different split.

**Therefore there is no candidate from that model.** There is no candidate at all: nothing has passed
the Winner Gate (`docs/genesis1/GENESIS-STATUS.md`, area 8: "no candidate"). **6X18 is a GLP-1R
reference structure, not a drug candidate and not a docking target** — the owner refused to register it
as a docking target (D-159). No GLP-1R ResearchRun has ever been executed: the completion matrix
records `GLP-1R ResearchRun — no real run exists, BLOCKED_EXTERNAL`, with RCSB, Reactome, HPA and
ChEMBL hosts denied in this environment.

### PLACEHOLDER — owned by another agent

> The candidate pipeline and the **scientist challenge pack** are owned by the agent working on
> `g1/candidate-pipeline-2` and the D-164…D-168 decision range. **Their result belongs here and is
> deliberately not written by this document.** D-164's own preregistration already fixes the limits
> their result must respect: every molecule its runner builds is a BRICS product with **no measured
> activity and no prior-art check**, and **none may be named a candidate or a lead**; it is not a gate
> verdict, not a model-accuracy measurement and not a nomination.
>
> **Fill in here:** sealed artefact path · outcome string · the in-domain fraction against
> `MIN_IN_DOMAIN_FRACTION = 0.50` · what a funder may and may not conclude from it.

### NEEDS LABORATORY

Everything that would turn any of this into a candidate. **There is no laboratory partner, no wet-lab
agreement and no hardware-verified adapter.** No computational result in this repository has been
measured physically by anyone. A docking score is a `MODEL_ESTIMATE`, not binding proof, and the
engine truth table says so explicitly.

### NEEDS FUNDING

A computational chemist (the roadmap's own item: half a day of a chemist to measure preparation time),
network access to RCSB, ChEMBL, Reactome and HPA, and a registered docking target decided by the owner.

---

## 9. Safety-first methodology

### WORKS

Safety is enforced as gates in code, not as a policy document:

- **Falsification before claim.** The prediction is frozen before execution; the verdict is sealed
  against the preregistration; frozen criteria are immutable once a result exists.
- **Licence gate.** `engineUsePurpose.test.mjs` and `apiCompute.test.mjs` prove that a commercial use
  of ADMET is refused with `BLOCKED_BY_LICENSE` at execution time, and that commercial retrosynthesis is
  refused by admission. **GNINA is excluded from the product** until its licence is settled, even though
  it was used in benchmarking.
- **Commercial release admission** (`commercialReleaseAdmission.mjs`) and the premium-asset acceptance
  gate (`docs/GENESIS_PREMIUM_ASSET_ACCEPTANCE_GATE.md`) are **fail-closed**.
- **Human review is structural.** `researchRunAdvance.test.mjs` proves the loop stops at human review.
  Publishing evidence is a human decision by design.
- **Negative results are published.** Run 8 was published with the verdict `DOES_NOT_GENERALISE` and
  every failure kept in the denominator; D-162 was published as `EXTRAPOLATION_NOT_SUPPORTED`.
- **Honest skips.** A missing engine makes a test skip with `ENGINE_UNAVAILABLE (BLOCKED_BY_RUNTIME)`
  and `GENESIS_REQUIRE_ENGINES` turns a skip into a CI failure, so an absent engine can never be
  mistaken for a passing one.
- **Wording rules** are written down and enforced in review: never "validated", never "signed
  evidence", never "autonomous AI discovers drugs"; engines are third-party tools under their own
  licences and are never described as Genesis's own or as open source.

### TESTED

The gate tests named above, plus `apiCompute.test.mjs`, `engineUsePurpose.test.mjs`,
`reviewerTamperChallenge.test.ts` (a forged copy is caught) and the preregistration-drift refusal in
the benchmark scripts.

### HYPOTHESIS

That this discipline is itself the product's moat. Plausible and unmeasured.

### NEEDS FUNDING / NEEDS LABORATORY

An external pen-test, a security audit, and an independent party willing to try to break the evidence
chain. No external review of any kind has happened. Sandbox attestation is **declared policy enforced
by run arguments, not hardware**, and is labelled as such.

---

## 10. Low-cost decision optimisation

The clearest demonstration of commercial value that does not require discovering anything new: given a
costly intervention, ask whether a cheaper one is **comparable within a preregistered margin**, and
record honestly when it is not.

### WORKS

The LOWER_HARM funnel and the A2 analysis (`runA2Analysis`, `rankForLowerHarm`, `runLowerHarmFunnel`,
`runGovLowerHarmDiscovery`, `buildLowerHarmRecipe`) applied to `CHEMBL4084119` (liraglutide) against a
semaglutide reference, over pinned real clinical-trial data.

### TESTED

`docs/LOWER_HARM_WINNER_SCIENTIFIC_AUDIT.md`, frozen at `8608ccc8`, recomputed by calling the real
unmodified functions. Three ClinicalTrials.gov trials, each inspected per arm:

| NCT ID | n | Candidate HbA1c change | vs. reference | Within the preregistered margin? |
|---|---|---|---|---|
| `NCT03172494` | 341 | −1.71 pp | −0.01 pp | Yes (CI [−0.149, +0.129]) |
| `NCT00518882` | 227 | −1.12 pp | +0.58 pp | **No — worse** |
| `NCT00318461` | 236 | −1.00 pp | +0.70 pp | **No — worse, CI entirely outside the margin** |

The system recorded its own falsification: hypothesis H1 ("comparable efficacy") was revised against
the real failure on `NCT00318461`, and the audit states the disclosed limitation that **all three
comparisons are `NAIVE_INDIRECT`** — none of the candidate's own trials contains a reference arm, so
every comparison is against the reference's arm from a different trial, with possibly different
population, dose and follow-up.

### HYPOTHESIS

That a public payer or health system would pay for this analysis. Untested; no public body has been
approached with it.

### NEEDS LABORATORY / external validation

Nothing here is a clinical conclusion. An indirect comparison across trials is not evidence of
equivalence, the audit says so, and this document does not upgrade it.

### NEEDS FUNDING

A real policy or payer dataset under agreement, and a health economist. **Money saved: UNKNOWN** —
no cost model, no payer prices and no volumes exist in the repository.

---

## 11. The 2x KPI

**Status: `TARGET_2X_NOT_YET_BENCHMARKED`.**

### The definition being built against

> 2x faster means Genesis needs **at most 50%** of the competitor benchmark time for the **same task
> scope** under a **comparable evidence standard**.

```
GENESIS SPEEDUP = competitor_time / genesis_time
GREEN            only when speedup >= 2.0 AND the task scope matches AND the evidence standard matches
```

A speedup obtained by skipping falsification, skipping Replay, lowering what counts as Evidence,
skipping provenance, shrinking the task scope against an old baseline, or swapping in an easier
benchmark is **not a speedup** — it is a smaller task. The protocol lists these as a cheating list with
how each is detected.

### WORKS

Instrumentation **inside** the canonical loop, not beside it: `packages/backend/src/discoveryTiming.mjs`,
schema **v17** in `store.mjs`, writes inside the loop's own transactions, so a step that rolls back
leaves no timing behind. Ten stages with named open and close boundaries, four clocks with **queue time
and human-wait time kept apart from compute**, append-only tables enforced by triggers
(`discovery_stage_marks` with a UNIQUE index for one OPEN and one CLOSE per scope and stage,
`discovery_stage_facts`, `discovery_competitor_baselines` with every provenance column `NOT NULL` and
`CHECK`ed non-empty, `discovery_timing_campaign_links`). A stage nobody entered is **absent** from the
report, never reported as zero. Two read-only routes in `api.mjs`. Protocol:
`docs/benchmark/TIME-TO-DISCOVERY.md` (branch `g1/timing-integrated`), decision **D-163**.

### TESTED

`discoveryTiming.test.mjs`, including the **no-competitor-data invariant**: `genesisSpeedup()` returns
the literal string `TARGET_2X_NOT_YET_BENCHMARKED` with `speedup: null` and `green: false` for **every**
stage, even when the Genesis side is fully measured and even when a caller supplies its own Genesis
number, task scope and evidence standard. There is **no code path** from an empty
`discovery_competitor_baselines` to a speedup number, to `GREEN`, or to any statement that the target has
been met, and the test fails if one is ever introduced.

### HYPOTHESIS

That Genesis is faster at all. **This is a target, never an achievement.**

### Why no speed claim may be made, in one line

**There is no credible competitor time measurement anywhere** — not in this repository and not in any
cited source. So: **competitor time UNKNOWN**, **speedup UNKNOWN**, status
`TARGET_2X_NOT_YET_BENCHMARKED`.

### NEEDS FUNDING

An external computational chemist measured by stopwatch on the same declared, hashed task scope, with
active human time logged apart from compute time, under the comparable evidence standard the protocol
defines. That one measurement is what makes the first honest 2x statement possible — in either
direction. Until the row and its provenance are recorded, the status string **is** the claim.

---

## 12. Current measured completion

From `docs/genesis1/GENESIS-STATUS.md` (3 Oct 20:40 UTC), continuing the 11-area table of
`docs/evidence/GENESIS-CENTRAL-AUDIT-2026-10-03.md` §6. These are judgements from named evidence, about
**±10 points**, and none of them measures customers or revenue.

| Measure | Value |
|---|---|
| Verified production completion (main) | **66%** |
| Edison-class functional parity (a gap judgement, not a parity or superiority claim) | 60% |
| Monetization readiness (portfolio) | **30%** |
| · fastest single offer (Genesis Verify) | 55% |
| Investment readiness | **44%** |
| Label | **PRE-REVENUE, NOT YET INVESTMENT READY** |

| # | Area | Edison | Verified | Audit |
|---|---|---|---|---|
| 1 | ResearchRun | 65 | 76 | 72 |
| 2 | Evidence / Replay / provenance | 90 | 84 | 80 |
| 3 | BYT / persistent state | 80 | 76 | 75 |
| 4 | Hypotheses / falsification | 70 | 82 | 80 |
| 5 | NL → code → sandbox | 55 | 74 | 70 |
| 6 | Literature / data | 35 | 60 | 55 |
| 7 | Engines / workflows | 70 | 70 | 68 |
| 8 | Candidate → lab handoff | 35 | 35 | 35 |
| 9 | Science Flight Control | 70 | 65 | 55 |
| 10 | UI / product | 55 | 65 | 65 |
| 11 | Scaling / enterprise | 30 | 34 | 30 |
| | **Mean** | **60** | **66** | **62** |

Investment-readiness dimensions, same source: Technology 70 · Science 55 · Proof 55 · Product 40 ·
Operations 35 · Security 50 · **Commercial 10** · **Economics 15** · Scaling 30 · Due diligence 60 ·
Moat 45 · Roadmap 60.

**Engine truth** (`docs/evidence/consolidation/engine-truth-2026-10-03.md`), stated per column and never
inferred from another:

| Engine | ResearchRun | Queue | Artifact | Replay | Product | Status |
|---|---|---|---|---|---|---|
| RDKit | YES | YES (single node) | YES | MATCH | BSD-3-Clause, admission not exercised | GREEN |
| PySCF | YES (RHF, ≤12 atoms, STO-3G/3-21G/6-31G) | YES | YES | MATCH | Apache-2.0 | GREEN |
| Vina / Meeko | YES (receptor hash frozen) | YES | YES | MATCH (score is a `MODEL_ESTIMATE`) | licence review not confirmed | GREEN for execution; product eligibility NOT_VERIFIED |
| OpenMM | YES (TIP3P water box only) | YES | YES | **NOT_APPLICABLE — no replayer, none claimed** | MIT/LGPL | **PARTIAL** |
| ADMET-AI | YES | YES | YES | MATCH | **COMMERCIAL_PRODUCT = BLOCKED_BY_LICENSE** (tested) | technical validation only |
| Retrosynthesis (AiZynthFinder) | NO | NO | NO | NOT_VERIFIED | technical validation only | **BLOCKED_BY_RUNTIME** |
| GNINA | benchmark only | — | — | — | **product admission BLOCKED** | must not appear in the product |

---

## 13. The exact blockers

Each line is a single, checkable thing. None is a research problem.

| # | Blocker | Class | Who unblocks it |
|---|---|---|---|
| B1 | Production serves `37197555` and the **domain points at a parking page**, so no claim is customer-reachable. `production-smoke.yml` has 0 runs. | NEEDS FUNDING (operations) | Owner — deploy and point the domain; then run the smoke workflow |
| B2 | **No signing key.** Everything is UNSIGNED. | NEEDS FUNDING (one owner action) | Owner — `docs/keys/OWNER-CSRN-KEY-COMMANDS.md` |
| B3 | **No laboratory partner, no hardware-verified adapter.** | **NEEDS LABORATORY** | External party |
| B4 | **No candidate.** D-162 `EXTRAPOLATION_NOT_SUPPORTED`; nothing passed the Winner Gate; 6X18 stays a reference structure (D-159). | NEEDS LABORATORY + funding | Chemist + lab + network access |
| B5 | **Commercial ADMET blocked by licence**; **retrosynthesis blocked by runtime**; **GNINA blocked for product**; RDKit / Vina / PySCF CONDITIONAL until shipped distributions are pinned. | NEEDS FUNDING (licences) | Owner + licence holders |
| B6 | **Single node.** One SQLite file, local artifact storage, **no backup/restore drill**, no multi-replica queue, no shared object storage. | NEEDS FUNDING | Infrastructure spend |
| B7 | **No enterprise controls:** no SSO/OIDC/SAML, SCIM, MFA, API keys, billing or metering, KMS, SOC 2 / ISO evidence, SLA, HA, data residency, pen-test. `ENTERPRISE_BLOCKED`. | NEEDS FUNDING | Security programme |
| B8 | **No commercial entity to invoice from** (the company is planned after Hub71), no SOW, no terms. | NEEDS FUNDING (legal) | Owner |
| B9 | **No competitor time measurement**, so no speed claim. | NEEDS FUNDING (one external measurement) | External computational chemist |
| B10 | **No real model in the loop in any test**; plans are frozen fixtures. | NEEDS FUNDING | Provider budget + metering |
| B11 | **LLM tokens are not metered anywhere** and **no hosting invoice exists**, so unit economics are UNKNOWN. | NEEDS FUNDING | Owner — one billing export |
| B12 | **Network access denied** in this environment for zenodo.org, files.rcsb.org, files.wwpdb.org, www.ebi.ac.uk and pdbj.org, which is why literature raw fixtures are synthetic in provider format and Run 9's data had to be obtained separately. | NEEDS FUNDING (environment) | Owner — network allowlist |
| B13 | **Playwright E2E specs do not run in CI**; real phones untested. | NEEDS FUNDING | CI runner budget |
| B14 | **Two lab memories and ~15 unmapped epistemic vocabularies**; frontend and backend hash chains are not one library. | NEEDS FUNDING (engineering) | Engineering time |

### The one thing that is not a blocker

The long frozen experiment **Run 9** started at **18:30Z on 3 October** and is **still computing**. Its
status is **`IN_PROGRESS / FROZEN / PRE-REGISTERED`** and it is **never a result**. Its preregistration
is sealed in two stages — seal A `run9-ranking-prereg.json`, fingerprint
`7f9981173699aa917fa3299c904c23a8749a656b0720200a48caee0d2c017762`, frozen on the owner's word of
3 Oct 00:14Z; seal B `run9-seal-b.json` fixing the 300-case list, the file hashes, the code hashes and
the selected ranker C1(0.7) before anything was docked. Verdict bands were fixed in advance:
`GENERALISES` needs ≥ +3.0 points over the Run 8 rule with p < 0.05 on a paired McNemar test and no loss
on at least 4 of 5 seeds; `DOES_NOT_GENERALISE` is ≤ +1.0 point or a loss on ≥ 2 seeds; anything else is
`PARTIAL`. The frozen prediction is +1.5 to +4.0 points, most likely `PARTIAL`. A product-eligible arm
**without GNINA** carries its own verdict, and any ranker using GNINA stays out of the product whatever
it scores. **This document does not touch that preregistration and does not disturb the run.**
Run 8's verdict `DOES_NOT_GENERALISE` stands, and PoseBusters is now a development set, so nothing
measured on it can validate anything.

---

## 14. Roadmap and the milestones that drive budget

Phases from the owner's roadmap `/mnt/project-files/granty/roadmapa-monetyzacji-2026-09-30.md`
(30 September) and the price sheet `/mnt/project-files/granty/monetyzacja-source-of-truth-2026-09-29.md`.
**Every price below is verbatim from the price sheet and is an initial pricing hypothesis to be
validated with first customers.** Where the sheet has no price, the line reads *commercial hypothesis,
no price*.

### M1 — Reachable production and the first invoiceable service (budget driver: operations + legal)

Deploy past `37197555`, point the domain, run the production smoke; generate the CSRN key; an invoicing
entity; a one-page SOW built from the Verify report's own NOT-checked list; licence confirmation for
RDKit, Vina and PySCF in this use. **Deliverable:** Genesis Verify sellable as a supervised audit,
**€3k–€8k / audit**. **Success criterion:** one LOI or one paid Verify or Benchmark engagement.
**Cost: UNKNOWN** — no quotes exist in the repository.

### M2 — Engines live and the first measured unit cost (budget driver: compute + a chemist)

One remote worker deployed with Vina or ADMET verified on production; a half-day chemist measurement of
preparation time; token metering switched on; one hosting invoice divided by CPU-hours.
**Deliverable:** Discovery Sprint honestly sellable, **€10k–€25k / pilot (subject to runtime
availability)**, and the first real € per CPU-hour. **Until this milestone, no "percent saved" number
of any kind may be stated.**

### M3 — Evidence Platform pilot (budget driver: infrastructure)

Managed database with a real backup/restore drill, shared object storage, a tenant model, API keys.
**Deliverable:** **€30k–€80k / year** annual pilot with a customer who already bought an audit.

### M4 — The external time measurement (budget driver: one external expert)

An external computational chemist runs the declared, hashed task scope by stopwatch under the
comparable evidence standard; the baseline row is recorded with full provenance. **Deliverable:** the
first honest statement about speed, in either direction, replacing
`TARGET_2X_NOT_YET_BENCHMARKED`. **This is the single cheapest milestone with the largest effect on
the pitch, and it is not blocked by code.**

### M5 — Laboratory handoff (budget driver: a partner and physical work)

A laboratory partner, a hardware-verified adapter, and one physical measurement of one computational
prediction. **Deliverable:** the first result in this project that is not a computation.
**NEEDS LABORATORY.** Price line in the sheet: Discovery Partnership **€100k–€300k+ / programme**,
offered only after pilots.

### M6 — Public-sector pilot (budget driver: procurement and legal)

One unpaid demonstration of the D-063 claim audit on a public body's **own** published claim, then a
paid pilot: **€10k–€30k / pilot** for D-063 Public Evidence or CLOCKWORK.

### M7 — Enterprise (budget driver: a security programme)

SSO, MFA, SCIM, API keys, billing, KMS, backup and HA, pen-test, compliance evidence.
**Deliverable:** Genesis Enterprise, **€80k–€200k+ / year**. Estimated 6–12 months after the
infrastructure decisions; **not before M3**.

### Not on the roadmap, deliberately

Cyber, earthquake and hazard verticals, CICADA, Sovereign, Radiology and Education. The price sheet
lists conditional hypotheses for them in §4; all are conditional on real data and external validation,
and none is offered. Mirror, OMNICORE / 9D / Supreme, speculative physics, GNINA as a product
dependency and a self-driving laboratory without a hardware-verified adapter are excluded outright.

---

## 15. Every UNKNOWN in this document

A funder should be able to see, in one place, exactly which numbers do not exist. None of these was
estimated.

| # | The number that does not exist | Why it does not exist | How it would be obtained |
|---|---|---|---|
| U1 | **Competitor time** for any task scope | No baseline measurement exists anywhere in the repository or any cited source | §11's protocol: an external chemist, stopwatch, hashed task scope |
| U2 | **Genesis speedup** against anything | Follows from U1 | Same |
| U3 | **€ per CPU-hour** | No hosting invoice is in the repository | One worker-container bill ÷ its CPU-hours |
| U4 | **LLM tokens and token cost per run** | Tokens are not metered anywhere in Genesis | Provider usage export + per-run metering |
| U5 | **Operator and reviewer hours per Verify audit** | Never delivered to a customer | Log hours on the first engagement |
| U6 | **Margin on any offering** | Follows from U3–U5 | Same |
| U7 | **Artifact storage bytes per run** | Never measured | Measure DB and artifact bytes for a run |
| U8 | **Cross-machine bit-for-bit reproducibility** | Only same-host determinism was demonstrated | Repeat a sealed run on different hardware |
| U9 | **Cost of each roadmap milestone** | No quotes, no salaries, no infrastructure pricing in the repository | Owner — collect quotes |
| U10 | **Money saved by the low-cost decision analysis** | No cost model, no payer prices, no volumes | A payer dataset and a health economist |
| U11 | **Enterprise dedicated-infrastructure cost** | The dedicated deployment has not been designed | Architecture + quotes |
| U12 | **Government Drug Discovery, Policy Evaluation readiness percentages** | Never separately assessed | A separate audit pass |
| U13 | **Whether the live production site answers a request** | The domain points at a parking page; the smoke workflow has 0 runs | Deploy, then run `production-smoke.yml` |
| U14 | **Run 9's verdict** | The run started 18:30Z on 3 Oct and is still computing | Wait. It is `IN_PROGRESS / FROZEN / PRE-REGISTERED` |
| U15 | **Any clinical, binding or physical measurement of any Genesis output** | No laboratory partner, no physical experiment ever performed | **NEEDS LABORATORY** |

---

## 16. What this document refuses to claim, and why

| Refused claim | Why |
|---|---|
| "Faster than X", "2x faster", "cuts time by N%" | U1, U2. The status string `TARGET_2X_NOT_YET_BENCHMARKED` is the claim. |
| "A candidate", "a lead", "a drug" | D-162 `EXTRAPOLATION_NOT_SUPPORTED`; nothing passed the Winner Gate; D-164's own preregistration forbids naming its products candidates. |
| "6X18 is our candidate / our docking target" | D-159: it is a GLP-1R **reference structure**; the owner refused to register it as a docking target. |
| "Validated", "clinically proven" | Verdicts are within one frozen protocol. Replay proves reproduction, not truth. No external validation of any kind exists. |
| "Signed evidence" | No signing key. Everything is UNSIGNED. The phrase is **"fingerprints and replay"**. |
| "Our engines", "open-source engines" | RDKit, PySCF, Vina/Meeko, OpenMM, ADMET-AI and AiZynthFinder are third-party tools under their own licences. Genesis sells the workflow, not the engines. |
| "Autonomous AI that discovers drugs" | The loop stops at human review by design, and there is no candidate. |
| "Genesis will cure disease" | Out of scope and unsupportable. |
| Any Run 9 outcome | `IN_PROGRESS / FROZEN / PRE-REGISTERED`. |

## 17. The positioning, in one sentence

**Genesis shortens and lowers the cost of discovering and verifying hypotheses** — by freezing the
prediction before the computation, keeping the provenance tamper-evident, replaying the computation on
demand, and publishing the failures. It does not promise a cure for anything.
