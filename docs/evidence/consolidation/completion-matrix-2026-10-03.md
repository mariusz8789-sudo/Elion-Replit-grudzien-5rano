# Completion Matrix — main d97759e6 (rollback before #58: 97940b8c; #58 = 122ef7da)

Lightweight table, not a product module. Status: DONE_GREEN / PARTIAL_IN_REPO / BLOCKED_EXTERNAL / NOT_APPLICABLE.
"Local" = this sandbox (Node, RDKit 2026.03.6 installed with pip). "CI" = .github/workflows/ci.yml, which sets GENESIS_REQUIRE_ENGINES=rdkit, so a skipped RDKit test fails CI instead of passing silently.

| CAPABILITY | TESTS | ENVIRONMENT | RESULT | EVIDENCE | STATUS | LIMITATION |
|---|---|---|---|---|---|---|
| Real RDKit ResearchRun + knowledge loop (2 runs, one supported, one refuted, restart, recall) | knowledgeLoop.test.mjs (13) | local with RDKit; CI | 13 pass, 0 skipped locally; CI backend job green on 7d2be426 | `node --test src/knowledgeLoop.test.mjs` | DONE_GREEN | Single-node SQLite; recall is lexical+hashed trigram, no learned embeddings |
| ResearchRun pause → restart → resume → cancel on one verified chain | researchRunControl.test.mjs | local, CI | green | CI 40/40 on #58 | DONE_GREEN | Single node |
| Durable lease queue, retries, dead-letter, timeout, cancel, restart | scientificWorkerRuntime.test.mjs, workerInfrastructureContract.test.mjs | local, CI | green | CI 40/40 | DONE_GREEN | Single-node proof only |
| Bounded fan-out: 1 parent run, 32 child jobs, 4 concurrent workers, 1 poisoned child isolated | scientificFanOut.test.mjs (new) | local | 1 pass: 31 SUCCEEDED, 1 DEAD_LETTER, each executed once, distinct record hashes | `node --test src/scientificFanOut.test.mjs` | DONE_GREEN | Workers are in one process on one SQLite file, so this is not multi-replica proof |
| Queue wired into the server request path | none end to end | — | queue is not started by server.mjs | grep server.mjs | PARTIAL_IN_REPO | Needs a worker bootstrap in server.mjs |
| Multi-replica / shared queue / object storage | admitMultiReplicaWorkerInfrastructure test | — | BLOCKED by contract | workerInfrastructureContract.mjs | BLOCKED_EXTERNAL | Owner: provision a shared queue backend and object storage |
| Engine licence gate (ADMET, retrosynthesis) | engineUsePurpose.test.mjs, apiCompute.test.mjs | local, CI | green | #58 | DONE_GREEN | COMMERCIAL_PRODUCT stays BLOCKED_BY_LICENSE until licences are resolved |
| Generated analysis retry (failed only, success never re-run) | generatedScientificAnalysis.test.mjs | local, CI | green | #58 | DONE_GREEN | — |
| Docker sandbox isolation | CI job "Real scientific sandbox" | CI | green | CI 40/40 | DONE_GREEN | Attestation is declared policy enforced by run arguments, labelled as such |
| One Laboratory with modes | laboratoryModes.test.ts | local | pass | #58 | DONE_GREEN | Two experiment stores (kernelLedger, scienceMemory) still separate |
| Unified experiment store for labs | — | — | not done | — | PARTIAL_IN_REPO | Surface both in ScientificMemoryScreen or merge |
| Engines PySCF / OpenMM / Vina / ADMET executors | per-engine *ResearchRunExecutor.test.mjs | CI (PySCF benchmark job) | RDKit and PySCF proven in CI; others not re-verified here | CI job names | PARTIAL_IN_REPO | Per-engine real-run proof still to be confirmed one by one |
| GLP-1R ResearchRun | none | — | no real run exists | knowledgeLoop test shows corpus.researchRuns = 0 | BLOCKED_EXTERNAL | No GLP-1R docking target is registered and RCSB/Reactome/HPA/ChEMBL hosts are denied; answers about GLP-1R come from sealed artifacts and decisions, not from a run |
| Run 9 data (Zenodo 14794785 annotations.csv) | probe doc | — | BLOCKED_EXTERNAL_NETWORK | docs/evidence/run9/zenodo-access-probe-2026-10-03.md, 01716c01 | BLOCKED_EXTERNAL | Owner: Project settings → Environment → Network access = Custom, keep default allowlist, add zenodo.org (new sessions only). Then fetch only that record, verify version, size, hashes, build the 300 cases, STOP before Run 9 |
| Run 9 execution | — | — | not started | — | BLOCKED_EXTERNAL | Needs his separate "startuj Run 9" |
| Epistemic vocabularies adapter, capabilities from toolchain | — | — | not done | — | PARTIAL_IN_REPO | ~15 vocabularies still to map |
| Hash-chain primitive shared frontend/backend | — | — | not done | — | PARTIAL_IN_REPO | — |
| Visual QA 1920/1440/1366 and 390/412/360 on current main | partial earlier screenshots | — | not complete | /tmp shots only | PARTIAL_IN_REPO | Needs a full pass with PASS/FAIL per surface |
| Commercial surface / monetization proof | — | — | not verified | — | PARTIAL_IN_REPO | Licences, accounts, secrets unresolved |
| Production preflight / deploy | — | — | not run | — | NOT_APPLICABLE until "wdrażaj" | Deploy only on his word in the Human Explorer thread |
