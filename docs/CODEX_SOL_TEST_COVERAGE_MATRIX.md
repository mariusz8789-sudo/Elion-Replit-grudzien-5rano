# Codex/Sol test coverage matrix

Branch: `codex/sol-master-execution`  
PR: #56  
Rule: `DONE/GREEN` requires an executed test and a concrete evidence reference. A contract, adapter, fixture or skipped runtime test alone is not runtime proof.

| Capability | Test | Environment | Result | Evidence | Status | Limitation |
|---|---|---|---|---|---|---|
| Golden ResearchRun: question → plan → frozen prediction → RDKit → falsification → Evidence proposal → Replay → next experiment | `researchRun.test.mjs`, `researchRunExecution.test.mjs`, `finalScientificIntegration.test.mjs` | Local Windows/Node + real file SQLite; Linux quality gate | PASS locally; Linux rerun pending for current HEAD | Canonical ResearchRun event chain, `science_runs`, Replay verification rows; PR #56 CI | GREEN for bounded RDKit path | Evidence remains a proposal until human publication; verdict is protocol-scoped |
| Restart and recovery | Real server process is killed and restarted against the same SQLite file in `researchRun.test.mjs`; BYT restart fixture in `bytProjectionRestart.test.mjs` | Local Windows/Node + file SQLite | PASS | Recovered identical run/event chain and BYT projection | GREEN for single-node persistence | Distributed failover is not proven |
| Pause/resume/cancel | `researchRunControl.test.mjs`: pause → close DB → reopen → resume → cancel | Local Windows/Node + file SQLite | PASS; 15/15 focused lifecycle tests PASS | One AgentRun identity and one verified ResearchRun hash-chain containing `RUN_CONTROLLED` events | GREEN for canonical lifecycle control | In-flight remote engine cooperative cancellation still depends on the worker cancellation path |
| Canonical BYT projection | `bytProjection.test.mjs`, `bytProjectionRestart.test.mjs` | Local Windows/Node | PASS | Prediction Ledger, scoped calibration, Necropolis and integrity projection from canonical state | GREEN as read model | No separate BYT store; surprise event and probabilistic calibration remain PARTIAL |
| Durable worker execution | `scientificWorkerRuntime.test.mjs` | Isolated local Node test | 5 PASS, 0 fail, 0 cancelled at `13d1d484` | Queue row → lease → canonical `EngineExecutionRecord` → persisted result; retry/restart/cancel/dead-letter/timeout assertions | GREEN for single-node SQLite worker | Shared multi-replica queue remains external infrastructure work |
| Durable worker timeout | `scientificWorkerRuntime.test.mjs`: executor ignores abort | Isolated local Node test | PASS in 1.01 s at `13d1d484`; Linux rerun pending | Persisted `JOB_TIMEOUT` + `TIMEOUT`, final dead-letter; deadline remains event-loop referenced | GREEN locally | Await Linux quality gate confirmation |
| Worker admission and HTTP security | `apiCompute.test.mjs`, `computeAdmission.test.mjs`, `workerContract.test.mjs`, `workerHttp.test.mjs`, `workerClient.test.mjs` | Local Node; Linux CI | PASS in prior full runs | Authenticated execution endpoints, passive health, bounded request/output/timeout, audit metadata | GREEN for one process | Rate/concurrency limiter is `NOT_MULTI_REPLICA_SAFE` |
| Literature foundation | `literatureFoundation.test.mjs` | Deterministic fixtures | PASS | Canonical source identity, deduplication, provenance, licence and retrieval states | GREEN as contract/connector | Live provider availability and complete commercial rights are not deterministic test claims |
| Literature → ResearchRun | `researchRunLiteraturePort.test.mjs` | Deterministic fixtures | PASS | Claim links remain `PROPOSED`/`NOT_EVIDENCE`; linker failure is surfaced | GREEN as thin port | Automated extraction is not admitted as Evidence |
| PySCF | `pyscfResearchRunExecutor.test.mjs`; Linux real PySCF benchmark CI job | Local runtime probe + Linux CI | Local `BLOCKED_BY_RUNTIME`; Linux benchmark previously PASS, current HEAD pending | H₂ RHF/STO-3G request, versions, hashes and execution record | PARTIAL | Product worker runtime must be deployed and probed |
| Vina/Meeko | `vinaResearchRunExecutor.test.mjs`, packaging/runtime probes | Local runtime probe | Contract tests PASS; runtime absent locally | Fixed target/ligand/box/seed and fail-closed execution record | PARTIAL | No current local real docking runtime proof |
| ADMET | `admetResearchRunExecutor.test.mjs`, `admetEngine.test.mjs` | Local runtime probe | Contract tests PASS; runtime and commercial gate BLOCKED | Exact estimate classification and separate code/weights/data rights fields | BLOCKED_EXTERNAL_LICENCE | Weights/training-data commercial rights are not approved |
| OpenMM | `openmmResearchRunExecutor.test.mjs`, existing MD reference tests | Local runtime probe | Contract tests PASS; runtime absent locally | Pinned protocol and fail-closed record | PARTIAL | Candidate-specific topology/protocol and deployed runtime are unproven |
| Retrosynthesis | admission and campaign tests | Local Node | PASS for fail-closed gate | Separate model/template/stock identity and licence blockers | BLOCKED_EXTERNAL_LICENCE_DATA | No admitted model/template/stock bundle; no route is claimed |
| Generated scientific code sandbox | `scientificSandboxContract.test.mjs` | Contract tests only | 7 PASS | Immutable image requirement, Python-only request, no secrets/host FS/network, fixed limits | BLOCKED_EXTERNAL_SANDBOX | No attested container backend or adversarial escape proof; generated code remains disabled |
| Artifact custody | ingestion, ArtifactRef and storage-port tests | Local Node/in-memory provider fixture | PASS | Server-side SHA-256, source identity, size/MIME and producer/run/experiment refs | GREEN as contract | Production object storage provider is not configured |
| UI integration and responsive visual QA | Frontend unit suite plus automated browser capture at 1920×1080, 1440×900, 1366×768, 412×915, 390×844 and 360 px | Local Chromium/SwiftShader | 7,552 PASS, 1 skip; 60 visual states, 0 page errors, 0 unintended horizontal overflow | `artifacts/astra-visual-polish/` (local review artifacts) and frontend test report | GREEN for tested routes/viewports | Software rasterization is not real-GPU performance proof; artifacts intentionally remain untracked |
| Commercial admission | commercial readiness/gate tests | Local Node | PASS | Missing rights, runtime, production evidence or buyer proof fail closed | GREEN as release gate | A green product release still needs external rights, runtime and customer evidence |
| Full repository quality gate | GitHub Actions quality gate | Ubuntu runners | Previous HEAD: 36 checks PASS, 2 duplicate verify jobs failed only because 1 timeout test was cancelled; rerun for `13d1d484` pending | GitHub Actions PR #56 | PENDING | Current head cannot be called fully GREEN until the Linux verify job completes |

## External blockers with owner action

| Blocker | Required action |
|---|---|
| `BLOCKED_EXTERNAL_SANDBOX` | Provision an immutable sandbox image and an isolation backend, then run security and escape tests. |
| `BLOCKED_EXTERNAL_SHARED_QUEUE` | Select and provision a shared queue/lease backend for multi-replica workers. |
| `BLOCKED_EXTERNAL_OBJECT_STORAGE` | Select object storage and provide scoped credentials through deployment secrets. |
| `BLOCKED_EXTERNAL_LICENCE_ADMET` | Review and approve exact model weights and every training dataset licence. |
| `BLOCKED_EXTERNAL_LICENCE_RETROSYNTHESIS` | Provide reviewed policy model, template and stock artefacts with hashes and rights. |
| `BLOCKED_EXTERNAL_WET_LAB` | Obtain expert protocol review and a laboratory partner before physical validation claims. |
