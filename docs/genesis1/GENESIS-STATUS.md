# GENESIS STATUS

One file, updated in place. Do not start a
second copy: edit this one and change the
header.

DATE: 2026-10-03 (Saturday)
TIME: 20:40 UTC
MAIN SHA: 09147752 (merge of PR #75)
PRODUCTION SHA: b3be8635
(`git ls-remote origin railway-production-ready`,
checked 20:30 UTC; deploy of main 23cd1340,
29 Sep). Main is 361 commits ahead.
IN REVIEW: c4810531 (PR #78, 25 commits on
top of main) · PR #77 (other thread)
ACTIVE AGENTS: <coordinator fills this line>

---

## Headline

| Measure | Now |
|---|---|
| Edison functional parity | **60%** |
| Verified production completion | **66%** main |
| · after PR #78 (if CI green) | 67% |
| Monetization readiness | **30%** |
| · fastest offer (Verify) | 55% |
| Investment readiness | **44%** |
| Label | PRE-REVENUE, NOT YET INVESTMENT READY |

All numbers are judgements from the evidence
named below, about ±10 points. None is a
measurement of customers or revenue: there are
**no customers, no LOI and no revenue**.

---

## Release status

- Production: b3be8635 (29 Sep). Nothing from
  30 Sep onwards is live: no queue, no five
  engines, no Evidence Pack, no Flight Control
  screen, no Genesis Verify.
- Main 09147752: CI green on every job
  (`verify`, container smoke, real engines
  through ResearchRun, real sandbox, PySCF
  benchmark, data anchors).
- PR #78 (c4810531): BYT verification, Genesis
  Verify screen, evidence ledger on SQLite,
  pre-migration DB snapshot, recovered work.
  CI: 8 jobs green, `verify` still running at
  20:30 UTC.
- PR #77: ResearchRun jobs in killable child
  processes, queued advance. Open.
- Deploy only on the owner's "wdrażaj".
- `production-smoke.yml` exists (7456c4c1)
  but has **0 runs**: no deploy since.
- CSRN key not generated: every certificate
  and Verify report is **UNSIGNED**. Say
  "fingerprints and replay", never "signed
  evidence".

---

## How to read the two area numbers

**EDISON FUNCTIONAL PARITY %** — how much of
the function an AI-scientist product of the
Edison/Kosmos class offers in this area exists
in Genesis in some working form. Scale is not
counted (Kosmos-class runs read thousands of
papers and run hundreds of analyses per run,
per the owner's roadmap note
`roadmap/podzial-pracy-3-AI-2026-09-30.md`
outside the repo; Genesis runs at most 6
hypotheses per run).
This is a functional gap judgement, **not a
verified parity or superiority claim**
(same rule as
`docs/astra/KOSMOS_GAP_AND_30_DAY_DOD.md`).

**VERIFIED PRODUCTION COMPLETION %** — strict.
Counts only what has a real implementation, an
integration or E2E test, green CI on main, and
builds into the production container. A spec,
a UI card or a mock is not 100%. Work on an
open PR is shown as "→ after #78", not counted.
Deployed-to-production is reported separately
(Release status), because almost nothing new
is deployed.

**Baseline.** This continues the 11-area table
in `docs/evidence/GENESIS-CENTRAL-AUDIT-2026-10-03.md`
§6 (main c68e71f9: 62% functional). The
"~78–82% parity" table was searched for
(`grep parity/Edison` in `docs/`, `git log -S
Edison --all`, project files) and **is not in
the repository**; if it exists in a chat, it
was not on a comparable scale. "Audit" below =
that §6 value.

---

## The 11 areas

| # | Area | Edison | Verified | Audit |
|---|---|---|---|---|
| 1 | ResearchRun | 65 | 76 | 72 |
| 2 | Evidence/Replay | 90 | 84 | 80 |
| 3 | BYT | 80 | 76 | 75 |
| 4 | Hypotheses | 70 | 82 | 80 |
| 5 | NL→code→sandbox | 55 | 74 | 70 |
| 6 | Literature/data | 35 | 60 | 55 |
| 7 | Engines | 70 | 70 | 68 |
| 8 | Lab handoff | 35 | 35 | 35 |
| 9 | Flight Control | 70 | 65 | 55 |
| 10 | UI/product | 55 | 65 | 65 |
| 11 | Scaling/enterprise | 30 | 34 | 30 |
| | **Mean** | **60** | **66** | **62** |

Backend tests are in `packages/backend/src/`,
frontend tests in
`packages/frontend/src/__tests__/`.

### 1 · ResearchRun
Edison 65 · Verified 76 (audit 72)
- Question → plan → frozen prediction →
  engine → verdict → Evidence PROPOSED →
  Replay → next experiment, with a worker
  crash and restart.
- New on main: fan-out (bounded child runs on
  the real queue, lineage, retry, cancel
  propagation); advance (executes the recorded
  justified next step, links it with
  EXPERIMENT_CONTINUED, stops at human review);
  pause/resume/cancel reach the lease queue.
- Evidence: `goldenResearchRun.e2e.test.mjs`,
  `researchRunFanOut.test.mjs`,
  `researchRunAdvance.test.mjs`,
  `researchRunControl.test.mjs`,
  `researchRunJobs.test.mjs`; CI job "Real
  engines through ResearchRun".
- Top gap: no real model in the loop in any
  test (the plan is a frozen model answer); no
  real customer-scale or GLP-1R run.

### 2 · Evidence / Replay / provenance
Edison 90 · Verified 84 (audit 80) → 86 after #78
- New on main: canonical ResearchRun Evidence
  Pack (builder, verifier, route) over the
  existing records; rejects mutated
  parameters, data, artifacts, verdict, engine
  identity, missing provenance.
- On #78: Genesis Verify record export +
  `#/verify` screen.
- Evidence: `researchRunEvidencePack.test.mjs`,
  `researchRunArtifacts.test.mjs`,
  `campaignVerify.test.mjs`,
  `genesisVerify.test.mjs`,
  `reviewerSignedEvidence.test.ts`.
- Top gap: CSRN key not generated (UNSIGNED);
  OpenMM has no replay.

### 3 · BYT / persistent state
Edison 80 · Verified 76 (audit 75) → 85 after #78
- On #78 (`docs/genesis1/BYT-VERIFICATION.md`):
  12 requirements PASS with real RDKit and real
  SIGKILL — identity, durable state, lineage,
  no duplicate execution, idempotency,
  truncation/tamper detection, v14→v15
  migration, six processes racing for one
  job, two backend instances on one DB.
  Evidence ledger moved to SQLite (schema V16),
  safe with several processes; DB snapshot
  before a schema migration.
- Evidence: `bytRecovery.e2e.test.mjs`,
  `bytVerification.test.mjs`,
  `knowledgeLedgerMultiInstance.test.mjs`,
  `dbPreMigrationSnapshot.test.mjs`,
  `bytProjectionRestart.test.mjs`.
- Top gap: one host, one SQLite file; no
  backup/restore drill; not merged.

### 4 · Hypotheses / steering / falsification
Edison 70 · Verified 82 (audit 80)
- Frozen prediction before execution, verdict
  only within protocol
  (SUPPORTED / FALSIFIED_WITHIN_PROTOCOL /
  INCONCLUSIVE), steering, frozen criteria
  immutable after a result.
- Evidence: `researchRunSteering.test.mjs`,
  `researchRunImmutability.test.mjs`,
  `researchRunExecution.test.mjs`.
- Top gap: at most 6 hypotheses per run; no
  multi-hypothesis loop without a human;
  uncertainty deliberately uncalibrated.

### 5 · NL → code → sandbox
Edison 55 · Verified 74 (audit 70)
- Generated analysis runs in a real Docker
  sandbox in CI, with Replay. Attestation now
  reads `docker info` and grants a limit only
  if the daemon can enforce it; timeout
  cleanup proven with a real process.
- Evidence: `scientificSandboxRuntime.test.mjs`,
  `dockerScientificSandboxBackend.test.mjs`,
  `scientificSandboxContract.test.mjs`; CI job
  "Real scientific sandbox".
- Top gap: attestation is policy, not hardware;
  one bounded analysis, not many notebooks per
  run; no GPU.

### 6 · Literature / data
Edison 35 · Verified 60 (audit 55)
- Europe PMC + PubMed connectors (fail-closed,
  one allowlisted origin), five provenance
  classes; nothing assigns REAL_MEASUREMENT.
  Live proof: 195 sources, metadata only, 2.0 s
  (`docs/evidence/literature-live-scale-44188bc2.json`).
- Evidence: `literatureFoundation.test.mjs`,
  `literaturePubmedProvenance.test.mjs`,
  `researchRunLiteratureIntegration.test.mjs`.
- Top gap: metadata only, no full text, no
  source-quality scoring at scale; 8 GLP-1R
  assays UNKNOWN.

### 7 · Engines / workflows
Edison 70 · Verified 70 (audit 68)
- RDKit, PySCF, Vina/Meeko, ADMET-AI through
  one port with verdict and replay; OpenMM
  water-box reference only. Verify replays go
  through heavy-compute admission and the
  ADMET licence gate.
- Evidence: `researchRunEngines.real.test.mjs`,
  `*ResearchRunExecutor.test.mjs` (4),
  `engineUsePurpose.test.mjs`; worker
  container gate: 3 green manual runs.
- Top gap: retrosynthesis not in any CI job;
  no protein–ligand MD; engines not on
  production; GNINA benchmark-only; ADMET and
  retrosynthesis BLOCKED_BY_LICENSE
  commercially.

### 8 · Candidate → lab handoff
Edison 35 · Verified 35 (audit 35)
- Governed handoff request that survives a DB
  reopen; closed loop proven on simulation.
- Evidence: `candidateLabHandoff.test.mjs`,
  `apiLabClosedLoop.test.mjs`,
  `retrosynthesisHandoff.test.mjs`.
- Top gap: no candidate (none passed Winner
  Gate), no lab, no hardware-verified adapter.

### 9 · Science Flight Control
Edison 70 · Verified 65 (audit 55)
- New on main: screen `#/flight-control`
  (runs, lease queue, Virtual Lab flights;
  pause/resume/cancel call real routes);
  pre-flight no longer passes an unrecorded
  research gate; BYT says NOT_COMPUTED instead
  of "0 flights".
- Evidence: `campaign/scienceFlightControl.test.mjs`,
  `flightControlScreen.test.tsx`; CI step
  "Science Flight Control — real preflight…".
- Top gap: no browser E2E in CI; no proof
  under load or across instances.

### 10 · UI / product
Edison 55 · Verified 65 (audit 65) → 67 after #78
- Build green, 66/66 views mechanically clean
  at 6 viewports (audit). New: Flight Control
  screen; on #78 the Verify screen.
- Evidence: `flightControlScreen.test.tsx`,
  `verifyScreen.test.tsx`; frontend suite in
  CI `verify`.
- Top gap: Playwright specs
  (`packages/e2e/src/`) do not run in CI; real
  phones not tested; production 361 commits
  behind.

### 11 · Scaling / subagents / enterprise
Edison 30 · Verified 34 (audit 30) → 40 after #78
- Fan-out of child runs (main); 32 jobs / 4
  workers (`scientificFanOut.test.mjs`);
  on #78 several processes and two instances
  on one DB.
- Top gap: no multi-host queue or shared
  object storage, no SSO/MFA, API keys,
  billing, backup drill, HA
  (`docs/evidence/consolidation/saas-readiness-2026-10-03.md`).

---

## Monetization readiness: 30%

Full matrix:
`docs/monetization/MONETIZATION-READINESS.md`.
All prices: owner's sheet, **HYPOTHESIS**.

| Offer | Tech | Product |
|---|---|---|
| Genesis Verify | 70 | 45 |
| Genesis Benchmark | 45 | 15 |
| Discovery Sprint | 55 | 25 |
| Evidence Platform | 50 | 15 |
| Enterprise | 25 | 5 |

Portfolio 30% = weighted toward the three
"now" offers. Verify 55% = mean of its two.

Best picks (reasons in the matrix):
- Fastest first revenue: **Genesis Verify**
- Best margin: **Genesis Verify**
- Best recurring: **Evidence Platform**
- Best enterprise: **Evidence Platform →
  Genesis Enterprise**
- Best public sector: **D-063 Public Evidence**
- Best scientific differentiator:
  **Genesis Benchmark**

What stops the first invoice is not code:
deploy, invoicing entity (after Hub71), SOW,
licence confirmation for RDKit/Vina/PySCF in
this use, one design partner.

---

## Investment readiness: 44%

| Dimension | % | Why |
|---|---|---|
| Technology | 70 | 5 engines, queue, E2E, CI green |
| Science | 55 | honest negatives; no candidate |
| Proof | 55 | replay + evidence files; no external validation |
| Product | 40 | prod 361 behind; screens new |
| Operations | 35 | 1 node; no backup drill |
| Security | 50 | scrypt, RBAC, audit chain; no SSO, pen-test, CSRN key |
| Commercial | 10 | no customer, LOI, entity |
| Economics | 15 | no unit costs in € |
| Scaling | 30 | one host only |
| Due diligence | 60 | audits, recovery matrix, licence gate |
| Moat | 45 | falsification + replay discipline; engines are third-party |
| Roadmap | 60 | owner roadmap 30/60/90 days |

Label: **PRE-REVENUE, NOT YET INVESTMENT
READY.** "PRE-REVENUE INVESTMENT READY" would
need at least one LOI or paid pilot, a
production deploy of main, the CSRN key, and
measured unit economics.

---

## Owner actions that move the numbers

1. "wdrażaj" (production is 361 behind).
2. Generate the CSRN key
   (`docs/keys/OWNER-CSRN-KEY-COMMANDS.md`).
3. Invoicing entity + one design partner for
   a supervised Verify audit.
4. Merge PR #78 after green CI.
5. Docking-target decision for GLP-1R.

## Wording rules (unchanged)

- Never "validated", "signed evidence",
  "autonomous AI discovers drugs".
- Engines (RDKit, Vina, PySCF, OpenMM,
  ADMET-AI) are third-party tools under their
  own licences; never describe them as
  "open source" in Genesis material.
- Prices are hypotheses until a customer pays.
