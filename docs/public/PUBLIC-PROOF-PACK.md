# Genesis — public proof pack

**Safe to show publicly.** Everything here is either running code in this repository, a passing test,
or a committed evidence file — or it is labelled as a target, a limitation, or something that does not
exist yet. Nothing in this document is a medical, clinical or commercial promise.

**Date:** 2026-10-04 · Production serves commit `37197555`; whether the live site answers a request is
**unverified**, because the domain currently points at a parking page.

---

## 1. What Genesis is

Genesis is a scientific workflow system with one loop and one memory. A question becomes hypotheses;
each hypothesis becomes a protocol whose prediction is **frozen before anything is computed**; a real
computational engine executes it; the result is sealed against that frozen prediction; the whole thing
is recorded with tamper-evident provenance and can be **replayed** afterwards by someone else; and the
system then proposes the next experiment, which a human reviews.

**The positioning, in one sentence: Genesis shortens and lowers the cost of discovering and verifying
hypotheses.** It makes a computational claim cheap to check and expensive to fake. It does not promise
to cure any disease, and it will never claim to cure every disease.

What Genesis is **not**: it is not a laboratory, it is not a medical device, it is not a decision-maker.
The loop stops at human review by design.

---

## 2. The problem

A computational result in chemistry or biology usually arrives as a number in a document. The reader
cannot tell whether the number came from the stated program with the stated inputs, whether it would
come out the same way twice, whether the criterion for success was chosen before or after the result
was seen, or whether the failures were counted. Re-checking it means rebuilding someone else's pipeline
from a methods paragraph.

Genesis's answer is procedural rather than clever: freeze the prediction first, hash everything, keep
every failure in the denominator, and ship the computation in a form that can be re-run.

---

## 3. How a ResearchRun proceeds

```
question
  → formalised problem
  → plan and hypotheses (at most 6 per run)
  → PREDICTIONS FROZEN  ← the preregistration, fingerprinted, before any computation
  → engine execution on the durable queue
  → verdict sealed against the frozen prediction
  → Evidence PROPOSED
  → Replay
  → a justified next experiment
  → human review
```

The verdict vocabulary is deliberately narrow: **`SUPPORTED_WITHIN_PROTOCOL`**,
**`FALSIFIED_WITHIN_PROTOCOL`**, **`INCONCLUSIVE`**. A verdict is a statement about one frozen
protocol — never a statement that something is true in the world.

Each run and each step is written into a hash-chained state, so a later edit is detectable. A protocol's
criteria become immutable the moment a result exists.

---

## 4. The real engines

These are **third-party scientific programs, each under its own licence**. They are not Genesis's own
software, and Genesis makes no statement about their distribution terms beyond what each engine's own
licence says. Genesis does not sell engines; it runs them inside one audited workflow.

| Engine | What it does here | State |
|---|---|---|
| **RDKit** | molecular descriptors, cheminformatics | works, replays (MATCH) |
| **PySCF** | quantum chemistry, RHF single points (small molecules: up to 12 atoms, STO-3G / 3-21G / 6-31G) | works, replays (MATCH) |
| **AutoDock Vina** (with Meeko) | molecular docking; the receptor hash is frozen and a preparation drift is refused | works, replays (MATCH). A docking score is a **model estimate**, not a measurement of binding |
| **ADMET-AI** | property estimation | works technically, replays (MATCH); **commercial use is blocked by its licence**, enforced in code |
| **OpenMM** | molecular dynamics | **partial only**: a TIP3P water-box reference system. No protein–ligand dynamics, and **no replayer exists, so none is claimed** |
| **Retrosynthesis (AiZynthFinder)** | synthesis routes | **blocked by runtime**: the model files are not installed, and it is in no continuous-integration job |

A missing engine never looks like a success: a test without its engine is **skipped** with
`ENGINE_UNAVAILABLE (BLOCKED_BY_RUNTIME)`, and setting `GENESIS_REQUIRE_ENGINES` turns that skip into a
build failure.

---

## 5. Falsification

The prediction is written down and fingerprinted before the computation runs, so a result cannot be
turned into a success afterwards by moving the criterion. Two published consequences:

