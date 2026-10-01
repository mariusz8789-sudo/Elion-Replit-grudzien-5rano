# SOL/CODEX master execution handoff

Branch: `codex/sol-master-execution`  
Draft PR: #56  
Integration owner: Claude

## S0 — security / compute admission

Problem: heavy scientific execution and worker engine routes lacked a complete admission boundary.

Delivered:

- authenticated heavy-compute execution;
- process-local per-principal rate limit and global concurrency guard;
- authenticated worker inventory, reference-case and execution routes;
- passive public worker health only;
- masked CI worker token and compatibility tests.

Existing APIs reused: backend auth/RBAC, compute registry, canonical worker contract.

Claude integration: none. Merge retains current routes; clients calling protected heavy execution must send the existing bearer session token. Worker callers must set `GENESIS_WORKER_TOKEN`.

Known limit: the admission limiter is process-local and `NOT_MULTI_REPLICA_SAFE`; shared quotas remain S9.

Validation: `node --test packages/backend/src/apiCompute.test.mjs packages/backend/src/compute/computeAdmission.test.mjs packages/backend/src/compute/workerContract.test.mjs packages/backend/src/compute/workerHttp.test.mjs packages/backend/src/compute/workerClient.test.mjs packages/backend/src/compute/workerRailwayWorkflow.test.mjs`.

Rollback: revert commits `7a983b3f` and `d579907c` together.

## S1 — literature foundation

Problem: the existing frontend OpenAlex/Crossref novelty heuristic does not provide a canonical backend source record with licence, access status, provenance and stable metadata hash.

Delivered:

- canonical `LiteratureQuery` validation and `LiteratureSource` record vocabulary;
- retrieval statuses: `AVAILABLE`, `METADATA_ONLY`, `NO_ACCESS`, `BLOCKED_BY_LICENSE`, `BLOCKED_BY_NETWORK`, `NOT_FOUND`;
- commercial licence statuses: `APPROVED`, `CONDITIONAL`, `BLOCKED`, `UNKNOWN`;
- real Europe PMC REST connector with exact HTTPS allowlist, bounded timeout, redirect revalidation and fail-closed errors;
- DOI/PMID/PMCID identity, deterministic metadata hash and canonical deduplication;
- conservative rights handling: open/full-text availability never implies commercial permission; missing licence remains `UNKNOWN`;
- connector aggregation without synthetic fallback sources.

Existing APIs reused: `canonicalHash` from the shared provenance module. No ResearchRun, Evidence, Replay or Scientific Memory lifecycle was added.

Public contracts:

- `packages/backend/src/literature/literatureContracts.mjs`
- `packages/backend/src/literature/europePmcConnector.mjs`
- `packages/backend/src/literature/literatureService.mjs`

Claude integration for S2: import `searchLiterature` behind a thin ResearchRun literature port. Do not call the Europe PMC connector directly from ResearchRun.

Validation: `node --test packages/backend/src/literatureFoundation.test.mjs` — 7 pass, 0 fail.

Full backend result in this Windows worktree: 1283 pass, 8 fail, 81 skip. None of the eight failures imports or exercises S1. They comprise existing worktree permission/fixture drift failures plus the S0 capability-status expectation already documented in PR #56; Linux CI remains authoritative.

Known blockers:

- live API behaviour is intentionally not a deterministic unit-test dependency;
- most Europe PMC search responses no longer expose an article licence, so those records remain `UNKNOWN` until a licence-specific source is added;
- claim-to-source binding belongs to S2 and is not duplicated here.

Rollback: revert the S1 commit; no database migration or production route depends on it.

## S2 — Literature → ResearchRun contract

Problem: ResearchRun needs a bounded way to request literature for an existing claim without acquiring a second lifecycle or treating model extraction as Evidence.

Delivered:

- `ClaimEvidenceLink` proposal contract with `SUPPORTS`, `CONTRADICTS`, `CONTEXT_ONLY`, `METHOD_SOURCE`, `UNKNOWN`;
- thin `createResearchRunLiteraturePort()` adapter over S1 `searchLiterature`;
- structured support, contradictions, missing-evidence and access-blocker output;
- source-ID admission: a linker cannot cite a source absent from the retrieved source set;
- all extracted relationships are forcibly `PROPOSED`, `NOT_EVIDENCE`, `humanReviewed:false` even if an external linker claims otherwise;
- no database write, lifecycle event, Evidence publication or ResearchRun core modification.

Public contracts:

- `packages/backend/src/literature/claimEvidenceLink.mjs`
- `packages/backend/src/literature/researchRunLiteraturePort.mjs`

