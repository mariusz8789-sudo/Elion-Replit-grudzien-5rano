# Genesis monetization readiness — 2026-10-03

Base: `origin/main` 5f52356a plus branch `g1/monetization-verify` (this document and Genesis Verify). Sources: the code paths named below, `docs/evidence/GENESIS-CENTRAL-AUDIT-2026-10-03.md`, `docs/GENESIS_SAAS_ENTERPRISE_READINESS.md`, `docs/astra/COMMERCIAL_LICENSE_GATE.md`, `docs/astra/CUSTOMER_RESEARCH_WORKFLOW.md`.

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
3. **Owner actions before invoicing:** deploy main ("wdrażaj"); decide whether to ship UNSIGNED reports (honest and acceptable for a pilot) or generate the CSRN key first; confirm RDKit (BSD), Vina and PySCF (Apache-2.0) licence status in `COMMERCIAL_LICENSE_GATE.md` for this use; put an invoicing entity in place (the audit notes the legal entity comes after Hub71); write a one-page SOW that lists what is NOT checked, using the report's own list.
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
- No upload UI in the frontend; API only.
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