- **A published negative result.** A preregistered docking benchmark over 308 unseen cases (Run 8)
  returned the verdict **`DOES_NOT_GENERALISE`**, with every failure kept in the denominator (top-1
  204/308 for the rescoring arm against 202/308 for the baseline). It was published as it came out.
  The dataset it used is now treated as a development set, so nothing measured on it can establish
  anything new.
- **A published collapse of our own model.** See §9.

The benchmark scripts recompute their preregistration fingerprint and **refuse to run** if the protocol
has drifted by a single byte.

---

## 6. Evidence

An **Evidence Pack** is built over the records a run already keeps: it rejects a mutated parameter, a
mutated dataset, a mutated artifact, a changed verdict, a changed engine identity, and missing
provenance. On top of it, a verification report performs six checks on a single submitted record:
readability, the file hash against the hash its holder was given, required provenance, recomputed
canonical hashes of the inputs and outputs, a field-by-field comparison against the copy in the
hash-chained state, and a real replay. The report is one self-contained page carrying the verdict, the
hashes, **an explicit list of what was not checked**, and its own fingerprint.

**Evidence packages carry fingerprints and a replay, and they are UNSIGNED.** There is no signing key
in this project. The correct phrase is **"fingerprints and replay"** — and that is the only claim made
about them anywhere.

---

## 7. Replay

Replay re-executes a recorded computation and compares the result to what was recorded. It returns one
of three verdicts: **MATCH**, **DRIFT**, **TAMPERED**.

**Replay tells you whether a computation reproduces. It does not tell you whether the computation is
right.** That distinction is stated in every report Genesis produces.

Replay exists for four engines (RDKit, PySCF, Vina, ADMET-AI). It does not exist for OpenMM.

---

## 8. The autonomous next experiment, remote workers, laboratory handoff

**The next experiment.** After a verdict, the run records a justified next experiment and can execute it
on the queue, linking it to its parent. It then **stops at human review**. Nothing publishes itself.

**Remote workers.** A separate worker process can claim work from the durable lease queue over HTTP and
take over a lease, so computation can move off the machine that holds the state. Worker container images
exist for light chemistry, structural and property workloads. **There is no GPU and no high-performance
computing cluster in this project**, and no worker has been deployed to rented infrastructure yet; the
honest description is "private compute and dedicated workers".

**Laboratory handoff.** A governed handoff request exists and survives a database restart, and the
closed loop has been exercised — **on simulation**. **There is no laboratory partner, no wet-lab
agreement and no hardware-verified adapter.** No computational output of this project has ever been
measured physically by anyone.

---

## 9. The GLP-1R work, as the worked example

This is the example because of what it found, not in spite of it.

**What was asked.** Whether a model fitted to GLP-1R functional-agonism data can judge chemistry that
lies outside its own chemical series. The split, the thresholds, the controls and the prediction were
all written down and fingerprinted first (preregistration fingerprint `bd0b4a99387913a6`).

**What was measured.** A distant leader-cluster holdout (Tanimoto cutoff 0.60; maximum test-to-train
nearest-neighbour similarity 0.5991, median 0.4930; compound-disjoint and scaffold-disjoint; 28
distinct test assays; no single assay more than 31.8% of the test rows):

| Quantity | Value |
|---|---|
| Test rows (n) | 88 |
| Mean absolute error | 3.4847 |
| **R²** | **−13.0013** |
| Negative control (predicting the training mean), same rows | MAE 2.2171, R² −4.9723 |
| Outcome | **`EXTRAPOLATION_NOT_SUPPORTED`** |

**The model is worse than predicting the training average on those rows.** That is the finding, it is
published, and it is not softened. The recorded outcome also says explicitly that this probe used the
preregistered distant split rather than the model's own frozen gate, so it must not be quoted as a gate
pass or a gate failure.

**The consequence, stated plainly: there is no candidate from that model.** Nothing in this project has
passed its winner gate, so there is **no candidate at all** — and therefore no candidate identifier, no
fingerprint, no mechanism and no result to show. **6X18 is a GLP-1R reference structure. It is not a
drug candidate and it is not a docking target** — a decision in this repository explicitly refuses to
register it as one. No GLP-1R research run has ever been executed here; the structural and
bioactivity data hosts it would need are blocked in this environment.