Claude integration: instantiate the port once and call `findForClaim({ researchRunId, claimId, claim, query? })` from the existing ResearchRun orchestration point. Any later admission into Evidence must use the canonical Evidence review path; this port never performs that transition.

Validation: `node --test packages/backend/src/literatureFoundation.test.mjs packages/backend/src/researchRunLiteraturePort.test.mjs packages/backend/src/researchRun.test.mjs` — 19 pass, 0 fail.

Rollback: revert the S2 commit; ResearchRun core and persistence are untouched.

## S3 — generic engine execution contract

Problem: canonical worker dispatch and `science_runs` already existed, but ResearchRun lacked a small provider-neutral request/record adapter carrying ResearchRun and experiment identity.

Delivered:

- `EngineExecutionRequest` validation that reuses the existing per-capability schemas and fingerprints;
- `EngineExecutionRecord` with run/experiment/engine/environment/hash/timing/failure/replay fields;
- admission hook capable of fail-closed `BLOCKED_BY_LICENSE`, `BLOCKED_BY_DATA` and configuration decisions before execution;
- exact mapping of the existing `DISPATCH_STATE` vocabulary to `SUCCESS`, `BLOCKED_BY_RUNTIME`, `BLOCKED_BY_CONFIGURATION`, `BLOCKED_BY_DATA`, `TIMEOUT`, `FAILED`, `CANCELLED`;
- output hash recomputed on the main side;
- no new executor, registry, persistence table, queue or ResearchRun lifecycle.

Public contract: `packages/backend/src/compute/engineExecutionContract.mjs`.

Claude integration: construct `createEngineExecutionPort({ executor, admit })` with the existing local/remote dispatcher. Persist successful output through the existing `saveScienceRun`; do not create another execution store.

Validation: `node --test packages/backend/src/engineExecutionContract.test.mjs packages/backend/src/compute/remoteScientificWorkerClient.test.mjs packages/backend/src/compute/workerServer.test.mjs` — 38 pass, 0 fail, 10 runtime-dependent skips.

Rollback: revert the S3 commit; existing dispatch and `science_runs` are untouched.

## S4 — PySCF ResearchRun execution

Problem: the real PySCF adapter, H₂ reference case and pinned chem-light worker already existed, but there was no direct ResearchRun-shaped entry through the S3 execution record.

Delivered:

- fixed canonical H₂ at 0.74 Å, RHF/STO-3G request bound to ResearchRun and experiment identity;
- local canonical executor that reuses `executeCapability` and adds a hash of Node/platform/arch/validated engine identity;
- execution through the S3 port with `DETERMINISTIC_WITH_PINNED_ENGINE_AND_GEOMETRY` replay declaration;
- packaging assertions for pinned `pyscf==2.14.0`, binary-only install and image import check;
- honest runtime behaviour: real energy and hashes when PySCF is available, otherwise `BLOCKED_BY_RUNTIME` with no output.

Public contracts:

- `packages/backend/src/compute/localCanonicalScientificExecutor.mjs`
- `packages/backend/src/compute/pyscfResearchRunExecutor.mjs`

Existing components reused unchanged: `qmAdapter.mjs`, `qm_worker.py`, canonical capability contract, toolchain reference validation, chem-light worker image.

Claude integration: call `createPyScfResearchRunExecutor(...).runCanonicalH2(...)` for the bounded validation experiment or pass the same S3 port a broader already-validated PySCF request. Persist through existing `saveScienceRun` only after `SUCCESS`.

Validation: 37 pass, 0 fail, 10 runtime-dependent skips across PySCF ResearchRun, S3, remote worker and packaging tests.

Runtime proof here: local PySCF is absent, therefore the actual execution record is `BLOCKED_BY_RUNTIME`. The image is pinned and build-checked; `AVAILABLE_NOW` still requires the Linux worker runtime probe/CI to execute the real reference case.

Rollback: revert the S4 commit; the underlying PySCF adapter and worker remain intact.

## S5 — Vina / Meeko ResearchRun execution

Problem: the real Vina/Meeko adapter and protein-docking campaign path existed, but the vetted 1IEP files failed their byte hashes on Windows because Git converted LF to CRLF. ResearchRun also lacked a bounded canonical docking entry.

Delivered:

- `.gitattributes` now marks pinned PDB/SDF files `-text`, preserving manifest bytes across Windows/Linux;
- canonical ABL1 1IEP + imatinib docking request with fixed box, exhaustiveness, pose count and seed;
- deterministic target preparation through the existing registry and Meeko adapter;
- S3 execution record with Vina engine identity, input/output hashes and fixed-seed replay declaration;
- no path supplied by an API caller and no worker filesystem path returned;
- packaging assertions for `vina==1.2.7` and `meeko==0.8.0`.

