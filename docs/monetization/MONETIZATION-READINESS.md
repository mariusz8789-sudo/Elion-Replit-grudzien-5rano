# Genesis monetization readiness — 2026-10-03, refreshed 2026-10-04

> **READ §9 FIRST.** §9 (4 October 2026) is the current map: it classifies every offering
> into exactly one readiness class, carries the full row contract (customer, problem, input,
> workflow, deliverable, supervision, runtime, cost, licence, readiness, pricing, path to
> revenue) and names the six picks. §1–§8 below are the earlier matrix, **kept deliberately**
> as the baseline §9 refreshes: nothing there was deleted, and where §9 disagrees with it,
> §9 wins and says so. Three facts in §1–§8 are now stale and are corrected here once:
> production serves **37197555** (not b3be8635), the Evidence Pack **is** implemented on main
> (`researchRunEvidencePack.mjs`), and Run 9 is **IN_PROGRESS / FROZEN / PRE-REGISTERED**
> (§9.1, fact F7) rather than "frozen on a branch, not on main".

Base: `origin/main` 5f52356a plus branch `g1/monetization-verify` (this document and Genesis Verify). **Extended 3 Oct 20:40 UTC on c4810531 (PR #78) with the full monetization matrix below (§6–§8); the dashboard is `docs/genesis1/GENESIS-STATUS.md`.** Production is still b3be8635; main 09147752 is 361 commits ahead. Sources: the code paths named below, `docs/evidence/GENESIS-CENTRAL-AUDIT-2026-10-03.md`, `docs/GENESIS_SAAS_ENTERPRISE_READINESS.md`, `docs/astra/COMMERCIAL_LICENSE_GATE.md`, `docs/astra/CUSTOMER_RESEARCH_WORKFLOW.md`.

Ground rules for everything below:

- **Every price is a HYPOTHESIS.** The owner's price sheet (`/mnt/project-files/granty/monetyzacja-source-of-truth-2026-09-29.md`, 29 September, outside the repo) is the only source, quoted verbatim below. Its own rule: "Initial pricing hypotheses — to be validated with first customers." No price has been tested with a customer; ranges change only by a separate owner decision.
- **Nothing is "validated" science.** Genesis verdicts are `SUPPORTED_WITHIN_PROTOCOL / FALSIFIED_WITHIN_PROTOCOL / INCONCLUSIVE` for one frozen protocol; replay verdicts say whether a computation reproduces, not whether it is true.
- **Nothing is signed.** The CSRN production key has not been generated (`docs/keys/OWNER-CSRN-KEY-COMMANDS.md`, audit item 13). Every certificate and every Genesis Verify report is **UNSIGNED**.
- **Production is behind main.** Production runs b3be8635 (deploy of 29 September); main is about 315 commits ahead. Nothing below is live for a customer until the owner deploys.
- Readiness % = share of the product's end-to-end flow that has executable proof on main (a test or a committed evidence file), not counting commercial wrapping. It is a judgement, with roughly ±10 points of spread.

## Summary

| Product | Readiness | Price | One-line state |
|---|---|---|---|
| Genesis Verify | **45%** | €3k–€8k per audit, HYPOTHESIS | Record → integrity + ledger anchor + real replay → one-page report works and is tested. Only Genesis-produced records on 4 replayable engines; no upload UI; unsigned. |
| Genesis Benchmark | **25%** | €5k–€15k per project, HYPOTHESIS | Real Astex and PoseBusters runs exist as offline scripts and reports. No customer dataset intake; the scorer that won is licence-blocked from product use. |
| Discovery Sprint | **30%** | €10k–€25k per pilot (subject to runtime availability), HYPOTHESIS | ResearchRun question → plan → frozen prediction → engine → verdict → replay → next experiment is E2E tested. No real customer-scale run, ADMET/retrosynthesis blocked for commercial use. |
| Evidence Platform | **20%** | €30k–€80k per year, HYPOTHESIS | Hash-chained research state, evidence proposals, replay, artifact custody exist. Single-node SQLite, no tenant model, no backend Evidence Pack, prod behind main. |
| Enterprise | **15%** | €80k–€200k+ per year, HYPOTHESIS | Sessions, RBAC, projects. No SSO/MFA, API keys, billing, backup drill, HA or compliance evidence. |

## Fastest honest path to the first paid customer

**Sell Genesis Verify as a supervised, fixed-scope reproducibility audit of small-molecule computations**, delivered by a person using Genesis, not as self-serve SaaS.

1. **Scope the offer to what replays today:** RDKit descriptors, PySCF RHF single points (≤12 atoms, sto-3g/3-21g/6-31g), AutoDock Vina against Genesis's vetted docking targets. ADMET-AI replays, but commercial use is `BLOCKED_BY_LICENSE`; leave it out. OpenMM has no replay path.
2. **Delivery recipe (works on main today):** the customer sends their claimed computations (SMILES, parameters, their reported numbers). An operator creates one ResearchRun per claim, and the plan carries the customer's reported value as the frozen prediction, so the protocol verdict says whether Genesis reproduces the number. Caveat: today the plan can only come from the configured reasoning provider (`POST .../research-runs/:id/proposals`). An operator-authored plan entry (paste SMILES, parameters and the claimed value) is the one small piece of software still missing for this recipe. The run executes, the artifact bundle is stored, and `POST /api/projects/:id/genesis-verify` with `format: "html"` produces the one-page report per record. A human reviewer writes a one-paragraph cover note and hands over the reports plus the bundles, so the customer or their auditor can re-verify later.
3. **Owner actions before invoicing:** deploy main (standing authorization, batch release); decide whether to ship UNSIGNED reports (honest and acceptable for a pilot) or generate the CSRN key first; confirm RDKit (BSD), Vina and PySCF (Apache-2.0) licence status in `COMMERCIAL_LICENSE_GATE.md` for this use; put an invoicing entity in place (the audit notes the legal entity comes after Hub71); write a one-page SOW that lists what is NOT checked, using the report's own list.
4. **Find one design partner** (a computational chemistry CRO, a biotech preparing a grant or due-diligence package, or a journal or reviewer who needs computations re-run) with an LOI, then a paid pilot at the low end of the hypothesis range.
5. **Do not sell:** "validation", "certification", "signed evidence", benchmark claims for GNINA rankers, or anything about wet-lab or clinical relevance.

Realistic timing: about 1–2 weeks of owner actions (deploy, licence confirmation, SOW, entity) before a paid pilot can be invoiced. The software is not the bottleneck for the first customer.

---

## 1. Genesis Verify

**Customer.** Biotech or CRO teams, grant applicants, due-diligence and audit firms, journal or reviewer offices that need computational claims independently re-checked.

**Problem.** Computational results (descriptors, QM energies, docking scores) are reported without a way to tell whether the numbers were altered, are reproducible, or came from the stated engine and inputs.

**Genesis workflow (real flow on main + this branch).**

`customer input` → `verifySubmittedRecord` → evidence analysis → replay/integrity → `renderVerifyReportHtml`

| Step | File · function | Real or mocked |
|---|---|---|
| Record is produced by a real run | `packages/backend/src/researchRunExecution.mjs` · `executeResearchExperiment` → `executeAndFalsify` writes the `research-run-execution@1` record (`EXPERIMENT_HANDOFF`) into the hash-chained research state and a canonical Scientific Run (`saveScienceRun`) | Real engine (RDKit in tests) |
| Record is handed to the customer | `researchRunArtifacts.mjs` · `persistExperimentArtifact` / `verifyExperimentArtifact`; `GET /api/projects/:id/research-runs/:rid/experiments/:eid/artifact` returns the ArtifactRef (sha256) | Real, single-node content-addressed storage |
| Customer submits it | `POST /api/projects/:id/genesis-verify` `{ record, declaredSha256?, format? }` (`api.mjs`) | Real (new) |
| Evidence analysis | `genesisVerify.mjs` · `verifySubmittedRecord`: readable, file sha256 vs the hash the customer was given, required provenance (run, experiment, frozen prediction fingerprint, preregistration fingerprint, engine and version, input/output and both hashes), recomputed canonical sha256 of input and output | Real (new) |
| Ledger anchor | `getResearchRun` + `buildExecutionBundle`: the submitted record is compared field by field with the copy in the project's hash-chained research state | Real, reuses the existing ledger |
| Replay | `campaign/verify.mjs` · `replayCapabilityInputs` (extracted from `replayScienceRun`; the same `REPLAYERS` and `TOLERANCE`), pure, writes no verification row | Real engine re-execution |
| Deliverable | `renderVerifyReportHtml`: one self-contained, phone-width HTML page showing the verdict MATCH / DRIFT / TAMPERED / BLOCKED, a plain-language meaning, the checks, the hashes, what was NOT checked, the UNSIGNED status and the report fingerprint | Real (new) |

Related, existing, but not this product's flow:
- `customerResearchDelivery.mjs` · `buildCustomerResearchDelivery` with `productId: GENESIS_VERIFY` is a read-only projection of a run in this database (replay MATCH required, commercial admission gate). It does not take an external record.
- Reviewer Room `#/reviewer` (`packages/frontend/src/components/ReviewerRoomScreen.tsx`): `core/reviewer/tamperChallenge.ts` · `runTamperChallenge` runs the real D-063 claim audit (`govServices/govClaimAudit.ts` · `runClaimAudit`) on pinned SURPASS-2 bytes, a forged copy and an unanchored forgery; `core/reviewer/signedEvidence.ts` / `redockCertificate.ts` verify a CSRN certificate, currently UNSIGNED. This is a real demonstration on fixed, repository-pinned data, not a customer-input path.
- Evidence showcase `#/evidence` (`components/visual-simulation/EvidenceShowcaseScreen.tsx`) shows one stored browser-side Evidence Bundle with replay; it is a presentation of Genesis's own record.

**Client inputs.** The execution bundle file (or the execution record JSON) plus the sha256 Genesis gave them. In the supervised offer, also SMILES, parameters and the values they claim.

**Deliverable.** One-page HTML report per record (verdict, meaning, checks, hashes, NOT-checked list, UNSIGNED), its JSON form with `reportFingerprint`, and the original bundle.

**What works now (evidence).**
- `packages/backend/src/genesisVerify.test.mjs`: a real RDKit ResearchRun produces a bundle. The valid bundle gives MATCH (all six checks PASS, replay output hash equals the recorded one, no verification row written). The same record in the `EXPERIMENT_HANDOFF` shape gives MATCH. An unanchored check gives MATCH and says what it could not see. Editing one number gives TAMPERED (content hash) and no replay. A forgery with a recomputed hash gives TAMPERED via the file hash and the ledger anchor, and DRIFT when unanchored (honest boundary). A record missing engine and preregistration gives BLOCKED. Garbage gives BLOCKED. The HTML is escaped and has no scripts or external resources.
- Underlying replay is covered by the existing `campaignVerify.test.mjs`, `campaignScienceRunReplay.test.mjs`, `researchRunArtifacts.test.mjs`, `goldenResearchRun.e2e.test.mjs`.

**What is missing.**
- It verifies only **Genesis-produced** ResearchRun records. A customer's own pipeline output (a Schrödinger or Gaussian log, a notebook) cannot be submitted; it has to be re-run in Genesis first (the supervised recipe above).
- Replay exists for 4 engines (RDKit, PySCF, Vina, ADMET-AI). There is no OpenMM replay, and ADMET-AI is licence-blocked commercially.
- ~~No upload UI in the frontend; API only.~~ Update 3 Oct evening (PR #78, c4810531, not on main yet): `#/verify` (`packages/frontend/src/components/VerifyScreen.tsx`, `verifyScreen.test.tsx`) lets a signed-in user upload or paste a record, or export an executed experiment's record with its sha256 (`GET /api/projects/:id/research-runs/:rid/experiments/:eid/record`, real-RDKit test in `genesisVerify.test.mjs`: export → MATCH, edited → TAMPERED), and download the HTML report.
- No operator-authored plan entry: turning a customer's claimed number into a frozen prediction goes through the reasoning provider's plan today.
- Signature UNSIGNED (no CSRN key). There is no PDF export; the HTML page prints to PDF from a browser.
- Not deployed (production is 315 commits behind).
- The Evidence Pack format (`docs/astra/RESEARCHRUN_EVIDENCE_PACK_SPEC.md`) is not implemented on main. Branch `g1/astra-evidence-pack` was not on origin when this was written. Verify consumes the record ResearchRun already persists and should accept the pack once it lands, with no second format.

**Delivery time.** Compute: seconds to minutes per record (RDKit seconds, Vina minutes). Supervised audit of 10–50 claims: about 2–5 working days including human review (estimate, not measured with a customer).

**Human supervision.** Required: scoping which claims are replayable, creating the runs, reading every non-MATCH, writing the cover note.

**Infrastructure.** The existing single Node server + SQLite + local artifact storage; Python RDKit/PySCF/Vina toolchain (see `requirements-*.txt`). No GPU.

**Price.** €3k–€8k per audit — **HYPOTHESIS**, untested.

**Cost drivers.** Operator and reviewer hours (dominant), Vina CPU time for large docking sets, hosting of one node.

**Commercial blockers.** No deploy, no invoicing entity, licence confirmation for RDKit/Vina/PySCF in this use, no SOW or terms, unsigned reports, no reference customer.

**Readiness: 45%.**

## 2. Genesis Benchmark

**Customer.** Method developers (docking or scoring vendors, academic groups), pharma computational teams choosing a method, investors doing technical diligence.

**Problem.** Method claims are often tuned on contaminated or overlapping benchmarks; buyers want a preregistered, contamination-checked, every-failure-counted comparison.

**Genesis workflow (real flow found).** `dataset → engine → evidence → report`:

| Step | File | Real or mocked |
|---|---|---|
| Dataset + contamination | `docs/evidence/posebusters-benchmark-cases.json`, `astex-redock-prereg.json`, `posebusters-unseen-benchmark-prereg.json`; contamination table in `posebusters-run8-unseen-benchmark.md` | Real public data (Astex 85, PoseBusters 308) |
| Preregistration | prereg JSON with fingerprint; the scripts recompute `sha256(json.dumps(protocol, sort_keys=True))` and refuse to run on drift | Real |
| Engine | `scripts/astex-redock-benchmark.py`, `astex-multiseed-ensemble.py`, `astex-gnina-rescore.py`, `astex-vinardo-rescore.py`, `posebusters-unseen-benchmark.py` (Vina sampling, GNINA/Vinardo rescoring), with replay scripts `astex-multiseed-replay.py` and `astex-gnina-replay.py` | Real, offline Python, run by an operator |
| Evidence + report | `docs/evidence/astex-run6-multiseed-ensemble.md`, `astex-run7-gnina-rescore.md`, `posebusters-run8-unseen-benchmark.{json,md}` (Run 8: top-1 204/308 GNINA vs 202/308 Vina; verdict DOES_NOT_GENERALISE, all failures kept) | Real |
| Engine self-benchmarks | `packages/backend/src/benchmark/runner.mjs` (+ `rdkit/qm/md/admet/docking/proteinBenchmark.mjs`, `npm run benchmark`) against reference values; `docs/BENCHMARK_SUITE.md` | Real, internal engine validation, not a customer product |
| Customer projection | `customerResearchDelivery.mjs` `productId: GENESIS_BENCHMARK` needs ≥2 executed ResearchRun experiments with replay MATCH; `independentMethodAgreement: NOT_CLAIMED` | Real projection, but a ResearchRun holds at most 6 model-proposed hypotheses, so it is not a benchmark harness |

**Client inputs.** Their method (binary, container or score files), the target benchmark or their own dataset, and acceptance metrics agreed before the run.

**Deliverable.** Preregistration with fingerprint, per-case results including every failure, paired comparison, verdict by the frozen criterion, replay of a subset, and a report in the style of `posebusters-run8-unseen-benchmark.md`.

**What works now.** Two complete preregistered campaigns with committed evidence and replays (Astex runs 1–7, PoseBusters Run 8). The method is honest: frozen criterion, denominator fixed, failures published, contamination measured.

**What is missing (gap is not small, so it was not implemented here).**
- No customer intake for a dataset or method. Benchmarks are hand-run Python scripts with paths and pinned code hashes specific to the Genesis docking pipeline.
- No generic "case set → engine → metric → report" harness inside the product. ResearchRun is built for hypotheses, not hundreds of cases.
- Running a customer's method requires sandboxing third-party binaries (Docker sandbox contracts exist in `dockerScientificSandboxBackend`, but the benchmark scripts do not use them).
- GNINA is benchmark-only (`COMMERCIAL_LICENSE_GATE.md`: product admission BLOCKED). The Vina/Meeko licence is not confirmed for product use.
- No GPU, so runs take hours (Run 8: 2 974 s on 4 CPUs for 308 cases).
- Run 9 is frozen on a branch, not on main.

Smallest real next step (not done here): wrap `posebusters-unseen-benchmark.py`'s preregistration-check, run and report stages behind one job type that takes a customer case list and a scoring command, keeping the prereg fingerprint refusal.

**Delivery time.** 2–6 weeks per project (prep, prereg, run, write-up), estimate.

**Human supervision.** Heavy: preparation fixes, contamination check, prereg review, write-up.

**Infrastructure.** Multi-core CPU node(s), large scratch disk, public datasets (Zenodo/RCSB access, which is blocked in some sessions), GPU desirable.

**Price.** €5k–€15k per project — **HYPOTHESIS**, untested.

**Cost drivers.** Expert hours for preparation and write-up, CPU hours, data licensing checks per dataset.

**Commercial blockers.** Licence of the scoring tools, no productized harness, the only external result is a negative one for the GNINA ranker (honest, but it means there is no "Genesis method" to sell as a winner), no reference customer.

**Readiness: 25%.**

## 3. Discovery Sprint

**Customer.** Early-stage biotech or an academic lab with one question, such as a target or a series, who wants a bounded computational iteration.

**Problem.** Getting from a question to a falsifiable, executed, replayable experiment and a justified next step is slow and undocumented.

**Genesis workflow.** `researchRun.mjs` (`startResearchRun`, `proposeResearchPlan` under the model-plan contract) → `researchRunLiterature.mjs` (Europe PMC) → `researchRunExecution.mjs` (`executeResearchExperiment`: preregister, engine, `sealExperimentSession` verdict, evidence proposal, replay, `nextExperimentProposal`) → `researchRunJobs.mjs` queue → `customerResearchDelivery.mjs` (`GENESIS_RESEARCH_SPRINT`).

**Client inputs.** Question, molecules or targets, acceptance criteria, data classification (the onboarding fields enforced in `customerResearchDelivery.mjs` · `onboardingOf`).

**Deliverable.** Computational report (`GENESIS_COMPUTATIONAL_RESEARCH_REPORT`): sources, hypotheses, frozen predictions, engine runs, protocol verdicts, replay, next experiments. Plus Genesis Verify reports per experiment.

**What works now.** `goldenResearchRun.e2e.test.mjs` (real engine, pause/resume/cancel, queue), `researchRunEngines.real.test.mjs`, `customerResearchDelivery.test.mjs`; audit: ResearchRun 72%.

**What is missing.** Tests use a frozen model answer as the plan. There is no real GLP-1R or other customer-scale run, and no multi-stage scheduling beyond phase 1. ADMET and retrosynthesis are `BLOCKED_BY_LICENSE` for commercial use. There is no wet-lab handoff partner and no candidate (audit section 7).

**Delivery time.** 2–4 weeks, estimate.

**Human supervision.** Scientist review of the plan, every verdict and the next step. Evidence publication is a human decision by design.

**Infrastructure.** Same node; LLM provider for plans; literature API access.

**Price.** €10k–€25k per pilot (subject to runtime availability) — **HYPOTHESIS**, untested.

**Cost drivers.** Scientist hours, LLM tokens, engine CPU.

**Commercial blockers.** Licence gate for ADMET and retrosynthesis, no chemistry advisor, no reference case end to end on a real customer question.

**Readiness: 30%.**

## 4. Evidence Platform

**Customer.** Research organisations that want their own computations recorded with custody, replay and evidence review in one place (self-serve or hosted).

**Problem.** Lab notebooks and pipelines do not keep tamper-evident, replayable provenance tied to claims.

**Genesis workflow.** Hash-chained research state (`agentRun.mjs` `appendServerResearchStateEvent`), knowledge ledger and evidence proposals (`knowledgeApi.mjs` `proposeStructuredEvidence`), Scientific Run replay (`campaign/verify.mjs`), artifact custody (`researchRunArtifacts.mjs`, `compute/localArtifactStorageBackend.mjs`), BYT projection (`bytProjection.mjs`), audit chain (`security/auditChain.mjs`), Genesis Verify for exported records.

**Client inputs.** Their users, projects, computations run through Genesis engines.

**Deliverable.** Hosted workspace plus exports (`buildAuthorizedCustomerExport`, `GENESIS_EVIDENCE_PLATFORM`).

**What works now.** Evidence/Replay/provenance 80% and BYT 75% in the audit; restart and chain-corruption tests fail closed (`bytProjectionRestart.test.mjs`, `researchStatePersistence.test.mjs`).

**What is missing.** The backend Evidence Pack is spec-only. There are two separate lab memories (kernelLedger, scienceMemory) and about 15 unmapped epistemic vocabularies. Frontend and backend hash chains are not one library. It runs on one node with one SQLite database, with no backup drill, no tenant/org model and no API keys. Production is behind main. Signatures are UNSIGNED.

**Delivery time.** Onboarding a hosted pilot: weeks once the infrastructure exists; currently blocked on the infrastructure.

**Human supervision.** Operator for onboarding and support, reviewer for evidence publication.

**Infrastructure.** Managed DB with backup/restore, shared object storage, multi-replica queue, secret manager (`GENESIS_SAAS_ENTERPRISE_READINESS.md` P0 list).

**Price.** €30k–€80k per year — **HYPOTHESIS**, untested; offered only after first successful pilots.

**Cost drivers.** Hosting, storage growth for artifacts, compute per run, support.

**Commercial blockers.** The P0 SaaS list (deploy, backup, quotas, API keys), data-handling policy, no billing.

**Readiness: 20%.**

## 5. Enterprise

**Customer.** Pharma or large institutions wanting an on-prem or dedicated Genesis with SSO and compliance.

**Problem.** The same as the Evidence Platform, under enterprise security, governance and procurement rules.

**Genesis workflow.** The Evidence Platform plus enterprise controls. The controls do not exist yet.

**Client inputs.** IdP, data-residency rules, security questionnaire, procurement terms.

**Deliverable.** Dedicated deployment, SLA, compliance evidence.

**What works now.** Auth with scrypt and 256-bit session tokens, RBAC viewer/editor/admin/owner, project isolation, CSP and security headers, append-only audit chain, commercial release admission gate (`commercialReleaseAdmission.mjs`), engine licence gate.

**What is missing.** SSO/OIDC/SAML, SCIM, MFA, API keys, billing and metering, KMS, SOC 2/ISO evidence, SLA, HA, backup/restore drill, data residency, external pen-test (`GENESIS_SAAS_ENTERPRISE_READINESS.md`). The audit puts enterprise readiness at 20%. This document uses 15% for the sellable product, because no customer path exists.

**Delivery time.** 6–12 months after the infrastructure decisions, estimate.

**Human supervision.** Dedicated support and security staff.

**Infrastructure.** Multi-replica, managed DB, KMS, monitoring, incident runbook.

**Price.** €80k–€200k+ per year — **HYPOTHESIS**, untested; offered only after first successful pilots.

**Cost drivers.** Security and compliance programme, dedicated infrastructure, support.

**Commercial blockers.** Everything above, plus no legal entity and no reference customers.

**Readiness: 15%.**

---

# Monetization matrix — 3 October 2026, 20:40 UTC

Base: c4810531 (PR #78, open) on top of main 09147752. Production: b3be8635 (29 Sep), 361 commits behind main. Dashboard: `docs/genesis1/GENESIS-STATUS.md`.

Rules for this part (same as above):

- **No customers, no LOI, no revenue exist.** Nothing below implies otherwise.
- **Every price is a HYPOTHESIS**, quoted verbatim from `/mnt/project-files/granty/monetyzacja-source-of-truth-2026-09-29.md` ("Initial pricing hypotheses — to be validated with first customers."). Where the sheet has no price, none is given.
- Reports and certificates are **UNSIGNED** (CSRN key not generated): "fingerprints and replay".
- **TECH %** = share of the offer's delivery flow with real code and a passing test or committed evidence file. **PRODUCT %** = how much of the sellable package exists: screen, deployed, terms, licence clearance, delivery recipe. Both are judgements, ±10 points.
- Engines are third-party tools under their own licences. We sell the workflow (TASK → COMPUTE → FALSIFICATION → EVIDENCE → REPLAY → NEXT DECISION, sheet §7), not engines.

## 6. Measured runtime anchors (for COMPUTE COST)

| # | What was measured | Value | Source |
|---|---|---|---|
| M1 | CI job "Real engines through ResearchRun and the durable queue" on main 09147752: install + tests over RDKit, PySCF, Vina, OpenMM, ADMET | 4 min 35 s wall, whole job | GitHub check run, 3 Oct 20:13–20:18 UTC |
| M2 | CI job "Real PySCF benchmark" | 40 s wall, whole job | same commit |
| M3 | Genesis prep arm, 10 complexes | 5.3 machine-s (PROVISIONAL, loaded machine) | `docs/evidence/prep-time-study/genesis-arm.json` |
| M4 | Vina docking, Run 6 | 425 dockings in about 4 h on 4 cores ≈ 16 core-h ≈ 2.3 core-min per docking | as recorded in `docs/evidence/posebusters-unseen-benchmark-prereg.json` (`estimatedWallClock`) |
| M5 | GNINA rescoring (benchmark only) | 0.40–0.45 s per pose on 4 CPUs; Run 7 full pass 4 539 s | `docs/evidence/astex-next-scorer-audit.md`, `astex-run7-gnina-rescore.json` |
| M6 | Run 8, 308 cases | prereg estimate 15–20 h docking on 4 cores (scaled from M4). The recorded 2 974 s is the final resumed process only and **must not** be quoted as cost | `posebusters-run8-unseen-benchmark.md` |
| M7 | Live literature retrieval | 195 sources (metadata only) in 2.0 s | `docs/evidence/literature-live-scale-44188bc2.json` |

**€ per CPU-hour: UNKNOWN.** No hosting invoice is in the repo. To measure: (a) the Railway bill for one worker container divided by its CPU-hours; (b) per-job durations from the `jobs` table (claim → completion) for each offer's typical job; (c) LLM tokens per ResearchRun from the provider's usage export. Tokens are **not metered** anywhere in Genesis today.

## 7. The offers

### 7.1 GENESIS VERIFY

- **CUSTOMER:** biotech or CRO teams, grant applicants, due-diligence firms, journal reviewers.
- **PROBLEM:** a reported computational number may be altered, irreproducible, or not from the stated engine and inputs.
- **INPUT:** a Genesis execution record + its sha256. Supervised mode: SMILES, parameters and the values the customer claims.
- **GENESIS WORKFLOW:** `researchRun.mjs` → `researchRunExecution.mjs` · `executeResearchExperiment` → `GET /api/projects/:id/research-runs/:rid/experiments/:eid/record` (#78) → `POST /api/projects/:id/genesis-verify` → `genesisVerify.mjs` · `verifySubmittedRecord` (integrity, provenance, ledger anchor, `campaign/verify.mjs` · `replayCapabilityInputs` through heavy-compute admission and the ADMET licence gate) → `renderVerifyReportHtml`. Screen: `#/verify` (`VerifyScreen.tsx`, #78).
- **DELIVERABLE:** one-page HTML report per record (MATCH / DRIFT / TAMPERED / BLOCKED, six checks, what was NOT checked, UNSIGNED), JSON with `reportFingerprint`, the original bundle.
- **HUMAN SUPERVISION:** required: scoping which claims replay, creating runs, reading every non-MATCH, cover note.
- **RUNTIME:** compute seconds to minutes per record (M1–M3). Delivery of 10–50 claims: 2–5 working days (estimate, never measured with a customer).
- **COMPUTE COST:** negligible next to operator hours (M1–M3); € UNKNOWN (see §6).
- **LEGAL/LICENSE BLOCKERS:** ADMET records `BLOCKED_BY_LICENSE` for commercial use (tested, a99f281a); RDKit (BSD-3), Vina and PySCF (Apache-2.0) are CONDITIONAL in `docs/astra/COMMERCIAL_LICENSE_GATE.md` until the shipped distributions are pinned; no invoicing entity; reports UNSIGNED.
- **TECHNICAL READINESS:** 70% (`genesisVerify.test.mjs` real RDKit: export → MATCH, edited → TAMPERED; `verifyScreen.test.tsx`). Missing: only Genesis-produced records; 4 replayable engines; operator-authored plan entry.
- **PRODUCT READINESS:** 45% (screen exists on #78; not merged, not deployed; no SOW, no entity).
- **PRICING HYPOTHESIS:** €3k–€8k / audit.
- **PATH TO FIRST REVENUE:** merge #78 → batch deploy → add operator plan entry → SOW listing what is NOT checked → entity → one design partner (CRO, grant applicant) → paid pilot at the low end.

### 7.2 GENESIS BENCHMARK

- **CUSTOMER:** docking/scoring method developers, pharma computational teams choosing a method, technical due diligence.
- **PROBLEM:** method claims tuned on contaminated benchmarks; buyers want preregistered, every-failure-counted comparisons.
- **INPUT:** the customer's method (binary/container or score files), the benchmark or their dataset, acceptance metrics agreed before the run.
- **GENESIS WORKFLOW:** offline scripts, operator-run: `scripts/posebusters-unseen-benchmark.py`, `astex-redock-benchmark.py`, `astex-multiseed-ensemble.py`, replays `astex-multiseed-replay.py`, `astex-gnina-replay.py`; prereg fingerprint refusal; projection `customerResearchDelivery.mjs` · `GENESIS_BENCHMARK`.
- **DELIVERABLE:** preregistration with fingerprint, per-case results incl. every failure, paired comparison, verdict by the frozen criterion, replay of a subset, report like `docs/evidence/posebusters-run8-unseen-benchmark.md`.
- **HUMAN SUPERVISION:** heavy: preparation, contamination check, prereg review, write-up.
- **RUNTIME:** 2–6 weeks per project (estimate).
- **COMPUTE COST:** ≈ 60–80 core-hours of Vina for a 300-case, 5-seed set (scaled from M4/M6, not measured for a customer); GNINA rescoring adds ≈ 0.4 s/pose (M5). € UNKNOWN.
- **LEGAL/LICENSE BLOCKERS:** GNINA product admission BLOCKED (Run 8 DOES_NOT_GENERALISE); Meeko (LGPL) and Vina review not confirmed; PoseBusters data CC BY 4.0 CONDITIONAL; third-party customer binaries need the sandbox.
- **TECHNICAL READINESS:** 45% (two complete preregistered campaigns with replays; no in-product harness).
- **PRODUCT READINESS:** 15%.
- **PRICING HYPOTHESIS:** €5k–€15k / project.
- **PATH TO FIRST REVENUE:** one method developer with their own scoring command; wrap the prereg-check/run/report stages of `posebusters-unseen-benchmark.py` as one job type; deliver as a founder-run service.

### 7.3 DISCOVERY SPRINT

- **CUSTOMER:** early-stage biotech or academic lab with one bounded question.
- **PROBLEM:** getting from a question to a falsifiable, executed, replayable experiment and a justified next step is slow and undocumented.
- **INPUT:** question, molecules or target, acceptance criteria, data classification (`customerResearchDelivery.mjs` · `onboardingOf`).
- **GENESIS WORKFLOW:** `researchRun.mjs` (`startResearchRun`, `proposeResearchPlan`) → `researchRunLiterature.mjs` (Europe PMC + PubMed) → `researchRunExecution.mjs` → `researchRunJobs.mjs` lease queue → fan-out (`researchRunFanOut.test.mjs`) and advance (`researchRunAdvance.test.mjs`, stops at human review) → `researchRunEvidencePack.mjs` → `customerResearchDelivery.mjs` · `GENESIS_RESEARCH_SPRINT`; monitored on `#/flight-control`.
- **DELIVERABLE:** computational report: sources, hypotheses, frozen predictions, engine runs, protocol verdicts, replay, next experiments, Evidence Pack, Verify reports.
- **HUMAN SUPERVISION:** scientist reviews the plan, every verdict and each next step; evidence publication is a human decision by design.
- **RUNTIME:** 2–4 weeks (estimate). Per experiment: seconds (RDKit) to minutes (Vina ≈ 2.3 core-min per docking, M4).
- **COMPUTE COST:** engine CPU small (M1, M4); LLM tokens UNKNOWN (not metered); € UNKNOWN.
- **LEGAL/LICENSE BLOCKERS:** the sheet's Sprint includes "ADMET/Tox", which is `BLOCKED_BY_LICENSE` for commercial use today; Meeko licence to confirm; engines are not on production ("subject to runtime availability"); ChEMBL CC BY-SA share-alike for any delivered data.
- **TECHNICAL READINESS:** 55% (`goldenResearchRun.e2e.test.mjs`, `researchRunEngines.real.test.mjs`, `customerResearchDelivery.test.mjs`). No real model in the loop in tests; no customer-scale run.
- **PRODUCT READINESS:** 25%.
- **PRICING HYPOTHESIS:** €10k–€25k / pilot (subject to runtime availability).
- **PATH TO FIRST REVENUE:** deploy + one Railway worker with Vina live → one real question run end to end → chemist prep-time measurement → offer to a Verify customer as the next step.

### 7.4 DEEP DISCOVERY — not technically justified today

- Sheet scope: Sprint + PySCF + OpenMM + falsification + AiZynthFinder retrosynthesis.
- Reality: PySCF works (small molecules, small bases); OpenMM is a TIP3P water reference only, no protein–ligand MD, no replay; AiZynthFinder reports `BLOCKED_BY_RUNTIME: MODEL_FILES_MISSING` (`docs/GENESIS_RETROSYNTHESIS.md`) and is in no CI job; commercial retrosynthesis BLOCKED by admission.
- TECH 25% · PRODUCT 5%. **Do not offer** until a protein–ligand MD path with replay and a retrosynthesis runtime exist.
- PRICING HYPOTHESIS (not offered now): €20k–€50k / project (subject to runtime availability).

### 7.5 EVIDENCE PLATFORM

- **CUSTOMER:** research organisations that want their computations recorded with custody, replay and evidence review.
- **PROBLEM:** notebooks and pipelines lose tamper-evident, replayable provenance tied to claims.
- **INPUT:** their users and projects; computations run through Genesis.
- **GENESIS WORKFLOW:** hash-chained research state (`agentRun.mjs`), evidence ledger (`knowledgeApi.mjs`; on #78 SQLite schema V16, safe with several processes), Evidence Pack (`researchRunEvidencePack.mjs`), artifact custody (`researchRunArtifacts.mjs`), BYT (`bytProjection.mjs`), Reviewer Room `#/reviewer`, Verify for exports.
- **DELIVERABLE:** hosted workspace + Evidence Pack and Verify exports.
- **HUMAN SUPERVISION:** operator for onboarding/support; reviewer for evidence publication.
- **RUNTIME:** weeks to onboard once infrastructure exists (estimate).
- **COMPUTE COST:** hosting + artifact storage growth; € UNKNOWN (measure DB + artifact bytes per run).
- **LEGAL/LICENSE BLOCKERS:** data-processing terms, no GDPR export/deletion workflow, no billing, UNSIGNED.
- **TECHNICAL READINESS:** 50% (`docs/genesis1/BYT-VERIFICATION.md`: 12 requirements PASS on #78; `knowledgeLedgerMultiInstance.test.mjs`; `researchRunEvidencePack.test.mjs`). One host, one SQLite file, no backup drill (only a pre-migration snapshot, `dbPreMigrationSnapshot.test.mjs`), no tenant model.
- **PRODUCT READINESS:** 15%.
- **PRICING HYPOTHESIS:** €30k–€80k / year (sheet: after first successful pilots).
- **PATH TO FIRST REVENUE:** convert a successful Verify or Sprint customer into an annual pilot after deploy + backup/restore drill.

### 7.6 ENTERPRISE GENESIS

- **CUSTOMER:** pharma, large CROs, institutions needing a dedicated or on-prem deployment.
- **PROBLEM / INPUT / WORKFLOW:** Evidence Platform under SSO, compliance and procurement; inputs are IdP, residency rules, security questionnaire.
- **DELIVERABLE:** dedicated deployment, SLA, compliance evidence.
- **HUMAN SUPERVISION:** dedicated support and security staff.
- **RUNTIME:** 6–12 months after infrastructure decisions (estimate).
- **COMPUTE COST:** UNKNOWN (dedicated infrastructure not designed).
- **LEGAL/LICENSE BLOCKERS:** no SSO/SAML/OIDC, MFA, SCIM, API keys, billing, KMS, SOC 2/ISO evidence, pen-test, entity (`docs/evidence/consolidation/saas-readiness-2026-10-03.md`: ENTERPRISE_BLOCKED).
- **TECHNICAL READINESS:** 25% (scrypt auth, hashed sessions, RBAC, audit chain, licence gate). **PRODUCT READINESS:** 5%.
- **PRICING HYPOTHESIS:** €80k–€200k+ / year (after first successful pilots).
- **PATH TO FIRST REVENUE:** only after Evidence Platform pilots; not before.

### 7.7 UNIVERSITY / RESEARCH INSTITUTE

- **CUSTOMER:** academic computational chemistry groups, research institutes, grant offices.
- **PROBLEM:** reproducibility of computational results for papers and grant applications; methods teaching (`docs/GENESIS_PRODUCT_WEDGE.md` §3 recommended "reproducible computational experiments for research-methods courses").
- **INPUT:** the group's computations or questions.
- **GENESIS WORKFLOW:** Verify (7.1) and Sprint (7.3) paths; Virtual Labs and Human Explorer for teaching context.
- **DELIVERABLE:** Verify reports for a paper or grant; a Sprint report.
- **HUMAN SUPERVISION / RUNTIME / COMPUTE COST:** as 7.1 / 7.3.
- **LEGAL/LICENSE BLOCKERS:** academic procurement; the Education line (Learn/Study/Teach) does not exist (no Teach mode, no classes or LMS).
- **TECHNICAL READINESS:** 50%. **PRODUCT READINESS:** 20%.
- **PRICING HYPOTHESIS:** Verify €3k–€8k / audit, Sprint €10k–€25k / pilot. No separate academic price in the sheet. Education / Human Lab €5k–€20k / institution / year is a future vertical (sheet §4), **not offered**.
- **PATH TO FIRST REVENUE:** a reproducibility audit paid from a grant budget.

### 7.8 BIOTECH / PHARMA

- **CUSTOMER:** small biotech (entry), pharma computational groups (method choice, later enterprise).
- **PROBLEM:** decide which computational result or method to trust before spending wet-lab money.
- **INPUT / WORKFLOW / DELIVERABLE:** entry through Verify (7.1) or Benchmark (7.2), expansion to Sprint (7.3), long term Discovery Partnership (7.11).
- **HUMAN SUPERVISION:** scientist and chemist; no wet-lab partner exists.
- **RUNTIME / COMPUTE COST:** as the underlying offers.
- **LEGAL/LICENSE BLOCKERS:** ADMET and retrosynthesis BLOCKED_BY_LICENSE commercially; GNINA benchmark-only; no candidate has passed Winner Gate (GLP-1R: NO GRANT-READY CANDIDATE YET).
- **TECHNICAL READINESS:** 45%. **PRODUCT READINESS:** 15%.
- **PRICING HYPOTHESIS:** as the underlying offers; Discovery Partnership €100k–€300k+ / programme (after pilots).
- **PATH TO FIRST REVENUE:** Verify or Benchmark first; never lead with "discovery".

### 7.9 PUBLIC / INSTITUTIONAL PILOT

Two items have real functionality; the rest of the sheet's §3 does not.

**D-063 Public Evidence** — claim audit + trigger certificate + evidence.
- WORKFLOW: `packages/frontend/src/core/govServices/govClaimAudit.ts` · `runClaimAudit`, `govParametricTrigger.ts`, `core/reviewer/tamperChallenge.ts` in Reviewer Room `#/reviewer`.
- Tests: `d063BaselineComparisonAndGovServices.test.ts`, `reviewerTamperChallenge.test.ts`.
- Limit: runs on pinned SURPASS-2 bytes, not a customer's data; trigger certificate UNSIGNED.
- TECH 45% · PRODUCT 15%. PRICING HYPOTHESIS: €10k–€30k / pilot (sheet §3: after pilot / validation).

**CLOCKWORK** — official deadlines/processes + audit.
- WORKFLOW: `packages/core/src/mythos/clockwork/ClockworkEngine.ts` (KPA deadline arithmetic), `ClockworkDashboard` at `#/clockwork`.
- Tests: `clockwork.test.ts`, `clockworkDashboard.test.tsx`, `clockworkRegister.test.ts`.
- Limit: no integration with any office system; roles later.
- TECH 40% · PRODUCT 15%. PRICING HYPOTHESIS: €10k–€30k / pilot.

Common: CUSTOMER public agencies and auditors; HUMAN SUPERVISION full; RUNTIME weeks (estimate); COMPUTE COST negligible (browser-side); LEGAL procurement, data-processing agreements, entity. PATH: one demonstration on a public body's own published claim, then a paid pilot.

Not offered: Government Drug Discovery (method/showcase only), Policy Evaluation (the causal engine has no computed real run; the B1 DEFRA AURN jobs in CI only fetch data), Resilience / Digital Twin (synthetic data).

### 7.10 SOVEREIGN / PUBLIC SECTOR — not offered

The sheet lists Sovereign under "DO NOT SELL YET" (§5, "Sovereign (planned)"). No route or module implements it (`docs/genesis1/RECOVERY-MATRIX.md`: PLAN, no route). TECH 0–5% · PRODUCT 0%. No price is attached here.

### 7.11 Recovered offers

| Offer | Where it came from | State | Tech / Product | Price (HYPOTHESIS) |
|---|---|---|---|---|
| Retrosynthesis / Synthesis Pack | owner sheet §1 | `campaign/retrosynthesis.mjs`, `compute/retrosynthesisAdmission.mjs`, `docs/evidence/imatinib-retrosynthesis-2026-09-27.json`; `retrosynthesis.test.mjs`. Runtime BLOCKED (model files missing), commercial BLOCKED, no UI, founder-run | 25 / 5 | €5k–€15k / project (subject to runtime availability) |
| Private Scientific Compute | owner sheet §2 | worker images chem-light / structural / admet; container gate `railway-scientific-workers.yml` green 3 times (manual); never deployed | 30 / 5 | €20k–€100k+ / year + compute |
| Discovery Partnership | owner sheet §2 | needs a lab partner and a measurement; none exists | 20 / 5 | €100k–€300k+ / programme |
| Developer API (RDKit-as-a-service) | `docs/legacy/genesis-2026-07/COMMERCIALIZATION.md` (July) | Stripe → API-key code only in `legacy/`; no per-customer keys today; conflicts with sheet §7 "we do not sell individual engines" | 20 / 0 | none in sheet; **rejected as an offer** |
| Med-chem triage app | same legacy document | superseded by Discovery Sprint | — | — |
| Commercial ledger `#/monetize` (D-057) | `MonetizeScreen`, `core/commercial/*` | internal engagement ledger, no payment adapter, unlinked | internal tool | — |
| Education / Human Lab | owner sheet §4 | Virtual Labs exist; Teach mode, classes, LMS do not | 35 / 10 | €5k–€20k / institution / year; **later**, not offered |

Never offered (sheet §5 and `RECOVERY-MATRIX.md` §2.8): Cyber (ToyVulnerableApp demo), synthetic earthquake, Mirror, CICADA without data, Sovereign, speculative physics, OMNICORE / 9D / Supreme, GNINA as a product dependency, a self-driving lab without a hardware-verified adapter.

## 8. Summary and best picks

| Offer | Tech | Prod | Price (HYPOTHESIS) |
|---|---|---|---|
| Verify | 70 | 45 | €3k–€8k / audit |
| Benchmark | 45 | 15 | €5k–€15k / project |
| Discovery Sprint | 55 | 25 | €10k–€25k / pilot* |
| Deep Discovery | 25 | 5 | not offered now |
| Synthesis Pack | 25 | 5 | €5k–€15k / project* |
| Evidence Platform | 50 | 15 | €30k–€80k / year |
| Enterprise | 25 | 5 | €80k–€200k+ / year |
| University / institute | 50 | 20 | Verify / Sprint ranges |
| Biotech / pharma | 45 | 15 | underlying offers |
| D-063 Public Evidence | 45 | 15 | €10k–€30k / pilot |
| CLOCKWORK | 40 | 15 | €10k–€30k / pilot |
| Private Compute | 30 | 5 | €20k–€100k+ / year + compute |
| Partnership | 20 | 5 | €100k–€300k+ / programme |
| Sovereign | 0–5 | 0 | not offered |

\* subject to runtime availability of required scientific engines.

**MONETIZATION READINESS: 30%** (portfolio, weighted toward the "now" offers Verify, Benchmark, Sprint). Fastest single offer: Genesis Verify 55% (mean of 70 and 45).

- **FASTEST FIRST REVENUE: Genesis Verify.** The whole flow (record export → verify → one-page report, `#/verify`) is tested with a real engine; what remains is deploy, entity, SOW and one design partner, not software. Smallest price, shortest delivery.
- **BEST MARGIN: Genesis Verify.** Compute is seconds per record (M1–M3), no GPU, no licensed model; cost is almost entirely reviewer hours. The margin itself is unmeasured: no hours or € have been recorded.
- **BEST RECURRING: Evidence Platform.** The only annual product built directly on what already exists and is tested (Evidence Pack, SQLite evidence ledger, BYT restart proofs, Verify); it is the natural renewal for Verify and Sprint customers.
- **BEST ENTERPRISE: Evidence Platform → Genesis Enterprise.** Same evidence layer with SSO, tenancy and compliance added; the highest ticket in the sheet, but ENTERPRISE_BLOCKED today (SSO, billing, backup drill, multi-replica).
- **BEST PUBLIC-SECTOR: D-063 Public Evidence.** It reuses the tamper-evident claim audit that Verify also rests on (`runClaimAudit`, tamper challenge, tests above), so one evidence layer serves both markets. Runner-up: CLOCKWORK, which the owner's deck marks "closest to B2G" but which has no evidence/replay differentiator.
- **BEST SCIENTIFIC DIFFERENTIATOR: Genesis Benchmark.** Preregistered, contamination-checked, every failure counted, and willing to publish a negative result (Run 8: DOES_NOT_GENERALISE). That is the falsification + replay discipline made visible to a buyer.

---

# 9. Refreshed monetization map — 4 October 2026

Base: branch `g1/monetization-grant` from `286822e7` (merge of PR #83). Production serves
`37197555` (`git ls-remote origin railway-production-ready`, branch `railway-production-ready`,
3 Oct 23:09 UTC). Whether the live site is reachable for a customer is **UNVERIFIED**: the
domain points at a parking page, and `production-smoke.yml` still has 0 runs.

This section **refreshes** §1–§8; it does not replace them. Every positioning the project has
earned is kept and sharpened: Genesis Verify as the fastest route to first revenue (§9.3.1),
the Evidence Platform (§9.3.6), Enterprise and the premium navigation shell (§9.3.7, §9.3.8),
grant and public-evidence positioning (§9.3.12, §9.3.13, and `docs/grant/GRANT-READINESS.md`),
and the benchmark / scientific-rigour positioning (§9.3.2). The public-safe version of the
same story is `docs/public/PUBLIC-PROOF-PACK.md`.

## 9.1 Facts that bind every row below

These are not softened anywhere in this document, and any deck built from it inherits them.

| # | Fact | Source |
|---|---|---|
| F1 | **No speed advantage may be claimed.** There is no credible competitor time measurement anywhere in the repository or in any cited source. The 2x KPI is a target with the literal status `TARGET_2X_NOT_YET_BENCHMARKED`. | `docs/benchmark/TIME-TO-DISCOVERY.md` §7 (branch `g1/timing-integrated`), D-163 |
| F2 | **There is no candidate from the GLP-1R efficacy model.** D-162 measured that the model collapses outside its own chemical series: under a preregistered distant leader-cluster split (max test-to-train Tanimoto 0.5991), MAE 3.4847, **R² −13.0013 on n = 88**, worse on the same rows than a train-mean baseline (MAE 2.2171, R² −4.9723). Outcome `EXTRAPOLATION_NOT_SUPPORTED`. It is explicitly **not** a gate verdict. | `packages/backend/src/campaign/glp1r-d162-applicability-domain.sealed.json` (branch `g1/candidate-pipeline-2`) |
| F3 | **6X18 is a GLP-1R reference structure**, not a drug candidate and not a docking target. The owner refused to register it as a docking target. | D-159 |
| F4 | **Engine truth.** RDKit, PySCF, Vina/Meeko and ADMET-AI work through the ResearchRun port and the durable queue with replay. OpenMM is **partial** (TIP3P water-box reference only, no protein–ligand MD, no replayer). Commercial ADMET is **blocked by licence** (`BLOCKED_BY_LICENSE`, enforced and tested). Retrosynthesis (AiZynthFinder) is **blocked by runtime** (`MODEL_FILES_MISSING`, in no CI job). **GNINA must not appear in the product** until its licence is settled. | `docs/evidence/consolidation/engine-truth-2026-10-03.md`, `docs/astra/COMMERCIAL_LICENSE_GATE.md`, `docs/GENESIS_RETROSYNTHESIS.md` |
| F5 | **There is no laboratory partner.** No wet-lab agreement, no hardware-verified adapter. | `docs/genesis1/GENESIS-STATUS.md` area 8; `candidateLabHandoff.test.mjs` proves only a governed request that survives a DB reopen |
| F6 | **There is no signing key.** The CSRN production key has not been generated, so every certificate and every Verify report is **UNSIGNED**. The only correct phrase is "fingerprints and replay", never "signed evidence". | `docs/keys/OWNER-CSRN-KEY-COMMANDS.md` |
| F7 | **Run 9 is not a result.** The long frozen experiment started 18:30Z on 3 October and is still computing. Its verdict is `IN_PROGRESS / FROZEN / PRE-REGISTERED`. Nothing in it may be quoted as an outcome, and the preregistration (seal A fingerprint `7f9981...2762`, seal B) is not edited by this document. Run 8's verdict `DOES_NOT_GENERALISE` stands and PoseBusters is now a development set. | `docs/evidence/run9/README.md`, `run9-ranking-prereg.json`, `run9-seal-b.json`, D-160 |
| F8 | **No customer, no LOI, no revenue.** Nothing below implies otherwise. | `docs/genesis1/GENESIS-STATUS.md` |
| F9 | **Prices come from one file only**, verbatim: `/mnt/project-files/granty/monetyzacja-source-of-truth-2026-09-29.md`, whose own rule is "Initial pricing hypotheses — to be validated with first customers." An offering with no price in that file is marked **"commercial hypothesis, no price"** and no number is invented for it. | that file |
| F10 | **Engines are third-party tools under their own licences.** They are never described as open source in Genesis material, and Genesis does not sell individual engines — it sells the workflow TASK → COMPUTE → FALSIFICATION → EVIDENCE → REPLAY → NEXT DECISION (sheet §7). | sheet §7, status-file wording rules |

## 9.2 The distinction that must be explicit everywhere

**Ready to sell** = a person can be invoiced for it this quarter, the delivery flow has real code
with a passing test or a committed evidence file, and the only remaining work is commercial
(deploy, entity, SOW, a design partner). **Demonstration** = it runs, it may even be impressive on
a screen, but what it runs on is pinned repository data, synthetic data, or a reference case — not a
customer's problem. A demonstration may be shown; it may not be priced.

The five readiness classes used below, one per offering:

| Class | Meaning | May a price be quoted? |
|---|---|---|
| **MONETIZABLE_NOW** | Sellable this quarter as a founder-run, supervised service. Blockers are commercial, not technical. | Yes — as a hypothesis from the sheet |
| **PILOT_READY** | The flow exists and is tested, but has never run on a customer's own problem. Sell only as a named pilot with a written scope and an explicit "this is a first pilot" clause. | Yes — as a hypothesis, pilot wording only |
| **ENTERPRISE_LATER** | Depends on infrastructure, security or billing that does not exist (tenancy, SSO, backup drill, multi-host, metering). Quote only after a successful pilot. | Yes — as a hypothesis, labelled "after first pilots" |
| **RESEARCH_ONLY** | A demonstration, a method showcase, or a plan. Runs on pinned, synthetic or reference data. **Never priced, never on a price slide.** | No |
| **NEEDS_PARTNER_OR_LEGAL_OR_LICENCE** | Technically conceivable but gated by something Genesis does not control: a licence, a laboratory, a dataset agreement, or a legal/ethical review. | No, until the gate opens |

Counts: **MONETIZABLE_NOW 2 · PILOT_READY 3 · ENTERPRISE_LATER 4 · RESEARCH_ONLY 7 ·
NEEDS_PARTNER_OR_LEGAL_OR_LICENCE 5** — 21 offerings, each in exactly one class. Segments (§9.4)
and explicit non-offerings (§9.5) are not offerings and are not counted.

## 9.3 The offerings

Every row carries the same twelve fields. **PRICING** is verbatim from the sheet or
"commercial hypothesis, no price". **READINESS** repeats the TECH / PRODUCT judgements of §7
where they still hold and says where they moved.

### 9.3.1 Genesis Verify — MONETIZABLE_NOW

- **CUSTOMER:** biotech and CRO computational teams, grant applicants, due-diligence firms, journal and reviewer offices.
- **PROBLEM:** a reported computational number may have been altered, may not reproduce, or may not have come from the stated engine and inputs — and today there is no cheap way to tell.
- **INPUT:** a Genesis execution record plus the sha256 the customer was given. Supervised mode: SMILES, parameters and the values the customer claims.
- **WORKFLOW:** `researchRun.mjs` → `researchRunExecution.mjs · executeResearchExperiment` → `GET /api/projects/:id/research-runs/:rid/experiments/:eid/record` → `POST /api/projects/:id/genesis-verify` → `genesisVerify.mjs · verifySubmittedRecord` (integrity, provenance, ledger anchor, replay through `campaign/verify.mjs · replayCapabilityInputs` under heavy-compute admission and the ADMET licence gate) → `renderVerifyReportHtml`. Screen `#/verify` (`VerifyScreen.tsx`).
- **DELIVERABLE:** one self-contained HTML page per record — verdict MATCH / DRIFT / TAMPERED / BLOCKED, the six checks, a plain-language meaning, the hashes, the explicit NOT-checked list, the **UNSIGNED** status and the report fingerprint — plus its JSON form and the original bundle.
- **SUPERVISION:** required. A human scopes which claims can replay, creates the runs, reads every non-MATCH and writes the cover note. This is not self-serve.
- **RUNTIME:** seconds to minutes of compute per record (RDKit seconds; Vina ≈ 2.3 core-minutes per docking, anchor M4). A 10–50 claim audit: 2–5 working days — **estimate, never measured with a customer**.
- **COST:** dominated by operator and reviewer hours; compute negligible. **€ per CPU-hour: UNKNOWN** (no hosting invoice is in the repository). **Operator hours per audit: UNKNOWN** (never run for a customer).
- **LICENCE:** RDKit (BSD-3), Vina and PySCF (Apache-2.0) are CONDITIONAL in `COMMERCIAL_LICENSE_GATE.md` until the shipped distributions are pinned. ADMET records are `BLOCKED_BY_LICENSE` for commercial use — keep ADMET out of the scope. GNINA: excluded (F4). Reports UNSIGNED (F6). No invoicing entity.
- **READINESS:** TECH 70 · PRODUCT 45. Tested with a real engine (`genesisVerify.test.mjs`: export → MATCH, one edited number → TAMPERED, forged-but-rehashed → TAMPERED via file hash and ledger anchor, missing engine/preregistration → BLOCKED; `verifyScreen.test.tsx`). Limits: only Genesis-produced records, four replayable engines, no operator-authored plan entry, no PDF export.
- **PRICING:** **€3k–€8k / audit** (sheet §1, verbatim) — HYPOTHESIS.
- **PATH TO REVENUE:** deploy main past `37197555` and confirm the domain actually serves it → add the operator plan entry (paste SMILES, parameters and the claimed value as the frozen prediction) → one-page SOW built from the report's own NOT-checked list → invoicing entity → one design partner (a computational-chemistry CRO, a biotech assembling a grant or diligence package, a reviewer office) → paid pilot at the low end. **The software is not the bottleneck.**

### 9.3.2 Genesis Benchmark — MONETIZABLE_NOW

- **CUSTOMER:** docking and scoring method developers, pharma computational teams choosing a method, investors doing technical diligence.
- **PROBLEM:** method claims are routinely tuned on contaminated or overlapping benchmarks; a buyer wants a preregistered, contamination-measured comparison in which every failure stays in the denominator.
- **INPUT:** the customer's method (a scoring command, a container or score files), the benchmark or their own dataset, and acceptance metrics agreed **before** the run.
- **WORKFLOW:** operator-run offline Python with a preregistration-fingerprint refusal: `scripts/posebusters-unseen-benchmark.py`, `astex-redock-benchmark.py`, `astex-multiseed-ensemble.py`, replays `astex-multiseed-replay.py`, `astex-gnina-replay.py`; the prereg JSON's fingerprint is recomputed and the run refuses on drift.
- **DELIVERABLE:** preregistration with its fingerprint, per-case results including every failure, a paired comparison, a verdict by the frozen criterion, replay of a subset, and a report in the shape of `docs/evidence/posebusters-run8-unseen-benchmark.md`.
- **SUPERVISION:** heavy — preparation fixes, contamination check, prereg review, write-up.
- **RUNTIME:** 2–6 weeks per project (estimate). Compute ≈ 60–80 core-hours of Vina for a 300-case, 5-seed set, scaled from anchors M4/M6, **not measured for a customer**.
- **COST:** expert hours dominate; CPU hours second; per-dataset licence checks third. **€ UNKNOWN.**
- **LICENCE:** **GNINA is excluded from any product-facing arm** until its licence is settled (F4) — a customer benchmark must score with the customer's own method or a cleared one. Meeko (LGPL) and Vina not confirmed for product use; PoseBusters data CC BY 4.0 CONDITIONAL; third-party customer binaries need the Docker sandbox, which the benchmark scripts do not yet use.
- **READINESS:** TECH 45 · PRODUCT 15. Two complete preregistered campaigns with committed evidence and replays (Astex runs 1–7, PoseBusters Run 8). No in-product harness, no customer intake.
- **PRICING:** **€5k–€15k / project** (sheet §1, verbatim) — HYPOTHESIS.
- **PATH TO REVENUE:** one method developer who can hand over a scoring command → wrap the prereg-check / run / report stages of `posebusters-unseen-benchmark.py` behind one job type that keeps the fingerprint refusal → deliver as a founder-run service. Lead with the discipline, not with a winner: the only external result Genesis has published about a ranker is **negative** (Run 8 `DOES_NOT_GENERALISE`), and that is the selling point.

### 9.3.3 Discovery Sprint — PILOT_READY

- **CUSTOMER:** an early-stage biotech or academic lab with one bounded question — a target, a series, a go/no-go.
- **PROBLEM:** getting from a question to a falsifiable, executed, replayable experiment and a justified next step is slow and leaves no audit trail.
- **INPUT:** the question, molecules or a target, acceptance criteria, data classification (`customerResearchDelivery.mjs · onboardingOf`).
- **WORKFLOW:** `researchRun.mjs` (`startResearchRun`, `proposeResearchPlan`) → `researchRunLiterature.mjs` (Europe PMC + PubMed) → `researchRunExecution.mjs` (preregister, engine, `sealExperimentSession` verdict, evidence proposal, replay, `nextExperimentProposal`) → `researchRunJobs.mjs` lease queue → fan-out and advance (`researchRunFanOut.test.mjs`, `researchRunAdvance.test.mjs`, which stops at human review) → `researchRunEvidencePack.mjs` → `customerResearchDelivery.mjs · GENESIS_RESEARCH_SPRINT`; watched on `#/flight-control`.
- **DELIVERABLE:** a computational report — sources, hypotheses, frozen predictions, engine runs, protocol verdicts, replay, next experiments — plus the Evidence Pack and per-experiment Verify reports.
- **SUPERVISION:** a scientist reviews the plan, every verdict and each next step. Evidence publication is a human decision by design.
- **RUNTIME:** 2–4 weeks per pilot (estimate). Per experiment: seconds (RDKit) to minutes (Vina).
- **COST:** scientist hours, LLM tokens, engine CPU. **LLM tokens are not metered anywhere in Genesis**, so token cost per run is **UNKNOWN**; **€ UNKNOWN**.
- **LICENCE:** the sheet's Sprint scope names "ADMET/Tox", which is `BLOCKED_BY_LICENSE` for commercial use. **Either the SOW drops the ADMET/Tox line, or this offering moves to NEEDS_PARTNER_OR_LEGAL_OR_LICENCE.** Meeko to confirm; ChEMBL CC BY-SA share-alike applies to any delivered data; engines are not verified live on production, hence the sheet's "subject to runtime availability".
- **READINESS:** TECH 55 · PRODUCT 25. `goldenResearchRun.e2e.test.mjs` (real engine, worker crash, restart, recovery, replay MATCH), `researchRunEngines.real.test.mjs`, `customerResearchDelivery.test.mjs`. Limits: no real model in the loop in any test (the plan is a frozen model answer), **no customer-scale run, and no real GLP-1R run** (`completion-matrix-2026-10-03.md`: GLP-1R ResearchRun `BLOCKED_EXTERNAL`).
- **PRICING:** **€10k–€25k / pilot (subject to runtime availability)** (sheet §1, verbatim) — HYPOTHESIS.
- **PATH TO REVENUE:** deploy, then one worker with Vina live → run one real question end to end → offer it to a Verify customer as the next step, never as the first sale.

### 9.3.4 Deep Discovery — NEEDS_PARTNER_OR_LEGAL_OR_LICENCE

- **CUSTOMER / PROBLEM / INPUT:** as the Sprint, for a customer who wants quantum chemistry, molecular dynamics and a synthesis route on top.
- **WORKFLOW (sheet scope):** Sprint + PySCF + OpenMM + falsification + AiZynthFinder retrosynthesis.
- **DELIVERABLE:** the Sprint report plus QM, MD and route evidence.
- **SUPERVISION:** as the Sprint, plus a computational chemist Genesis does not employ.
- **RUNTIME / COST:** not measured. **UNKNOWN.**
- **LICENCE / GATE:** PySCF works only for small molecules and small bases (≤ 12 atoms, STO-3G/3-21G/6-31G). OpenMM is a water-box reference with no protein–ligand MD and no replayer. AiZynthFinder is `BLOCKED_BY_RUNTIME: MODEL_FILES_MISSING` and in no CI job; commercial retrosynthesis is blocked by admission.
- **READINESS:** TECH 25 · PRODUCT 5.
- **PRICING:** sheet §1 lists **€20k–€50k / project (subject to runtime availability)** — recorded for completeness; **do not offer**, so do not quote.
- **PATH TO REVENUE:** none until a protein–ligand MD path with a replayer and a retrosynthesis runtime both exist.

### 9.3.5 Retrosynthesis / Synthesis Pack — NEEDS_PARTNER_OR_LEGAL_OR_LICENCE

- **CUSTOMER:** a team that has a molecule and needs a defensible route and identity evidence.
- **PROBLEM:** a proposed route without provenance or a replay is not reviewable.
- **INPUT:** the molecule and its identity claim.
- **WORKFLOW:** `campaign/retrosynthesis.mjs`, `compute/retrosynthesisAdmission.mjs`; one committed example, `docs/evidence/imatinib-retrosynthesis-2026-09-27.json`; `retrosynthesis.test.mjs`.
- **DELIVERABLE:** route plus identity and route evidence with replay.
- **SUPERVISION:** founder-run; there is no UI.
- **RUNTIME / COST:** **UNKNOWN** (the runtime does not exist).
- **LICENCE / GATE:** runtime BLOCKED (model files missing), commercial admission BLOCKED.
- **READINESS:** TECH 25 · PRODUCT 5.
- **PRICING:** sheet §1 lists **€5k–€15k / project (subject to runtime availability)** — recorded; not offered.
- **PATH TO REVENUE:** install and pin the retrosynthesis model files, put the path in a CI job, then resolve commercial admission.

### 9.3.6 Genesis Evidence Platform — ENTERPRISE_LATER

- **CUSTOMER:** research organisations that want their own computations recorded with custody, replay and evidence review in one place.
- **PROBLEM:** lab notebooks and pipelines do not keep tamper-evident, replayable provenance tied to the claim they support.
- **INPUT:** their users, their projects, computations run through Genesis engines.
- **WORKFLOW:** hash-chained research state (`agentRun.mjs · appendServerResearchStateEvent`), evidence ledger on SQLite schema V16 (`knowledgeApi.mjs`, safe with several processes), canonical Evidence Pack (`researchRunEvidencePack.mjs` — builder, verifier, route; rejects mutated parameters, data, artifacts, verdict or engine identity and missing provenance), artifact custody (`researchRunArtifacts.mjs`, `compute/localArtifactStorageBackend.mjs`), BYT projection (`bytProjection.mjs`), audit chain (`security/auditChain.mjs`), Reviewer Room `#/reviewer`, Verify for exports.
- **DELIVERABLE:** a hosted workspace plus Evidence Pack and Verify exports.
- **SUPERVISION:** an operator for onboarding and support; a reviewer for evidence publication.
- **RUNTIME:** weeks to onboard once the infrastructure exists (estimate).
- **COST:** hosting plus artifact-storage growth. **€ UNKNOWN**; **bytes per run UNKNOWN** (never measured).
- **LICENCE:** data-processing terms, no GDPR export/deletion workflow, no billing, everything UNSIGNED.
- **READINESS:** TECH 50 · PRODUCT 15. `docs/genesis1/BYT-VERIFICATION.md` records 12 requirements PASS with real RDKit and real SIGKILL; `knowledgeLedgerMultiInstance.test.mjs`, `researchRunEvidencePack.test.mjs`, `bytProjectionRestart.test.mjs`. Limits: one host, one SQLite file, no backup/restore drill (only a pre-migration snapshot), no tenant or organisation model, no API keys.
- **PRICING:** **€30k–€80k / year** (sheet §2, verbatim, "after first successful pilots") — HYPOTHESIS.
- **PATH TO REVENUE:** convert a successful Verify or Benchmark customer into an annual pilot after a deploy and a real backup/restore drill.

### 9.3.7 Genesis Enterprise — ENTERPRISE_LATER

- **CUSTOMER:** pharma, large CROs and institutions needing a dedicated or on-premise deployment.
- **PROBLEM:** the Evidence Platform's problem under enterprise security, governance and procurement rules.
- **INPUT:** an IdP, data-residency rules, a security questionnaire, procurement terms.
- **WORKFLOW:** the Evidence Platform plus enterprise controls that do not exist yet.
- **DELIVERABLE:** a dedicated deployment, an SLA, compliance evidence.
- **SUPERVISION:** dedicated support and security staff.
- **RUNTIME:** 6–12 months after the infrastructure decisions (estimate).
- **COST:** **UNKNOWN** — the dedicated infrastructure has not been designed.
- **LICENCE:** no SSO/OIDC/SAML, SCIM, MFA, API keys, billing or metering, KMS, SOC 2 / ISO evidence, pen-test or legal entity (`docs/evidence/consolidation/saas-readiness-2026-10-03.md`: `ENTERPRISE_BLOCKED`).
- **READINESS:** TECH 25 · PRODUCT 5. What exists: scrypt auth, 256-bit hashed session tokens, RBAC viewer/editor/admin/owner, project isolation, CSP and security headers, an append-only audit chain, the commercial release admission gate and the engine licence gate.
- **PRICING:** **€80k–€200k+ / year** (sheet §2, verbatim, "after first successful pilots") — HYPOTHESIS.
- **PATH TO REVENUE:** only after Evidence Platform pilots. Not before.

### 9.3.8 Premium navigation and the enterprise product shell — ENTERPRISE_LATER

- **CUSTOMER:** the same buyers as 9.3.6 and 9.3.7; this is what makes those two look like a product rather than a script.
- **PROBLEM:** an institutional buyer will not adopt a research tool whose surface cannot be navigated by someone who did not build it.
- **INPUT:** none from the customer.
- **WORKFLOW:** the navigation layer and the delivery screens — `core/navigation.ts`, `core/search.ts`, `#/flight-control`, `#/verify`, `#/reviewer`, `#/evidence`, and the Lab handoff and Reports screens delivered on `g1/deliver-screens` (`LabHandoffScreen.tsx`, `ReportsScreen.tsx`, `deliverScreens.test.tsx`, browser proof `scripts/lab-handoff-ui-proof.mjs`) — plus the premium-asset acceptance gate (`docs/GENESIS_PREMIUM_ASSET_ACCEPTANCE_GATE.md`) and the ASTRA visual audit.
- **DELIVERABLE:** a navigable, phone-width product surface; 66/66 views mechanically clean at 6 viewports per the central audit.
- **SUPERVISION:** none at runtime.
- **RUNTIME / COST:** not applicable.
- **LICENCE:** the premium-asset gate is fail-closed for any paid third-party asset; no paid asset has been admitted.
- **READINESS:** TECH 65 · PRODUCT 20 (the UI/product area of the status file). Limits: the Playwright specs in `packages/e2e/src/` do not run in CI, real phones are untested, and the surface is not deployed.
- **PRICING:** **commercial hypothesis, no price.** The sheet has no line for navigation or UX, and it must never be invoiced separately.
- **PATH TO REVENUE:** none of its own — it raises the win rate of 9.3.6 and 9.3.7 and it is what a buyer is shown in a demo. Treat it as a cost of selling, not as a product.

### 9.3.9 Private Scientific Compute — ENTERPRISE_LATER

- **CUSTOMER:** an organisation that cannot run its computations on shared infrastructure.
- **PROBLEM:** data residency and capacity for scientific jobs.
- **INPUT:** their jobs and their residency constraints.
- **WORKFLOW:** worker images chem-light / structural / admet behind the container gate `railway-scientific-workers.yml`; the remote ResearchRun worker over HTTP (`remoteWorker.mjs`, `remoteWorkerApi.mjs`, `remoteWorkerMain.mjs`, with `remoteWorker.e2e.test.mjs` proving a separate worker process claiming and taking over leases, and `remoteWorkerApi.test.mjs`).
- **DELIVERABLE:** dedicated workers and usage-based compute.
- **SUPERVISION:** operator.
- **RUNTIME:** **UNKNOWN** — never deployed. The container gate has 3 green **manual** runs; the remote-worker CI gate had 0 runs when the sheet was audited.
- **COST:** **€ per CPU-hour UNKNOWN.** No hosting invoice exists in the repository. To measure: the bill for one worker container divided by its CPU-hours, and per-job durations from the `jobs` table (claim → completion).
- **LICENCE:** per-engine licences travel with the worker image; ADMET images cannot be used commercially.
- **READINESS:** TECH 30 · PRODUCT 5. There is **no GPU and no HPC** anywhere; per the owner's 3 Oct decision the phrase is "private compute / dedicated workers", never "GPU/HPC".
- **PRICING:** **€20k–€100k+ / year + compute** (sheet §2, verbatim) — HYPOTHESIS.
- **PATH TO REVENUE:** deploy one remote worker, measure € per CPU-hour, then attach it to an Evidence Platform pilot.

### 9.3.10 Discovery Partnership — NEEDS_PARTNER_OR_LEGAL_OR_LICENCE

- **CUSTOMER:** a biotech or CRO willing to run a joint programme.
- **PROBLEM:** a computational programme is only worth funding if something gets made and measured.
- **INPUT:** their target, their chemistry, their laboratory.
- **WORKFLOW:** the Sprint loop plus a wet-lab handoff. The handoff request is governed and survives a DB reopen (`candidateLabHandoff.test.mjs`, `apiLabClosedLoop.test.mjs`, `retrosynthesisHandoff.test.mjs`) but the closed loop is proven **on simulation only**.
- **DELIVERABLE:** a joint research programme.
- **SUPERVISION:** full, on both sides.
- **RUNTIME / COST:** **UNKNOWN.**
- **LICENCE / GATE:** **no laboratory partner exists** (F5), **no hardware-verified adapter**, and **no candidate** — F2 removed the GLP-1R efficacy model as a source of one, and F3 keeps 6X18 as a reference structure.
- **READINESS:** TECH 20 · PRODUCT 5.
- **PRICING:** **€100k–€300k+ / programme** (sheet §2, verbatim, "after first successful pilots") — HYPOTHESIS, not offered.
- **PATH TO REVENUE:** a laboratory partner first, then a measurement, then a programme. In that order.

### 9.3.11 Candidate pipeline and the scientist challenge pack — RESEARCH_ONLY

> **PLACEHOLDER — owned by another agent.** The candidate pipeline and the scientist challenge
> pack are being written by the agent that owns `g1/candidate-pipeline-2` and the D-164…D-168
> decision range. **Their result belongs here and is not written by this document.** What is
> fixed for them in advance, and may not be softened by whatever they find: D-162
> (`EXTRAPOLATION_NOT_SUPPORTED`, R² −13.0013 on n = 88) means **there is no candidate from the
> GLP-1R efficacy model**; D-164's own preregistration states that every molecule its runner
> builds is a BRICS product with no measured activity and no prior-art check and that **none may
> be named a candidate or a lead**; D-159 keeps 6X18 a reference structure and registers no
> docking target. Until their sealed artefact exists, this offering stays RESEARCH_ONLY with
> **no price**, and anything potentially patentable stays under `IP_REVIEW_REQUIRED`.
>
> **Fill in here:** sealed artefact path · outcome string · what it does and does not license
> Genesis to say commercially.

- **PRICING:** **commercial hypothesis, no price.**

### 9.3.12 D-063 Public Evidence — PILOT_READY

- **CUSTOMER:** public agencies, auditors, oversight bodies.
- **PROBLEM:** a published official claim cannot be re-checked by the public, and a tampered copy is indistinguishable from the original.
- **INPUT:** a published claim and the bytes behind it.
- **WORKFLOW:** `packages/frontend/src/core/govServices/govClaimAudit.ts · runClaimAudit`, `govParametricTrigger.ts`, and the tamper challenge `core/reviewer/tamperChallenge.ts · runTamperChallenge` in Reviewer Room `#/reviewer`, which runs the real claim audit against pinned SURPASS-2 bytes, a forged copy and an unanchored forgery.
- **DELIVERABLE:** a claim audit, a parametric trigger certificate and the evidence behind both.
- **SUPERVISION:** full.
- **RUNTIME:** weeks per pilot (estimate); compute negligible (browser-side).
- **COST:** staff hours. **€ UNKNOWN.**
- **LICENCE:** public procurement, a data-processing agreement, a legal entity. The trigger certificate is **UNSIGNED** (F6).
- **READINESS:** TECH 45 · PRODUCT 15. `d063BaselineComparisonAndGovServices.test.ts`, `reviewerTamperChallenge.test.ts`. **Limit that makes this a pilot and not a product: it runs on pinned repository bytes, not on a customer's data.**
- **PRICING:** **€10k–€30k / pilot** (sheet §3, verbatim, "after pilot / validation") — HYPOTHESIS.
- **PATH TO REVENUE:** one unpaid demonstration on a public body's **own** published claim, then a paid pilot.

### 9.3.13 CLOCKWORK — PILOT_READY

- **CUSTOMER:** public offices with statutory deadlines.
- **PROBLEM:** statutory deadline arithmetic is done by hand and is not auditable.
- **INPUT:** the office's deadlines and processes.
- **WORKFLOW:** `packages/core/src/mythos/clockwork/ClockworkEngine.ts` (KPA deadline arithmetic) and `ClockworkDashboard` at `#/clockwork`.
- **DELIVERABLE:** a deadline register with an audit trail.
- **SUPERVISION:** full.
- **RUNTIME / COST:** weeks per pilot (estimate); compute negligible. **€ UNKNOWN.**
- **LICENCE:** procurement, data-processing agreement, entity.
- **READINESS:** TECH 40 · PRODUCT 15. `clockwork.test.ts`, `clockworkDashboard.test.tsx`, `clockworkRegister.test.ts`. Limit: no integration with any office system; roles come later.
- **PRICING:** **€10k–€30k / pilot** (sheet §3, verbatim) — HYPOTHESIS.
- **PATH TO REVENUE:** the owner's deck calls this the closest thing to B2G. It is also the one offering with **no evidence-and-replay differentiator**, so it competes on ordinary software merits.

### 9.3.14 Government Drug Discovery — RESEARCH_ONLY

Method showcase only: screening → falsification → safety gate → evidence as a described method, with
no public-sector run behind it and **no candidate** (F2, F3). Sheet §3 lists €20k–€60k / pilot; it is
recorded here and **must not appear on a price slide**. TECH/PRODUCT: not separately assessed —
**UNKNOWN**.

### 9.3.15 Policy Evaluation — RESEARCH_ONLY

The causal-inference path has **no computed real run**; the B1 DEFRA AURN jobs in CI only fetch data
(`docs/B1_ULEZ_NO2_ADJUDICATION_REAL_DATASET_AND_EXPERIMENT.md`). Sheet §3 lists €20k–€60k / project;
recorded, not offered. TECH/PRODUCT **UNKNOWN**.

### 9.3.16 Resilience / Digital Twin — RESEARCH_ONLY

Runs on synthetic data (`docs/EARTHQUAKE_DEMO_ENVELOPE.md`, `EARTHQUAKE_VERTICAL_SLICE_INDEPENDENT_AUDIT.md`).
Sheet §3 lists €30k–€100k+ / project and §4 lists an earthquake/hazard vertical at €30k–€100k pilot /
€100k–€300k+ year, both conditional on real DEM, GMPE, exposure and calibration. Recorded, not offered.

### 9.3.17 Sovereign — RESEARCH_ONLY

Sheet §5 puts Sovereign under "do not sell yet"; `docs/genesis1/RECOVERY-MATRIX.md` records PLAN with
no route. TECH 0–5 · PRODUCT 0. Sheet §4 lists €50k–€150k pilot / €150k–€500k+ year as a future
hypothesis; **no price is attached to it here**.

### 9.3.18 Cyber — RESEARCH_ONLY

ToyVulnerableApp state; sheet §5 forbids attaching revenue to it. Sheet §4's conditional hypothesis
(€20k–€75k pilot / €75k–€250k+ year) requires real logs or SIEM data and a real incident validation,
neither of which exists. Not offered.

### 9.3.19 Education / Human Lab — RESEARCH_ONLY

Virtual Labs exist as demonstrations; **Teach mode, classes and any LMS integration do not exist**
(owner-accepted audit note, 29 Sep 03:35Z). Sheet §4 lists €5k–€20k / institution / year as a future
vertical. Not offered.

### 9.3.20 Radiology / DICOM / NIfTI — NEEDS_PARTNER_OR_LEGAL_OR_LICENCE

Needs a real dataset agreement, a UI and external clinical validation
(`docs/QWEN-D139-DICOM-NIFTI-ANATOMICAL-DATA-BRIEF.md`). §7 of the earlier matrix marked it 🔴 "do
not sell yet". Sheet §4 lists €20k–€60k / pilot conditionally. Not offered, and nothing clinical may
be implied.

### 9.3.21 CICADA — NEEDS_PARTNER_OR_LEGAL_OR_LICENCE

The sheet's own condition is "real procurement data + legal/ethical review". The engine exists;
neither condition is met. Sheet §4 lists €20k–€75k pilot / €75k–€250k+ year conditionally. Not
offered.

## 9.4 Segments — routes to market, not separate offerings

These are kept from §7.7 and §7.8 because they are how the offerings above reach a buyer. They
carry no class and no price of their own.

| Segment | Entry offering | Expansion | What blocks it |
|---|---|---|---|
| University / research institute, grant office | Genesis Verify (9.3.1) — a reproducibility audit paid from a grant budget | Discovery Sprint, then Evidence Platform | Academic procurement; the Education line does not exist |
| Biotech / pharma | Genesis Verify or Genesis Benchmark | Discovery Sprint → Evidence Platform → Enterprise → Partnership | ADMET and retrosynthesis licence gates; no laboratory; **no candidate** (F2) — never lead with "discovery" |
| Public sector | D-063 Public Evidence (9.3.12) or CLOCKWORK (9.3.13) | Evidence Platform | Procurement, data-processing agreements, no entity, UNSIGNED certificates |

## 9.5 Explicitly not offerings

Preserved from the earlier matrix so the decision is not relitigated. None of these is counted,
priced, or shown as a product: the Developer API / RDKit-as-a-service (rejected — sheet §7 forbids
selling individual engines), the legacy med-chem triage app (superseded by the Discovery Sprint),
the internal commercial ledger `#/monetize` (an internal engagement ledger with no payment adapter),
Mirror, CICADA without data, speculative physics, OMNICORE / 9D / Supreme, **GNINA as a product
dependency**, and a self-driving laboratory without a hardware-verified adapter.

## 9.6 The six named picks

| Pick | Winner | Why, and what is measured |
|---|---|---|
| **Fastest first revenue** | **Genesis Verify** (9.3.1) | The whole flow — record export → verify → one-page report, with the `#/verify` screen — is tested with a real engine. What remains is deploy, entity, SOW and one design partner: commercial work, not software. Smallest ticket (€3k–€8k) and shortest delivery in the sheet. |
| **Best margin** | **Genesis Verify** (9.3.1) | Compute is seconds per record, no GPU, no licensed model; cost is almost entirely reviewer hours. **The margin itself is unmeasured: no hours and no € have ever been recorded.** |
| **Best recurring** | **Genesis Evidence Platform** (9.3.6) | The only annual line built directly on what already exists and passes tests — Evidence Pack, SQLite evidence ledger, BYT restart and SIGKILL proofs, Verify exports — and the natural renewal for a Verify or Benchmark customer. Gated on a backup/restore drill and a tenant model, not on new science. |
| **Best enterprise** | **Evidence Platform → Genesis Enterprise** (9.3.6 → 9.3.7) | Same evidence layer with SSO, tenancy and compliance added; the highest ticket in the sheet (€80k–€200k+ / year). Today `ENTERPRISE_BLOCKED`. The premium navigation shell (9.3.8) is what makes it demonstrable. |
| **Best public** | **D-063 Public Evidence** (9.3.12) | It reuses the tamper-evident claim audit that Verify also rests on, so one evidence layer serves both markets, and a public body can watch the tamper challenge fail a forged copy. Runner-up CLOCKWORK, which the owner's deck calls closest to B2G but which has no evidence-and-replay differentiator. |
| **Best differentiator** | **Genesis Benchmark** (9.3.2) | Preregistered with a fingerprint that refuses to run on drift, contamination measured, every failure kept in the denominator, and a **published negative result** (Run 8 `DOES_NOT_GENERALISE`). That is falsification-and-replay discipline a buyer can inspect. It is **not** a speed claim: there is no competitor time anywhere (F1). |

## 9.7 Portfolio number

**MONETIZATION READINESS: 30%**, unchanged from §8 and from `docs/genesis1/GENESIS-STATUS.md`.
Nothing that moves this number happened between 3 and 4 October: the production SHA advanced to
`37197555` but the domain is a parking page, so no offering became deployed-and-reachable; D-162
removed a candidate rather than adding one; Run 9 is still computing. Fastest single offer:
**Genesis Verify at 55%** (the mean of TECH 70 and PRODUCT 45).

What stops the first invoice is still not code: a deploy whose URL actually answers, an invoicing
entity, a one-page SOW, licence confirmation for RDKit / Vina / PySCF in this specific use, and one
design partner.