**If a candidate ever exists**, this is the only form in which it will appear in public material: a
**candidate identifier, a fingerprint, the mechanism, the methodology, the results and the Replay
proof**. Never a full structure, never a SMILES string, never an InChI — anything potentially
patentable is held under **`IP_REVIEW_REQUIRED`**.

> **Placeholder — another team member owns this.** The candidate pipeline and the scientist challenge
> pack are being produced separately and are not written here. Whatever they produce inherits the
> limits above: the molecules their generator builds are combinatorial products with no measured
> activity and no prior-art check, and none of them may be called a candidate or a lead.

**A second, different example** of the same discipline, on existing medicines rather than new ones: an
audit of a lower-cost substitution question over three real clinical trials recorded one genuine
failure — in one trial the candidate medicine's confidence interval fell **entirely outside** the
preregistered margin in the worse direction — and revised its own hypothesis accordingly. The audit
also discloses that all three comparisons are indirect, because none of the candidate's own trials
contained a reference arm. That disclosure is part of the result, not a footnote to it.

---

## 10. Speed: a target, not an achievement

**`TARGET_2X_NOT_YET_BENCHMARKED`**

The target, as defined in the protocol: Genesis would need **at most 50% of a competitor benchmark
time** for the **same task scope** under a **comparable evidence standard**.

**No speed advantage is claimed, because there is no competitor time measurement anywhere** — not in
this repository and not in any cited source. The competitor time is unknown, so the speedup is unknown.

What does exist is honest instrumentation of Genesis's **own** time, written inside the research loop's
own database transactions rather than beside them: ten stages with named boundaries, four clocks that
keep **queue time and human waiting time separate from compute time**, and append-only tables enforced
by database triggers. A stage nobody entered is **absent** from the report rather than reported as zero.

The indicator is wired shut on purpose: it returns the literal string
**`TARGET_2X_NOT_YET_BENCHMARKED`** with a null speedup for **every** stage, even when Genesis's own
side is fully measured and even when a caller supplies its own numbers. There is no code path from an
empty baseline table to a speed number or to a green status, and a test fails the build if anyone ever
introduces one.

A speedup obtained by skipping falsification, skipping Replay, lowering what counts as evidence,
dropping provenance, shrinking the task scope against an old baseline, or swapping in an easier
benchmark would not be a speedup. It would be a smaller task. The protocol lists those as cheats and
says how each is detected.

---

## 11. The test results

These are the proofs behind the sections above. Every one is a passing test or a committed evidence
file in this repository.

| What is proven | Proof |
|---|---|
| One run from question to memory recall, with a **worker crash, a restart and a recovery**, ending with the same frozen fingerprint and the same experiment identity, two executions, two artifacts, and replay MATCH after the restart | `goldenResearchRun.e2e.test.mjs` |
| Five real engines through the research route and the durable queue, twice each: frozen prediction, real execution, both a supported and a falsified verdict, replay, database reopen, and **no second execution** | `researchRunEngines.real.test.mjs` |
| Verification of a submitted record: a valid bundle → MATCH with all six checks passing; one edited number → **TAMPERED** with no replay attempted; a forgery whose hash was recomputed → TAMPERED via the file hash and the chain anchor; a record missing its engine and preregistration → BLOCKED; unreadable input → BLOCKED | `genesisVerify.test.mjs` (real RDKit) |
| Twelve persistence requirements with real `SIGKILL` and a real engine: identity, durable state, lineage, no duplicate execution, idempotency, truncation and tamper detection, a schema migration, **six processes racing for one job**, **two server instances on one database** | `bytVerification.test.mjs`, `bytRecovery.e2e.test.mjs` |
| 32 child jobs across 4 concurrent workers: 31 succeeded, 1 isolated to a dead-letter queue, each executed exactly once | `scientificFanOut.test.mjs` |
| Artifact custody: stored, verified, survives a restart; a truncated or deleted artifact is **rejected**; a failed store is retried **without a second execution**; a cancelled run stores nothing | `researchRunArtifacts.test.mjs` |
| An Evidence Pack rejects mutated parameters, data, artifacts, verdicts and engine identity, and missing provenance | `researchRunEvidencePack.test.mjs` |
| A separate worker process claims and takes over leases over HTTP | `remoteWorker.e2e.test.mjs` |
| Commercial use of the property-estimation engine is **refused at execution time** by the licence gate | `engineUsePurpose.test.mjs`, `apiCompute.test.mjs` |
| A tamper challenge detects a forged copy and an unanchored forgery of a published claim | `reviewerTamperChallenge.test.ts` |
| Generated analysis code runs in a real container sandbox, with a proven timeout cleanup | `dockerScientificSandboxBackend.test.mjs`, `scientificSandboxRuntime.test.mjs` |
| Determinism within one machine: two independent runs with different worker counts, **byte-identical output**, and an exact reproduction of a previously published benchmark count | `docs/evidence/run9/run9-seal-b.json` |
| A one-command reproducibility check of twelve values committed in the repository, which **fails** on a silent edit of pinned data | `node scripts/repro-demo.mjs`, `docs/REPRODUCIBILITY_PACK.md` |