Public contract: `packages/backend/src/compute/vinaResearchRunExecutor.mjs`.

Existing components reused unchanged: target registry, Vina/Meeko adapters, structural worker, campaign `science_runs` and replay.

Claude integration: invoke `runCanonicalDocking({ researchRunId, executionId })`; on `SUCCESS`, persist the existing ScienceRun shape and artifact hashes. A preparation failure returns a blocker and no pose/record.

Validation: 21 pass, 0 fail, 3 engine-dependent skips. The target hash test now passes on Windows and Linux semantics.

Runtime proof here: Vina/Meeko are absent locally, so the canonical run is honestly `BLOCKED_BY_RUNTIME`; worker runtime CI is required before `AVAILABLE_NOW`.

Rollback: revert the S5 commit. This also removes the PDB/SDF EOL protection, so the prior Windows hash failure will return.

## S6 — ADMET ResearchRun execution and commercial admission

Problem: Genesis already had a real ADMET-AI adapter and pinned worker, but ResearchRun lacked a bounded S3 entry and the existing comments did not distinguish the MIT package from the separate licence obligations of its training datasets and bundled weights.

Delivered:

- canonical aspirin request through the existing admet-estimation capability and S3 execution record;
- explicit MODEL_ESTIMATE / NOT_A_MEASUREMENT classification and scientific limitations;
- model identity for ADMET-AI 2.0.1, including separate package, weights and training-data licence fields;
- fail-closed commercial admission: BLOCKED_BY_LICENSE until exact weight identity and dataset-by-dataset commercial rights are documented;
- bounded TECHNICAL_VALIDATION execution mode that may run the real installed model but never promotes commercial rights or measurement status;
- corrected adapter/worker comments so MIT is attributed to the code/package, not silently to all training inputs.

Public contract: packages/backend/src/compute/admetResearchRunExecutor.mjs.

Existing components reused unchanged: ADMET-AI adapter/worker, canonical capability contract, local executor, S3 record and existing ScienceRun persistence.

Claude integration: use the default commercial mode in product flows. It intentionally blocks today. Use TECHNICAL_VALIDATION only for the bounded engineering proof. Do not remove the commercial gate until a reviewed manifest pins exact bundled weights and the relevant TDC dataset licences.

Validation: node --test packages/backend/src/engineExecutionContract.test.mjs packages/backend/src/admetResearchRunExecutor.test.mjs packages/backend/src/admetEngine.test.mjs — 12 pass, 0 fail, 5 runtime-dependent skips.

Runtime proof here: ADMET-AI is absent locally, so technical validation records BLOCKED_BY_RUNTIME. The worker stays pinned to admet-ai==2.0.1. Official ADMET-AI documentation confirms TDC-trained models; official TDC documentation states that individual dataset licences must be reviewed separately.

Known blocker: commercial admission remains blocked until the weights and complete training dataset set have reviewed identities, hashes/versions and licence decisions.

Rollback: revert the S6 commit; the underlying ADMET pipeline remains intact.

## S7 — OpenMM ResearchRun execution

Problem: the real OpenMM adapter, bounded TIP3P reference and canonical ScienceRun builder already existed, but ResearchRun lacked a direct S3 entry with an explicit simulation protocol and runtime limitations.

Delivered:

- canonical 300-step TIP3P water-box NVT request bound to ResearchRun and experiment identity;
- explicit force field, ensemble, integrator, temperature, timestep, seed, PME cutoff and CPU-platform protocol;
- MODEL_ESTIMATE classification and SOFTWARE_INTEGRATION_REFERENCE_NOT_CANDIDATE_STABILITY scope;
- REPLAY_UNSUPPORTED_PLATFORM_NUMERICS declaration, consistent with the existing Replay verifier;
- runtime metadata for Node/OS/architecture/engine platform plus an honest null hardware identity because the current worker does not report full hardware identity;
- no candidate-specific MD claim, no silent GPU fallback and no second OpenMM adapter.

Public contract: packages/backend/src/compute/openmmResearchRunExecutor.mjs.

Existing components reused unchanged: mdAdapter, md_worker.py, openmmRuntime, canonical molecular-dynamics capability, structural worker and existing ScienceRun builder.

Claude integration: call runCanonicalTip3p only as the bounded engine-validation experiment. It must not be presented as stability evidence for a docked candidate. Persist successful output through the existing ScienceRun path; Replay remains unsupported for this capability.

Validation: 43 pass, 0 fail, 15 runtime-dependent skips across the S7 adapter, S3, heavy-engine and existing Virtual Lab closed-loop tests.

Runtime proof here: OpenMM is absent locally, so the real canonical run is BLOCKED_BY_RUNTIME with no energy output. The structural image is pinned to OpenMM 8.6.1 and must pass its Linux runtime probe before AVAILABLE_NOW.

Known blocker: a candidate-specific protein-ligand MD vertical still needs a validated topology/preparation protocol, full environment/hardware identity and external scientific review. This bounded reference does not satisfy that future scope.

Rollback: revert the S7 commit; the underlying OpenMM pipeline remains intact.

## S8 — retrosynthesis licence and data admission

Problem: AiZynthFinder code is MIT, but route execution also requires an expansion model, reaction templates and stock data. Their commercial licences were not proven, while the existing product stage could call the adapter directly.

Delivered:

- separate admission identities for engine code, expansion-policy model, templates and stock;
- code status APPROVED/MIT while all three external artifact licences remain UNKNOWN;
- commercial product path now fails closed with BLOCKED_BY_LICENSE before invoking the engine;
- technical validation distinguishes missing package (BLOCKED_BY_RUNTIME), missing/unhashed artifacts (BLOCKED_BY_DATA) and a complete hashed technical fixture;
- route output remains MODEL_ESTIMATE / ROUTE_PROPOSAL / NOT_A_LABORATORY_PROCEDURE;
- no model download, synthetic route, conditions, quantities, yield or safety procedure.

Public contract: packages/backend/src/compute/retrosynthesisAdmission.mjs.

Existing components reused: retroAdapter, AiZynthFinder worker, campaign retrosynthesis stage, canonical ScienceRun persistence, Evidence handoff and Replay.

Claude integration: none for the gate. The existing product endpoint now blocks until the model/template/stock licence decisions are reviewed. Technical validation must pass usePurpose TECHNICAL_VALIDATION explicitly and still requires all three artifacts with SHA-256 identities.

Validation: 27 pass, 0 fail, 1 real-model skip across admission, campaign retrosynthesis and handoff tests. The campaign API suite also passed its retrosynthesis route test after the gate was connected.

Runtime proof here: AiZynthFinder data is absent. No route was generated. Commercial execution is BLOCKED_BY_LICENSE independent of runtime availability.

Known blockers: obtain and review the exact policy-model, template-library and stock licences; pin their versions and SHA-256 values; then run the aspirin reference in an isolated worker. Code alone cannot clear those rights.

Rollback: revert the S8 commit to restore the previous runtime-only gate.

## S9 — shared worker and artifact-storage foundation

Problem: Genesis has a useful SQLite-backed in-process job lifecycle and authenticated scientific workers, but it has no atomic distributed claim lease, shared concurrency, retry/dead-letter policy or object storage. Calling the current system multi-replica safe would be false.

Delivered:

- validated scientific job envelope with job/idempotency/ResearchRun/experiment/capability identity, priority, bounded attempts and timeout;
- provider-neutral queue port requiring enqueue, atomic claim, heartbeat, completion, failure and cancellation operations;
- explicit current-state admission report: BLOCKED_FOR_MULTI_REPLICA_PRODUCTION;
- ArtifactRef with provider/key/MIME/size/SHA-256/time/producer/ResearchRun/experiment identity;
- object-storage port that hashes actual bytes server-side and returns metadata only;
- traversal-safe keys and no raw artifact bytes in the reference object;
- no Redis, Kubernetes or cloud provider dependency invented.

Public contract: packages/backend/src/compute/workerInfrastructureContract.mjs.

Existing components reused unchanged: SQLite jobs, local runner, worker authentication, remote scientific worker client/server and ScienceRun artifact reference arrays.

Claude integration: none until a shared backend is selected. A future Redis/Postgres adapter must implement the six queue-port operations atomically. A future S3-compatible adapter supplies putObject; persist only the returned ArtifactRef in ScienceRun.

Validation: 46 pass, 0 fail, 10 runtime-dependent skips across S9, the existing job runner and worker client/server. The focused S9 + jobs rerun is 14 pass, 0 fail.

Production blockers: shared queue backend, atomic lease/heartbeat, shared concurrency/quota, retry/dead-letter persistence and object-storage credentials/provider. The existing process-local cancellation set is not crash- or replica-safe.

Rollback: revert the S9 commit; existing local jobs and workers remain unchanged.