---

## 12. Limitations

Stated here rather than discovered later.

1. **No external verification of anything.** No independent party has checked any result, and no result
   has ever been measured physically. There is no laboratory partner.
2. **No candidate.** Nothing has passed the winner gate, and the one efficacy model that was probed
   outside its own series collapsed (§9).
3. **Evidence packages are UNSIGNED.** There is no signing key. Fingerprints and replay only.
4. **No speed claim is possible.** No competitor time exists (§10).
5. **One machine.** One database file, local artifact storage, no backup-and-restore drill, no
   multi-replica queue, no shared object storage. Every resilience proof above is single-node.
6. **Engine limits.** OpenMM is a water-box reference with no replay; retrosynthesis does not run;
   commercial use of the property-estimation engine is licence-blocked; the docking rescoring tool used
   in benchmarking is excluded from the product until its licence is settled. A docking score remains a
   model estimate.
7. **No language model in the loop in any test.** Plans in tests are frozen fixtures served by a local
   stand-in, so the reasoning step is not what the tests cover.
8. **At most six hypotheses per run**, no multi-hypothesis loop without a human, and uncertainty is
   deliberately left uncalibrated.
9. **Literature is metadata only** — no full text, no passage-level review, no source-quality scoring at
   scale — and in this environment several data hosts are blocked, so some stored provider fixtures are
   synthetic in the provider's format rather than live captures.
10. **Not reachable in production.** Production serves commit `37197555`, the domain points at a parking
    page, and the production smoke workflow has never run.
11. **No customers, no letters of intent, no revenue.** Any price discussed elsewhere is an initial
    hypothesis to be tested with first customers.
12. **A long preregistered experiment is still computing.** It began at 18:30Z on 3 October 2026 and its
    status is **`IN_PROGRESS / FROZEN / PRE-REGISTERED`**. It is not a result, and nothing about its
    outcome may be inferred. Its verdict bands, its 300-case list, its file hashes and its selected
    ranking rule were all sealed before anything was computed.
13. **Container sandbox attestation is declared policy enforced by run arguments, not hardware**, and is
    labelled that way wherever it appears.

---

## 13. How to check this yourself

```bash
npm ci
node scripts/repro-demo.mjs
```

No keys, no network. Twelve checks against values committed in this repository, and a non-zero exit code
on any divergence. `docs/REPRODUCIBILITY_PACK.md` documents the case where it refuses and exits 1
because pinned data was quietly edited — the point being that it can fail.

---

## 14. The sentence to take away

**Genesis shortens and lowers the cost of discovering and verifying hypotheses** — by freezing the
prediction before the computation, keeping provenance tamper-evident, replaying computations on demand,
and publishing the failures. The speed target is a target. The evidence is fingerprinted and
replayable, and unsigned. There is no candidate. And there is no claim here that any disease has been,
or will be, cured.
